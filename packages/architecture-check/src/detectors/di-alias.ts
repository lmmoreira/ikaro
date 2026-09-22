import {
  ClassDeclaration,
  Identifier,
  Node,
  ObjectLiteralExpression,
  Project,
  SourceFile,
} from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

interface ModuleMetadata {
  moduleClass: ClassDeclaration;
  sourceFile: SourceFile;
  isGlobal: boolean;
  providers: Node[];
}

function getModules(project: Project): ModuleMetadata[] {
  const modules: ModuleMetadata[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    if (!sourceFile.getFilePath().endsWith('.module.ts')) continue;
    for (const moduleClass of sourceFile.getClasses()) {
      const decorators = moduleClass.getDecorators();
      const moduleDecorator = decorators.find((decorator) => decorator.getName() === 'Module');
      const metadata = moduleDecorator?.getArguments()[0];
      if (!metadata || !Node.isObjectLiteralExpression(metadata)) continue;
      const providersProperty = metadata.getProperty('providers');
      const initializer =
        providersProperty && Node.isPropertyAssignment(providersProperty)
          ? providersProperty.getInitializer()
          : undefined;
      const providers =
        initializer && Node.isArrayLiteralExpression(initializer) ? initializer.getElements() : [];
      modules.push({
        moduleClass,
        sourceFile,
        isGlobal: decorators.some((decorator) => decorator.getName() === 'Global'),
        providers,
      });
    }
  }
  return modules;
}

// Resolves an identifier's declaration, following import aliases, to the canonical declaration
// identifier this token/class was defined with — used both to find its class-ness and as the
// anchor for cross-file reference lookup.
function resolveDeclarationIdentifier(identifier: Node): Identifier | undefined {
  if (!Node.isIdentifier(identifier)) return undefined;
  let symbol = identifier.getSymbol();
  if (!symbol) return undefined;
  symbol = symbol.getAliasedSymbol() ?? symbol;
  for (const declaration of symbol.getDeclarations()) {
    if (Node.isClassDeclaration(declaration)) {
      const nameNode = declaration.getNameNode();
      if (nameNode) return nameNode;
    }
    if (Node.isVariableDeclaration(declaration)) {
      const nameNode = declaration.getNameNode();
      if (Node.isIdentifier(nameNode)) return nameNode;
    }
  }
  return undefined;
}

// Resolves an identifier through import aliases to the ClassDeclaration it names, or undefined
// if it isn't a class at all — the shared primitive both `resolvesToClass` and the bare-provider
// bookkeeping below use, so two different local aliases of the same imported class
// (`import { Adapter, Adapter as Alias }`) resolve to the identical declaration node instead of
// comparing raw, and potentially divergent, identifier text.
function resolveClassDeclaration(identifier: Node): ClassDeclaration | undefined {
  if (!Node.isIdentifier(identifier)) return undefined;
  let symbol = identifier.getSymbol();
  if (!symbol) return undefined;
  symbol = symbol.getAliasedSymbol() ?? symbol;
  return symbol.getDeclarations().find(Node.isClassDeclaration);
}

function resolvesToClass(identifier: Node): boolean {
  return Boolean(resolveClassDeclaration(identifier));
}

// Nest resolves a provider's own dependencies inside the same module regardless of exports — a
// provider file injecting a sibling token/class this same module also provides is expected, not
// "external consumption." Collects the source files of every class this module's providers
// resolve to (bare entries and `useClass` targets), so those files are excluded from the
// external-consumer search below.
function collectProviderFilePaths(providers: Node[]): Set<string> {
  const filePaths = new Set<string>();
  const classIdentifiers: Identifier[] = [];
  for (const provider of providers) {
    if (Node.isIdentifier(provider)) classIdentifiers.push(provider);
    if (Node.isObjectLiteralExpression(provider)) {
      const useClass = getPropertyIdentifier(provider, 'useClass');
      if (useClass) classIdentifiers.push(useClass);
    }
  }
  for (const identifier of classIdentifiers) {
    let symbol = identifier.getSymbol();
    if (!symbol) continue;
    symbol = symbol.getAliasedSymbol() ?? symbol;
    for (const declaration of symbol.getDeclarations()) {
      if (Node.isClassDeclaration(declaration)) {
        filePaths.add(declaration.getSourceFile().getFilePath());
      }
    }
  }
  return filePaths;
}

// A `.spec.ts`/`.integration.spec.ts` file, or anything under a `test/` directory (this repo's
// own test-helper convention — CLAUDE.md §11), constructs classes directly (`new Foo(...)`) or
// builds test doubles instead of going through Nest's module/DI resolution — never a real
// external consumer relying on this module's `exports`.
function isTestFile(filePath: string): boolean {
  return filePath.endsWith('.spec.ts') || filePath.includes('/test/');
}

function isWithin(node: Node, container: Node): boolean {
  return node.getStart() >= container.getStart() && node.getEnd() <= container.getEnd();
}

// Resolves a decorator's callee through import aliases so `import { Inject as DiInject }` is
// recognized the same as a plain `Inject` import — matching on resolved symbol identity rather
// than the decorator's local text name.
function resolvesToInjectDecorator(decorator: Node): boolean {
  if (!Node.isDecorator(decorator)) return false;
  const expression = decorator.getExpression();
  const callee = Node.isCallExpression(expression) ? expression.getExpression() : expression;
  if (!Node.isIdentifier(callee)) return false;
  let symbol = callee.getSymbol();
  if (!symbol) return false;
  symbol = symbol.getAliasedSymbol() ?? symbol;
  return symbol.getName() === 'Inject';
}

// Nest's real `Inject(token)` only uses `token` to override the injection key when the decorator
// is actually called with an argument — `@Inject()` with none falls back to the reflected
// constructor parameter type, identical to no decorator at all (see
// `@nestjs/common/decorators/core/inject.decorator.js`). Only an explicit argument means "this
// parameter's type is NOT what gets injected."
function hasExplicitInjectToken(decorator: Node): boolean {
  if (!Node.isDecorator(decorator)) return false;
  const expression = decorator.getExpression();
  return Node.isCallExpression(expression) && expression.getArguments().length > 0;
}

// A reference only counts as real DI consumption if it belongs to a *constructor* parameter, and
// is either the argument of that parameter's `@Inject(...)` decorator, or inside the parameter's
// type with no explicit-token `@Inject` overriding it (Nest's implicit class-token injection,
// e.g. `constructor(private readonly relay: SomeClass)`). Any other reference — a type-only
// import, a plain method/function parameter (even one carrying its own unrelated `@Inject`, which
// has no effect outside a constructor), a value used to build an unrelated string, a re-export —
// is not DI consumption, even though it's a real symbol reference outside the module. A
// constructor parameter decorated with `@Inject(OTHER_TOKEN)` resolves by OTHER_TOKEN, not by its
// own TS type, so a type reference there isn't consumption of THAT class either.
function isDiInjectionSite(reference: Node): boolean {
  const parameter = reference.getFirstAncestor(Node.isParameterDeclaration);
  if (!parameter || !Node.isConstructorDeclaration(parameter.getParent())) return false;

  const decorator = reference.getFirstAncestor(Node.isDecorator);
  if (decorator && resolvesToInjectDecorator(decorator)) return true;

  const typeNode = parameter.getTypeNode();
  if (!typeNode || !isWithin(reference, typeNode)) return false;
  const explicitTokenOverride = parameter
    .getDecorators()
    .some(
      (paramDecorator) =>
        resolvesToInjectDecorator(paramDecorator) && hasExplicitInjectToken(paramDecorator),
    );
  return !explicitTokenOverride;
}

function getPropertyIdentifier(
  object: ObjectLiteralExpression,
  name: string,
): Identifier | undefined {
  const property = object.getProperty(name);
  if (!property || !Node.isPropertyAssignment(property)) return undefined;
  const initializer = property.getInitializer();
  return initializer && Node.isIdentifier(initializer) ? initializer : undefined;
}

// Builds the set of ClassDeclarations that are anchored as their own class-token provider —
// either a bare `SomeClass` entry, or the explicit equivalent
// `{ provide: SomeClass, useClass: SomeClass }` — the two shapes the story text calls out as
// equally safe anchors for a useExisting alias to point at. Keyed by resolved declaration, not
// raw identifier text, so two different local aliases of the same imported class are recognized
// as the same anchor.
function collectBareClassDeclarations(providers: Node[]): Set<ClassDeclaration> {
  const declarations = new Set<ClassDeclaration>();
  for (const provider of providers) {
    if (Node.isIdentifier(provider)) {
      const declaration = resolveClassDeclaration(provider);
      if (declaration) declarations.add(declaration);
      continue;
    }
    if (!Node.isObjectLiteralExpression(provider)) continue;
    const provide = getPropertyIdentifier(provider, 'provide');
    const useClass = getPropertyIdentifier(provider, 'useClass');
    if (!provide || !useClass) continue;
    const provideDeclaration = resolveClassDeclaration(provide);
    if (provideDeclaration && provideDeclaration === resolveClassDeclaration(useClass)) {
      declarations.add(provideDeclaration);
    }
  }
  return declarations;
}

// Detects the double-instantiation bug (CLAUDE.md §8, docs/ANTI_PATTERNS.md row on
// `useExisting`): a class registered both as its own anchor provider and as a `useExisting`
// target. Overriding the alias token in a test only removes the alias — the anchor provider is
// still instantiated unconditionally. Safe token-to-token aliases (`TRIGGER_BUS -> EVENT_BUS`,
// where `EVENT_BUS` is never itself a bare/self-`useClass` anchor) are not flagged.
export function checkUnsafeUseExisting(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;
  for (const { sourceFile, providers } of getModules(project)) {
    const bareClasses = collectBareClassDeclarations(providers);
    for (const provider of providers) {
      if (!Node.isObjectLiteralExpression(provider)) continue;
      const useExisting = getPropertyIdentifier(provider, 'useExisting');
      if (!useExisting) continue;
      scannedTargets++;
      const targetDeclaration = resolveClassDeclaration(useExisting);
      if (targetDeclaration && bareClasses.has(targetDeclaration)) {
        findings.push({
          rule: 'unsafe-use-existing',
          file: sourceFile.getFilePath(),
          line: sourceLine(sourceFile, provider.getStart()),
          message: `${useExisting.getText()} is registered as a class and also targeted by useExisting. Anchor the class provider and alias tokens to it instead.`,
        });
      }
    }
  }
  return { rule: 'unsafe-use-existing', scannedTargets, findings };
}

// Detects the reverse-alias shape (docs/ANTI_PATTERNS.md's "class token aliased to a functional
// token expected to be rebound later"): `{ provide: SomeClass, useExisting: FUNCTIONAL_TOKEN }`.
// Here `provide` is the class's OWN token, redirected to resolve however `FUNCTIONAL_TOKEN`
// currently resolves. A later rebind of `FUNCTIONAL_TOKEN` then silently changes what any
// consumer injecting by the class token receives, with no compiler error. The safe direction is
// the mirror image — a functional token `useExisting`-aliases TO the class token, never the
// reverse — which this check does not flag since `provide` there resolves to a token constant,
// not a class.
export function checkReverseDiAlias(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;
  for (const { sourceFile, providers } of getModules(project)) {
    for (const provider of providers) {
      if (!Node.isObjectLiteralExpression(provider)) continue;
      const useExisting = getPropertyIdentifier(provider, 'useExisting');
      const provide = getPropertyIdentifier(provider, 'provide');
      if (!useExisting || !provide) continue;
      scannedTargets++;
      // Only a class token redirected to a FUNCTIONAL token (a Symbol/string constant, not
      // another class) matches the anti-pattern's documented shape — a class-to-class alias is a
      // different, undocumented shape and stays out of scope.
      if (resolvesToClass(provide) && !resolvesToClass(useExisting)) {
        findings.push({
          rule: 'reverse-di-alias',
          file: sourceFile.getFilePath(),
          line: sourceLine(sourceFile, provider.getStart()),
          message: `${provide.getText()}'s own class token is aliased via useExisting to ${useExisting.getText()}. Make ${provide.getText()} its own anchor provider (useClass) and have functional tokens useExisting-alias to it instead — never the reverse.`,
        });
      }
    }
  }
  return { rule: 'reverse-di-alias', scannedTargets, findings };
}

// Detects the TD24-S02 incident shape (docs/ANTI_PATTERNS.md's "@Global() module without the
// export line"): a module marked @Global() so other modules skip an explicit import, where a
// provided token/class is actually injected somewhere outside the module's own file but isn't
// listed in `exports`. @Global() alone never makes a provider injectable — only `exports` does.
// A provider genuinely consumed only inside this module's own file is correctly left unexported;
// this only flags tokens with a real external consumer.
export function checkGlobalModuleExportPairing(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;
  for (const { moduleClass, sourceFile, isGlobal, providers } of getModules(project)) {
    if (!isGlobal) continue;
    const moduleDecorator = moduleClass
      .getDecorators()
      .find((decorator) => decorator.getName() === 'Module');
    const metadata = moduleDecorator?.getArguments()[0];
    const exportsProperty =
      metadata && Node.isObjectLiteralExpression(metadata)
        ? metadata.getProperty('exports')
        : undefined;
    const exportsInitializer =
      exportsProperty && Node.isPropertyAssignment(exportsProperty)
        ? exportsProperty.getInitializer()
        : undefined;
    // Nest's `exports` array accepts either a bare token (the common shape every current module
    // in this codebase uses) or a full provider-definition object re-declaring the same `provide`
    // token — both count as exporting that token. Keyed by resolved declaration, not raw
    // identifier text, so an export using a different local import alias of the same token as its
    // provider registration is still recognized as exporting it.
    const exportedDeclarations = new Set<Identifier>();
    if (exportsInitializer && Node.isArrayLiteralExpression(exportsInitializer)) {
      for (const element of exportsInitializer.getElements()) {
        const exportIdentifier = Node.isIdentifier(element)
          ? element
          : Node.isObjectLiteralExpression(element)
            ? getPropertyIdentifier(element, 'provide')
            : undefined;
        const resolved = exportIdentifier && resolveDeclarationIdentifier(exportIdentifier);
        if (resolved) exportedDeclarations.add(resolved);
      }
    }

    const internalFiles = collectProviderFilePaths(providers);
    internalFiles.add(sourceFile.getFilePath());

    for (const provider of providers) {
      const provideIdentifier = Node.isIdentifier(provider)
        ? provider
        : Node.isObjectLiteralExpression(provider)
          ? getPropertyIdentifier(provider, 'provide')
          : undefined;
      if (!provideIdentifier) continue;
      scannedTargets++;

      const declarationIdentifier = resolveDeclarationIdentifier(provideIdentifier);
      if (!declarationIdentifier || exportedDeclarations.has(declarationIdentifier)) continue;
      const consumedExternally = declarationIdentifier.findReferencesAsNodes().some((reference) => {
        if (reference === declarationIdentifier) return false;
        const referenceFile = reference.getSourceFile().getFilePath();
        if (internalFiles.has(referenceFile)) return false;
        if (isTestFile(referenceFile)) return false;
        return isDiInjectionSite(reference);
      });
      if (!consumedExternally) continue;

      findings.push({
        rule: 'global-module-export-pairing',
        file: sourceFile.getFilePath(),
        line: sourceLine(sourceFile, provider.getStart()),
        message: `${provideIdentifier.getText()} is provided by ${moduleClass.getName()} (marked @Global()) and injected outside this module, but isn't listed in exports. @Global() alone doesn't make a provider injectable — add it to exports.`,
      });
    }
  }
  return { rule: 'global-module-export-pairing', scannedTargets, findings };
}

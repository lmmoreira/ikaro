import { ClassDeclaration, InterfaceDeclaration, Node, Project, SyntaxKind, Type } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

const PORT_OR_REPOSITORY_NAME = /^I.*(?:Repository|Port)$/;
const PORTS_DIR_SEGMENT = '/ports/';

// Matches docs/ANTI_PATTERNS.md's naming convention (I*Repository/I*Port) for every current
// interface — with one documented exception, `shared/ports/cache.port.ts`'s `CachePort`, which
// has no `I` prefix. The `**/ports/**` path fallback is what still catches that one; both
// branches are kept (not just the path check, even though it alone covers 100% of today's
// interfaces) so a future port declared outside a `ports/` directory is still caught by name.
function isPortOrRepositoryInterface(declaration: InterfaceDeclaration): boolean {
  if (PORT_OR_REPOSITORY_NAME.test(declaration.getName())) return true;
  return declaration.getSourceFile().getFilePath().includes(PORTS_DIR_SEGMENT);
}

function resolvePortInterfaceName(type: Type): string | undefined {
  const declarations = type.getSymbol()?.getDeclarations() ?? [];
  for (const declaration of declarations) {
    if (Node.isInterfaceDeclaration(declaration) && isPortOrRepositoryInterface(declaration)) {
      return declaration.getName();
    }
  }
  return undefined;
}

// Follows the import-alias chain to the concrete class a `new X(...)` constructs — same
// approach as test-builder-coverage.ts's resolveConstructedClass, duplicated locally to keep
// each detector module self-contained (per this package's existing convention).
function resolveConstructedClass(identifier: Node): ClassDeclaration | undefined {
  if (!Node.isIdentifier(identifier)) return undefined;
  let symbol = identifier.getSymbol();
  if (!symbol) return undefined;
  symbol = symbol.getAliasedSymbol() ?? symbol;
  return symbol.getDeclarations().find(Node.isClassDeclaration);
}

function isJestFnCall(node: Node): boolean {
  if (!Node.isCallExpression(node)) return false;
  const expression = node.getExpression();
  return (
    Node.isPropertyAccessExpression(expression) &&
    expression.getExpression().getText() === 'jest' &&
    expression.getName() === 'fn'
  );
}

function containsJestFnCall(node: Node): boolean {
  if (isJestFnCall(node)) return true;
  return node.getDescendantsOfKind(SyntaxKind.CallExpression).some(isJestFnCall);
}

// Resolves what a constructor argument "really is" for the purpose of this check — following
// exactly one hop through a local variable, so `const mockBus = {...}; new Handler(mockBus)` is
// treated the same as an inline `new Handler({...})`. Anything else (a `new InMemoryXxxRepository()`
// double, a builder call, `undefined`) resolves to `undefined` and is correctly left alone.
function resolveJestMockedArgument(argument: Node): Node | undefined {
  if (Node.isObjectLiteralExpression(argument)) {
    return containsJestFnCall(argument) ? argument : undefined;
  }
  if (Node.isCallExpression(argument)) {
    return containsJestFnCall(argument) ? argument : undefined;
  }
  if (Node.isIdentifier(argument)) {
    const symbol = argument.getSymbol();
    const declaration = symbol?.getDeclarations().find(Node.isVariableDeclaration);
    const initializer = declaration?.getInitializer();
    if (
      initializer &&
      (Node.isObjectLiteralExpression(initializer) || Node.isCallExpression(initializer))
    ) {
      return resolveJestMockedArgument(initializer);
    }
  }
  return undefined;
}

// Scans every `new X(...)` in a spec file and, for each constructor parameter whose resolved
// type is a repository/port interface (docs/ENGINEERING_RULES.md § InMemory doubles), checks
// whether the corresponding argument is a `jest.fn()`-backed stub instead of an InMemory double.
//
// Scoped to constructor-injection sites deliberately, not every jest.fn()-typed variable in a
// spec file: every repository/port consumer in this codebase is constructor-injected (NestJS DI
// convention, no property injection), so this covers the real population without ever hitting
// the zero-target guard once every current violation is fixed — future specs will keep
// constructing port-typed dependencies forever, they just won't jest.fn() them anymore.
//
// jest.mock()-style module auto-mocking is out of scope: repository/port dependencies are pure
// TS interfaces with no runtime module to auto-mock, so that form cannot target them.
export function checkNoJestFnForRepositoryOrPortMocks(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;

  for (const sourceFile of project.getSourceFiles()) {
    if (!sourceFile.getBaseName().endsWith('.spec.ts')) continue;

    for (const newExpression of sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression)) {
      const constructedClass = resolveConstructedClass(newExpression.getExpression());
      const constructor = constructedClass?.getConstructors()[0];
      if (!constructedClass || !constructor) continue;

      const args = newExpression.getArguments();
      const params = constructor.getParameters();
      for (let index = 0; index < params.length; index++) {
        const interfaceName = resolvePortInterfaceName(params[index].getType());
        if (!interfaceName) continue;
        scannedTargets++;

        const argument = args[index];
        if (!argument) continue;
        const mocked = resolveJestMockedArgument(argument);
        if (!mocked) continue;

        findings.push({
          rule: 'no-jest-fn-for-repository-or-port',
          file: sourceFile.getFilePath(),
          line: sourceLine(sourceFile, argument.getStart()),
          message: `${constructedClass.getName()} is constructed with a jest.fn() stub for its ${interfaceName}-typed constructor parameter — use an InMemory${interfaceName.replace(/^I/, '')} double from src/test/infrastructure/ or src/test/repositories/ instead (docs/ENGINEERING_RULES.md § InMemory doubles).`,
        });
      }
    }
  }

  return { rule: 'no-jest-fn-for-repository-or-port', scannedTargets, findings };
}

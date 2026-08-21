import { CallExpression, ClassDeclaration, Node, Project, SourceFile, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

// Closed, reviewed registry — TD37-S20. Generalizes Story 9's aggregate-primitive-vo check: a
// field can correctly stay untyped as its VO (a JSONB/wire-shape field validated via the VO's
// static `.isValid()` inside a delegated Validator class, per Story 9's own discovery note —
// docs/ENGINEERING_RULES.md's Option A pattern doesn't apply to it) but still needs the VO's
// full `.create()` treatment (validate + normalize) applied somewhere on its owning class's
// construction path, not just a bare format check that silently skips normalization.
export interface ConstructionValidationTarget {
  ownerClass: string;
  ownerFile: string;
  propertyPath: string;
  requiredVo: string;
  requiredVoFile: string;
  validatorFile: string;
}

function findClassInFile(
  project: Project,
  filePath: string,
  className: string,
): { declaration: ClassDeclaration; sourceFile: SourceFile } | undefined {
  const sourceFile = project.getSourceFiles().find((file) => file.getFilePath().endsWith(filePath));
  const declaration = sourceFile
    ?.getClasses()
    .find((candidate) => candidate.getName() === className);
  return declaration && sourceFile ? { declaration, sourceFile } : undefined;
}

// Mirrors mapper-coverage.ts's invokedSharedHttpHelperFiles (Story 6) — generalized beyond
// `shared/http/**` and beyond bare-identifier calls: a Validator here is invoked as
// `BusinessInfoValidator.validate(...)` (a property access on the imported class), not a bare
// function call. Proves the owner's construction path actually reaches the registered
// validator — an unused/stale import must not count, same reasoning as the Story 6 precedent.
function fileInvokesClassFrom(sourceFile: SourceFile, targetFilePath: string): boolean {
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const resolved = importDeclaration.getModuleSpecifierSourceFile();
    if (!resolved || !resolved.getFilePath().endsWith(targetFilePath)) continue;

    const importedSymbols = importDeclaration
      .getNamedImports()
      .map((specifier) => (specifier.getAliasNode() ?? specifier.getNameNode()).getSymbol())
      .filter((symbol): symbol is NonNullable<typeof symbol> => Boolean(symbol));

    const isInvoked = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee)) return false;
      const calleeSymbol = callee.getExpression().getSymbol();
      return calleeSymbol !== undefined && importedSymbols.includes(calleeSymbol);
    });
    if (isInvoked) return true;
  }
  return false;
}

// A call counts as "normalizing the field" only when it resolves (by declaration identity, not
// text — an unrelated same-named `create()` method must not match) to the registered VO's own
// `create()`, with an argument that's either a property access ending in the property path's
// last segment (`businessInfo.email`) or a bare identifier of that same name (a local variable
// destructured from the field before the call).
function isCreateCallForProperty(
  call: CallExpression,
  requiredVo: string,
  requiredVoFile: string,
  lastSegment: string,
): boolean {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== 'create') return false;

  const symbol = callee.getExpression().getSymbol();
  const declarations = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations();
  const resolvesToRequiredVo = declarations?.some(
    (declaration) =>
      Node.isClassDeclaration(declaration) &&
      declaration.getName() === requiredVo &&
      declaration.getSourceFile().getFilePath().endsWith(requiredVoFile),
  );
  if (!resolvesToRequiredVo) return false;

  return call
    .getArguments()
    .some(
      (arg) =>
        (Node.isPropertyAccessExpression(arg) && arg.getName() === lastSegment) ||
        (Node.isIdentifier(arg) && arg.getText() === lastSegment),
    );
}

function callsRequiredVoCreate(
  sourceFile: SourceFile,
  requiredVo: string,
  requiredVoFile: string,
  lastSegment: string,
): boolean {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some((call) => isCreateCallForProperty(call, requiredVo, requiredVoFile, lastSegment));
}

export function checkPrimitiveFieldsValidatedAtConstruction(
  project: Project,
  registry: ConstructionValidationTarget[],
): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;

  for (const target of registry) {
    const owner = findClassInFile(project, target.ownerFile, target.ownerClass);
    const validatorSourceFile = project
      .getSourceFiles()
      .find((file) => file.getFilePath().endsWith(target.validatorFile));
    // Neither half of the registry entry resolves in this project — nothing to verify (e.g. a
    // fixture project that doesn't include these files at all). Not counted as scanned, same
    // convention as every other registry-driven check in this package.
    if (!owner || !validatorSourceFile) continue;

    scannedTargets++;
    const createMethod = owner.declaration
      .getMethods()
      .find((method) => method.isStatic() && method.getName() === 'create');
    const reportNode = createMethod ?? owner.declaration;

    if (!fileInvokesClassFrom(owner.sourceFile, target.validatorFile)) {
      findings.push({
        rule: 'vo-construction-validation',
        file: owner.sourceFile.getFilePath(),
        line: sourceLine(owner.sourceFile, reportNode.getStart()),
        message: `${target.ownerClass}'s construction path (registered for "${target.propertyPath}") no longer invokes ${target.validatorFile} — the registry entry is stale, or the validation call was removed.`,
      });
      continue;
    }

    // Search space is the owner file itself plus the delegated validator file — mirroring
    // mapper-coverage.ts's coverageSearchSpace (Story 6), which includes the primary file, not
    // only its invoked helper. Normalization can legitimately live in either place: inside the
    // validator (if it's refactored to return normalized data), or — the actual TenantSettings
    // shape — as a distinct post-validation step in the owner class, so an already-format-valid
    // raw value from the pre-validation normalize step never changes which error code a caller
    // sees for genuinely invalid input.
    const lastSegment = target.propertyPath.split('.').pop() ?? target.propertyPath;
    const normalizes = [owner.sourceFile, validatorSourceFile].some((file) =>
      callsRequiredVoCreate(file, target.requiredVo, target.requiredVoFile, lastSegment),
    );
    if (normalizes) continue;

    findings.push({
      rule: 'vo-construction-validation',
      file: owner.sourceFile.getFilePath(),
      line: sourceLine(owner.sourceFile, reportNode.getStart()),
      message: `${target.ownerClass}.${target.propertyPath} is format-validated (via ${target.validatorFile}) but never normalized — no call to ${target.requiredVo}.create() is found for this field. Normalize it on ${target.ownerClass}'s construction path after validation succeeds (mirror the existing Address/Localization normalization pattern), not just ${target.requiredVo}.isValid().`,
    });
  }

  return { rule: 'vo-construction-validation', scannedTargets, findings };
}

import {
  CallExpression,
  ClassDeclaration,
  MethodDeclaration,
  Node,
  Project,
  PropertyAccessExpression,
  SourceFile,
  SyntaxKind,
} from 'ts-morph';
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

const MAX_CALL_GRAPH_DEPTH = 3;

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

// Resolves a `Foo.bar(...)` callee's `Foo` side to its class declaration(s) — follows an
// aliased import back to the real declaration, same technique as mapper-coverage.ts's
// hasExecutableInstanceofBranch (Story 6).
function resolveCalleeClassDeclarations(callee: PropertyAccessExpression): Node[] {
  const symbol = callee.getExpression().getSymbol();
  return (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
}

// Real call-graph reachability from the owner's `create()` factory, bounded to same-class
// static-method hops (e.g. `create()` → `TenantSettings.validate()`) — not a whole-file scan.
// A whole-file scan (the original TD37-S20 implementation) is looser than the story's own
// "resolve the call graph from create()" requirement: a class file can have several static
// methods, and only some are actually reachable from construction (PR #398 review finding).
function reachableStaticMethods(
  ownerClass: ClassDeclaration,
  entryMethodName: string,
): MethodDeclaration[] {
  const entry = ownerClass
    .getMethods()
    .find((method) => method.isStatic() && method.getName() === entryMethodName);
  if (!entry) return [];

  const visited = new Set<MethodDeclaration>();
  const queue: Array<{ method: MethodDeclaration; depth: number }> = [{ method: entry, depth: 0 }];
  const reachable: MethodDeclaration[] = [];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || visited.has(next.method) || next.depth > MAX_CALL_GRAPH_DEPTH) continue;
    visited.add(next.method);
    reachable.push(next.method);

    for (const call of next.method.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee)) continue;
      const classExpr = callee.getExpression();
      if (!Node.isIdentifier(classExpr) || classExpr.getText() !== ownerClass.getName()) continue;

      const calledMethod = ownerClass
        .getMethods()
        .find((method) => method.isStatic() && method.getName() === callee.getName());
      if (calledMethod) queue.push({ method: calledMethod, depth: next.depth + 1 });
    }
  }

  return reachable;
}

function reachesValidator(
  reachableMethods: MethodDeclaration[],
  validatorFilePath: string,
): boolean {
  return reachableMethods.some((method) =>
    method.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee)) return false;
      return resolveCalleeClassDeclarations(callee).some((declaration) =>
        declaration.getSourceFile().getFilePath().endsWith(validatorFilePath),
      );
    }),
  );
}

// A call counts as "normalizing the field" only when all of the following hold:
// - it resolves (by declaration identity, not text) to the registered VO's own `create()` —
//   an unrelated same-named `create()` method must not match;
// - its argument is a property-access chain whose text ends with the full registered
//   `propertyPath` (`businessInfo.email`, not just any `*.email`) — a bare identifier of the
//   property path's last segment is also accepted, for a local variable destructured from the
//   field before the call, where the qualifying prefix is naturally lost;
// - its return value is actually used (not a bare, discarded `Email.create(x);` statement) —
//   PR #398 review finding: a discarded call must not satisfy the rule.
//
// Known, accepted limitation (PR #398 review, both Codex and CodeRabbit): "used" is not the
// same as "proven to flow into the returned/constructed property" — `const x =
// Email.create(v).address; log(x);` would still satisfy this check. Closing that fully needs
// real data-flow tracing through variables and return statements; deliberately not built here
// — this detector ships report-only (TD37's 3-phase rollout, not yet merge-blocking), and
// open-ended data-flow tracing risks its own false-positive surface (flagging legitimate code
// shapes it doesn't recognize) in a detector this new, which is a worse failure mode in a
// report-only job than a narrower, explicitly documented residual gap.
function isCreateCallForProperty(
  call: CallExpression,
  requiredVo: string,
  requiredVoFile: string,
  propertyPath: string,
): boolean {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== 'create') return false;

  const resolvesToRequiredVo = resolveCalleeClassDeclarations(callee).some(
    (declaration) =>
      Node.isClassDeclaration(declaration) &&
      declaration.getName() === requiredVo &&
      declaration.getSourceFile().getFilePath().endsWith(requiredVoFile),
  );
  if (!resolvesToRequiredVo) return false;

  const lastSegment = propertyPath.split('.').pop() ?? propertyPath;
  const argumentMatches = call
    .getArguments()
    .some(
      (arg) =>
        (Node.isPropertyAccessExpression(arg) && arg.getText().endsWith(propertyPath)) ||
        (Node.isIdentifier(arg) && arg.getText() === lastSegment),
    );
  if (!argumentMatches) return false;

  return !Node.isExpressionStatement(call.getParentOrThrow());
}

function callsRequiredVoCreate(
  searchRoots: Node[],
  requiredVo: string,
  requiredVoFile: string,
  propertyPath: string,
): boolean {
  return searchRoots.some((root) =>
    root
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => isCreateCallForProperty(call, requiredVo, requiredVoFile, propertyPath)),
  );
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
    const reachable = reachableStaticMethods(owner.declaration, 'create');
    const createMethod = reachable[0] ?? owner.declaration;

    if (!reachesValidator(reachable, target.validatorFile)) {
      findings.push({
        rule: 'vo-construction-validation',
        file: owner.sourceFile.getFilePath(),
        line: sourceLine(owner.sourceFile, createMethod.getStart()),
        message: `${target.ownerClass}'s construction path (registered for "${target.propertyPath}") no longer reaches ${target.validatorFile} from create() — the registry entry is stale, or the validation call was removed/moved out of reach.`,
      });
      continue;
    }

    // Search space: every method reachable from create() (the owner side — where the actual
    // TenantSettings fix lives, as a distinct post-validation step) plus the whole validator
    // file (the delegate side — kept file-wide since Validator classes here are small and
    // single-purpose; normalization there would also be a legitimate place for a future fix).
    const searchRoots: Node[] = [...reachable, validatorSourceFile];
    const normalizes = callsRequiredVoCreate(
      searchRoots,
      target.requiredVo,
      target.requiredVoFile,
      target.propertyPath,
    );
    if (normalizes) continue;

    findings.push({
      rule: 'vo-construction-validation',
      file: owner.sourceFile.getFilePath(),
      line: sourceLine(owner.sourceFile, createMethod.getStart()),
      message: `${target.ownerClass}.${target.propertyPath} is format-validated (via ${target.validatorFile}) but never normalized — no used call to ${target.requiredVo}.create(${target.propertyPath}) is reachable from create(). Normalize it on ${target.ownerClass}'s construction path after validation succeeds (mirror the existing Address/Localization normalization pattern), not just ${target.requiredVo}.isValid().`,
    });
  }

  return { rule: 'vo-construction-validation', scannedTargets, findings };
}

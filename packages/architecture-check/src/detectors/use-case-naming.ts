import { ClassDeclaration, MethodDeclaration, Node, Project, SourceFile, SyntaxKind, TypeNode } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

const USE_CASE_FILE = /\/application\/use-cases\/.*\.use-case\.ts$/;

interface UseCaseTarget {
  className: string;
  declaration: ClassDeclaration;
  execute: MethodDeclaration;
  sourceFile: SourceFile;
}

// Scans every concrete class with a directly-declared `execute` method under
// application/use-cases/**. Abstract classes are excluded on purpose: at least one real case
// (BaseBookingReminderNotificationUseCase) intentionally shares one Input/Result pair across
// several concrete subclasses that don't redeclare execute() themselves — the shared pair
// can't simultaneously match every subclass's own name, and the base class's own name isn't
// the contract callers see. The concrete subclasses have nothing to check either (they inherit
// execute() rather than declaring it), so this pattern is naturally exempt, not silently missed.
function findUseCaseTargets(project: Project): UseCaseTarget[] {
  const targets: UseCaseTarget[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    if (!USE_CASE_FILE.test(sourceFile.getFilePath()) || sourceFile.getBaseName().endsWith('.spec.ts')) {
      continue;
    }
    // getDescendantsOfKind, not getClasses(): the latter only returns top-level class
    // declarations, silently skipping any class declared inside a namespace/module block.
    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
      if (declaration.isAbstract()) continue;
      const className = declaration.getName();
      const execute = declaration.getMethods().find((method) => method.getName() === 'execute');
      if (!className || !execute) continue;
      targets.push({ className, declaration, execute, sourceFile });
    }
  }
  return targets;
}

type ReturnShape = { kind: 'void' } | { kind: 'anonymous' } | { kind: 'named'; name: string };

// Recurses through `T[]`/`Array<T>` wrapping so a Result type returned as a list
// (`Promise<XxxResult[]>`) is checked against the same base name as a singular result.
function classifyTypeNode(node: TypeNode): ReturnShape | undefined {
  if (Node.isArrayTypeNode(node)) return classifyTypeNode(node.getElementTypeNode());
  if (Node.isTypeReference(node)) {
    const name = node.getTypeName().getText();
    if (name === 'Array') {
      const [element] = node.getTypeArguments();
      return element ? classifyTypeNode(element) : undefined;
    }
    return { kind: 'named', name };
  }
  if (Node.isTypeLiteral(node)) return { kind: 'anonymous' };
  if (node.getText() === 'void') return { kind: 'void' };
  return undefined;
}

// Only classifies an explicit `Promise<T>` return annotation — every use case's execute() is
// documented as async/Promise-returning (docs/CODE_STANDARDS.md), so any other shape (missing
// annotation, a non-Promise type) is a different, unrelated problem this naming check doesn't
// own; it's left unclassified (no finding) rather than guessed at.
function classifyExecuteReturn(execute: MethodDeclaration): ReturnShape | undefined {
  const returnTypeNode = execute.getReturnTypeNode();
  if (!returnTypeNode || !Node.isTypeReference(returnTypeNode)) return undefined;
  if (returnTypeNode.getTypeName().getText() !== 'Promise') return undefined;
  const [inner] = returnTypeNode.getTypeArguments();
  if (!inner) return { kind: 'void' };
  return classifyTypeNode(inner);
}

export function checkUseCaseResultNaming(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;

  for (const { className, execute, sourceFile } of findUseCaseTargets(project)) {
    scannedTargets++;
    const shape = classifyExecuteReturn(execute);
    if (!shape || shape.kind === 'void') continue;

    const expected = `${className}Result`;
    const line = sourceLine(sourceFile, execute.getStart());

    if (shape.kind === 'anonymous') {
      findings.push({
        rule: 'use-case-result-naming',
        file: sourceFile.getFilePath(),
        line,
        message: `${className}.execute() returns an inline/anonymous type instead of a named "${expected}". Use case result types must be a named "{ClassName}Result" type declared in the use case file — never a raw/inline shape (docs/CODE_STANDARDS.md § Naming conventions).`,
      });
      continue;
    }

    if (shape.name === expected) continue;
    findings.push({
      rule: 'use-case-result-naming',
      file: sourceFile.getFilePath(),
      line,
      message: `${className}.execute() returns "${shape.name}", not the expected "${expected}". Use case result types must be named "{ClassName}Result" — never "*Info"/"*Dto" or an unrelated name (docs/CODE_STANDARDS.md § Naming conventions).`,
    });
  }

  return { rule: 'use-case-result-naming', scannedTargets, findings };
}

export function checkUseCaseInputNaming(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;

  for (const { className, execute, sourceFile } of findUseCaseTargets(project)) {
    scannedTargets++;
    const [firstParam] = execute.getParameters();
    if (!firstParam) continue; // no-arg execute() — nothing to name-check

    const typeNode = firstParam.getTypeNode();
    // Primitive/inline/untyped params (e.g. `execute(googleOAuthId: string)`) carry no
    // application-input contract to conflate with an HTTP Dto — out of scope for this check.
    if (!typeNode || !Node.isTypeReference(typeNode)) continue;

    const typeName = typeNode.getTypeName().getText();
    if (!typeName.endsWith('Dto')) continue;

    findings.push({
      rule: 'use-case-input-naming',
      file: sourceFile.getFilePath(),
      line: sourceLine(sourceFile, execute.getStart()),
      message: `${className}.execute() takes "${typeName}" directly. Application input types must never be named/typed as an HTTP "*Dto" — define a dedicated "${className}Input" type owned by the use case, and have the calling controller construct it explicitly from the validated Dto (see rename-tenant.use-case.ts for the reference pattern; docs/AGENT_PATTERNS.md § Naming).`,
    });
  }

  return { rule: 'use-case-input-naming', scannedTargets, findings };
}

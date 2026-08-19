import { ClassDeclaration, Node, Project, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

const ENTITY_FILE = /contexts\/([^/]+)\/infrastructure\/entities\/.*\.entity\.ts$/;
const SHARED_ENTITY_FILE = /shared\/infrastructure\/[^/]+\/.*\.entity\.ts$/;
const EVENT_OR_COMMAND_FILE = /contexts\/([^/]+)\/domain\/(?:events|commands)\/.*\.(?:event|command)\.ts$/;
const BUILDER_FILE = /test\/builders\/[^/]+\/.*\.builder\.ts$/;

function contextFromEntityPath(filePath: string): string | undefined {
  const match = ENTITY_FILE.exec(filePath);
  if (match) return match[1];
  return SHARED_ENTITY_FILE.test(filePath) ? 'shared' : undefined;
}

function hasEntityDecorator(declaration: ClassDeclaration): boolean {
  return declaration.getDecorators().some((decorator) => decorator.getName() === 'Entity');
}

// Walks the full extends chain, not just the immediate parent, so a deeper hierarchy is still
// recognized — mirrors error-mappers.ts's findDomainErrorRoot for the same reason.
function extendsBaseClass(declaration: ClassDeclaration, baseName: string): boolean {
  let current = declaration.getBaseClass();
  while (current) {
    if (current.getName() === baseName) return true;
    current = current.getBaseClass();
  }
  return false;
}

function builderClassNames(project: Project): Set<string> {
  const names = new Set<string>();
  for (const sourceFile of project.getSourceFiles()) {
    if (!BUILDER_FILE.test(sourceFile.getFilePath())) continue;
    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
      const name = declaration.getName();
      if (name) names.add(name);
    }
  }
  return names;
}

// Counts DISTINCT spec files that construct `new <className>(...)` inline — not total call
// sites — matching bad-smell-audit.md's BE-4 wording ("constructed inline ... in two or more
// test files"). A class inlined in only 0-1 spec files doesn't need a builder yet.
function inlineConstructionFileCount(project: Project, className: string): number {
  const files = new Set<string>();
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (!filePath.endsWith('.spec.ts')) continue;
    for (const newExpression of sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression)) {
      const expression = newExpression.getExpression();
      if (Node.isIdentifier(expression) && expression.getText() === className) {
        files.add(filePath);
        break;
      }
    }
  }
  return files.size;
}

export function checkTestBuilderCoverage(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;
  const builders = builderClassNames(project);

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (sourceFile.getBaseName().endsWith('.spec.ts')) continue;

    const entityContext = contextFromEntityPath(filePath);
    const eventOrCommandMatch = EVENT_OR_COMMAND_FILE.exec(filePath);
    if (!entityContext && !eventOrCommandMatch) continue;

    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
      const name = declaration.getName();
      if (!name) continue;

      if (entityContext) {
        if (!hasEntityDecorator(declaration)) continue;
        scannedTargets++;
        const expected = `${name}Builder`;
        if (builders.has(expected)) continue;
        findings.push({
          rule: 'test-builder-coverage',
          file: filePath,
          line: sourceLine(sourceFile, declaration.getStart()),
          message: `${name} has no matching ${expected} in src/test/builders/${entityContext}/ — every TypeORM entity needs a builder (docs/08-TESTING_STRATEGY.md § Builder class pattern).`,
        });
        continue;
      }

      const context = eventOrCommandMatch![1];
      const isEvent = extendsBaseClass(declaration, 'DomainEvent');
      const isCommand = !isEvent && extendsBaseClass(declaration, 'Command');
      if (!isEvent && !isCommand) continue;

      if (inlineConstructionFileCount(project, name) < 2) continue;

      scannedTargets++;
      const suffix = isEvent ? 'EventBuilder' : 'CommandBuilder';
      const expected = `${name}${suffix}`;
      if (builders.has(expected)) continue;
      findings.push({
        rule: 'test-builder-coverage',
        file: filePath,
        line: sourceLine(sourceFile, declaration.getStart()),
        message: `${name} is constructed inline (new ${name}(...)) in 2+ spec files but has no matching ${expected} in src/test/builders/${context}/.`,
      });
    }
  }

  return { rule: 'test-builder-coverage', scannedTargets, findings };
}

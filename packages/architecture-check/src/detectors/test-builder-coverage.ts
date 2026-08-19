import { ClassDeclaration, Node, Project, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';
import { hasTypeOrmDecorator } from './typeorm-symbols';

const ENTITY_FILE = /contexts\/([^/]+)\/infrastructure\/entities\/.*\.entity\.ts$/;
const SHARED_ENTITY_FILE = /shared\/infrastructure\/[^/]+\/.*\.entity\.ts$/;
const EVENT_OR_COMMAND_FILE =
  /contexts\/([^/]+)\/domain\/(?:events|commands)\/.*\.(?:event|command)\.ts$/;
const BUILDER_FILE = /test\/builders\/([^/]+)\/.*\.builder\.ts$/;

function contextFromEntityPath(filePath: string): string | undefined {
  const match = ENTITY_FILE.exec(filePath);
  if (match) return match[1];
  return SHARED_ENTITY_FILE.test(filePath) ? 'shared' : undefined;
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

// Maps a builder class name to every `src/test/builders/<context>/` directory it was found in —
// a same-named builder in the WRONG context must not satisfy coverage, since docs/08-TESTING_STRATEGY.md
// requires the builder to live under the same context as the thing it builds.
function builderContextsByName(project: Project): Map<string, Set<string>> {
  const contextsByName = new Map<string, Set<string>>();
  for (const sourceFile of project.getSourceFiles()) {
    const match = BUILDER_FILE.exec(sourceFile.getFilePath());
    if (!match) continue;
    const context = match[1];
    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
      const name = declaration.getName();
      if (!name) continue;
      const contexts = contextsByName.get(name) ?? new Set<string>();
      contexts.add(context);
      contextsByName.set(name, contexts);
    }
  }
  return contextsByName;
}

// Builds a class-name -> distinct-spec-file-count index in a SINGLE pass over every spec file,
// instead of re-walking every spec file's AST once per event/command class (O(events/commands x
// specs) on a codebase this size measurably slowed the CI-blocking scan).
function inlineConstructionFileCounts(project: Project): Map<string, number> {
  const filesByClassName = new Map<string, Set<string>>();
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (!filePath.endsWith('.spec.ts')) continue;
    for (const newExpression of sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression)) {
      const expression = newExpression.getExpression();
      if (!Node.isIdentifier(expression)) continue;
      const className = expression.getText();
      const files = filesByClassName.get(className) ?? new Set<string>();
      files.add(filePath);
      filesByClassName.set(className, files);
    }
  }
  const counts = new Map<string, number>();
  for (const [className, files] of filesByClassName) counts.set(className, files.size);
  return counts;
}

export function checkTestBuilderCoverage(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;
  const builderContexts = builderContextsByName(project);
  // Only DISTINCT spec files that construct `new <className>(...)` inline count — not total call
  // sites — matching bad-smell-audit.md's BE-4 wording ("constructed inline ... in two or more
  // test files"). A class inlined in only 0-1 spec files doesn't need a builder yet.
  const inlineCounts = inlineConstructionFileCounts(project);

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
        if (!hasTypeOrmDecorator(declaration, 'Entity')) continue;
        scannedTargets++;
        const expected = `${name}Builder`;
        if (builderContexts.get(expected)?.has(entityContext)) continue;
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

      if ((inlineCounts.get(name) ?? 0) < 2) continue;

      scannedTargets++;
      const suffix = isEvent ? 'EventBuilder' : 'CommandBuilder';
      const expected = `${name}${suffix}`;
      if (builderContexts.get(expected)?.has(context)) continue;
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

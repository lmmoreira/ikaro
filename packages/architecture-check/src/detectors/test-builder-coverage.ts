import { ClassDeclaration, Node, Project, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';
import { builderExistsInContext, indexBuilderClasses } from './builder-index';
import { contextFromEntityPath } from './entity-context';
import { hasTypeOrmDecorator } from './typeorm-symbols';

const EVENT_OR_COMMAND_FILE =
  /contexts\/([^/]+)\/domain\/(?:events|commands)\/.*\.(?:event|command)\.ts$/;

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

function declarationKey(declaration: ClassDeclaration): string {
  return `${declaration.getSourceFile().getFilePath()}#${declaration.getStart()}`;
}

// Resolves a `new X(...)` callee identifier all the way to the concrete class declaration it
// constructs — following the import alias chain, not just the local (possibly re-exported or
// same-named-elsewhere) spelling. Two different production classes sharing a name (e.g.
// `UserCreated` declared in two different contexts) must never be conflated into one count.
function resolveConstructedClass(identifier: Node): ClassDeclaration | undefined {
  if (!Node.isIdentifier(identifier)) return undefined;
  let symbol = identifier.getSymbol();
  if (!symbol) return undefined;
  symbol = symbol.getAliasedSymbol() ?? symbol;
  return symbol.getDeclarations().find(Node.isClassDeclaration);
}

// Builds a declaration-identity -> distinct-spec-file-count index in a SINGLE pass over every
// spec file, instead of re-walking every spec file's AST once per event/command class (O(events/
// commands x specs) on a codebase this size measurably slowed the CI-blocking scan). Keyed by
// resolved declaration identity (file + position), not identifier text, so two same-named classes
// in different contexts — each constructed once — are never conflated into a false 2+ count.
function inlineConstructionFileCounts(project: Project): Map<string, number> {
  const filesByDeclarationKey = new Map<string, Set<string>>();
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (!filePath.endsWith('.spec.ts')) continue;
    for (const newExpression of sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression)) {
      const target = resolveConstructedClass(newExpression.getExpression());
      if (!target) continue;
      const key = declarationKey(target);
      const files = filesByDeclarationKey.get(key) ?? new Set<string>();
      files.add(filePath);
      filesByDeclarationKey.set(key, files);
    }
  }
  const counts = new Map<string, number>();
  for (const [key, files] of filesByDeclarationKey) counts.set(key, files.size);
  return counts;
}

export function checkTestBuilderCoverage(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;
  const builderIndex = indexBuilderClasses(project);
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
        if (builderExistsInContext(builderIndex, expected, entityContext)) continue;
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

      if ((inlineCounts.get(declarationKey(declaration)) ?? 0) < 2) continue;

      scannedTargets++;
      const suffix = isEvent ? 'EventBuilder' : 'CommandBuilder';
      const expected = `${name}${suffix}`;
      if (builderExistsInContext(builderIndex, expected, context)) continue;
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

import { InterfaceDeclaration, Node, Project, Symbol, SyntaxKind } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';
import { coverageSearchSpace, isCoveredBy } from './mapper-coverage';

const CONTEXT_FILE = /\/contexts\/([^/]+)\//;
const CONTEXT_MAPPER_FILE = /\/contexts\/([^/]+)\/.*error\.mapper\.ts$/;
const DOMAIN_ERROR_SHAPE_FILE = /\/shared\/domain\/domain-error-shape\.ts$/;

function findDomainErrorShapeDeclaration(project: Project): InterfaceDeclaration | undefined {
  for (const file of project.getSourceFiles()) {
    if (!DOMAIN_ERROR_SHAPE_FILE.test(file.getFilePath())) continue;
    const found = file.getInterface('DomainErrorShape');
    if (found) return found;
  }
  return undefined;
}

function isSameDeclaration(a: Node, b: Node): boolean {
  return (
    a.getSourceFile().getFilePath() === b.getSourceFile().getFilePath() &&
    a.getStart() === b.getStart()
  );
}

// A class can implement DomainErrorShape indirectly — `interface DerivedShape extends
// DomainErrorShape {}` then `implements DerivedShape` — so this walks the resolved
// declaration's own `extends` chain (recursively, for a multi-level derived interface) rather
// than requiring the immediate implements-clause to name DomainErrorShape directly.
function resolvesToDomainErrorShape(
  declarations: Node[] | undefined,
  canonical: InterfaceDeclaration,
  seen: Set<Node> = new Set(),
): boolean {
  if (!declarations) return false;
  for (const declaration of declarations) {
    if (seen.has(declaration)) continue;
    seen.add(declaration);
    if (isSameDeclaration(declaration, canonical)) return true;
    if (!Node.isInterfaceDeclaration(declaration)) continue;
    for (const extendsClause of declaration.getExtends()) {
      const symbol: Symbol | undefined = extendsClause.getExpression().getSymbol();
      const resolved = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations();
      if (resolvesToDomainErrorShape(resolved, canonical, seen)) return true;
    }
  }
  return false;
}

export function checkSharedValueObjectErrorMapperCoverage(
  project: Project,
  ignoredMapperlessContexts = new Set<string>(),
): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;
  const mappers = project
    .getSourceFiles()
    .filter((file) => /error\.mapper\.ts$/.test(file.getFilePath()));
  const canonicalShape = findDomainErrorShapeDeclaration(project);

  for (const sourceFile of project.getSourceFiles()) {
    if (
      !/\/shared\/value-objects\//.test(sourceFile.getFilePath()) ||
      sourceFile.getBaseName().endsWith('.spec.ts')
    ) {
      continue;
    }

    // getDescendantsOfKind, not getClasses(): the latter only returns top-level class
    // declarations, silently skipping any class declared inside a namespace/module block.
    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration)) {
      const name = declaration.getName();
      if (!name) continue;
      // Identified by resolved shape (extends the real Error + implements the real
      // DomainErrorShape interface, directly or via a derived interface), not by name
      // pattern — a typed VO error doesn't have to be named "*ValidationError" to be in
      // scope.
      if (declaration.getExtends()?.getExpression().getSymbol()?.getName() !== 'Error') continue;
      const implementsDomainErrorShape =
        canonicalShape !== undefined &&
        declaration.getImplements().some((clause) => {
          const symbol = clause.getExpression().getSymbol();
          const resolved = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations();
          return resolvesToDomainErrorShape(resolved, canonicalShape);
        });
      if (!implementsDomainErrorShape) continue;

      const consumingContexts = new Set<string>();
      for (const candidate of project.getSourceFiles()) {
        if (candidate.getBaseName().endsWith('.spec.ts')) continue;
        const match = CONTEXT_FILE.exec(candidate.getFilePath());
        if (!match) continue;
        const importsVo = candidate
          .getImportDeclarations()
          .some(
            (importDeclaration) =>
              importDeclaration.getModuleSpecifierSourceFile()?.getFilePath() ===
              sourceFile.getFilePath(),
          );
        if (importsVo) consumingContexts.add(match[1]);
      }

      for (const context of consumingContexts) {
        scannedTargets++;
        const contextMappers = mappers.filter(
          (mapper) => CONTEXT_MAPPER_FILE.exec(mapper.getFilePath())?.[1] === context,
        );

        if (contextMappers.length === 0) {
          if (ignoredMapperlessContexts.has(context)) continue;
          findings.push({
            rule: 'shared-vo-error-mapper-coverage',
            file: sourceFile.getFilePath(),
            line: sourceLine(sourceFile, declaration.getStart()),
            message: `Context "${context}" constructs the shared VO that throws ${name} but has no HTTP error mapper at all (contexts/${context}/infrastructure/http/${context}-error.mapper.ts is missing) — either add one or add a documented exception (rule: "shared-vo-error-mapper-coverage", context: "${context}") if this context is intentionally HTTP-mapperless.`,
          });
          continue;
        }

        const searchSpace = contextMappers.flatMap((mapper) => coverageSearchSpace(mapper));
        if (isCoveredBy(searchSpace, declaration)) continue;

        findings.push({
          rule: 'shared-vo-error-mapper-coverage',
          file: sourceFile.getFilePath(),
          line: sourceLine(sourceFile, declaration.getStart()),
          message: `${name} is thrown by a shared value object. Context "${context}" constructs this VO but neither its HTTP error mapper (contexts/${context}/infrastructure/http/${context}-error.mapper.ts) nor a shared/http/** helper it actually calls has an executable "instanceof ${name}" branch — a validation failure there becomes an unhandled 500.`,
        });
      }
    }
  }

  return { rule: 'shared-vo-error-mapper-coverage', scannedTargets, findings };
}

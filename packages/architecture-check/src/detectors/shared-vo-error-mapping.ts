import { Project } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';
import { coverageSearchSpace, isCoveredBy } from './mapper-coverage';

const CONTEXT_FILE = /\/contexts\/([^/]+)\//;
const CONTEXT_MAPPER_FILE = /\/contexts\/([^/]+)\/.*error\.mapper\.ts$/;

export function checkSharedValueObjectErrorMapperCoverage(
  project: Project,
  ignoredMapperlessContexts = new Set<string>(),
): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;
  const mappers = project
    .getSourceFiles()
    .filter((file) => /error\.mapper\.ts$/.test(file.getFilePath()));

  for (const sourceFile of project.getSourceFiles()) {
    if (
      !/\/shared\/value-objects\//.test(sourceFile.getFilePath()) ||
      sourceFile.getBaseName().endsWith('.spec.ts')
    ) {
      continue;
    }

    for (const declaration of sourceFile.getClasses()) {
      const name = declaration.getName();
      if (!name) continue;
      // Identified by resolved shape (extends the real Error + implements the real
      // DomainErrorShape interface), not by name pattern — a typed VO error doesn't have to
      // be named "*ValidationError" to be in scope.
      if (declaration.getExtends()?.getExpression().getSymbol()?.getName() !== 'Error') continue;
      const implementsDomainErrorShape = declaration
        .getImplements()
        .some((clause) => clause.getExpression().getSymbol()?.getName() === 'DomainErrorShape');
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

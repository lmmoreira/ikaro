import { Project, SourceFile } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

const CONTEXT_FILE = /\/contexts\/([^/]+)\//;
const CONTEXT_MAPPER_FILE = /\/contexts\/([^/]+)\/.*error\.mapper\.ts$/;

// A context mapper commonly delegates shared-VO coverage to a shared/http/*.mapper.ts helper
// (e.g. mapSharedAddressError/mapSharedVoError) instead of repeating "instanceof XxxError" per
// context — SonarCloud's new-code-duplication gate is why. So "does this context cover the
// error" must search the mapper file itself plus every shared/http/** file it imports, not
// just the mapper file's own text.
function mapperSearchSpace(contextMapper: SourceFile): SourceFile[] {
  const sharedHelpers = contextMapper
    .getImportDeclarations()
    .map((importDeclaration) => importDeclaration.getModuleSpecifierSourceFile())
    .filter((file): file is SourceFile => Boolean(file))
    .filter((file) => /\/shared\/http\/.*\.ts$/.test(file.getFilePath()));
  return [contextMapper, ...sharedHelpers];
}

export function checkSharedValueObjectErrorMapperCoverage(project: Project): ScanResult {
  const findings: Finding[] = [];
  let scannedTargets = 0;
  const mappers = project
    .getSourceFiles()
    .filter((file) => /error\.mapper\.ts$/.test(file.getFilePath()));
  const contextsWithMappers = new Set(
    mappers
      .map((mapper) => CONTEXT_MAPPER_FILE.exec(mapper.getFilePath())?.[1])
      .filter((context): context is string => Boolean(context)),
  );

  for (const sourceFile of project.getSourceFiles()) {
    if (
      !/\/shared\/value-objects\//.test(sourceFile.getFilePath()) ||
      sourceFile.getBaseName().endsWith('.spec.ts')
    ) {
      continue;
    }

    for (const declaration of sourceFile.getClasses()) {
      const name = declaration.getName();
      if (!name || !name.endsWith('ValidationError')) continue;
      if (declaration.getExtends()?.getExpression().getSymbol()?.getName() !== 'Error') continue;
      const implementsDomainErrorShape = declaration
        .getImplements()
        .some((clause) => clause.getExpression().getText() === 'DomainErrorShape');
      if (!implementsDomainErrorShape) continue;

      const consumingContexts = new Set<string>();
      for (const candidate of project.getSourceFiles()) {
        if (candidate.getBaseName().endsWith('.spec.ts')) continue;
        const match = CONTEXT_FILE.exec(candidate.getFilePath());
        if (!match || !contextsWithMappers.has(match[1])) continue;
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
        const covered = contextMappers.some((mapper) =>
          mapperSearchSpace(mapper).some((file) => file.getText().includes(`instanceof ${name}`)),
        );
        if (covered) continue;

        findings.push({
          rule: 'shared-vo-error-mapper-coverage',
          file: sourceFile.getFilePath(),
          line: sourceLine(sourceFile, declaration.getStart()),
          message: `${name} is thrown by a shared value object. Context "${context}" constructs this VO but neither its HTTP error mapper (contexts/${context}/infrastructure/http/${context}-error.mapper.ts) nor a shared/http/** helper it calls references "instanceof ${name}" — a validation failure there becomes an unhandled 500.`,
        });
      }
    }
  }

  return { rule: 'shared-vo-error-mapper-coverage', scannedTargets, findings };
}

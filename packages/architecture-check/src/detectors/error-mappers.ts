import { Project } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

const DOMAIN_ERROR_FILE = /contexts\/([^/]+)\/domain\/errors\/.*\.ts$/;

export function checkErrorMapperCoverage(
  project: Project,
  ignoredErrorClasses = new Set<string>(),
): ScanResult {
  const errors = new Map<
    string,
    { file: string; line: number; baseName: string; context: string }
  >();
  const mappers = project
    .getSourceFiles()
    .filter((file) => /error\.mapper\.ts$/.test(file.getFilePath()));
  let scannedTargets = 0;

  for (const sourceFile of project.getSourceFiles()) {
    const match = DOMAIN_ERROR_FILE.exec(sourceFile.getFilePath());
    if (!match || sourceFile.getBaseName().endsWith('.spec.ts')) continue;
    for (const declaration of sourceFile.getClasses()) {
      const name = declaration.getName();
      const baseName = declaration.getExtends()?.getExpression().getText();
      if (!name || !baseName || !baseName.endsWith('DomainError') || name.endsWith('DomainError'))
        continue;
      errors.set(name, {
        file: sourceFile.getFilePath(),
        line: sourceLine(sourceFile, declaration.getStart()),
        baseName,
        context: match[1],
      });
    }
  }

  const findings: Finding[] = [];
  for (const [errorName, location] of errors) {
    if (ignoredErrorClasses.has(errorName)) continue;
    scannedTargets++;
    const covered = mappers.some((mapper) => {
      const text = mapper.getText();
      return (
        text.includes(`instanceof ${errorName}`) || text.includes(`instanceof ${location.baseName}`)
      );
    });
    if (!covered) {
      const expectedMapper = `contexts/${location.context}/infrastructure/http/${location.context}-error.mapper.ts`;
      findings.push({
        rule: 'error-mapper-coverage',
        file: location.file,
        line: location.line,
        message: `${errorName} is not referenced by an HTTP error mapper. Add an "instanceof ${errorName}" branch (or a documented base-class mapping) to ${expectedMapper}.`,
      });
    }
  }
  return { rule: 'error-mapper-coverage', scannedTargets, findings };
}

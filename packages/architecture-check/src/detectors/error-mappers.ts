import { Project } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';

export function checkErrorMapperCoverage(
  project: Project,
  ignoredErrorClasses = new Set<string>(),
): ScanResult {
  const errors = new Map<string, { file: string; line: number; baseName: string }>();
  const mappers = project
    .getSourceFiles()
    .filter((file) => /error\.mapper\.ts$/.test(file.getFilePath()));
  let scannedTargets = 0;

  for (const sourceFile of project.getSourceFiles()) {
    if (
      !/contexts\/[^/]+\/domain\/errors\/.*\.ts$/.test(sourceFile.getFilePath()) ||
      sourceFile.getBaseName().endsWith('.spec.ts')
    )
      continue;
    for (const declaration of sourceFile.getClasses()) {
      const name = declaration.getName();
      const baseName = declaration.getExtends()?.getExpression().getText();
      if (!name || !baseName || !baseName.endsWith('DomainError') || name.endsWith('DomainError'))
        continue;
      errors.set(name, {
        file: sourceFile.getFilePath(),
        line: sourceLine(sourceFile, declaration.getStart()),
        baseName,
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
      findings.push({
        rule: 'error-mapper-coverage',
        file: location.file,
        line: location.line,
        message: `${errorName} is not referenced by an HTTP error mapper. Add an intentional mapper branch or document a base-class mapping.`,
      });
    }
  }
  return { rule: 'error-mapper-coverage', scannedTargets, findings };
}

import { ClassDeclaration, Project } from 'ts-morph';
import type { Finding, ScanResult } from '../model';
import { sourceLine } from '../project';
import { coverageSearchSpace, isCoveredBy } from './mapper-coverage';

const DOMAIN_ERROR_FILE = /contexts\/([^/]+)\/domain\/errors\/.*\.ts$/;
const CONTEXT_MAPPER_FILE = /contexts\/([^/]+)\/.*error\.mapper\.ts$/;

// Walks the FULL extends chain (not just the immediate parent) so a two-level hierarchy
// (GrandchildError extends ChildError extends XxxDomainError) is still recognized as owned
// by XxxDomainError, not silently skipped because ChildError's own name doesn't end in
// "DomainError". Uses resolved base-class lookup so it follows the chain across files.
function findDomainErrorRoot(declaration: ClassDeclaration): ClassDeclaration | undefined {
  let current = declaration.getBaseClass();
  while (current) {
    if (current.getName()?.endsWith('DomainError')) return current;
    current = current.getBaseClass();
  }
  return undefined;
}

export function checkErrorMapperCoverage(
  project: Project,
  ignoredErrorClasses = new Set<string>(),
): ScanResult {
  // An array, not a Map keyed by class name: two different contexts can legally declare a
  // same-named error class, and a name-keyed Map would silently collapse them into one entry,
  // scanning and reporting on only whichever happened to be inserted last.
  const errors: Array<{
    name: string;
    file: string;
    line: number;
    context: string;
    declaration: ClassDeclaration;
    root: ClassDeclaration;
  }> = [];
  const mappers = project
    .getSourceFiles()
    .filter((file) => /error\.mapper\.ts$/.test(file.getFilePath()));
  let scannedTargets = 0;

  for (const sourceFile of project.getSourceFiles()) {
    const match = DOMAIN_ERROR_FILE.exec(sourceFile.getFilePath());
    if (!match || sourceFile.getBaseName().endsWith('.spec.ts')) continue;
    for (const declaration of sourceFile.getClasses()) {
      const name = declaration.getName();
      if (!name || name.endsWith('DomainError')) continue;
      const root = findDomainErrorRoot(declaration);
      if (!root) continue;
      errors.push({
        name,
        file: sourceFile.getFilePath(),
        line: sourceLine(sourceFile, declaration.getStart()),
        context: match[1],
        declaration,
        root,
      });
    }
  }

  const findings: Finding[] = [];
  for (const location of errors) {
    const errorName = location.name;
    if (ignoredErrorClasses.has(errorName)) continue;
    scannedTargets++;

    const contextMappers = mappers.filter(
      (mapper) => CONTEXT_MAPPER_FILE.exec(mapper.getFilePath())?.[1] === location.context,
    );
    const searchSpace = contextMappers.flatMap((mapper) => coverageSearchSpace(mapper));
    const covered =
      isCoveredBy(searchSpace, location.declaration) || isCoveredBy(searchSpace, location.root);

    if (!covered) {
      const expectedMapper = `contexts/${location.context}/infrastructure/http/${location.context}-error.mapper.ts`;
      findings.push({
        rule: 'error-mapper-coverage',
        file: location.file,
        line: location.line,
        message: `${errorName} is not referenced by ${location.context}'s own HTTP error mapper (or a shared/http/** helper it calls). Add an "instanceof ${errorName}" branch (or a documented base-class mapping) to ${expectedMapper}.`,
      });
    }
  }
  return { rule: 'error-mapper-coverage', scannedTargets, findings };
}

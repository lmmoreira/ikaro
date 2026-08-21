import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Project } from 'ts-morph';
import {
  checkEntityBuilderPrimaryKeyDefaults,
  checkErrorMapperCoverage,
  checkGlobalModuleExportPairing,
  checkNoJestFnForRepositoryOrPortMocks,
  checkPrototypeChainSafety,
  checkReverseDiAlias,
  checkSharedValueObjectErrorMapperCoverage,
  checkTestBuilderCoverage,
  checkTestDataHarnessRegistrations,
  checkTransactionalIo,
  checkTransactionalSaves,
  checkUnsafeUseExisting,
  checkValueObjectCreateNeverThrowsBareError,
  mergeScanResults,
  type ErrorMapperException,
  type ExternalSideEffectPort,
  type TestDataHarnessRegistration,
} from './index';
import { loadProject } from './project';

const root = resolve(__dirname, '../../..');
const policy = JSON.parse(
  readFileSync(resolve(root, 'packages/architecture-check/architecture-policy.json'), 'utf8'),
) as {
  exceptions?: Array<{ rule: string; class?: string; context?: string; path?: string }>;
  externalSideEffectPorts?: ExternalSideEffectPort[];
  testDataHarnessRegistrations?: TestDataHarnessRegistration[];
  projects?: string[];
};
const projectPaths = policy.projects ?? [];
const projects: Project[] = [];
for (const path of projectPaths) {
  const config = JSON.parse(readFileSync(resolve(root, path), 'utf8')) as { include?: string[] };
  if (!config.include?.length) throw new Error(`${path} has no explicit include targets.`);
  process.stdout.write(
    `[architecture-check] registered ${path} (${config.include.length} include pattern(s))\n`,
  );
  projects.push(loadProject(root, path));
}
function requireProject(tsconfigPath: string): Project {
  const index = projectPaths.indexOf(tsconfigPath);
  const project = index >= 0 ? projects[index] : undefined;
  if (!project) throw new Error(`The architecture policy must register ${tsconfigPath}.`);
  return project;
}

const backend = requireProject('apps/backend/tsconfig.json');
const bff = requireProject('apps/bff/tsconfig.json');
const web = requireProject('apps/web/tsconfig.json');
const intentionalErrorMapperGaps: ErrorMapperException[] = (policy.exceptions ?? [])
  .filter(
    (exception): exception is { rule: string; class: string; path: string } =>
      exception.rule === 'error-mapper-coverage' &&
      Boolean(exception.class) &&
      Boolean(exception.path),
  )
  .map((exception) => ({ class: exception.class, path: exception.path }));
const intentionalMapperlessContexts = new Set(
  (policy.exceptions ?? [])
    .filter(
      (exception) => exception.rule === 'shared-vo-error-mapper-coverage' && exception.context,
    )
    .map((exception) => exception.context!),
);
const externalSideEffectPorts = policy.externalSideEffectPorts;
if (!externalSideEffectPorts?.length) {
  throw new Error('The architecture policy must register at least one external-side-effect port.');
}
const testDataHarnessRegistrations = policy.testDataHarnessRegistrations;
if (!testDataHarnessRegistrations?.length) {
  throw new Error('The architecture policy must register at least one test-data-harness file.');
}

const results = [
  checkTransactionalIo(backend, externalSideEffectPorts),
  checkTransactionalSaves(backend),
  checkErrorMapperCoverage(backend, intentionalErrorMapperGaps),
  checkUnsafeUseExisting(backend),
  checkReverseDiAlias(backend),
  checkGlobalModuleExportPairing(backend),
  mergeScanResults('error-prototype-chain', [
    checkPrototypeChainSafety(backend),
    checkPrototypeChainSafety(bff),
    checkPrototypeChainSafety(web),
  ]),
  checkValueObjectCreateNeverThrowsBareError(backend),
  checkSharedValueObjectErrorMapperCoverage(backend, intentionalMapperlessContexts),
  checkTestBuilderCoverage(backend),
  checkEntityBuilderPrimaryKeyDefaults(backend),
  checkTestDataHarnessRegistrations(backend, testDataHarnessRegistrations),
  checkNoJestFnForRepositoryOrPortMocks(backend),
];
const zeroTargetResults = results.filter((result) => result.scannedTargets === 0);
const findings = results.flatMap((result) => result.findings);

for (const result of results) {
  process.stdout.write(
    `[architecture-check] ${result.rule}: scanned ${result.scannedTargets} target(s)\n`,
  );
}
for (const result of zeroTargetResults) {
  process.stderr.write(`[architecture-check] ${result.rule}: zero targets discovered\n`);
}
for (const finding of findings) {
  process.stderr.write(`${finding.file}:${finding.line} [${finding.rule}] ${finding.message}\n`);
}
if (zeroTargetResults.length > 0 || findings.length > 0) process.exitCode = 1;

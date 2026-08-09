import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Project } from 'ts-morph';
import { checkErrorMapperCoverage, checkTransactionalSaves, checkUnsafeUseExisting } from './index';
import { loadProject } from './project';

const root = resolve(__dirname, '../../..');
const projectPaths = [
  'apps/backend/tsconfig.json',
  'apps/bff/tsconfig.json',
  'apps/web/tsconfig.json',
  'packages/infra-scripts/tsconfig.json',
  'packages/types/tsconfig.json',
  'packages/validation/tsconfig.json',
  'packages/http-utils/tsconfig.json',
  'packages/i18n/tsconfig.json',
  'packages/nestjs-http/tsconfig.json',
  'packages/observability/tsconfig.json',
  'packages/env-validation/tsconfig.json',
];
let backend: Project | undefined;
for (const path of projectPaths) {
  const config = JSON.parse(readFileSync(resolve(root, path), 'utf8')) as { include?: string[] };
  if (!config.include?.length) throw new Error(`${path} has no explicit include targets.`);
  console.log(
    `[architecture-check] registered ${path} (${config.include.length} include pattern(s))`,
  );
}
backend = loadProject(root, 'apps/backend/tsconfig.json');
const policy = JSON.parse(
  readFileSync(resolve(root, 'packages/architecture-check/architecture-policy.json'), 'utf8'),
) as {
  intentionalErrorMapperGaps?: string[];
};

const results = [
  checkTransactionalSaves(backend),
  checkErrorMapperCoverage(backend, new Set(policy.intentionalErrorMapperGaps ?? [])),
  checkUnsafeUseExisting(backend),
];
const zeroTargetResults = results.filter((result) => result.scannedTargets === 0);
const findings = results.flatMap((result) => result.findings);

for (const result of results) {
  console.log(`[architecture-check] ${result.rule}: scanned ${result.scannedTargets} target(s)`);
}
for (const result of zeroTargetResults) {
  console.error(`[architecture-check] ${result.rule}: zero targets discovered`);
}
for (const finding of findings) {
  console.error(`${finding.file}:${finding.line} [${finding.rule}] ${finding.message}`);
}
if (zeroTargetResults.length > 0 || findings.length > 0) process.exitCode = 1;

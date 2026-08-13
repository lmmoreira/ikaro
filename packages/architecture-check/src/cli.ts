import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Project } from 'ts-morph';
import {
  checkErrorMapperCoverage,
  checkTransactionalIo,
  checkTransactionalSaves,
  checkUnsafeUseExisting,
  type ExternalSideEffectPort,
} from './index';
import { loadProject } from './project';

const root = resolve(__dirname, '../../..');
const policy = JSON.parse(
  readFileSync(resolve(root, 'packages/architecture-check/architecture-policy.json'), 'utf8'),
) as {
  exceptions?: Array<{ rule: string; class?: string }>;
  externalSideEffectPorts?: ExternalSideEffectPort[];
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
const backendIndex = projectPaths.indexOf('apps/backend/tsconfig.json');
const backend = backendIndex >= 0 ? projects[backendIndex] : undefined;
if (!backend) throw new Error('The architecture policy must register apps/backend/tsconfig.json.');
const intentionalErrorMapperGaps = new Set(
  (policy.exceptions ?? [])
    .filter((exception) => exception.rule === 'error-mapper-coverage' && exception.class)
    .map((exception) => exception.class!),
);

const results = [
  checkTransactionalIo(backend, policy.externalSideEffectPorts ?? []),
  checkTransactionalSaves(backend),
  checkErrorMapperCoverage(backend, intentionalErrorMapperGaps),
  checkUnsafeUseExisting(backend),
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

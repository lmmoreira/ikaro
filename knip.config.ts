import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { KnipConfig, KnipConfiguration } from 'knip';
import workspaceRegistryImport from './scripts/knip-workspaces.cjs';

interface WorkspaceRegistryEntry {
  dir: string;
  entry?: string[];
  project?: string[];
  plugins?: Record<string, boolean>;
}

interface PolicyException {
  rule: string;
  path?: string;
  name?: string;
  rationale: string;
  owner: string;
  reviewBy: string;
}

const workspaceRegistry: WorkspaceRegistryEntry[] = workspaceRegistryImport;

const policy: { exceptions?: PolicyException[] } = JSON.parse(
  readFileSync(join(__dirname, 'packages/architecture-check/architecture-policy.json'), 'utf8'),
);
const exceptions = policy.exceptions ?? [];

// Single canonical exception registry (CLAUDE.md's Architecture policy rule):
// allowlisted knip findings live in architecture-policy.json's `exceptions`
// array, not a second, parallel knip.jsonc allowlist (TD37-S13
// story-discovery addition, 2026-08-22).
function ignoreDependenciesFor(dir: string): string[] {
  return exceptions
    .filter((exception) => exception.rule === 'knip-unused-dependency' && exception.path === dir)
    .map((exception) => exception.name)
    .filter((name): name is string => Boolean(name));
}

const ignoreIssues: NonNullable<KnipConfiguration['ignoreIssues']> = {};
for (const exception of exceptions) {
  if (exception.rule === 'knip-unused-export' && exception.path) {
    ignoreIssues[exception.path] = [...(ignoreIssues[exception.path] ?? []), 'exports'];
  }
  if (exception.rule === 'knip-unused-file' && exception.path) {
    ignoreIssues[exception.path] = [...(ignoreIssues[exception.path] ?? []), 'files'];
  }
}

const workspaces: NonNullable<KnipConfiguration['workspaces']> = {};
for (const { dir, entry, project, plugins } of workspaceRegistry) {
  workspaces[dir] = {
    ...(entry ? { entry } : {}),
    ...(project ? { project } : {}),
    ...(plugins ?? {}),
    ignoreDependencies: ignoreDependenciesFor(dir),
  };
}

const config: KnipConfig = {
  $schema: 'https://unpkg.com/knip@6/schema.json',
  ignoreIssues,
  workspaces,
};

export default config;

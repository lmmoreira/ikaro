const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const workspaces = require('./knip-workspaces.cjs');
const policy = JSON.parse(
  fs.readFileSync(path.join(root, 'packages/architecture-check/architecture-policy.json'), 'utf8'),
);

// Reads the real workspace-root directories (["apps", "packages"]) from
// pnpm-workspace.yaml's own `packages:` list, instead of hardcoding them, so
// a future workspace-root change can't silently go unnoticed by this test
// (Codex round-2 finding, TD37-S13). No YAML dependency: pnpm-workspace.yaml
// here only ever lists simple `<dir>/*` entries — parsed with that exact
// shape enforced, erroring loudly (not silently) if it ever changes.
function readWorkspaceRootDirectories() {
  const raw = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
  const packagesBlock = raw.match(/^packages:\n((?:\s+-\s+.+\n?)+)/m);
  assert.ok(packagesBlock, 'pnpm-workspace.yaml: could not find a `packages:` list');
  return packagesBlock[1]
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const match = line.trim().match(/^-\s+'([^']+)\/\*'$/);
      assert.ok(match, `pnpm-workspace.yaml: unexpected packages entry shape: ${line}`);
      return match[1];
    });
}

function discoverRealPnpmWorkspaces() {
  return readWorkspaceRootDirectories().flatMap((rootDirectory) =>
    fs
      .readdirSync(path.join(root, rootDirectory), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootDirectory, entry.name))
      .filter((dir) => fs.existsSync(path.join(root, dir, 'package.json'))),
  );
}

// Strips the production `!` marker knip reads as a suffix on the pattern
// itself (see scripts/knip-workspaces.cjs's own header comment), so
// "src/main.ts!" globs correctly as "src/main.ts".
function withoutProductionSuffix(pattern) {
  return pattern.endsWith('!') ? pattern.slice(0, -1) : pattern;
}

test('registry covers every real pnpm workspace exactly once, plus the root scripts entry', () => {
  const expected = ['.', ...discoverRealPnpmWorkspaces()].sort();
  const configured = workspaces.map((workspace) => workspace.dir).sort();
  assert.deepEqual(configured, expected);
  assert.equal(new Set(configured).size, configured.length);
});

test('every configured entry/project glob matches at least one real file in its workspace', () => {
  for (const { dir, entry = [], project = [] } of workspaces) {
    for (const pattern of [...entry, ...project]) {
      const glob = withoutProductionSuffix(pattern);
      const matches = fs.globSync(glob, { cwd: path.join(root, dir) });
      assert.ok(
        matches.length > 0,
        `${dir}: entry/project pattern matches zero files: ${pattern} (glob: ${glob})`,
      );
    }
  }
});

const NAMED_KNIP_RULES = new Set(['knip-unused-dependency', 'knip-unresolved-import']);
const KNIP_RULES = new Set([...NAMED_KNIP_RULES, 'knip-unused-export', 'knip-unused-file']);

test('knip exceptions in architecture-policy.json name a real rule and required metadata', () => {
  for (const exception of policy.exceptions ?? []) {
    if (!exception.rule.startsWith('knip-')) continue;
    assert.ok(KNIP_RULES.has(exception.rule), `unknown knip exception rule: ${exception.rule}`);
    assert.ok(exception.path, `${exception.rule} exception is missing a path`);
    assert.ok(exception.rationale, `${exception.rule} exception is missing a rationale`);
    assert.ok(exception.owner, `${exception.rule} exception is missing an owner`);
    assert.match(
      exception.reviewBy ?? '',
      /^\d{4}-\d{2}-\d{2}$/,
      `${exception.rule} exception needs an ISO reviewBy date`,
    );
    if (NAMED_KNIP_RULES.has(exception.rule)) {
      assert.ok(exception.name, `${exception.rule} exception is missing the target name`);
    }
  }
});

test('workspace-scoped knip exceptions target a configured workspace', () => {
  const configuredDirs = new Set(workspaces.map((workspace) => workspace.dir));
  for (const exception of policy.exceptions ?? []) {
    if (!NAMED_KNIP_RULES.has(exception.rule)) continue;
    assert.ok(
      configuredDirs.has(exception.path),
      `${exception.rule} exception path is not a configured workspace: ${exception.path}`,
    );
  }
});

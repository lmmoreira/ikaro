const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const workspaces = require('./knip-workspaces.cjs');
const policy = JSON.parse(
  fs.readFileSync(path.join(root, 'packages/architecture-check/architecture-policy.json'), 'utf8'),
);

function discoverRealPnpmWorkspaces() {
  return ['apps', 'packages'].flatMap((rootDirectory) =>
    fs
      .readdirSync(path.join(root, rootDirectory), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootDirectory, entry.name))
      .filter((dir) => fs.existsSync(path.join(root, dir, 'package.json'))),
  );
}

// Strips a glob's magic suffix (globstar/brace/bracket segments and the
// production `!` marker) down to its longest static directory prefix, so
// "src/contexts/**/infrastructure/migrations/*.ts!" -> "src/contexts".
function staticPrefixOf(pattern) {
  const withoutProductionSuffix = pattern.endsWith('!') ? pattern.slice(0, -1) : pattern;
  const segments = withoutProductionSuffix.split('/');
  const staticSegments = [];
  for (const segment of segments) {
    if (/[*{}[\]]/.test(segment)) break;
    staticSegments.push(segment);
  }
  return staticSegments.join('/');
}

test('registry covers every real pnpm workspace exactly once, plus the root scripts entry', () => {
  const expected = ['.', ...discoverRealPnpmWorkspaces()].sort();
  const configured = workspaces.map((workspace) => workspace.dir).sort();
  assert.deepEqual(configured, expected);
  assert.equal(new Set(configured).size, configured.length);
});

test('every configured entry/project glob resolves to a real path under its workspace', () => {
  for (const { dir, entry = [], project = [] } of workspaces) {
    for (const pattern of [...entry, ...project]) {
      // An empty static prefix (e.g. "**/*.{ts,tsx}!") means "scan the whole
      // workspace" — valid on its own, resolves to the workspace dir itself.
      const prefix = staticPrefixOf(pattern);
      const resolved = path.join(root, dir, prefix);
      assert.ok(
        fs.existsSync(resolved),
        `${dir}: entry/project pattern's static prefix does not exist: ${pattern} -> ${resolved}`,
      );
    }
  }
});

test('knip exceptions in architecture-policy.json name a real rule and required metadata', () => {
  const knipRules = new Set(['knip-unused-dependency', 'knip-unused-export', 'knip-unused-file']);
  for (const exception of policy.exceptions ?? []) {
    if (!exception.rule.startsWith('knip-')) continue;
    assert.ok(knipRules.has(exception.rule), `unknown knip exception rule: ${exception.rule}`);
    assert.ok(exception.path, `${exception.rule} exception is missing a path`);
    assert.ok(exception.rationale, `${exception.rule} exception is missing a rationale`);
    assert.ok(exception.owner, `${exception.rule} exception is missing an owner`);
    assert.match(
      exception.reviewBy ?? '',
      /^\d{4}-\d{2}-\d{2}$/,
      `${exception.rule} exception needs an ISO reviewBy date`,
    );
    if (exception.rule === 'knip-unused-dependency') {
      assert.ok(exception.name, 'knip-unused-dependency exception is missing the dependency name');
    }
  }
});

test('knip-unused-dependency exceptions target a configured workspace', () => {
  const configuredDirs = new Set(workspaces.map((workspace) => workspace.dir));
  for (const exception of policy.exceptions ?? []) {
    if (exception.rule !== 'knip-unused-dependency') continue;
    assert.ok(
      configuredDirs.has(exception.path),
      `knip-unused-dependency exception path is not a configured workspace: ${exception.path}`,
    );
  }
});

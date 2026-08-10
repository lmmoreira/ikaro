const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const projects = require('./dependency-cruiser-projects.cjs');
const policy = JSON.parse(
  fs.readFileSync(path.join(root, 'packages/architecture-check/architecture-policy.json'), 'utf8'),
);
const config = require('./dependency-cruiser.config.cjs');

test('registry covers every architecture policy project exactly once', () => {
  assert.deepEqual(projects.map((project) => project.tsConfig).sort(), [...policy.projects].sort());
  assert.equal(new Set(projects.map((project) => project.tsConfig)).size, projects.length);
});

test('boundary configuration contains every Story 1 rule family', () => {
  const ruleNames = new Set(config.forbidden.map((rule) => rule.name));
  for (const ruleName of [
    'no-circular',
    'no-non-package-json',
    'not-to-unresolvable',
    'no-production-to-test',
    'no-production-to-dev-dependency',
    'no-domain-framework-or-infrastructure-imports',
    'no-bff-to-backend-context-import',
    'no-bff-shared-to-feature-import',
    'backend-types-protocol-subpaths-only',
  ]) {
    assert.ok(ruleNames.has(ruleName), `missing rule: ${ruleName}`);
  }
});

test('every permitted context edge is represented by a generated exception', () => {
  const ruleNames = new Set(config.forbidden.map((rule) => rule.name));
  for (const edge of policy.contextDependencyMatrix.permittedEdges) {
    const sourceContext = edge.source.match(/contexts\/([^/]+)\//)?.[1];
    assert.ok(sourceContext, `could not infer source context from ${edge.source}`);
    if (sourceContext === edge.target) continue;
    assert.ok(
      ruleNames.has(`no-${sourceContext}-to-${edge.target}-context-import`),
      `missing cross-context rule for ${edge.source} -> ${edge.target}`,
    );
  }
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const projects = require('./dependency-cruiser-projects.cjs');
const policy = JSON.parse(
  fs.readFileSync(path.join(root, 'packages/architecture-check/architecture-policy.json'), 'utf8'),
);
const config = require('./dependency-cruiser.config.cjs');
const dependencyCruiserRoot = fs.realpathSync(path.join(root, 'node_modules/dependency-cruiser'));
const dependencyCruiseBin = path.join(dependencyCruiserRoot, 'bin/dependency-cruise.mjs');

function discoverWorkspaceTsconfigs() {
  return ['apps', 'packages'].flatMap((rootDirectory) =>
    fs
      .readdirSync(path.join(root, rootDirectory), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(rootDirectory, entry.name, 'tsconfig.json'))
      .filter((tsconfigPath) => fs.existsSync(path.join(root, tsconfigPath))),
  );
}

test('registry covers every architecture policy project exactly once', () => {
  assert.deepEqual(projects.map((project) => project.tsConfig).sort(), [...policy.projects].sort());
  assert.equal(new Set(projects.map((project) => project.tsConfig)).size, projects.length);
});

test('registry includes every TypeScript workspace exactly once', () => {
  const expected = discoverWorkspaceTsconfigs().sort();
  const configured = projects.map((project) => project.tsConfig).sort();
  assert.deepEqual(configured, expected);
});

test('policy exceptions name exact files, never wildcard paths', () => {
  for (const exception of policy.exceptions ?? []) {
    assert.ok(exception.path, `exception ${exception.rule} is missing a path`);
    assert.ok(
      !/[?*[{]/.test(exception.path),
      `exception must name one exact file: ${exception.path}`,
    );
  }
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
    assert.ok(edge.targetPaths?.length, `missing exact target paths for ${edge.source}`);
    assert.ok(
      ruleNames.has(`no-${sourceContext}-to-${edge.target}-context-import`),
      `missing cross-context rule for ${edge.source} -> ${edge.target}`,
    );
    assert.ok(
      ruleNames.has(
        `no-${edge.source.replace(/[^a-zA-Z0-9]+/g, '-').replace(/-ts$/, '')}-to-unapproved-${edge.target}-imports`,
      ),
      `missing exact-target rule for ${edge.source}`,
    );
  }
});

test('generated exceptions allow only each edge’s exact source and target paths', () => {
  for (const edge of policy.contextDependencyMatrix.permittedEdges) {
    const sourceContext = edge.source.match(/contexts\/([^/]+)\//)?.[1];
    if (!sourceContext || sourceContext === edge.target) continue;

    const ruleName = `no-${edge.source
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/-ts$/, '')}-to-unapproved-${edge.target}-imports`;
    const rule = config.forbidden.find((candidate) => candidate.name === ruleName);
    assert.ok(rule, `missing exact-target rule for ${edge.source}`);
    assert.match(edge.source.replace('apps/backend/', ''), new RegExp(rule.from.path));

    for (const targetPath of edge.targetPaths) {
      const relativeTarget = targetPath.replace('apps/backend/', '');
      assert.match(relativeTarget, new RegExp(rule.to.path));
      assert.ok(
        rule.to.pathNot.some((allowedPath) => new RegExp(allowedPath).test(relativeTarget)),
        `exact target path is not allowlisted: ${targetPath}`,
      );
    }
  }
});

test('BFF backend-context rule matches a backend context source path', () => {
  const rule = config.forbidden.find(
    (candidate) => candidate.name === 'no-bff-to-backend-context-import',
  );
  assert.ok(rule);
  assert.match(
    'apps/backend/src/contexts/booking/domain/booking.aggregate.ts',
    new RegExp(rule.to.path),
  );
});

test('application boundary denies use-case imports but allows declared shared abstractions', () => {
  const rule = config.forbidden.find(
    (candidate) => candidate.name === 'no-notification-application-internal-imports',
  );
  assert.ok(rule);

  const useCasePath =
    'src/contexts/notification/application/use-cases/send-booking-requested-notification/send-booking-requested-notification.use-case.ts';
  const basePath = 'src/contexts/notification/application/use-cases/base-notification.use-case.ts';
  assert.ok(
    rule.to.path.some((restrictedPath) => new RegExp(restrictedPath).test(useCasePath)),
    'a same-context use case must be in the restricted application target set',
  );
  assert.ok(
    !rule.to.pathNot.some((allowedPath) => new RegExp(allowedPath).test(useCasePath)),
    'a concrete use case must not be an allowed application dependency',
  );
  assert.ok(
    rule.to.pathNot.some((allowedPath) => new RegExp(allowedPath).test(basePath)),
    'an explicitly named base abstraction must remain allowed',
  );
});

function nodeSupportsDependencyCruiser() {
  const major = Number(process.versions.node.split('.')[0]);
  return major === 22 || major === 24 || major >= 26;
}

function assertFixtureIsRejected(source) {
  const backendRoot = path.join(root, 'apps/backend');
  const fixture = path.join(
    backendRoot,
    'src/contexts/booking/application/dependency-cruiser-boundary.fixture.ts',
  );
  fs.writeFileSync(fixture, source);
  try {
    const result = spawnSync(
      process.execPath,
      [
        dependencyCruiseBin,
        '--config',
        path.join(root, 'scripts/dependency-cruiser.config.cjs'),
        '--ts-config',
        'tsconfig.json',
        '--output-type',
        'err',
        '--progress',
        'none',
        'src/contexts/booking/application/dependency-cruiser-boundary.fixture.ts',
      ],
      {
        cwd: backendRoot,
        encoding: 'utf8',
        env: { ...process.env, DEP_CRUISE_WORKSPACE: 'backend' },
      },
    );
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /no-booking-application-internal-imports/);
  } finally {
    fs.rmSync(fixture, { force: true });
  }
}

test(
  'dependency-cruiser rejects resolved framework and infrastructure targets from application code',
  { skip: !nodeSupportsDependencyCruiser() },
  () => {
    assertFixtureIsRejected(
      "import { ConfigService } from '@nestjs/config'; export { ConfigService };",
    );
    assertFixtureIsRejected(
      "import { BookingEntity } from '../infrastructure/entities/booking.entity'; export { BookingEntity };",
    );
  },
);

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
  // A Next.js dynamic-route segment (e.g. apps/web/app/v1/[...path]/route.ts) contains literal
  // square brackets as part of one real, single file's path — not a glob wildcard. Strip only
  // that exact shape (a param name made of word chars/hyphens, optionally prefixed with `...`)
  // before checking for actual wildcard syntax, so a real dynamic-route file can still be named
  // exactly without also letting a disguised wildcard (e.g. `[*]`) slip through.
  const nextJsDynamicSegment = /\/\[(?:\.\.\.)?[\w-]+\]/g;
  for (const exception of policy.exceptions ?? []) {
    assert.ok(exception.path, `exception ${exception.rule} is missing a path`);
    const withoutDynamicSegments = exception.path.replace(nextJsDynamicSegment, '');
    assert.ok(
      !/[?*[{]/.test(withoutDynamicSegments),
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

const rule = (name) => {
  const found = config.forbidden.find((candidate) => candidate.name === name);
  assert.ok(found, `missing rule: ${name}`);
  return found;
};
const matchesAny = (patterns, value) =>
  [patterns].flat().some((pattern) => new RegExp(pattern).test(value));
// A rule fires when the importing file is in its `from` and the imported file is in its `to`
// without being in the allowed `pathNot`.
const isDenied = (forbidden, from, to) =>
  new RegExp(forbidden.from.path).test(from) &&
  matchesAny(forbidden.to.path, to) &&
  !matchesAny(forbidden.to.pathNot ?? [], to);

const booking = 'src/contexts/booking/application';
const notification = 'src/contexts/notification/application';

test('every application-boundary rule is an error, nothing is downgraded to a warning', () => {
  const boundaryRules = config.forbidden.filter((candidate) =>
    /^no-[a-z]+-(application-internal|job-internal|application-helper)-imports$/.test(
      candidate.name,
    ),
  );
  assert.ok(boundaryRules.length > 0);
  for (const boundaryRule of boundaryRules) {
    assert.equal(boundaryRule.severity, 'error', boundaryRule.name);
  }
  assert.equal(rule('no-circular').severity, 'error');
});

test('a use case may import its same-folder helper, mapper, util and types files and shared abstractions', () => {
  const useCaseRule = rule('no-notification-application-internal-imports');
  const from = `${notification}/use-cases/send-booking-requested-notification/send-booking-requested-notification.use-case.ts`;
  for (const allowed of [
    `${notification}/use-cases/notification-email-format.helpers.ts`,
    `${notification}/use-cases/booking-request.mapper.ts`,
    `${notification}/use-cases/active-resource-types.util.ts`,
    `${notification}/use-cases/booking-request.types.ts`,
    `${notification}/use-cases/base-notification.use-case.ts`,
    `${notification}/helpers/shared-between-jobs-and-use-cases.helpers.ts`,
    `${notification}/services/some.service.ts`,
    `${notification}/ports/some.port.ts`,
    `${notification}/dtos/some.dto.ts`,
    'src/contexts/notification/domain/notification-log.aggregate.ts',
  ]) {
    assert.ok(!isDenied(useCaseRule, from, allowed), `should be allowed: ${allowed}`);
  }
});

test('a use case may not import another use case, a job or infrastructure', () => {
  const useCaseRule = rule('no-booking-application-internal-imports');
  const from = `${booking}/use-cases/deactivate-resource.use-case.ts`;
  for (const denied of [
    `${booking}/use-cases/raise-future-commitment-exceptions.use-case.ts`,
    `${booking}/jobs/windowed-tenant-job.base.ts`,
    `${booking}/jobs/booking-reminder.job.ts`,
    'src/contexts/booking/infrastructure/entities/booking.entity.ts',
    'src/shared/infrastructure/typeorm-transaction-manager.ts',
  ]) {
    assert.ok(isDenied(useCaseRule, from, denied), `should be denied: ${denied}`);
  }
  assert.ok(
    !new RegExp(useCaseRule.from.path).test(`${booking}/jobs/booking-reminder.job.ts`),
    'a job is governed by the job rule, not the use-case rule',
  );
  assert.ok(
    !new RegExp(useCaseRule.from.path).test(`${booking}/helpers/some.helpers.ts`),
    'a shared helper is governed by the helper rule, not the use-case rule',
  );
});

test('a job sits above use cases but may not reach infrastructure or use-case helpers', () => {
  const jobRule = rule('no-booking-job-internal-imports');
  const from = `${booking}/jobs/booking-reminder.job.ts`;
  for (const allowed of [
    `${booking}/use-cases/match-availability-alerts.use-case.ts`,
    `${booking}/jobs/tenant-local-window.helpers.ts`,
    `${booking}/jobs/windowed-tenant-job.base.ts`,
    `${booking}/helpers/booking-exception-closing.helpers.ts`,
    `${booking}/services/some.service.ts`,
    `${booking}/ports/some.port.ts`,
  ]) {
    assert.ok(!isDenied(jobRule, from, allowed), `should be allowed: ${allowed}`);
  }
  for (const denied of [
    'src/contexts/booking/infrastructure/entities/booking.entity.ts',
    `${booking}/use-cases/booking-exception-closing.helpers.ts`,
    `${booking}/use-cases/booking-request.mapper.ts`,
    `${booking}/jobs/some-other.job.ts`,
    'src/contexts/loyalty/domain/loyalty-entry.aggregate.ts',
  ]) {
    assert.ok(isDenied(jobRule, from, denied), `should be denied: ${denied}`);
  }
});

test('shared application helpers see only domain, ports, DTOs and other helpers', () => {
  const helperRule = rule('no-booking-application-helper-imports');
  const from = `${booking}/helpers/booking-exception-closing.helpers.ts`;
  for (const allowed of [
    'src/contexts/booking/domain/booking.aggregate.ts',
    `${booking}/ports/booking-repository.port.ts`,
    `${booking}/dtos/some.dto.ts`,
    `${booking}/helpers/resolved-line-candidates.types.ts`,
  ]) {
    assert.ok(!isDenied(helperRule, from, allowed), `should be allowed: ${allowed}`);
  }
  for (const denied of [
    `${booking}/use-cases/approve-booking.use-case.ts`,
    `${booking}/use-cases/some.helpers.ts`,
    `${booking}/jobs/booking-reminder.job.ts`,
    `${booking}/services/some.service.ts`,
    'src/contexts/booking/infrastructure/entities/booking.entity.ts',
  ]) {
    assert.ok(isDenied(helperRule, from, denied), `should be denied: ${denied}`);
  }
});

test('platform context-root constants stay allowed only for platform', () => {
  const platformRule = rule('no-platform-application-internal-imports');
  const from =
    'src/contexts/platform/application/use-cases/create-lead-form-submission.use-case.ts';
  assert.ok(!isDenied(platformRule, from, 'src/contexts/platform/lead-form.constants.ts'));
  assert.ok(!isDenied(platformRule, from, 'src/contexts/platform/chatbot.constants.ts'));
  assert.ok(
    isDenied(
      rule('no-notification-application-internal-imports'),
      'src/contexts/notification/application/use-cases/a.use-case.ts',
      'src/contexts/notification/lead-form.constants.ts',
    ),
  );
});

test('a handler-to-event import is denied unless the exact pair is a permitted edge', () => {
  const crossContext = rule('no-notification-to-booking-context-import');
  const handler =
    'src/contexts/notification/infrastructure/events/booking-resource-reassigned.handler.ts';
  assert.ok(
    !new RegExp(crossContext.from.path).test(handler) ||
      matchesAny(crossContext.from.pathNot, handler),
    'a registered handler is excluded from the blanket rule',
  );
  const exactRule = rule(
    'no-apps-backend-src-contexts-notification-infrastructure-events-booking-resource-reassigned-handler-to-unapproved-booking-imports',
  );
  assert.ok(
    !isDenied(
      exactRule,
      handler,
      'src/contexts/booking/domain/events/booking-resource-reassigned.event.ts',
    ),
  );
  assert.ok(
    isDenied(exactRule, handler, 'src/contexts/booking/domain/booking.aggregate.ts'),
    'a registered handler may import only its exact event file',
  );
});

function nodeSupportsDependencyCruiser() {
  const major = Number(process.versions.node.split('.')[0]);
  return major === 22 || major === 24 || major >= 26;
}

function assertFixtureIsRejected(
  source,
  { directory = '', expectedRule = 'no-booking-application-internal-imports' } = {},
) {
  const backendRoot = path.join(root, 'apps/backend');
  const fixtureRelativePath = `src/contexts/booking/application/${directory}dependency-cruiser-boundary.fixture.ts`;
  const fixture = path.join(backendRoot, fixtureRelativePath);
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
        fixtureRelativePath,
      ],
      {
        cwd: backendRoot,
        encoding: 'utf8',
        env: { ...process.env, DEP_CRUISE_WORKSPACE: 'backend' },
      },
    );
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, new RegExp(expectedRule));
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

test(
  'dependency-cruiser rejects a use case importing a use case, a job importing infrastructure, and one context importing another',
  { skip: !nodeSupportsDependencyCruiser() },
  () => {
    assertFixtureIsRejected(
      "import { ApproveBookingUseCase } from './approve-booking.use-case'; export { ApproveBookingUseCase };",
      { directory: 'use-cases/', expectedRule: 'no-booking-application-internal-imports' },
    );
    assertFixtureIsRejected(
      "import { BookingEntity } from '../../infrastructure/entities/booking.entity'; export { BookingEntity };",
      { directory: 'jobs/', expectedRule: 'no-booking-job-internal-imports' },
    );
    assertFixtureIsRejected(
      "import { ApproveBookingUseCase } from '../use-cases/approve-booking.use-case'; export { ApproveBookingUseCase };",
      { directory: 'helpers/', expectedRule: 'no-booking-application-helper-imports' },
    );
    assertFixtureIsRejected(
      "import { LoyaltyBalance } from '../../loyalty/domain/loyalty-balance.aggregate'; export { LoyaltyBalance };",
      { expectedRule: 'no-booking-to-loyalty-context-import' },
    );
  },
);

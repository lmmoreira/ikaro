const baseConfig = require('@ikaro/config/eslint-base');
const jestPlugin = require('eslint-plugin-jest');
const architecturePolicy = require('../../packages/architecture-check/architecture-policy.json');

const reviewedRawPersistencePaths = architecturePolicy.exceptions
  .filter((exception) => exception.rule === 'raw-persistence-api')
  .map((exception) => exception.path.replace(/^apps\/backend\//, ''));

// TD37-S05: reviewed max-lines (file-length) exceptions for domain aggregates — see
// packages/architecture-check/architecture-policy.json's max-lines-aggregate entries for
// rationale. Exempts the file-length rule only; max-lines-per-function still applies to these
// files (a long aggregate file is expected, a long method inside it is not).
const maxLinesAggregateExceptionPaths = architecturePolicy.exceptions
  .filter((exception) => exception.rule === 'max-lines-aggregate')
  .map((exception) => exception.path.replace(/^apps\/backend\//, ''));

// ESLint flat config REPLACES (not merges) a rule's options when two config objects
// both match the same file for the same rule name — whichever matching block appears LAST in
// this array wins *entirely* for that rule, on that file (confirmed against TD37-S02's original
// layout, which shipped exactly this bug: its broad src/**/*.ts persistence-bypass block silently
// dropped TD24-S03's ports/shared-domain/event-bus-port/OTel bans on every application-layer file
// not in its own ignore list). Every tier below is therefore self-sufficient — it repeats every
// selector/path a broader tier already requires for the same files, rather than assuming the
// broader tier's block still applies. src/eslint/restricted-imports-syntax.eslint.spec.ts lints
// the real production config and would fail if a tier silently dropped one again.

const PORTS_BARREL_PATTERN = {
  regex: '\\/ports(\\/index)?$',
  message: 'Import directly from the port file, e.g. ./ports/tenant-repository.port',
};
const SHARED_DOMAIN_BARREL_PATTERN = {
  regex: '\\/shared\\/domain(\\/index)?$',
  message: 'Import directly from the domain file, e.g. ../shared/domain/domain-event',
};
// M17-S33: raw @opentelemetry/* imports are confined to packages/observability (the port/adapter
// live there — ITracingPort/OtelTracingAdapter — mirroring LogVendorFormatter for logging). App
// code depends on the port only, never the SDK directly, so a future tracer swap touches one
// adapter, not every call site. This also covers D9 anti-lock-in for the vendor-specific case:
// the collector (M17-S34) is the one and only place GCP appears in the whole pipeline, so a GCP
// OTel exporter/detector package has no legitimate reason to appear here either.
const OPENTELEMETRY_PATTERN = {
  regex: '^@opentelemetry\\/',
  message:
    'Raw @opentelemetry/* imports belong only in packages/observability (M17-S33) — depend on ITracingPort/OtelTracingAdapter (or bootstrapOtelTracing for a tracing.ts entrypoint) instead.',
};
const EVENT_BUS_PORT_PATTERN = {
  regex: '\\/event-bus\\.port$',
  message:
    'Publish sites depend on OUTBOX_PUBLISHER/IOutboxPublisher (shared/ports/outbox-publisher.port), not EVENT_BUS — see td/TD24-OUTBOX-INBOX-PATTERN.md D14.',
};
// Use cases and application services must not inject RequestContext — caller context is
// passed via the input DTO instead, keeping use cases callable from event handlers, scheduled
// jobs, and cross-context adapters without an HTTP request in scope
// (docs/ENGINEERING_RULES.md §RequestContext).
const REQUEST_CONTEXT_PATTERN = {
  regex: '\\/shared\\/request\\/request-context$',
  message:
    'Use cases and application services must not inject RequestContext — pass tenantId/actorId/correlationId/settings via the input DTO instead (docs/ENGINEERING_RULES.md §RequestContext).',
};

// TD37-S02: persistence APIs belong behind repository adapters. Keep this list name-based rather
// than banning `typeorm` wholesale: entities, migrations, and module composition still
// legitimately import TypeORM decorators and registration helpers.
const TYPEORM_BYPASS_PATHS = [
  {
    name: '@nestjs/typeorm',
    importNames: ['InjectRepository', 'InjectDataSource', 'getDataSourceToken'],
    message:
      'Persistence DI APIs belong only in repository adapters or explicitly reviewed database infrastructure (TD37-S02; docs/AGENT_PATTERNS.md Pattern #1).',
  },
  {
    name: 'typeorm',
    importNames: [
      'Repository',
      'EntityManager',
      'DataSource',
      'QueryRunner',
      'QueryBuilder',
      'SelectQueryBuilder',
      'InsertQueryBuilder',
      'UpdateQueryBuilder',
      'DeleteQueryBuilder',
      'TreeRepository',
      'MongoRepository',
      'Connection',
      'getManager',
      'getConnection',
      'getConnectionManager',
      'getRepository',
      'getTreeRepository',
      'getMongoRepository',
      'createConnection',
      'createConnections',
    ],
    message:
      'TypeORM persistence APIs belong only in repository adapters or explicitly reviewed database infrastructure (TD37-S02; docs/AGENT_PATTERNS.md Pattern #1).',
  },
];

const PERSISTENCE_BYPASS_IGNORES = [
  '**/*.spec.ts',
  '**/*.integration.spec.ts',
  'src/test/**',
  'src/contexts/booking/infrastructure/migrations/1748000000011-CreateBookingServices.ts',
  'src/contexts/booking/infrastructure/migrations/1748000000012-CreateBookingScheduleClosures.ts',
  'src/contexts/booking/infrastructure/migrations/1748000000013-CreateBookingScheduleOpenings.ts',
  'src/contexts/booking/infrastructure/migrations/1748000000014-CreateBookingBookings.ts',
  'src/contexts/booking/infrastructure/migrations/1748500000007-CreateBookingResources.ts',
  'src/contexts/booking/infrastructure/migrations/1748500000008-BackfillLocationResources.ts',
  'src/contexts/platform/infrastructure/migrations/1748500000004-CreateLeadFormSubmissionQuestionRefs.ts',
  'src/contexts/platform/infrastructure/migrations/1748500000005-AddVersionToLeadFormConfigs.ts',
  'src/contexts/booking/infrastructure/repositories/typeorm-booking.repository.ts',
  'src/contexts/booking/infrastructure/repositories/typeorm-resource.repository.ts',
  'src/contexts/booking/infrastructure/repositories/typeorm-schedule-closure.repository.ts',
  'src/contexts/booking/infrastructure/repositories/typeorm-schedule-opening.repository.ts',
  'src/contexts/booking/infrastructure/repositories/typeorm-service.repository.ts',
  'src/contexts/customer/infrastructure/migrations/1716600000001-CreateCustomerCustomers.ts',
  'src/contexts/customer/infrastructure/migrations/1748000000002-AddCustomerTenantOAuthUniqueConstraint.ts',
  'src/contexts/customer/infrastructure/repositories/typeorm-customer.repository.ts',
  'src/contexts/loyalty/infrastructure/migrations/1748000000016-CreateLoyaltyLoyaltyEntries.ts',
  'src/contexts/loyalty/infrastructure/migrations/1748000000017-CreateLoyaltyBalancesRedemptionsExpiryLog.ts',
  'src/contexts/loyalty/infrastructure/migrations/1748400000003-AddLoyaltyRedemptionPointsPerCurrencyUnit.ts',
  'src/contexts/loyalty/infrastructure/repositories/typeorm-balance-expiry-log.repository.ts',
  'src/contexts/loyalty/infrastructure/repositories/typeorm-loyalty-balance.repository.ts',
  'src/contexts/loyalty/infrastructure/repositories/typeorm-loyalty-entry.repository.ts',
  'src/contexts/loyalty/infrastructure/repositories/typeorm-loyalty-redemption.repository.ts',
  'src/contexts/notification/infrastructure/migrations/1748000000010-CreateNotificationLogs.ts',
  'src/contexts/notification/infrastructure/migrations/1748100000010-CreateNotificationTemplates.ts',
  'src/contexts/notification/infrastructure/migrations/1748200000010-AlterNotificationLogs.ts',
  'src/contexts/notification/infrastructure/migrations/1748300000010-AddNotificationLogUniqueConstraint.ts',
  'src/contexts/notification/infrastructure/repositories/typeorm-notification-log.repository.ts',
  'src/contexts/notification/infrastructure/repositories/typeorm-notification-template.repository.ts',
  'src/contexts/platform/infrastructure/migrations/1700000000000-BootstrapSchemas.ts',
  'src/contexts/platform/infrastructure/migrations/1716500000001-CreatePlatformTenants.ts',
  'src/contexts/platform/infrastructure/migrations/1716500000002-CreatePlatformHotsiteConfigs.ts',
  'src/contexts/platform/infrastructure/migrations/1748400000001-AddSeoToHotsiteConfigs.ts',
  'src/contexts/platform/infrastructure/migrations/1748400000009-AddVersionToHotsiteConfigs.ts',
  'src/contexts/platform/infrastructure/migrations/1748400000010-CreateChatbotTables.ts',
  'src/contexts/platform/infrastructure/migrations/1748400000011-AddCostUsdToChatbotMessages.ts',
  'src/contexts/platform/infrastructure/migrations/1748400000012-AddHealthColumnsToChatbotProviderBalance.ts',
  'src/contexts/platform/infrastructure/migrations/1748400000013-AddStartedAtIndexToChatbotSessions.ts',
  'src/contexts/platform/infrastructure/migrations/1748400000014-CreateLeadFormSubmissions.ts',
  'src/contexts/platform/infrastructure/migrations/1748500000002-CreatePlatformLeadFormConfigs.ts',
  'src/contexts/platform/infrastructure/migrations/1748500000003-AddExpiresAtIndexToLeadFormSubmissions.ts',
  'src/contexts/platform/infrastructure/migrations/1748500000006-CreateLeadFormAnswers.ts',
  'src/contexts/platform/infrastructure/repositories/typeorm-chatbot-message.repository.ts',
  'src/contexts/platform/infrastructure/repositories/typeorm-chatbot-provider-balance.repository.ts',
  'src/contexts/platform/infrastructure/repositories/typeorm-chatbot-session.repository.ts',
  'src/contexts/platform/infrastructure/repositories/typeorm-hotsite-config.repository.ts',
  'src/contexts/platform/infrastructure/repositories/typeorm-lead-form-config.repository.ts',
  'src/contexts/platform/infrastructure/repositories/typeorm-lead-form-submission.repository.ts',
  'src/contexts/platform/infrastructure/repositories/typeorm-tenant.repository.ts',
  'src/contexts/staff/infrastructure/migrations/1716600000002-CreateStaffStaff.ts',
  'src/contexts/staff/infrastructure/migrations/1716600000003-AddNameToStaff.ts',
  'src/contexts/staff/infrastructure/migrations/1716600000004-AddUniqueEmailPerTenant.ts',
  'src/contexts/staff/infrastructure/migrations/1748000000001-AddInvitedByDeactivatedByToStaff.ts',
  'src/contexts/staff/infrastructure/repositories/typeorm-staff.repository.ts',
  'src/shared/database/data-source.ts',
  'src/shared/database/seed.ts',
  'src/shared/infrastructure/transaction-context.ts',
  'src/shared/infrastructure/run-in-new-transaction.ts',
  'src/shared/infrastructure/typeorm-transaction-manager.ts',
  'src/shared/infrastructure/database/cloud-sql-connector.adapter.ts',
  'src/shared/infrastructure/inbox/typeorm-inbox.repository.ts',
  'src/shared/infrastructure/migrations/1748400000005-AddSharedSchema.ts',
  'src/shared/infrastructure/migrations/1748400000006-CreateSharedOutbox.ts',
  'src/shared/infrastructure/migrations/1748400000007-CreateSharedInbox.ts',
  'src/shared/infrastructure/migrations/1748400000008-GrantRelayReadAccess.ts',
  'src/shared/infrastructure/migrations/1748500000001-AddOutboxLease.ts',
  'src/shared/infrastructure/outbox/drain-domain-events.ts',
  'src/shared/infrastructure/outbox/typeorm-outbox.repository.ts',
  ...reviewedRawPersistencePaths,
];

// Repository-adapter subset of PERSISTENCE_BYPASS_IGNORES — used by Tier 2 below to keep the
// event-bus-port ban (TD24-S03) scoped to exactly the reviewed adapters, not every file that
// happens to live under infrastructure/repositories/**. An unreviewed file added to that
// directory must still fail the persistence-bypass ban (Story 2's own "no broad directory
// exemption" requirement) until it's explicitly added to PERSISTENCE_BYPASS_IGNORES.
const REVIEWED_REPOSITORY_ADAPTER_PATHS = PERSISTENCE_BYPASS_IGNORES.filter((path) =>
  path.includes('/infrastructure/repositories/'),
);

// TD37-S02: publishing to the event transport is network I/O, so it must never run while the
// shared transaction manager holds a database connection/lock. Targets eventBus.publish()
// specifically, not outboxPublisher.publish() — TD24-S03's outbox pattern deliberately writes the
// outbox row inside the same transaction as the business write (that's the whole point: an
// atomic fact), relaying it over the network only after commit.
// Matches both a bare `txManager.run(...)`/`eventBus.publish(...)` and the real production shape,
// constructor-injected as `this.txManager`/`this.eventBus` (CodeRabbit review, PR #375: the
// bare-identifier-only version never matched any real use case — every one injects txManager as
// `private readonly txManager` and calls it via `this.txManager.run(...)`, so this rule had never
// actually fired on production code since it shipped. The first fix attempt widened the outer
// match but left the inner `:has(...)` clause matching ANY `.publish(`-named method, flagging 4
// legitimate `this.outboxPublisher.publish(...)` call sites as false positives — narrowed to
// eventBus specifically once real production code was linted for the first time.)
const TX_MANAGER_PUBLISH_SELECTOR = {
  selector:
    "CallExpression[callee.property.name='run']:matches([callee.object.name=/^_?txManager$/], [callee.object.property.name=/^_?txManager$/]):has(CallExpression[callee.property.name='publish']:matches([callee.object.name=/^_?eventBus$/], [callee.object.property.name=/^_?eventBus$/]))",
  message:
    'Do not call eventBus.publish() inside txManager.run(). Claim durable work in a short transaction, publish outside it, then mark/release in another short transaction (TD37-S02; docs/ENGINEERING_RULES.md Transactions).',
};
const TYPEORM_NAMESPACE_SELECTOR = {
  selector: "ImportDeclaration[source.value='typeorm'] > ImportNamespaceSpecifier",
  message:
    'TypeORM namespace imports hide persistence-bypass APIs. Import only the permitted decorator/type helpers by name, or move persistence access into a repository adapter (TD37-S02; docs/AGENT_PATTERNS.md Pattern #1).',
};
const RUN_IN_TRANSACTION_SELECTOR = {
  selector: "TSMethodSignature[key.name='runInTransaction']",
  message:
    'Repository ports must not own transactions. Inject ITransactionManager into the orchestrating service/use case and let the TypeORM adapter join its ambient context (TD37-S02; docs/ENGINEERING_RULES.md Transactions).',
};
// DomainEvent.eventName is derived from the class's own name — a bare string literal at
// the subscribe()/registerTrigger() call site can silently drift from the class if either is
// renamed, and a mistyped literal creates a dead Pub/Sub channel no one publishes to correctly.
// Cron triggers use a shared exported const (e.g. CRON_REMINDERS_TRIGGER) instead
// (docs/ENGINEERING_RULES.md §Event Handlers). Matches both a string literal and a
// no-substitution template literal (Codex review, PR #375: eventBus.subscribe(`BookingCompleted`,
// ...) is an equally hand-typed name but is a distinct TemplateLiteral AST node, not a Literal, so
// the original selector missed it).
const SUBSCRIBE_REGISTER_TRIGGER_LITERAL_SELECTOR = {
  selector:
    "CallExpression[callee.property.name=/^(subscribe|registerTrigger)$/]:matches([arguments.0.type='Literal'], [arguments.0.type='TemplateLiteral'][arguments.0.expressions.length=0])",
  message:
    'Do not hand-type the event/trigger name as a string literal at the subscribe()/registerTrigger() call site — use <Event>.name or a shared exported trigger-name const instead (docs/ENGINEERING_RULES.md §Event Handlers).',
};
// Use cases must be framework-agnostic — throw domain errors only, and let
// mapXxxError() convert them to HttpException at the HTTP layer (docs/ANTI_PATTERNS.md).
// Enumerates every @nestjs/common HTTP exception subclass, not just the HttpException base class
// (CodeRabbit review, PR #375) — throw new NotFoundException(...)/BadRequestException(...)/etc.
// couple a use case to HTTP exactly the same way and must be caught too. Deliberately not a
// generic /Exception$/ regex: domain errors also use that suffix (e.g. EmailDeliveryException in
// architecture-policy.json) and must stay allowed.
const HTTP_EXCEPTION_IN_USE_CASE_SELECTOR = {
  selector:
    'ThrowStatement > NewExpression[callee.name=/^(HttpException|BadRequestException|UnauthorizedException|ForbiddenException|NotFoundException|ConflictException|GoneException|PayloadTooLargeException|UnprocessableEntityException|InternalServerErrorException|NotImplementedException|BadGatewayException|ServiceUnavailableException|GatewayTimeoutException|RequestTimeoutException|PreconditionFailedException|NotAcceptableException|MethodNotAllowedException|UnsupportedMediaTypeException|ImATeapotException|HttpVersionNotSupportedException)$/]',
  message:
    'Use cases must not throw HttpException directly — it couples the application layer to HTTP. Throw a domain error; mapXxxError() converts it at the HTTP layer (docs/ANTI_PATTERNS.md).',
};
// Imported (not redefined) from @ikaro/config/eslint-base.js so the uuid/email selectors have one
// source of truth (CodeRabbit review, PR #375) — still repeated into this file's own tiers below,
// because ESLint flat config replaces, not merges, a rule's options per matching file (see the
// file-level note above).
const { ZOD_UUID_SELECTOR, ZOD_EMAIL_SELECTOR } = baseConfig;

module.exports = [
  ...baseConfig,

  // Tier 0 — universal base: every .ts file (including specs) must import the ports/shared-domain
  // files directly (not via barrel) and never import raw @opentelemetry/* directly.
  {
    files: ['**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [PORTS_BARREL_PATTERN, SHARED_DOMAIN_BARREL_PATTERN, OPENTELEMETRY_PATTERN] },
      ],
    },
  },

  // Tier 1 — TD37-S02 persistence-bypass ban, broad across src/**/*.ts but exempting repository
  // adapters, migrations, and other reviewed low-level TypeORM plumbing. Self-sufficient: repeats
  // Tier 0's patterns (see the file-level note above for why).
  {
    files: ['src/**/*.ts'],
    ignores: PERSISTENCE_BYPASS_IGNORES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [PORTS_BARREL_PATTERN, SHARED_DOMAIN_BARREL_PATTERN, OPENTELEMETRY_PATTERN],
          paths: TYPEORM_BYPASS_PATHS,
        },
      ],
    },
  },

  // Tier 2a — TD24-S03 (D14): the explicitly reviewed repository adapters are exempt from the
  // persistence-bypass ban (they ARE the persistence layer) but must still route publishes
  // through the outbox, never EVENT_BUS directly — event *handlers* (subscribe()) and the outbox
  // relay itself are unaffected, they live outside this glob. Self-sufficient: repeats Tier 0's
  // patterns. Scoped to the exact reviewed list (not the whole repositories/** directory) so an
  // unreviewed new file there falls through to Tier 2b instead of silently gaining this exemption.
  {
    files: REVIEWED_REPOSITORY_ADAPTER_PATHS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            PORTS_BARREL_PATTERN,
            SHARED_DOMAIN_BARREL_PATTERN,
            EVENT_BUS_PORT_PATTERN,
            OPENTELEMETRY_PATTERN,
          ],
        },
      ],
    },
  },

  // Tier 2b — an unreviewed file under infrastructure/repositories/** (not yet in
  // REVIEWED_REPOSITORY_ADAPTER_PATHS) must still fail the persistence-bypass ban until it's
  // explicitly reviewed and added to that list — Story 2's "no broad directory exemption"
  // requirement. Self-sufficient: repeats Tier 1's patterns/paths and adds the event-bus-port ban.
  {
    files: ['src/contexts/**/infrastructure/repositories/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.integration.spec.ts', ...REVIEWED_REPOSITORY_ADAPTER_PATHS],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            PORTS_BARREL_PATTERN,
            SHARED_DOMAIN_BARREL_PATTERN,
            EVENT_BUS_PORT_PATTERN,
            OPENTELEMETRY_PATTERN,
          ],
          paths: TYPEORM_BYPASS_PATHS,
        },
      ],
    },
  },

  // Tier 3 — application layer (TD24-S03 D14): the full set applies here — the
  // persistence-bypass ban, the outbox-not-EVENT_BUS ban, and the RequestContext ban, on top of
  // the Tier 0 base. Self-sufficient: repeats every selector/path a broader tier already requires
  // for these files, so this narrower/later block doesn't drop them.
  {
    files: ['src/contexts/**/application/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.integration.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            PORTS_BARREL_PATTERN,
            SHARED_DOMAIN_BARREL_PATTERN,
            EVENT_BUS_PORT_PATTERN,
            OPENTELEMETRY_PATTERN,
            REQUEST_CONTEXT_PATTERN,
          ],
          paths: TYPEORM_BYPASS_PATHS,
        },
      ],
    },
  },

  // Tier S0 — TD37-S02 syntax bans plus the event/trigger literal ban, broad across src/**/*.ts.
  // Self-sufficient: repeats @ikaro/config/eslint-base.js's uuid/email selectors too (see the
  // file-level note above).
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.integration.spec.ts', 'src/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        TX_MANAGER_PUBLISH_SELECTOR,
        TYPEORM_NAMESPACE_SELECTOR,
        RUN_IN_TRANSACTION_SELECTOR,
        SUBSCRIBE_REGISTER_TRIGGER_LITERAL_SELECTOR,
        ZOD_UUID_SELECTOR,
        ZOD_EMAIL_SELECTOR,
      ],
    },
  },

  // Tier S1 — use cases additionally banned from throwing HttpException directly.
  // Self-sufficient: repeats Tier S0's selectors for the same reason as the
  // no-restricted-imports tiers above.
  {
    files: ['src/contexts/**/application/**/*.use-case.ts'],
    ignores: ['**/*.spec.ts', '**/*.integration.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        TX_MANAGER_PUBLISH_SELECTOR,
        TYPEORM_NAMESPACE_SELECTOR,
        RUN_IN_TRANSACTION_SELECTOR,
        SUBSCRIBE_REGISTER_TRIGGER_LITERAL_SELECTOR,
        HTTP_EXCEPTION_IN_USE_CASE_SELECTOR,
        ZOD_UUID_SELECTOR,
        ZOD_EMAIL_SELECTOR,
      ],
    },
  },

  // Tier L1 — TD37-S05: docs/CODE_STANDARDS.md's function-length limit, enforced via ESLint core
  // (zero new dependency). Specs are exempt (test bodies are naturally longer due to setup/
  // assertions — the rule's intent targets production logic); migrations and the seed script are
  // exempt (DDL/seed data, not application logic — same rationale as PERSISTENCE_BYPASS_IGNORES
  // above); src/test/** is exempt (test infrastructure, not production code). Applies to every
  // production file, including the max-lines-aggregate exceptions below — a long aggregate FILE
  // is expected, a long method inside it is not.
  {
    files: ['src/**/*.ts'],
    ignores: [
      '**/*.spec.ts',
      '**/*.integration.spec.ts',
      'src/contexts/**/infrastructure/migrations/**',
      'src/shared/infrastructure/migrations/**',
      'src/shared/database/seed.ts',
      'src/test/**',
    ],
    rules: {
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
    },
  },

  // Tier L2 — same as Tier L1 but for the file-length limit, additionally exempting the reviewed
  // max-lines-aggregate paths (see architecture-policy.json) — domain aggregates whose file
  // length is a natural consequence of many small, cohesive methods, not a complexity smell that
  // splitting across files would fix.
  {
    files: ['src/**/*.ts'],
    ignores: [
      '**/*.spec.ts',
      '**/*.integration.spec.ts',
      'src/contexts/**/infrastructure/migrations/**',
      'src/shared/infrastructure/migrations/**',
      'src/shared/database/seed.ts',
      'src/test/**',
      ...maxLinesAggregateExceptionPaths,
    ],
    rules: {
      'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
    },
  },

  // TD37-S15: no .skip()/.only() — a skipped test hides a real regression behind a green CI
  // run, and a focused describe/it silently stops every sibling test in the file from running
  // at all. Scoped to spec files only; zero baseline violations confirmed repo-wide before this
  // shipped directly as `error` (docs/ANTI_PATTERNS.md, docs/08-TESTING_STRATEGY.md).
  {
    files: ['src/**/*.spec.ts', 'src/**/*.integration.spec.ts'],
    plugins: { jest: jestPlugin },
    rules: {
      'jest/no-disabled-tests': 'error',
      'jest/no-focused-tests': 'error',
    },
  },
];

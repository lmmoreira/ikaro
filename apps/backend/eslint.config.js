const baseConfig = require('@ikaro/config/eslint-base');
const architecturePolicy = require('../../packages/architecture-check/architecture-policy.json');

const reviewedRawPersistencePaths = architecturePolicy.exceptions
  .filter((exception) => exception.rule === 'raw-persistence-api')
  .map((exception) => exception.path.replace(/^apps\/backend\//, ''));

module.exports = [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '\\/ports(\\/index)?$',
              message: 'Import directly from the port file, e.g. ./ports/tenant-repository.port',
            },
            {
              regex: '\\/shared\\/domain(\\/index)?$',
              message: 'Import directly from the domain file, e.g. ../shared/domain/domain-event',
            },
            {
              // M17-S33: raw @opentelemetry/* imports are confined to packages/observability
              // (the port/adapter live there — ITracingPort/OtelTracingAdapter — mirroring
              // LogVendorFormatter for logging). App code depends on the port only, never the
              // SDK directly, so a future tracer swap touches one adapter, not every call site.
              // This also covers D9 anti-lock-in for the vendor-specific case: the collector
              // (M17-S34) is the one and only place GCP appears in the whole pipeline, so a GCP
              // OTel exporter/detector package has no legitimate reason to appear here either.
              regex: '^@opentelemetry\\/',
              message:
                'Raw @opentelemetry/* imports belong only in packages/observability (M17-S33) — depend on ITracingPort/OtelTracingAdapter (or bootstrapOtelTracing for a tracing.ts entrypoint) instead.',
            },
          ],
        },
      ],
    },
  },
  // TD24-S03 (D14): every original publish site now depends on OUTBOX_PUBLISHER explicitly — the
  // 3 event-emitting aggregates' repositories (TD24-S02) and the 3 cron jobs + the loyalty
  // re-emit (this story). A file under these two globs importing event-bus.port again signals a
  // future publish site forgot to wrap itself in the outbox. Event *handlers* (subscribe()) and
  // the outbox relay (publish() to the real transport) are unaffected — they live outside both
  // globs (contexts/**/infrastructure/events/**, shared/infrastructure/outbox/**) — and test
  // files are excluded below since they legitimately construct IEventBus doubles/mocks to verify
  // transport shape, which is a different concern from production publish wiring.
  //
  // Flat config replaces (not merges) a rule's options when two config objects both set it for
  // the same file — this block repeats the base ports/shared-domain patterns above so files under
  // these globs keep both restrictions instead of losing the first to the second.
  {
    files: [
      'src/contexts/**/application/**/*.ts',
      'src/contexts/**/infrastructure/repositories/**/*.ts',
    ],
    ignores: ['**/*.spec.ts', '**/*.integration.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '\\/ports(\\/index)?$',
              message: 'Import directly from the port file, e.g. ./ports/tenant-repository.port',
            },
            {
              regex: '\\/shared\\/domain(\\/index)?$',
              message: 'Import directly from the domain file, e.g. ../shared/domain/domain-event',
            },
            {
              regex: '\\/event-bus\\.port$',
              message:
                'Publish sites depend on OUTBOX_PUBLISHER/IOutboxPublisher (shared/ports/outbox-publisher.port), not EVENT_BUS — see td/TD24-OUTBOX-INBOX-PATTERN.md D14.',
            },
            {
              regex: '^@opentelemetry\\/',
              message:
                'Raw @opentelemetry/* imports belong only in packages/observability (M17-S33) — depend on ITracingPort/OtelTracingAdapter instead.',
            },
          ],
        },
      ],
    },
  },
  // TD37-S02: persistence APIs belong behind repository adapters. Keep this list name-based
  // rather than banning `typeorm` wholesale: entities, migrations, and module composition still
  // legitimately import TypeORM decorators and registration helpers.
  {
    files: ['src/**/*.ts'],
    ignores: [
      '**/*.spec.ts',
      '**/*.integration.spec.ts',
      'src/test/**',
      'src/contexts/booking/infrastructure/migrations/1748000000011-CreateBookingServices.ts',
      'src/contexts/booking/infrastructure/migrations/1748000000012-CreateBookingScheduleClosures.ts',
      'src/contexts/booking/infrastructure/migrations/1748000000013-CreateBookingScheduleOpenings.ts',
      'src/contexts/booking/infrastructure/migrations/1748000000014-CreateBookingBookings.ts',
      'src/contexts/booking/infrastructure/repositories/typeorm-booking.repository.ts',
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
      'src/contexts/platform/infrastructure/repositories/typeorm-chatbot-message.repository.ts',
      'src/contexts/platform/infrastructure/repositories/typeorm-chatbot-provider-balance.repository.ts',
      'src/contexts/platform/infrastructure/repositories/typeorm-chatbot-session.repository.ts',
      'src/contexts/platform/infrastructure/repositories/typeorm-hotsite-config.repository.ts',
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
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
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
          ],
        },
      ],
    },
  },
  // TD37-S02: publishing to the event transport is network I/O, so it must never run while the
  // shared transaction manager holds a database connection/lock. This intentionally targets the
  // concrete event-bus call rather than guessing at every possible network client API.
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.integration.spec.ts', 'src/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='txManager'][callee.property.name='run']:has(CallExpression[callee.property.name='publish'])",
          message:
            'Do not call eventBus.publish() inside txManager.run(). Claim durable work in a short transaction, publish outside it, then mark/release in another short transaction (TD37-S02; docs/ENGINEERING_RULES.md Transactions).',
        },
        {
          selector: "ImportDeclaration[source.value='typeorm'] > ImportNamespaceSpecifier",
          message:
            'TypeORM namespace imports hide persistence-bypass APIs. Import only the permitted decorator/type helpers by name, or move persistence access into a repository adapter (TD37-S02; docs/AGENT_PATTERNS.md Pattern #1).',
        },
        {
          selector: "TSMethodSignature[key.name='runInTransaction']",
          message:
            'Repository ports must not own transactions. Inject ITransactionManager into the orchestrating service/use case and let the TypeORM adapter join its ambient context (TD37-S02; docs/ENGINEERING_RULES.md Transactions).',
        },
      ],
    },
  },
];

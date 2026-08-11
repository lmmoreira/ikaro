const baseConfig = require('@ikaro/config/eslint-base');

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
      '**/infrastructure/repositories/**',
      '**/infrastructure/entities/**',
      '**/infrastructure/migrations/**',
      '**/*.spec.ts',
      '**/*.integration.spec.ts',
      '**/*.module.ts',
      'src/test/**',
      'src/shared/database/**',
      'src/shared/infrastructure/transaction-context.ts',
      'src/shared/infrastructure/run-in-new-transaction.ts',
      'src/shared/infrastructure/typeorm-transaction-manager.ts',
      'src/shared/infrastructure/inbox/typeorm-inbox.repository.ts',
      'src/shared/infrastructure/outbox/typeorm-outbox.repository.ts',
      // Story 0 registry: legacy adapter scheduled for repository-port follow-up.
      'src/contexts/booking/infrastructure/cross-context/typeorm-booking-availability.adapter.ts',
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
              ],
              message:
                'TypeORM persistence APIs belong only in repository adapters or explicitly reviewed database infrastructure (TD37-S02; docs/AGENT_PATTERNS.md Pattern #1).',
            },
          ],
        },
      ],
    },
  },
  // TD37-S02: transaction lifetime belongs to the application/service orchestration layer.
  // Repository ports describe persistence operations only; exposing a transaction callback from
  // a port lets adapters bypass the shared ALS/after-commit transaction context.
  {
    files: ['src/**/ports/**/*repository.port.ts', 'src/shared/ports/*-repository.port.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSMethodSignature[key.name.name='runInTransaction']",
          message:
            'Repository ports must not own transactions. Inject ITransactionManager into the orchestrating service/use case and let the TypeORM adapter join its ambient context (TD37-S02; docs/ENGINEERING_RULES.md Transactions).',
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
      ],
    },
  },
];

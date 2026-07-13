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
          ],
        },
      ],
    },
  },
];

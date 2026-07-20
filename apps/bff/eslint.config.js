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
              // M17-S33 (D9 anti-lock-in): app code exports traces as plain OTLP only — the
              // collector (M17-S34) is the one and only place GCP appears in the whole pipeline.
              // A vendor exporter/detector package imported here would leak that boundary back
              // into app code.
              regex: '^@google-cloud\\/opentelemetry',
              message:
                'GCP-specific OTel packages are forbidden in app code (D9 anti-lock-in) — the collector config (M17-S34) is the only place a vendor exporter belongs.',
            },
          ],
        },
      ],
    },
  },
];

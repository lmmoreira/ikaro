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
  // TD37-S05: docs/CODE_STANDARDS.md's function/file length limits, enforced via ESLint core
  // (zero new dependency). Specs are exempt (test bodies are naturally longer due to setup/
  // assertions — the rule's intent targets production logic); src/test/** is exempt (test
  // infrastructure, not production code).
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.integration.spec.ts', 'src/test/**'],
    rules: {
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
    },
  },
];

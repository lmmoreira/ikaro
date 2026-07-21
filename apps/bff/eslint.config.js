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
];

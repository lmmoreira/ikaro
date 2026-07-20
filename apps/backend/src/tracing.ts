// M17-S33 — OpenTelemetry SDK bootstrap. Must be required before anything else (see
// package.json's "start"/"dev" scripts) — before NestJS initialises, before any module that
// might make an HTTP/DB call is imported, so auto-instrumentation can patch those modules
// first. Traces only, OTLP-HTTP only (D9 anti-lock-in: no vendor exporter in app code — the
// only GCP-specific piece in this entire pipeline is the collector's exporter config, M17-S34).
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

// Read directly, set per-environment by Cloud Run (staging 1.0, prod 0.1) — never branch on
// NODE_ENV (both cloud envs build with NODE_ENV=production, so it can't distinguish staging
// from prod) or APP_ENV (would add a second source of truth for a value Cloud Run already
// sets directly via this exact var).
const samplingRate = Number(process.env['OTEL_TRACES_SAMPLER_ARG'] ?? 1.0);

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env['SERVICE_NAME'] ?? 'ikaro-backend',
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env['APP_ENV'] ?? 'local',
  }),
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(samplingRate),
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4318',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
      // TypeORM runs on the `pg` driver — there is no standalone OTel TypeORM
      // instrumentation; instrumenting `pg` is what actually produces DB client spans.
      '@opentelemetry/instrumentation-pg': { enabled: true },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingRequestHook: (req) =>
          Boolean(req.url?.startsWith('/health/') || req.url?.startsWith('/pubsub/push')),
      },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-nestjs-core': { enabled: true },
    }),
  ],
});

// OTEL_SDK_DISABLED=true fully disables the SDK — used in unit tests/CI so no exporter
// tries to reach a collector that doesn't exist there. When enabled, a genuinely
// unreachable collector still degrades gracefully on its own: the exporter retries
// in the background and never blocks or crashes the app (BatchSpanProcessor default).
if (process.env['OTEL_SDK_DISABLED'] !== 'true') {
  sdk.start();
}

process.on('SIGTERM', () => {
  void sdk.shutdown();
});

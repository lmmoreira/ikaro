import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  getNodeAutoInstrumentations,
  InstrumentationConfigMap,
} from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

/**
 * M17-S33 — shared OTel SDK bootstrap for backend + bff. Traces only, OTLP-HTTP only (D9
 * anti-lock-in: no vendor exporter here — the collector, M17-S34, is the only place GCP
 * appears in the whole pipeline).
 *
 * Callers must import and invoke this from their own `src/tracing.ts`, loaded before anything
 * else (see each app's package.json `start`/`dev` scripts) — before NestJS initialises, before
 * any module that might make an HTTP/DB call is imported, so auto-instrumentation can patch
 * those modules first. `instrumentationOverrides` lets a caller add app-specific instrumentations
 * (e.g. backend's `pg`) on top of the shared defaults.
 */
export function bootstrapOtelTracing(
  defaultServiceName: string,
  instrumentationOverrides: InstrumentationConfigMap = {},
): NodeSDK {
  // Read directly, set per-environment by Cloud Run (staging 1.0, prod 0.1) — never branch on
  // NODE_ENV (both cloud envs build with NODE_ENV=production, so it can't distinguish staging
  // from prod) or APP_ENV (would add a second source of truth for a value Cloud Run already
  // sets directly via this exact var).
  const samplingRate = Number(process.env['OTEL_TRACES_SAMPLER_ARG'] ?? 1.0);

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env['SERVICE_NAME'] ?? defaultServiceName,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env['APP_ENV'] ?? 'local',
    }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(samplingRate),
    }),
    // Passing `url` explicitly makes the exporter use it exactly as-is — unlike the
    // OTEL_EXPORTER_OTLP_ENDPOINT env var read internally by the exporter, an explicit `url`
    // does NOT get `/v1/traces` auto-appended. Append it ourselves so the exporter still hits
    // the collector's traces receiver rather than its bare base path.
    traceExporter: new OTLPTraceExporter({
      url: `${process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4318'}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          ignoreIncomingRequestHook: (req) =>
            Boolean(req.url?.startsWith('/health/') || req.url?.startsWith('/pubsub/push')),
        },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-nestjs-core': { enabled: true },
        ...instrumentationOverrides,
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

  return sdk;
}

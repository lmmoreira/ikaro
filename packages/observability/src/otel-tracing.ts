import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { isOtelSdkDisabled } from './otel-sdk-disabled';
import { redactSensitiveQueryParams, SENSITIVE_QUERY_PARAMS } from './otel-query-redaction';

/**
 * Options a caller's own `src/tracing.ts` can request, in vendor-neutral terms — never an
 * OTel-shaped config object. A full tracer swap (M17-S33 security review, 2026-07-21: "if we
 * ever need to change to a vendor's proprietary SDK for a contract") should only ever touch
 * this file, never either app's tracing.ts — those call bootstrapTracing() by a name and shape
 * that says nothing about which implementation is behind it.
 */
export interface TracingOptions {
  /** Enables Postgres client instrumentation (backend only — BFF has no DB). */
  postgres?: boolean;
}

/**
 * M17-S33 — shared tracing SDK bootstrap for backend + bff. Traces only, OTLP-HTTP only (D9
 * anti-lock-in: no vendor exporter here — the collector, M17-S34, is the only place GCP
 * appears in the whole pipeline). Currently implemented on OpenTelemetry; nothing about this
 * function's name or signature is OTel-specific, so swapping the implementation is confined
 * entirely to this file.
 *
 * Callers must import and invoke this from their own `src/tracing.ts`, loaded before anything
 * else (see each app's package.json `start`/`dev` scripts) — before NestJS initialises, before
 * any module that might make an HTTP/DB call is imported, so auto-instrumentation can patch
 * those modules first.
 */
export function bootstrapTracing(defaultServiceName: string, options: TracingOptions = {}): NodeSDK {
  // Security review follow-up (2026-07-21): the OTel API's diag channel is silent by default —
  // an unreachable collector or an export failure would previously produce no signal
  // whatsoever, undermining the story's own "warn once" acceptance criterion and leaving an
  // incident with no indication of why traces are missing. WARN (not INFO/DEBUG) keeps this to
  // genuine problems, not per-export chatter. `diag.*` (not a raw console.* call) is also what
  // keeps this out of the repo's blanket console.log/error/warn-in-production lint check —
  // legitimately, not as a workaround: this file runs before AppLogger/Nest exist, and `diag`
  // is OTel's own purpose-built diagnostic channel for exactly this kind of SDK-internal signal.
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

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
          // Covers OUTGOING (client) request spans — the instrumentation redacts these query
          // params itself for url.full/http.url. NOTE: this option *replaces* the
          // instrumentation's own defaults rather than extending them, so
          // SENSITIVE_QUERY_PARAMS restates them (see otel-query-redaction.ts).
          redactedQueryParams: Array.from(SENSITIVE_QUERY_PARAMS),
          // Covers INCOMING (server) request spans — redactedQueryParams above does NOT apply
          // to these; the instrumentation sets url.query/http.target from the raw request URL
          // with no redaction at all on the incoming path. Without this, the BFF's
          // /auth/google/callback route (which receives a redeemable OAuth `code` and signed
          // `state` as query params) would ship both to the collector/trace backend verbatim.
          // Overwriting the attributes here works because requestHook runs after span creation
          // but before export.
          requestHook: (span, request) => {
            const pathAndQuery = 'url' in request ? request.url : undefined;
            if (!pathAndQuery) {
              return;
            }
            const redacted = redactSensitiveQueryParams(pathAndQuery);
            const queryIndex = redacted.indexOf('?');
            if (queryIndex !== -1) {
              span.setAttribute('url.query', redacted.slice(queryIndex + 1));
            }
            span.setAttribute('http.target', redacted);
          },
        },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-nestjs-core': { enabled: true },
        // TypeORM runs on the `pg` driver — there is no standalone OTel TypeORM
        // instrumentation; instrumenting `pg` is what actually produces DB client spans.
        ...(options.postgres ? { '@opentelemetry/instrumentation-pg': { enabled: true } } : {}),
      }),
    ],
  });

  // Defaults off locally (APP_ENV=local, including CI which never sets APP_ENV), on in
  // staging/production — see otel-sdk-disabled.ts. OTEL_SDK_DISABLED, when explicitly set,
  // always overrides the default either direction. When enabled, a genuinely unreachable
  // collector still degrades gracefully on its own: the exporter retries in the background and
  // never blocks or crashes the app (BatchSpanProcessor default) — diag.setLogger above just
  // makes that failure visible instead of silent.
  if (!isOtelSdkDisabled(process.env)) {
    sdk.start();
  }

  process.on('SIGTERM', () => {
    sdk.shutdown().catch((err: unknown) => {
      // A rejected shutdown() means buffered spans may not have flushed — surfaced via diag
      // rather than swallowed (security review follow-up, 2026-07-21).
      diag.error('[otel] sdk.shutdown() failed — buffered spans may not have flushed', err);
    });
  });

  return sdk;
}

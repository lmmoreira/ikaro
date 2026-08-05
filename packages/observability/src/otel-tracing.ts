import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions';
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  SimpleSpanProcessor,
  type Sampler,
} from '@opentelemetry/sdk-trace-base';
import { isOtelSdkDisabled } from './otel-sdk-disabled';
import { redactSensitiveQueryParams, SENSITIVE_QUERY_PARAMS } from './otel-query-redaction';

/**
 * Extracted and exported for direct unit testing (2026-08-05, M17-S34 follow-up) — this exact
 * configuration has already had one real, hard-to-find bug: without the explicit
 * remoteParentNotSampled/localParentNotSampled overrides, ParentBasedSampler's own defaults
 * blindly trust an inherited "not sampled" parent decision regardless of `ratio`, silently
 * dropping the majority of real traces before export was ever attempted. See the call site in
 * bootstrapTracing() for the full incident writeup.
 */
export function createSampler(ratio: number): Sampler {
  return new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(ratio),
    remoteParentNotSampled: new TraceIdRatioBasedSampler(ratio),
    localParentNotSampled: new TraceIdRatioBasedSampler(ratio),
  });
}

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
 * Health-check paths to exclude from tracing — shared across backend (no global
 * prefix, e.g. `/health/live`) and BFF (global `v1` prefix, e.g. `/v1/health/live`).
 * Exported and unit-tested directly, not just exercised indirectly through the SDK —
 * this exact check has already had two real bugs: `.startsWith('/health/')` silently
 * never matched BFF's prefixed path (2026-08-05, caught only via a real staging
 * deploy), and a follow-up `.includes('/health/')` matched the substring anywhere in
 * the full URL, including query-string *values* on unrelated real routes (e.g.
 * `/v1/bookings?redirect=/health/live`), silently excluding those from tracing too.
 * Checks the parsed pathname only, against the two known real prefixes.
 */
export function isHealthCheckPath(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  const pathname = url.split('?')[0] ?? '';
  return pathname.startsWith('/health/') || pathname.startsWith('/v1/health/');
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
export function bootstrapTracing(
  defaultServiceName: string,
  options: TracingOptions = {},
): NodeSDK {
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
    // createSampler() explicitly overrides remoteParentNotSampled/localParentNotSampled
    // (2026-08-05, M17-S34 follow-up — real staging finding): without these,
    // ParentBasedSampler's own defaults blindly trust an inherited "not sampled" parent
    // decision, regardless of `ratio` — a span with ANY parent context (even one this process
    // never actually verified) skips the root sampler entirely and is silently never recorded.
    // Measured impact: ~75-89% of real traces never reached Cloud Trace, consistently, across
    // every collector-side/CPU/timeout config tried — because the spans were never being
    // recorded in the first place, long before export was ever attempted. Verified via live A/B
    // on real staging traffic: 0/40 traces missing after this change, vs. the ~75-89% baseline
    // before it — see docs/ENGINEERING_RULES.md § Cloud Run CPU throttling for the full
    // investigation and why this was so hard to find (every collector/CPU/timeout fix was
    // chasing a red herring).
    sampler: createSampler(samplingRate),
    // Security review follow-up (2026-07-21): a user-provided `url` always wins over the
    // exporter's own environment-derived config (verified against
    // @opentelemetry/otlp-exporter-base's merge precedence) — so explicitly passing `url` here
    // unconditionally would silently ignore OTEL_EXPORTER_OTLP_TRACES_ENDPOINT (the
    // signal-specific var, used as-is) and bypass the exporter's own trailing-slash-safe
    // handling of OTEL_EXPORTER_OTLP_ENDPOINT (auto-appends `v1/traces`). Only fall back to our
    // own hardcoded default when neither var is set, so both standard vars work exactly per
    // OTel's spec in every other case.
    //
    // spanProcessors (not `traceExporter`, which NodeSDK would otherwise silently wrap in its
    // own default BatchSpanProcessor) — real M17-S34 staging finding, 2026-08-05: every real
    // business-request trace and every low-volume cron-triggered trace was missing from Cloud
    // Trace, while only the small fraction of health-check traces from instances that stayed
    // warm long enough made it through. A local repro with an immediate SIGTERM right after one
    // span *did* correctly flush a buffered BatchSpanProcessor span (sdk.shutdown() keeps
    // Node's event loop alive until the flush completes) — so the mechanism isn't simply "5s
    // window vs. instance teardown". The live service has
    // `run.googleapis.com/cpu-throttling: "true"` (Cloud Run only allocates CPU while a request
    // is actively being handled), which a local repro can't reproduce: BatchSpanProcessor's
    // flush is timer-scheduled, and a timer tick that lands in a CPU-throttled gap simply never
    // runs, no matter how much wall-clock time passes. SimpleSpanProcessor's export is
    // triggered synchronously from span.end(), inline within request-handling code — guaranteed
    // to run during a CPU-allocated window, unlike a timer for some seconds later.
    //
    // Tradeoff, acknowledged explicitly (cross-tool review, PR #323): one export call per ended
    // span (not batched) means a single business request producing several child spans (HTTP +
    // DB + outbound calls) makes that many separate OTLP calls, all concurrently, instead of one
    // batched call. Accepted for now: the collector is a sidecar (loopback, not a real network
    // hop), its own memory_limiter processor is the real backstop against overload, and Cloud
    // Run's per-instance concurrency cap (80) bounds the worst case. Revisit if real traffic
    // volume ever makes the extra per-span overhead measurable — batching's benefit only
    // applies at a volume this deployment doesn't have today.
    spanProcessors: [
      new SimpleSpanProcessor(
        new OTLPTraceExporter(
          process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ||
            process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT']
            ? {}
            : { url: 'http://localhost:4318/v1/traces' },
        ),
      ),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          // TD28: /pubsub/push used to be excluded here alongside /health/* as noise — but that
          // threw away exactly the span this TD wants a genuine trace-linked child of. Every
          // push delivery now gets a real span like any other HTTP endpoint; prod sampling stays
          // at the existing 10% (D12), bounding volume growth.
          //
          // isHealthCheckPath (fixed 2026-08-05, M17-S34 follow-up) — see its own doc comment
          // above for the two real bugs this replaced. Confirmed via Cloud Trace before the fix:
          // 5 of the only 7 real traces in the whole project were BFF's own GET /v1/health/live
          // probes, none were real business requests — the opposite of this hook's purpose.
          ignoreIncomingRequestHook: (req) => isHealthCheckPath(req.url),
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
  // collector still degrades gracefully on its own: SimpleSpanProcessor's per-span export call
  // fails and is dropped async, never blocking or crashing the request it belongs to — diag.setLogger
  // above just makes that failure visible instead of silent.
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

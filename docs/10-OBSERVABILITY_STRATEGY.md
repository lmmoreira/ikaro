# Observability Strategy - Ikaro

> ⚠️ **Partially superseded by `plan/M17-CLOUD-DEPLOY.md` D9 (2026-07-07), corrected 2026-08-04, 2026-08-05.** The `## Deployment`, `## Local Development Setup`, `## Prometheus Metrics`, `## Loki Label Strategy`, `## Grafana Dashboards`, `## Alerting Rules (Email)`, and `## SLOs (Service Level Objectives)` sections below describe the original self-hosted GCE VM + Docker Compose stack (Prometheus/Grafana/Loki) — cut in favor of D9's "OTel SDK (OTLP-only) → collector sidecar → GCP managed backends (Cloud Trace, Cloud Monitoring, Cloud Logging)." That self-hosted stack remains a valid *future* option (swap the collector's exporter config — see M17 D9) but is **not** what's deployed today, and several of its supporting files (`docker/docker-compose.observability.yml`, `infrastructure/observability/`) don't exist in this repo. Dashboards/alerts-as-code via Cloud Monitoring is **M17-S35, not yet implemented** — until it lands there is no dashboard or alerting layer in this repo at all; sections describing Grafana dashboards/alerts below are historical reference, not a currently-usable feature. `## NestJS OTel Implementation` (below) **is** current and accurate — that's the real, implemented mechanism (M17-S33 SDK bootstrap, M17-S34 collector sidecar).

## Overview

Observability answers three questions: **is the system healthy?** (metrics), **why did this request fail?** (traces), and **what exactly happened?** (logs). All three must include `tenant_id` so issues can be isolated per car wash company.

**Stack (as originally planned, see the superseded-sections banner above for what's actually deployed today):** Prometheus → metrics · Loki → logs · OTel Collector → telemetry pipeline · Grafana → dashboards + alerts. **Actually deployed (M17-S33/S34):** OTel SDK (traces only) → collector sidecar → Cloud Trace + Cloud Logging. No metrics or dashboard/alerting layer exists yet (M17-S35, not implemented).

---

## Deployment

> **Superseded — see the file-level banner above.** The table below (GCE VM + Docker Compose, `deploy-observability.yml`) was never actually built (that workflow file doesn't exist) and is not the real deployment. **What's actually deployed:** backend + BFF run OTel SDK (M17-S33) exporting OTLP to an `otel-collector` Cloud Run sidecar (M17-S34, `infra/docker/otel-collector/`), which exports traces to Cloud Trace directly — see `plan/M17-CLOUD-DEPLOY.md` M17-S33/S34 for the real, implemented deployment.

| Environment | Hosting | How |
|---|---|---|
| **Production** | GCE e2-small VM + Docker Compose | Deployed by `deploy-observability.yml` CI pipeline (see `docs/09-CI_CD_PIPELINE.md`) |
| **Staging** | Same GCE VM, separate Grafana organisation | Scraped from staging Cloud Run services |
| **Local dev** | Docker Compose (optional) | `pnpm obs:up` — runs full stack on localhost |

---

## Local Development Setup

> **Superseded/broken — see the file-level banner above.** `docker/docker-compose.observability.yml` (referenced by `pnpm obs:up` below) does not exist in this repo; the script is dead (removed 2026-08-04). **To see real traces locally today:** run a local `otel-collector` container directly against `infra/docker/otel-collector/config.yaml` (swap the `googlecloud` exporter for `debug` — no GCP credentials needed locally), then set `OTEL_SDK_DISABLED=false` when starting the app. There is currently no local metrics/logs stack (Prometheus/Loki) — see `## NestJS OTel Implementation` below for the real (traces-only) local verification path.

The observability stack is **optional** locally. Run it when you want to see real metrics, traces, or logs during development. Normal development (writing/testing code) does not require it.

### Start / Stop

```bash
# Start the observability stack (Prometheus + Grafana + Loki + OTel Collector)
pnpm obs:up

# Stop it
pnpm obs:down

# View logs from the stack
pnpm obs:logs

# Reload Prometheus config without restarting
pnpm obs:reload-prometheus
```

These scripts wrap `docker-compose -f docker/docker-compose.observability.yml`.

### Local URLs

| Service | URL | Credentials |
|---|---|---|
| Grafana | http://localhost:3010 | admin / admin |
| Prometheus | http://localhost:9090 | — |
| Loki | http://localhost:3100 | — |
| OTel Collector (gRPC) | localhost:4317 | — |
| OTel Collector (HTTP) | http://localhost:4318 | — |

### Local Docker Compose

**File:** `docker/docker-compose.observability.yml`

```yaml
version: '3.9'

services:
  prometheus:
    image: prom/prometheus:v2.51.0
    container_name: ikaro-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ../infrastructure/observability/prometheus/prometheus.local.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-local-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=7d'
      - '--web.enable-lifecycle'
    networks: [observability]

  grafana:
    image: grafana/grafana:10.4.0
    container_name: ikaro-grafana
    ports:
      - "3010:3000"
    volumes:
      - ../infrastructure/observability/grafana/grafana.ini:/etc/grafana/grafana.ini:ro
      - ../infrastructure/observability/grafana/provisioning:/etc/grafana/provisioning:ro
      - grafana-local-data:/var/lib/grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_AUTH_ANONYMOUS_ENABLED: "true"
      GF_AUTH_ANONYMOUS_ORG_ROLE: Viewer
    networks: [observability]

  loki:
    image: grafana/loki:2.9.0
    container_name: ikaro-loki
    ports:
      - "3100:3100"
    volumes:
      - ../infrastructure/observability/loki/loki.yml:/etc/loki/loki.yml:ro
      - loki-local-data:/loki
    command: -config.file=/etc/loki/loki.yml
    networks: [observability]

  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.98.0
    container_name: ikaro-otel
    ports:
      - "4317:4317"    # gRPC receiver
      - "4318:4318"    # HTTP receiver
      - "8888:8888"    # self-monitoring metrics
    volumes:
      - ../infrastructure/observability/otel/otel-collector.local.yml:/etc/otelcol-contrib/config.yml:ro
    command: --config=/etc/otelcol-contrib/config.yml
    networks: [observability]

volumes:
  prometheus-local-data:
  grafana-local-data:
  loki-local-data:

networks:
  observability:
    driver: bridge
```

> The main `docker/docker-compose.yml` (database + Pub/Sub emulator) runs separately. You can run both at the same time — they use different networks and port ranges.

### Local vs Production Prometheus config

`prometheus.local.yml` scrapes `host.docker.internal` (the developer's machine running NestJS locally):

```yaml
# infrastructure/observability/prometheus/prometheus.local.yml
global:
  scrape_interval: 5s   # faster feedback locally

scrape_configs:
  - job_name: 'ikaro-backend-local'
    static_configs:
      - targets: ['host.docker.internal:3001']   # backend dev server
    metrics_path: /metrics

  - job_name: 'ikaro-bff-local'
    static_configs:
      - targets: ['host.docker.internal:3002']   # BFF dev server
    metrics_path: /metrics

  - job_name: 'otel-collector'
    static_configs:
      - targets: ['otel-collector:8888']
```

---

## NestJS OTel Implementation

**Scope (M17-S33): traces only, OTLP-HTTP only.** No metrics pipeline in code — Cloud Run's built-in metrics cover that per D9 (`plan/M17-CLOUD-DEPLOY.md`); the only vendor coupling anywhere in this pipeline is the collector's exporter config (M17-S34), never app code.

### Package Installation

```bash
# Every @opentelemetry/* package — SDK, exporter, instrumentations, and the api package itself
# — lives only in @ikaro/observability. Neither app declares any @opentelemetry/* dependency
# directly, and a no-restricted-imports ESLint rule in both apps' eslint.config.js enforces this
# as a durable rule, not just current-state compliance: app code (correlation.middleware.ts,
# request.interceptor.ts, ...) depends on ITracingPort/defaultTracingPort (or
# bootstrapTracing for a tracing.ts entrypoint) — never trace.getActiveSpan() directly. This
# mirrors LogVendorFormatter/BaseAppLogger's existing split for logging, and means a future
# tracer-SDK swap touches one adapter class, not every call site.
pnpm --filter @ikaro/observability add \
  @opentelemetry/api \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/sdk-trace-base
```

### Tracing Bootstrap File

The actual SDK/sampler/exporter/instrumentation wiring lives in **one shared place** —
`packages/observability/src/otel-tracing.ts`'s `bootstrapTracing()` — not duplicated per app.
Two nearly-identical `tracing.ts` files were the original shape and got flagged by SonarCloud as
new-code duplication; each app's `src/tracing.ts` is now a thin wrapper, **required before
anything else** (before NestJS initialises, before any module is imported). Neither file
references anything OTel-specific by name or shape — `bootstrapTracing`'s own name says nothing
about which tracer is behind it, and its second argument is a small vendor-neutral
`TracingOptions` object (`{ postgres?: boolean }`), not a raw OTel instrumentation config map.
A full tracer-SDK swap (e.g. a vendor contract requiring their own proprietary SDK instead of
OTLP ingestion) is confined entirely to this one file — neither `tracing.ts` needs to change:

```typescript
// apps/backend/src/tracing.ts
import { bootstrapTracing } from '@ikaro/observability';

bootstrapTracing('ikaro-backend', { postgres: true });
```

```typescript
// apps/bff/src/tracing.ts
import { bootstrapTracing } from '@ikaro/observability';

bootstrapTracing('ikaro-bff');
```

`bootstrapTracing()` itself:

```typescript
// packages/observability/src/otel-tracing.ts
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from '@opentelemetry/semantic-conventions';
import { ParentBasedSampler, TraceIdRatioBasedSampler, SimpleSpanProcessor, type Sampler } from '@opentelemetry/sdk-trace-base';
import { redactSensitiveQueryParams, SENSITIVE_QUERY_PARAMS } from './otel-query-redaction';

export interface TracingOptions {
  /** Enables Postgres client instrumentation (backend only — BFF has no DB). */
  postgres?: boolean;
}

// Health-check paths to exclude from tracing — shared across backend (no global prefix,
// e.g. `/health/live`) and BFF (global `v1` prefix, e.g. `/v1/health/live`). Exported and
// unit-tested directly — this check has already had two real bugs: `.startsWith('/health/')`
// silently never matched BFF's prefixed path (caught only via a real staging deploy, M17-S34
// follow-up, 2026-08-05), and a follow-up `.includes('/health/')` matched the substring
// anywhere in the full URL, including query-string *values* on unrelated real routes. Checks
// the parsed pathname only, against the two known real prefixes.
export function isHealthCheckPath(url: string | undefined): boolean {
  if (!url) return false;
  const pathname = url.split('?')[0] ?? '';
  return pathname.startsWith('/health/') || pathname.startsWith('/v1/health/');
}

// Extracted + unit-tested directly (2026-08-05, M17-S34 follow-up) — remoteParentNotSampled/
// localParentNotSampled explicitly override OTel's own AlwaysOff default for those two slots,
// which blindly trusted an inherited "not sampled" parent regardless of `ratio`. This was the
// actual root cause of ~75-89% of real traces never being recorded — see
// docs/ENGINEERING_RULES.md § Cloud Run CPU throttling for the full incident.
export function createSampler(ratio: number): Sampler {
  return new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(ratio),
    remoteParentNotSampled: new TraceIdRatioBasedSampler(ratio),
    localParentNotSampled: new TraceIdRatioBasedSampler(ratio),
  });
}

export function bootstrapTracing(
  defaultServiceName: string,
  options: TracingOptions = {},
): NodeSDK {
  // Silent by default — without this, an unreachable collector or an export failure produces
  // no signal at all. WARN keeps it to genuine problems, not per-export chatter.
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

  // OTEL_TRACES_SAMPLER_ARG is read directly, set per-environment by Cloud Run (staging 1.0,
  // prod 0.1) — never branch on NODE_ENV (both cloud envs build with NODE_ENV=production, so
  // it can't distinguish staging from prod — see CLAUDE.md §2 Security Model) or APP_ENV
  // (would add a second source of truth for a value Cloud Run already sets directly).
  const samplingRate = Number(process.env.OTEL_TRACES_SAMPLER_ARG ?? 1.0);

  const sdk = new NodeSDK({
    // @opentelemetry/resources v2.x replaced the `Resource` class with this factory function —
    // `new Resource(...)` no longer exists.
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME ?? defaultServiceName,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.APP_ENV ?? 'local',
    }),
    // remoteParentNotSampled/localParentNotSampled explicitly overridden (2026-08-05, M17-S34
    // follow-up — real staging finding): OTel's own ParentBasedSampler defaults for these two
    // slots are AlwaysOff, blindly trusting an inherited "not sampled" parent regardless of
    // `ratio` — this was the actual root cause of ~75-89% of real traces never being recorded in
    // the first place (a sampling bug, not a CPU/export bug — see docs/ENGINEERING_RULES.md §
    // Cloud Run CPU throttling for the full incident). remoteParentSampled/localParentSampled
    // are deliberately left at their AlwaysOn default, so a genuinely-sampled parent is still
    // respected. Extracted as createSampler() and unit-tested directly in otel-tracing.spec.ts.
    sampler: createSampler(samplingRate),
    // metricReaders: [] (M17-S34 follow-up, 2026-08-05 — real staging finding): this bootstrap
    // is traces-only by design, but NodeSDK has its own independent metrics default —
    // @opentelemetry/sdk-node falls back to a default OTLP PeriodicExportingMetricReader
    // whenever OTEL_METRICS_EXPORTER isn't "none" and no metricReaders/metricReader is passed.
    // The collector's config.yaml has no `metrics:` pipeline (traces-only, deliberately), so
    // every periodic export attempt hit a genuine 404 (OTLPExporterError: Not Found), logged as
    // an ERROR every cycle, forever, in both services/envs. An explicit empty array is a
    // deterministic code-level fix, not an env var to remember per Cloud Run env — see M17-S35's
    // notes in plan/M17-CLOUD-DEPLOY.md for why that story doesn't need this reader re-enabled.
    metricReaders: [],
    // spanProcessors, NOT `traceExporter` (M17-S34 follow-up, 2026-08-05 — real staging
    // finding): passing `traceExporter` directly lets NodeSDK silently wrap it in its own
    // default BatchSpanProcessor (timer/size-flushed). The live service has
    // `run.googleapis.com/cpu-throttling: "true"` — Cloud Run only allocates CPU while a
    // request is actively being handled — so a timer-scheduled flush landing in a
    // CPU-throttled gap simply never runs; every real business-request and cron-triggered
    // trace was missing from Cloud Trace as a result. SimpleSpanProcessor exports each span
    // synchronously from span.end(), inline within request-handling code that's guaranteed to
    // have CPU. Tradeoff, accepted: one export call per span instead of batched — fine at this
    // traffic volume, with the collector sidecar on loopback and its own memory_limiter as the
    // real overload backstop.
    spanProcessors: [
      new SimpleSpanProcessor(
        new OTLPTraceExporter({
          // A user-provided `url` always wins over the exporter's own environment-derived
          // config (verified against @opentelemetry/otlp-exporter-base's merge precedence,
          // security review follow-up 2026-07-21) — so only pass `url` as a last-resort
          // default when neither OTEL_EXPORTER_OTLP_ENDPOINT nor the signal-specific
          // OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is set.
          ...(process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
            ? {}
            : { url: 'http://localhost:4318/v1/traces' }),
          // concurrencyLimit (2026-08-05, M17-S34 follow-up — found immediately after fixing the
          // ParentBasedSampler bug): default is 30 in-flight exports; once exceeded, new exports
          // are rejected outright ("Concurrent export limit reached"), never retried. Essentially
          // never hit before the sampler fix (most spans were silently dropped pre-export); once
          // fixed, real bursts (20-30 child spans per request, 80 concurrent requests per
          // instance) routinely exceeded 30 — 598 rejections in ~80 minutes measured on staging.
          // 200 gives headroom above the 80-request cap; self-limiting via each export's own
          // timeoutMillis (10s default) regardless.
          concurrencyLimit: 200,
        }),
      ),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },   // too noisy
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          // TD28: /pubsub/push used to be excluded here too, alongside /health/* — that threw
          // away exactly the span needed to link a Pub/Sub-delivered event's consumer-side
          // processing back to the original request's trace. Every push delivery now gets a
          // real span like any other HTTP endpoint.
          ignoreIncomingRequestHook: (req) => isHealthCheckPath(req.url),
          // SECURITY (added post-review, 2026-07-21): covers OUTGOING (client) spans — the
          // instrumentation redacts these query params itself for url.full/http.url. This
          // option *replaces* the instrumentation's own defaults rather than extending them,
          // so SENSITIVE_QUERY_PARAMS restates them (see otel-query-redaction.ts).
          redactedQueryParams: Array.from(SENSITIVE_QUERY_PARAMS),
          // SECURITY: covers INCOMING (server) spans — redactedQueryParams above does NOT
          // apply to these; the instrumentation sets url.query/http.target from the raw
          // request URL with zero redaction on the incoming path. Without this, the BFF's
          // /auth/google/callback route (a redeemable OAuth `code` + signed `state` as query
          // params) would ship both to the collector/trace backend verbatim. Overwriting the
          // attributes here works because requestHook runs after span creation but before
          // export.
          requestHook: (span, request) => {
            const pathAndQuery = 'url' in request ? request.url : undefined;
            if (!pathAndQuery) return;
            const redacted = redactSensitiveQueryParams(pathAndQuery);
            const queryIndex = redacted.indexOf('?');
            if (queryIndex !== -1) span.setAttribute('url.query', redacted.slice(queryIndex + 1));
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

  if (!isOtelSdkDisabled(process.env)) {
    sdk.start();
  }

  process.on('SIGTERM', () => {
    sdk.shutdown().catch((err: unknown) => {
      diag.error('[otel] sdk.shutdown() failed — buffered spans may not have flushed', err);
    });
  });

  return sdk;
}
```

**The same CPU-throttling timer-starvation bug this comment describes was found a second time, one hop downstream, in the collector sidecar itself (2026-08-05).** `infra/docker/otel-collector/config.yaml`'s traces pipeline still had a `batch` processor (5s timer) and the `googlecloud` exporter's default async `sending_queue` — both share the exact same vulnerability as the `BatchSpanProcessor` fixed above, just running in a second container on the same CPU-throttled instance. Fixed by removing `batch` and setting `sending_queue: enabled: false` plus an explicit `timeout: 2s` (fail fast rather than block on an unbounded downstream outage), forcing every export to complete synchronously inside the OTLP receive call. **This fix is real and worth keeping, but a live follow-up investigation the same day found it was never the dominant cause of production trace loss — the real root cause was a sampling bug (`ParentBasedSampler` blindly trusting an inherited "not sampled" parent decision, fixed via `createSampler()`'s explicit `remoteParentNotSampled`/`localParentNotSampled` overrides above), completely unrelated to CPU throttling or the collector.** Full incident — both bugs, the always-allocated-CPU alternative with real cost numbers, the diagnostic sequence that told them apart, and the verified no-user-facing-latency finding: `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling — timer/async work can be silently starved (sidecars included).

**Disabled by default locally, enabled by default in staging/production** (`otel-sdk-disabled.ts`) — keyed on `APP_ENV`, not a flat default. Staging/prod always have the collector sidecar present (M17-S34), so tracing should be on there with nothing to remember to flip; local dev (and CI, which never sets `APP_ENV` either — both fall through to the schema default `'local'`) has no collector unless a dev opts into `pnpm obs`, so attempting to start there just produces failed-export WARN noise once `diag.setLogger` was added. `OTEL_SDK_DISABLED`, when explicitly set to `"true"`/`"false"`, always overrides the default either direction — e.g. set it to `"false"` locally to test against a real local collector. When enabled, a genuinely unreachable collector still degrades gracefully on its own: `SimpleSpanProcessor`'s per-span export call fails and is dropped async, never blocking or crashing the request it belongs to — `diag.setLogger` above just makes that failure visible instead of silent.

**Query-string redaction is mandatory, not optional.** Any route that receives a secret as a query param (OAuth `code`/`state`, a signed link, a password-reset token) will otherwise have that secret captured verbatim in trace span attributes and shipped to the collector/trace backend, readable by anyone with telemetry access and retained for as long as traces are retained — far longer than the secret's own validity window. `SENSITIVE_QUERY_PARAMS` in `otel-query-redaction.ts` is a block-list; when adding a new route with a sensitive query param, add its param name there rather than assuming redaction is automatic.

### Loading the Bootstrap File

```json
// apps/backend/package.json (apps/bff/package.json mirrors this)
{
  "scripts": {
    "start": "node -r ./dist/tracing.js dist/main.js",
    "dev": "ts-node --swc -r tsconfig-paths/register -r ./src/tracing.ts src/main.ts"
  }
}
```

Because `-r` preloads `tracing.ts` *before* `main.ts` runs, it also runs before NestJS's `ConfigModule` has loaded `.env` — so each app's `tracing.ts` calls `dotenv`'s `config()` itself first (same pattern as `data-source.ts`/`seed.ts`), otherwise `OTEL_EXPORTER_OTLP_ENDPOINT`/`SERVICE_NAME`/`OTEL_SDK_DISABLED` from `.env` are invisible to it in local dev (security review follow-up, 2026-07-21). Corrected (2026-08-04, M17-S34 follow-up): staging/production are unaffected, but *not* because Cloud Run sets these directly as container env vars — Terraform sets none of the three. Each has its own fallback that happens to already be correct in Cloud Run: `OTEL_EXPORTER_OTLP_ENDPOINT` falls back to the hardcoded `http://localhost:4318/v1/traces` (correct — the collector sidecar, M17-S34, shares the instance's network namespace), `SERVICE_NAME` falls back to the literal passed into `bootstrapTracing()`, and `OTEL_SDK_DISABLED` falls back to an `APP_ENV` check (`APP_ENV` *is* Terraform-set, unlike the other two).

**Critical prerequisite this section doesn't mention on its own (found only via a real staging deploy, 2026-08-04):** the preload flag above (`-r ./dist/tracing.js`) must actually be part of the **Docker image's runtime `CMD`**, not just `package.json`'s `"start"` script — a plain `CMD ["node", "dist/main.js"]` silently skips tracing entirely, with no error anywhere (the SDK just never starts). Both `apps/backend/Dockerfile` and `apps/bff/Dockerfile` must use `CMD ["node", "-r", "./dist/tracing.js", "dist/main.js"]`. This is exactly what happened in this repo from M17-S33 until it was caught and fixed as an M17-S34 follow-up: tracing had never actually run in any real deployment, because there was no collector sidecar to reveal the silent gap until M17-S34 added one.

Environment variables (Cloud Run `--set-env-vars`, injected per environment by Terraform; `.env` locally):

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318   # the collector sidecar (M17-S34) — unset/disabled locally unless the `pnpm obs` profile is used
OTEL_TRACES_SAMPLER_ARG=1.0                          # staging
OTEL_TRACES_SAMPLER_ARG=0.1                          # production
SERVICE_NAME=ikaro-backend                           # or ikaro-bff
OTEL_SDK_DISABLED=true                               # unit tests / CI only
```

### Manual Span Creation — deferred

Auto-instrumentation (HTTP + `pg` + outbound calls) covers the request lifecycle without any hand-written spans. Manual business spans (wrapping individual use-case logic in a named span) are **explicitly deferred** until debugging actually demands that level of granularity — not built speculatively alongside the SDK bootstrap. Revisit this section, and the `<context>.<operation>` naming convention below, only when a concrete need arises.

---

## Span Naming Convention

```
<context>.<operation>
```

All lowercase, dot-separated, no spaces.

| Pattern | Examples |
|---|---|
| `<context>.<useCaseName>` | `booking.approveBooking`, `loyalty.recordCompletion` |
| `<context>.db.<operation>` | `booking.db.findByTenant`, `loyalty.db.insert` |
| `<context>.event.<eventName>` | `booking.event.BookingCompleted` |
| `notification.email.<templateName>` | `notification.email.BookingApproved` |

---

## Log Format Specification

Every log line is a single JSON object written to `stdout`. The Logger service in `src/shared/observability/logger.ts` enforces this schema — never use `console.log` directly.

### Mandatory fields on every log line

```json
{
  "timestamp":     "2026-05-12T14:23:45.123Z",
  "level":         "INFO",
  "service":       "ikaro-backend",
  "context":       "booking",
  "tenantId":      "uuid-or-null",
  "userId":        "uuid-or-null",
  "correlationId": "uuid",
  "traceId":       "hex-string-or-null",
  "spanId":        "hex-string-or-null",
  "message":       "Booking approved"
}
```

Additional fields are allowed (e.g. `bookingId`, `status`, `durationMs`) — they appear after the mandatory fields.

### Log Levels

| Level | Use for | Example |
|---|---|---|
| `ERROR` | Unhandled exceptions, infrastructure failures (DB down, Pub/Sub unreachable) | `Database connection lost` |
| `WARN` | Degraded operation: retry attempt, circuit breaker open, unexpected state that doesn't fail the request | `Email send failed — retry 2/3` |
| `INFO` | Significant business lifecycle events | `Booking approved`, `LoyaltyEntry created` |
| `DEBUG` | Internal state useful for debugging (disabled in production, enabled locally) | `Slot availability calculated: 4 slots free` |

> **Not a WARN:** a customer trying to cancel outside the window, a guest submitting an invalid email — these are normal business flows. Log them as `INFO` with the outcome.

**Gauge vs. event — decide which one a log line is before deciding whether to make it conditional (TD24-S05).** For a scheduled/cron-driven service reporting a numeric signal, ask which shape it is:
- **Gauge** (a value that's meaningful at every sample, including zero — e.g. "how many unpublished rows are waiting right now," "current queue depth"): log it **unconditionally, every tick**, even when the value is 0. A gauge with gaps whenever things are healthy can't be told apart from "the sweep silently stopped running." `OutboxRelayService`'s unpublished-backlog log follows this — see `td/TD24-OUTBOX-INBOX-PATTERN.md` S05.
- **Event/counter** (something either happened or didn't — e.g. "N rows were garbage-collected," "M publishes failed this tick"): log it **only when non-zero**. Suppressing the zero case here loses nothing, since "nothing happened" isn't itself a signal worth a log line every tick.

Don't default to "make it conditional to reduce noise" without first classifying which of the two a given signal actually is — for a gauge, that default is wrong.

### Logger Service

```typescript
// src/shared/observability/logger.service.ts
import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { trace, context } from '@opentelemetry/api';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
  private ctx: Record<string, unknown> = {};

  withContext(ctx: Record<string, unknown>): this {
    this.ctx = { ...this.ctx, ...ctx };
    return this;
  }

  private write(level: string, message: string, extra?: Record<string, unknown>): void {
    const span = trace.getActiveSpan();
    const spanContext = span?.spanContext();

    process.stdout.write(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: process.env.SERVICE_NAME ?? 'ikaro-backend',
      ...this.ctx,
      traceId: spanContext?.traceId ?? null,
      spanId: spanContext?.spanId ?? null,
      message,
      ...extra,
    }) + '\n');
  }

  log(message: string, extra?: Record<string, unknown>): void {
    this.write('INFO', message, extra);
  }

  error(message: string, extra?: Record<string, unknown>): void {
    this.write('ERROR', message, extra);
  }

  warn(message: string, extra?: Record<string, unknown>): void {
    this.write('WARN', message, extra);
  }

  debug(message: string, extra?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== 'production') {
      this.write('DEBUG', message, extra);
    }
  }
}
```

**Usage in a use case:**
```typescript
constructor(private logger: AppLogger) {
  this.logger.withContext({ context: 'booking' });
}

async execute(command: ApproveBookingCommand) {
  this.logger.log('Approving booking', {
    tenantId: command.tenantId,
    bookingId: command.bookingId,
  });
}
```

---

## Correlation ID Propagation

The `correlationId` is a UUID that links an HTTP request to every log, trace, and domain event produced during its processing.

### Flow

```
Browser/Client
    │  X-Correlation-ID: uuid  (optional — client may generate)
    ▼
BFF
    │  Generates correlationId if header absent (UUID v7)
    │  Attaches to request context
    │  Forwards X-Correlation-ID to Backend calls
    ▼
Backend (RequestInterceptor + CorrelationInterceptor)
    │  Extracts from header → injects into NestJS request scope
    │  Logger.withContext({ correlationId })
    │  Domain events: { ...envelope, correlationId }
    ▼
Event Bus (Pub/Sub)
    │  message.attributes: { correlationId, tenantId }
    ▼
Event Consumer
    │  Extracts correlationId from message attributes
    │  Logger.withContext({ correlationId })
    │  Child events inherit same correlationId
```

### Interceptor

```typescript
// src/shared/observability/correlation.interceptor.ts
import { v7 as uuidv7 } from 'uuid';

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const correlationId = req.headers['x-correlation-id'] ?? uuidv7();
    req.correlationId = correlationId;
    // propagate in response header for client-side debugging
    ctx.switchToHttp().getResponse().setHeader('x-correlation-id', correlationId);
    return next.handle();
  }
}
```

---

## Trace Propagation Through Pub/Sub (TD28)

BFF↔backend HTTP calls link into one continuous trace automatically — both ends are OTel
auto-instrumented, and W3C trace context (`traceparent`) travels as a standard HTTP header. That
continuity does **not** extend through Pub/Sub on its own: push delivery POSTs a JSON body, and
`traceparent` has nowhere to travel except inside `message.attributes` — generic HTTP
instrumentation only auto-extracts context from incoming *headers*, so it can't see anything
placed in a Pub/Sub message attribute. This is wired up manually, covering **both** dispatch
paths (inline, right after commit, and the scheduled outbox sweep) with the *same* originating
request's trace — not the sweep's own trace.

**Capture point — `OutboxPublisher.publish()`** (`shared/infrastructure/outbox/outbox-publisher.ts`):
every event passes through this one method before entering `shared.outbox`, whether drained from
an aggregate (`drainDomainEvents()`) or published directly by a cron job/consumer re-emit. It
calls `ITracingPort.injectContext(carrier)` and sets the result on `Envelope.traceContext` —
captured once, at the moment the event enters the outbox (i.e. still inside the original request),
never re-derived later at actual-publish time. `shared.outbox.payload` is `jsonb` storing the
whole envelope verbatim, so `traceContext` rides along with zero schema change.

**Publish side — `GcpPubSubEventBusAdapter.publish()`:** copies `event.traceContext` straight into
`message.attributes` — no OTel API call needed here at all, since the carrier was already
serialized at capture time.

**Receive side — both consumer modes, symmetrically:**
- **Push (`PubSubPushController`):** after OIDC validation, calls
  `ITracingPort.runWithExtractedContext(message.attributes, () => dispatchPushMessage(...))`.
- **Pull (`GcpPubSubEventBusAdapter.dispatch()`, the streaming-pull message handler):** the same
  `runWithExtractedContext(message.attributes, ...)` call, since the pull-mode `Message` object
  carries `.attributes` in the identical shape.

Both reconstruct the original trace context, then wrap the domain-event handler call in an
explicit `pubsub.event.<eventName>` span via `ITracingPort.startActiveSpan(...)` — without this,
nothing marks "this is where the Pub/Sub consumer's processing began"; only whatever
auto-instrumented I/O the handler happens to trigger would otherwise show up, with no span
identifying the hop itself. Scoped to the domain-event path only, never the trigger/cron path
(`dispatchTrigger()`) — cron triggers carry no real per-tenant business context (D3) and stay out
of this TD's scope.

**A pre-existing, unrelated gap blocked all of this in the deployed pipeline until fixed
alongside this TD:** `RequestInterceptor`'s global tenant-header check (`apps/backend/src/shared/
request/request.interceptor.ts`) 400s any request without `X-Tenant-ID`, and its bypass list
(mirroring `/health`, `/internal`, `/cron`) didn't include `/pubsub` — so a real Pub/Sub push
request, which never sends that header, never reached `PubSubPushController` at all. Fixed by
adding `/pubsub` to the bypass list.

`ITracingPort` (`packages/observability`) carries all of this via three methods, keeping
OTel-specific calls (`propagation.inject`/`propagation.extract`/`context.with`/`tracer.
startActiveSpan`) confined to `OtelTracingAdapter`, same as every other tracing-port method:

```typescript
injectContext(carrier: Record<string, string>): void;
runWithExtractedContext<T>(carrier: Record<string, string>, fn: () => T): T;
startActiveSpan<T>(name: string, fn: () => T): T;
```

**Scope:** both dispatch paths (inline + swept) on the publish side, and both consumer modes
(push + pull) on the receive side, are fully covered — this is not limited to the inline/fast
path or to push-only delivery.

---

## Prometheus Metrics

> **Superseded/never built — see the file-level banner above.** Neither `src/shared/observability/metrics.ts` nor `metrics.controller.ts` exists in `apps/backend` or `apps/bff` (verified 2026-08-04), and `prom-client` is not a dependency of either app. This section describes the original M14 plan; it was never implemented, and M17-S35 (Cloud Monitoring dashboards/alerts, not yet built) will use **log-based metrics** derived from structured log fields already emitted (see `docs/ENGINEERING_RULES.md` § gauge vs. event logging), not a custom `/metrics` Prometheus-scrape endpoint. Treat the catalog and code below as a historical design sketch, not a currently-usable API.

### Naming Convention

```
ikaro_<noun>_<verb>_<unit>
```

All custom metrics are prefixed `ikaro_`. Labels use snake_case.

### Metric Catalog

```typescript
// src/shared/observability/metrics.ts
import { Counter, Histogram, register } from 'prom-client';

// ── HTTP (auto-instrumented by OTel, no custom code needed) ──────────────────
// http_requests_total{method, route, status_code}
// http_request_duration_seconds{method, route, status_code}

// ── Business metrics ─────────────────────────────────────────────────────────
export const bookingsCreated = new Counter({
  name: 'ikaro_bookings_created_total',
  help: 'Number of booking requests created',
  labelNames: ['tenant_id', 'booking_type'],   // booking_type: GUEST | CUSTOMER
});

export const bookingStatusTransitions = new Counter({
  name: 'ikaro_booking_transitions_total',
  help: 'Number of booking state transitions',
  labelNames: ['tenant_id', 'from_status', 'to_status'],
});

export const loyaltyEntriesCreated = new Counter({
  name: 'ikaro_loyalty_entries_created_total',
  help: 'Number of loyalty entries inserted',
  labelNames: ['tenant_id'],
});

export const emailsSent = new Counter({
  name: 'ikaro_emails_sent_total',
  help: 'Number of emails sent',
  labelNames: ['tenant_id', 'template_name', 'status'],  // status: SENT | FAILED
});

export const eventBusPublished = new Counter({
  name: 'ikaro_event_bus_published_total',
  help: 'Number of domain events published',
  labelNames: ['event_name', 'tenant_id'],
});

export const eventBusConsumed = new Counter({
  name: 'ikaro_event_bus_consumed_total',
  help: 'Number of domain events consumed',
  labelNames: ['event_name', 'consumer', 'status'],  // status: SUCCESS | FAILED
});

export const loyaltySyncDuration = new Histogram({
  name: 'ikaro_loyalty_sync_duration_seconds',
  help: 'Time between BookingCompleted event and LoyaltyEntry insert',
  labelNames: ['tenant_id'],
  buckets: [0.1, 0.5, 1, 5, 15, 30, 60],
});
```

### Metrics Endpoint

NestJS exposes `/metrics` for Prometheus to scrape:

```typescript
// src/shared/observability/metrics.controller.ts
@Controller('metrics')
export class MetricsController {
  @Get()
  async metrics(): Promise<string> {
    return register.metrics();
  }
}
```

---

## Loki Label Strategy

> **Superseded — see the file-level banner above.** No Loki instance is deployed. Structured JSON logs go to `stdout` and are ingested by **Cloud Logging** automatically (Cloud Run captures every container's stdout/stderr) — no collector logs pipeline exists (`infra/docker/otel-collector/config.yaml` has a traces pipeline only). Query via Cloud Logging's own filter syntax, not LogQL — see this doc's `## Log Format Specification` above for the field schema, which is unchanged and still accurate.

Loki uses **labels** for stream identification and **log line fields** for filtering within a stream. Keep labels **low-cardinality** — never use `tenant_id` as a label (thousands of tenants = thousands of streams = Loki performance issues).

### Labels (low-cardinality, on every stream)

```
{service="ikaro-backend", env="production", context="booking"}
{service="ikaro-bff", env="staging"}
```

| Label | Values |
|---|---|
| `service` | `ikaro-backend`, `ikaro-bff`, `ikaro-web` |
| `env` | `production`, `staging`, `development` |
| `context` | `booking`, `customer`, `staff`, `loyalty`, `notification`, `platform` (backend only) |

### Log line fields (high-cardinality, searchable via LogQL)

`tenant_id`, `user_id`, `correlation_id`, `booking_id`, `trace_id` — these go in the JSON body, not as Loki labels.

### OTel Collector Loki exporter config

```yaml
# infrastructure/observability/otel/otel-collector.yml
exporters:
  loki:
    endpoint: http://loki:3100/loki/api/v1/push
    labels:
      resource:
        service.name: service       # resource attr → Loki label
        deployment.environment: env
        ikaro.context: context
```

### Example LogQL queries

```logql
# All ERROR logs for production backend
{service="ikaro-backend", env="production"} | json | level="ERROR"

# All logs for a specific correlationId
{service=~"ikaro-.*"} | json | correlationId="uuid-abc123"

# Email failures in last 1h
{service="ikaro-backend", context="notification"} | json | level="ERROR" | __error__="" | line_format "{{.message}}"

# All logs for a specific tenant in the last 15 min
{service="ikaro-backend"} | json | tenantId="tenant-uuid"
```

---

## Grafana Dashboards

> **Superseded — see the file-level banner above.** No Grafana instance is deployed. M17-S35 (Cloud Monitoring dashboards as Terraform-provisioned JSON) is the real future replacement and is **not yet implemented** — until it lands, there is no dashboard layer in this repo at all. Traces are viewable ad hoc via Cloud Trace's own Trace Explorer in the GCP Console; logs via Cloud Logging's Logs Explorer.

Dashboards are **version-controlled as JSON** in the repo and auto-provisioned by Grafana on startup — never created manually in the UI.

### Dashboard inventory

| File | Dashboard | Panels |
|---|---|---|
| `ikaro-overview.json` | **System Overview** | Request rate, error rate, P99 latency, active tenants |
| `ikaro-bookings.json` | **Booking Operations** | Bookings created/hour, status transitions, cancellation rate by tenant |
| `ikaro-events.json` | **Event Bus** | Events published/consumed, consumer lag, failed events |
| `ikaro-loyalty.json` | **Loyalty** | Entries created/hour, sync latency histogram, expiry warnings sent |
| `ikaro-notifications.json` | **Notifications** | Emails sent/failed, retry rate, failure reasons |
| `ikaro-tenant-detail.json` | **Tenant Drill-down** | All metrics for a single `tenant_id` — parametrised dashboard |

**File location:** `infrastructure/observability/grafana/provisioning/dashboards/`

**Auto-provisioning config:**
```yaml
# infrastructure/observability/grafana/provisioning/dashboards/dashboards.yml
apiVersion: 1
providers:
  - name: Ikaro
    type: file
    disableDeletion: true     # prevent UI deletes overwriting git versions
    updateIntervalSeconds: 30  # reload from disk every 30s (picks up CI deploys)
    options:
      path: /etc/grafana/provisioning/dashboards
```

---

## SLOs (Service Level Objectives)

> **Targets below are the real objectives; the Prometheus query column is not — see the file-level banner above.** No Prometheus/metrics pipeline is deployed today (M17-S35, Cloud Monitoring dashboards/alerts using log-based metrics, is not yet implemented). Until it lands, these SLOs are not measured by any automated system in this repo.

| SLO | Target | Prometheus query (not currently runnable — no metrics pipeline exists) |
|---|---|---|
| **API availability** | ≥ 99.5% over 30 days | `sum(rate(http_requests_total{status_code!~"5.."}[30d])) / sum(rate(http_requests_total[30d]))` |
| **Booking P99 latency** | < 2s | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{route="/bookings",method="POST"}[5m]))` |
| **Event processing** | 95% of BookingCompleted → LoyaltyEntry within 30s | `histogram_quantile(0.95, rate(ikaro_loyalty_sync_duration_seconds_bucket[1h]))` |
| **Email delivery** | ≥ 98% sent within 60s | `sum(rate(ikaro_emails_sent_total{status="SENT"}[1h])) / sum(rate(ikaro_emails_sent_total[1h]))` |

---

## Alerting Rules (Email)

> **Superseded — see the file-level banner above.** No Grafana alerting is deployed. M17-S35 (Cloud Monitoring alert policies as Terraform — uptime checks, 5xx rate, latency, DLQ depth, etc.) is the real future replacement and is **not yet implemented** — until it lands, there is no automated alerting in this repo at all.

All alerting rules are **provisioned as code** — never create alerts manually in the Grafana UI.

```yaml
# infrastructure/observability/grafana/provisioning/alerting/rules.yml
apiVersion: 1
groups:
  - name: ikaro-critical
    folder: Ikaro
    interval: 1m
    rules:
      - title: High P99 Latency
        condition: A
        data:
          - refId: A
            queryType: ''
            model:
              expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        annotations:
          summary: "P99 API latency exceeded 2s for 5 minutes"
          description: "Check for slow DB queries, Pub/Sub lag, or traffic spike."
        labels:
          severity: critical

      - title: Low Success Rate
        condition: A
        data:
          - refId: A
            model:
              expr: |
                sum(rate(http_requests_total{status_code=~"2.."}[10m]))
                / sum(rate(http_requests_total[10m])) < 0.95
        for: 10m
        annotations:
          summary: "API success rate below 95% for 10 minutes"
        labels:
          severity: critical

      - title: Email Delivery Failures Spike
        condition: A
        data:
          - refId: A
            model:
              expr: rate(ikaro_emails_sent_total{status="FAILED"}[15m]) > 0.1
        for: 15m
        annotations:
          summary: "Email failure rate exceeding 0.1/s — check IEmailSender adapter"
        labels:
          severity: warning

      - title: Disk Usage High
        condition: A
        data:
          - refId: A
            model:
              expr: (node_filesystem_size_bytes - node_filesystem_free_bytes) / node_filesystem_size_bytes > 0.8
        for: 10m
        annotations:
          summary: "Observability VM disk usage > 80%"
        labels:
          severity: warning
```

```yaml
# infrastructure/observability/grafana/provisioning/alerting/contact-points.yml
apiVersion: 1
contactPoints:
  - orgId: 1
    name: email-alerts
    receivers:
      - uid: email-default
        type: email
        settings:
          addresses: alerts@<ikaro-domain>
          singleEmail: false

# infrastructure/observability/grafana/provisioning/alerting/notification-policies.yml
apiVersion: 1
policies:
  - orgId: 1
    receiver: email-alerts
    group_by: [severity]
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
    routes:
      - receiver: email-alerts
        matchers:
          - severity =~ "critical|warning"
```

```ini
# infrastructure/observability/grafana/grafana.ini
[smtp]
enabled = true
host = smtp.gmail.com:587
user = alerts@<ikaro-domain>
password = ${SMTP_ALERT_PASSWORD}
from_address = alerts@<ikaro-domain>
from_name = Ikaro Alerts
```

---

## Sampling Strategy

| Environment | Rate | Rationale |
|---|---|---|
| Local dev | 100% | See every trace — debugging needs all context |
| Staging | 100% | Full visibility before promoting to production |
| Production | 10% (head-based) | Reduces OTel overhead; enough for latency analysis |

Health checks are excluded from tracing entirely (`ignoreIncomingRequestHook`, see `## NestJS OTel Implementation` above), not sampled-out.

**Real implementation (`packages/observability/src/otel-tracing.ts`) — reads `OTEL_TRACES_SAMPLER_ARG` directly, never branches on `NODE_ENV`:**

```typescript
// otel-tracing.ts — sampler configuration
// NODE_ENV is never used here — both staging and prod build with
// NODE_ENV=production, so it can't distinguish the two environments.
// OTEL_TRACES_SAMPLER_ARG is set per-environment directly (staging: unset,
// defaults to 1.0; production: "0.1", Terraform-set — see infra/terraform/envs/prod/main.tf).
const samplingRate = Number(process.env.OTEL_TRACES_SAMPLER_ARG ?? 1.0);

// remoteParentNotSampled/localParentNotSampled explicitly overridden (2026-08-05, M17-S34
// follow-up — real staging finding, fixed the actual root cause of ~75-89% of real traces
// never being recorded): OTel's own ParentBasedSampler defaults these two slots to AlwaysOff,
// blindly trusting an inherited "not sampled" parent regardless of `ratio`. See
// docs/ENGINEERING_RULES.md § Cloud Run CPU throttling for the full incident.
function createSampler(ratio: number) {
  return new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(ratio),
    remoteParentNotSampled: new TraceIdRatioBasedSampler(ratio),
    localParentNotSampled: new TraceIdRatioBasedSampler(ratio),
  });
}

createSampler(samplingRate)
```

---

## Data Retention

| Signal | Retention | Config |
|---|---|---|
| Prometheus metrics | N/A — no Prometheus deployed | See file-level banner; superseded |
| Loki logs | N/A — no Loki deployed | Logs go to Cloud Logging directly; see Cloud Logging's own retention settings |
| Traces | **Stored in Cloud Trace** (M17-S34) | GCP default retention (30 days); no app-level config — collector's `googlecloud` exporter ships directly, no Grafana Tempo involved |

---

## Health Check Implementation

Every service ships two endpoints with deliberately different depth: `/health/live` (process-up, zero
dependencies, always 200) and `/health/ready` (chained through the full dependency graph beneath this
service, `503` on failure). Both are exempt from auth guards (`@Public()`) and rate limiting.

**Why `/health/ready` chains all the way down instead of stopping at "is the next hop's process up":**
Cloud Run has no continuous readiness-based traffic pulling — only a **startup** probe (gates a *new*
instance before it joins rotation) and a **liveness** probe (restarts the container on failure; see S18
in `plan/M17-CLOUD-DEPLOY.md`). `/health/ready` is used exclusively for that startup gate and for
external uptime-check alerting (S35) — never for pulling an already-running instance out of rotation
(Cloud Run can't do that). So there's no "one DB blip cascades and pulls three services out of rotation
at once" risk to guard against — chaining ready-through-ready just makes each hop's readiness answer
the question a startup gate and an alert actually need answered: *can the whole chain beneath me serve
a real request right now*, not merely *is the next process up*. `/health/live` stays completely
separate and dependency-free everywhere, since it's the only signal that should ever trigger a restart —
a transient DB blip must never cause Cloud Run to restart a perfectly healthy app container.

**Backend** (`@nestjs/terminus` — real DB ping; Pub/Sub is log-only and never gates readiness, since a
transient Pub/Sub blip must not take the API out of rotation):

```typescript
// apps/backend/src/health/health.controller.ts
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheckService, HealthCheck, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { AppLogger } from '../shared/observability/app-logger';
import { Public } from '../shared/decorators/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new AppLogger(HealthController.name);

  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get('live')
  live(): { status: string } {
    return { status: 'ok' }; // 200 as long as the process runs
  }

  @Get('ready')
  @HealthCheck()
  async ready() {
    try {
      return await this.health.check([() => this.db.pingCheck('database', { timeout: 2000 })]);
    } catch (err) {
      // This route is @Public() — never leak terminus's raw indicator error message
      // (e.g. connection/timeout detail). Log full diagnostics server-side instead.
      this.logger.error('Readiness check failed', err instanceof Error ? err.stack : String(err));
      throw new ServiceUnavailableException({
        status: 'error',
        info: {},
        error: { database: { status: 'down' } },
        details: { database: { status: 'down' } },
      });
    }
  }
}
```

**`AppLogger` is never DI-injected — always `new AppLogger(ClassName.name)` as a field initializer, in every class that logs.** `AppLogger`/`BaseAppLogger` carry no `@Injectable()` (removed in TD24-S05 once confirmed dead in both apps) precisely because the constructor's `context` argument needs to be *this specific class's own name*, which NestJS's DI container can't parameterize per-consumer without a dedicated factory provider for every single class. This mirrors `@nestjs/common`'s own built-in `Logger`, which uses the identical `new Logger(context)` pattern. Don't add `@Injectable()` back or attempt constructor injection for a new logger-like utility class for the same reason.

**BFF** (chained to the backend's own `/health/ready` — so a backend DB blip correctly surfaces as the
BFF not being ready either, since neither can serve a real request while it lasts):

```typescript
// apps/bff/src/health/health.controller.ts
@Get('ready')
async ready(): Promise<{ status: string }> {
  try {
    await firstValueFrom(this.http.get(`${this.backendUrl}/health/ready`, { timeout: 2000 }));
    return { status: 'ok' };
  } catch {
    // No global exception filter here — the controller maps the failure to 503 itself.
    throw new HttpException(
      { type: 'about:blank', title: 'Service Unavailable', status: 503, detail: 'Backend is not ready' },
      503,
    );
  }
}
```

**Web** (Next.js route handlers, thin — logic lives in `shared/lib/`; chained to the BFF's own
`/health/ready`, same reasoning):

```typescript
// apps/web/app/api/health/ready/route.ts
import { isBffReady } from '@/shared/lib/health/check-bff-readiness';

export async function GET() {
  const healthy = await isBffReady(); // owns the fetch + 2s AbortSignal.timeout + error normalization
  return NextResponse.json({ status: healthy ? 'ok' : 'error' }, { status: healthy ? 200 : 503 });
}
```

All three: explicit 2s timeouts, no hanging probes; `/health/live` stays dependency-free everywhere.

---

## Implementation Rules for Every Developer / Agent

These rules apply to every context and every PR. CI will flag violations via linting and code review.

| Rule | What to do |
|---|---|
| **Every log line must include `tenantId` and `correlationId`** | Use `AppLogger.withContext({ tenantId, correlationId })` at the start of every use case and event handler |
| **Never `console.log`** | Always use the injected `AppLogger` — `console.log` bypasses the structured JSON format |
| **Every use case starts a named span** | `tracer.startActiveSpan('context.operationName', ...)` with `tenant.id` and relevant entity IDs as span attributes |
| **Metrics on every significant business event** | Increment the relevant counter from `src/shared/observability/metrics.ts` |
| **Never use `tenant_id` as a Loki label** | Put it in the log line body; Loki labels are `service`, `env`, `context` only |
| **Domain events carry `correlationId`** | Inherited from the originating HTTP request; never generate a new one in an event handler |
| **Health endpoints on every service** | `/health/live` and `/health/ready` — required for Cloud Run readiness probes |
| **DEBUG logs must not exist in production** | Guard with `if (process.env.NODE_ENV !== 'production')` or use `AppLogger.debug()` which auto-suppresses |

---

## Full Telemetry Flow

```
HTTP Request
    │  X-Correlation-ID: uuid (generated by BFF if absent)
    │  traceparent: W3C trace context (OTel propagation)
    ▼
NestJS BFF
    │  CorrelationInterceptor injects correlationId
    │  OTel auto-instruments HTTP → span: bff.GET /bookings/:id
    │  AppLogger logs with tenantId + correlationId + traceId
    ▼
NestJS Backend
    │  OTel auto-instruments incoming HTTP → child span (no manual use-case span — manual
    │  business spans stay deferred, see "Manual Span Creation — deferred" above)
    │  AppLogger logs use case start + completion
    │  Metrics (not yet implemented — see "No metrics pipeline exists yet" note below):
    │  bookingStatusTransitions.inc({ tenant_id, from, to })
    │  Event enters outbox: OutboxPublisher captures the active trace context onto
    │  Envelope.traceContext (TD28) — captured once, here, regardless of inline vs. swept dispatch
    │  Event published: { ...envelope, correlationId }; message.attributes carries traceContext
    ▼
Pub/Sub → Event Consumer (push or pull, TD28 covers both symmetrically)
    │  correlationId extracted from the deserialized envelope itself (part of the JSON body, not
    │  a message attribute); traceContext extracted from message.attributes and reconstructed via
    │  ITracingPort.runWithExtractedContext (TD28) — the consumer's span is a genuine child of the
    │  original HTTP request's trace, for both inline and swept dispatch
    │  AppLogger.withContext({ correlationId, tenantId })
    │  Consumer span: ITracingPort.startActiveSpan('pubsub.event.<eventName>') — a transport-layer
    │  span at the dispatch boundary (TD28), not the manual per-use-case business span this
    │  diagram used to (wrongly) imply; those stay deferred same as the backend hop above
    │  Metrics (not yet implemented — see "No metrics pipeline exists yet" note below):
    │  loyaltyEntriesCreated.inc({ tenant_id })
    ▼
stdout (JSON logs)
    ▼
Cloud Logging (Cloud Run captures every container's stdout/stderr directly — logs never pass
    through the collector; infra/docker/otel-collector/config.yaml has a traces pipeline only)

Separately — traces only:
Backend/BFF OTel SDK (M17-S33)
    ▼  OTLP over localhost:4318 (collector sidecar shares the instance's network namespace)
otel-collector sidecar (M17-S34)
    ▼  googlecloud exporter — the only place GCP-specific code appears in this pipeline (D9)
Cloud Trace

No metrics pipeline exists yet (config.yaml's metrics section is a commented stub for a future
googlemanagedprometheus exporter). No dashboard/alerting layer exists yet — that's M17-S35, not
yet implemented. This whole diagram supersedes the Grafana/Prometheus/Loki version this section
originally described — see the file-level banner at the top of this doc.
```

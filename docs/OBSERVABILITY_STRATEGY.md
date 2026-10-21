# Observability Strategy

> **When to load:** adding or changing a span, a log line, a metric, an alert, a dashboard or the OTel/collector setup; debugging missing traces, missing logs or a silent alert; deciding where an observability change belongs. Covers the backend and BFF (instrumented), the collector sidecar, Cloud Logging and the Terraform `monitoring` module. The web app is not instrumented. Incident history and durable hardening rules live in `docs/ENGINEERING_RULES_INFRA.md`; the collector's rebuild path and trace-loss playbook live in `infra/docker/otel-collector/README.md`.
> **Tags:** infra, backend, bff

Ikaro instruments the backend and BFF with OpenTelemetry (OTel), ships traces and metrics through an OTel Collector sidecar to Google Cloud's managed backends, and writes structured JSON logs to stdout for Cloud Logging. There is no self-hosted Prometheus, Grafana, Loki or Tempo stack and no `pnpm obs` command; that design (old M14) was never shipped and is superseded by M17.

**The vendor boundary.** GCP appears in exactly two places: the exporter blocks in `infra/docker/otel-collector/config.yaml`, and the log field names in `packages/observability/src/gcp-log-vendor-formatter.ts`. Application code speaks OTLP and structured stdout only. Changing vendor means editing those two places, not the apps (M17 D9).

## 1. Signal path

```
backend / BFF process
  ├─ traces  ─ OTel SDK ─ OTLP/HTTP ─┐
  ├─ metrics ─ OTel SDK ─ OTLP/HTTP ─┼─> collector sidecar (localhost:4318)
  │                                   │     memory_limiter → resource_detection → batch
  │                                   ├─> traces  → Cloud Trace            (googlecloud exporter)
  │                                   └─> metrics → Managed Prometheus      (googlemanagedprometheus exporter)
  └─ logs ─ JSON on stdout ─> Cloud Run ─> Cloud Logging   (does NOT pass through the collector)
```

- **Logs bypass the collector.** The collector has no logs pipeline. Cloud Run forwards each container's stdout and stderr to Cloud Logging. The collector's own stderr (for example `Exporting failed. Dropping data.`) lands in Cloud Logging the same way, and one alert is built on it (§7).
- **Web** (`apps/web`) has no OTel SDK. A trace starts at the BFF. The web service's signals are Cloud Run built-in metrics, its uptime check and its stdout.
- **Trace↔log link.** Each log line carries the active `traceId`/`spanId`, and with `LOG_VENDOR=gcp` (default) and `GCP_PROJECT` set, also the `logging.googleapis.com/trace` and `logging.googleapis.com/spanId` fields that make Cloud Logging link a line to its trace.
- **Per-service difference.** Backend passes `{ postgres: true }` to `bootstrapTracing()` (adds `pg` client spans). The BFF has no database.

## 2. Configuration

| Variable | Default | Effect |
|---|---|---|
| `APP_ENV` | `local` | `local` turns the OTel SDK off (so tests and local dev make no export attempts); `staging`/`production` turn it on. Also sets the `deployment.environment.name` resource attribute. |
| `OTEL_SDK_DISABLED` | unset | When set, always wins over the `APP_ENV` default, in either direction. |
| `OTEL_TRACES_SAMPLER_ARG` | `1.0` | Sampling ratio. Prod sets `0.1`; staging leaves the default (100%). Never branch on `NODE_ENV` for this: both cloud environments build with `NODE_ENV=production`. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` (and `_TRACES_` / `_METRICS_` variants) | `http://localhost:4318/v1/traces` and `/v1/metrics` | Where the SDK sends OTLP. The default is the sidecar, which shares the instance's network namespace. Terraform sets none of these. |
| `SERVICE_NAME` | `ikaro-backend` / `ikaro-bff` | `service.name` resource attribute. |
| `LOG_LEVEL` | `INFO` | `VERBOSE`, `DEBUG`, `INFO`, `WARN`, `ERROR`. Staging runs `DEBUG`. |
| `LOG_VENDOR` | `gcp` | `gcp` adds the Cloud Logging trace fields; `none` omits them. |
| `GCP_PROJECT` | unset | Required for the trace↔log link fields above. |

`tracing.ts` in each app must load before anything else (the `start`/`dev` scripts preload it), so auto-instrumentation can patch `http`, `express` and `pg` before they are imported.

## 3. Traces

**Sampler.** A `ParentBasedSampler` whose root, `remoteParentNotSampled` and `localParentNotSampled` branches all use `TraceIdRatioBasedSampler(ratio)` (`createSampler()`). The two non-root overrides are mandatory: OTel's defaults trust an inherited "not sampled" decision and silently dropped roughly 75–89% of real traces before export. A test pins this.

**Span processing.** `SimpleSpanProcessor` exports each span as it ends, not `BatchSpanProcessor`. Batching in the app was measured losing spans on CPU-throttled Cloud Run instances because its flush is timer-driven. The exporter's `concurrencyLimit` is 200 (the default of 30 rejected 598 exports in 80 minutes). The collector then batches (§6).

**Auto-instrumentation.** `http`, `express`, `nestjs-core`, and `pg` for the backend. The `fs` instrumentation is off (too noisy). Health checks (`/health/*` and `/v1/health/*`) are not traced; `isHealthCheckPath()` checks the parsed pathname only, because two earlier versions mis-matched.

**Span attributes.** Set through `ITracingPort` (never import `@opentelemetry/api` in app code):

| Attribute | Set by | Note |
|---|---|---|
| `correlation.id` | `CorrelationMiddleware` (backend and BFF) | Runs before guards, so it is present even on guard-rejected requests. |
| `tenant.id`, `user.id` | `RequestInterceptor` | Absent on a guard-rejected request (interceptors never run for it), and on BFF routes with no resolved tenant. `user.id` only when an actor is known. |
| `error.code` | the shared error filter (`base-error.filter.ts`) | The API error code; `AUTH_INTERNAL_ERROR` for unhandled errors. |
| `chatbot.session_id`, `chatbot.provider`, `chatbot.model_id`, `chatbot.input_tokens`, `chatbot.output_tokens`, `chatbot.cap_rejected` | `send-chat-message.use-case.ts`, `chatbot-cap-check.helpers.ts` | Chat request cost and which cap layer rejected it (`cap_rejected` also takes `provider_unavailable`). |

**Pub/Sub.** The outbox publisher injects the active trace context into the message `attributes`. The consumer side restores it with `runWithExtractedContext()` and opens a span per dispatch branch: `pubsub.event.<EventName>` and `pubsub.trigger.<TriggerName>`. Every dispatcher branch needs its own span; do not assume two branches behave alike.

**Redaction.** OAuth callback parameters and signed-URL parameters (`code`, `state`, `error`, `error_description`, `sig`, `Signature`, `AWSAccessKeyId`, `X-Goog-Signature`) are replaced with `REDACTED` on both outgoing and incoming request spans (`otel-query-redaction.ts`). The `instrumentation-http` option replaces its defaults rather than extending them, so the list restates them. Add a parameter to `SENSITIVE_QUERY_PARAMS` when a new route receives a secret in its query string.

**Not instrumented on purpose.** No manual business spans inside use cases (deferred in M17-S33 and TD28). The transport-layer dispatch spans above are the only manual ones.

## 4. Metrics

The SDK runs a `PeriodicExportingMetricReader` (default 60 s) with an `OTLPMetricExporter` pinned to **cumulative** temporality, because Managed Prometheus renders other temporalities wrongly. `concurrencyLimit` is 200, carried over from the trace exporter and not yet independently tuned.

The only metrics emitted are the auto-instrumentation ones (HTTP server and client duration from `instrumentation-http`, plus whatever the other enabled instrumentations emit). No application code defines its own OTel instruments. HTTP server duration arrives in Managed Prometheus as `http_server_duration_milliseconds_bucket` with `http_route` and `http_method` labels (the older semantic-convention name; `OTEL_SEMCONV_STABILITY_OPT_IN` is not set). The one dashboard widget that reads it, `POST /v1/bookings — request duration (p99, GMP)`, uses a PromQL `histogram_quantile`; its metric name was derived from the documented translation and the module records that it was not confirmed against live data. Check it in Metrics Explorer (PromQL mode) before relying on it.

**Application and collector are one contract.** Enabling an SDK signal with no matching collector pipeline produces an endless export-failure loop (the SDK's default metrics reader once logged a 404 error on every export, in both services, until the app side was fixed). A collector pipeline with no producer produces a misleading empty dashboard. Change `metricReaders`/`spanProcessors` and `service.pipelines` in the same PR.

**Tenant labels.** Do not add `tenant_id` to OTel metric labels such as per-route HTTP duration: tenant-count-driven cardinality, and the HTTP instrumentation has no safe request-context hook for it. Tenant drill-down belongs in logs and traces. The business log-based counters do carry a `tenant_id` label, which is what the business dashboard's filter uses (§7).

## 5. Logs

`BaseAppLogger` (`packages/observability`) is the only logger; backend and BFF each subclass it as `AppLogger`. It writes one JSON object per line to stdout:

| Field | Meaning |
|---|---|
| `timestamp`, `message`, `service`, `context` | when, what, which service, which class |
| `severity` | Cloud Logging severity: `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `level` | the app level: `VERBOSE`, `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `traceId`, `spanId` | the active span, or `null` |
| `tenantId`, `correlationId` | added by each app's `enrich()` from the request context; absent in event handlers and jobs unless passed in `LogContext`. The BFF omits `tenantId` when none is resolved. `userId` is never added automatically. |
| `metadata.stack` | the stack trace on `error()` |
| `logging.googleapis.com/trace`, `logging.googleapis.com/spanId` | the trace link (see §1) |

Pass extra fields through the `LogContext` argument. They are spread first, so they can never override the core fields above.

**Log lines other things depend on.** Several metrics and alerts are built from an exact log message or field, so renaming one silently blinds a monitor:

| Depends on | Used by |
|---|---|
| `jsonPayload.message = "[outbox] unpublished backlog"` and field `oldestUnpublishedAgeSeconds` (outbox relay sweep) | `outbox_backlog_age` metric and alert |
| the business-event log calls added in M17-S54 (booking requested, approved, completed; notification failed; customer and staff login) | the six business counters |
| collector stderr text `Exporting failed. Dropping data.` | `collector_export_failure` metric and alert |
| `severity = ERROR` on any Cloud Run revision | `error_count` metric and the ERROR-burst alert |

**Lock contention.** `runInNewTransaction` writes a `warn` "Transaction aborted by lock contention" with a `sqlState` field (`55P03` lock wait over the 2 s timeout, `40P01` deadlock victim) whenever a transaction loses a lock fight (M23-S49). `tenantId` and `correlationId` are added when it happens inside an HTTP request and are absent in an event handler or job; the SQL text and lock key are never logged. The `error.code` span attribute `AUTH_TRANSACTION_CONTENTION` is set by the shared error filter. A rising count is the signal for a slow lock holder or a lock-order cycle (`docs/LOCK_CATALOG.md` § 6).

**Never log** credentials, OAuth tokens, cookies, full authorization headers, Turnstile tokens, customer message content or other secrets. Redact query strings the same way span attributes are redacted (`otel-query-redaction.ts`).

## 6. Collector sidecar

One image, `infra/docker/otel-collector/`, deployed unmodified to staging and production next to the backend and the BFF (no `project:` field; the exporters detect the project through Application Default Credentials). Pipelines, both with `memory_limiter → resource_detection → batch`:

- traces: `otlp` receiver → `googlecloud` exporter (Cloud Trace)
- metrics: `otlp` receiver → `googlemanagedprometheus` exporter

`batch` is `timeout: 1s`, `send_batch_size: 50`. Each exporter has `timeout: 2s` and `sending_queue.enabled: true`. The `health_check` extension (port 13133) is for manual diagnostics only; the app container deliberately does not wait on it, so a sick collector cannot block the app from starting.

Rebuild and deploy: edit `config.yaml` (or bump the digest in the `Dockerfile`), open a PR (the build, `validate` and Trivy scan run on it), merge. The next backend or BFF deploy picks up the new image. No Terraform edit.

**Known, unmitigated gaps (do not assume they are solved):**
- A single low-volume request whose span count never reaches 50 depends on the 1 s `batch` timer, which a CPU-throttled instance can starve. Measured at about one loss event per 180 requests. The trace still appears in Cloud Trace; the missing part is the child spans. A `/pubsub/push` cron trigger is the typical victim.
- `retry_on_failure` is rejected by this exporter version. The Google client retries only inside the 2 s timeout; after that the batch is dropped for good.
- The queue is in memory and both services scale to zero, so a scale-down loses whatever is queued. Production can run many instances batching independently against one per-project quota; that has not been tested at scale.

## 7. Dashboards, alerts and uptime checks

`infra/terraform/modules/monitoring/` owns them. Both `envs/staging` and `envs/prod` instantiate it (`module "monitoring"`), so these are deployed. A module test alone does not prove a monitor exists; check that an environment root uses the module before saying a monitor is live.

| Alert | Signal | Default threshold |
|---|---|---|
| uptime failure (per check) | Cloud Monitoring uptime check | every 300 s |
| 5xx rate (per service) | MQL ratio on `run.googleapis.com/request_count` | > 5 % for 300 s |
| p99 latency (per service) | Cloud Run request latencies | > 2000 ms over 10 min |
| instance count stuck at max (per service) | Cloud Run instance count | at `max_instance_count` for 15 min |
| Cloud SQL disk, Cloud SQL CPU | Cloud SQL utilization | > 80 % |
| DLQ undelivered | `num_undelivered_messages` on `ikaro-.*-dlq-inspect` | > 0 for 10 min |
| ERROR log burst | `error_count` log-based metric | > 10 in 5 min |
| outbox backlog age | `outbox_backlog_age` log-based metric | oldest row older than 3 sweep intervals |
| collector export failures | `collector_export_failure` log-based metric | > 5 in 10 min |

Every policy emails the `notification_email` channel. Thresholds are module variables.

**Uptime checks.** Staging checks the BFF through the web host (`/v1/health/ready`, which chains to the backend's readiness, so one check covers web → BFF → backend) and the web (`/api/health/live`). The BFF's raw URL is internal-only in staging and unreachable from Google's prober. Production creates checks only when the edge is enabled (`enable_edge`), because the domains do not resolve before then and a check would fire forever.

**Dashboards.** *Engineering*: per service request rate / 5xx, p99 latency and instance count; Cloud SQL connections and CPU; Pub/Sub oldest unacked age and DLQ depth; the GMP booking-latency widget. *Business*: six log-based counters (bookings requested, approved and completed; notifications failed; customer and staff logins) with a pinned `tenant_id` dashboard filter for per-tenant drill-down; the module records that the filter control itself was not confirmed live.

**Verification.** MQL and log-filter strings are validated by Cloud Monitoring's API, not by `terraform validate` or an offline `terraform test`. Apply to staging and trigger the condition before trusting a new alert; `docs/RUNBOOKS.md` § Simulate an incident (verify alerts) is the tested procedure. A new log-based metric can take up to 10 minutes to become queryable by alert policies, which is why the module waits after creating them.

## 8. Cloud Run constraints and debugging missing telemetry

Cloud Run allocates CPU only while a request is being handled (`cpu-throttling: true`). Timer-driven work, including the collector's `batch` flush and the metric reader's 60 s tick, can be delayed or skipped on an idle instance, sidecars included. Treat this as a risk to verify with evidence, not as a universal explanation.

Before naming a root cause for missing telemetry:

1. Inspect app and collector exporter errors (`diag` WARN output, collector stderr).
2. Check the Cloud Monitoring quota metrics for Cloud Trace (`serviceruntime.googleapis.com/quota/exceeded`); a burst-rate calculation is not evidence.
3. Verify sampler decisions and parent context (the largest real loss was a sampling bug, not a transport problem).
4. Check that the collector pipeline matches what the SDK sends (§4).
5. Check the Cloud Trace API directly rather than the Console, and compare against the collector's own `debug` exporter output.

The measurement playbook (how to count lost traces, how to read what the collector received, what was already ruled out) is in `infra/docker/otel-collector/README.md`; the durable rules are in `docs/ENGINEERING_RULES_INFRA.md` § Cloud Run CPU throttling.

## 9. Local development

`APP_ENV=local` (also CI) leaves the SDK off, so there is nothing to run for ordinary development and no failed-export noise. There is no supported local Grafana/Loki/Prometheus stack.

To debug telemetry locally, run a collector with `infra/docker/otel-collector/config.yaml` adapted to a `debug` exporter, set `OTEL_SDK_DISABLED=false`, and start the app. Starting application stacks or browsers for verification needs explicit user approval under `.copilot/context.md`.

## 10. Where a change belongs

| I want to… | Change | Also |
|---|---|---|
| add a span attribute | `ITracingPort.setActiveSpanAttributes()` at the point the value is known | never read `RequestContext` from shared infrastructure; interceptors do not run for guard-rejected requests, so use middleware for anything that must exist there |
| add a log line a monitor depends on | `AppLogger` call | add the metric or alert in `modules/monitoring`, and record the exact message in §5's table |
| add an alert or dashboard tile | `infra/terraform/modules/monitoring/main.tf` | test it live (§7); update the §7 table |
| add an application metric | an OTel instrument, which needs a collector metrics pipeline (already present) | check cumulative temporality and `concurrencyLimit`; do not add `tenant_id` as a label |
| change the sampling ratio | `OTEL_TRACES_SAMPLER_ARG` in the environment root | keep the explicit parent-not-sampled overrides |
| change backend vendor | the exporter block in `config.yaml`, and `gcp-log-vendor-formatter.ts` | no application change |
| trace through a new async boundary | `injectContext()` on the producer, `runWithExtractedContext()` and `startActiveSpan()` on the consumer | give every dispatcher branch its own span |

## 11. Canonical references

- Collector operation, image lifecycle and trace-loss playbook: `infra/docker/otel-collector/README.md`
- Instrumentation invariants and incident lessons: `docs/ENGINEERING_RULES_INFRA.md` § Cloud Run CPU throttling
- Terraform monitoring resources and their tests: `infra/terraform/modules/monitoring/`
- Alert verification procedure: `docs/RUNBOOKS.md` § Simulate an incident (verify alerts)
- Deployment lifecycle: `docs/RELEASE_LIFECYCLE_OPERATIONS.md`
- Design decisions D9 and the vendor-lock-in guardrails: `plan/M17-CLOUD-DEPLOY.md`
- Current workflows: `.github/workflows/`

# M14 — Observability

> ⚠️ **SUPERSEDED by `plan/M17-CLOUD-DEPLOY.md` (2026-07-07).** Deploy was reprioritized ahead of observability, and all M14 stories were reconciled against the implemented codebase and merged into M17: S01/S02 → M17-S33 (OTel, OTLP-only), S04 → M17-S34 (collector sidecar replaces the Compose stack), S05/S06 → M17-S35 (Cloud Monitoring as code), S07 → M17-S04, S08 → M17-S05. The self-hosted Grafana/Prometheus/Loki stack described here remains a valid **future option** (activated by swapping the collector exporter config — see M17 D9). Do not implement stories from this file. Kept for historical reference.

**Phase:** Local Development  
**Goal:** The full observability stack (OpenTelemetry traces, Prometheus metrics, structured logs, Grafana dashboards) runs locally via Docker Compose. Every business operation is traced, every metric is collected, and every log includes the mandatory structured fields. The stack is identical in production — no extra work needed when going live.  
**Depends on:** M00 (backend/BFF skeleton to instrument)  
**Note:** This milestone can run in parallel with M01–M13 since it instruments existing code rather than adding business features. It should be started after M07 when most backend code exists.  
**Blocks:** M15 (GCP observability VM uses the same Docker Compose stack)

---

## Stories

---

### M14-S01 — OTel SDK initialization (backend + BFF)

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § OTel implementation

**Description:**  
Implement the OpenTelemetry SDK bootstrap file that must be loaded before NestJS application initialization. Auto-instrumentation covers HTTP, database queries (TypeORM), and Pub/Sub. Manual instrumentation is added in M14-S02.

**What to create in both `apps/backend` and `apps/bff`:**

`src/tracing.ts` — must be the FIRST import in `main.ts`:
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || 'ikaro-backend',
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  instrumentations: [getNodeAutoInstrumentations()],
  sampler: /* 100% for dev, 10% for prod (from env) */
});
sdk.start();
```

`main.ts` must start with `import './tracing';` before any NestJS imports.

**Sampling configuration:**
- `OTEL_SAMPLE_RATE=1.0` (dev/staging), `0.1` (production)
- Read from environment variable — not hardcoded

**Acceptance criteria:**
- [ ] `tracing.ts` is imported before `NestFactory.create()` in `main.ts` for both backend and BFF
- [ ] Traces appear in the OTel Collector when a request is made (verified via `pnpm obs:up`)
- [ ] HTTP request spans include `tenant.id` attribute (added via span attribute enrichment in `TenantInterceptor`)
- [ ] TypeORM SQL query spans appear as child spans of the HTTP span
- [ ] Sampling rate is read from `OTEL_SAMPLE_RATE` env var
- [ ] No `console.log` in tracing file — only `AppLogger`

**Dependencies:** M00-S03, M00-S04, M00-S09

---

### M14-S02 — Manual OTel spans for business operations

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § manual spans, span attributes

**Description:**  
Add manual OpenTelemetry spans to all critical business operations. Auto-instrumentation covers HTTP and DB, but business-level operations (booking transitions, loyalty sync, event publishing) need manual spans to be visible in Grafana traces.

**Spans to add:**

In Booking context:
- `booking.requestBooking` — span attrs: `tenant.id`, `booking.id`, `booking.type`
- `booking.approve` — span attrs: `tenant.id`, `booking.id`, `staff.id`
- `booking.complete` — span attrs: `tenant.id`, `booking.id`, `booking.lineCount`
- `availability.calculate` — span attrs: `tenant.id`, `date`, `serviceCount`, `slotsReturned`

In Loyalty context:
- `loyalty.recordCompletion` — span attrs: `tenant.id`, `booking.id`, `lineCount`, `pointsTotal`

In Notification context:
- `notification.sendEmail` — span attrs: `tenant.id`, `event.name`, `email.recipient` (hashed), `email.status`

In Event Bus:
- `eventbus.publish` — span attrs: `event.name`, `tenant.id`, `event.id`
- `eventbus.consume` — span attrs: `event.name`, `tenant.id`, `event.id`, `deliveryAttempt`

**Helper to create:**
- `src/shared/observability/tracer.ts` — exports `getTracer(name)` wrapping `@opentelemetry/api`

**Acceptance criteria:**
- [ ] A full booking creation trace shows: HTTP span → availability.calculate → booking.requestBooking → eventbus.publish → notification.sendEmail as a waterfall
- [ ] All spans include `tenant.id` and `correlation.id` attributes
- [ ] Email recipient is hashed (SHA-256) in span attributes (never logs plain email addresses in traces)
- [ ] `availability.calculate` span records `slotsReturned` as a span attribute (useful for debugging 0-slot days)
- [ ] No performance regression: spans add <1ms overhead per operation

**Dependencies:** M14-S01, M07-S03, M10-S04, M11-S03

---

### M14-S03 — Prometheus metrics implementation

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § metrics catalog

**Description:**  
Implement the full Prometheus metrics catalog for the backend. Metrics are exposed on `GET /metrics` endpoint (internal — not proxied through BFF). Use `prom-client` with NestJS.

**Metrics to implement (from `docs/10-OBSERVABILITY_STRATEGY.md`):**

Counters:
- `ikaro_bookings_created_total{tenant_id, booking_type}` — increment on BookingRequested
- `ikaro_booking_transitions_total{tenant_id, from_status, to_status}` — increment on each state change
- `ikaro_loyalty_entries_created_total{tenant_id}` — increment on LoyaltyEntry insert
- `ikaro_emails_sent_total{tenant_id, template_name, status}` — increment on email send/fail
- `ikaro_event_bus_published_total{event_name, tenant_id}` — increment on publish
- `ikaro_event_bus_consumed_total{event_name, tenant_id, status}` — increment on consume

Histograms:
- `ikaro_http_request_duration_seconds{method, route, status_code}` — HTTP latency
- `ikaro_availability_calculation_duration_seconds{tenant_id}` — availability algorithm latency
- `ikaro_loyalty_sync_duration_seconds{tenant_id}` — time to process BookingCompleted → LoyaltyEntry

**Acceptance criteria:**
- [ ] `GET /metrics` returns Prometheus text format with all 9 metric families
- [ ] Making a booking increments `ikaro_bookings_created_total` with correct labels
- [ ] Metric cardinality is controlled: `tenant_id` label uses tenant UUID (bounded set), not slug
- [ ] `ikaro_http_request_duration_seconds` has histogram buckets: `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]`
- [ ] Metrics endpoint is NOT proxied through BFF (internal only, scraped by Prometheus)
- [ ] No PII in metric labels (email addresses, customer names must never appear as label values)

**Dependencies:** M14-S01

---

### M14-S04 — Docker Compose observability stack

**Agent:** `devops`  
**Complexity:** M  
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § deployment, `docs/23-INFRASTRUCTURE_SETUP.md` § local observability

**Description:**  
Create the `docker/docker-compose.observability.yml` file that starts the full observability stack locally. This is the same stack deployed to the GCE VM in production — dev/prod parity is the goal.

**Services to configure:**
- `prometheus` — Prometheus 2.x; scrapes `backend:3001/metrics` + `bff:3002/metrics`; 15s scrape interval; data volume mounted
- `grafana` — Grafana OSS; admin password from env; pre-provisioned datasources (Prometheus + Loki); dashboard JSON files auto-loaded from `docker/grafana/dashboards/`
- `loki` — Grafana Loki; receives logs from OTel Collector; storage volume mounted
- `otel-collector` — OpenTelemetry Collector; receives OTLP from apps on `:4317`; exports traces to Jaeger (local) or Tempo; exports logs to Loki

**Files to create:**
- `docker/docker-compose.observability.yml`
- `docker/prometheus/prometheus.yml` — scrape config
- `docker/otel-collector/config.yaml` — receiver/exporter/pipeline config
- `docker/loki/loki-config.yaml`
- `docker/grafana/provisioning/datasources/datasources.yaml`
- `docker/grafana/dashboards/` — directory where M14-S05 will place JSON files

Root `package.json` script already defined in M00-S10: `"obs:up": "docker compose -f docker/docker-compose.observability.yml up -d"`

**Acceptance criteria:**
- [ ] `pnpm obs:up` starts all 4 containers with zero errors
- [ ] Grafana is accessible at `http://localhost:3100` (admin/password from env)
- [ ] Prometheus targets page shows backend and BFF as "UP"
- [ ] OTel Collector receives traces from the backend (verified by Collector logs showing spans received)
- [ ] Loki datasource is configured in Grafana and responds to test query

**Dependencies:** M00-S06, M14-S03

---

### M14-S05 — Grafana dashboards (6 JSON files)

**Agent:** `devops` + `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § Grafana dashboards

**Description:**  
Create the 6 Grafana dashboard JSON files (version-controlled) as specified in the observability strategy. These are loaded automatically by the Grafana provisioning in M14-S04.

**Dashboards to create (`docker/grafana/dashboards/`):**

1. `ikaro-overview.json` — Platform overview: request rate, error rate P99 latency, active tenants count
2. `ikaro-bookings.json` — Bookings: bookings/hour by tenant, status transition heatmap, cancellation rate
3. `ikaro-events.json` — Event bus: events published/consumed per minute, consumer lag, DLQ count
4. `ikaro-loyalty.json` — Loyalty: entries/hour, sync latency histogram, expiry warnings sent
5. `ikaro-notifications.json` — Notifications: emails sent/failed by template, retry rate, SendGrid latency
6. `ikaro-tenant-detail.json` — Parametrized: `$tenant_id` variable; all metrics filtered by tenant

**Acceptance criteria:**
- [ ] All 6 dashboard JSON files are valid Grafana JSON (importable without errors)
- [ ] Dashboards load automatically when Grafana starts (`pnpm obs:up`)
- [ ] `ikaro-overview.json` shows request rate graph populated with live data after making API calls
- [ ] `ikaro-tenant-detail.json` has a `$tenant_id` template variable that filters all panels
- [ ] Each dashboard has a meaningful title and panel descriptions

**Dependencies:** M14-S04

---

### M14-S06 — Alerting rules

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § alerting rules + SLOs

**Description:**  
Define the 4 Prometheus alerting rules as code (rules YAML file). These fire alerts that Grafana Alert Manager would forward to an on-call channel in production. Locally, they are verified by checking the Prometheus `/alerts` endpoint.

**Alert rules to create in `docker/prometheus/alert-rules.yml`:**

```yaml
- alert: HighP99Latency
  expr: histogram_quantile(0.99, rate(ikaro_http_request_duration_seconds_bucket[5m])) > 2
  for: 5m
  labels: { severity: warning }
  annotations:
    summary: "P99 latency exceeds 2s for 5 minutes"

- alert: LowSuccessRate
  expr: rate(ikaro_http_request_duration_seconds_count{status_code!~"5.."}[5m]) / rate(ikaro_http_request_duration_seconds_count[5m]) < 0.95
  for: 10m
  labels: { severity: critical }

- alert: EmailDeliveryFailures
  expr: rate(ikaro_emails_sent_total{status="FAILED"}[15m]) > 0.1
  for: 15m
  labels: { severity: warning }

- alert: HighDiskUsage
  expr: (node_filesystem_size_bytes - node_filesystem_free_bytes) / node_filesystem_size_bytes > 0.8
  for: 5m
  labels: { severity: warning }
```

**Acceptance criteria:**
- [ ] Alert rules file is loaded by Prometheus on startup (no syntax errors)
- [ ] Prometheus `/alerts` page shows all 4 rules in INACTIVE state when system is healthy
- [ ] Rules use correct metric names that match M14-S03 metric catalog exactly
- [ ] Alert annotations include human-readable `summary` and `description`

**Dependencies:** M14-S04, M14-S03

---

### M14-S07 — Health check endpoints (all 3 services)

**Agent:** `backend-ts` + `bff-ts` + `frontend-ts`  
**Complexity:** S  
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § health check contract

**Description:**  
Implement the full health check endpoints for all 3 services. The `/health/live` endpoint is always 200 if the process runs. The `/health/ready` endpoint verifies actual dependencies (DB, Pub/Sub) and returns 503 if any are unhealthy.

**For `backend` and `bff` (NestJS):**
- Use `@nestjs/terminus`
- `GET /health/live` → `{ status: 'ok' }` (always 200)
- `GET /health/ready` → checks: TypeORM DB connection, Pub/Sub emulator connection; returns `503` if either fails

**For `web` (Next.js):**
- `GET /health/live` → Next.js route handler → `{ status: 'ok' }`
- `GET /health/ready` → checks: BFF connectivity (`GET bff/v1/health/live`)

**Acceptance criteria:**
- [ ] `GET /health/live` returns `200` on all 3 services even when DB is down
- [ ] `GET /health/ready` on backend returns `503` when PostgreSQL is stopped (`pnpm infra:down`)
- [ ] `GET /health/ready` on backend returns `200` when all dependencies are healthy
- [ ] Cloud Run will use `GET /health/ready` as the readiness probe (configured in M15)
- [ ] Health check endpoints are excluded from OpenTelemetry tracing (add to sampler exclusions)
- [ ] Health check endpoints are excluded from rate limiting

**Dependencies:** M00-S03, M00-S04, M00-S05, M14-S01

---

### M14-S08 — Full structured logging in all services

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § logging contract

**Description:**  
Ensure `AppLogger` is used consistently across all services with the mandatory structured fields from the observability strategy. This story audits all existing log calls and upgrades them.

**Mandatory fields for every log line:**
```json
{
  "timestamp": "ISO-8601",
  "level": "INFO|WARN|ERROR|DEBUG",
  "service": "ikaro-backend",
  "context": "booking|customer|...",
  "tenantId": "uuid or null",
  "userId": "uuid or null",
  "correlationId": "uuid",
  "traceId": "hex string",
  "spanId": "hex string",
  "message": "string",
  "metadata": {}
}
```

**What to verify/fix:**
- Every use case logs at INFO when started + when completed (with tenantId + correlationId)
- Every event handler logs at INFO when consumed + when processed
- Every email send logs at INFO (SENT) or ERROR (FAILED)
- No `console.log` calls anywhere (ESLint enforces this)
- `traceId` and `spanId` are extracted from the active OTel span

**Acceptance criteria:**
- [ ] `pnpm lint` shows zero `no-console` violations
- [ ] Every INFO-level log includes `tenantId` and `correlationId` (where available from request context)
- [ ] Every ERROR-level log includes the error message, stack trace in `metadata.stack`, and context
- [ ] `traceId` appears in log lines when OTel is active (connects logs to traces in Grafana)
- [ ] Log level is configurable via `LOG_LEVEL` env var (`INFO` default, `DEBUG` in dev)
- [ ] Running `pnpm dev` and making a booking request shows a structured JSON log line in stdout with all mandatory fields

**Dependencies:** M00-S09, M14-S01

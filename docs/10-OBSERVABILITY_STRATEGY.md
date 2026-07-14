# Observability Strategy - Ikaro

## Overview

Observability answers three questions: **is the system healthy?** (metrics), **why did this request fail?** (traces), and **what exactly happened?** (logs). All three must include `tenant_id` so issues can be isolated per car wash company.

**Stack:** Prometheus → metrics · Loki → logs · OTel Collector → telemetry pipeline · Grafana → dashboards + alerts

---

## Deployment

| Environment | Hosting | How |
|---|---|---|
| **Production** | GCE e2-small VM + Docker Compose | Deployed by `deploy-observability.yml` CI pipeline (see `docs/09-CI_CD_PIPELINE.md`) |
| **Staging** | Same GCE VM, separate Grafana organisation | Scraped from staging Cloud Run services |
| **Local dev** | Docker Compose (optional) | `pnpm obs:up` — runs full stack on localhost |

---

## Local Development Setup

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

### Package Installation

```bash
# Install in apps/backend and apps/bff
pnpm --filter backend add \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-grpc \
  @opentelemetry/exporter-metrics-otlp-grpc \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/sdk-trace-base \
  @opentelemetry/sdk-metrics \
  prom-client
```

### Tracing Bootstrap File

This file **must be loaded before anything else** — before NestJS initialises, before any module is imported.

```typescript
// apps/backend/src/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } from '@opentelemetry/semantic-conventions';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

const samplingRate = process.env.NODE_ENV === 'production' ? 0.1 : 1.0;
// Production: 10% sampling · Staging/Local: 100%

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: process.env.SERVICE_NAME ?? 'ikaro-backend',
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
  }),
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(samplingRate),
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317',
    }),
    exportIntervalMillis: 15_000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },   // too noisy
      '@opentelemetry/instrumentation-typeorm': { enabled: true },
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => sdk.shutdown());
```

### Loading the Bootstrap File

```json
// apps/backend/package.json
{
  "scripts": {
    "start": "node -r ./dist/tracing.js dist/main.js",
    "start:dev": "ts-node -r ./src/tracing.ts src/main.ts"
  }
}
```

Environment variables (set in Cloud Run via `--set-env-vars` / `.env.local` locally):

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317   # local
OTEL_EXPORTER_OTLP_ENDPOINT=http://<obs-vm-ip>:4317  # staging/prod
SERVICE_NAME=ikaro-backend
NODE_ENV=development
```

### Manual Span Creation

For use cases, wrap the main logic in a span:

```typescript
// src/shared/observability/tracer.ts
import { trace } from '@opentelemetry/api';
export const tracer = trace.getTracer('ikaro');

// Usage in a use case
import { tracer } from '../../../shared/observability/tracer';

async execute(command: ApproveBookingCommand): Promise<void> {
  return tracer.startActiveSpan('booking.approveBooking', async (span) => {
    span.setAttributes({
      'tenant.id': command.tenantId,
      'booking.id': command.bookingId,
      'staff.id': command.staffId,
    });
    try {
      // ... use case logic
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}
```

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

## Prometheus Metrics

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

| SLO | Target | Prometheus query |
|---|---|---|
| **API availability** | ≥ 99.5% over 30 days | `sum(rate(http_requests_total{status_code!~"5.."}[30d])) / sum(rate(http_requests_total[30d]))` |
| **Booking P99 latency** | < 2s | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{route="/bookings",method="POST"}[5m]))` |
| **Event processing** | 95% of BookingCompleted → LoyaltyEntry within 30s | `histogram_quantile(0.95, rate(ikaro_loyalty_sync_duration_seconds_bucket[1h]))` |
| **Email delivery** | ≥ 98% sent within 60s | `sum(rate(ikaro_emails_sent_total{status="SENT"}[1h])) / sum(rate(ikaro_emails_sent_total[1h]))` |

---

## Alerting Rules (Email)

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

Override for specific routes (always sample health checks = never; always sample errors = yes):

```typescript
// tracing.ts — sampler configuration
new ParentBasedSampler({
  root: new TraceIdRatioBasedSampler(
    process.env.NODE_ENV === 'production' ? 0.1 : 1.0
  ),
})
```

---

## Data Retention

| Signal | Retention | Config |
|---|---|---|
| Prometheus metrics | 30 days | `--storage.tsdb.retention.time=30d` |
| Loki logs | 14 days | `retention_period: 14d` in `loki.yml` |
| Traces | Not stored (OTel → logs) | Post-MVP: add Grafana Tempo for trace storage |

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
    │  OTel auto-instruments incoming HTTP → child span
    │  Use case: tracer.startActiveSpan('booking.approveBooking')
    │  AppLogger logs use case start + completion
    │  Metrics: bookingStatusTransitions.inc({ tenant_id, from, to })
    │  Event published: { ...envelope, correlationId, traceId in attributes }
    ▼
Pub/Sub → Event Consumer (Loyalty / Notification)
    │  correlationId extracted from message.attributes
    │  AppLogger.withContext({ correlationId, tenantId })
    │  Consumer span: tracer.startActiveSpan('loyalty.recordCompletion')
    │  Metrics: loyaltyEntriesCreated.inc({ tenant_id })
    ▼
stdout (JSON logs)
    ▼
OTel Collector
    ├── traces  → (future: Grafana Tempo)
    ├── metrics → Prometheus
    └── logs    → Loki

Grafana
    ├── Dashboards query Prometheus (metrics) + Loki (logs)
    └── Alerts → email → alerts@<ikaro-domain>
```

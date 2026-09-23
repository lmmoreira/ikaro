# Observability Strategy

Ikaro uses OpenTelemetry instrumentation in the applications, an OpenTelemetry Collector sidecar on Cloud Run, and Google Cloud's managed observability backends. The previously proposed self-hosted Prometheus/Grafana/Loki VM and its Docker Compose commands were never shipped and are not part of the supported architecture.

## Current signal path

```
Backend / BFF
  └─ OpenTelemetry SDK
       ├─ traces ──┐
       └─ metrics ─┼─> OTel Collector sidecar
                    ├─> Cloud Trace
                    ├─> Cloud Monitoring / Google Managed Prometheus
                    └─> Cloud Logging
```

The collector image and pipeline live under `infra/docker/otel-collector/`. Application bootstrap and hardening rules live in `packages/observability/` and `docs/ENGINEERING_RULES_INFRA.md`.

## Required context

Logs and traces must carry enough context to isolate a request:

- `tenant_id` / OTel `tenant.id` when a tenant has been resolved;
- `user.id` when an authenticated actor exists;
- `correlation.id` across web, BFF, backend, and asynchronous dispatch;
- service, environment, route, and error classification.

Do not add `tenant_id` to generic per-route metric labels. That creates tenant-count-driven cardinality and the HTTP auto-instrumentation does not expose a safe request-context hook for it. Tenant drill-down belongs in logs and traces; metrics describe aggregate service health.

## Traces

Backend and BFF initialize the OpenTelemetry Node SDK. The production sampler is parent-based and must explicitly configure both sampled and non-sampled parent branches; relying on the library defaults previously caused silent span loss.

Exporter concurrency is explicit. Do not assume a passing request path means traces were exported: check exporter errors and Cloud Trace directly.

Every dispatcher branch needs its own span. Propagate trace/correlation context through Pub/Sub and restore it in consumers.

## Metrics

The SDK exports metrics through an `OTLPMetricExporter` and `PeriodicExportingMetricReader`; the collector exports them to Google Managed Prometheus. Export temporality must remain compatible with that backend.

Application and collector configuration are one contract: enabling an SDK signal without a matching collector pipeline produces recurring export failures; exposing a collector pipeline with no producer creates a misleading empty surface.

## Logs

Applications emit structured logs through the shared logging abstraction. Business/audit counters are derived from intentional structured events and exposed through Cloud Monitoring log-based metrics.

Never log credentials, OAuth tokens, cookies, full authorization headers, Turnstile tokens, customer message content, or other secrets. Query strings and outbound telemetry must follow the same redaction discipline — see `packages/observability/src/otel-query-redaction.ts` for the actual implementation.

## Dashboards and alerts

Terraform under `infra/terraform/modules/monitoring/` owns:

- uptime checks;
- Cloud Run, Cloud SQL, and Pub/Sub/DLQ alerts;
- engineering and business dashboards;
- log-based metrics and alert policies.

Treat the Terraform module and its tests as implementation authority. A module-level test does not prove the module is instantiated by an environment root; verify real root usage before describing a monitor as deployed.

## Cloud Run constraints

Timer-driven work can be delayed on CPU-throttled instances, including collector sidecars. This affects batching and periodic metric export. It is a risk to verify empirically, not a universal explanation for missing telemetry.

Before naming a root cause:

1. inspect application/collector exporter errors;
2. inspect Cloud Monitoring quota-rejection metrics;
3. verify sampler decisions and parent context;
4. check collector pipeline compatibility;
5. compare against direct target-system evidence.

The detailed incident history and durable implementation rules are maintained in `docs/ENGINEERING_RULES_INFRA.md` § Cloud Run CPU throttling.

## Local development

There is no supported local Grafana/Loki/Prometheus Compose stack and no `pnpm obs:up` command.

For focused telemetry debugging, run a collector using `infra/docker/otel-collector/config.yaml` adapted to a local `debug` exporter, then start the relevant application with telemetry enabled. Starting application stacks or browsers for verification requires explicit user approval under `.copilot/context.md`.

## Canonical references

- Collector operation and image lifecycle: `infra/docker/otel-collector/README.md`
- Instrumentation invariants and incident lessons: `docs/ENGINEERING_RULES_INFRA.md`
- Terraform monitoring resources: `infra/terraform/modules/monitoring/`
- Deployment lifecycle: `docs/18-RELEASE_LIFECYCLE_OPERATIONS.md`
- Current workflows: `.github/workflows/`

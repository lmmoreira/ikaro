# Infrastructure and Tooling Map

This map identifies each maintained tool and its authority. Exact resource values belong in Terraform or workflow YAML, not in this overview.

## Application and data platform

| Tool | Purpose | Authority |
|---|---|---|
| Cloud Run | Web, BFF, backend, migration job; collector sidecars | `infra/terraform/modules/cloudrun-service/`, environment roots |
| Cloud SQL PostgreSQL 17 | Shared database, physically separated by bounded-context schemas | `infra/terraform/modules/database/`, `docs/13-DATABASE_SCHEMA.md` |
| Cloud SQL Connector | Encrypted application-to-database connectivity | backend shared database adapter |
| Pub/Sub | Domain-event and scheduled-trigger transport | Terraform Pub/Sub modules and event-bus adapter |
| Cloud Scheduler | Publishes scheduled trigger messages | Terraform scheduler module |
| GCS | Booking and hotsite objects | Terraform storage module; tenant-prefixed paths |
| Secret Manager | Runtime credentials and application secrets | Terraform secrets module and environment roots |
| Artifact Registry | Immutable application and collector images | Terraform registry resources and deploy workflows |

The deployed region and repository are defined in Terraform. The current application registry is `ikaro-registry` in `southamerica-east1`.

## Delivery and quality

| Tool | Purpose | Authority |
|---|---|---|
| GitHub Actions | PR gates, deployment, promotion, rollback, maintenance | `.github/workflows/*.yml` |
| pnpm workspaces | Dependency and task orchestration | `pnpm-workspace.yaml`, root `package.json` |
| SonarCloud | Differential quality/coverage gate | workflow configuration and Sonar project settings |
| Snyk / repository scanners | Dependency, container, and IaC analysis | workflow configuration |
| architecture-check / ESLint | Repository-specific architecture invariants | `packages/architecture-check/`, ESLint configs |

## Observability

| Tool | Purpose | Authority |
|---|---|---|
| OpenTelemetry SDK | Application traces and metrics | `packages/observability/` |
| OTel Collector sidecar | Signal processing/export | `infra/docker/otel-collector/` |
| Cloud Trace | Distributed traces | GCP project and collector exporter |
| Cloud Monitoring / Google Managed Prometheus | Metrics, dashboards, alerts | `infra/terraform/modules/monitoring/` |
| Cloud Logging | Structured application and platform logs | application logger and GCP |

There is no maintained GCE observability VM, Grafana/Loki Compose stack, or `pnpm obs:up` workflow.

## Local development

Docker Compose provides local dependencies such as PostgreSQL and the Pub/Sub emulator. Application services normally run through repository scripts. Local setup belongs in `README.md`; telemetry-specific local guidance is in `docs/10-OBSERVABILITY_STRATEGY.md`.

## Related documents

- `docs/09-CI_CD_PIPELINE.md`
- `docs/10-OBSERVABILITY_STRATEGY.md`
- `docs/12-DEPLOYMENT_STRATEGY.md`
- `docs/18-RELEASE_LIFECYCLE_OPERATIONS.md`
- `infra/terraform/README.md`

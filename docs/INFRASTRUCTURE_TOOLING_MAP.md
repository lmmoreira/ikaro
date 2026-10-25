# Infrastructure and Tooling Map

> **When to load:** finding which tool owns what (Cloud Run, CI, observability, local development) and where its authoritative configuration lives; provisioning steps are in `docs/INFRASTRUCTURE_SETUP.md`.
> **Tags:** infra

This map identifies each maintained tool and its authority. Exact resource values belong in Terraform or workflow YAML, not in this overview.

## Application and data platform

| Tool | Purpose | Authority |
|---|---|---|
| Cloud Run | Web, BFF, backend, migration job; collector sidecars | `infra/terraform/modules/cloudrun-service/`, environment roots |
| Cloud SQL PostgreSQL 17 | Shared database, physically separated by bounded-context schemas | `infra/terraform/modules/database/`, `docs/DATABASE_SCHEMA.md` |
| Cloud SQL Connector | Encrypted application-to-database connectivity | backend shared database adapter |
| Pub/Sub | Domain-event and scheduled-trigger transport | Terraform Pub/Sub modules and event-bus adapter |
| Cloud Scheduler | Publishes scheduled trigger messages | Terraform scheduler module |
| GCS | Booking and hotsite objects | Terraform storage module; tenant-prefixed paths |
| Secret Manager | Runtime credentials and application secrets | Terraform secrets module and environment roots |
| Artifact Registry | Immutable application and collector images | Terraform registry resources and deploy workflows |
| VPC network | VPC, subnet with Private Google Access, Cloud SQL private peering, default-deny ingress | `infra/terraform/modules/network/` |
| Edge (production only) | Global external load balancer, serverless NEGs and Cloudflare DNS in front of web and BFF | `infra/terraform/modules/edge/` |
| Relay VM (on demand) | IAP-only VM inside the VPC, the way a developer reaches Cloud SQL's private IP and the internal backend; inert unless enabled | `infra/terraform/modules/relay-vm/`, `scripts/relay-vm-up.sh`, `scripts/relay-vm-down.sh`, `docs/RUNBOOKS.md` |

The deployed region and repository are defined in Terraform. The current application registry is `ikaro-registry` in `southamerica-east1`.

## Delivery and quality

| Tool | Purpose | Authority |
|---|---|---|
| GitHub Actions | PR gates, deployment, promotion, rollback, maintenance | `.github/workflows/*.yml` |
| pnpm workspaces | Dependency and task orchestration | `pnpm-workspace.yaml`, root `package.json` |
| SonarCloud | Differential quality/coverage gate | workflow configuration and Sonar project settings |
| Snyk / repository scanners | Dependency, container, and IaC analysis (Snyk SCA runs only in the weekly scheduled scan, not the per-PR gate; Gitleaks, Trivy and Checkov gate each PR) | workflow configuration |
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

Docker Compose (`docker/docker-compose.yml`, started with `pnpm infra:up`) provides the local dependencies: PostgreSQL, the Pub/Sub emulator, the GCS emulator and MailHog. `pnpm infra:up` then runs `pnpm hotsite-templates:seed`, which uploads the template catalogue's images to the GCS emulator's public bucket (the emulator keeps nothing across restarts, and `db:seed` never touches storage). Application services normally run through repository scripts. Local setup belongs in `README.md`; telemetry-specific local guidance is in `docs/OBSERVABILITY_STRATEGY.md`.

## Related documents

- `docs/CI_CD_PIPELINE.md`
- `docs/OBSERVABILITY_STRATEGY.md`
- `docs/DEPLOYMENT_STRATEGY.md`
- `docs/RELEASE_LIFECYCLE_OPERATIONS.md`
- `infra/terraform/README.md`

# Infrastructure Setup

This document is the supported entry point for provisioning Ikaro infrastructure. Terraform configuration and workflow YAML remain the executable sources of truth.

## Before provisioning

Required operator tooling:

- Google Cloud SDK authenticated to the intended project;
- Terraform at the version constrained by the relevant root;
- GitHub repository administration access for environments, variables, and OIDC configuration;
- permissions to enable GCP APIs and create foundation resources.

Never commit credentials or service-account keys. CI authenticates to GCP through workload identity/OIDC; runtime secrets belong in Secret Manager.

## Repository layout

| Path | Responsibility |
|---|---|
| `infra/terraform/foundation/` | Shared/project prerequisites and identities |
| `infra/terraform/envs/staging/` | Staging environment resources |
| `infra/terraform/envs/prod/` | Production environment resources |
| `infra/terraform/modules/` | Reusable infrastructure modules |
| `infra/docker/otel-collector/` | Collector image and telemetry pipelines |
| `.github/workflows/foundation-deploy.yml` | Foundation planning/deployment |
| `.github/workflows/infra-deploy.yml` | Environment infrastructure planning/deployment |
| `.github/workflows/deploy-staging.yml` | Application staging deployment |
| `.github/workflows/deploy-production.yml` | Protected production promotion |

## Provisioning order

1. Read `infra/terraform/README.md`, especially separate-state dependencies and the IAM/secret gotchas.
2. Initialize and validate the foundation root.
3. Review its plan and apply through the foundation workflow.
4. Supply the explicitly documented bridge values required by the target environment root.
5. Initialize, validate, and plan the staging or production environment root.
6. Apply through `infra-deploy.yml`.
7. Confirm Secret Manager values are populated by the authorized operator.
8. Deploy applications through the staging pipeline; it runs migrations before services.
9. Verify health checks, Cloud Run traffic, Pub/Sub delivery, database connectivity, and monitoring resources.

Do not treat a passing module test as proof that the module is instantiated. Confirm each required module has a real block in the selected root.

## Current platform choices

- Region: `southamerica-east1` where configured by the environment roots.
- Artifact Registry repository: `ikaro-registry`.
- Runtime: Cloud Run for web, BFF, backend, migrations, and collector sidecars.
- Database: Cloud SQL PostgreSQL 17, reached through the Cloud SQL connector.
- Events: Pub/Sub, with Cloud Scheduler publishing scheduled triggers.
- Observability: Cloud Trace, Cloud Monitoring/GMP, and Cloud Logging through the collector sidecar.

There is no GCE observability VM, no `ikaro-images` registry, no supported `us-central1` deployment recipe, and no long-lived `GCP_SA_KEY_*` CI authentication path.

## Local infrastructure

Use the root README and Docker Compose configuration for PostgreSQL and the Pub/Sub emulator. There is no supported local Prometheus/Grafana/Loki Compose stack. For focused local telemetry debugging, follow `docs/10-OBSERVABILITY_STRATEGY.md`.

Starting application servers or browser-based verification requires explicit user approval under `.copilot/context.md`.

## Verification

Before calling an environment ready:

- Terraform plan is clean after apply;
- Cloud Run services and migration job reference intended image digests;
- database roles and Secret Manager IAM are converged;
- migration job succeeds before application rollout;
- health/readiness checks pass;
- Pub/Sub topics/subscriptions include newly shipped consumers;
- Cloud Run traffic targets the intended latest revision;
- monitoring module is instantiated and expected policies/dashboards exist.

## Canonical references

- Detailed Terraform commands, state relationships, and gotchas: `infra/terraform/README.md`
- CI/CD behavior: `docs/09-CI_CD_PIPELINE.md`
- Deployment strategy: `docs/12-DEPLOYMENT_STRATEGY.md`
- Release operations: `docs/18-RELEASE_LIFECYCLE_OPERATIONS.md`
- Observability: `docs/10-OBSERVABILITY_STRATEGY.md`

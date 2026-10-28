# Infrastructure Setup

> **When to load:** provisioning Ikaro infrastructure: operator tooling, repository layout, provisioning order, current platform choices, local infrastructure and verification; Terraform and workflow YAML stay the executable sources, runtime topology is in `docs/DEPLOYMENT_STRATEGY.md`.
> **Tags:** infra

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
| `infra/terraform/foundation/` | Separate control plane with its own `modules/` (`control-plane`, `custom-roles`, `project-services`, `runtime-identities`, `static-resource-iam`, `workload-iam`) and `envs/{staging,prod}`: project APIs, custom roles, runtime identities and IAM grants; also hosts the on-demand `relay-vm` module in both `envs/staging` and `envs/prod` (inert while `create_relay_vm = false`) |
| `infra/terraform/envs/staging/` | Staging environment resources |
| `infra/terraform/envs/prod/` | Production environment resources |
| `infra/terraform/modules/` | Reusable infrastructure modules: `cloudrun-service`, `database`, `edge` (prod only), `migrate-job`, `monitoring`, `network`, `pubsub`, `registry` (prod only), `relay-vm`, `scheduler`, `secrets`, `storage` |
| `infra/terraform/pubsub-catalog.json` | Generated event/consumer catalog the `pubsub` module reads (topics, subscriptions, DLQs) |
| `infra/docker/otel-collector/` | Collector image and telemetry pipelines |
| `.github/workflows/foundation-deploy.yml` | Foundation planning/deployment |
| `.github/workflows/infra-deploy.yml` | Environment infrastructure planning/deployment |
| `.github/workflows/deploy-staging.yml` | Application staging deployment |
| `.github/workflows/deploy-production.yml` | Protected production promotion |
| `.github/workflows/rollback-production.yml` | Manual emergency rollback of a production service |
| `.github/workflows/pr-quality.yml` | PR quality gates (lint, type-check, architecture validation, Terraform env-contract and `pubsub-catalog` checks) |
| `.github/workflows/pr-tests.yml` | PR test and security gates (unit, integration, E2E, Gitleaks, Trivy, Checkov, Sonar) |
| `.github/workflows/weekly-jobs.yml` | Weekly security and quality baseline — three jobs: `trivy-unfixed` (full Trivy scan), `sonarcloud` (branch scan with `-Dsonar.qualitygate.wait=false`) and `snyk-sca` |
| `.github/workflows/build-otel-collector.yml` | Collector sidecar image build |

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
- Observability: traces and metrics reach Cloud Trace and Managed Prometheus through the collector sidecar; logs go from stdout straight to Cloud Logging (`docs/OBSERVABILITY_STRATEGY.md`).

There is no GCE observability VM, no `ikaro-images` registry, no supported `us-central1` deployment recipe, and no long-lived `GCP_SA_KEY_*` CI authentication path.

## Local infrastructure

Use the root README and `docker/docker-compose.yml` (`pnpm infra:up` / `pnpm infra:down`) for the local dependencies: PostgreSQL, the Pub/Sub emulator, the GCS emulator (`gcs-emulator`) and MailHog (`mailhog`, the local email sink). There is no supported local Prometheus/Grafana/Loki Compose stack. For focused local telemetry debugging, follow `docs/OBSERVABILITY_STRATEGY.md`. For a per-story Playwright run use `pnpm infra:e2e` / `pnpm infra:e2e:down` instead of `infra:up`: it runs only from a git worktree under `.claude/worktrees/` and wipes the compose volume that `infra:up` also uses (`docs/TESTING_STRATEGY.md` § Running Playwright locally).

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
- CI/CD behavior: `docs/CI_CD_PIPELINE.md`
- Deployment strategy: `docs/DEPLOYMENT_STRATEGY.md`
- Release operations: `docs/RELEASE_LIFECYCLE_OPERATIONS.md`
- Observability: `docs/OBSERVABILITY_STRATEGY.md`

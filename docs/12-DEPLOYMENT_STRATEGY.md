# Deployment Strategy

Ikaro deploys immutable containers to Google Cloud Run in `southamerica-east1`. Terraform is the infrastructure source of truth; GitHub Actions builds, scans, migrates, deploys, promotes, and rolls back.

## Runtime topology

| Component | Runtime | Exposure |
|---|---|---|
| Web | Cloud Run | Public |
| BFF | Cloud Run | Public application API |
| Backend | Cloud Run | Internal service ingress |
| Database | Cloud SQL for PostgreSQL 17 | Private; application access through the Cloud SQL connector |
| Events and scheduled triggers | Pub/Sub + Cloud Scheduler | Push/trigger infrastructure managed by Terraform |
| Object storage | GCS | Tenant-prefixed object paths |
| Telemetry | OTel Collector Cloud Run sidecar | Cloud Trace, Cloud Monitoring/GMP, Cloud Logging |

There is no production observability VM and no self-hosted Grafana/Loki deployment.

## Delivery model

Pull requests run the quality and test workflows. A merge to `main` can build digest-addressed images, scan them, push them to the `ikaro-registry` Artifact Registry repository, run migrations, deploy to staging, and smoke-test the result. Production uses the protected promotion workflow; it does not rebuild a different artifact.

See `docs/09-CI_CD_PIPELINE.md` and the actual files under `.github/workflows/`.

## Database changes

Migrations run in a dedicated Cloud Run job before application deployment. Applications use `synchronize: false` and never migrate at startup. A failed migration prevents the new application revision from deploying.

## Infrastructure states and ordering

Foundation and environment Terraform are separate roots and states. They do not exchange outputs automatically. Provision foundation prerequisites before resources that consume them, and follow the bridging/reconciliation rules in `infra/terraform/README.md`.

## Availability and rollback

Cloud Run revisions make application rollback a traffic operation. Use `.github/workflows/rollback-production.yml`; after any manual diagnostic deployment, verify that traffic is restored to `latestRevision: true`.

Database rollback is a separately designed operation. Prefer forward-compatible migrations and forward fixes; do not assume reverting an image reverses a schema change.

## Canonical references

- Terraform roots, modules, apply order, and gotchas: `infra/terraform/README.md`
- CI/CD workflow map: `docs/09-CI_CD_PIPELINE.md`
- Release and rollback procedure: `docs/18-RELEASE_LIFECYCLE_OPERATIONS.md`
- Observability deployment: `docs/10-OBSERVABILITY_STRATEGY.md`
- Container implementation: application Dockerfiles and `infra/docker/otel-collector/`

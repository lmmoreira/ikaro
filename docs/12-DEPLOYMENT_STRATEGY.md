# Deployment Strategy - Ikaro

> ⚠️ **Partially superseded** by `plan/M17-CLOUD-DEPLOY.md` §0 (2026-07-07). On any conflict — SA keys, VPC connector, Cloud Armor+IAP, GCE observability VM, cron transport, pipeline structure — M17 wins. Full rewrite tracked as M17-S42.

## Philosophy

**Simple, robust, cost-conscious.** Ikaro starts on fully-managed GCP services that require zero operational overhead, scale automatically with traffic, and cost ~$50/month at MVP. The same Docker images and the same code run from day 1 through 1 M users — only the infrastructure tier changes.

---

## Production Architecture (GCP)

| Layer | Service | Notes |
|---|---|---|
| **Frontend** | GCP Cloud Run (`ikaro-web`) | Next.js 16 SSR container; public HTTPS |
| **BFF** | GCP Cloud Run (`ikaro-bff`) | NestJS BFF; public HTTPS; sole entry point for the web layer |
| **Backend** | GCP Cloud Run (`ikaro-backend`) | NestJS modular monolith; internal only (not public) |
| **Database** | GCP Cloud SQL PostgreSQL 15 | Private IP inside VPC; automated backups; no public exposure |
| **Event bus** | GCP Pub/Sub | Managed, serverless; local dev uses the Pub/Sub emulator |
| **Storage** | GCP Cloud Storage | Tenant photo uploads; paths: `tenants/<tid>/bookings/<bid>/<file>` |
| **Secrets** | GCP Secret Manager | Injected into Cloud Run at runtime via `--set-secrets` |
| **Observability** | GCE e2-small VM (prod only) | Docker Compose: Prometheus + Grafana + Loki + OTel Collector |

---

## Immutable Artifact Pattern

One Docker image is built per commit, scanned by Trivy, and tagged with the Git SHA. The **same image** moves through staging → production. It is never rebuilt between environments. Configuration differences (DB URL, secrets) are injected at runtime via Secret Manager — never baked into the image.

---

## Scaling Path (no code changes required)

| Stage | Timeline | Cloud SQL tier | Cloud Run max instances | Est. cost |
|---|---|---|---|---|
| MVP | Month 0–3 | `db-f1-micro` | 10 | ~$50/month |
| Growth | Month 3–12 | `db-n1-standard-1` | 100 | ~$300/month |
| Scale | Month 12+ | `db-n1-standard-4` + read replica | 200+ | ~$800/month |

Kubernetes is not needed until Cloud Run costs exceed ~$2 k/month or multi-region orchestration is required. The same Docker images deploy to GKE without code changes.

---

## Key Rules

1. **Migrations run before deployment** — as a hard prerequisite CI job, never at app startup (`synchronize: false`).
2. **Cloud Run health checks** — every service exposes `/health/live` and `/health/ready`. Cloud Run shifts traffic only after `/health/ready` returns 200.
3. **No direct pushes to `main`** — all changes go through a PR with CI gates passing.
4. **Rollback = re-deploy previous SHA** — because images are immutable and tagged by commit, rollback is a one-command re-deploy of the previous image tag.

---

## Authoritative References

| Topic | Document |
|---|---|
| Full GCP infrastructure setup, Terraform HCL, Day 0 bootstrap | `docs/23-INFRASTRUCTURE_SETUP.md` |
| CI/CD pipeline YAML, GitHub Actions workflows, quality gates | `docs/09-CI_CD_PIPELINE.md` |
| Release lifecycle, hotfix path, rollback procedures | `docs/18-RELEASE_LIFECYCLE_OPERATIONS.md` |
| Observability stack (Prometheus, Grafana, Loki, OTel) | `docs/10-OBSERVABILITY_STRATEGY.md` |

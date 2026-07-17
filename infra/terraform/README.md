# Ikaro — Terraform Infrastructure

All GCP + Cloudflare infrastructure for Ikaro, as code. Canonical plan: `plan/M17-CLOUD-DEPLOY.md` (§0 decisions, §2 security model — both win over any other doc on conflict).

## Layout

```
infra/terraform/
├── modules/          # generic, env-agnostic building blocks
│   ├── network/           VPC, subnet (PGA), PSA peering, firewall   (M17-S12)
│   ├── database/          Cloud SQL PostgreSQL 17, private IP        (M17-S13)
│   ├── storage/           GCS uploads (private) + hotsite (public)   (M17-S14)
│   ├── registry/          Artifact Registry — prod project only      (M17-S15)
│   ├── secrets/           Secret Manager containers + IAM only       (M17-S16)
│   ├── iam/               runtime service accounts, least privilege  (M17-S17)
│   ├── cloudrun-service/  Cloud Run services + otel sidecar          (M17-S18)
│   ├── pubsub/            topics, push subscriptions, DLQs           (M17-S19)
│   ├── migrate-job/       TypeORM migration Cloud Run Job            (M17-S20)
│   ├── scheduler/         Cloud Scheduler cron → Pub/Sub             (M17-S21)
│   ├── edge/              Global ALB + NEGs + Cloudflare — prod only (M17-S22)
│   └── monitoring/        dashboards, alerts, uptime checks          (M17-S35)
└── envs/             # root modules — one state per env, never shared
    ├── staging/      # backend prefix envs/staging → project ikaro-staging
    └── prod/         # backend prefix envs/prod    → project ikaro-prod
```

**Rules (M17 Wave 2 preamble):**
- Modules are generic and env-agnostic; envs compose them. Env-specific values enter only through each env's `terraform.tfvars`.
- Each env is a separate root module with its own GCS state prefix. **No `terraform workspace` usage — ever.**
- Shared variable contract on every module and env: `project_id`, `environment` (validated `staging|prod`), `region` (default `southamerica-east1`), `labels`.
- Version constraints follow HashiCorp's module convention: **modules declare minimums only** (`>= 7.0` google, `>= 5.0` cloudflare in `modules/edge`, `required_version >= 1.15`); **the env roots own the real pins** (`~> 7.0`, `~> 1.15`) backed by their committed `.terraform.lock.hcl` files. Dependabot's `terraform` ecosystem watches both env roots and PRs pin updates (`.github/dependabot.yml`).

## Module dependency graph

```
network ──► database ─────────────┐
storage ──────────────────────────┤
secrets ──► iam ──────────────────┼──► cloudrun-service ──► pubsub ──► scheduler
registry (prod only) ─────────────┘          │
                                             ├──► migrate-job (+ database)
                                             ├──► edge (prod only)
                                             └──► monitoring
```

Instantiation order for a fresh env follows the arrows left to right. `registry` and `edge` exist only in `envs/prod` (D8: single registry serving both envs; D5: staging has no LB).

## Bootstrap prerequisites (M17-S08 — already done, manual, never Terraform)

Terraform assumes these exist (recorded in the operator-local `docs/BOOTSTRAP_LOG.md`, gitignored):

- Projects `ikaro-staging` / `ikaro-prod` with billing, budgets, and the required APIs enabled.
- State bucket **`gs://ikaro-tfstate`** (in `ikaro-prod`, `southamerica-east1`, versioned, uniform access, public access prevention). Env isolation is IAM-conditional on the object prefixes `envs/staging/*` / `envs/prod/*`.
- CI service accounts (`ikaro-tf-deployer@`, `ikaro-app-deployer@`, `ikaro-tf-planner@` × both projects) with Workload Identity Federation — **no SA keys exist anywhere; org policy blocks creating them.**

## Running locally (pre-pipeline only)

Until M17-S24 ships the infra pipeline, plans/applies run from the developer machine:

```bash
gcloud auth application-default login   # ADC as admin@ikaro.online — once per machine

cd infra/terraform/envs/staging         # or envs/prod
terraform init
terraform fmt -check -recursive ../..   # both must be clean before any PR
terraform validate
terraform plan                          # review before every apply
terraform apply
```

> ⚠️ **After M17-S24 goes live, ONLY the pipeline applies — never apply prod manually again.** Staging applies happen on merge to `main`; prod applies sit behind the `production-infrastructure` GitHub environment approval. A manual apply after that point bypasses review, drifts state mid-pipeline, and (for prod) sidesteps the WIF environment gate. If an emergency ever seems to require one, fix the pipeline instead — root cause, not workaround.

## State layout

| Env | Backend | State prefix | Project |
|---|---|---|---|
| staging | `gcs` / `ikaro-tfstate` | `envs/staging` | `ikaro-staging` |
| prod | `gcs` / `ikaro-tfstate` | `envs/prod` | `ikaro-prod` |

One state per env, never shared, no workspaces. Secret **values** never appear in state, tfvars, or git — Terraform creates secret *containers* only (M17 §2); values are populated out-of-band by the S27/S37 activation runbooks.

## Unit-test convention (M17 Wave 2 preamble)

Any module containing **logic** — variable `validation` blocks, `precondition`/`check` blocks, non-trivial locals (lookup maps, derived values) — ships native `terraform test` cases in `tests/*.tftest.hcl`, following HashiCorp module conventions:

- **`command = plan` + `mock_provider` only** — tests run with no credentials, create no resources, and cost nothing.
- Name files `*_unit_test.tftest.hcl` (plan mode); there are no apply-mode tests in this repo.
- Thin declarative modules (plain resource wrappers with no logic) are exempt — a test that restates the config adds nothing.
- Copy the working example: `modules/network/tests/variables_unit_test.tftest.hcl` (valid-input assert + `expect_failures` on an invalid input).

```bash
cd infra/terraform/modules/network
terraform init      # downloads the provider; still no credentials needed
terraform test
```

Tests run in CI from M17-S24's PR job; Checkov scans `infra/terraform/**` on every PR (`.github/workflows/pr-tests.yml`).

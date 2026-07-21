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

**`modules/scheduler`'s 4 cron jobs are real in both envs (M17-S21) — staging is not a dry run.** Once staging's Cloud Scheduler jobs are active, `ikaro-cron-reminders` genuinely emails whichever test users have bookings in staging's database, on the same `*/30 * * * *` cadence as prod. This is accepted, not a bug to fix — there is no lower-cost way to exercise the full Scheduler → Pub/Sub → push → trigger-handler path pre-production. Keep staging's booking data limited to real test accounts you're fine receiving reminder/expiry emails.

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

## Public-repository security

This directory is intentionally safe to publish, but it still describes the production topology. Treat project IDs/numbers, Cloud Run URLs, bucket names, service-account emails, secret **names**, and resource identifiers as non-secret operational metadata: they may be committed, but must never be relied on as an access control boundary.

- **Never commit a secret value**, a service-account key, an OAuth credential, a Terraform state/plan file, or an ADC credential. Terraform provisions Secret Manager containers only; populate and rotate values out of band as described in [`SECRETS.md`](SECRETS.md).
- Keep operator-only inputs in `local.auto.tfvars` or `TF_VAR_*`; `local.auto.tfvars` is gitignored. Do not force-add it. Tracked `terraform.tfvars` files may contain only reviewed, non-sensitive environment identifiers.
- Public access is exceptional and explicit: the hotsite assets bucket and the BFF/web Cloud Run services are intentionally public. Any other `allUsers` or `allAuthenticatedUsers` IAM grant must fail the custom Checkov rule unless it carries a documented, reviewed exception.
- The private uploads bucket must retain uniform bucket-level access and `public_access_prevention = "enforced"`. Do not put customer uploads, exports, logs, backups, or secret material in the public hotsite-assets bucket.
- Outputs are operational metadata, not secrets. Do not add secret-derived values to outputs; marking an output `sensitive` only masks terminal display and does not remove the value from Terraform state.
- **Never persist a plan file containing a genuine secret as a CI artifact.** `terraform plan -out=` embeds the real value of every variable needed to `apply` it later — `sensitive = true` only redacts *rendered* output (`terraform show`, CLI text), not the saved plan file's contents (Terraform's own docs are explicit about this). A workflow artifact on a public repo is downloadable by anyone with read access. `infra-deploy.yml`'s prod jobs never upload a plan artifact for this reason (`cloudflare_api_token` is a genuine credential, injected as `TF_VAR_cloudflare_api_token`): `apply-prod` re-plans and applies fresh, post-approval, instead of reusing a saved plan (real finding, M17-S24 review, 2026-07-21). Staging's plan artifact is safe to persist and reuse because none of its variables are marked `sensitive`.

### Remote-state verification

The `gs://ikaro-tfstate` bucket is a manual bootstrap prerequisite, so this repository cannot enforce its live configuration. Before the first apply and at least periodically thereafter, an authorized operator must verify that it is versioned, uses uniform bucket-level access, has public-access prevention enabled, grants no public principals, and limits read/write access to the intended Terraform CI/deployer identities. State can reveal the full infrastructure inventory even when this code deliberately keeps secret values out of it.

## IAM binding review discipline (read before adding any `google_*_iam_*` resource)

Every `google_*_iam_member` / `google_*_iam_binding` / `google_*_iam_policy` resource in this repo must specify an explicit, deliberately-reviewed `member`/`members` value. Never add `allUsers`, `allAuthenticatedUsers`, or a principal outside `ikaro.online`'s own domain without that being the specific, intentional point of the resource (e.g. `modules/storage`'s public hotsite bucket) — and call it out in review. **Do not assume an org-level policy will catch a mistake here** — current org-policy state (and the reasoning behind any project-level exception) lives in the gitignored, operator-local `docs/BOOTSTRAP_LOG.md`, not in this repo's public history.

**Enforced automatically, not just by review discipline:** a custom Checkov check (`CKV_IKARO_1`, `.checkov/custom_checks/no_public_iam_grant.py`) hard-fails CI on any `allUsers`/`allAuthenticatedUsers` grant across every IAM resource type used in this repo, unless explicitly suppressed with a documented `#checkov:skip=CKV_IKARO_1:<reason>` — same discipline as every other Checkov skip here. Static analysis only: it has no visibility into anything created outside this repo's `.tf` files. Reproduce CI's scan locally with:

```bash
cd infra/terraform
checkov -d . --framework terraform --external-checks-dir .checkov/custom_checks
```

## Unit-test convention (M17 Wave 2 preamble)

Any module containing **logic** — variable `validation` blocks, `precondition`/`check` blocks, non-trivial locals (lookup maps, derived values) — ships native `terraform test` cases in `tests/*.tftest.hcl`, following HashiCorp module conventions:

- **`command = plan` + `mock_provider` only** — tests run with no credentials, create no resources, and cost nothing.
- Name files `*_unit_test.tftest.hcl` (plan mode); there are no apply-mode tests in this repo.
- Thin declarative modules (plain resource wrappers with no logic) are exempt — a test that restates the config adds nothing.
- Copy the working example: `modules/network/tests/variables_unit_test.tftest.hcl` (valid-input assert + `expect_failures` on an invalid input).
- **Happy path + unhappy path, not just shape assertions (M17-S14 discovery, 2026-07-17):** every variable that carries a `validation` block needs both a valid-input case (plans clean) *and* an `expect_failures` case proving the invalid input is actually rejected — a validation block nobody's test exercises can silently rot. A resource-level `precondition`/`check` needs the same pair. Don't stop at "the happy-path plan looks right" — a config that *should* fail to plan and doesn't is exactly the kind of gap that surfaces as a live incident instead of a red test (see `modules/storage/tests/variables_unit_test.tftest.hcl`'s `rejects_empty_cors_origins` for the pattern: an empty CORS origin list would otherwise silently plan a bucket that blocks every browser upload).

```bash
cd infra/terraform/modules/network
terraform init      # downloads the provider; still no credentials needed
terraform test
```

Tests run in CI from M17-S24's PR job; Checkov scans `infra/terraform/**` on every PR (`.github/workflows/pr-tests.yml`).

## Gotchas (cross-cutting — read before touching Checkov config or app-consumed env vars)

- **`checkov --external-checks-dir` silently no-ops without an `__init__.py` in that directory.** No error, no warning at default log level — the scan just runs as if the directory didn't exist (same pass/fail counts as without it). Checkov's loader walks the directory tree and skips (INFO-level log only) any directory lacking `__init__.py` before importing anything inside it. `.checkov/custom_checks/` in this repo carries an (intentionally empty) `__init__.py` for exactly this reason — don't remove it, and add one to any new custom-checks directory.
- **The `bridgecrewio/checkov-action` GitHub Action's input is `external_checks_dirs` (plural)**, while the Checkov CLI flag it wraps is `--external-checks-dir` (singular). They are not the same string — copying one into the other silently does nothing (the Action ignores an unrecognized input key rather than failing). Verify against the action's own `action.yml` at the pinned SHA before trusting either name from memory.
- **Before writing a Terraform-side value for an app-consumed env var, trace how the app's own code actually composes it — don't infer the format from a story/plan doc's prose alone.** `GCS_PUBLIC_BASE_URL` was specified in `plan/M17-CLOUD-DEPLOY.md` as already including the bucket name (`https://storage.googleapis.com/ikaro-public-{env}`), but `GcsSignedUrlAdapter.getPublicUrl()` appends `GCS_PUBLIC_BUCKET_NAME` itself — the documented value would have doubled the bucket segment and broken every hotsite image URL. Caught only by reading the adapter source during M17-S14 discovery, not from the plan text. The general rule: any env var one module's Terraform sets and another codebase's adapter reads deserves a quick grep of the actual consuming code before the value is finalized.
- **`google_cloud_run_v2_service` has two similarly-shaped `scaling` blocks — putting a cap on the wrong one silently changes its meaning.** The top-level `scaling { max_instance_count }` is "combined maximum... for all revisions receiving traffic"; `template { scaling { max_instance_count } }` is "Scaling settings for this Revision" — per-revision. M17-S18 shipped with the connection-math-critical backend cap on `template.scaling` for a full review cycle: during a rolling deploy the old and new revisions both serve traffic, so each could independently reach the per-revision cap, silently doubling the real ceiling (and doubling the backend's DB connection count against the tier's limit). Neither Checkov, Snyk, nor Trivy catch this — it's a Cloud Run semantics issue, not a security/dependency one. Caught only by manual review. When a resource has two nested blocks with the same name and near-identical attributes, dump the provider's own JSON schema (`terraform providers schema -json`, or `jq` into it) and read each block's `description` — don't assume from either block's name or from prior experience with a different resource.
- **`check` blocks do not fail `terraform plan`/`apply` — they only warn.** Verified empirically (M17-S18): a `check { assert { condition = false ... } }` prints a `Warning: Check block assertion failed` and the command still exits `0`. If an invariant needs to actually block a bad apply (the same rigor as `tests/connection_math.tftest.hcl`'s cross-variable `validation`), use a `variable { validation {} }` (only when every referenced object is a variable/local in the same module — see next bullet) or a `lifecycle { precondition {} }` on a real resource. Reach for `check` only when a visible-but-non-blocking warning is the actual intent.
- **A `variable { validation {} }` condition CAN reference a `local` — but only if the condition also references the variable being validated itself somewhere in the same expression.** A condition that references *only* a local (no `var.<self>` anywhere) is rejected outright: `"The condition for variable \"x\" must refer to var.x in order to test incoming values."` A first attempt without the self-reference makes it look like locals are banned from variable validations entirely — they aren't. See `modules/cloudrun-service/variables.tf`'s `max_instance_count` validation (references `local.tier_max_connections` *and* `var.max_instance_count` together) for a working example.
- **Direct VPC egress has real, documented capacity and timing constraints — worth checking before sizing anything.** Per Google's own docs: Cloud Run consumes **~2 IP addresses per instance** on the subnet; Google's stated minimum subnet size is **`/26` or larger**; and a new instance's Direct VPC connection can take **"a minute or more"** to establish on cold startup. A too-strict startup probe budget (e.g. 3 retries × 10s = 30s) can kill an otherwise-healthy revision before it ever gets a chance to serve traffic — size the probe budget well past a minute, and size `max_instance_count` against the shared subnet's actual usable-IP count (accounting for every Direct-VPC service sharing that subnet, not just one).
- **A Cloud Run v2 service's default `*.run.app` URL is NOT deterministic — it's a per-project random hash** (e.g. `ikaro-bff-crle4i3nrq-rj.a.run.app`), confirmed via a real staging apply (M17-S18, 2026-07-19). An earlier version of this bullet claimed `<service-name>-<project-number>.<region>.run.app` was the format; that assumption is wrong. Terraform also cannot reference a resource's own computed output (e.g. `google_cloud_run_v2_service.this.uri`) from within that same resource's own configuration block, regardless of whether the URL were deterministic — for the handful of env vars a service needs pointing at *itself*, pick based on what the value actually needs to be:
  - If it must literally be the real URL (e.g. `GOOGLE_CALLBACK_URL`), there's no way around a two-apply bootstrap: apply once with a placeholder default, read the real value from the service's own `service_uri` output, paste it into the env's `terraform.tfvars` (e.g. `bff_real_uri` in `envs/staging/variables.tf`), apply again.
  - If it only needs to be *some* stable, self-consistent string both sides agree on (e.g. a Pub/Sub push OIDC audience), skip the URL problem entirely — mint a fixed, self-chosen string via `custom_audiences` instead (see `envs/staging/main.tf`'s `local.backend_pubsub_audience`, consumed by M17-S19's push subscriptions). No bootstrap dance needed.
- **A Secret Manager secret with zero versions fails the Cloud Run *deploy* that mounts it, not just leaves the env var empty.** Cloud Run resolves `value_source.secret_key_ref` at revision-creation time (a control-plane operation), not lazily inside the running container — so a service provisioned ahead of its secrets' real values being populated (e.g. M17-S18's placeholder-image bootstrap phase, before the S27 activation runbook runs) must gate secret-mounting behind the same flag that gates using the real image. Don't assume an empty/unpopulated secret container is harmless to reference.

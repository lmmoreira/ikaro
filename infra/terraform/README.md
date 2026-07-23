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
- **Never persist a plan file (or its JSON rendering) containing a genuine secret.** `terraform plan -out=` embeds the real value of every variable needed to `apply` it later — `sensitive = true` only redacts *rendered* output (`terraform show`, CLI text), not the saved plan file's contents (Terraform's own docs are explicit about this). Verified empirically (2026-07-21): `terraform show -json`'s top-level `.variables` key holds every input variable's raw value in cleartext too, including sensitive ones, even when that variable is only ever used in a provider block and never becomes a resource attribute (`cloudflare_api_token` is exactly this case — used only in `providers.tf`, never a resource attribute, yet still present in `.variables`). A workflow artifact on a public repo is downloadable by anyone with read access. Neither `infra-deploy.yml`'s `apply-staging` nor `apply-prod` reuses a saved plan artifact for this reason: both replan fresh at apply time instead (kept symmetric even though only prod currently has a genuine secret variable — a future sensitive variable in either env is already safe by default this way). Any `terraform show -json` output generated for other purposes (e.g. a sanitized PR-comment summary) must extract only non-attribute fields (resource addresses, action verbs) and delete the JSON file immediately after use.

### Remote-state verification

The `gs://ikaro-tfstate` bucket is a manual bootstrap prerequisite, so it is not a Terraform resource anywhere in this repo — the `terraform plan` drift checks below can never see a change to the bucket's own security posture. State can reveal the full infrastructure inventory even when this code deliberately keeps secret values out of it, so that posture matters (TD27).

Instead, `.github/workflows/infra-deploy.yml`'s `drift-prod` job runs a **"Verify state bucket security (TD27)"** step every week (same schedule as the Terraform drift checks, plus on-demand via `workflow_dispatch`): read-only `gcloud` calls, using the same `ikaro-tf-planner@ikaro-prod` credentials as the `terraform plan` step, assert the bucket's versioning/uniform-access/public-access-prevention settings against [`state-bucket-expected-config.json`](state-bucket-expected-config.json), that the bucket's IAM bindings are an **exact, exclusive allow-list match** (every allow-listed binding present, no unexpected extra binding), and that the project-level negative-condition binding that excludes the bucket from prod tf-deployer's broad `storage.admin` is present **and unique** for that role+member pair (the fix for the security bug found during M17-S08's bootstrap — checked for uniqueness because GCP evaluates IAM bindings additively, so a second broader binding would defeat the negative condition even while it stays present). That file is this repo's reviewable record of the bucket's intended configuration, replacing the gitignored `docs/BOOTSTRAP_LOG.md` as the source of truth for it — update it in the same PR as any deliberate, reviewed change to the bucket's security posture.

The check never prints a raw bucket-config value or IAM policy to the (public) job log — only `PASS`/`FAIL` per named assertion, since a failure is itself informative on a public repo and the underlying live values aren't needed to know something needs attention.

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
- **A narrow/new CI service account's permissions are unvalidated until it actually runs a real `terraform plan`/`apply` — a role list designed on paper is not evidence it works.** S08 designed `tf-planner`/`tf-deployer`'s roles by reasoning about what *should* be needed; every gap below only surfaced when M17-S24's pipeline put these identities through a live run for the first time. Every prior staging apply had run under a human operator's own broad ADC credentials, which silently masked all of this. When standing up any new narrow CI identity for Terraform, budget for at least one full iterative debugging pass against a real plan/apply — don't trust the role list alone, however carefully reasoned.
- **GCS IAM conditions scoped by `resource.name.startsWith(...)` do not cover `storage.objects.list`.** Confirmed empirically (M17-S24): `tf-planner`/`tf-deployer` both have `roles/storage.objectAdmin` conditioned to their own env's state prefix, which correctly gates `get`/`create`/`delete` on a specific object — but `terraform init`'s GCS backend also does a `list` call to check for existing state, and `storage.objects.list` is evaluated against the *bucket* as the resource, which never has an `/objects/envs/<env>` suffix to match against. The object-prefix condition can never satisfy it, list or no list, prefixed or not. Fix: a separate, unconditioned grant covering only `list` (e.g. `roles/storage.legacyBucketReader` — includes `storage.objects.list` + bucket metadata `get`, but deliberately not `storage.objects.get`, so it doesn't grant reading another env's actual state content).
- **`roles/viewer` deliberately excludes every `*.getIamPolicy` permission — a GCP design choice, not a bug.** `tf-planner`'s read-only `roles/viewer` couldn't read the IAM policy of any resource with a `google_*_iam_member` binding (storage buckets, Pub/Sub topics, service accounts, Cloud Run services, Artifact Registry, Secret Manager, projects — `modules/iam` and others create many), because "read the resource" and "read who has access to the resource" are deliberately separate permission classes in GCS's IAM model. The purpose-built fix is `roles/iam.securityReviewer` (`*.getIamPolicy` across nearly every GCP resource type, zero write permissions) — but that's broader than this codebase actually needs. What's actually granted (2026-07-21, narrowed the same day it was first added): a custom project-level role, `tfPlannerIamPolicyReader`, containing only the exact 8 `getIamPolicy` permissions matching every `google_*_iam_member` resource type actually present in this repo's Terraform (grep for `resource "google_.*_iam_(member|binding|policy)"` across `modules/` and `envs/` to get the current list — re-derive it, don't trust a stale copy, if the module set ever changes). Verified by removing the broader role first and re-testing a real plan with only the narrow one in place.
- **Managing a `google_project_iam_member` resource needs `roles/resourcemanager.projectIamAdmin` specifically — no other admin-tier role covers it.** `roles/storage.admin`/`roles/pubsub.admin`/etc. include `getIamPolicy`/`setIamPolicy` for *their own* resource type (confirmed via `gcloud iam roles describe`), but project-level IAM bindings are a distinct resource type (`cloudresourcemanager.googleapis.com`'s own IAM surface), not covered by any other service's admin role. `tf-deployer` needs this explicitly to apply any of `modules/iam`'s project-level grants (e.g. `roles/cloudsql.client`, `roles/cloudtrace.agent` bound to a runtime SA at the project level).
- **Removing a resource's `count` meta-argument entirely re-addresses it in state — even when going from `count = 1` to no `count` produces the same practical cardinality.** `module.database[0]` and a `count`-less `module.database` are different resource addresses to Terraform, so dropping `count` once a conditional is no longer needed plans a destroy-and-recreate of whatever's at `[0]` — catastrophic for a live, data-bearing resource like a Cloud SQL instance. If a `count = var.x ? 1 : 0` conditional needs to become permanent, hardcode `count = 1` instead of deleting the meta-argument — the resource keeps its `[0]` address, and the apply plans zero changes to the resource itself, only to how the count is computed. (TD30, 2026-07-22 — written into M17-S37's own runbook step before ever being hit for real, specifically to avoid this.)
- **Cancelling (or otherwise killing) a `terraform apply` mid-run leaves the GCS state lock orphaned — the process never gets a chance to release it.** The next `plan`/`apply` fails immediately with `Error acquiring the state lock`, reporting the dead run's `Who`/`Created` info. Confirm the reported holder process is actually gone (e.g. the GitHub Actions run that held it shows `cancelled`/`completed`), then clear it with `terraform force-unlock <ID>` — the ID is printed in the error's `Lock Info` block. Don't skip the "confirm it's actually dead" step: force-unlocking a lock still legitimately held by a running apply is how two applies end up racing each other.
- **A resource whose individual `Create()` call is still in-flight when the process is killed never gets written to Terraform state at all — but the underlying cloud API call keeps running to completion regardless.** State is only updated after a resource's create/update/destroy call returns; killing the process mid-call (e.g. a cancelled CI run) means state and live reality can silently diverge — the resource ends up existing for real (billed, in some cases minutes after the process death) with zero record of it in state. Confirmed live (incident, 2026-07-22/23): a cancelled `apply-prod` run was killed while `google_sql_database_instance.main` was still polling `Still creating...`; the instance finished creating for real minutes later, but never appeared in `terraform state list` / the remote state file. After any cancelled or killed apply, verify directly against the live provider (`gcloud ... describe`/`list`) for whatever was mid-flight — don't assume `terraform plan` against the (possibly incomplete) state tells the whole story.

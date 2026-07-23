# TD30 — Prod Terraform lacks bootstrap-mode gating for database/edge; no fast-fail on infra+app PR mixing

## Status
- **State**: ✅ Done — implemented on `bugfix/prod-gating`
- **Type**: Technical Debt / Infrastructure Safety
- **Priority**: High — blocks M17-S27 (staging activation) from ever completing without prematurely creating real prod billing/DNS side effects
- **Context**: `infra/terraform/envs/prod/{main.tf,terraform.tfvars}`, `infra/terraform/envs/staging/{main.tf,terraform.tfvars}` (the pattern being mirrored), `.github/workflows/infra-deploy.yml`'s `apply-prod` job, `.github/workflows/deploy-staging.yml` (M17-S25)
- **Created**: 2026-07-22
- **Discovered**: while verifying M17-S25's first live run — `deploy-staging.yml`'s push to Artifact Registry failed with a live IAM permission error; tracing it down found `ikaro-prod`'s Terraform state has zero resources (confirmed via `gcloud storage cat gs://ikaro-tfstate/envs/prod/default.tfstate`), because every `apply-prod` run in this workflow's history has been `cancelled` or is stuck `pending` — nobody has ever approved one
- **Scoped**: 2026-07-22, via `/story-discovery TD30`
- **Reviewed**: 2026-07-22, cross-tool review (Codex, PR #188) found 3 important gaps, all fixed same-day:
  1. `enable_database`/`enable_edge` were independent switches with nothing enforcing they change together — added a blocking cross-variable `validation` on `enable_edge` (not a `check` block — `infra/terraform/README.md` already documents `check` only warns, doesn't fail; empirically re-confirmed here too before trusting it).
  2. Story 2's CI check had no way to actually use the "unavoidable, noted in the PR" exception the underlying convention describes — added an `infra-app-mix-ok` label override.
  3. M17-S37's own text still described the pre-TD30 state (`enable_database=true`, 251 resources) as current, and its Step 3 didn't mention flipping the new flags — rewrote both to reflect the actual post-TD30 state.

---

## Problem

Two related gaps, found together during the same investigation:

### 1. The registry (and other non-cutover-sensitive resources) can't apply independently of prod's atomic go-live bundle

**Corrected during story-discovery, 2026-07-22** — the original framing of this section (prod "missing" staging's bootstrap gating, as an oversight) was wrong. Re-reading M17-S37's own story text found this is *deliberate*: its "Note from M17-S24" states `enable_database=true` is intentionally committed in prod (*"unlike staging, which stays `false` until S27 flips it"*), because S37's plan is **one atomic apply** creating the database, the edge module (ALB, Certificate Manager, Cloudflare DNS records), and everything else together — precisely because the edge module's own comment warns cert issuance + DNS + the ingress flip need to land in one apply to avoid a mid-cutover outage. Bundling `database`+`edge` together is the *correct* call for those two specifically.

**The actual gap is narrower and different:** M17-S27 (staging activation, Wave 4) has an undocumented dependency on part of that same atomic bundle. S27's own `Dependencies:` line reads *"Waves 2–3 complete (except S22/S26 which are prod-only)"* — explicitly excluding prod concerns — yet S27's own Step 3 (*"Trigger `deploy-staging.yml` → first real images deploy"*) can't succeed without the shared Artifact Registry (D8), which currently only comes into existence via that same all-or-nothing prod apply. Terraform applies the whole config, not module-by-module (no `-target` in this pipeline), so as things stand, S27 secretly requires S37 already having happened — the opposite of the milestone's own wave ordering (Wave 4 "Staging live" is meant to complete well before Wave 6 "Production go-live").

The registry module has no technical relationship to `database`/`edge` (verified: no cross-references in `main.tf`) — nothing requires it to be part of the same atomic bundle. Same for IAM and Secret Manager containers (S16/S17): they're inert until something reads them, no cutover-timing sensitivity at all.

Net effect: **the only thing currently preventing an early, safe partial apply is that `database`/`edge` aren't decoupled from the rest of prod's config** — not that prod needs the *whole* thing gated, just those two specifically.

### 2. No fast-fail CI check for PRs mixing `infra/terraform/**` and `apps/**` changes

`plan/M17-CLOUD-DEPLOY.md`'s Wave 3 preamble (M17-S24) already documents the convention: *"do not mix `infra/terraform/**` and `apps/**` changes in one PR; when unavoidable, note in the PR that infra applies first and re-run the app deploy if it won the race."* But this is currently enforced by human discipline only — nothing in CI actually checks for it, and a PR that violates it silently passes every other check.

## Why this matters

**For (1):** M17-S27 ("Staging activation: secrets, first real deploy, full validation") cannot actually complete its own acceptance criteria — a real, successful staging deploy — without the shared Artifact Registry (`ikaro-registry`, D8's single cross-project registry, M17-S15) existing in `ikaro-prod`. So getting the registry live currently means either:
- Doing the full, careful M17-S37 prod go-live now, out of sequence — even though the milestone's own wave structure ("Wave 4 — Staging live" containing S27, well before "Wave 6 — Production go-live" containing S36/S37) clearly intends staging activation to be achievable independently of production go-live.
- Or decoupling `database`/`edge` (the two resources that genuinely need to land together, deliberately, at S37) from everything else in prod's config (registry, IAM, secrets containers — none of which have any cutover-timing sensitivity), so `apply-prod` can create just those non-sensitive resources now, leaving `database`/`edge` exactly as bundled and deferred as S37 already intends.

The second option is the actual fix; the first is not a fix, it's forcing an unrelated milestone stage to happen early by accident. This TD does **not** propose changing how `database`/`edge` are bundled — that bundling is correct — only that the rest of prod's config shouldn't be held hostage to it.

**For (2):** without an automated check, the exact race this convention exists to prevent (an app deploy racing a Terraform apply against the same resources, mid-cutover) can only be caught by someone remembering to check the PR diff by hand.

## Live verification (2026-07-22)

- `gcloud storage cat gs://ikaro-tfstate/envs/prod/default.tfstate | jq '.resources | length'` → `0`. Confirmed via direct read of the real state object, not inferred.
- `gh run list --workflow=infra-deploy.yml` cross-referenced against every push-triggered run where `apply-staging` actually executed (5 total, out of 13 pushes in the workflow's whole history): `apply-prod` is `cancelled` in 3, `pending` in 2 (including the run that triggered this investigation). Zero successes, ever.
- `infra/terraform/envs/prod/terraform.tfvars:28`: `enable_database = true`.
- `infra/terraform/envs/prod/main.tf`: `module "database"` has `count = var.enable_database ? 1 : 0` (so it *would* be created); `module "edge"` has no `count` argument at all.
- Cross-checked prod's `bootstrap_mode` wiring: already correctly threaded through all 3 Cloud Run service compositions + the migrate job (mirrors staging) — the gap is specifically `database`/`edge`, not a repo-wide pattern miss.
- Read M17-S27 and M17-S37's full story text (`plan/M17-CLOUD-DEPLOY.md`) during story-discovery: confirmed `enable_database=true` in prod is a *deliberate* S37 design choice (one atomic apply bundling database + edge + everything else, "251 resources to add"), not an oversight — but found S27's own `Dependencies:` line ("Waves 2–3 complete... except S22/S26") doesn't acknowledge that its own Step 3 (first real staging deploy) needs the shared registry, which currently only exists as part of that same atomic prod bundle. That's the actual gap this TD closes — not prod's bundling choice itself.

## Proposed approach (finalized via story-discovery)

#### Story 1 — Decouple `database`/`edge` from the rest of prod's config, so the registry/IAM/secrets can apply early ✅ Done

Scoped narrowly (confirmed via story-discovery, 2026-07-22): gate only `database` and `edge` — not a wholesale mirror of staging's bootstrap pattern. Everything else in prod's config (registry, IAM, secrets containers, placeholder Cloud Run services, migrate job) is already safe to apply as-is.

- `enable_database`: flip `terraform.tfvars` to `false` for now (module's own `count` gate already exists — this is a one-line value fix, not a structural change). S37 flips it back to `true` when it's actually ready to go live. **Correction (M17-S27, 2026-07-23):** staging didn't end up just flipping its value back — its `enable_database` flag was removed entirely once turned on for good, since a flag that can only ever hold one value from then on stops being a real toggle (`modules/database`'s `count` gate no longer exists in `envs/staging/main.tf`). Prod's own flag stays exactly as this TD left it until S37; S37's own text (§ `plan/M17-CLOUD-DEPLOY.md`) already accounts for prod's harder constraint — its instance holds live data by the time that removal runs, so it hardcodes `count = 1` instead of deleting `count`, unlike staging's pre-creation removal.
- `edge`: add a new `enable_edge` variable (no Terraform-level default, same as `enable_database` — an explicit value is required in `terraform.tfvars`, not silently assumed), add `count = var.enable_edge ? 1 : 0` to `module "edge"`, set `enable_edge = false` in `terraform.tfvars`. Check for any other resource that references `module.edge[0].*` output and adjust for the new indexed-module shape (same pattern `enable_database`'s consumers already had to handle).
- Re-verify via `terraform plan` against real `ikaro-prod` (read-only, tf-planner credentials) that the resulting plan creates only registry, IAM, secrets containers, 3 placeholder Cloud Run services, and the migrate job — zero `google_sql_database_instance`, zero edge/ALB/Cloudflare resources.
- Update M17-S27's `Dependencies:` line and M17-S37's own text in `plan/M17-CLOUD-DEPLOY.md` (separate doc-gate edit, done alongside this TD — see below) so the next reader doesn't hit the same surprise this discovery session did.

**Verified (2026-07-22):** live `terraform plan` against real `ikaro-prod` (admin identity, read-only) — `219 to add, 0 to change, 0 to destroy` (down from S37's noted 251), `edge_lb_ip_address = ""` confirming the `try()` fallback works. Checked specifically for database/edge/Cloudflare resource creations: only IAM role bindings (`cloudsql.client` grants) and the inert `cloudflare-api-token` Secret Manager container appear — zero `google_sql_database_instance`, zero ALB/forwarding-rule/cert/Cloudflare-record resources.

#### Story 2 — Fast-fail CI check: reject a PR mixing `infra/terraform/**` and `apps/**`/`packages/**` ✅ Done

- New job (`pr-quality.yml`, mirroring the existing `dorny/paths-filter` pattern already used in `infra-deploy.yml`'s `detect-changes`): two filters (`infra`, `app`), fail immediately if both are true, with a message pointing at the documented convention (`plan/M17-CLOUD-DEPLOY.md`'s M17-S24 mixing note) and the re-run-if-you-lose-the-race remedy.
- Runs in parallel with lint/type-check (not a true blocking-first gate — restructuring every other job's `needs:` graph to force serialization is a much bigger, slower-for-the-common-case change than this problem justifies), but reports back in seconds since it's just a path diff, so in practice it surfaces before the slower jobs finish regardless.
- Add as a new required status check only after confirming a clean run on `main` post-merge (same ordering discipline as M17-S24's `actionlint`/`zizmor` — never register a required check before its producing workflow has run successfully on `main`).

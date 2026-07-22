# TD27 — Terraform state bucket security is documented, not codified or auditable

## Status
- **State**: Open — approach decided via `/story-discovery TD27` (2026-07-22), not yet implemented
- **Type**: Technical Debt / Infrastructure Security
- **Priority**: Medium (no active exploit — the actual GCP-level controls are applied and correct today; the gap is auditability/drift-protection, not a live hole)
- **Context**: `infra/terraform/README.md` § Bootstrap prerequisites, `gs://ikaro-tfstate` (M17-S08); `.github/workflows/infra-deploy.yml`'s existing `drift-prod` job (M17-S24)
- **Created**: 2026-07-20
- **Discovered**: during a security review of PR #173 (M17-S19, Pub/Sub module)
- **Scoped**: 2026-07-22, via `/story-discovery TD27`

---

## Problem

The Terraform state bucket (`gs://ikaro-tfstate`, `ikaro-prod`, `southamerica-east1`) and its security posture — versioning, uniform bucket-level access, public access prevention, and env-scoped IAM conditions restricting `envs/staging/*` vs `envs/prod/*` object prefixes — were created entirely out-of-band during M17-S08's bootstrap (`gcloud`/console commands, not Terraform). Per `infra/terraform/README.md` § Bootstrap prerequisites:

> Terraform assumes these exist (recorded in the operator-local `docs/BOOTSTRAP_LOG.md`, gitignored)

This means:
- Nothing in this repo can `terraform plan` to verify the bucket's current versioning/PAP/IAM settings still match what M17-S08 originally configured.
- There is no automated or repeatable way to detect drift (e.g. someone manually loosens the IAM condition, or disables versioning) short of a manual `gcloud storage buckets describe` + human review.
- The actual configuration record lives in a gitignored, operator-local file (`docs/BOOTSTRAP_LOG.md`) — not reviewable in PRs, not backed up in git history.

## Why this matters

Terraform state can reveal infrastructure topology (network CIDRs, service account emails, resource names) and, in some provider/resource combinations, values that are sensitive even if this repo's own `.tf` files never mark them `sensitive = true` (this repo deliberately keeps real secret *values* out of Terraform entirely — Secret Manager references only — but a provider quirk or a future resource type could still leak something into state without anyone noticing). The state bucket is the only backstop against that becoming freely readable by anyone who gains bucket access. If the bucket's IAM condition or public-access settings were ever weakened — accidentally, or via a compromised operator credential — there is currently no automated signal that would catch it.

This is not an active vulnerability today — the controls were correctly applied at bootstrap time, and no incident has occurred. This is a **process/auditability gap**: the security posture that state confidentiality depends on isn't self-verifying.

## Live verification (2026-07-22)

Per this TD's own "not yet investigated" callout, the bucket's actual live configuration was checked before choosing an approach:

- `gcloud storage buckets describe gs://ikaro-tfstate`: `versioning_enabled: true`, `uniform_bucket_level_access: true`, `public_access_prevention: enforced`, `location: SOUTHAMERICA-EAST1` — matches `docs/BOOTSTRAP_LOG.md` exactly.
- `gcloud storage buckets get-iam-policy gs://ikaro-tfstate`: bucket-level bindings match the documented set (conditional `objectAdmin` for both env tf-deployers, `.tflock`-scoped `objectAdmin` for both tf-planners added by M17-S24, unconditional `objectViewer` for both tf-planners) — no `allUsers`/`allAuthenticatedUsers`.
- `gcloud projects get-iam-policy ikaro-prod`: the negative-condition binding excluding `gs://ikaro-tfstate` from prod tf-deployer's project-level `storage.admin` (the original M17-S08 security-bug fix) is still intact.

**No drift found.** The gap this TD addresses is real but has not yet manifested — this is about closing a detection gap, not remediating a current misconfiguration.

## Chosen approach (decided via story-discovery, 2026-07-22)

Neither of the two originally-proposed candidates below, as literally written. Instead:

**Append read-only steps to the existing `drift-prod` job** in `.github/workflows/infra-deploy.yml`, after its current `terraform plan -detailed-exitcode` step, with `if: always()` so they still run even when that step already found Terraform-managed drift:

1. `gcloud storage buckets describe gs://ikaro-tfstate` → assert versioning / uniform bucket-level access / public access prevention match checked-in expected values.
2. `gcloud storage buckets get-iam-policy gs://ikaro-tfstate` → assert the bucket-level binding set matches checked-in expected values (no public principals).
3. `gcloud projects get-iam-policy ikaro-prod` → assert the negative-condition binding excluding the bucket from prod tf-deployer's broad `storage.admin` is still present — the specific defense needed to catch a regression of the actual M17-S08 bug, which lives at the *project* IAM level, not the bucket's own IAM policy.

Reuses the job's existing `ikaro-tf-planner@ikaro-prod` WIF auth — already has every permission needed (`roles/viewer` covers `storage.buckets.get`; the custom `tfPlannerIamPolicyReader` role, added by M17-S24 for a different reason, already includes `storage.buckets.getIamPolicy`) — **zero new IAM grants, zero new secrets, same weekly cron.**

The checked-in expected values (bucket config + the specific IAM bindings/conditions under test) become the durable, reviewable record this TD's AC requires, replacing the gitignored `docs/BOOTSTRAP_LOG.md` as the source of truth for intended state.

### Why not a dedicated Terraform root, and why not a normal `envs/prod` resource

Both rejected for the same underlying reason: whichever identity *applies* Terraform changes to the bucket needs write permission on it — and `ikaro-tf-deployer@ikaro-prod` (the identity `apply-prod` uses on every approved merge) was **deliberately** stripped of write access to `gs://ikaro-tfstate` itself as the direct fix for the M17-S08 security bug (project-level `storage.admin` now excludes the bucket via a negative IAM condition). Folding the bucket into `envs/prod`'s regularly-applied config forces a choice between two bad outcomes:

- Re-grant tf-deployer-prod write access to the bucket → undoes the exact boundary that fix was built to enforce, widening a routine automated app deploy's blast radius to include the state bucket's own security config.
- Don't re-grant it → the config plans/applies fine today (zero diff needs no write calls) but silently hard-fails mid-pipeline the first time anyone changes the bucket's IAM/settings for real — a permission error surfacing live in an unrelated prod deploy, not caught by design.

A separate Terraform root has the identical problem one level removed (whatever identity applies it needs the same write access) unless applied by a human via their own ADC rather than by CI — more moving parts for the same drift-detection outcome the read-only script gets for free, using an identity (tf-planner) that was already read-only by design.

*(Original two candidates, kept for history: (1) a separately-bootstrapped Terraform root with local state, applied manually and rarely; (2) a repeatable audited bootstrap script run periodically. Both are superseded by the approach above, which reuses the existing `drift-prod` job instead of introducing either a new root or a new schedule.)*

### Security discipline (required, not optional)

Because `infra-deploy.yml`'s logs are public (this repo is public) and every `drift-prod` run is publicly visible:

- **On failure, print only the name of the failed assertion — never the actual live value.** E.g. `FAIL: prod-storage-admin-exclusion condition missing`, not the real IAM policy JSON. This keeps public disclosure bounded to "which named check failed," never the live misconfigured value itself.
- **Never dump a full IAM policy** (bucket-level or project-level) to job output — filter/`jq` for only the specific binding(s) under test.
- Accepted residual, consistent with this repo's existing public-repo posture (`infra/terraform/README.md`'s treatment of bucket names/SA emails/project IDs as non-secret operational metadata): a red run is itself a visible pass/fail signal — unavoidable for any automated public check, and the intended tradeoff (fast detection vs. silence) rather than a new information leak.

## Acceptance Criteria

- [ ] `drift-prod` in `.github/workflows/infra-deploy.yml` gains steps (after the existing `terraform plan` step, `if: always()`) that assert `gs://ikaro-tfstate`'s versioning, uniform bucket-level access, public access prevention, and bucket-level IAM bindings against checked-in expected values
- [ ] `drift-prod` also asserts the project-level negative-condition binding excluding the bucket from prod tf-deployer's `storage.admin` — the specific defense against a regression of the M17-S08 bug class
- [ ] Expected values live in a checked-in, reviewable file (not only in the gitignored `docs/BOOTSTRAP_LOG.md`)
- [ ] Failure output names only the failed assertion — never echoes a live IAM policy or bucket-config value
- [ ] No new IAM grants, no new secrets, no new Terraform resource — the job continues using only `ikaro-tf-planner@ikaro-prod`'s existing permissions
- [ ] `infra/terraform/README.md` § Bootstrap prerequisites / Remote-state verification is updated to point at this automated check, replacing the "an authorized operator must verify... periodically" manual framing

## Open Questions

~~1. Should this drift-check run on a schedule, or stay a manual runbook item?~~ **Resolved 2026-07-22:** piggybacks on `drift-prod`'s existing weekly Monday 09:30 UTC cron — no separate schedule.

~~2. Is a from-scratch Terraform root worth the ongoing dual-management overhead, or is a simpler idempotent assertion script the better fit?~~ **Resolved 2026-07-22:** assertion script (`gcloud` + `jq`), appended to the existing `drift-prod` job — see "Chosen approach" above. A Terraform root was rejected due to the tf-deployer write-permission conflict with the M17-S08 fix.

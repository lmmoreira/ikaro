# TD27 — Terraform state bucket security is documented, not codified or auditable

## Status
- **State**: Open
- **Type**: Technical Debt / Infrastructure Security
- **Priority**: Medium (no active exploit — the actual GCP-level controls are applied and correct today; the gap is auditability/drift-protection, not a live hole)
- **Context**: `infra/terraform/README.md` § Bootstrap prerequisites, `gs://ikaro-tfstate` (M17-S08)
- **Created**: 2026-07-20
- **Discovered**: during a security review of PR #173 (M17-S19, Pub/Sub module)

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

## Proposed fix (not yet scoped as a story — needs its own discovery)

Two candidate approaches, not yet decided between:

1. **A separately-bootstrapped Terraform root for the state bucket itself**, using local (not GCS) state for that one root — avoiding the chicken-and-egg problem of the bucket managing its own backend config — reviewed/applied manually and rarely. This makes the bucket's IAM/versioning/PAP settings reviewable in a PR diff and gives `terraform plan` a way to detect drift against the last-applied config, at the cost of a second, differently-managed Terraform root that needs its own discipline (who applies it, how often, whether CI touches it at all).
2. **A repeatable, audited bootstrap script** (not Terraform) that can be re-run idempotently to assert the bucket's settings, checked into the repo (unlike the current gitignored log, with placeholders instead of anything sensitive) and run periodically — manually, or via a scheduled CI job with read-only credentials — to detect drift and alert.

Whichever direction is chosen should also address:
- Moving the *durable record* of the bucket's intended configuration out of the gitignored `docs/BOOTSTRAP_LOG.md` and into something reviewable (the log can stay for operator-specific bootstrap narration, but the target-state values shouldn't only exist there).
- Whether a periodic drift-check (scheduled Action or manual runbook item) is warranted given the low likelihood of unauthorized change relative to the blast radius if it happened.

**Not yet investigated**: the actual current live settings of `gs://ikaro-tfstate` — this TD was written without access to `docs/BOOTSTRAP_LOG.md`, which is gitignored/operator-local. Whoever picks this up should verify the bucket's current real configuration via `gcloud storage buckets describe gs://ikaro-tfstate` before choosing an approach, per the same "verify live infra state, don't assume" discipline `/story-discovery` already applies to devops stories.

## Acceptance Criteria (when this is picked up)

- [ ] The state bucket's intended security configuration (versioning, uniform access, public access prevention, env-scoped IAM condition) is expressed somewhere reviewable in this repo — either as a Terraform root or an audited script — not only in the gitignored operator log
- [ ] A way exists to detect drift between the bucket's live settings and its intended configuration (a `terraform plan`-style diff, or a script's assertion output) without requiring a human to manually run `gcloud` commands and compare by eye
- [ ] `infra/terraform/README.md` § Bootstrap prerequisites is updated to reflect the new mechanism, replacing the "recorded in the operator-local `docs/BOOTSTRAP_LOG.md`" framing
- [ ] Whichever approach is chosen does not create a circular dependency (the state bucket's own management must not require the state bucket to already exist and be correctly configured)

## Open Questions

1. Should this drift-check run on a schedule (e.g. a weekly GitHub Action with read-only credentials), or stay a manual runbook item exercised occasionally by the operator? Given the low-traffic, pre-production nature of the project today, a manual runbook item may be sufficient until real production traffic exists.
2. Is a from-scratch Terraform root worth the ongoing dual-management overhead (state bucket managed outside the bucket it creates), or is a simpler idempotent assertion script the better fit for a solo-operator project at this scale?

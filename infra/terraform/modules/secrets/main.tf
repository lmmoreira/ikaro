# modules/secrets — Secret Manager containers only. No values, no IAM
# (`foundation/modules/runtime-identities` owns most per-SA accessor bindings — originally
# M17-S17's `modules/iam`, moved under TD34's Foundation boundary and never reachable from a
# normal envs/* apply since — looping over the consumer map documented in
# plan/M17-CLOUD-DEPLOY.md's M17-S16 table and in SECRETS.md; the on-demand relay VM's own
# accessor grants are a documented exception living in modules/relay-vm/main.tf instead, see
# SECRETS.md). Values are populated out-of-band by the S27/S37 activation runbooks — never via
# Terraform (M17 §2).

locals {
  # Always-provisioned secrets (both envs) — catalog derived from the live
  # env schemas (apps/backend + apps/bff env.validation.ts), not the stale
  # M15-S06 list.
  base_secret_ids = [
    "db-password",
    # Distinct DDL-capable credential for the ikaro_migrator Postgres role
    # (docker/init-db.sh's local/CI role split, carried into cloud by
    # M17-S20) — db-password stays the app runtime's DML-only credential.
    "db-migrator-password",
    "jwt-secret",
    "internal-api-key",
    "platform-admin-key",
    "hotsite-revalidate-secret",
    "google-oauth-client-id",
    "google-oauth-client-secret",
    "brevo-smtp-key",
    # TD38: shared secret between web and BFF, checked by WebOnlyGuard on every BFF request —
    # app-layer defense-in-depth companion to the Cloud Run IAM lockdown.
    "web-internal-key",
    # M19-S02: chatbot LLM provider API keys. All 3 provisioned together even though only the
    # OpenRouter adapter is built yet (S03 builds the other two adapters against secrets that
    # already exist by then) — avoids repeating this same Terraform shape across S02/S03/S14.
    "openrouter-api-key",
    "anthropic-api-key",
    "openai-api-key",
    # M19-S08: OpenRouter's GET /api/v1/credits requires a Management/Provisioning key, a
    # distinct credential from openrouter-api-key above (which can't call this endpoint, and
    # vice versa). Container only here — the backend SA's accessor grant (foundation/**) and
    # cloudrun_backend's secret_env_vars wiring land in 2 follow-up PRs (TD39: a foundation IAM
    # grant on a not-yet-existing secret 404s at plan time; wiring secret_env_vars before the
    # accessor grant exists would fail the backend's Cloud Run deploy).
    "openrouter-management-api-key",
    # M20-S05: Cloudflare Turnstile secret key, used for server-side siteverify calls. Same
    # safe-row shape as openrouter-management-api-key above — container only here. Originally
    # BFF-only (BFF SA's accessor grant + cloudrun_bff's secret_env_vars wiring landed in 2
    # follow-up PRs); M20-S14 moved the consumer to the backend (the BFF's ALL_TRAFFIC egress had
    # no Cloud NAT, so its own siteverify call had no route out) — the backend SA now holds the
    # accessor grant and cloudrun_backend holds the secret_env_vars wiring instead. Either way,
    # the consuming adapter (CloudflareTurnstileAdapter.verify(), formerly TurnstileService.verify())
    # already degrades safely if this secret is unset (fails closed, 400, never a crash) — that's
    # what makes the safe row correct here.
    "turnstile-secret-key",
  ]

  # cloudflare-api-token is prod-only (edge module, S22/S23 — DNS:Edit scope).
  secret_ids = var.environment == "prod" ? concat(local.base_secret_ids, ["cloudflare-api-token"]) : local.base_secret_ids
}

resource "google_secret_manager_secret" "this" {
  for_each = toset(local.secret_ids)

  secret_id = each.key
  project   = var.project_id
  labels    = var.labels

  replication {
    auto {}
  }
}

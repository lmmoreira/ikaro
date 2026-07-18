# modules/secrets — Secret Manager containers only. No values, no IAM
# (M17-S17's `modules/iam` owns the per-SA accessor bindings, looping over
# the consumer map documented in plan/M17-CLOUD-DEPLOY.md's M17-S16 table
# and in SECRETS.md). Values are populated out-of-band by the S27/S37
# activation runbooks — never via Terraform (M17 §2).

locals {
  # Always-provisioned secrets (both envs) — catalog derived from the live
  # env schemas (apps/backend + apps/bff env.validation.ts), not the stale
  # M15-S06 list.
  base_secret_ids = [
    "db-password",
    "jwt-secret",
    "internal-api-key",
    "platform-admin-key",
    "hotsite-revalidate-secret",
    "google-oauth-client-id",
    "google-oauth-client-secret",
    "brevo-smtp-key",
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

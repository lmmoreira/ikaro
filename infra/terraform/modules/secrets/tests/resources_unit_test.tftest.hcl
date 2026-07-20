# Guards the live secret catalog (M17-S16, extended by M17-S20): the 9
# always-on containers, the prod-only cloudflare-api-token, automatic
# replication, and labels wiring — no values, no IAM (that's S17).

mock_provider "google" {}

variables {
  project_id  = "ikaro-test"
  environment = "staging"
  labels      = { env = "staging", managed-by = "terraform" }
}

run "staging_provisions_the_nine_base_secrets_only" {
  command = plan

  assert {
    condition = sort(keys(google_secret_manager_secret.this)) == sort([
      "db-password",
      "db-migrator-password",
      "jwt-secret",
      "internal-api-key",
      "platform-admin-key",
      "hotsite-revalidate-secret",
      "google-oauth-client-id",
      "google-oauth-client-secret",
      "brevo-smtp-key",
    ])
    error_message = "Staging must provision exactly the 9 base secrets — no cloudflare-api-token."
  }
}

run "prod_also_provisions_cloudflare_api_token" {
  command = plan

  variables {
    environment = "prod"
  }

  assert {
    condition     = contains(keys(google_secret_manager_secret.this), "cloudflare-api-token")
    error_message = "Prod must additionally provision cloudflare-api-token (edge module consumer)."
  }

  assert {
    condition     = length(google_secret_manager_secret.this) == 10
    error_message = "Prod must provision exactly 10 secrets (9 base + cloudflare-api-token)."
  }
}

run "every_secret_uses_automatic_replication" {
  command = plan

  assert {
    condition = alltrue([
      for s in google_secret_manager_secret.this : length(s.replication[0].auto) == 1
    ])
    error_message = "Every secret must use automatic (multi-region) replication — no user_managed region pinning."
  }
}

run "every_secret_carries_the_common_labels" {
  command = plan

  assert {
    condition = alltrue([
      for s in google_secret_manager_secret.this : s.labels == var.labels
    ])
    error_message = "Every secret must carry var.labels."
  }
}


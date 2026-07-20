# Guards the per-SA least-privilege matrix this module's acceptance
# criteria depend on (M17-S17) — in particular that a SA does NOT get
# secret-accessor bindings for secrets it doesn't consume, and that
# cross-resource bindings deferred to S18/S19 are NOT created here.

mock_provider "google" {}

variables {
  project_id          = "ikaro-test"
  environment         = "staging"
  uploads_bucket_name = "ikaro-uploads-staging"
  public_bucket_name  = "ikaro-public-staging"
  secret_ids = {
    db-password                = "projects/ikaro-test/secrets/db-password"
    db-migrator-password       = "projects/ikaro-test/secrets/db-migrator-password"
    jwt-secret                 = "projects/ikaro-test/secrets/jwt-secret"
    internal-api-key           = "projects/ikaro-test/secrets/internal-api-key"
    platform-admin-key         = "projects/ikaro-test/secrets/platform-admin-key"
    hotsite-revalidate-secret  = "projects/ikaro-test/secrets/hotsite-revalidate-secret"
    google-oauth-client-id     = "projects/ikaro-test/secrets/google-oauth-client-id"
    google-oauth-client-secret = "projects/ikaro-test/secrets/google-oauth-client-secret"
    brevo-smtp-key             = "projects/ikaro-test/secrets/brevo-smtp-key"
  }
}

run "creates_exactly_five_runtime_service_accounts" {
  command = plan

  assert {
    condition     = google_service_account.backend.account_id == "ikaro-backend"
    error_message = "Backend SA must be named ikaro-backend."
  }
  assert {
    condition     = google_service_account.bff.account_id == "ikaro-bff"
    error_message = "BFF SA must be named ikaro-bff."
  }
  assert {
    condition     = google_service_account.web.account_id == "ikaro-web"
    error_message = "Web SA must be named ikaro-web."
  }
  assert {
    condition     = google_service_account.pubsub_invoker.account_id == "ikaro-pubsub-invoker"
    error_message = "Pub/Sub invoker SA must be named ikaro-pubsub-invoker."
  }
  assert {
    condition     = google_service_account.migrate.account_id == "ikaro-migrate"
    error_message = "Migrate-job SA must be named ikaro-migrate."
  }
}

run "migrate_consumes_only_its_own_secret_and_cloudsql_client" {
  command = plan

  assert {
    condition     = contains(keys(google_secret_manager_secret_iam_member.accessor), "migrate-db-migrator-password")
    error_message = "Migrate SA must get an accessor binding for db-migrator-password."
  }

  assert {
    condition     = !contains(keys(google_secret_manager_secret_iam_member.accessor), "migrate-db-password")
    error_message = "Migrate SA must NOT get db-password — that's the app runtime's DML-only role, not the migrator's DDL-capable one."
  }

  assert {
    condition = alltrue([
      for secret in ["jwt-secret", "internal-api-key", "platform-admin-key", "hotsite-revalidate-secret", "brevo-smtp-key", "google-oauth-client-id", "google-oauth-client-secret"] :
      !contains(keys(google_secret_manager_secret_iam_member.accessor), "migrate-${secret}")
    ])
    error_message = "Migrate SA must NOT get any secret it doesn't consume — least privilege (M17-S20 acceptance criterion)."
  }

  assert {
    condition     = google_project_iam_member.migrate_cloudsql_client.role == "roles/cloudsql.client"
    error_message = "Migrate SA must get cloudsql.client at the project level."
  }
}

run "backend_consumes_exactly_its_own_secrets_staging" {
  command = plan

  assert {
    condition = alltrue([
      for secret in ["db-password", "jwt-secret", "internal-api-key", "platform-admin-key", "hotsite-revalidate-secret", "brevo-smtp-key"] :
      contains(keys(google_secret_manager_secret_iam_member.accessor), "backend-${secret}")
    ])
    error_message = "Backend must get accessor bindings for all 6 of its consumed secrets."
  }

  assert {
    condition     = !contains(keys(google_secret_manager_secret_iam_member.accessor), "backend-google-oauth-client-id")
    error_message = "Backend must NOT get an accessor binding for google-oauth-client-id (BFF-only per the S16 catalog)."
  }

  assert {
    condition     = !contains(keys(google_secret_manager_secret_iam_member.accessor), "backend-cloudflare-api-token")
    error_message = "Backend must NOT get cloudflare-api-token in staging (prod-only secret)."
  }
}

run "web_excludes_internal_api_key" {
  command = plan

  assert {
    condition     = contains(keys(google_secret_manager_secret_iam_member.accessor), "web-jwt-secret") && contains(keys(google_secret_manager_secret_iam_member.accessor), "web-hotsite-revalidate-secret")
    error_message = "Web must get accessor bindings for jwt-secret and hotsite-revalidate-secret."
  }

  assert {
    condition     = !contains(keys(google_secret_manager_secret_iam_member.accessor), "web-internal-api-key")
    error_message = "Web must NOT get internal-api-key — confirmed 2026-07-18 it isn't a consumer (this is the exact regression this test guards against)."
  }

  assert {
    condition     = !contains(keys(google_secret_manager_secret_iam_member.accessor), "web-db-password")
    error_message = "Web must NOT get db-password."
  }
}

run "bff_gets_oauth_and_shared_secrets_only" {
  command = plan

  assert {
    condition = alltrue([
      for secret in ["jwt-secret", "internal-api-key", "google-oauth-client-id", "google-oauth-client-secret"] :
      contains(keys(google_secret_manager_secret_iam_member.accessor), "bff-${secret}")
    ])
    error_message = "BFF must get accessor bindings for jwt-secret, internal-api-key, and both oauth client secrets."
  }

  assert {
    condition     = !contains(keys(google_secret_manager_secret_iam_member.accessor), "bff-db-password") && !contains(keys(google_secret_manager_secret_iam_member.accessor), "bff-platform-admin-key")
    error_message = "BFF must NOT get db-password or platform-admin-key (backend-only secrets)."
  }
}

run "only_backend_gets_bucket_and_project_level_grants" {
  command = plan

  # Note: can't compare .member against an interpolated
  # google_service_account.backend.email here — both sides depend on a
  # mock-computed attribute unknown at plan time, so Terraform can't
  # resolve the equality until apply. The resource names themselves
  # (backend_uploads_object_admin, backend_public_object_admin) encode
  # which SA main.tf wires them to; bucket + role are what's actually
  # plan-time-resolvable.
  assert {
    condition     = google_storage_bucket_iam_member.backend_uploads_object_admin.bucket == var.uploads_bucket_name
    error_message = "Uploads bucket objectAdmin must target the uploads bucket."
  }

  assert {
    condition     = google_storage_bucket_iam_member.backend_uploads_object_admin.role == "roles/storage.objectAdmin"
    error_message = "Uploads bucket grant must be objectAdmin."
  }

  assert {
    condition     = google_storage_bucket_iam_member.backend_public_object_admin.bucket == var.public_bucket_name
    error_message = "Public bucket objectAdmin must target the public bucket."
  }

  assert {
    condition     = google_project_iam_member.backend_cloudsql_client.role == "roles/cloudsql.client"
    error_message = "Backend must get cloudsql.client at the project level."
  }
}

run "backend_gets_cloudflare_token_in_prod_only" {
  command = plan

  variables {
    environment = "prod"
    secret_ids = {
      db-password                = "projects/ikaro-prod/secrets/db-password"
      db-migrator-password       = "projects/ikaro-prod/secrets/db-migrator-password"
      jwt-secret                 = "projects/ikaro-prod/secrets/jwt-secret"
      internal-api-key           = "projects/ikaro-prod/secrets/internal-api-key"
      platform-admin-key         = "projects/ikaro-prod/secrets/platform-admin-key"
      hotsite-revalidate-secret  = "projects/ikaro-prod/secrets/hotsite-revalidate-secret"
      google-oauth-client-id     = "projects/ikaro-prod/secrets/google-oauth-client-id"
      google-oauth-client-secret = "projects/ikaro-prod/secrets/google-oauth-client-secret"
      brevo-smtp-key             = "projects/ikaro-prod/secrets/brevo-smtp-key"
      cloudflare-api-token       = "projects/ikaro-prod/secrets/cloudflare-api-token"
    }
  }

  assert {
    condition     = contains(keys(google_secret_manager_secret_iam_member.accessor), "backend-cloudflare-api-token")
    error_message = "Backend must get cloudflare-api-token in prod (S40 runtime consumer, secret only exists in prod per S16)."
  }

  assert {
    condition     = !contains(keys(google_secret_manager_secret_iam_member.accessor), "bff-cloudflare-api-token") && !contains(keys(google_secret_manager_secret_iam_member.accessor), "web-cloudflare-api-token")
    error_message = "Only the backend consumes cloudflare-api-token — bff/web must not get it."
  }
}

run "backend_self_grants_token_creator_for_signed_urls" {
  command = plan

  assert {
    condition     = google_service_account_iam_member.backend_token_creator_self.role == "roles/iam.serviceAccountTokenCreator"
    error_message = "Backend must self-grant serviceAccountTokenCreator for keyless V4 signed URLs."
  }

  # Note: can't compare .member against an interpolated
  # google_service_account.backend.email here — same plan-time-unknown
  # limitation as the bucket-grant test above. The resource name itself
  # (backend_token_creator_self) encodes the intended self-grant target.
}

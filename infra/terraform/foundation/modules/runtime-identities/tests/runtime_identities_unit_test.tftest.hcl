mock_provider "google" {}

variables {
  environment         = "staging"
  project_id          = "ikaro-staging"
  public_bucket_name  = "ikaro-public-staging"
  uploads_bucket_name = "ikaro-uploads-staging"
  secret_ids = {
    "brevo-smtp-key"             = "projects/ikaro-staging/secrets/brevo-smtp-key"
    "db-migrator-password"       = "projects/ikaro-staging/secrets/db-migrator-password"
    "db-password"                = "projects/ikaro-staging/secrets/db-password"
    "google-oauth-client-id"     = "projects/ikaro-staging/secrets/google-oauth-client-id"
    "google-oauth-client-secret" = "projects/ikaro-staging/secrets/google-oauth-client-secret"
    "hotsite-revalidate-secret"  = "projects/ikaro-staging/secrets/hotsite-revalidate-secret"
    "internal-api-key"           = "projects/ikaro-staging/secrets/internal-api-key"
    "jwt-secret"                 = "projects/ikaro-staging/secrets/jwt-secret"
    "platform-admin-key"         = "projects/ikaro-staging/secrets/platform-admin-key"
    "web-internal-key"           = "projects/ikaro-staging/secrets/web-internal-key"
    "openrouter-api-key"         = "projects/ikaro-staging/secrets/openrouter-api-key"
    "anthropic-api-key"          = "projects/ikaro-staging/secrets/anthropic-api-key"
    "openai-api-key"             = "projects/ikaro-staging/secrets/openai-api-key"
  }
}

run "runtime_identities_are_least_privilege_and_complete" {
  command = plan

  assert {
    condition     = length(google_service_account.runtime) == 5 && alltrue([for account_id in ["ikaro-backend", "ikaro-bff", "ikaro-web", "ikaro-pubsub-invoker", "ikaro-migrate"] : contains([for service_account in values(google_service_account.runtime) : service_account.account_id], account_id)])
    error_message = "Foundation must own exactly the five dedicated runtime service accounts."
  }

  assert {
    condition = length(google_project_iam_member.runtime) == 6 && length(google_storage_bucket_iam_member.backend_object_admin) == 2 && sort(keys(google_secret_manager_secret_iam_member.accessor)) == sort([
      "backend-db-password", "backend-jwt-secret", "backend-internal-api-key", "backend-platform-admin-key", "backend-hotsite-revalidate-secret", "backend-brevo-smtp-key", "backend-openrouter-api-key", "backend-anthropic-api-key", "backend-openai-api-key",
      "bff-jwt-secret", "bff-internal-api-key", "bff-google-oauth-client-id", "bff-google-oauth-client-secret", "bff-web-internal-key",
      "web-jwt-secret", "web-hotsite-revalidate-secret", "web-web-internal-key",
      "migrate-db-migrator-password",
    ])
    error_message = "Foundation must grant exactly this set of per-SA secret accessor bindings — not just the right count."
  }

  assert {
    condition     = google_service_account_iam_member.backend_token_creator_self.role == "roles/iam.serviceAccountTokenCreator"
    error_message = "The backend self-grant must retain only its keyless signing role."
  }

  assert {
    condition     = length(google_service_account_iam_member.normal_deployer_runtime_service_account_user) == 5 && alltrue([for binding in values(google_service_account_iam_member.normal_deployer_runtime_service_account_user) : binding.role == "roles/iam.serviceAccountUser" && binding.member == "serviceAccount:ikaro-tf-deployer@ikaro-staging.iam.gserviceaccount.com"])
    error_message = "The normal deployer may act as only the five application runtime service accounts."
  }
}

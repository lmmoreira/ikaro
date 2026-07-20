# command = plan + mock_provider (Wave 2 preamble pattern) — no credentials,
# no resources created, zero cost. Run from the module directory:
#   terraform init && terraform test

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

run "accepts_valid_environment_and_defaults_region" {
  command = plan

  assert {
    condition     = var.region == "southamerica-east1"
    error_message = "Region must default to southamerica-east1 (São Paulo)."
  }
}

run "rejects_invalid_environment" {
  command = plan

  variables {
    environment = "production"
  }

  expect_failures = [
    var.environment,
  ]
}

# command = plan + mock_provider (Wave 2 preamble pattern) — no credentials,
# no resources created, zero cost. Run from the module directory:
#   terraform init && terraform test

mock_provider "google" {}

variables {
  project_id             = "ikaro-test"
  environment            = "prod"
  staging_project_id     = "ikaro-staging"
  staging_project_number = "729809528251"
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

run "accepts_numeric_staging_project_number" {
  command = plan

  assert {
    condition     = var.staging_project_number == "729809528251"
    error_message = "staging_project_number must accept a numeric GCP project number."
  }
}

run "rejects_non_numeric_staging_project_number" {
  command = plan

  variables {
    staging_project_number = "ikaro-staging" # a project ID, not a number — the exact mistake this validation guards against
  }

  expect_failures = [
    var.staging_project_number,
  ]
}

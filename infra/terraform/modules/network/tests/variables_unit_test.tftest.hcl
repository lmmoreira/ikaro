# Example unit test — the pattern every Wave 2 module with logic copies
# (M17 Wave 2 preamble): `command = plan` + `mock_provider`, so tests run
# with NO credentials configured, create NO resources, and cost NOTHING.
#
# Run from the module directory:
#   terraform init && terraform test

mock_provider "google" {}

variables {
  project_id  = "ikaro-test"
  environment = "staging"
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
    environment = "production" # only "staging" and "prod" are valid
  }

  expect_failures = [
    var.environment,
  ]
}

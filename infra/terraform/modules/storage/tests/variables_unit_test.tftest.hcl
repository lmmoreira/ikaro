# command = plan + mock_provider (Wave 2 preamble pattern) — no credentials,
# no resources created, zero cost. Run from the module directory:
#   terraform init && terraform test

mock_provider "google" {}

variables {
  project_id   = "ikaro-test"
  environment  = "staging"
  cors_origins = ["https://ikaro-web-729809528251.southamerica-east1.run.app"]
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

run "rejects_empty_cors_origins" {
  command = plan

  variables {
    cors_origins = []
  }

  expect_failures = [
    var.cors_origins,
  ]
}

# command = plan + mock_provider (Wave 2 preamble pattern) — no credentials,
# no resources created, zero cost. Run from the module directory:
#   terraform init && terraform test
#
# Reads the real infra/terraform/pubsub-catalog.json (jsondecode(file(...))
# in main.tf resolves path.module the same way under `terraform test` as
# under a real plan/apply) — no fixture needed, this is the actual
# generated catalog these tests exercise the module's for_each logic
# against.

mock_provider "google" {}

variables {
  project_id              = "ikaro-test"
  project_number          = "729809528251"
  environment             = "staging"
  backend_push_endpoint   = "https://ikaro-backend-crle4i3nrq-rj.a.run.app"
  backend_pubsub_audience = "ikaro-backend-staging-pubsub-push"
  backend_sa_email        = "ikaro-backend@ikaro-test.iam.gserviceaccount.com"
  pubsub_invoker_sa_email = "ikaro-pubsub-invoker@ikaro-test.iam.gserviceaccount.com"
}

run "accepts_valid_inputs_and_defaults_region" {
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

run "rejects_non_numeric_project_number" {
  command = plan

  variables {
    project_number = "ikaro-test" # a project ID, not a number — the exact mistake this validation guards against
  }

  expect_failures = [
    var.project_number,
  ]
}

run "rejects_non_https_push_endpoint" {
  command = plan

  variables {
    backend_push_endpoint = "http://ikaro-backend-crle4i3nrq-rj.a.run.app"
  }

  expect_failures = [
    var.backend_push_endpoint,
  ]
}

run "rejects_empty_pubsub_audience" {
  command = plan

  variables {
    backend_pubsub_audience = ""
  }

  expect_failures = [
    var.backend_pubsub_audience,
  ]
}

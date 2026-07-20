# command = plan + mock_provider (Wave 2 preamble pattern) — no credentials,
# no resources created, zero cost. Run from the module directory:
#   terraform init && terraform test

mock_provider "google" {}

variables {
  project_id            = "ikaro-test"
  environment           = "staging"
  service_account_email = "ikaro-migrate@ikaro-test.iam.gserviceaccount.com"
  image                 = "gcr.io/cloudrun/hello"
  network_id            = "projects/ikaro-test/global/networks/ikaro-vpc"
  subnet_id             = "projects/ikaro-test/regions/southamerica-east1/subnetworks/ikaro-subnet"
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

run "rejects_nonzero_max_retries" {
  command = plan

  variables {
    max_retries = 1
  }

  expect_failures = [
    var.max_retries,
  ]
}

run "rejects_invalid_vpc_egress" {
  command = plan

  variables {
    vpc_egress = "PUBLIC"
  }

  expect_failures = [
    var.vpc_egress,
  ]
}

run "defaults_to_the_compiled_mode_typeorm_command" {
  command = plan

  assert {
    condition     = var.command == tolist(["node", "node_modules/typeorm/cli.js", "migration:run", "-d", "dist/shared/database/data-source.js"])
    error_message = "Default command must invoke the plain typeorm CLI directly via node against compiled dist/ output — the runtime image has no pnpm/corepack (M17-S20 discovery)."
  }
}

run "defaults_max_retries_to_zero" {
  command = plan

  assert {
    condition     = var.max_retries == 0
    error_message = "max_retries must default to 0 — a failed migration must fail loudly, never retry into a half-applied state."
  }
}

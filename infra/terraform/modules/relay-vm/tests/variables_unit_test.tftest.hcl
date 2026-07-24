# command = plan + mock_provider only (M17 Wave 2 preamble): runs with no
# credentials, creates no resources, costs nothing.
#
# Run from the module directory:
#   terraform init && terraform test

mock_provider "google" {}

variables {
  project_id                   = "ikaro-test"
  environment                  = "staging"
  region                       = "southamerica-east1"
  zone                         = "southamerica-east1-a"
  subnet_id                    = "projects/ikaro-test/regions/southamerica-east1/subnetworks/ikaro-subnet-staging"
  network_id                   = "projects/ikaro-test/global/networks/ikaro-vpc-staging"
  iam_admin_user               = "admin@ikaro.online"
  platform_admin_key_secret_id = "projects/ikaro-test/secrets/platform-admin-key"
}

run "accepts_valid_environment_and_defaults" {
  command = plan

  assert {
    condition     = var.machine_type == "e2-micro"
    error_message = "machine_type must default to e2-micro."
  }

  assert {
    condition     = var.create == false
    error_message = "create must default to false — inert until deliberately toggled on."
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

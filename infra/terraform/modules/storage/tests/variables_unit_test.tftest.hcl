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

run "defaults_booking_photo_retention_to_365_days" {
  command = plan

  assert {
    condition     = var.booking_photo_retention_days == 365
    error_message = "booking_photo_retention_days must default to 365 (M17-S45 discovery decision)."
  }
}

run "rejects_retention_below_nearline_tiering_age" {
  command = plan

  variables {
    booking_photo_retention_days = 60
  }

  expect_failures = [
    var.booking_photo_retention_days,
  ]
}

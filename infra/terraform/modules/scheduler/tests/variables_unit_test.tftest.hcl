# command = plan + mock_provider (Wave 2 preamble pattern) — no credentials,
# no resources created, zero cost. Run from the module directory:
#   terraform init && terraform test

mock_provider "google" {}

variables {
  project_id     = "ikaro-test"
  project_number = "729809528251"
  environment    = "staging"
  cron_topic_ids = {
    cron-reminders              = "projects/ikaro-test/topics/ikaro-cron-reminders"
    cron-loyalty-expiry         = "projects/ikaro-test/topics/ikaro-cron-loyalty-expiry"
    cron-loyalty-expiry-warning = "projects/ikaro-test/topics/ikaro-cron-loyalty-expiry-warning"
    cron-outbox-relay           = "projects/ikaro-test/topics/ikaro-cron-outbox-relay"
  }
}

run "accepts_valid_inputs_and_defaults_region_and_schedule" {
  command = plan

  assert {
    condition     = var.region == "southamerica-east1"
    error_message = "Region must default to southamerica-east1 (São Paulo)."
  }

  assert {
    condition     = var.outbox_relay_schedule == "*/5 * * * *"
    error_message = "outbox_relay_schedule must default to */5 * * * * (TD24 D3)."
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

run "rejects_cron_topic_ids_missing_a_required_key" {
  command = plan

  variables {
    cron_topic_ids = {
      cron-reminders              = "projects/ikaro-test/topics/ikaro-cron-reminders"
      cron-loyalty-expiry         = "projects/ikaro-test/topics/ikaro-cron-loyalty-expiry"
      cron-loyalty-expiry-warning = "projects/ikaro-test/topics/ikaro-cron-loyalty-expiry-warning"
      # cron-outbox-relay deliberately omitted
    }
  }

  expect_failures = [
    var.cron_topic_ids,
  ]
}

run "rejects_malformed_outbox_relay_schedule" {
  command = plan

  variables {
    outbox_relay_schedule = "every 5 minutes" # not a 5-field cron expression
  }

  expect_failures = [
    var.outbox_relay_schedule,
  ]
}

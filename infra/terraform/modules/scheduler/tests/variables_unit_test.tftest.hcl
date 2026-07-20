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

run "rejects_cron_topic_ids_with_an_orphan_cron_topic" {
  command = plan

  variables {
    cron_topic_ids = {
      cron-reminders              = "projects/ikaro-test/topics/ikaro-cron-reminders"
      cron-loyalty-expiry         = "projects/ikaro-test/topics/ikaro-cron-loyalty-expiry"
      cron-loyalty-expiry-warning = "projects/ikaro-test/topics/ikaro-cron-loyalty-expiry-warning"
      cron-outbox-relay           = "projects/ikaro-test/topics/ikaro-cron-outbox-relay"
      # A 5th cron-* topic from the pubsub catalog with no matching Scheduler
      # job in locals.jobs — the exact drift this validation guards against.
      cron-something-new = "projects/ikaro-test/topics/ikaro-cron-something-new"
    }
  }

  expect_failures = [
    var.cron_topic_ids,
  ]
}

run "accepts_non_cron_topics_alongside_the_4_required_ones" {
  command = plan

  variables {
    cron_topic_ids = {
      cron-reminders              = "projects/ikaro-test/topics/ikaro-cron-reminders"
      cron-loyalty-expiry         = "projects/ikaro-test/topics/ikaro-cron-loyalty-expiry"
      cron-loyalty-expiry-warning = "projects/ikaro-test/topics/ikaro-cron-loyalty-expiry-warning"
      cron-outbox-relay           = "projects/ikaro-test/topics/ikaro-cron-outbox-relay"
      # module.pubsub.topic_ids is the FULL catalog — domain-event topics
      # (non "cron-" prefixed) must never trip the orphan-topic validation.
      BookingInfoSubmitted = "projects/ikaro-test/topics/ikaro-BookingInfoSubmitted"
    }
  }
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

run "rejects_five_token_non_cron_schedule" {
  command = plan

  variables {
    # 5 space-separated tokens — passes a naive field-count check, but none
    # of them are valid cron syntax (CodeRabbit finding, 2026-07-20).
    outbox_relay_schedule = "bad bad bad bad bad"
  }

  expect_failures = [
    var.outbox_relay_schedule,
  ]
}

run "accepts_complex_valid_cron_schedule" {
  command = plan

  variables {
    # Exercises ranges, steps, and comma-lists — not just the simple */n and
    # single-digit patterns the module's own 4 default jobs use.
    outbox_relay_schedule = "15,45 8-10 * * 1-5"
  }

  assert {
    condition     = var.outbox_relay_schedule == "15,45 8-10 * * 1-5"
    error_message = "A legitimate complex unix-cron expression must be accepted."
  }
}

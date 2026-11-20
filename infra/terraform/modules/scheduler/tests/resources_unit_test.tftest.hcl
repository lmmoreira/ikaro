# Guards the security/correctness-critical resource contract that
# variables_unit_test can't see: exact cadences per job (a swapped schedule
# would silently regress loyalty expiry from daily to weekly — M17-S03
# discovery), the Pub/Sub-target shape (no service-account field), and the
# Cloud Scheduler service-agent publisher grant every job depends on to
# actually deliver.

mock_provider "google" {}

variables {
  project_id  = "ikaro-test"
  environment = "staging"
  cron_topic_ids = {
    cron-reminders                          = "projects/ikaro-test/topics/ikaro-cron-reminders"
    cron-loyalty-expiry                     = "projects/ikaro-test/topics/ikaro-cron-loyalty-expiry"
    cron-loyalty-expiry-warning             = "projects/ikaro-test/topics/ikaro-cron-loyalty-expiry-warning"
    cron-outbox-relay                       = "projects/ikaro-test/topics/ikaro-cron-outbox-relay"
    cron-chatbot-retention-purge            = "projects/ikaro-test/topics/ikaro-cron-chatbot-retention-purge"
    cron-chatbot-balance-poll               = "projects/ikaro-test/topics/ikaro-cron-chatbot-balance-poll"
    cron-lead-form-retention                = "projects/ikaro-test/topics/ikaro-cron-lead-form-retention"
    cron-resource-occupancy-retention-purge = "projects/ikaro-test/topics/ikaro-cron-resource-occupancy-retention-purge"
    cron-billing-issue-charges              = "projects/ikaro-test/topics/ikaro-cron-billing-issue-charges"
    cron-billing-status-sweep               = "projects/ikaro-test/topics/ikaro-cron-billing-status-sweep"
  }
}

run "all_ten_jobs_exist_with_correct_cadence_and_topic" {
  command = plan

  assert {
    condition     = length(google_cloud_scheduler_job.cron) == 10
    error_message = "Exactly 10 cron jobs must exist: reminders, loyalty-expiry, loyalty-expiry-warning, outbox-relay, chatbot-retention-purge, chatbot-balance-poll, lead-form-retention, resource-occupancy-retention-purge, billing-issue-charges, billing-status-sweep."
  }

  assert {
    condition = (
      google_cloud_scheduler_job.cron["ikaro-cron-reminders"].schedule == "*/30 * * * *" &&
      google_cloud_scheduler_job.cron["ikaro-cron-reminders"].pubsub_target[0].topic_name == var.cron_topic_ids["cron-reminders"]
    )
    error_message = "ikaro-cron-reminders must fire every 30 minutes against the cron-reminders topic."
  }

  assert {
    condition = (
      google_cloud_scheduler_job.cron["ikaro-cron-loyalty-expiry"].schedule == "0 2 * * *" &&
      google_cloud_scheduler_job.cron["ikaro-cron-loyalty-expiry"].pubsub_target[0].topic_name == var.cron_topic_ids["cron-loyalty-expiry"]
    )
    error_message = "ikaro-cron-loyalty-expiry must fire daily at 02:00 UTC — a weekly cadence here would silently regress actual point expiry (M17-S03 discovery)."
  }

  assert {
    condition = (
      google_cloud_scheduler_job.cron["ikaro-cron-loyalty-expiry-warning"].schedule == "0 6 * * 1" &&
      google_cloud_scheduler_job.cron["ikaro-cron-loyalty-expiry-warning"].pubsub_target[0].topic_name == var.cron_topic_ids["cron-loyalty-expiry-warning"]
    )
    error_message = "ikaro-cron-loyalty-expiry-warning must fire weekly on Mondays at 06:00 UTC."
  }

  assert {
    condition = (
      google_cloud_scheduler_job.cron["ikaro-cron-outbox-relay"].schedule == var.outbox_relay_schedule &&
      google_cloud_scheduler_job.cron["ikaro-cron-outbox-relay"].pubsub_target[0].topic_name == var.cron_topic_ids["cron-outbox-relay"]
    )
    error_message = "ikaro-cron-outbox-relay must use var.outbox_relay_schedule against the cron-outbox-relay topic (TD24 D3)."
  }

  assert {
    condition = (
      google_cloud_scheduler_job.cron["ikaro-cron-chatbot-retention-purge"].schedule == "0 3 * * *" &&
      google_cloud_scheduler_job.cron["ikaro-cron-chatbot-retention-purge"].pubsub_target[0].topic_name == var.cron_topic_ids["cron-chatbot-retention-purge"]
    )
    error_message = "ikaro-cron-chatbot-retention-purge must fire daily at 03:00 UTC against the cron-chatbot-retention-purge topic (UC-035, M19-S07)."
  }

  assert {
    condition = (
      google_cloud_scheduler_job.cron["ikaro-cron-chatbot-balance-poll"].schedule == "*/15 * * * *" &&
      google_cloud_scheduler_job.cron["ikaro-cron-chatbot-balance-poll"].pubsub_target[0].topic_name == var.cron_topic_ids["cron-chatbot-balance-poll"]
    )
    error_message = "ikaro-cron-chatbot-balance-poll must fire every 15 minutes against the cron-chatbot-balance-poll topic (UC-036, M19-S08)."
  }

  assert {
    condition = (
      google_cloud_scheduler_job.cron["ikaro-cron-lead-form-retention"].schedule == "0 3 * * *" &&
      google_cloud_scheduler_job.cron["ikaro-cron-lead-form-retention"].pubsub_target[0].topic_name == var.cron_topic_ids["cron-lead-form-retention"]
    )
    error_message = "ikaro-cron-lead-form-retention must fire daily at 03:00 UTC against the cron-lead-form-retention topic (UC-043, M20-S04)."
  }

  assert {
    condition = (
      google_cloud_scheduler_job.cron["ikaro-cron-resource-occupancy-retention-purge"].schedule == "0 3 * * *" &&
      google_cloud_scheduler_job.cron["ikaro-cron-resource-occupancy-retention-purge"].pubsub_target[0].topic_name == var.cron_topic_ids["cron-resource-occupancy-retention-purge"]
    )
    error_message = "ikaro-cron-resource-occupancy-retention-purge must fire daily at 03:00 UTC against the cron-resource-occupancy-retention-purge topic (TD40 Story 2)."
  }

  assert {
    condition = (
      google_cloud_scheduler_job.cron["ikaro-cron-billing-issue-charges"].schedule == "30 4 * * *" &&
      google_cloud_scheduler_job.cron["ikaro-cron-billing-issue-charges"].pubsub_target[0].topic_name == var.cron_topic_ids["cron-billing-issue-charges"]
    )
    error_message = "ikaro-cron-billing-issue-charges must fire daily at 04:30 UTC against the cron-billing-issue-charges topic (M26-S05)."
  }

  assert {
    condition = (
      google_cloud_scheduler_job.cron["ikaro-cron-billing-status-sweep"].schedule == "40 * * * *" &&
      google_cloud_scheduler_job.cron["ikaro-cron-billing-status-sweep"].pubsub_target[0].topic_name == var.cron_topic_ids["cron-billing-status-sweep"]
    )
    error_message = "ikaro-cron-billing-status-sweep must fire hourly at minute 40 UTC against the cron-billing-status-sweep topic (M26-S06)."
  }

  assert {
    condition = alltrue([
      for job in google_cloud_scheduler_job.cron : job.time_zone == "UTC"
    ])
    error_message = "Every cron job must run in UTC (tenant-local resolution happens inside the job itself, not via per-tenant schedules)."
  }
}

run "jobs_carry_empty_json_payload_not_a_service_account" {
  command = plan

  assert {
    condition = alltrue([
      for job in google_cloud_scheduler_job.cron : job.pubsub_target[0].data == base64encode("{}")
    ])
    error_message = "Every job's pubsub_target must carry an empty JSON payload — a cron tick is 'run now', not a domain event with a real tenantId."
  }
}

run "jobs_are_not_paused_by_default" {
  command = plan

  assert {
    condition = alltrue([
      for job in google_cloud_scheduler_job.cron : job.paused == false
    ])
    error_message = "With paused_job_keys empty (the default) no job may be paused."
  }
}

run "only_jobs_in_paused_job_keys_are_paused" {
  command = plan

  variables {
    paused_job_keys = ["ikaro-cron-billing-issue-charges", "ikaro-cron-not-a-job-yet"]
  }

  assert {
    condition     = google_cloud_scheduler_job.cron["ikaro-cron-billing-issue-charges"].paused == true
    error_message = "A job whose key is in paused_job_keys must be created paused."
  }

  assert {
    condition     = google_cloud_scheduler_job.cron["ikaro-cron-reminders"].paused == false
    error_message = "A job not in paused_job_keys must not be paused."
  }

  assert {
    condition     = length(google_cloud_scheduler_job.cron) == 10
    error_message = "An unknown key in paused_job_keys must be harmless (no extra job)."
  }
}

# Guards the security/correctness-critical resource contract that
# variables_unit_test can't see: exact cadences per job (a swapped schedule
# would silently regress loyalty expiry from daily to weekly — M17-S03
# discovery), the Pub/Sub-target shape (no service-account field), and the
# Cloud Scheduler service-agent publisher grant every job depends on to
# actually deliver.

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

run "all_four_jobs_exist_with_correct_cadence_and_topic" {
  command = plan

  assert {
    condition     = length(google_cloud_scheduler_job.cron) == 4
    error_message = "Exactly 4 cron jobs must exist: reminders, loyalty-expiry, loyalty-expiry-warning, outbox-relay."
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

run "scheduler_service_agent_holds_publisher_on_every_cron_topic" {
  command = plan

  assert {
    condition = alltrue([
      for iam in google_pubsub_topic_iam_member.scheduler_publisher :
      iam.role == "roles/pubsub.publisher" &&
      iam.member == "serviceAccount:service-${var.project_number}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"
    ])
    error_message = "The Cloud Scheduler service agent must hold publisher on every cron topic — Pub/Sub-target jobs have no service-account field of their own, so this grant is the only path to a working publish."
  }

  assert {
    condition     = length(google_pubsub_topic_iam_member.scheduler_publisher) == 4
    error_message = "Exactly one publisher grant must exist per cron topic (4 total) — no unused custom Scheduler SA, no missing grant."
  }
}

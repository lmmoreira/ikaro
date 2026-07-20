# modules/scheduler — Cloud Scheduler cron jobs publishing to the cron
# Pub/Sub topics (S19). Implemented in M17-S21.
#
# Hand-authored, not scanner-derived: unlike modules/pubsub's topics/subs
# (which come from the code's own subscribe()/registerTrigger() call sites),
# Scheduler jobs — cadence + which topic to hit — aren't discoverable by
# scanning the backend. Adding a 5th cron trigger in code means adding its
# job here by hand too.
#
# Pub/Sub-target jobs have no service-account field (HTTP targets only) —
# the publish is performed by the built-in Cloud Scheduler service agent,
# granted pubsub.publisher on the 4 cron topics below. No custom Scheduler SA.
locals {
  # Loyalty's two concerns keep their pre-existing, independent cadences
  # (pre-M17 docs) — merging them onto one schedule would silently regress
  # actual point expiry from daily to weekly (an already-expired entry
  # staying visible/spendable in a customer's balance for up to 6 extra
  # days). See M17-S03's job-pattern unification for the two independent
  # trigger handlers this fans out to.
  jobs = {
    ikaro-cron-reminders = {
      topic_key = "cron-reminders"
      schedule  = "*/30 * * * *"
    }
    ikaro-cron-loyalty-expiry = {
      topic_key = "cron-loyalty-expiry"
      schedule  = "0 2 * * *"
    }
    ikaro-cron-loyalty-expiry-warning = {
      topic_key = "cron-loyalty-expiry-warning"
      schedule  = "0 6 * * 1"
    }
    ikaro-cron-outbox-relay = {
      topic_key = "cron-outbox-relay"
      schedule  = var.outbox_relay_schedule
    }
  }

  scheduler_service_agent = "service-${var.project_number}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"
}

resource "google_cloud_scheduler_job" "cron" {
  for_each = local.jobs

  project     = var.project_id
  region      = var.region
  name        = each.key
  description = "Ikaro cron tick — publishes to Pub/Sub topic ${each.value.topic_key}."
  schedule    = each.value.schedule
  time_zone   = "UTC"

  pubsub_target {
    topic_name = var.cron_topic_ids[each.value.topic_key]
    # Empty JSON payload — the tick itself carries no business fact, only
    # "run now" (M17-S03: cron ticks travel on a dedicated ITriggerBus
    # channel, not as a DomainEvent, precisely because they have no real
    # tenantId).
    data = base64encode("{}")
  }

  retry_config {
    retry_count = 3
  }
}

# Pub/Sub-target Scheduler jobs have no service-account field — publish is
# performed by the Cloud Scheduler service agent itself, which needs
# pubsub.publisher on every topic a job targets.
resource "google_pubsub_topic_iam_member" "scheduler_publisher" {
  for_each = local.jobs

  project = var.project_id
  topic   = var.cron_topic_ids[each.value.topic_key]
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${local.scheduler_service_agent}"
}

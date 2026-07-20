variable "environment" {
  description = "Deployment environment (staging or prod)"
  type        = string

  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "Environment must be \"staging\" or \"prod\"."
  }
}

variable "labels" {
  description = "Common labels applied to every resource that supports them"
  type        = map(string)
  default     = {}
}

variable "project_id" {
  description = "GCP project ID the resources are created in"
  type        = string
}

variable "project_number" {
  description = "GCP project number — used to construct the Cloud Scheduler service agent's principal (service-<number>@gcp-sa-cloudscheduler.iam.gserviceaccount.com), the identity Scheduler itself acts as when publishing a pubsub_target tick (Pub/Sub-target jobs have no service-account field of their own — that only exists for HTTP targets). Discover via: gcloud projects describe <project-id> --format='value(projectNumber)'"
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.project_number))
    error_message = "project_number must be a numeric GCP project number (e.g. \"729809528251\"), not a project ID."
  }
}

variable "region" {
  description = "GCP region for regional resources"
  type        = string
  default     = "southamerica-east1"
}

variable "cron_topic_ids" {
  description = "Map of cron trigger name -> full Pub/Sub topic resource id (module.pubsub.topic_ids from the env root — the full topic map, not just the 4 cron ones; this module only looks up the keys it needs). Must contain an entry for every topic_key referenced in this module's locals.jobs (cron-reminders, cron-loyalty-expiry, cron-loyalty-expiry-warning, cron-outbox-relay)."
  type        = map(string)

  validation {
    condition = alltrue([
      for key in ["cron-reminders", "cron-loyalty-expiry", "cron-loyalty-expiry-warning", "cron-outbox-relay"] :
      contains(keys(var.cron_topic_ids), key)
    ])
    error_message = "cron_topic_ids must include all 4 cron topics: cron-reminders, cron-loyalty-expiry, cron-loyalty-expiry-warning, cron-outbox-relay."
  }

  # Scheduler jobs are hand-authored (locals.jobs), not scanner-derived like
  # modules/pubsub's topics/subs — a cron cadence is a human decision with no
  # equivalent call site in application code to scan. That asymmetry means a
  # new registerTrigger('cron-*') call in the backend gets its topic
  # auto-provisioned by S19's scanner with nobody required to also add a
  # matching Scheduler job here — the topic would silently sit unpublished-to
  # forever. This closes that gap: any "cron-*" key present in the topic map
  # (the full pubsub catalog) must resolve to a job in locals.jobs.
  validation {
    condition = alltrue([
      for key in keys(var.cron_topic_ids) :
      !startswith(key, "cron-") || contains([for j in local.jobs : j.topic_key], key)
    ])
    error_message = "cron_topic_ids contains a cron-* topic with no matching Scheduler job in this module's locals.jobs (main.tf) — add an entry there for the new trigger before it can ship."
  }
}

variable "outbox_relay_schedule" {
  description = "Cron schedule for the outbox sweep + retention GC tick (TD24-S01/D3) — the durability guarantee behind the transactional outbox, independent of the inline-dispatch happy path."
  type        = string
  default     = "*/5 * * * *"

  validation {
    # Per-field unix-cron syntax, not just a field-count check: each of the 5
    # fields must be *, a number, a range (a-b), a step (*/n or a-b/n), or a
    # comma list of those — rejects alphabetic garbage that happens to split
    # into 5 tokens (e.g. "bad bad bad bad bad"), which a length-only check
    # would silently accept (CodeRabbit finding, 2026-07-20).
    condition = (
      length(split(" ", var.outbox_relay_schedule)) == 5 &&
      alltrue([
        for field in split(" ", var.outbox_relay_schedule) :
        can(regex("^(\\*|[0-9]+(-[0-9]+)?)(/[0-9]+)?(,(\\*|[0-9]+(-[0-9]+)?)(/[0-9]+)?)*$", field))
      ])
    )
    error_message = "outbox_relay_schedule must be a standard 5-field unix-cron expression (minute hour day month weekday) — each field must be *, a number, a range, a step, or a comma list of these."
  }
}

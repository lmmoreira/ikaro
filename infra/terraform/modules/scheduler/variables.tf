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
  description = "Map of cron trigger name -> full Pub/Sub topic resource id (module.pubsub.topic_ids from the env root). Must contain an entry for every topic_key referenced in this module's locals.jobs (cron-reminders, cron-loyalty-expiry, cron-loyalty-expiry-warning, cron-outbox-relay)."
  type        = map(string)

  validation {
    condition = alltrue([
      for key in ["cron-reminders", "cron-loyalty-expiry", "cron-loyalty-expiry-warning", "cron-outbox-relay"] :
      contains(keys(var.cron_topic_ids), key)
    ])
    error_message = "cron_topic_ids must include all 4 cron topics: cron-reminders, cron-loyalty-expiry, cron-loyalty-expiry-warning, cron-outbox-relay."
  }
}

variable "outbox_relay_schedule" {
  description = "Cron schedule for the outbox sweep + retention GC tick (TD24-S01/D3) — the durability guarantee behind the transactional outbox, independent of the inline-dispatch happy path."
  type        = string
  default     = "*/5 * * * *"

  validation {
    condition     = length(split(" ", var.outbox_relay_schedule)) == 5
    error_message = "outbox_relay_schedule must be a standard 5-field cron expression (minute hour day month weekday)."
  }
}

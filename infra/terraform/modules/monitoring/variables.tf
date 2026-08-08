variable "cloud_run_services" {
  description = "Map of logical service name (backend/bff/web) -> { service_name, max_instance_count }. Drives the 5xx-rate, p99-latency, and instance-count-stuck-at-max alert policies generically, and the dashboard's per-service tiles — this module never hardcodes a service name itself."
  type = map(object({
    service_name       = string
    max_instance_count = number
  }))
}

variable "collector_export_failure_threshold" {
  description = "Number of otel-collector 'Exporting failed. Dropping data.' log lines within a 10-minute window that trigger the alert. Confirmed live baseline (2026-08-06, M17-S34 follow-up): ~2 events / 363 requests / ~2h — this threshold is a starting point meant to catch a *change* from that baseline, not the baseline itself. Revisit once more live data accumulates."
  type        = number
  default     = 5
}

variable "database_instance_name" {
  description = "Cloud SQL instance name (modules/database's instance_name output) for the disk/CPU alert policies. Empty string skips both — staging always has a database; prod's is count-gated on enable_database until S37, so an empty string here means \"no database yet, skip these alerts\" rather than a hard failure."
  type        = string
  default     = ""
}

variable "dlq_subscription_pattern" {
  description = "Regex (Cloud Monitoring's monitoring.regex.full_match) matching every DLQ inspect subscription's ID, so the DLQ-depth alert covers every DLQ from S19's generated catalog without this module needing to parse infra/terraform/pubsub-catalog.json itself — the naming convention (ikaro-<event>-<consumer>-dlq-inspect, set by modules/pubsub) is the single source of truth this regex depends on instead."
  type        = string
  default     = "ikaro-.*-dlq-inspect"
}

variable "environment" {
  description = "Deployment environment (staging or prod)"
  type        = string

  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "Environment must be \"staging\" or \"prod\"."
  }
}

variable "error_burst_threshold" {
  description = "Number of severity=ERROR log entries (summed across backend+bff+web) within a 5-minute window that triggers the ERROR-burst alert. Starting baseline, not empirically tuned yet — revisit once real traffic gives a real error-rate baseline to calibrate against."
  type        = number
  default     = 10
}

variable "error_rate_5xx_duration_seconds" {
  description = "How long the 5xx ratio must stay above error_rate_5xx_threshold before the alert fires (cross-tool review finding, 2026-08-08: at this project's low pre-launch traffic volume, a single 5-minute window with e.g. 1 failing request out of 2 total already crosses a 5% ratio — a genuine false-positive risk the story's own MQL design didn't account for). Requiring the ratio to stay elevated across multiple consecutive alignment windows, not just one sparse sample, filters that out without needing a request-volume floor in the MQL itself."
  type        = number
  default     = 300
}

variable "error_rate_5xx_threshold" {
  description = "5xx response ratio (0-1 fraction) above which the alert fires. Story default: 5%."
  type        = number
  default     = 0.05
}

variable "labels" {
  description = "Common labels applied to every resource that supports them"
  type        = map(string)
  default     = {}
}

variable "notification_email" {
  description = "Email address for Cloud Monitoring alert notifications. Value never committed — gitignored local.auto.tfvars locally, a GitHub environment variable in the pipeline (S24, same treatment as iam_admin_user)."
  type        = string

  # Both env roots default this to "" (matching iam_admin_user's
  # never-committed pattern) — without this validation, an apply that
  # forgot to set TF_VAR_notification_email would plan cleanly and only
  # fail once it reaches Cloud Monitoring's API, aborting the whole module
  # since every alert policy references this channel (cross-tool review
  # finding, 2026-08-08).
  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.notification_email))
    error_message = "notification_email must be a non-empty email address — set TF_VAR_notification_email (pipeline: the NOTIFICATION_EMAIL GitHub Variable)."
  }
}

variable "p99_latency_threshold_ms" {
  description = "p99 request latency in milliseconds above which the alert fires. Story default: 2000ms (2s)."
  type        = number
  default     = 2000
}

variable "outbox_sweep_interval_seconds" {
  description = "The outbox relay's own sweep interval in seconds (module.scheduler's outbox_relay_schedule expressed as a number — the cron string and this alert threshold aren't mechanically linked, so keep them in sync manually if the schedule ever changes). Backs the outbox-backlog-age alert threshold (3x this value, TD24-S05 cross-reference)."
  type        = number
  default     = 300
}

variable "project_id" {
  description = "GCP project ID the resources are created in"
  type        = string
}

variable "region" {
  description = "GCP region for regional resources"
  type        = string
  default     = "southamerica-east1"
}

variable "sql_cpu_threshold" {
  description = "Cloud SQL CPU utilization (0-1 fraction) above which the alert fires."
  type        = number
  default     = 0.8

  validation {
    condition     = var.sql_cpu_threshold > 0 && var.sql_cpu_threshold <= 1
    error_message = "sql_cpu_threshold is a fraction in (0, 1] — a value like 80 would silently create an alert that never fires."
  }
}

variable "sql_disk_threshold" {
  description = "Cloud SQL disk utilization (0-1 fraction) above which the alert fires."
  type        = number
  default     = 0.8

  validation {
    condition     = var.sql_disk_threshold > 0 && var.sql_disk_threshold <= 1
    error_message = "sql_disk_threshold is a fraction in (0, 1] — a value like 80 would silently create an alert that never fires."
  }
}

variable "uptime_check_period_seconds" {
  description = "Uptime check interval. 300s (5 min) chosen 2026-08-08: at this project's traffic volume the cost delta vs. 60s is effectively $0 either way (both stay inside GCP's free tier — 2,000,000 requests, 180,000 vCPU-s, 360,000 GiB-s/month), so the real tradeoff is detection latency vs. check volume/log noise. 5 min still comfortably beats Cloud Run's idle-to-scale-down window, so cold-start masking for real users is unaffected. Must be one of GCP's allowed values."
  type        = number
  default     = 300

  validation {
    condition     = contains([60, 300, 600, 900], var.uptime_check_period_seconds)
    error_message = "GCP uptime checks only accept a period of 60, 300, 600, or 900 seconds."
  }
}

variable "uptime_checks" {
  description = "Map of check name -> { host, path, use_ssl } to create an uptime check + matching failure alert for. Env roots build this map from their own service URIs/domains (staging: run.app hosts; prod: bff.ikaro.online/ikaro.online, only once DNS resolves — see envs/prod/main.tf's enable_edge gating) so this module stays domain-agnostic. An empty map creates nothing — used by prod before S37's edge apply, when the target domains don't resolve yet and an uptime check against them would immediately and perpetually fail."
  type = map(object({
    host    = string
    path    = string
    use_ssl = bool
  }))
  default = {}
}

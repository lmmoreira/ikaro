# modules/monitoring — Dashboards, alert policies and uptime checks as code.
#
# Scope (M17-S35, narrowed 2026-08-08): infra-level signals that already
# exist — Cloud Run built-ins, Cloud SQL metrics, Pub/Sub DLQ depth, and the
# outbox relay's already-confirmed structured logs. No new application code
# required.
#
# OTel/Managed-Prometheus metrics (M17-S55, added 2026-08-12): one widget
# below (booking_creation_latency_widget) sources from Google Managed
# Prometheus via a native PromQL query (timeSeriesQuery.prometheusQuery, not
# timeSeriesFilter — see that local's own comment for why) instead of a
# native Cloud Monitoring metric — see that local's own comment for why its
# exact metric name is unconfirmed against live data and what to check
# before trusting it.
#
# Business/audit log-based counters (M17-S54, added 2026-08-12): bookings
# requested/approved/completed, notification failures, and customer/staff
# logins — each backed by a new AppLogger call added in this story (backend:
# request/approve/complete-booking use cases, base-notification use case;
# BFF: auth-controller-flow.service.ts's handleTenantLogin/handleStaffLogin
# — customer/staff login intentionally live in the BFF orchestration layer,
# not a generic reusable backend primitive that could later be reused by a
# non-login caller). No dev-auth log-based metric/alert: dev auth is
# unreachable in production and only exercised by Playwright/E2E harnesses
# in staging — not a signal worth monitoring.
#
# MQL query bodies below (5xx ratio) and log-based-metric filters encode
# string content Cloud Monitoring's API validates server-side, not something
# `terraform validate` or an offline `terraform test` (mock_provider) can
# catch — verify these live against a real staging apply before treating
# them as final, same discipline this repo already applies to the OTel
# pipeline (see docs/ENGINEERING_RULES.md § Cloud Run CPU throttling for why
# "the plan succeeded" is never proof alone).
#
# Confirmed live (first real staging apply, 2026-08-08): the error_rate_5xx
# MQL's `if(condition, val(), 0)` failed apply with "Operands of 'if' do not
# have same type: 'Double' and 'Int'" — `val()` from `align rate(5m)` is a
# Double, but the bare literal `0` is inferred as an Int. MQL requires both
# `if()` branches to share a type; fixed by writing `0.0` instead of `0`.
# Every other resource in this module (uptime checks, condition_threshold
# alerts, log-based metrics, the dashboard) applied cleanly on the same run
# — MQL's typed-if-branches quirk is specific to this one query, not a
# systemic issue with the module.
#
# Live-verified end-to-end (staging, 2026-08-09): a real outage (Cloud SQL
# instance stopped directly, not a staged bad revision) produced genuine
# alert emails for uptime_failure, error_rate_5xx (MQL ratio query — the
# `if()` fix above confirmed correct under real traffic, not just a clean
# apply), p99_latency, and dlq_undelivered (fired organically from real
# failed deliveries, not a deliberately-published poison message). All
# policies referenced the email notification channel correctly and fired
# within their configured windows. See docs/RUNBOOKS.md § Simulate an
# incident (verify alerts) for the reusable procedure and
# docs/10-OBSERVABILITY_STRATEGY.md for the acceptance-criteria writeup.

resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "Ikaro ${var.environment} — admin email"
  type         = "email"

  labels = {
    email_address = var.notification_email
  }

  user_labels = var.labels
}

# ---------------------------------------------------------------------------
# Uptime checks + failure alerts
# ---------------------------------------------------------------------------

resource "google_monitoring_uptime_check_config" "this" {
  for_each = var.uptime_checks

  project      = var.project_id
  display_name = "Ikaro ${var.environment} — ${each.key} uptime"
  timeout      = "10s"
  period       = "${var.uptime_check_period_seconds}s"

  http_check {
    path         = each.value.path
    port         = each.value.use_ssl ? 443 : 80
    use_ssl      = each.value.use_ssl
    validate_ssl = each.value.use_ssl
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = each.value.host
    }
  }
}

resource "google_monitoring_alert_policy" "uptime_failure" {
  for_each = var.uptime_checks

  project      = var.project_id
  display_name = "Ikaro ${var.environment} — ${each.key} uptime failure"
  combiner     = "OR"

  conditions {
    display_name = "${each.key} uptime check failing"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type=\"uptime_url\"",
        "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\"",
        "metric.label.check_id=\"${google_monitoring_uptime_check_config.this[each.key].uptime_check_id}\"",
      ])
      # Canonical Google-documented uptime-alert pattern (cross-tool review
      # finding, 2026-08-08): ALIGN_FRACTION_TRUE converts the BOOLEAN
      # check_passed series to a DOUBLE fraction, which REDUCE_COUNT_FALSE
      # (a boolean-input reducer) then rejects at apply — a real GCP API
      # type mismatch terraform validate/test can't catch. ALIGN_NEXT_OLDER
      # preserves the BOOLEAN type instead, so REDUCE_COUNT_FALSE can
      # correctly count literal "false" (failing) values across regions.
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "60s"

      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host", "resource.label.project_id"]
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  user_labels           = var.labels

  documentation {
    content   = "The ${each.key} uptime check (${each.value.host}${each.value.path}) has been failing. Check Cloud Run service health and recent deploys first."
    mime_type = "text/markdown"
  }
}

# ---------------------------------------------------------------------------
# Cloud Run alert policies — 5xx rate, p99 latency, instance count stuck at max
# ---------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "error_rate_5xx" {
  for_each = var.cloud_run_services

  project      = var.project_id
  display_name = "Ikaro ${var.environment} — ${each.key} 5xx rate > 5%"
  combiner     = "OR"

  conditions {
    display_name = "${each.key} 5xx rate over 5m"

    condition_monitoring_query_language {
      query = <<-MQL
        fetch cloud_run_revision
        | metric 'run.googleapis.com/request_count'
        | filter resource.service_name == '${each.value.service_name}'
        | align rate(5m)
        | { group_by [], [error_rate: aggregate(if(metric.response_code_class == '5xx', val(), 0.0))]
          ; group_by [], [total_rate: aggregate(val())] }
        | ratio
        | condition val() > ${var.error_rate_5xx_threshold}
      MQL
      # duration, not "0s" (cross-tool review finding, 2026-08-08): at this
      # project's low pre-launch traffic, a single 5-minute window can cross
      # a 5% ratio on e.g. 1 failing request out of 2 total — see
      # error_rate_5xx_duration_seconds's own description.
      duration = "${var.error_rate_5xx_duration_seconds}s"

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  user_labels           = var.labels

  documentation {
    content   = "${each.key}'s 5xx response rate exceeded 5% over a 5-minute window. Check recent deploys and Cloud Logging for the failing routes."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "p99_latency" {
  for_each = var.cloud_run_services

  project      = var.project_id
  display_name = "Ikaro ${var.environment} — ${each.key} p99 latency > 2s"
  combiner     = "OR"

  conditions {
    display_name = "${each.key} p99 latency over 10m"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type=\"cloud_run_revision\"",
        "resource.label.service_name=\"${each.value.service_name}\"",
        "metric.type=\"run.googleapis.com/request_latencies\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = var.p99_latency_threshold_ms
      duration        = "0s"

      aggregations {
        alignment_period     = "600s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MAX"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  user_labels           = var.labels

  documentation {
    content   = "${each.key}'s p99 request latency exceeded 2s over a 10-minute window."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "instance_count_stuck_at_max" {
  for_each = var.cloud_run_services

  project      = var.project_id
  display_name = "Ikaro ${var.environment} — ${each.key} instance count stuck at max"
  combiner     = "OR"

  conditions {
    display_name = "${each.key} instance count at max_instance_count for 15m"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type=\"cloud_run_revision\"",
        "resource.label.service_name=\"${each.value.service_name}\"",
        "metric.type=\"run.googleapis.com/container/instance_count\"",
      ])
      # Cloud Monitoring's MetricThreshold only supports COMPARISON_GT and
      # COMPARISON_LT (cross-tool review finding, 2026-08-08 — COMPARISON_GE
      # is a valid Terraform-schema enum value but rejected by the live API)
      # — GT against (max - 1) preserves the intended ">=" semantics.
      comparison      = "COMPARISON_GT"
      threshold_value = each.value.max_instance_count - 1
      duration        = "900s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MAX"
        # group_by_fields on revision_name (cross-tool review finding,
        # 2026-08-08): max_instance_count is enforced per-revision by Cloud
        # Run (modules/cloudrun-service's own connection-math comment: two
        # revisions can each independently reach it during a rollout).
        # Without this, REDUCE_SUM combines old+new revisions' instance
        # counts during a deploy and can cross the threshold even though
        # neither revision is individually at its cap — a false positive.
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.revision_name"]
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  user_labels           = var.labels

  documentation {
    content   = "${each.key} has been running at its max_instance_count (${each.value.max_instance_count}) for 15 minutes — likely under-provisioned for current load, or a runaway request pattern."
    mime_type = "text/markdown"
  }
}

# ---------------------------------------------------------------------------
# Cloud SQL alert policies — count-gated on a database actually existing
# (staging: always; prod: only once enable_database=true, S37)
# ---------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "sql_disk" {
  count = var.database_instance_name != "" ? 1 : 0

  project      = var.project_id
  display_name = "Ikaro ${var.environment} — Cloud SQL disk > ${var.sql_disk_threshold * 100}%"
  combiner     = "OR"

  conditions {
    display_name = "Cloud SQL disk utilization"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type=\"cloudsql_database\"",
        "resource.label.database_id=\"${var.project_id}:${var.database_instance_name}\"",
        "metric.type=\"cloudsql.googleapis.com/database/disk/utilization\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = var.sql_disk_threshold
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  user_labels           = var.labels

  documentation {
    content   = "Cloud SQL instance ${var.database_instance_name} disk utilization exceeded ${var.sql_disk_threshold * 100}%."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "sql_cpu" {
  count = var.database_instance_name != "" ? 1 : 0

  project      = var.project_id
  display_name = "Ikaro ${var.environment} — Cloud SQL CPU > ${var.sql_cpu_threshold * 100}%"
  combiner     = "OR"

  conditions {
    display_name = "Cloud SQL CPU utilization"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type=\"cloudsql_database\"",
        "resource.label.database_id=\"${var.project_id}:${var.database_instance_name}\"",
        "metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = var.sql_cpu_threshold
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  user_labels           = var.labels

  documentation {
    content   = "Cloud SQL instance ${var.database_instance_name} CPU utilization exceeded ${var.sql_cpu_threshold * 100}%."
    mime_type = "text/markdown"
  }
}

# ---------------------------------------------------------------------------
# DLQ depth alert — one policy, one condition, regex-matched across every
# DLQ inspect subscription (per-DLQ incidents fire independently since each
# matching subscription is its own time series; no need to enumerate S19's
# catalog here — see dlq_subscription_pattern's description).
# ---------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "dlq_undelivered" {
  project      = var.project_id
  display_name = "Ikaro ${var.environment} — DLQ has undelivered messages"
  combiner     = "OR"

  conditions {
    display_name = "Any DLQ topic with undelivered messages > 0 for 10m"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type=\"pubsub_subscription\"",
        "resource.label.subscription_id=monitoring.regex.full_match(\"${var.dlq_subscription_pattern}\")",
        "metric.type=\"pubsub.googleapis.com/subscription/num_undelivered_messages\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "600s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_MAX"
        cross_series_reducer = "REDUCE_NONE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  user_labels           = var.labels

  documentation {
    content   = "A dead-letter topic has undelivered messages — an event is silently failing to process. Inspect via `gcloud pubsub subscriptions pull <dlq>-inspect`, fix the root cause, then replay by re-publishing the original envelope to the source topic (handler idempotency via eventId makes replay safe — see plan/M17-CLOUD-DEPLOY.md's DLQ handling contract; the step-by-step replay runbook itself lands in docs/RUNBOOKS.md as an M17-S37 item, not yet written). DLQs are alert-only, never auto-consumed."
    mime_type = "text/markdown"
  }
}

# ---------------------------------------------------------------------------
# Log-based metrics + their alerts
# ---------------------------------------------------------------------------

resource "google_logging_metric" "error_count" {
  project     = var.project_id
  name        = "ikaro-${var.environment}-error-count"
  description = "Count of severity=ERROR log entries across backend/bff/web."
  filter      = "resource.type=\"cloud_run_revision\" AND severity=ERROR"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

# Confirmed live (prod's first apply, 2026-08-08): a google_logging_metric's
# Create() call returning success does not mean the metric is immediately
# queryable by the separate Cloud Monitoring alerting API — an alert policy
# referencing a metric created moments earlier in the same apply can 404
# with "Cannot find metric(s) ... could take up to 10 minutes to become
# available." Terraform's dependency graph (each policy below interpolates
# google_logging_metric.<x>.name) already sequences metric-before-policy
# correctly; this is GCP's own cross-service eventual-consistency delay,
# not a Terraform ordering bug — staging got lucky with timing on the exact
# same apply that failed this way in prod.
#
# create_duration = 600s (10 min), not an empirical guess: Google's own
# troubleshooting docs for this exact error
# (https://docs.cloud.google.com/monitoring/alerts/troubleshooting-alerts#alerting-policy-creation-fails)
# state "at least ten minutes" before resubmitting — an earlier version of
# this fix used 60s, which is exactly the unverified-empirical-buffer
# problem the vendor's own guidance already answers; this repo's
# time_sleep.iam_propagation precedent (30s, for a different propagation
# delay with no comparable vendor SLA) doesn't apply here.
#
# triggers, not depends_on alone (cross-tool review finding, 2026-08-08):
# time_sleep only sleeps on its own *first* create — depends_on orders that
# one-time create after the metrics, but a later apply that changes/
# recreates a metric (e.g. M17-S54 adding more log-based metrics to this
# module) would not re-run the wait, since the already-applied time_sleep
# resource has nothing forcing it to replace. Keying `triggers` on each
# metric's id forces time_sleep to replace (and its create_duration to
# re-run) whenever any watched metric's id changes.
resource "time_sleep" "log_metric_propagation" {
  create_duration = "600s"

  triggers = {
    error_count_id              = google_logging_metric.error_count.id
    outbox_backlog_age_id       = google_logging_metric.outbox_backlog_age.id
    collector_export_failure_id = google_logging_metric.collector_export_failure.id
    # M17-S54: none of the 6 new business counters have their own alert
    # policy, so none need a propagation-wait trigger here.
  }
}

resource "google_monitoring_alert_policy" "error_burst" {
  project      = var.project_id
  display_name = "Ikaro ${var.environment} — ERROR log burst"
  combiner     = "OR"

  depends_on = [time_sleep.log_metric_propagation]

  conditions {
    display_name = "severity=ERROR count over 5m"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type=\"cloud_run_revision\"",
        "metric.type=\"logging.googleapis.com/user/${google_logging_metric.error_count.name}\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = var.error_burst_threshold
      duration        = "0s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  user_labels           = var.labels

  documentation {
    content   = "More than ${var.error_burst_threshold} ERROR-level log entries in 5 minutes. Check Cloud Logging for the actual errors."
    mime_type = "text/markdown"
  }
}

# TD24-S05 cross-reference: OutboxRelayService already logs
# '[outbox] unpublished backlog' with an oldestUnpublishedAgeSeconds
# structured field — confirmed real, no code prerequisite (unlike the
# business counters split into M17-S54).
resource "google_logging_metric" "outbox_backlog_age" {
  project     = var.project_id
  name        = "ikaro-${var.environment}-outbox-backlog-age"
  description = "Oldest unpublished outbox row's age in seconds, extracted from OutboxRelayService's structured sweep log."
  filter      = "resource.type=\"cloud_run_revision\" AND jsonPayload.message=\"[outbox] unpublished backlog\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "s"
  }

  value_extractor = "EXTRACT(jsonPayload.oldestUnpublishedAgeSeconds)"

  bucket_options {
    exponential_buckets {
      num_finite_buckets = 32
      growth_factor      = 2
      scale              = 1
    }
  }
}

resource "google_monitoring_alert_policy" "outbox_backlog" {
  project      = var.project_id
  display_name = "Ikaro ${var.environment} — outbox backlog age"
  combiner     = "OR"

  depends_on = [time_sleep.log_metric_propagation]

  conditions {
    display_name = "Oldest unpublished outbox row older than 3 sweep intervals"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type=\"cloud_run_revision\"",
        "metric.type=\"logging.googleapis.com/user/${google_logging_metric.outbox_backlog_age.name}\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = var.outbox_sweep_interval_seconds * 3
      duration        = "0s"

      aggregations {
        alignment_period = "300s"
        # ALIGN_MAX is not a valid aligner for a DISTRIBUTION-valued metric
        # (cross-tool review finding, 2026-08-08 — outbox_backlog_age is
        # declared value_type = "DISTRIBUTION" above); ALIGN_PERCENTILE_99
        # is, and matches the same aligner already used for p99_latency.
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  user_labels           = var.labels

  documentation {
    content   = "The outbox relay's oldest unpublished row is older than 3 sweep intervals (${var.outbox_sweep_interval_seconds * 3}s) — events are backing up. Check OutboxRelayService logs and Pub/Sub connectivity."
    mime_type = "text/markdown"
  }
}

# M17-S34 follow-up: the collector's googlecloud exporter can silently drop
# a span batch on timeout — documented, accepted, low-frequency, but not
# actively monitored until now.
resource "google_logging_metric" "collector_export_failure" {
  project     = var.project_id
  name        = "ikaro-${var.environment}-collector-export-failure"
  description = "Count of otel-collector 'Exporting failed. Dropping data.' log lines (googlecloud exporter dropping a span batch on timeout)."
  filter      = "resource.type=\"cloud_run_revision\" AND textPayload:\"Exporting failed. Dropping data.\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_monitoring_alert_policy" "collector_export_failure" {
  project      = var.project_id
  display_name = "Ikaro ${var.environment} — collector export failures above baseline"
  combiner     = "OR"

  depends_on = [time_sleep.log_metric_propagation]

  conditions {
    display_name = "Collector 'Exporting failed' count over 10m"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type=\"cloud_run_revision\"",
        "metric.type=\"logging.googleapis.com/user/${google_logging_metric.collector_export_failure.name}\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = var.collector_export_failure_threshold
      duration        = "0s"

      aggregations {
        alignment_period     = "600s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]
  user_labels           = var.labels

  documentation {
    content   = "The otel-collector sidecar's span export-failure rate exceeded its documented baseline (~2 events/363 requests/~2h). See infra/docker/otel-collector/README.md."
    mime_type = "text/markdown"
  }
}

# ---------------------------------------------------------------------------
# Business/audit log-based counters (M17-S54)
# ---------------------------------------------------------------------------

resource "google_logging_metric" "booking_requested" {
  project     = var.project_id
  name        = "ikaro-${var.environment}-booking-requested"
  description = "Count of 'Booking requested' log lines (RequestBookingUseCase), by tenant."
  filter      = "resource.type=\"cloud_run_revision\" AND jsonPayload.message=\"Booking requested\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "tenant_id"
      value_type  = "STRING"
      description = "Tenant the booking was requested for."
    }
  }

  label_extractors = {
    "tenant_id" = "EXTRACT(jsonPayload.tenantId)"
  }
}

resource "google_logging_metric" "booking_approved" {
  project     = var.project_id
  name        = "ikaro-${var.environment}-booking-approved"
  description = "Count of 'Booking approved' log lines (ApproveBookingUseCase), by tenant."
  filter      = "resource.type=\"cloud_run_revision\" AND jsonPayload.message=\"Booking approved\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "tenant_id"
      value_type  = "STRING"
      description = "Tenant the booking was approved for."
    }
  }

  label_extractors = {
    "tenant_id" = "EXTRACT(jsonPayload.tenantId)"
  }
}

resource "google_logging_metric" "booking_completed" {
  project     = var.project_id
  name        = "ikaro-${var.environment}-booking-completed"
  description = "Count of 'Booking completed' log lines (CompleteBookingUseCase), by tenant."
  filter      = "resource.type=\"cloud_run_revision\" AND jsonPayload.message=\"Booking completed\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "tenant_id"
      value_type  = "STRING"
      description = "Tenant the booking was completed for."
    }
  }

  label_extractors = {
    "tenant_id" = "EXTRACT(jsonPayload.tenantId)"
  }
}

resource "google_logging_metric" "notification_failed" {
  project     = var.project_id
  name        = "ikaro-${var.environment}-notification-failed"
  description = "Count of 'Notification failed' log lines (BaseNotificationUseCase.saveFailedLog), by tenant."
  filter      = "resource.type=\"cloud_run_revision\" AND jsonPayload.message=\"Notification failed\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "tenant_id"
      value_type  = "STRING"
      description = "Tenant the failed notification belonged to."
    }
  }

  label_extractors = {
    "tenant_id" = "EXTRACT(jsonPayload.tenantId)"
  }
}

resource "google_logging_metric" "customer_logins" {
  project     = var.project_id
  name        = "ikaro-${var.environment}-customer-logins"
  description = "Count of 'Customer login' log lines (AuthControllerFlowService.handleTenantLogin, BFF), by tenant."
  filter      = "resource.type=\"cloud_run_revision\" AND jsonPayload.message=\"Customer login\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "tenant_id"
      value_type  = "STRING"
      description = "Tenant the customer logged into."
    }
  }

  label_extractors = {
    "tenant_id" = "EXTRACT(jsonPayload.tenantId)"
  }
}

resource "google_logging_metric" "staff_logins" {
  project     = var.project_id
  name        = "ikaro-${var.environment}-staff-logins"
  description = "Count of 'Staff login' log lines (AuthControllerFlowService.handleStaffLogin, BFF), by tenant."
  filter      = "resource.type=\"cloud_run_revision\" AND jsonPayload.message=\"Staff login\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "tenant_id"
      value_type  = "STRING"
      description = "Tenant the staff member logged into."
    }
  }

  label_extractors = {
    "tenant_id" = "EXTRACT(jsonPayload.tenantId)"
  }
}

# ---------------------------------------------------------------------------
# Dashboard — one per env (this module is instantiated once per env root)
# ---------------------------------------------------------------------------

# gridLayout (not mosaicLayout): widgets auto-flow in reading order without
# needing hand-computed xPos/yPos per tile — mosaicLayout's Tile type
# requires explicit positions, which every widget below would otherwise
# default to (0,0), stacking them all on top of each other.
locals {
  service_widgets = [
    for key, svc in var.cloud_run_services : {
      title = "${key} — request rate / 5xx"
      xyChart = {
        dataSets = [
          {
            timeSeriesQuery = {
              timeSeriesFilter = {
                filter = "resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"${svc.service_name}\" AND metric.type=\"run.googleapis.com/request_count\""
                aggregation = {
                  alignmentPeriod    = "60s"
                  perSeriesAligner   = "ALIGN_RATE"
                  groupByFields      = ["metric.label.response_code_class"]
                  crossSeriesReducer = "REDUCE_SUM"
                }
              }
            }
            plotType = "STACKED_AREA"
          }
        ]
      }
    }
  ]

  latency_widgets = [
    for key, svc in var.cloud_run_services : {
      title = "${key} — p99 latency"
      xyChart = {
        dataSets = [
          {
            timeSeriesQuery = {
              timeSeriesFilter = {
                filter = "resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"${svc.service_name}\" AND metric.type=\"run.googleapis.com/request_latencies\""
                aggregation = {
                  alignmentPeriod  = "60s"
                  perSeriesAligner = "ALIGN_PERCENTILE_99"
                }
              }
            }
            plotType = "LINE"
          }
        ]
      }
    }
  ]

  instance_count_widgets = [
    for key, svc in var.cloud_run_services : {
      title = "${key} — instance count"
      xyChart = {
        dataSets = [
          {
            timeSeriesQuery = {
              timeSeriesFilter = {
                filter = "resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"${svc.service_name}\" AND metric.type=\"run.googleapis.com/container/instance_count\""
                aggregation = {
                  alignmentPeriod  = "60s"
                  perSeriesAligner = "ALIGN_MAX"
                }
              }
            }
            plotType = "LINE"
          }
        ]
      }
    }
  ]

  sql_widgets = var.database_instance_name != "" ? [
    {
      title = "Cloud SQL — connections / CPU"
      xyChart = {
        dataSets = [
          {
            timeSeriesQuery = {
              timeSeriesFilter = {
                filter = "resource.type=\"cloudsql_database\" AND resource.label.database_id=\"${var.project_id}:${var.database_instance_name}\" AND metric.type=\"cloudsql.googleapis.com/database/network/connections\""
                aggregation = {
                  alignmentPeriod  = "60s"
                  perSeriesAligner = "ALIGN_MEAN"
                }
              }
            }
            plotType = "LINE"
          },
          {
            timeSeriesQuery = {
              timeSeriesFilter = {
                filter = "resource.type=\"cloudsql_database\" AND resource.label.database_id=\"${var.project_id}:${var.database_instance_name}\" AND metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\""
                aggregation = {
                  alignmentPeriod  = "60s"
                  perSeriesAligner = "ALIGN_MEAN"
                }
              }
            }
            plotType = "LINE"
          }
        ]
      }
    }
  ] : []

  pubsub_widgets = [
    {
      title = "Pub/Sub — oldest unacked message age (push subscriptions)"
      xyChart = {
        dataSets = [
          {
            timeSeriesQuery = {
              timeSeriesFilter = {
                filter = "resource.type=\"pubsub_subscription\" AND resource.label.subscription_id!=monitoring.regex.full_match(\"${var.dlq_subscription_pattern}\") AND metric.type=\"pubsub.googleapis.com/subscription/oldest_unacked_message_age\""
                aggregation = {
                  alignmentPeriod  = "60s"
                  perSeriesAligner = "ALIGN_MAX"
                }
              }
            }
            plotType = "LINE"
          }
        ]
      }
    },
    {
      title = "Pub/Sub — DLQ depth (undelivered messages)"
      xyChart = {
        dataSets = [
          {
            timeSeriesQuery = {
              timeSeriesFilter = {
                filter = "resource.type=\"pubsub_subscription\" AND resource.label.subscription_id=monitoring.regex.full_match(\"${var.dlq_subscription_pattern}\") AND metric.type=\"pubsub.googleapis.com/subscription/num_undelivered_messages\""
                aggregation = {
                  alignmentPeriod  = "60s"
                  perSeriesAligner = "ALIGN_MAX"
                }
              }
            }
            plotType = "LINE"
          }
        ]
      }
    }
  ]

  # One tile per M17-S54 log-based business counter, aggregated across all
  # tenants (crossSeriesReducer = REDUCE_SUM, no groupByFields) — NOT broken
  # down by tenant_id on the chart itself, even though tenant_id stays a
  # label on the underlying log-based metric (see each google_logging_metric
  # resource above). A per-tenant STACKED_BAR breakdown was the original
  # design (2026-08-12), but Cloud Monitoring caps a chart at ~50 rendered
  # series — past that, a widget silently truncates (no error, missing
  # tenants just stop appearing) as active tenant count grows, which is the
  # actual, intended trajectory of this platform. Per-tenant drill-down is
  # handled instead by a Cloud Monitoring `dashboardFilters` pinned filter
  # (M17-S56, google_monitoring_dashboard.business below) — a viewer picks a
  # tenant in the console UI and these 6 widgets re-filter live, without any
  # per-widget change here. The tenant_id label also stays directly
  # filterable in Cloud Logging (`jsonPayload.tenantId="..."`) as a manual
  # fallback.
  business_counter_widgets = [
    for metric in [
      { title = "Bookings requested (total)", metric = google_logging_metric.booking_requested },
      { title = "Bookings approved (total)", metric = google_logging_metric.booking_approved },
      { title = "Bookings completed (total)", metric = google_logging_metric.booking_completed },
      { title = "Notifications failed (total)", metric = google_logging_metric.notification_failed },
      { title = "Customer logins (total)", metric = google_logging_metric.customer_logins },
      { title = "Staff logins (total)", metric = google_logging_metric.staff_logins },
      ] : {
      title = metric.title
      xyChart = {
        dataSets = [
          {
            timeSeriesQuery = {
              timeSeriesFilter = {
                filter = "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/${metric.metric.name}\""
                aggregation = {
                  alignmentPeriod    = "60s"
                  perSeriesAligner   = "ALIGN_RATE"
                  crossSeriesReducer = "REDUCE_SUM"
                }
              }
            }
            plotType = "LINE"
          }
        ]
      }
    }
  ]

  # M17-S55: GMP-sourced widget for the auto-instrumentation HTTP duration
  # histogram, filtered to POST /v1/bookings. Deliberately a single widget,
  # not a per-route family — this story's own AC scopes instrumentation
  # verification to this one endpoint (see plan/M17-CLOUD-DEPLOY.md).
  #
  # metric name below (http_server_duration_milliseconds_bucket) is written
  # from the documented OTel→Prometheus naming translation (dots become
  # underscores; the histogram's declared `unit: 'ms'` is spelled out as
  # `milliseconds`; Prometheus's own histogram convention appends `_bucket`
  # to the base name for the per-`le`-boundary series `histogram_quantile`
  # reads), cross-checked against the real pinned instrumentation-http@0.220.0
  # source (meter.createHistogram('http.server.duration', { unit: 'ms' }) —
  # the *old*, non-stable semconv name; this repo does not set
  # OTEL_SEMCONV_STABILITY_OPT_IN, so the newer `http.server.request.duration`
  # name is NOT what's actually emitted). That said: **this metric name is
  # unconfirmed against real, live GMP data** — no traffic has ever flowed
  # through this pipeline, and (like every other MQL/filter string in this
  # module, see the file header comment) the Cloud Monitoring API validates
  # it server-side only. `terraform plan`/`terraform test` can confirm the
  # JSON is well-formed, not that it renders real data. Before trusting this
  # widget: deploy, generate real POST /v1/bookings traffic, and confirm in
  # the Cloud Monitoring console (Metrics Explorer, PromQL mode) which metric
  # name GMP actually assigned, correcting this query if it differs.
  #
  # prometheusQuery (not timeSeriesFilter + perSeriesAligner), found via
  # cross-tool PR review on PR #362 (2026-08-12): the first version of this
  # widget used `timeSeriesFilter` + `perSeriesAligner = "ALIGN_PERCENTILE_99"`
  # directly on the raw histogram — invalid per Cloud Monitoring's own
  # Aligner reference (confirmed against
  # docs.cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.alertPolicies#Aligner):
  # ALIGN_PERCENTILE_99 is valid only for GAUGE and DELTA distribution
  # metrics, never CUMULATIVE — and GMP-exported OTLP histograms are
  # CUMULATIVE (this file's own buildOtlpMetricExporterOptions() explicitly
  # requests that temporality). Applying it directly would render an invalid
  # or empty panel. `timeSeriesQuery.prometheusQuery` (confirmed present in
  # the same API reference) sidesteps the aligner-type mismatch entirely —
  # standard PromQL `rate()` + `histogram_quantile()` is the correct,
  # well-documented way to compute a percentile from a cumulative histogram,
  # and is also directly runnable ad-hoc in Metrics Explorer's PromQL mode
  # for manual verification.
  #
  # http_route/http_method labels: instrumentation-http records these as
  # span/metric attributes `http.route`/`http.method` — sanitized to
  # `http_route`/`http_method` as Prometheus/GMP labels, same dots-to-
  # underscores translation as the metric name itself. http.route is the
  # route *template* (e.g. "/v1/bookings"), not the raw URL, so this does not
  # explode into one series per booking ID.
  booking_creation_latency_widget = [
    {
      title = "POST /v1/bookings — request duration (p99, GMP)"
      xyChart = {
        dataSets = [
          {
            timeSeriesQuery = {
              prometheusQuery = "histogram_quantile(0.99, sum(rate(http_server_duration_milliseconds_bucket{http_route=\"/v1/bookings\", http_method=\"POST\"}[5m])) by (le))"
            }
            plotType = "LINE"
          }
        ]
      }
    }
  ]

  # M17-S56: the combined dashboard was split into two — Engineering
  # (infra/performance signals) and Business (S54's tenant-labelled
  # counters) — so the tenant_id dashboardFilters pinned filter below only
  # ever sits above widgets it actually applies to. Every widget from the
  # original single dashboard_widgets concat must appear in exactly one of
  # the two lists below.
  engineering_dashboard_widgets = concat(
    local.service_widgets,
    local.latency_widgets,
    local.instance_count_widgets,
    local.sql_widgets,
    local.pubsub_widgets,
    local.booking_creation_latency_widget,
  )

  business_dashboard_widgets = local.business_counter_widgets
}

# Without this, Terraform has no way to know google_monitoring_dashboard.main
# and .engineering are the same underlying object — it plans a destroy of
# .main + a fresh create of .engineering instead of an in-place update,
# losing the live dashboard's resource identity/URL for no reason (confirmed
# via this PR's own staging/prod plan output: "1 to destroy" on .main before
# this block was added — cross-tool PR review finding, Codex, 2026-08-13).
# google_monitoring_dashboard.business has no prior address to move from —
# it's a genuinely new resource, correctly a create.
moved {
  from = google_monitoring_dashboard.main
  to   = google_monitoring_dashboard.engineering
}

resource "google_monitoring_dashboard" "engineering" {
  project = var.project_id
  dashboard_json = jsonencode({
    displayName = "Ikaro ${var.environment} — Engineering"
    gridLayout = {
      columns = "2"
      widgets = local.engineering_dashboard_widgets
    }
  })
}

resource "google_monitoring_dashboard" "business" {
  project = var.project_id
  dashboard_json = jsonencode({
    displayName = "Ikaro ${var.environment} — Business"
    # Pinned filter (no templateVariable) on the tenant_id label every one
    # of the 6 business-counter widgets' underlying log-based metric already
    # carries (see google_logging_metric resources above). Per Google's
    # DashboardFilter reference (com.google.monitoring.dashboard.v1.
    # DashboardFilter), omitting templateVariable makes this a pinned
    # filter that auto-applies to any widget whose data includes labelKey —
    # no per-widget query changes needed, and since only this dashboard's
    # widgets carry tenant_id, it's the only one affected. stringValue is
    # deliberately omitted so no tenant is pinned by default — the default
    # view stays every tenant's aggregate total, matching M17-S54. Like
    # every other query/filter string in this module (see file header
    # comment), this JSON is validated server-side only by the Cloud
    # Monitoring API — terraform validate/test can't confirm it renders a
    # working filter control; verify live in staging (pick a tenant in the
    # console, confirm the 6 charts re-filter) before trusting it.
    dashboardFilters = [
      {
        labelKey   = "tenant_id"
        filterType = "METRIC_LABEL"
      }
    ]
    gridLayout = {
      columns = "2"
      widgets = local.business_dashboard_widgets
    }
  })
}

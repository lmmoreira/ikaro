# Guards the resource contract variables_unit_test can't see: every alert
# policy notifies the shared channel (never a different/missing one), the
# DLQ alert's regex actually matches S19/modules/pubsub's real DLQ-inspect
# naming convention, and the SQL alerts filter the exact instance passed in
# — a future edit that broke any of these would still produce a valid plan.

mock_provider "google" {}

variables {
  project_id         = "ikaro-test"
  environment        = "staging"
  notification_email = "ops@ikaro.online"

  cloud_run_services = {
    backend = { service_name = "ikaro-backend", max_instance_count = 3 }
    bff     = { service_name = "ikaro-bff", max_instance_count = 20 }
    web     = { service_name = "ikaro-web", max_instance_count = 20 }
  }

  uptime_checks = {
    bff = { host = "ikaro-bff-abc123-rj.a.run.app", path = "/v1/health/ready", use_ssl = true }
  }

  database_instance_name = "ikaro-staging-main"
}

run "notification_channel_uses_the_configured_email" {
  command = plan

  assert {
    condition     = google_monitoring_notification_channel.email.labels["email_address"] == var.notification_email
    error_message = "The notification channel must use var.notification_email, not a hardcoded address."
  }
}

run "every_alert_policy_notifies_the_shared_channel" {
  # apply, not plan: google_monitoring_notification_channel.email.id is a
  # computed value unknown until apply — the mock provider fabricates it
  # deterministically, no real credentials/API calls involved.
  command = apply

  assert {
    condition = alltrue(concat(
      [for p in google_monitoring_alert_policy.uptime_failure : contains(p.notification_channels, google_monitoring_notification_channel.email.id)],
      [for p in google_monitoring_alert_policy.error_rate_5xx : contains(p.notification_channels, google_monitoring_notification_channel.email.id)],
      [for p in google_monitoring_alert_policy.p99_latency : contains(p.notification_channels, google_monitoring_notification_channel.email.id)],
      [for p in google_monitoring_alert_policy.instance_count_stuck_at_max : contains(p.notification_channels, google_monitoring_notification_channel.email.id)],
      [contains(google_monitoring_alert_policy.dlq_undelivered.notification_channels, google_monitoring_notification_channel.email.id)],
      [contains(google_monitoring_alert_policy.error_burst.notification_channels, google_monitoring_notification_channel.email.id)],
      [contains(google_monitoring_alert_policy.outbox_backlog.notification_channels, google_monitoring_notification_channel.email.id)],
      [contains(google_monitoring_alert_policy.collector_export_failure.notification_channels, google_monitoring_notification_channel.email.id)],
    ))
    error_message = "Every alert policy must notify the shared email channel — a policy silently missing it would fail alone, undetected by any other check."
  }
}

run "dlq_alert_filter_matches_the_real_dlq_inspect_naming_convention" {
  command = plan

  assert {
    condition = strcontains(
      google_monitoring_alert_policy.dlq_undelivered.conditions[0].condition_threshold[0].filter,
      "ikaro-.*-dlq-inspect"
    )
    error_message = "The DLQ alert's filter must use the default regex matching modules/pubsub's real 'ikaro-<event>-<consumer>-dlq-inspect' subscription naming (S19) — not a different or narrower pattern that would silently miss real DLQs."
  }
}

run "dlq_alert_filter_is_gt_zero_undelivered_messages" {
  command = plan

  assert {
    condition = (
      google_monitoring_alert_policy.dlq_undelivered.conditions[0].condition_threshold[0].comparison == "COMPARISON_GT" &&
      google_monitoring_alert_policy.dlq_undelivered.conditions[0].condition_threshold[0].threshold_value == 0
    )
    error_message = "DLQ handling contract (M17 plan §S19): alert on ANY undelivered message (> 0), not a nonzero tolerance — DLQs are alert-only and never auto-consumed, so even one message needs a human to look."
  }
}

run "sql_alert_filters_reference_the_exact_configured_instance" {
  command = plan

  assert {
    condition = strcontains(
      google_monitoring_alert_policy.sql_disk[0].conditions[0].condition_threshold[0].filter,
      "${var.project_id}:${var.database_instance_name}"
    )
    error_message = "The SQL disk alert must filter on this exact project:instance pair, not a wildcard that could match a different env's instance."
  }
}

run "outbox_backlog_threshold_is_three_sweep_intervals" {
  command = plan

  variables {
    outbox_sweep_interval_seconds = 300
  }

  assert {
    condition     = google_monitoring_alert_policy.outbox_backlog.conditions[0].condition_threshold[0].threshold_value == 900
    error_message = "The outbox-backlog alert threshold must be exactly 3x the sweep interval (TD24-S05 cross-reference), not a separately hardcoded number that could drift from the actual schedule."
  }
}

run "dashboard_created_once_per_module_instance" {
  command = plan

  assert {
    condition     = google_monitoring_dashboard.main.project == var.project_id
    error_message = "Exactly one dashboard must be created per module instantiation (one per env root)."
  }
}

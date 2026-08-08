# Guards the resource contract variables_unit_test can't see: every alert
# policy notifies the shared channel (never a different/missing one), the
# DLQ alert's regex actually matches S19/modules/pubsub's real DLQ-inspect
# naming convention, and the SQL alerts filter the exact instance passed in
# — a future edit that broke any of these would still produce a valid plan.

mock_provider "google" {}

variables {
  project_id         = "ikaro-test"
  environment        = "staging"
  notification_email = "ops@example.com"

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

run "every_alert_policy_declares_exactly_one_notification_channel" {
  # plan, not apply (infra/terraform/README.md: "command = plan + mock_provider
  # only ... there are no apply-mode tests in this repo" — cross-tool review
  # finding, 2026-08-08, corrected from an earlier apply-mode version).
  # google_monitoring_notification_channel.email.id is unknown at plan time,
  # so this can't assert *which* channel each policy references — only that
  # each declares exactly one, catching a policy silently shipped with zero
  # or multiple channels. Includes the SQL policies, missing from an earlier
  # version of this test (cross-tool review finding).
  command = plan

  assert {
    condition = alltrue(concat(
      [for p in google_monitoring_alert_policy.uptime_failure : length(p.notification_channels) == 1],
      [for p in google_monitoring_alert_policy.error_rate_5xx : length(p.notification_channels) == 1],
      [for p in google_monitoring_alert_policy.p99_latency : length(p.notification_channels) == 1],
      [for p in google_monitoring_alert_policy.instance_count_stuck_at_max : length(p.notification_channels) == 1],
      [for p in google_monitoring_alert_policy.sql_disk : length(p.notification_channels) == 1],
      [for p in google_monitoring_alert_policy.sql_cpu : length(p.notification_channels) == 1],
      [length(google_monitoring_alert_policy.dlq_undelivered.notification_channels) == 1],
      [length(google_monitoring_alert_policy.error_burst.notification_channels) == 1],
      [length(google_monitoring_alert_policy.outbox_backlog.notification_channels) == 1],
      [length(google_monitoring_alert_policy.collector_export_failure.notification_channels) == 1],
    ))
    error_message = "Every alert policy must declare exactly one notification channel — a policy silently shipped with zero would fail alone, undetected by any other check."
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

run "dashboard_contains_a_widget_per_service_plus_shared_tiles" {
  # Cardinality (exactly one dashboard per module instantiation) is a
  # syntactic property of the resource having no count/for_each — no
  # assertion can regress it, so this instead guards the real risk: a
  # broken `for` expression in one of the widget locals silently producing
  # an empty or truncated array while the plan still succeeds (cross-tool
  # review finding, 2026-08-08).
  command = plan

  assert {
    condition = (
      length(jsondecode(google_monitoring_dashboard.main.dashboard_json).gridLayout.widgets)
      == (3 * length(var.cloud_run_services)) + 3
    )
    error_message = "Expected 3 tiles per Cloud Run service (request rate, latency, instance count) plus 1 SQL tile (database_instance_name is set in this fixture) plus 2 Pub/Sub tiles — a broken widget local would still produce a valid but empty/truncated plan."
  }
}

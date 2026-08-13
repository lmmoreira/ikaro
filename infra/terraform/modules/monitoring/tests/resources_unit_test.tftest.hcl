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

run "business_counter_metrics_filter_on_their_exact_log_message" {
  command = plan

  assert {
    condition = alltrue([
      strcontains(google_logging_metric.booking_requested.filter, "\"Booking requested\""),
      strcontains(google_logging_metric.booking_approved.filter, "\"Booking approved\""),
      strcontains(google_logging_metric.booking_completed.filter, "\"Booking completed\""),
      strcontains(google_logging_metric.notification_failed.filter, "\"Notification failed\""),
      strcontains(google_logging_metric.customer_logins.filter, "\"Customer login\""),
      strcontains(google_logging_metric.staff_logins.filter, "\"Staff login\""),
    ])
    error_message = "Each M17-S54 log-based metric must filter on its own exact log message — a drifted filter would silently stop counting the real log line."
  }
}

run "business_counter_metrics_extract_tenant_id" {
  command = plan

  assert {
    condition = alltrue([
      google_logging_metric.booking_requested.label_extractors["tenant_id"] == "EXTRACT(jsonPayload.tenantId)",
      google_logging_metric.booking_approved.label_extractors["tenant_id"] == "EXTRACT(jsonPayload.tenantId)",
      google_logging_metric.booking_completed.label_extractors["tenant_id"] == "EXTRACT(jsonPayload.tenantId)",
      google_logging_metric.notification_failed.label_extractors["tenant_id"] == "EXTRACT(jsonPayload.tenantId)",
      google_logging_metric.customer_logins.label_extractors["tenant_id"] == "EXTRACT(jsonPayload.tenantId)",
      google_logging_metric.staff_logins.label_extractors["tenant_id"] == "EXTRACT(jsonPayload.tenantId)",
    ])
    error_message = "Every M17-S54 business counter must extract tenant_id from jsonPayload.tenantId — the 'by tenant' breakdown the story asks for depends on this label existing."
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

run "log_metric_propagation_sleep_is_wired_correctly" {
  # Guards the cross-tool review fix (2026-08-08): create_duration must
  # match GCP's own documented worst-case propagation window, and triggers
  # must reference all 3 log-based metrics' ids so a future metric change
  # (e.g. M17-S54) forces the sleep to re-run rather than being silently
  # skipped because time_sleep already exists in state.
  command = plan

  assert {
    condition     = time_sleep.log_metric_propagation.create_duration == "600s"
    error_message = "create_duration must be 600s (10 min) — Google's own troubleshooting docs for this exact error state 'at least ten minutes', not an unverified shorter empirical guess."
  }

  assert {
    condition = alltrue([
      contains(keys(time_sleep.log_metric_propagation.triggers), "error_count_id"),
      contains(keys(time_sleep.log_metric_propagation.triggers), "outbox_backlog_age_id"),
      contains(keys(time_sleep.log_metric_propagation.triggers), "collector_export_failure_id"),
    ])
    error_message = "triggers must reference every log-based metric with an alert policy consuming it — depends_on alone only orders the sleep's first create, it does not force a re-wait when a metric is later changed/recreated. M17-S54's 6 new business counters have no alert policy, so none need a trigger entry."
  }
}

run "engineering_dashboard_contains_a_widget_per_service_plus_shared_tiles" {
  # Cardinality (exactly one dashboard per module instantiation) is a
  # syntactic property of the resource having no count/for_each — no
  # assertion can regress it, so this instead guards the real risk: a
  # broken `for` expression in one of the widget locals silently producing
  # an empty or truncated array while the plan still succeeds (cross-tool
  # review finding, 2026-08-08). Split into engineering/business dashboards
  # in M17-S56 — this run covers the Engineering side only.
  command = plan

  assert {
    condition = (
      length(jsondecode(google_monitoring_dashboard.engineering.dashboard_json).gridLayout.widgets)
      == (3 * length(var.cloud_run_services)) + 3 + 1
    )
    error_message = "Expected 3 tiles per Cloud Run service (request rate, latency, instance count) plus 1 SQL tile (database_instance_name is set in this fixture) plus 2 Pub/Sub tiles plus 1 M17-S55 GMP booking-creation-latency tile — a broken widget local would still produce a valid but empty/truncated plan."
  }
}

run "business_dashboard_contains_exactly_the_six_business_counter_tiles" {
  # M17-S56: business_counter_widgets moved to its own dashboard, alongside
  # the tenant_id dashboardFilters pinned filter below.
  command = plan

  assert {
    condition = (
      length(jsondecode(google_monitoring_dashboard.business.dashboard_json).gridLayout.widgets)
      == 6
    )
    error_message = "Expected exactly 6 M17-S54 business-counter tiles (booking requested/approved/completed, notification failed, customer logins, staff logins) on the Business dashboard — a broken widget local would still produce a valid but empty/truncated plan."
  }
}

run "business_counter_widgets_are_aggregated_not_grouped_by_tenant" {
  # Cross-tool review finding (Codex, PR #359, 2026-08-12): a per-tenant
  # STACKED_BAR breakdown (groupByFields on tenant_id) silently truncates
  # past Cloud Monitoring's ~50-series-per-chart cap as active tenant count
  # grows — exactly this platform's intended trajectory. Widgets aggregate
  # instead; tenant_id stays a metric label the M17-S56 dashboardFilters
  # pinned filter (and Cloud Logging) can drill into, just not a
  # dashboard-chart dimension.
  command = plan

  assert {
    # No `if strcontains(w.title, "(total)")` guard (removed, cross-tool
    # review finding, CodeRabbit, 2026-08-13): the Business dashboard now
    # contains only these 6 counter widgets, so the title filter was
    # vestigial and would have silently skipped validating any widget whose
    # title changed — validate every widget on this dashboard instead.
    condition = alltrue([
      for w in jsondecode(google_monitoring_dashboard.business.dashboard_json).gridLayout.widgets :
      (
        w.xyChart.dataSets[0].timeSeriesQuery.timeSeriesFilter.aggregation.crossSeriesReducer == "REDUCE_SUM" &&
        !contains(keys(w.xyChart.dataSets[0].timeSeriesQuery.timeSeriesFilter.aggregation), "groupByFields")
      )
    ])
    error_message = "Every M17-S54 business-counter widget must be REDUCE_SUM-aggregated with no groupByFields — a per-tenant breakdown here would silently truncate past Cloud Monitoring's ~50-series-per-chart cap as tenant count grows."
  }
}

run "business_dashboard_has_the_tenant_id_pinned_filter" {
  # M17-S56: the per-tenant drill-down. Confirmed against Google's
  # DashboardFilter API reference (com.google.monitoring.dashboard.v1.
  # DashboardFilter) — labelKey is the bare label name (not
  # "metric.label.tenant_id"), and templateVariable/stringValue must stay
  # unset: omitting templateVariable makes this a pinned filter that
  # auto-applies to every widget carrying the label (no per-widget query
  # wiring needed); omitting stringValue keeps the default view unfiltered,
  # matching M17-S54's shipped aggregate-totals default. This only proves
  # the JSON is well-formed and shaped as intended — like every other
  # query/filter string in this module, the Cloud Monitoring API validates
  # it server-side only; live-verify in staging before trusting it renders
  # a working filter control.
  command = plan

  assert {
    condition = (
      jsondecode(google_monitoring_dashboard.business.dashboard_json).dashboardFilters ==
      [
        {
          labelKey   = "tenant_id"
          filterType = "METRIC_LABEL"
        }
      ]
    )
    error_message = "Business dashboard must have exactly one dashboardFilters entry: labelKey=tenant_id, filterType=METRIC_LABEL, no templateVariable/stringValue (pinned filter, unfiltered by default)."
  }
}

run "engineering_dashboard_has_no_dashboard_filters" {
  # The tenant_id filter must not leak onto the Engineering dashboard — none
  # of its widgets carry a tenant_id label, so a filter there would be dead
  # UI at best and misleading at worst.
  command = plan

  assert {
    condition     = !contains(keys(jsondecode(google_monitoring_dashboard.engineering.dashboard_json)), "dashboardFilters")
    error_message = "Engineering dashboard must not declare dashboardFilters — its widgets carry no tenant_id label, so a tenant filter there would be dead/misleading UI."
  }
}

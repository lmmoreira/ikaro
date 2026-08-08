# command = plan + mock_provider (Wave 2 preamble pattern) — no credentials,
# no resources created, zero cost. Run from the module directory:
#   terraform init && terraform test

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
    web = { host = "ikaro-web-abc123-rj.a.run.app", path = "/api/health/live", use_ssl = true }
  }

  database_instance_name = "ikaro-staging-main"
}

run "uptime_checks_created_one_per_map_entry" {
  command = plan

  assert {
    condition     = length(google_monitoring_uptime_check_config.this) == length(var.uptime_checks)
    error_message = "Expected exactly one uptime check per uptime_checks map entry."
  }

  assert {
    condition     = google_monitoring_uptime_check_config.this["bff"].http_check[0].path == "/v1/health/ready"
    error_message = "BFF uptime check must probe the exact path from var.uptime_checks, not a hardcoded default."
  }
}

run "uptime_checks_empty_map_creates_nothing" {
  command = plan

  variables {
    uptime_checks = {}
  }

  assert {
    condition     = length(google_monitoring_uptime_check_config.this) == 0
    error_message = "An empty uptime_checks map (prod pre-S37) must create zero uptime checks, not fail or fall back to a default."
  }

  assert {
    condition     = length(google_monitoring_alert_policy.uptime_failure) == 0
    error_message = "No uptime checks means no uptime-failure alert policies either."
  }
}

run "cloud_run_alert_policies_created_one_per_service" {
  command = plan

  assert {
    condition = (
      length(google_monitoring_alert_policy.error_rate_5xx) == length(var.cloud_run_services) &&
      length(google_monitoring_alert_policy.p99_latency) == length(var.cloud_run_services) &&
      length(google_monitoring_alert_policy.instance_count_stuck_at_max) == length(var.cloud_run_services)
    )
    error_message = "5xx-rate, p99-latency, and instance-count-stuck alert policies must each have exactly one instance per Cloud Run service."
  }

  assert {
    condition     = google_monitoring_alert_policy.instance_count_stuck_at_max["backend"].conditions[0].condition_threshold[0].threshold_value == 3
    error_message = "The instance-count-stuck threshold must come from that service's own max_instance_count, not a shared/hardcoded number."
  }
}

run "sql_alerts_created_when_database_instance_name_present" {
  command = plan

  assert {
    condition     = length(google_monitoring_alert_policy.sql_disk) == 1 && length(google_monitoring_alert_policy.sql_cpu) == 1
    error_message = "A non-empty database_instance_name must create both SQL disk and CPU alert policies."
  }
}

run "sql_alerts_skipped_when_database_instance_name_empty" {
  command = plan

  variables {
    database_instance_name = ""
  }

  assert {
    condition     = length(google_monitoring_alert_policy.sql_disk) == 0 && length(google_monitoring_alert_policy.sql_cpu) == 0
    error_message = "An empty database_instance_name (prod pre-enable_database) must skip both SQL alert policies entirely, not fail."
  }
}

run "uptime_check_period_rejects_invalid_values" {
  command = plan

  variables {
    uptime_check_period_seconds = 120
  }

  expect_failures = [var.uptime_check_period_seconds]
}

run "environment_rejects_invalid_values" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}

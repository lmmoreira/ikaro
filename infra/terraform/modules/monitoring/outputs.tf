output "dashboard_id_engineering" {
  description = "Full Cloud Monitoring dashboard resource name for the Engineering dashboard (Cloud Run/SQL/Pub-Sub/latency), format projects/<project_id>/dashboards/<dashboard_id> — the console builder URL needs only the trailing <dashboard_id> segment: https://console.cloud.google.com/monitoring/dashboards/builder/<dashboard_id>?project=<project_id> (basename(this output) extracts it). Split from the single dashboard_id output in M17-S56, when the combined dashboard was split in two."
  value       = google_monitoring_dashboard.engineering.id
}

output "dashboard_id_business" {
  description = "Full Cloud Monitoring dashboard resource name for the Business dashboard (M17-S54's tenant-labelled counters + M17-S56's per-tenant dashboardFilters), same format/URL rules as dashboard_id_engineering above."
  value       = google_monitoring_dashboard.business.id
}

output "error_count_metric_name" {
  description = "Log-based metric name for severity=ERROR counts (ikaro-<env>-error-count) — informational, in case a future story (M17-S54) wants to reference it rather than defining a duplicate."
  value       = google_logging_metric.error_count.name
}

output "notification_channel_id" {
  description = "Email notification channel id — consumed by M17-S54's alert policies so every story's alerts notify the same channel rather than each defining their own."
  value       = google_monitoring_notification_channel.email.id
}

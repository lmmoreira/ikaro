output "dashboard_id" {
  description = "Cloud Monitoring dashboard resource id — link via https://console.cloud.google.com/monitoring/dashboards/builder/<id>?project=<project_id>"
  value       = google_monitoring_dashboard.main.id
}

output "error_count_metric_name" {
  description = "Log-based metric name for severity=ERROR counts (ikaro-<env>-error-count) — informational, in case a future story (M17-S54) wants to reference it rather than defining a duplicate."
  value       = google_logging_metric.error_count.name
}

output "notification_channel_id" {
  description = "Email notification channel id — consumed by M17-S54's alert policies so every story's alerts notify the same channel rather than each defining their own."
  value       = google_monitoring_notification_channel.email.id
}

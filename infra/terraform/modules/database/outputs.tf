output "instance_connection_name" {
  description = "project:region:instance identifier — used by cloud-sql-proxy and the migrate job (M17-S20)"
  value       = google_sql_database_instance.main.connection_name
}

output "instance_name" {
  description = "Cloud SQL instance name (gcloud commands, S27 runbook)"
  value       = google_sql_database_instance.main.name
}

output "private_ip" {
  description = "Private IP of the instance inside the VPC — the backend's DATABASE_HOST (M17-S18)"
  value       = google_sql_database_instance.main.private_ip_address
}

output "resource_iam_writer_role_id" {
  description = "Fully qualified Foundation role for bucket and secret IAM-policy management."
  value       = google_project_iam_custom_role.resource_iam_writer.id
}

output "resource_iam_writer_role_id" {
  description = "Fully qualified Foundation role for reviewed resource IAM-policy management."
  value       = google_project_iam_custom_role.resource_iam_writer.id
}

output "relay_vm_operator_role_id" {
  description = "Fully qualified Foundation role for private relay VM control-plane operations."
  value       = google_project_iam_custom_role.relay_vm_operator.id
}

output "normal_infrastructure_deployer_role_id" {
  description = "Fully qualified role for ordinary Terraform infrastructure operations without IAM mutation."
  value       = google_project_iam_custom_role.normal_infrastructure_deployer.id
}

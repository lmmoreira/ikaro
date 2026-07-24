output "foundation_deployer_email" {
  description = "Email of the protected foundation Terraform deployer service account."
  value       = google_service_account.foundation_deployer.email
}

output "foundation_planner_email" {
  description = "Email of the read-only foundation Terraform planner service account."
  value       = google_service_account.foundation_planner.email
}

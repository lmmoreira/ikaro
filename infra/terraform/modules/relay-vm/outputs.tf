output "relay_vm_name" {
  description = "Name of the relay VM instance, when created (empty when var.create is false) — used to build the gcloud compute ssh --tunnel-through-iap command"
  value       = try(google_compute_instance.relay[0].name, "")
}

output "relay_vm_zone" {
  description = "Zone of the relay VM instance, when created (empty when var.create is false)"
  value       = try(google_compute_instance.relay[0].zone, "")
}

output "service_account_email" {
  description = "Email of the relay VM's attached service account (identity-only — carries no IAM role bindings, see main.tf)"
  value       = google_service_account.relay.email
}

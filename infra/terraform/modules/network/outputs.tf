output "network_id" {
  description = "Fully-qualified ID of the VPC network"
  value       = google_compute_network.vpc.id
}

output "private_services_connection" {
  description = "ID of the private-services-access peering connection — modules that need the peering established before creating resources (database, M17-S13) consume this to gain an explicit graph dependency"
  value       = google_service_networking_connection.psa.id
}

output "subnet_id" {
  description = "Fully-qualified ID of the regional subnet — referenced by Cloud Run direct VPC egress (M17-S18)"
  value       = google_compute_subnetwork.subnet.id
}

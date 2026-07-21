output "lb_ip_address" {
  description = "Static external IPv4 address of the Global external ALB. Cloudflare's proxied A records (this module's own cloudflare_dns_record.hosts) already point at it, so nothing else needs to consume this in Terraform — it's operator-facing: direct-to-LB-IP testing (S22/S36 acceptance criteria) and SSL Labs / cert-issuance troubleshooting."
  value       = google_compute_global_address.lb_ip.address
}

output "certificate_map_id" {
  description = "Certificate Manager certificate map resource ID — useful for `gcloud certificate-manager maps describe` / `certificate-maps entries list` while troubleshooting DNS-authorization cert issuance."
  value       = google_certificate_manager_certificate_map.edge.id
}

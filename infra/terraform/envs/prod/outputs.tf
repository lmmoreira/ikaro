output "backend_service_uri" {
  description = "Backend's real *.run.app URI (internal-ingress only — not reachable from outside the VPC/IAM tunnel). Informational; nothing needs to reference this back into Terraform (custom_audiences decouples PUBSUB_PUSH_AUDIENCE from it)."
  value       = module.cloudrun_backend.service_uri
}

output "bff_service_uri" {
  description = "BFF's real *.run.app URI. Informational only in prod — GOOGLE_CALLBACK_URL uses the fixed https://bff.ikaro.online host (S22's edge module) rather than this bootstrap value, which staging still needs (no edge module there, D5)."
  value       = module.cloudrun_bff.service_uri
}

output "web_service_uri" {
  description = "Web's real *.run.app URI."
  value       = module.cloudrun_web.service_uri
}

output "edge_lb_ip_address" {
  description = "Static external IPv4 address of the Global external ALB (S22) — the IP Cloudflare's proxied A records point at. Operator-facing: direct-to-LB-IP testing (S22/S36 acceptance criteria) and SSL Labs / cert-issuance troubleshooting."
  value       = module.edge.lb_ip_address
}

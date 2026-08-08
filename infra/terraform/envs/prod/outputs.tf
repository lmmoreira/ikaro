output "dashboard_id" {
  description = "Full Cloud Monitoring dashboard resource name (module.monitoring's own output — see its description for the console URL format, which needs only the trailing <dashboard_id> segment, not this full value). Re-exported here since neither env root originally did, leaving docs/10-OBSERVABILITY_STRATEGY.md's `terraform output dashboard_id` instruction unusable (cross-tool review finding, PR #332, 2026-08-08; description corrected, PR #333 review, 2026-08-08 — 'resource id' wrongly implied a bare id, not the full projects/<project_id>/dashboards/<dashboard_id> name)."
  value       = module.monitoring.dashboard_id
}

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
  description = "Static external IPv4 address of the Global external ALB (S22) — the IP Cloudflare's proxied A records point at. Operator-facing: direct-to-LB-IP testing (S22/S36 acceptance criteria) and SSL Labs / cert-issuance troubleshooting. Empty until S37 flips enable_edge=true (TD30, 2026-07-22) — same try()-fallback pattern as staging's deferred database output."
  value       = try(module.edge[0].lb_ip_address, "")
}

output "dashboard_id" {
  description = "Cloud Monitoring dashboard resource id (module.monitoring's own output — see its description for the console URL format). Re-exported here since neither env root originally did, leaving docs/10-OBSERVABILITY_STRATEGY.md's `terraform output dashboard_id` instruction unusable (cross-tool review finding, PR #332, 2026-08-08)."
  value       = module.monitoring.dashboard_id
}

output "backend_service_uri" {
  description = "Backend's real *.run.app URI (internal-ingress only — not reachable from outside the VPC/IAM tunnel). Informational; nothing needs to reference this back into Terraform (custom_audiences decouples PUBSUB_PUSH_AUDIENCE from it)."
  value       = module.cloudrun_backend.service_uri
}

output "bff_service_uri" {
  description = "BFF's real internal-only *.run.app URI (TD38: no public invoker grant, INGRESS_TRAFFIC_INTERNAL_ONLY). Informational only — web's BFF_UPSTREAM_URL references module.cloudrun_bff.service_uri directly, no manual paste-back needed."
  value       = module.cloudrun_bff.service_uri
}

output "web_service_uri" {
  description = "Web's real *.run.app URI. After the first apply, paste this into web_real_uri (local.auto.tfvars or terraform.tfvars) and re-apply so NEXT_PUBLIC_SITE_URL and cors_origins use the real, reachable URL."
  value       = module.cloudrun_web.service_uri
}

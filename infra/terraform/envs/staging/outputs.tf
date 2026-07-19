output "backend_service_uri" {
  description = "Backend's real *.run.app URI (internal-ingress only — not reachable from outside the VPC/IAM tunnel). Informational; nothing needs to reference this back into Terraform (custom_audiences decouples PUBSUB_PUSH_AUDIENCE from it)."
  value       = module.cloudrun_backend.service_uri
}

output "bff_service_uri" {
  description = "BFF's real *.run.app URI. After the first apply, paste this into bff_real_uri (local.auto.tfvars or terraform.tfvars) and re-apply so GOOGLE_CALLBACK_URL uses the real, reachable URL — then register that same callback URL in the Google Cloud OAuth client configuration."
  value       = module.cloudrun_bff.service_uri
}

output "web_service_uri" {
  description = "Web's real *.run.app URI."
  value       = module.cloudrun_web.service_uri
}

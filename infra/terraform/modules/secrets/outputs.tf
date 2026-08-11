output "secret_ids" {
  description = "Map of catalog name -> Secret Manager resource id. Consumed directly by M17-S18 (modules/cloudrun-service, secret_key_ref) in the same env root. foundation/modules/runtime-identities (per-SA accessor bindings, originally M17-S17's modules/iam — moved under TD34's Foundation boundary) is a separate Terraform root/state and does not consume this output directly — it receives its own independently-supplied secret_ids map (foundation/envs/<env>/main.tf), kept in sync by hand."
  value       = { for name, secret in google_secret_manager_secret.this : name => secret.id }
}

output "secret_names" {
  description = "Names of every secret container provisioned in this environment (varies by env — cloudflare-api-token is prod-only)."
  value       = local.secret_ids
}

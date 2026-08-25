output "dashboard_id_engineering" {
  description = "Full Cloud Monitoring dashboard resource name for the Engineering dashboard (module.monitoring's own output — see its description for the console URL format, which needs only the trailing <dashboard_id> segment, not this full value). Re-exported here since neither env root originally did, leaving docs/10-OBSERVABILITY_STRATEGY.md's `terraform output` instruction unusable (cross-tool review finding, PR #332, 2026-08-08; description corrected, PR #333 review, 2026-08-08 — 'resource id' wrongly implied a bare id, not the full projects/<project_id>/dashboards/<dashboard_id> name). Split from the single dashboard_id output in M17-S56, when the combined dashboard was split in two."
  value       = module.monitoring.dashboard_id_engineering
}

output "dashboard_id_business" {
  description = "Full Cloud Monitoring dashboard resource name for the Business dashboard (M17-S54's tenant-labelled counters + M17-S56's per-tenant dashboardFilters) — same format/URL rules as dashboard_id_engineering above."
  value       = module.monitoring.dashboard_id_business
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

output "turnstile_secret" {
  description = "Cloudflare Turnstile secret key (M20-S05 PR3 prerequisite) — the sensitive counterpart to cloudflare_turnstile_widget.site's own public sitekey (already wired automatically into NEXT_PUBLIC_TURNSTILE_SITE_KEY, no manual step). modules/secrets' own \"containers only, no values via Terraform\" rule (M17 §2) means this value can never be written into Secret Manager by Terraform — this output exists solely so an operator can populate the real turnstile-secret-key version safely, without ever typing or pasting the value by hand: `terraform output -raw turnstile_secret | gcloud secrets versions add turnstile-secret-key --project=ikaro-prod --data-file=-`."
  value       = cloudflare_turnstile_widget.site.secret
  sensitive   = true
}

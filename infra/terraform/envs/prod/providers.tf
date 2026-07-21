provider "google" {
  project = var.project_id
  region  = var.region

  default_labels = var.labels
}

# S09's scoped token (Zone:DNS:Edit + Zone:Cache Purge + Zone:Zone Settings:Edit
# for ikaro.online only) — never a Global API Key. Zone Settings:Edit added
# 2026-07-20 (edge review finding) — needed for modules/edge's
# cloudflare_zone_setting.ssl_mode to enforce Full (strict), the one setting
# this module's scope didn't originally cover. Locally:
# TF_VAR_cloudflare_api_token or local.auto.tfvars (gitignored). In CI: the
# CLOUDFLARE_API_TOKEN GitHub Secret added once S23 provisions the
# `production-infrastructure` environment (M17 §0 D5/S22 note in S23's own
# story text).
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

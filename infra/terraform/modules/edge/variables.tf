variable "bff_service_name" {
  description = "Cloud Run service name backing the bff.<root_domain> host route (module.cloudrun_bff.service_name from the env root) — consumed by the serverless NEG, not the service's *.run.app URI."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for root_domain (S09 — the zone already exists, created out-of-band via the Cloudflare dashboard runbook, not Terraform-managed). Plain, non-secret identifier (same treatment as project_number) — not an access-control boundary. Discover via: cloudflare zone list, or the zone's Overview page URL/API in the Cloudflare dashboard."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.cloudflare_zone_id))
    error_message = "cloudflare_zone_id must be a 32-character lowercase hex zone ID, not a zone name."
  }
}

variable "environment" {
  description = "Deployment environment (staging or prod)"
  type        = string

  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "Environment must be \"staging\" or \"prod\"."
  }
}

variable "labels" {
  description = "Common labels applied to every resource that supports them"
  type        = map(string)
  default     = {}
}

variable "project_id" {
  description = "GCP project ID the resources are created in"
  type        = string
}

variable "region" {
  description = "GCP region for regional resources"
  type        = string
  default     = "southamerica-east1"
}

variable "root_domain" {
  description = "Apex domain fronted by this module (D11). Also drives the www.<root_domain> and bff.<root_domain> hostnames — never hardcode a second literal domain string elsewhere in this module."
  type        = string
  default     = "ikaro.online"

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", var.root_domain))
    error_message = "root_domain must be a plain lowercase domain name (e.g. \"ikaro.online\"), no scheme/path/trailing dot."
  }
}

variable "web_service_name" {
  description = "Cloud Run service name backing the root_domain + www.<root_domain> host routes (module.cloudrun_web.service_name from the env root) — consumed by the serverless NEG, not the service's *.run.app URI."
  type        = string
}

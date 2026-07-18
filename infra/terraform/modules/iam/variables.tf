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

variable "public_bucket_name" {
  description = "Public hotsite-assets bucket name (M17-S14 modules/storage output) — backend SA gets storage.objectAdmin on it"
  type        = string
}

variable "secret_ids" {
  description = "Map of catalog secret name -> Secret Manager resource id (M17-S16 modules/secrets `secret_ids` output) — used to grant per-SA accessor bindings without hardcoding secret resource identifiers"
  type        = map(string)
}

variable "uploads_bucket_name" {
  description = "Private uploads bucket name (M17-S14 modules/storage output) — backend SA gets storage.objectAdmin on it"
  type        = string
}

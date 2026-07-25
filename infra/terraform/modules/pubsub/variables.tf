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

variable "backend_push_endpoint" {
  description = "Full URL Pub/Sub POSTs push messages to — the backend's real *.run.app URI + \"/pubsub/push\" (module.cloudrun_backend.service_uri from the env root; a normal cross-module reference, not a self-reference, so no placeholder-default bootstrap dance is needed here unlike bff_real_uri/GOOGLE_CALLBACK_URL)."
  type        = string

  validation {
    condition     = startswith(var.backend_push_endpoint, "https://")
    error_message = "backend_push_endpoint must be an https:// URL."
  }
}

variable "backend_pubsub_audience" {
  description = "Fixed, self-chosen OIDC audience string every push subscription mints its token with — must equal the backend Cloud Run service's own custom_audiences entry (envs/<env>/main.tf's local.backend_pubsub_audience), NOT the backend's real URL. Deliberately URL-independent (M17-S18 finding): the real *.run.app URL is a per-project random hash, so neither side can derive a shared value from it."
  type        = string

  validation {
    condition     = length(var.backend_pubsub_audience) > 0
    error_message = "backend_pubsub_audience must not be empty."
  }
}

variable "pubsub_invoker_sa_email" {
  description = "Foundation-owned Pub/Sub push OIDC identity email — set as every push subscription's oidc_token.service_account_email. run.invoker on the backend service is granted elsewhere (M17-S18, envs/<env>/main.tf); this module only references the email."
  type        = string
}

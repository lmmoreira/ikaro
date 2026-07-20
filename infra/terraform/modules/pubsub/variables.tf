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

variable "project_number" {
  description = "GCP project number — used to construct the Pub/Sub service agent's principal (service-<number>@gcp-sa-pubsub.iam.gserviceaccount.com), the identity Pub/Sub itself acts as when moving messages to a dead-letter topic. Discover via: gcloud projects describe <project-id> --format='value(projectNumber)'"
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.project_number))
    error_message = "project_number must be a numeric GCP project number (e.g. \"729809528251\"), not a project ID."
  }
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

variable "backend_sa_email" {
  description = "Backend runtime SA email (module.iam.backend_sa_email) — granted pubsub.publisher on every topic in the catalog, since the backend is the only publisher for both domain events (OUTBOX_PUBLISHER) and its own local/manual cron re-triggers (D3's /cron/* controllers) and dead-letter writes (pull-mode publishToDlq)."
  type        = string
}

variable "pubsub_invoker_sa_email" {
  description = "Pub/Sub push OIDC identity email (module.iam.pubsub_invoker_sa_email) — set as every push subscription's oidc_token.service_account_email. run.invoker on the backend service is granted elsewhere (M17-S18, envs/<env>/main.tf); this module only references the email."
  type        = string
}

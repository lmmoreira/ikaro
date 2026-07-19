variable "backend_max_instances" {
  description = "Backend Cloud Run max_instance_count. Capped at 6 on db-f1-micro by the connection-math invariant (6 * DB_POOL_SIZE=3 = 18 <= 80% of 25) — raise only alongside a db_tier upgrade (M17 plan §S18). Prod launches on db-f1-micro too per D12, same cap as staging."
  type        = number
  default     = 6
}

variable "bootstrap_mode" {
  description = "S18 launch state: services run a placeholder public image with relaxed (\"/\") probes until S27's first real pipeline deploy flips this to false."
  type        = bool
  default     = true
}

variable "brevo_smtp_login" {
  description = "Brevo SMTP account login (non-secret per the S16 catalog — only BREVO_SMTP_KEY is a Secret Manager secret). Value never committed: gitignored local.auto.tfvars locally, a GitHub environment variable in the pipeline (S24, same treatment as iam_admin_user)."
  type        = string
  default     = ""
}

variable "cors_origins" {
  description = "Origins allowed to PUT/GET against the private uploads bucket via signed URLs — this env's web app origin(s)"
  type        = list(string)
}

variable "db_tier" {
  description = "Cloud SQL machine tier (D12: db-f1-micro at launch; upgrade via terraform.tfvars when the first paying tenant lands)"
  type        = string
  default     = "db-f1-micro"
}

variable "enable_database" {
  description = "Instantiate the Cloud SQL module (prod: true — but prod stays plan-only until S24/S37)"
  type        = bool
}

variable "environment" {
  description = "Deployment environment (staging or prod)"
  type        = string

  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "Environment must be \"staging\" or \"prod\"."
  }
}

variable "iam_admin_user" {
  description = "Google account email for passwordless Cloud SQL IAM access — value never committed: gitignored local.auto.tfvars locally, TF_VAR_iam_admin_user in the pipeline (S24)"
  type        = string
  default     = ""
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
  description = "GCP project number — non-secret, plain value (same treatment as project_id/db_tier). Used to construct each Cloud Run service's own deterministic *.run.app URL (service-projectnumber.region.run.app) for the handful of env vars a service needs pointing at itself (PUBSUB_PUSH_AUDIENCE, GOOGLE_CALLBACK_URL) — Terraform cannot reference a resource's own computed uri from within its own config. Discover via: gcloud projects describe ikaro-prod --format='value(projectNumber)'"
  type        = string
}

variable "region" {
  description = "GCP region for regional resources"
  type        = string
  default     = "southamerica-east1"
}

variable "staging_project_id" {
  description = "GCP project ID of the staging environment — non-secret, plain value (same treatment as project_id/db_tier). Used by modules/registry to build the staging app-deployer's SA email for the cross-project write grant (D8)."
  type        = string
}

variable "staging_project_number" {
  description = "GCP project number of the staging environment — non-secret, plain value. Used by modules/registry to build the staging Cloud Run service agent principal for the cross-project read grant. Discover via: gcloud projects describe ikaro-staging --format='value(projectNumber)'"
  type        = string
}

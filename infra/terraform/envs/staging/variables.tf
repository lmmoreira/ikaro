variable "backend_max_instances" {
  description = "Backend Cloud Run max_instance_count. Capped at 3 on db-f1-micro by the connection-math invariant: 3 * DB_POOL_SIZE=3 * 2 (rollout-overlap factor — Cloud Run enforces this per-revision even at the service level, so two revisions can each independently reach it during a deploy, real apply finding 2026-07-19) = 18 <= 80% of 25 — raise only alongside a db_tier upgrade (M17 plan §S18)."
  type        = number
  default     = 3
}

variable "bff_max_instances" {
  description = "BFF Cloud Run max_instance_count. Explicit rather than the module's default (100): both backend and bff use Direct VPC egress and share the single /24 subnet (~251 usable IPs, modules/network); Google documents ~2 IPs/instance for Direct VPC, and a rolling deploy can run old+new revisions concurrently. 20 * 2 IPs * 2 (rollout overlap) = 80, plus backend's 6 * 2 * 2 = 24 — 104 total, comfortably under 251. Raise only alongside a larger/separate subnet (review finding, 2026-07-19)."
  type        = number
  default     = 20
}

variable "bff_real_uri" {
  description = "BFF's real *.run.app URI, used to build GOOGLE_CALLBACK_URL. Cannot be derived from module.cloudrun_bff.service_uri (a module cannot take its own output as one of its own inputs) — this is the standard Terraform bootstrap pattern instead: apply once with the placeholder default, read the real value from this root's bff_service_uri output, paste it here (local.auto.tfvars or terraform.tfvars), then apply again. Real apply finding, 2026-07-19: the *.run.app URL is a per-project hash (e.g. \"ikaro-bff-crle4i3nrq-rj.a.run.app\"), not the deterministic project-number format an earlier assumption relied on, so it cannot be precomputed either."
  type        = string
  default     = "https://ikaro-bff-placeholder.invalid"
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

variable "db_user" {
  description = "Postgres user the backend connects as (DB_USER). Not Terraform-managed (S13 discovery — the user + password are created out-of-band by the S27/S37 activation runbook to keep secret values out of state), but the username itself isn't a secret, so it's an explicit variable rather than a bare literal repeated across env roots."
  type        = string
  default     = "ikaro"
}

variable "enable_database" {
  description = "Instantiate the Cloud SQL module (S13 discovery: staging stays false — no instance, no charge — until the S27 activation flips it)"
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
  description = "GCP project number — non-secret, plain value (same treatment as project_id/db_tier). Used to construct each Cloud Run service's own deterministic *.run.app URL (service-projectnumber.region.run.app) for the handful of env vars a service needs pointing at itself (PUBSUB_PUSH_AUDIENCE, GOOGLE_CALLBACK_URL) — Terraform cannot reference a resource's own computed uri from within its own config. Discover via: gcloud projects describe ikaro-staging --format='value(projectNumber)'"
  type        = string
}

variable "region" {
  description = "GCP region for regional resources"
  type        = string
  default     = "southamerica-east1"
}

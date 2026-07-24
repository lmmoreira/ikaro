variable "bootstrap_mode" {
  description = "Until the first pipeline deploy (S27/S37), db-migrator-password exists with zero versions — Cloud Run resolves secret_key_ref at Job-revision-creation time, so mounting it now would fail the very apply this story's first acceptance criterion needs to succeed. While true, secret_env_vars is skipped entirely. Unlike modules/cloudrun-service, a Job has no health probes to swap paths on — this variable has exactly one effect here."
  type        = bool
  default     = true
}

variable "command" {
  description = "Full container command (no shell) — the compiled-mode TypeORM CLI invocation. Defaults to the command this story settled on: plain `typeorm` CLI (not typeorm-ts-node-commonjs) against dist/ output, invoked directly via node since the runtime image has no pnpm/corepack (builder-stage only)."
  type        = list(string)
  default     = ["node", "node_modules/typeorm/cli.js", "migration:run", "-d", "dist/shared/database/data-source.js"]
}

variable "cpu" {
  description = "vCPU limit (string form of the k8s quantity, e.g. \"1\")"
  type        = string
  default     = "1"
}

variable "deletion_protection" {
  description = "Protect the Job from deletion at the Terraform level — same convention as modules/database and modules/cloudrun-service (false while iterating pre-launch, true once an env is live)."
  type        = bool
  default     = false
}

variable "env_vars" {
  description = "Plain (non-secret) environment variables for the migrate container (DB_INSTANCE_CONNECTION_NAME, DB_MIGRATOR_USER, DB_NAME, etc.)"
  type        = map(string)
  default     = {}
}

variable "environment" {
  description = "Deployment environment (staging or prod)"
  type        = string

  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "Environment must be \"staging\" or \"prod\"."
  }
}

variable "image" {
  description = "Container image URI. No default on purpose — same convention as modules/cloudrun-service: every caller must state explicitly whether it's passing the bootstrap placeholder (gcr.io/cloudrun/hello) or a real Artifact Registry image; the pipeline owns this value post-S27/S37 via the ignore_changes lifecycle rule below."
  type        = string
}

variable "job_name" {
  description = "Cloud Run Job name"
  type        = string
  default     = "ikaro-migrate"
}

variable "labels" {
  description = "Common labels applied to every resource that supports them"
  type        = map(string)
  default     = {}
}

variable "max_retries" {
  description = "Cloud Run Job retry count on task failure. Fixed at 0 by this story's acceptance criteria — a failed migration must fail loudly and stop the deploy pipeline, never retry into a half-applied schema state."
  type        = number
  default     = 0

  validation {
    condition     = var.max_retries == 0
    error_message = "max_retries must be 0 — a failed migration must fail loudly, never retry into a half-applied state (M17-S20 acceptance criterion)."
  }
}

variable "memory" {
  description = "Memory limit (string form of the k8s quantity, e.g. \"512Mi\")"
  type        = string
  default     = "512Mi"
}

variable "network_id" {
  description = "VPC network ID for direct egress (network module output) — required: the Job always needs VPC access to reach Cloud SQL's private IP, unlike modules/cloudrun-service where it's optional per service."
  type        = string
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

variable "secret_env_vars" {
  description = "Map of ENV_VAR_NAME -> Secret Manager secret id (secrets module's secret_ids output, e.g. DB_MIGRATOR_PASSWORD -> db-migrator-password). Rendered as value_source.secret_key_ref, version \"latest\" — but only while bootstrap_mode is false, same reasoning as modules/cloudrun-service."
  type        = map(string)
  default     = {}
}

variable "service_account_email" {
  description = "Runtime service account email this Job runs as (iam module's migrate_sa_email output) — dedicated ikaro-migrate@ SA, not a reuse of the backend runtime SA (story-discovery, 2026-07-20: least privilege — the migrate Job needs only cloudsql.client + the migrator secret, not backend's pubsub.publisher/storage.objectAdmin/self-signing grants)."
  type        = string
}

variable "subnet_id" {
  description = "VPC subnet ID for direct egress (network module output) — required, see network_id."
  type        = string
}

variable "timeout" {
  description = "Per-task execution timeout (Cloud Run duration string, e.g. \"600s\"). Fixed at 10 minutes by this story's spec."
  type        = string
  default     = "600s"
}

variable "vpc_egress" {
  description = "Direct VPC egress mode. PRIVATE_RANGES_ONLY is correct here — the Job only ever needs the VPC for Cloud SQL's private IP (same reasoning as the backend service, M17 §0), never a public Google API or another *.run.app URL."
  type        = string
  default     = "PRIVATE_RANGES_ONLY"

  validation {
    condition     = contains(["ALL_TRAFFIC", "PRIVATE_RANGES_ONLY"], var.vpc_egress)
    error_message = "vpc_egress must be ALL_TRAFFIC or PRIVATE_RANGES_ONLY."
  }
}

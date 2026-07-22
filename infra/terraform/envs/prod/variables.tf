variable "backend_max_instances" {
  description = "Backend Cloud Run max_instance_count. Capped at 3 on db-f1-micro by the connection-math invariant: 3 * DB_POOL_SIZE=3 * 2 (rollout-overlap factor — Cloud Run enforces this per-revision even at the service level, so two revisions can each independently reach it during a deploy, real apply finding 2026-07-19) = 18 <= 80% of 25 — raise only alongside a db_tier upgrade (M17 plan §S18). Prod launches on db-f1-micro too per D12, same cap as staging."
  type        = number
  default     = 3
}

variable "bff_max_instances" {
  description = "BFF Cloud Run max_instance_count. Explicit rather than the module's default (100): both backend and bff use Direct VPC egress and share the single /24 subnet (~251 usable IPs, modules/network); Google documents ~2 IPs/instance for Direct VPC, and a rolling deploy can run old+new revisions concurrently. 20 * 2 IPs * 2 (rollout overlap) = 80, plus backend's 6 * 2 * 2 = 24 — 104 total, comfortably under 251. Raise only alongside a larger/separate subnet (review finding, 2026-07-19)."
  type        = number
  default     = 20
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

variable "cloudflare_api_token" {
  description = "Cloudflare API token (S09 — scoped Zone:DNS:Edit + Zone:Cache Purge for ikaro.online only, never a Global API Key). A genuine secret — never committed: gitignored local.auto.tfvars / TF_VAR_cloudflare_api_token locally, the CLOUDFLARE_API_TOKEN GitHub Secret in the pipeline (S23/S24)."
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for ikaro.online (S09 — the zone already exists, created out-of-band via the Cloudflare dashboard runbook, not Terraform-managed). Plain, non-secret identifier (same treatment as project_number). Discover via: cloudflare zone list, or the zone's Overview page in the Cloudflare dashboard."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.cloudflare_zone_id))
    error_message = "cloudflare_zone_id must be a 32-character lowercase hex zone ID, not a zone name."
  }
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

variable "db_migrator_user" {
  description = "Postgres user the migrate Cloud Run Job connects as (DB_MIGRATOR_USER) — a distinct DDL-capable role from db_user's DML-only app runtime role, mirroring docker/init-db.sh's local/CI ikaro_migrator/ikaro_app split (carried into cloud by M17-S20; db_user's cloud role keeps its existing \"ikaro\" name from S13, not renamed to ikaro_app here — out of this story's scope). Not Terraform-managed, same reasoning as db_user — created out-of-band by the S27/S37 activation runbook."
  type        = string
  default     = "ikaro_migrator"
}

variable "db_user" {
  description = "Postgres user the backend connects as (DB_USER). Not Terraform-managed (S13 discovery — the user + password are created out-of-band by the S27/S37 activation runbook to keep secret values out of state), but the username itself isn't a secret, so it's an explicit variable rather than a bare literal repeated across env roots."
  type        = string
  default     = "ikaro"
}

variable "enable_database" {
  description = "Instantiate the Cloud SQL module. Deferred (TD30, 2026-07-22): stays false until S37's deliberate go-live apply flips it — decoupled from registry/IAM/secrets so those can apply independently (M17-S27 needs the registry; the database and edge module are meant to land together at S37, not before)."
  type        = bool
}

variable "enable_edge" {
  description = "Instantiate the edge module (ALB, Certificate Manager, Cloudflare DNS records). Deferred (TD30, 2026-07-22): stays false until S37 — cert issuance + DNS + the ingress flip need to land in one deliberate apply, not as a side effect of an unrelated one."
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

variable "outbox_relay_schedule" {
  description = "Cron schedule for the outbox sweep + retention GC tick (TD24-S01/D3), passed through to module.scheduler (M17-S21). Default matches the app's own default assumption (*/5 * * * *) — override only if the sweep interval needs to change."
  type        = string
  default     = "*/5 * * * *"
}

variable "project_id" {
  description = "GCP project ID the resources are created in"
  type        = string
}

variable "project_number" {
  description = "GCP project number — non-secret, plain value (same treatment as project_id/db_tier). Used to construct GCP-managed service agent principals, which genuinely are deterministic from the project number — unlike a Cloud Run service's own *.run.app URL, which M17-S18's real staging apply proved is a per-project random hash, not derivable this way (see bff_real_uri and envs/staging/main.tf's backend_pubsub_audience for that correction). Current consumer: modules/pubsub's Pub/Sub service agent (service-<number>@gcp-sa-pubsub.iam.gserviceaccount.com), passed as project_number. Discover via: gcloud projects describe ikaro-prod --format='value(projectNumber)'"
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

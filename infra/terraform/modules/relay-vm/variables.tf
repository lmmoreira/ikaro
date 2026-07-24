variable "create" {
  description = "Whether to create the relay VM. On-demand toggle (TD32): flip to true + apply (via a merged PR — never a local terraform apply, infra/terraform/README.md) right before a session, back to false + apply right after. Defaults false so this module is inert until deliberately used."
  type        = bool
  default     = false
}

variable "db_instance_connection_name" {
  description = "Cloud SQL instance_connection_name (module.database.instance_connection_name) — the project:region:instance string cloud-sql-proxy dials. Empty string (default) when the env's database module isn't created yet (prod: count = var.enable_database ? 1 : 0, false until S37) — the relay SA's Cloud SQL grants and google_sql_user registration are skipped in that case, since there's nothing yet to grant access to."
  type        = string
  default     = ""
}

variable "db_instance_name" {
  description = "Cloud SQL instance short name (module.database.instance_name) — used as the google_sql_user's instance argument. Empty string (default) has the same meaning as db_instance_connection_name's empty default."
  type        = string
  default     = ""
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
  description = "Google account email granted IAP tunnel access and OS Login on the relay instance specifically (not project-wide) — lets this identity SSH in to set up the SSH port-forward / run ad-hoc commands. The relay VM's own service account (not this identity) does the actual Cloud SQL / Cloud Run / Secret Manager work (TD32 redesign, 2026-07-24) — see google_service_account.relay's comment for why."
  type        = string
}

variable "labels" {
  description = "Common labels applied to every resource that supports them"
  type        = map(string)
  default     = {}
}

variable "machine_type" {
  description = "Compute Engine machine type for the relay VM. e2-micro is deliberately minimal — this VM is on-demand, not always-on (TD32: ~$8-15/mo if it ran continuously, near-zero on the real on-demand usage pattern)."
  type        = string
  default     = "e2-micro"
}

variable "network_id" {
  description = "Fully-qualified ID of the VPC network the firewall rule attaches to (modules/network's network_id output)"
  type        = string
}

variable "platform_admin_key_secret_id" {
  description = "Secret Manager resource ID of the platform-admin-key secret (module.secrets.secret_ids[\"platform-admin-key\"]) — grants the relay VM's own service account read access so the tenant-provisioning acceptance criterion (POST /internal/tenants with X-Platform-Admin-Key) is exercisable from inside the relay VM via the metadata-server-minted access token, no gcloud CLI needed. Previously only the backend runtime SA had this grant (TD32 discovery gap)."
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

variable "subnet_id" {
  description = "Fully-qualified ID of the regional subnet the relay VM's network interface attaches to (modules/network's subnet_id output). Must have private_ip_google_access enabled — the specific setting that lets the relay VM's traffic to *.a.run.app classify as internal-origin (TD32 live verification)."
  type        = string
}

variable "zone" {
  description = "GCP zone for the relay VM (e.g. southamerica-east1-a). Not derived from region automatically — a variable default cannot reference another variable, so the env root passes this explicitly."
  type        = string
}

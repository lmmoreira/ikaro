variable "allow_unauthenticated" {
  description = "Grant run.invoker to allUsers (bff/web — the app does its own auth). Requires the S07 org-policy exception; triggers CKV_IKARO_1, suppressed at the resource with a documented rationale."
  type        = bool
  default     = false
}

variable "bootstrap_mode" {
  description = "Until the first pipeline deploy (S27), the service runs a placeholder public image (e.g. gcr.io/cloudrun/hello) that does not implement the app's real health endpoints. While true, probes target \"/\" (which the placeholder image does serve) instead of the configured health-check paths, so the service can still reach READY. Flipped to false in S27 once a real image is deployed."
  type        = bool
  default     = true
}

variable "cpu" {
  description = "vCPU limit (string form of the k8s quantity, e.g. \"1\")"
  type        = string
  default     = "1"
}

variable "db_pool_size" {
  description = "TypeORM pool size this service opens per instance (DB_POOL_SIZE). Only set for the backend service — leave null for bff/web. Combined with db_tier, enforces the connection-math invariant on max_instance_count."
  type        = number
  default     = null
}

variable "db_tier" {
  description = "Cloud SQL machine tier the backend connects to (only meaningful when db_pool_size is set). Used solely to look up the tier's max_connections for the connection-math invariant below — this module does not create the database."
  type        = string
  default     = null
}

variable "deletion_protection" {
  description = "Protect the service from deletion at the Terraform level — same convention as modules/database (false while iterating pre-launch, true once an env is live). Defaults false since no env has launched yet (M17-S18)."
  type        = bool
  default     = false
}

variable "env_vars" {
  description = "Plain (non-secret) environment variables for the app container"
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

variable "execution_environment" {
  description = "Cloud Run sandbox generation"
  type        = string
  default     = "EXECUTION_ENVIRONMENT_GEN2"

  validation {
    condition     = contains(["EXECUTION_ENVIRONMENT_GEN1", "EXECUTION_ENVIRONMENT_GEN2"], var.execution_environment)
    error_message = "execution_environment must be EXECUTION_ENVIRONMENT_GEN1 or EXECUTION_ENVIRONMENT_GEN2."
  }
}

variable "health_check_live_path" {
  description = "Liveness probe path once bootstrap_mode is false (e.g. /health/live, /v1/health/live, /api/health/live — differs per service, see M17-S18 discovery)"
  type        = string
  default     = "/health/live"
}

variable "health_check_ready_path" {
  description = "Startup probe path once bootstrap_mode is false (e.g. /health/ready, /v1/health/ready, /api/health/ready — differs per service, see M17-S18 discovery)"
  type        = string
  default     = "/health/ready"
}

variable "image" {
  description = "Container image URI. No default on purpose — every caller must state explicitly whether it's passing the S18 bootstrap placeholder (e.g. gcr.io/cloudrun/hello) or a real Artifact Registry image; the pipeline owns this value post-S27 via the ignore_changes lifecycle rule below."
  type        = string
}

variable "ingress" {
  description = "Cloud Run v2 ingress setting (real google_cloud_run_v2_service enum — verified against provider v7 schema, 2026-07-19)"
  type        = string
  default     = "INGRESS_TRAFFIC_ALL"

  validation {
    condition = contains([
      "INGRESS_TRAFFIC_ALL",
      "INGRESS_TRAFFIC_INTERNAL_ONLY",
      "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER",
    ], var.ingress)
    error_message = "ingress must be one of INGRESS_TRAFFIC_ALL, INGRESS_TRAFFIC_INTERNAL_ONLY, INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER."
  }
}

variable "invoker_members" {
  description = "IAM members (\"serviceAccount:...\", \"user:...\") granted run.invoker on this service — e.g. the BFF's runtime SA on the backend, or an operator's user: principal. Does not include allUsers; use allow_unauthenticated for that."
  type        = list(string)
  default     = []
}

variable "labels" {
  description = "Common labels applied to every resource that supports them"
  type        = map(string)
  default     = {}
}

variable "max_instance_count" {
  description = "Combined maximum instance count across revisions. When db_pool_size is set (backend only), validated against the connection-math invariant: max_instance_count * db_pool_size must be <= 80% of db_tier's max_connections (M17 plan §S18 \"Connection-math invariant\")."
  type        = number
  default     = 100

  # References local.tier_max_connections (main.tf) alongside
  # var.max_instance_count — a variable validation condition CAN reference a
  # local as long as it also references the variable being validated itself
  # (confirmed 2026-07-19; a local-only condition is rejected by Terraform
  # with "must refer to var.max_instance_count in order to test incoming
  # values", but combining both works). Deduplicates the map that used to be
  # written out twice in this same condition (CodeRabbit finding).
  validation {
    condition = var.db_pool_size == null ? true : (
      contains(keys(local.tier_max_connections), var.db_tier) &&
      var.max_instance_count * var.db_pool_size <= floor(0.8 * local.tier_max_connections[var.db_tier])
    )
    error_message = "backend max_instance_count * db_pool_size must be <= 80% of db_tier's max_connections, and db_tier must be a recognized tier in this module's connection-math map (add it here if you're upgrading to a new tier)."
  }
}

variable "memory" {
  description = "Memory limit (string form of the k8s quantity, e.g. \"512Mi\")"
  type        = string
  default     = "512Mi"
}

variable "min_instance_count" {
  description = "Minimum instance count (0 = scale-to-zero)"
  type        = number
  default     = 0
}

variable "network_id" {
  description = "VPC network ID for direct egress (network module output). Required when vpc_egress is set; leave null for services that don't need VPC access (e.g. web, which only calls the public BFF URL)."
  type        = string
  default     = null
}

variable "port" {
  description = "Container port the app listens on (matches the Dockerfile's EXPOSE)"
  type        = number
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
  description = "Map of ENV_VAR_NAME -> Secret Manager secret id (secrets module's secret_ids output). Rendered as value_source.secret_key_ref, version \"latest\" — but only while bootstrap_mode is false. While bootstrap_mode is true, this is ignored entirely: the secret containers exist with zero versions until S27/S37 populate them out-of-band, and Cloud Run resolves secret_key_ref at revision-creation time, so mounting one now would fail the deploy."
  type        = map(string)
  default     = {}
}

variable "service_account_email" {
  description = "Runtime service account email this revision runs as (iam module output)"
  type        = string
}

variable "service_name" {
  description = "Cloud Run service name (e.g. ikaro-backend, ikaro-bff, ikaro-web)"
  type        = string
}

variable "sidecar_containers" {
  description = "Optional additional containers alongside the app container (e.g. the otel-collector sidecar, activated in S34). Empty by default — this module only needs to accept the shape, not configure a real collector yet."
  type = list(object({
    name   = string
    image  = string
    cpu    = optional(string, "1")
    memory = optional(string, "512Mi")
  }))
  default = []
}

variable "subnet_id" {
  description = "VPC subnet ID for direct egress (network module output). Required when vpc_egress is set."
  type        = string
  default     = null
}

variable "vpc_egress" {
  description = "Direct VPC egress mode. null omits the vpc_access block entirely (no VPC access). ALL_TRAFFIC is required for the BFF (its Google-API/backend calls must ride the subnet's Private Google Access — *.run.app resolves to public IPs, so PRIVATE_RANGES_ONLY would route the backend call outside the VPC and internal ingress would reject it, M17 §0). PRIVATE_RANGES_ONLY is correct for the backend (only needs the VPC for Cloud SQL's private IP)."
  type        = string
  default     = null

  validation {
    condition     = var.vpc_egress == null || contains(["ALL_TRAFFIC", "PRIVATE_RANGES_ONLY"], var.vpc_egress)
    error_message = "vpc_egress must be null, ALL_TRAFFIC, or PRIVATE_RANGES_ONLY."
  }

  # Without this, a caller setting vpc_egress but forgetting network_id/subnet_id
  # would only find out at apply time via an opaque GCP API error inside
  # network_interfaces — CodeRabbit finding, 2026-07-19.
  validation {
    condition     = var.vpc_egress == null || (var.network_id != null && var.subnet_id != null)
    error_message = "network_id and subnet_id are required when vpc_egress is set."
  }
}

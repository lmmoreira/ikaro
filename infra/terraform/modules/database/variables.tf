variable "db_tier" {
  description = "Cloud SQL machine tier (D12: db-f1-micro at launch in both envs; upgrade via tfvars when the first paying tenant lands)"
  type        = string
  default     = "db-f1-micro"
}

variable "deletion_protection" {
  description = "Protect the instance from deletion at both the Terraform and API level (true in prod)"
  type        = bool
  default     = false
}

variable "disk_autoresize_limit" {
  description = "Upper bound in GB for automatic disk growth — bounds cost; once reached, autoresize stops and further growth requires raising this value"
  type        = number
  default     = 30
}

variable "enable_pitr" {
  description = "Enable point-in-time recovery (prod only)"
  type        = bool
  default     = false
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
  description = "Google account email registered as a passwordless CLOUD_IAM_USER for human DB access — the value is never committed (gitignored local.auto.tfvars locally, TF_VAR_iam_admin_user in the pipeline)"
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+$", var.iam_admin_user))
    error_message = "iam_admin_user must be a Google account email with no whitespace (set it via the gitignored local.auto.tfvars or TF_VAR_iam_admin_user — never commit it)."
  }
}

variable "labels" {
  description = "Common labels applied to every resource that supports them"
  type        = map(string)
  default     = {}
}

variable "network_id" {
  description = "Fully-qualified VPC network ID the instance's private IP attaches to (network module output)"
  type        = string
}

variable "private_services_connection" {
  description = "ID of the network module's PSA peering connection — consumed so the peering is ordered before the instance"
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

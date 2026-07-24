variable "environment" {
  description = "Deployment environment represented by this foundation control plane."
  type        = string

  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "Environment must be staging or prod."
  }
}

variable "github_environment" {
  description = "Protected GitHub Environment required to impersonate the foundation deployer."
  type        = string
}

variable "github_ref" {
  description = "Trusted Git ref allowed to impersonate the foundation deployer."
  type        = string
  default     = "refs/heads/main"
}

variable "github_repository" {
  description = "GitHub repository allowed to use the Workload Identity Pool."
  type        = string
  default     = "lmmoreira/ikaro"
}

variable "project_id" {
  description = "GCP project ID containing the foundation identities."
  type        = string
}

variable "state_bucket_name" {
  description = "Shared Terraform state bucket; grants are condition-scoped to this foundation prefix."
  type        = string
}

variable "workload_identity_pool_id" {
  description = "Workload Identity Pool ID trusted by the foundation identities."
  type        = string
  default     = "github-pool"
}

variable "workload_identity_pool_project_number" {
  description = "Project number that owns the Workload Identity Pool."
  type        = string
}

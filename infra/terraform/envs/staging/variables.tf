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

variable "region" {
  description = "GCP region for regional resources"
  type        = string
  default     = "southamerica-east1"
}

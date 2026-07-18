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

variable "region" {
  description = "GCP region for regional resources"
  type        = string
  default     = "southamerica-east1"
}

variable "staging_project_id" {
  description = "GCP project ID of the staging environment — used to construct the staging app-deployer service account email (ikaro-app-deployer@<staging_project_id>.iam.gserviceaccount.com) for the cross-project write grant (D8)"
  type        = string
}

variable "staging_project_number" {
  description = "GCP project number of the staging environment — used to construct the staging Cloud Run service agent principal (service-<number>@serverless-robot-prod.iam.gserviceaccount.com) for the cross-project read grant. This is the identity Cloud Run actually uses to pull images, not a custom runtime service account."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.staging_project_number))
    error_message = "staging_project_number must be a numeric GCP project number (e.g. \"729809528251\"), not a project ID."
  }
}

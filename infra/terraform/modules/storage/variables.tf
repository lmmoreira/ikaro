variable "cors_origins" {
  description = "Origins allowed to PUT/GET against the private uploads bucket via signed URLs — the web app's origin(s) for this environment (browser uploads go directly to GCS via V4 signed URLs, never through the backend)"
  type        = list(string)

  validation {
    condition     = length(var.cors_origins) > 0
    error_message = "cors_origins must not be empty — an empty CORS origin list silently blocks every browser upload instead of failing plan."
  }
}

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

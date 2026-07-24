variable "environment" {
  description = "Foundation deployment environment."
  type        = string
  default     = "staging"
}

variable "project_id" {
  description = "GCP project ID for the staging foundation layer."
  type        = string
  default     = "ikaro-staging"
}

variable "project_number" {
  description = "GCP project number that owns staging's Workload Identity Pool."
  type        = string
  default     = "729809528251"
}

variable "region" {
  description = "Default GCP region for provider operations."
  type        = string
  default     = "southamerica-east1"
}

variable "state_bucket_name" {
  description = "Terraform state bucket shared by isolated state prefixes."
  type        = string
  default     = "ikaro-tfstate"
}

variable "environment" {
  description = "Foundation deployment environment."
  type        = string
  default     = "prod"
}

variable "project_id" {
  description = "GCP project ID for the production foundation layer."
  type        = string
  default     = "ikaro-prod"
}

variable "project_number" {
  description = "GCP project number that owns production's Workload Identity Pool."
  type        = string
  default     = "671829048389"
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

variable "environment" {
  description = "Foundation deployment environment."
  type        = string
  default     = "prod"
}

variable "create_relay_vm" {
  description = "Whether Foundation creates the on-demand IAP relay VM. Defaults false; change only through a reviewed Foundation PR for an operator session."
  type        = bool
  default     = false
}

variable "iam_admin_user" {
  description = "Optional Google account email retaining the legacy backend Cloud Run invoker grant. Supplied as TF_VAR_iam_admin_user from the protected GitHub Environment; never committed."
  type        = string
  default     = ""
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

variable "relay_db_instance_connection_name" {
  description = "Cloud SQL connection name used by the relay proxy. Empty until production's database exists."
  type        = string
  default     = ""
}

variable "relay_db_instance_name" {
  description = "Cloud SQL instance name used to register the relay IAM database user. Empty until production's database exists."
  type        = string
  default     = ""
}

variable "relay_network_id" {
  description = "Fully-qualified VPC network ID used by the Foundation-owned relay firewall."
  type        = string
  default     = "projects/ikaro-prod/global/networks/ikaro-vpc-prod"
}

variable "relay_platform_admin_key_secret_id" {
  description = "Resource ID of platform-admin-key, granted to the relay VM identity only while the VM exists."
  type        = string
  default     = "projects/ikaro-prod/secrets/platform-admin-key"
}

variable "relay_subnet_id" {
  description = "Fully-qualified private subnet ID attached to the Foundation-owned relay VM."
  type        = string
  default     = "projects/ikaro-prod/regions/southamerica-east1/subnetworks/ikaro-subnet-prod"
}

variable "state_bucket_name" {
  description = "Terraform state bucket shared by isolated state prefixes."
  type        = string
  default     = "ikaro-tfstate"
}

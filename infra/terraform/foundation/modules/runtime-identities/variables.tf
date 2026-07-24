variable "environment" {
  description = "Deployment environment owning the runtime identities."
  type        = string
}

variable "project_id" {
  description = "GCP project that owns the runtime identities."
  type        = string
}

variable "public_bucket_name" {
  description = "Public application bucket receiving the backend object-admin binding."
  type        = string
}

variable "secret_ids" {
  description = "Secret Manager resource IDs keyed by catalog secret name."
  type        = map(string)
}

variable "uploads_bucket_name" {
  description = "Private uploads bucket receiving the backend object-admin binding."
  type        = string
}

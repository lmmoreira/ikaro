variable "artifact_registry_members" {
  description = "Artifact Registry repository IAM bindings keyed by stable binding name."
  type = map(object({
    location   = string
    repository = string
    role       = string
    member     = string
  }))
  default = {}
}

variable "audit_log_types_by_service" {
  description = "Cloud Audit Logs types enabled per Google API service."
  type        = map(set(string))
  default     = {}
}

variable "project_id" {
  description = "GCP project containing the resource-scoped IAM policies."
  type        = string
}

variable "project_members" {
  description = "Project IAM bindings keyed by stable binding name."
  type = map(object({
    role   = string
    member = string
  }))
  default = {}
}

variable "public_bucket_name" {
  description = "Public assets bucket retaining the explicitly reviewed allUsers object-viewer grant."
  type        = string
}

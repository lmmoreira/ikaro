variable "project_id" {
  description = "Project that owns the shared Terraform state bucket and its project-level IAM policy."
  type        = string
}

variable "state_bucket_name" {
  description = "Shared Terraform state bucket whose foundation prefixes need temporary bootstrap access."
  type        = string
}

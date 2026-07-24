variable "project_id" {
  description = "Project whose enabled APIs are managed by foundation."
  type        = string
}

variable "services" {
  description = "Enabled Google APIs owned by the foundation state."
  type        = set(string)
}

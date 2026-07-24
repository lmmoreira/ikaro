variable "project_id" {
  description = "Project whose legacy normal-deployer bindings are adopted by foundation state."
  type        = string
}

variable "project_role_bindings" {
  description = "Existing project-role bindings granted to the normal deployer during TD34 migration."
  type = map(object({
    role = string
    condition = optional(object({
      title       = string
      description = string
      expression  = string
    }))
  }))
}

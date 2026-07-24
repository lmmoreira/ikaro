resource "google_project_iam_member" "normal_deployer_role" {
  for_each = var.project_role_bindings

  project = var.project_id
  role    = each.value.role
  member  = "serviceAccount:ikaro-tf-deployer@${var.project_id}.iam.gserviceaccount.com"

  dynamic "condition" {
    for_each = each.value.condition == null ? [] : [each.value.condition]

    content {
      title       = condition.value.title
      description = condition.value.description
      expression  = condition.value.expression
    }
  }
}

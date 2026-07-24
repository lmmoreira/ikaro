resource "google_project_service" "managed" {
  for_each = var.services

  project = var.project_id
  service = each.value

  disable_on_destroy = false
}

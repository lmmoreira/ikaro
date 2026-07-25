# TD34: this module owns static, resource-scoped policies while ordinary
# environment modules continue to own the bucket, repository, and relay VM
# resources themselves. Every binding is explicit so Foundation cannot widen a
# policy by managing an authoritative IAM binding or policy resource.
resource "google_storage_bucket_iam_member" "public_viewer" {
  #checkov:skip=CKV_GCP_28:intentional — this is the hotsite public-assets bucket; M17-S14 AC1 requires it to serve objects anonymously
  #checkov:skip=CKV_IKARO_1:same rationale — the one deliberate public grant in this repo, reviewed here
  bucket = var.public_bucket_name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

resource "google_project_iam_member" "project_member" {
  for_each = var.project_members

  project = var.project_id
  role    = each.value.role
  member  = each.value.member
}

resource "google_artifact_registry_repository_iam_member" "member" {
  for_each = var.artifact_registry_members

  project    = var.project_id
  location   = each.value.location
  repository = each.value.repository
  role       = each.value.role
  member     = each.value.member
}

resource "google_project_iam_audit_config" "service" {
  for_each = var.audit_log_types_by_service

  project = var.project_id
  service = each.key

  dynamic "audit_log_config" {
    for_each = each.value

    content {
      log_type = audit_log_config.value
    }
  }
}

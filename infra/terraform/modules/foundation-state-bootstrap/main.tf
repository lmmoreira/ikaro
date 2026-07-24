locals {
  bootstrap_deployers = {
    staging = "ikaro-tf-deployer@ikaro-staging.iam.gserviceaccount.com"
    prod    = "ikaro-tf-deployer@ikaro-prod.iam.gserviceaccount.com"
  }
}

# TD34 bootstrap only: these two exact state prefixes let the existing
# deployers initialize the otherwise-empty foundation backends. This module
# must be removed during TD34's de-privilege phase after the foundation
# identities own their permanent state bindings.
resource "google_project_iam_member" "deployer_foundation_state_bootstrap" {
  #checkov:skip=CKV_GCP_42:Temporary TD34 bootstrap grant is condition-scoped to one deployer's own foundation/<env>/ Terraform state prefix; it cannot administer buckets, project IAM, service accounts, or any other object path and is removed during de-privileging.
  for_each = local.bootstrap_deployers

  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${each.value}"

  condition {
    title       = "td34_${each.key}_foundation_state_bootstrap"
    description = "Temporary TD34 bootstrap access to the ${each.key} foundation Terraform state prefix only."
    expression  = "resource.name.startsWith('projects/_/buckets/${var.state_bucket_name}/objects/foundation/${each.key}/')"
  }
}

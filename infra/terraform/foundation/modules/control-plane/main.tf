locals {
  foundation_deployer_account_id = "ikaro-tf-foundation"
  foundation_planner_account_id  = "ikaro-tf-foundation-planner"

  github_pool_resource = "projects/${var.workload_identity_pool_project_number}/locations/global/workloadIdentityPools/${var.workload_identity_pool_id}"
  state_prefix         = "foundation/${var.environment}"
}

resource "google_service_account" "foundation_deployer" {
  project      = var.project_id
  account_id   = local.foundation_deployer_account_id
  display_name = "Ikaro Terraform foundation deployer (${var.environment})"
  description  = "Keyless CI identity for the protected foundation Terraform control plane."
}

resource "google_service_account" "foundation_planner" {
  project      = var.project_id
  account_id   = local.foundation_planner_account_id
  display_name = "Ikaro Terraform foundation planner (${var.environment})"
  description  = "Keyless, read-only CI identity for foundation Terraform plans."
}

resource "google_service_account_iam_member" "foundation_deployer_wif" {
  service_account_id = google_service_account.foundation_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${local.github_pool_resource}/attribute.repo_ref_env/${var.github_repository}@${var.github_ref}@${var.github_environment}"
}

resource "google_service_account_iam_member" "foundation_planner_wif" {
  service_account_id = google_service_account.foundation_planner.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${local.github_pool_resource}/attribute.repository/${var.github_repository}"
}

resource "google_storage_bucket_iam_member" "foundation_deployer_state" {
  bucket = var.state_bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.foundation_deployer.email}"

  condition {
    title       = "foundation_${var.environment}_state_prefix"
    description = "Limits the foundation deployer to its own Terraform state objects."
    expression  = "resource.name.startsWith('projects/_/buckets/${var.state_bucket_name}/objects/${local.state_prefix}/')"
  }
}

resource "google_storage_bucket_iam_member" "foundation_deployer_state_list" {
  bucket = var.state_bucket_name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${google_service_account.foundation_deployer.email}"
}

resource "google_storage_bucket_iam_member" "foundation_planner_state" {
  bucket = var.state_bucket_name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.foundation_planner.email}"

  condition {
    title       = "foundation_${var.environment}_state_prefix_read"
    description = "Limits the foundation planner to its own Terraform state objects."
    expression  = "resource.name.startsWith('projects/_/buckets/${var.state_bucket_name}/objects/${local.state_prefix}/')"
  }
}

resource "google_storage_bucket_iam_member" "foundation_planner_lock" {
  bucket = var.state_bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.foundation_planner.email}"

  condition {
    title       = "foundation_${var.environment}_state_lock"
    description = "Allows the planner to acquire only its Terraform state lock."
    expression  = "resource.name == 'projects/_/buckets/${var.state_bucket_name}/objects/${local.state_prefix}/default.tflock'"
  }
}

resource "google_storage_bucket_iam_member" "foundation_planner_state_list" {
  bucket = var.state_bucket_name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${google_service_account.foundation_planner.email}"
}

module "control_plane" {
  source = "../../modules/control-plane"

  environment                           = var.environment
  github_environment                    = "production-foundation"
  project_id                            = var.project_id
  state_bucket_name                     = var.state_bucket_name
  workload_identity_pool_project_number = var.project_number
}

module "project_services" {
  source = "../../modules/project-services"

  project_id = var.project_id
  services   = ["iap.googleapis.com"]
}

import {
  to = module.project_services.google_project_service.managed["iap.googleapis.com"]
  id = "${var.project_id}/iap.googleapis.com"
}

# The shared Terraform state bucket belongs to ikaro-prod. Staging's
# repository-scoped planner needs only the existing policy-reader custom role
# here to refresh the bucket IAM bindings held in staging foundation state.
resource "google_project_iam_member" "staging_foundation_planner_state_policy_reader" {
  project = var.project_id
  role    = "projects/${var.project_id}/roles/tfPlannerIamPolicyReader"
  member  = "serviceAccount:ikaro-tf-foundation-planner@ikaro-staging.iam.gserviceaccount.com"
}

# Both foundation deployers refresh bucket-IAM resources in their own state.
# This existing custom role is read-only and is sufficient for refresh; any
# future bucket-IAM mutation is transferred deliberately in TD34 phase 3.
resource "google_project_iam_member" "foundation_deployer_state_policy_reader" {
  for_each = toset([
    "ikaro-tf-foundation@ikaro-staging.iam.gserviceaccount.com",
    "ikaro-tf-foundation@ikaro-prod.iam.gserviceaccount.com",
  ])

  project = var.project_id
  role    = "projects/${var.project_id}/roles/tfPlannerIamPolicyReader"
  member  = "serviceAccount:${each.value}"
}

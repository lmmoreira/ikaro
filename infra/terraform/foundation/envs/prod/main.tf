module "control_plane" {
  source = "../../modules/control-plane"

  environment                           = var.environment
  github_environment                    = "production-foundation"
  project_id                            = var.project_id
  state_bucket_name                     = var.state_bucket_name
  workload_identity_pool_project_number = var.project_number
}

# The shared Terraform state bucket belongs to ikaro-prod. Staging's
# repository-scoped planner needs only the existing policy-reader custom role
# here to refresh the bucket IAM bindings held in staging foundation state.
resource "google_project_iam_member" "staging_foundation_planner_state_policy_reader" {
  project = var.project_id
  role    = "projects/${var.project_id}/roles/tfPlannerIamPolicyReader"
  member  = "serviceAccount:ikaro-tf-foundation-planner@ikaro-staging.iam.gserviceaccount.com"
}

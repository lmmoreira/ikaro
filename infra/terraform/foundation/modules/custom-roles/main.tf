locals {
  planner_iam_policy_reader_permissions = toset([
    "artifactregistry.repositories.getIamPolicy",
    "iam.serviceAccounts.getIamPolicy",
    "pubsub.subscriptions.getIamPolicy",
    "pubsub.topics.getIamPolicy",
    "resourcemanager.projects.getIamPolicy",
    "run.services.getIamPolicy",
    "secretmanager.secrets.getIamPolicy",
    "storage.buckets.getIamPolicy",
  ])

  resource_iam_writer_permissions = toset([
    "pubsub.subscriptions.getIamPolicy",
    "pubsub.subscriptions.setIamPolicy",
    "pubsub.topics.getIamPolicy",
    "pubsub.topics.setIamPolicy",
    "run.services.getIamPolicy",
    "run.services.setIamPolicy",
    "secretmanager.secrets.getIamPolicy",
    "secretmanager.secrets.setIamPolicy",
    "storage.buckets.getIamPolicy",
    "storage.buckets.setIamPolicy",
  ])
}

# This role already exists in both projects. Foundation adopts it so the
# complete custom-role boundary is version-controlled in the protected state.
resource "google_project_iam_custom_role" "planner_iam_policy_reader" {
  project     = var.project_id
  role_id     = "tfPlannerIamPolicyReader"
  title       = "Terraform Planner IAM Policy Reader"
  description = "Minimal read-only getIamPolicy permissions for M17's tf-planner service accounts, covering exactly the google_*_iam_member resource types this codebase's Terraform modules manage. Narrower than roles/iam.securityReviewer, which covers getIamPolicy across nearly every GCP service."
  permissions = local.planner_iam_policy_reader_permissions
  stage       = "GA"
}

# Foundation needs IAM-policy mutation only for application buckets and secrets
# during the runtime-identity and workload-IAM transfers. This role deliberately
# excludes object and secret-value read/write permissions and every
# project/service-account IAM permission.
resource "google_project_iam_custom_role" "resource_iam_writer" {
  project     = var.project_id
  role_id     = "tfFoundationResourceIamWriter"
  title       = "Terraform Foundation Resource IAM Writer"
  description = "Manage IAM policies for Terraform-managed application Cloud Run, Pub/Sub, bucket, and secret resources only."
  permissions = local.resource_iam_writer_permissions
  stage       = "GA"
}

mock_provider "google" {}

variables {
  project_id = "ikaro-staging"
}

run "roles_have_exactly_the_reviewed_permissions" {
  command = plan

  assert {
    condition     = google_project_iam_custom_role.planner_iam_policy_reader.role_id == "tfPlannerIamPolicyReader" && length(google_project_iam_custom_role.planner_iam_policy_reader.permissions) == 8 && alltrue([for permission in ["artifactregistry.repositories.getIamPolicy", "iam.serviceAccounts.getIamPolicy", "pubsub.subscriptions.getIamPolicy", "pubsub.topics.getIamPolicy", "resourcemanager.projects.getIamPolicy", "run.services.getIamPolicy", "secretmanager.secrets.getIamPolicy", "storage.buckets.getIamPolicy"] : contains(tolist(google_project_iam_custom_role.planner_iam_policy_reader.permissions), permission)])
    error_message = "The planner role must retain exactly its reviewed read-only IAM-policy permissions."
  }

  assert {
    condition     = google_project_iam_custom_role.resource_iam_writer.role_id == "tfFoundationResourceIamWriter" && length(google_project_iam_custom_role.resource_iam_writer.permissions) == 10 && alltrue([for permission in ["pubsub.subscriptions.getIamPolicy", "pubsub.subscriptions.setIamPolicy", "pubsub.topics.getIamPolicy", "pubsub.topics.setIamPolicy", "run.services.getIamPolicy", "run.services.setIamPolicy", "secretmanager.secrets.getIamPolicy", "secretmanager.secrets.setIamPolicy", "storage.buckets.getIamPolicy", "storage.buckets.setIamPolicy"] : contains(tolist(google_project_iam_custom_role.resource_iam_writer.permissions), permission)])
    error_message = "The Foundation resource writer must contain only the reviewed Cloud Run, Pub/Sub, bucket, and secret IAM-policy permissions."
  }

  assert {
    condition     = !contains(tolist(google_project_iam_custom_role.resource_iam_writer.permissions), "storage.objects.get") && !contains(tolist(google_project_iam_custom_role.resource_iam_writer.permissions), "secretmanager.versions.access")
    error_message = "The Foundation resource writer must not read application objects or secret values."
  }
}

resource "google_cloud_run_v2_service_iam_member" "invoker" {
  for_each = var.cloud_run_invokers

  project  = var.project_id
  location = var.region
  name     = each.value.service_name
  role     = "roles/run.invoker"
  member   = each.value.member
}

#checkov:skip=CKV_IKARO_1: intentional public invoker grants for the BFF and
# web services. Application authentication remains enforced by the BFF/session
# layer; the public-entry exception is reviewed explicitly here rather than
# hidden inside the generic resource-IAM map.
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  for_each = var.cloud_run_public_invokers

  project  = var.project_id
  location = var.region
  name     = each.value
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_pubsub_subscription_iam_member" "member" {
  for_each = var.pubsub_subscription_members

  project      = var.project_id
  subscription = each.value.subscription
  role         = each.value.role
  member       = each.value.member
}

resource "google_pubsub_topic_iam_member" "member" {
  for_each = var.pubsub_topic_members

  project = var.project_id
  topic   = each.value.topic
  role    = each.value.role
  member  = each.value.member
}

resource "google_service_account_iam_member" "member" {
  for_each = var.service_account_members

  service_account_id = each.value.service_account_id
  role               = each.value.role
  member             = each.value.member
}

resource "google_cloud_run_v2_service_iam_member" "invoker" {
  for_each = var.cloud_run_invokers

  project  = var.project_id
  location = var.region
  name     = each.value.service_name
  role     = "roles/run.invoker"
  member   = each.value.member
}

resource "google_cloud_run_v2_service_iam_member" "relay_invoker" {
  for_each = var.relay_cloud_run_services

  project  = var.project_id
  location = var.region
  name     = each.value
  role     = "roles/run.invoker"
  member   = "serviceAccount:ikaro-relay-vm@${var.project_id}.iam.gserviceaccount.com"
}

resource "google_pubsub_subscription_iam_member" "member" {
  for_each = var.pubsub_subscription_members

  project      = var.project_id
  subscription = "projects/${var.project_id}/subscriptions/${each.value.subscription}"
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

mock_provider "google" {}

variables {
  project_id = "ikaro-staging"
  region     = "southamerica-east1"

  cloud_run_invokers = {
    backend_bff = {
      service_name = "ikaro-backend"
      member       = "serviceAccount:ikaro-bff@ikaro-staging.iam.gserviceaccount.com"
    }
  }

  relay_cloud_run_services = ["ikaro-backend"]

  pubsub_subscription_members = {
    subscriber = {
      subscription = "ikaro-booking-created-notifier"
      role         = "roles/pubsub.subscriber"
      member       = "serviceAccount:service-729809528251@gcp-sa-pubsub.iam.gserviceaccount.com"
    }
  }

  pubsub_topic_members = {
    backend_publisher = {
      topic  = "ikaro-booking-created"
      role   = "roles/pubsub.publisher"
      member = "serviceAccount:ikaro-backend@ikaro-staging.iam.gserviceaccount.com"
    }
  }

  service_account_members = {
    pubsub_token_creator = {
      service_account_id = "projects/ikaro-staging/serviceAccounts/ikaro-pubsub-invoker@ikaro-staging.iam.gserviceaccount.com"
      role               = "roles/iam.serviceAccountTokenCreator"
      member             = "serviceAccount:service-729809528251@gcp-sa-pubsub.iam.gserviceaccount.com"
    }
  }
}

run "workload_iam_preserves_exact_resource_scoped_bindings" {
  command = plan

  assert {
    condition     = length(google_cloud_run_v2_service_iam_member.invoker) == 1 && google_cloud_run_v2_service_iam_member.relay_invoker["ikaro-backend"].member == "serviceAccount:ikaro-relay-vm@ikaro-staging.iam.gserviceaccount.com" && alltrue([for binding in values(google_cloud_run_v2_service_iam_member.invoker) : binding.role == "roles/run.invoker"])
    error_message = "Foundation must manage only explicit Cloud Run invoker bindings."
  }

  assert {
    condition     = google_pubsub_subscription_iam_member.member["subscriber"].subscription == "projects/ikaro-staging/subscriptions/ikaro-booking-created-notifier" && google_pubsub_subscription_iam_member.member["subscriber"].role == "roles/pubsub.subscriber" && google_pubsub_topic_iam_member.member["backend_publisher"].role == "roles/pubsub.publisher"
    error_message = "Foundation must preserve canonical subscription IDs and exact Pub/Sub resource roles."
  }

  assert {
    condition     = google_service_account_iam_member.member["pubsub_token_creator"].role == "roles/iam.serviceAccountTokenCreator"
    error_message = "Foundation must preserve the Pub/Sub service-agent token-creator binding."
  }
}

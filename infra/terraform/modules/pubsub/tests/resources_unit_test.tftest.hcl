# Guards the security-critical resource contract that variables_unit_test
# can't see: OIDC audience/invoker wiring, retry/DLQ policy, non-expiration,
# and the Pub/Sub service-agent + backend-publisher IAM grants. A future
# edit that removed or altered any of these would still produce a valid
# plan — variable validation alone would not catch it (security review
# finding, 2026-07-20). Asserts over every generated entry (alltrue), not
# one sampled key, so it stays valid regardless of which events/consumers
# the real catalog currently contains.

mock_provider "google" {}

variables {
  project_id              = "ikaro-test"
  project_number          = "729809528251"
  environment             = "staging"
  backend_push_endpoint   = "https://ikaro-backend-crle4i3nrq-rj.a.run.app"
  backend_pubsub_audience = "ikaro-backend-staging-pubsub-push"
  backend_sa_email        = "ikaro-backend@ikaro-test.iam.gserviceaccount.com"
  pubsub_invoker_sa_email = "ikaro-pubsub-invoker@ikaro-test.iam.gserviceaccount.com"
}

run "push_subscriptions_carry_correct_oidc_and_retry_config" {
  command = plan

  assert {
    condition = alltrue([
      for sub in google_pubsub_subscription.push : sub.push_config[0].push_endpoint == var.backend_push_endpoint
    ])
    error_message = "Every push subscription must target the backend's real push endpoint."
  }

  assert {
    condition = alltrue([
      for sub in google_pubsub_subscription.push :
      sub.push_config[0].oidc_token[0].service_account_email == var.pubsub_invoker_sa_email &&
      sub.push_config[0].oidc_token[0].audience == var.backend_pubsub_audience
    ])
    error_message = "Every push subscription must mint its OIDC token as ikaro-pubsub-invoker with the fixed backend audience — not left to Pub/Sub's URL-shaped default."
  }

  assert {
    condition = alltrue([
      for sub in google_pubsub_subscription.push :
      sub.retry_policy[0].minimum_backoff == "10s" && sub.retry_policy[0].maximum_backoff == "600s"
    ])
    error_message = "Every push subscription must use the 10s/600s retry backoff."
  }

  assert {
    condition     = alltrue([for sub in google_pubsub_subscription.push : sub.dead_letter_policy[0].max_delivery_attempts == 5])
    error_message = "Every push subscription must dead-letter after exactly 5 delivery attempts."
  }
}

run "push_and_dlq_inspect_subscriptions_never_expire" {
  command = plan

  assert {
    condition     = alltrue([for sub in google_pubsub_subscription.push : sub.expiration_policy[0].ttl == ""])
    error_message = "Push subscriptions must never auto-expire from inactivity — a low-traffic topic could otherwise silently lose its subscription."
  }

  assert {
    condition     = alltrue([for sub in google_pubsub_subscription.dlq_inspect : sub.expiration_policy[0].ttl == ""])
    error_message = "The DLQ inspect subscription must never auto-expire — losing it silently breaks the DLQ handling contract."
  }
}

run "pubsub_service_agent_holds_dlq_and_subscriber_grants" {
  command = plan

  assert {
    condition = alltrue([
      for iam in google_pubsub_subscription_iam_member.service_agent_subscriber :
      iam.role == "roles/pubsub.subscriber" &&
      iam.member == "serviceAccount:service-${var.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
    ])
    error_message = "The Pub/Sub service agent must hold subscriber on every push subscription (required for dead-letter redelivery)."
  }

  assert {
    condition = alltrue([
      for iam in google_pubsub_topic_iam_member.service_agent_dlq_publisher :
      iam.role == "roles/pubsub.publisher" &&
      iam.member == "serviceAccount:service-${var.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
    ])
    error_message = "The Pub/Sub service agent must hold publisher on every DLQ topic (required for dead-letter redelivery)."
  }

  assert {
    condition     = google_service_account_iam_member.pubsub_sa_token_creator.role == "roles/iam.serviceAccountTokenCreator"
    error_message = "The Pub/Sub service agent must hold tokenCreator on ikaro-pubsub-invoker, or every push delivery fails auth."
  }

  assert {
    condition     = google_service_account_iam_member.pubsub_sa_token_creator.member == "serviceAccount:service-${var.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
    error_message = "tokenCreator grant must be held by the Pub/Sub service agent, not an unrelated principal."
  }
}

run "backend_holds_publisher_on_every_source_topic" {
  command = plan

  assert {
    condition = alltrue([
      for iam in google_pubsub_topic_iam_member.backend_publisher :
      iam.role == "roles/pubsub.publisher" && iam.member == "serviceAccount:${var.backend_sa_email}"
    ])
    error_message = "The backend runtime SA must hold publisher on every topic it publishes domain events/dead-letter entries/cron re-triggers to."
  }
}

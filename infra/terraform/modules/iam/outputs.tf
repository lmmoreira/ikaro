output "backend_sa_email" {
  description = "Backend runtime SA email — consumed by S18 (cloudrun-service, service_account + run.invoker grants) and S19 (topic-level pubsub.publisher)"
  value       = google_service_account.backend.email
}

output "bff_sa_email" {
  description = "BFF runtime SA email — consumed by S18 (cloudrun-service, service_account + run.invoker on backend)"
  value       = google_service_account.bff.email
}

output "pubsub_invoker_sa_email" {
  description = "Pub/Sub push OIDC identity email — consumed by S18 (run.invoker on backend) and S19 (push subscription oidc_token.service_account_email)"
  value       = google_service_account.pubsub_invoker.email
}

output "web_sa_email" {
  description = "Web runtime SA email — consumed by S18 (cloudrun-service, service_account + run.invoker on bff)"
  value       = google_service_account.web.email
}

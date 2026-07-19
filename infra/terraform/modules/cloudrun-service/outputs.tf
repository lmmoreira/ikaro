output "service_name" {
  description = "Cloud Run service name — consumed by S19 (push subscription target) and S22 (NEG backend service)"
  value       = google_cloud_run_v2_service.this.name
}

output "service_uri" {
  description = "The service's *.run.app URI — consumed by S19 (push endpoint is this value + \"/pubsub/push\") and by other services' BACKEND_INTERNAL_URL/env wiring in envs/<env>/main.tf"
  value       = google_cloud_run_v2_service.this.uri
}

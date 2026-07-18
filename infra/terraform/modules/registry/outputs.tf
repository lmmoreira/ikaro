output "repository_id" {
  description = "Artifact Registry repository ID (ikaro-registry) — consumed by modules/cloudrun-service and modules/migrate-job to build image URIs"
  value       = google_artifact_registry_repository.ikaro.repository_id
}

output "repository_url" {
  description = "Docker repository host+path (<region>-docker.pkg.dev/<project_id>/<repository_id>) — prefix images are pushed to and pulled from, e.g. \"<repository_url>/ikaro-backend:<sha>\""
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.ikaro.repository_id}"
}

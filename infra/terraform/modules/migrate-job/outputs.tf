output "job_name" {
  description = "Cloud Run Job name — consumed by the deploy pipelines (S25/S26), which run `gcloud run jobs update/execute` against it by name."
  value       = google_cloud_run_v2_job.this.name
}

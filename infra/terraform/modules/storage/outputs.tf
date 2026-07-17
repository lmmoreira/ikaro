output "public_base_url" {
  description = "Host-only base URL for public object URLs (GCS_PUBLIC_BASE_URL). GcsSignedUrlAdapter.getPublicUrl() appends the bucket name itself — this must stay host-only (no bucket-name segment) until M17-S44 fronts the public bucket with a custom domain, which resolves differently."
  value       = "https://storage.googleapis.com"
}

output "public_bucket_name" {
  description = "Public hotsite-assets bucket name (GCS_PUBLIC_BUCKET_NAME)"
  value       = google_storage_bucket.public.name
}

output "public_bucket_self_link" {
  description = "Self-link of the public bucket — for the M17-S17 IAM module and the M17-S44 load-balancer backend-bucket wiring"
  value       = google_storage_bucket.public.self_link
}

output "uploads_bucket_name" {
  description = "Private uploads bucket name (GCS_BUCKET_NAME)"
  value       = google_storage_bucket.uploads.name
}

output "uploads_bucket_self_link" {
  description = "Self-link of the uploads bucket — for the M17-S17 IAM module"
  value       = google_storage_bucket.uploads.self_link
}

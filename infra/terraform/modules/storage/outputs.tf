locals {
  public_base_url = "https://storage.googleapis.com"
}

output "public_base_url" {
  description = "Host-only base URL for public object URLs (GCS_PUBLIC_BASE_URL). GcsSignedUrlAdapter.getPublicUrl() appends the bucket name itself — this must stay host-only (no bucket-name segment) until M17-S44 fronts the public bucket with a custom domain, which resolves differently."
  value       = local.public_base_url
}

output "public_object_base_url" {
  description = "Base URL that a public object path (tenants/<id>/..., shared/...) resolves against: public_base_url plus the bucket name. For the web app's NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL, whose resolver appends the stored path directly (GcsSignedUrlAdapter.getPublicUrl() does the same join server-side). Like public_base_url, revisit when M17-S44 fronts the bucket with a custom domain."
  value       = "${local.public_base_url}/${google_storage_bucket.public.name}"
}

output "public_bucket_name" {
  description = "Public hotsite-assets bucket name (GCS_PUBLIC_BUCKET_NAME)"
  value       = google_storage_bucket.public.name
}

output "public_bucket_self_link" {
  description = "Self-link of the public bucket — for foundation/modules/runtime-identities (originally M17-S17's modules/iam) and the M17-S44 load-balancer backend-bucket wiring"
  value       = google_storage_bucket.public.self_link
}

output "uploads_bucket_name" {
  description = "Private uploads bucket name (GCS_BUCKET_NAME)"
  value       = google_storage_bucket.uploads.name
}

output "uploads_bucket_self_link" {
  description = "Self-link of the uploads bucket — for foundation/modules/runtime-identities (originally M17-S17's modules/iam)"
  value       = google_storage_bucket.uploads.self_link
}

# modules/storage — GCS buckets: private uploads (browser V4 signed-URL
# PUT/GET) + public hotsite assets (anonymous read). Both southamerica-east1,
# uniform bucket-level access, GCS soft-delete default (7-day retention,
# provider default — not overridden here).

resource "google_storage_bucket" "uploads" {
  #checkov:skip=CKV_GCP_78:versioning would retain tmp/-deleted and (later, M17-S45) retention-deleted objects indefinitely, defeating the lifecycle rules that are this bucket's whole cleanup design; the DB reference is the source of truth, not the object history
  #checkov:skip=CKV_GCP_62:bucket-level usage-log sink needs a second bucket to receive logs — a distinct, heavier feature not in this story's scope. Cloud Audit Admin Activity logs (always-on, M17 §2) already cover bucket/IAM config changes; object-level Data Access logs are a future decision if a compliance need arises (LGPD tracked separately, M17-S45)
  name          = "ikaro-uploads-${var.environment}"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"
  labels        = var.labels

  uniform_bucket_level_access = true
  # Bucket-level enforcement regardless of any org-policy exception — this
  # bucket must never serve anonymous reads (booking/hotsite tmp uploads are
  # tenant-private until promoted to the public bucket).
  public_access_prevention = "enforced"

  cors {
    origin          = var.cors_origins
    method          = ["PUT", "GET"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  # Browser-abandoned multipart uploads that never completed — GCS-native
  # cleanup, zero app code.
  lifecycle_rule {
    action {
      type = "AbortIncompleteMultipartUpload"
    }
    condition {
      age = 7
    }
  }

  # tmp/ staging convention (td/TD22-ORPHANED-UPLOAD-CLEANUP.md): every
  # upload (hotsite + booking photos) lands under tmp/<tenantId>/... first
  # and is promoted to a permanent tenants/... path on submit/save. Anything
  # left behind here — abandoned, explicitly removed, or superseded — ages
  # out automatically. The prefix is bucket-root (`tmp/`, not
  # `tenants/<id>/tmp/`) because GCS lifecycle conditions only support a
  # single static matches_prefix per rule (no wildcards) — a tenant-nested
  # path can't be matched with one rule across every tenant.
  #
  # M17-S45 adds a separate `tenants/`-prefixed retention/tiering rule set on
  # this same bucket for promoted booking photos — additive, non-conflicting.
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age            = 2
      matches_prefix = ["tmp/"]
    }
  }

  # Promoted booking photos (tenants/-prefixed): a viewer opening a
  # months-old booking still needs the photo to load, so tier to Nearline
  # (instant-access, cheaper storage / pricier reads) rather than deleting
  # early. matches_prefix scopes this to tenants/ only, so no future
  # non-photo object class under this bucket is caught by accident.
  lifecycle_rule {
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
    condition {
      age            = 60
      matches_prefix = ["tenants/"]
    }
  }

  # Retention decision, not a cost-only knob (M17-S45, confirmed 365 at
  # /story-discovery 2026-08-14) — customer vehicle photos are personal
  # data (LGPD) and must not be kept indefinitely. Deletion leaves the DB's
  # photo-URL reference dangling by design: the storage layer is the source
  # of truth for existence, and the app degrades gracefully on a missing
  # object (apps/web PhotoTile component) rather than needing a cleanup job.
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age            = var.booking_photo_retention_days
      matches_prefix = ["tenants/"]
    }
  }
}

resource "google_storage_bucket" "public" {
  #checkov:skip=CKV_GCP_114:this bucket exists specifically to serve anonymous public reads (hotsite marketing images, M17-S14 AC1) — enforcing PAP at the bucket level would break its entire purpose; it inherits the S07-step-7 project-level org-policy exception instead
  #checkov:skip=CKV_GCP_78:versioning would retain every superseded hotsite image indefinitely, undermining the immutable-unique-object-name assumption M17-S44's edge caching relies on and adding unbounded storage cost for tenant-replaced marketing content
  #checkov:skip=CKV_GCP_62:same rationale as the uploads bucket — a bucket-level usage-log sink needs a second bucket and isn't in this story's scope; Admin Activity logs already cover config changes
  name          = "ikaro-public-${var.environment}"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"
  labels        = var.labels

  uniform_bucket_level_access = true
  # Inherits the project-level org-policy exception (M17-S07 step 7) to the
  # org's default storage.publicAccessPrevention posture — the allUsers
  # grant below fails without that exception in place.
  public_access_prevention = "inherited"

  cors {
    origin          = ["*"]
    method          = ["GET"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  # Deliberately NO age-based lifecycle rule: hotsite/marketing assets are
  # permanent by design (M17-S45 decision, 2026-07-07) — tenant-owned
  # marketing content, not a cost-trim candidate. This is intentional, not
  # an oversight — do NOT "optimize" this by adding one. Unlike the uploads
  # bucket's tenants/-prefixed booking-photo retention rule above, a
  # featured gallery image here is a permanent editorial copy
  # (feature-booking-photo.use-case.ts), decoupled from the source booking's
  # own lifecycle — nothing in this bucket should ever expire.
}

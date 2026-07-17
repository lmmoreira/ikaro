# modules/storage — GCS buckets (uploads private, hotsite public)

Two buckets, both `southamerica-east1`, uniform bucket-level access, GCS soft-delete default:

- **`ikaro-uploads-{env}`** — private. Browser uploads/reads go via V4 signed URLs (M115-S01); nothing here is reachable anonymously (`public_access_prevention = "enforced"` at the bucket level, on top of the org-policy default).
- **`ikaro-public-{env}`** — public-read (`allUsers: roles/storage.objectViewer`). Hotsite marketing assets (logo, hero/CTA backgrounds, gallery, about photos) get fixed, permanently-cacheable addresses instead of expiring signed URLs.

## Keyless signed URLs

`GcsSignedUrlAdapter` requires no code change for cloud signing: when `GCS_KEY_FILE` is unset it falls through to Application Default Credentials, and `@google-cloud/storage`'s `getSignedUrl()` automatically uses IAM SignBlob against the runtime service account — provided that SA holds `roles/iam.serviceAccountTokenCreator` **on itself** (granted in M17-S17). `GCS_KEY_FILE` stays a local-dev-only var (fake key for the emulator).

## Public-access-prevention asymmetry (deliberate)

| Bucket | `public_access_prevention` | Why |
|---|---|---|
| `uploads` | `"enforced"` | Bucket-level hard block, independent of any org-policy state — this bucket must never serve an anonymous read. |
| `public` | `"inherited"` | Follows the *project-level* org-policy exception (M17-S07 step 7) to the org's default-enforced posture. Without that exception, the `allUsers` grant below fails outright — new GCP orgs ship with `storage.publicAccessPrevention` enforced by default. |

The `allUsers` grant itself also needed a second org-policy exception beyond `public_access_prevention`. See `infra/terraform/README.md`'s "IAM binding review discipline" section before adding any further IAM bindings anywhere in this repo, and the gitignored `docs/BOOTSTRAP_LOG.md` for exact current policy state.

## `tmp/` staging + lifecycle (TD22)

Every upload — hotsite and booking-photo alike — lands first at `tmp/<tenantId>/<uuid>/<fileName>` in the **uploads** bucket (app-side convention, `td/TD22-ORPHANED-UPLOAD-CLEANUP.md`, resolved). An explicit promotion step (app code, not this module) copies the object to its permanent `tenants/<tenantId>/...` path only when the surrounding record is actually saved. This module provides the backstop: a lifecycle rule deletes anything still under `tmp/` after 2 days — covers abandoned uploads, explicit removals, and superseded uploads with zero app-side cleanup code.

The prefix is deliberately bucket-root (`tmp/`, not `tenants/<id>/tmp/`): GCS lifecycle `matches_prefix` is a literal string match with no wildcards, so a tenant-nested path can't be caught by one rule across every tenant.

A second, unrelated lifecycle rule (`AbortIncompleteMultipartUpload`, age 7 days) cleans up multipart uploads a browser started but never finished — orthogonal to the `tmp/` convention, both additive.

**M17-S45** will add a third rule set on this same bucket (`matches_prefix = ["tenants/"]`, age → `NEARLINE` then `Delete` at `var.booking_photo_retention_days`) for *promoted* booking photos. All three rule sets are additive and non-conflicting. The public bucket carries no age-based rule at all — hotsite/marketing assets are permanent by design (S45 decision, 2026-07-07); a future cost-trim must not "optimize" tenant marketing assets away.

## `GCS_PUBLIC_BASE_URL` — host only, no bucket segment

`GcsSignedUrlAdapter.getPublicUrl()` composes `${GCS_PUBLIC_BASE_URL}/${GCS_PUBLIC_BUCKET_NAME}/${storagePath}` — it appends the bucket name itself. The `public_base_url` output is therefore `https://storage.googleapis.com` with **no** `/ikaro-public-{env}` suffix; setting the env var to an already-bucket-scoped value doubles the bucket segment and breaks every hotsite image URL. This stays true until M17-S44 fronts the public bucket with `img.ikaro.online` via a load-balancer backend bucket, which resolves differently (no bucket-name segment needed at all, since the custom hostname is already bucket-scoped).

## CORS

- `uploads`: `PUT`/`GET` from `var.cors_origins` (the web app's own origin(s) for the environment — signed-URL uploads/reads happen directly from the browser to GCS). `response_header = ["Content-Type"]` — the only custom header the upload flow sends (`apps/web/shared/lib/upload/upload-to-signed-url.ts`).
- `public`: `GET` from `*` — hotsite images are public by definition, viewable from any origin.

CORS correctness against real browser preflights is verified against staging during the M17-S27 activation runbook (this story ships the config; live verification needs a deployed web service to originate the request from).

## Unconditional creation (no `enable_storage` gate)

Unlike `modules/database` (deferred behind `enable_database` — a Cloud SQL instance is a real 24/7 cost from creation), GCS buckets cost effectively nothing empty. Both env roots instantiate this module unconditionally.

# Data Retention & Privacy — Reference

**Audience:** Platform operators and tenants. This is the source-of-truth reference for how long customer data is kept — tenants can draw from it to tell their own customers how long photos are kept, since the app has no live product-facing terms/privacy page yet.

**Status:** Stub, created by M17-S45. M17-S51 (LGPD data lifecycle: subject rights + tenant offboarding) extends this with the backup/deletion interplay statement and links to the export/deletion/offboarding runbooks.

---

## Booking photos (vehicle photos)

Customer vehicle photos uploaded during booking (`beforeServicePhotoUrls`) or after service completion (`afterServicePhotoUrls`) are personal data under LGPD. They follow this lifecycle in the private uploads bucket:

| Age | Behavior |
|---|---|
| 0–60 days | Standard storage, instant access |
| 60 days | Transitions to Nearline storage class (still instant-access, just cheaper storage / pricier reads) |
| **365 days** | **Permanently deleted** from cloud storage |

The 365-day value is `var.booking_photo_retention_days` (`infra/terraform/modules/storage`), confirmed at `/story-discovery` for M17-S45 (2026-08-14) — chosen to exceed any reasonable tenant dispute/warranty window, not as a cost-only decision.

After deletion, the booking record's photo-URL fields still contain the (now-dead) path — there is no cleanup job scrubbing the database, since the storage layer is the sole source of truth for whether a photo still exists. The dashboard and customer-facing booking views show a localized "Foto expirada" / "Photo expired" placeholder in place of a photo that fails to load, rather than a broken image.

## Hotsite / public marketing assets

Images placed on a tenant's public hotsite (branding, hero/CTA backgrounds, gallery, about-page photos) — including a booking photo an admin has explicitly *featured* in the gallery — are **permanent**. They live in a separate public bucket with no age-based deletion rule.

This is deliberate: a featured gallery image is a *copy* of the original booking photo, made at the moment an admin features it, and does not depend on the source booking's own private-bucket copy. Deleting the private booking photo (via the retention rule above) never affects an image already featured on the hotsite.

## What this stub does not yet cover

The following are explicitly deferred to M17-S51:
- What happens to this data (and everything else) when a customer requests export or deletion
- What happens to a tenant's data when they leave the platform
- How the 7-day database backup window (M17-S13) interacts with a deletion that already happened

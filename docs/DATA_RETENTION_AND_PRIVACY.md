# Data Retention & Privacy — Reference

> **When to load:** answering how long personal data is kept (booking photos, public marketing assets, booking-context personal data, and the planned Billing data: provider events, signup registrations, billing account PII, fiscal retention) or changing storage lifecycle and LGPD behavior; it is a stub, so read what it does not yet cover; the storage layout is in `docs/DATABASE_SCHEMA.md`.
> **Tags:** backend, database

**Audience:** Platform operators and tenants. This is the source-of-truth reference for how long customer data is kept — tenants can draw from it to tell their own customers how long photos are kept, since the app has no live product-facing terms/privacy page yet.

**Status:** Stub, created by M17-S45. M17-S51 (LGPD data lifecycle: subject rights + tenant offboarding) extends this with the backup/deletion interplay statement and links to the export/deletion/offboarding runbooks.

---

## Booking photos (vehicle photos)

Customer vehicle photos uploaded during booking (`beforeServicePhotoUrls`) or after service completion (`afterServicePhotoUrls`) are personal data under LGPD. They follow this lifecycle in the private uploads bucket:

| Age | Behavior |
|---|---|
| 0–60 days | Standard storage, instant access |
| 60 days | Transitions to Nearline storage class (still instant-access, just cheaper storage / pricier reads) |
| **365 days** | Deleted and made permanently inaccessible from the app |
| 365–372 days | Recoverable only via GCS's bucket-wide soft-delete safety net (see below) |
| **372 days** | Irreversibly purged |

The 365-day value is `var.booking_photo_retention_days` (`infra/terraform/modules/storage`), confirmed at `/story-discovery` for M17-S45 (2026-08-14) — chosen to exceed any reasonable tenant dispute/warranty window, not as a cost-only decision.

**Soft-delete window:** the uploads bucket keeps GCS's default soft-delete policy (7-day retention, not overridden — see `infra/terraform/modules/storage/main.tf`'s header comment), which applies to every deletion on the bucket, including this lifecycle rule's. A deleted photo is inaccessible to the app immediately at day 365, but the underlying object isn't irrecoverably gone until day 372 — a deliberate operational safety net against an accidental or malicious delete, not an exception carved out for booking photos specifically.

After deletion, the booking record's photo-URL fields still contain the (now-dead) path — there is no cleanup job scrubbing the database, since the storage layer is the sole source of truth for whether a photo still exists. The dashboard and customer-facing booking views show a localized "Foto expirada" / "Photo expired" placeholder in place of a photo that fails to load, rather than a broken image.

## Hotsite / public marketing assets

Images placed on a tenant's public hotsite (branding, hero/CTA backgrounds, gallery, about-page photos) — including a booking photo an admin has explicitly *featured* in the gallery — are **permanent**. They live in a separate public bucket with no age-based deletion rule.

This is deliberate: a featured gallery image is a *copy* of the original booking photo, made at the moment an admin features it, and does not depend on the source booking's own private-bucket copy. Deleting the private booking photo (via the retention rule above) never affects an image already featured on the hotsite.

## Booking-context personal data added by M21–M23 (database rows)

The multi-vertical scheduling work added tables that hold personal data. This table records **what the code enforces today**; where it says "no rule", no retention or deletion rule exists in code and the policy is an open product/legal decision (owner: the M17-S51 LGPD lifecycle work) — do not read the absence of a rule as a decision to keep the data forever or to delete it.

| Data (table) | What it holds | Retention enforced in code today |
|---|---|---|
| `booking_attendees` | Names of the people attending a booking, an `is_minor` flag, optional link to a customer — **can contain a minor's name** | No rule. Highest sensitivity of the set |
| Booking intake answers (`bookings.intake_answers`, jsonb; the versioned questions in `service_booking_intake_schema`) | Free-form answers to tenant-defined questions (may include health, vehicle or other personal details), consent version and timestamp | No rule |
| `recurring_booking_schedules` (+ resource assignments) | A customer's standing weekly pattern, term, preferences | No rule (`ENDED`/`CANCELLED` rows are kept) |
| `availability_alerts`, `availability_alert_notification_attempts` | A customer's wanted dates/windows and email-delivery outcome (redacted last error) | Finished alerts are deleted once their `expiresAt` is more than **90 days** in the past (`AVAILABILITY_ALERT_RETENTION_DAYS`, `expire-availability-alerts.job.ts`) |
| `booking_status_transitions` | Who (staff id) changed a booking's status and a free-text reason (e.g. the staff-entered no-show reason) | No rule |
| `booking_quote_revisions` | Price snapshots of a booking's quote over reschedules | No rule |
| `future_commitment_exceptions` | A manager's worklist entry about an affected booking and its resolution reason | No rule |
| `resource_occupancy` | Which resource was occupied when, per booking | Purged **90 days after `ends_at`** (`resource-occupancy-retention-purge.job.ts`) |
| `bookings.created_by_staff_id` / guest contact fields on staff-created bookings (UC-108) | The staff member who created a booking for a guest, plus the guest's name, phone and email | Follows the booking row — no rule |
| `shared.outbox` / `shared.inbox` | Event envelopes (may carry contact details, e.g. `BookingNoShow`) | Swept after `OUTBOX_RETENTION_DAYS` / `INBOX_RETENTION_DAYS` (default 14) |

Chatbot, lead-form and loyalty retention are enforced by their own jobs (`ChatbotRetentionPurgeJob`, `LeadFormRetentionPurgeJob`, the loyalty expiry cron) and are described with those features; they are not repeated here. The lead-form retention window is the per-tenant setting `leadForm.retentionMonths` (default 6, bounds 1–24 — see `docs/TENANTS_SETTINGS_SCHEMA.md`).

---

## What this stub does not yet cover

The following are explicitly deferred to M17-S51:
- What happens to this data (and everything else, including the rows listed above) when a customer requests export or deletion
- What happens to a tenant's data when they leave the platform
- How the 7-day database backup window (M17-S13) interacts with a deletion that already happened

---

## Planned: Billing data retention (Billing release)

> **PLANNED, NOT YET BUILT.** Tables: `docs/DATABASE_SCHEMA.md` § Schema: `billing`. Nothing below is enforced until the Billing release ships.

| Data | Where | Retention |
|---|---|---|
| Webhook idempotency inbox | `billing.provider_events` | **30 days**, deleted daily by the `billing-provider-events-purge` job (UC-114); no personal data beyond the opaque tenant and provider ids |
| Signup registration (Google `sub`, tax id, terms acceptance) | `billing.signup_registrations` | The tax id is **cleared on completion** (copied to `billing_accounts`); a `RESERVED` row is released after one hour; a `COMPLETED` row (Google `sub`, terms version and time) is kept while the tenant lives because the trial-eligibility rule needs it, and is deleted by the purge's `BILLING` step or immediately by a never-paid self-service discard |
| Billing account PII (tax id, legal name, billing email, address, terms acceptance) | `billing.billing_accounts` | Kept while the tenant lives; the personal fields are deleted by the purge's `BILLING` step |
| Charges and their lines/tax lines | `billing.charges`, `charge_lines`, `charge_tax_lines` | **Kept (anonymized, `tenant_id` an opaque id) after a tenant purge for fiscal reasons.** The retention period in years is **not decided**: it is gated on the accountant's answer and must be recorded here before the first real charge |
| Operator audit payloads | `billing.operator_audit` | Payloads deleted by the purge's `BILLING` step |

Card data never touches Ikaro (the provider-hosted pages hold it), and `has_ever_paid` is never cleared.

---

## Planned: automated tenant erasure (Billing, slice G)

> **PLANNED, NOT YET BUILT.** This section only records that an automated answer to "what happens to a tenant's data when they leave" is planned; it does not change what the rows above do today, and it does not replace the M17-S51 deliverables.

- **What is planned.** A suspended tenant's data is erased by a durable, cross-context purge: at the clean-up deadline and warning thresholds defined in `docs/USE_CASES.md` UC-132, or immediately when a manager discards a never-paid tenant (UC-141). Every bounded context deletes its own data idempotently, and Platform removes the tenant root last. The coordinator, its events and tables, and what Billing keeps for fiscal reasons are in `docs/DOMAIN_MODEL.md` § Context 7: Billing Context, `docs/DOMAIN_EVENTS.md` § Billing Context Events and `docs/DATABASE_SCHEMA.md` § Schema: `billing`.
- **What it does not decide.** The per-context deletion rules (what each participant removes, including the files in the storage bucket) are specified when each participant's deletion story is written; the self-service data export is not a use case yet; the backup-window interplay stays an M17-S51 deliverable.
- **Interim path.** Until every participant has shipped, the purge trigger stays disabled and tenant offboarding is the manual set of runbooks M17-S51 produces (`plan/M17-CLOUD-DEPLOY.md` M17-S51; operator procedure in `docs/RUNBOOKS.md` § Billing (planned), the "Interim" entry and the data-subject erasure entry). M17-S51 is not superseded by the automated pipeline: it remains the fallback and the home of the backup interplay.

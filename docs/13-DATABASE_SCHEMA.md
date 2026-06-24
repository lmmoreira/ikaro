# Database Schema - Ikaro

## Overview

Ikaro uses a **Single PostgreSQL instance, Schema-per-Context** pattern. Each bounded context owns its own PostgreSQL schema. This enforces physical data isolation between contexts and makes context boundaries visible at the database level.

```
Single PostgreSQL instance
├── platform   (Platform Context)
├── booking    (Booking Context)
├── customer   (Customer Context)
├── staff      (Staff Context)
├── loyalty    (Loyalty Context)
└── notification (Notification Context)
```

**Multi-tenant isolation within each schema** is enforced by a mandatory `tenant_id` column on every table, composite indexes starting with `tenant_id`, and composite FK constraints within a context.

---

## Global Standards

### 1. Primary Keys
All IDs are **UUID v7** — time-ordered, globally unique, no schema coupling, safe for future extraction to microservices.

**Why v7 over v4:** UUID v7 embeds a millisecond-precision timestamp in the high bits. New rows are inserted in roughly chronological order, which means B-tree index pages are appended to rather than split at random positions. At MVP scale the difference is small; at 1 M+ rows it eliminates index fragmentation and reduces write amplification significantly.

**Library — always use this import:**
```typescript
import { v7 as uuidv7 } from 'uuid'; // npm install uuid  (v9+)

const id = uuidv7(); // correct — time-ordered
```

> **Never use `crypto.randomUUID()`** for entity IDs. Node.js's built-in `crypto.randomUUID()` generates UUID **v4** (random), which defeats the index-ordering benefit. Reserve it only for contexts where ordering genuinely does not matter (e.g. nonce values, CSRF tokens).

All domain entities, value objects, and test factories that generate IDs must use `uuidv7()`. The `uuid` package is already a standard dependency — no additional install needed beyond adding it to `package.json`.

### 2. Cross-Schema FK Rules
| Reference type | FK constraint? | Rule |
|---|---|---|
| `tenant_id` → `platform.tenants(id)` | ✅ Yes | Foundational exception — tenant must exist |
| Intra-context (same schema) | ✅ Yes | Always enforce referential integrity within a context |
| Cross-context (different schemas) | ❌ No | Store UUID only. Integrity enforced at application level via events. |

This is a direct consequence of the Context Isolation Contract in `docs/05-BOUNDED_CONTEXTS.md` (Rule 3).

### 3. Audit Columns
Every mutable table includes:
- `tenant_id` UUID NOT NULL + FK → `platform.tenants(id)`
- `created_at` TIMESTAMP WITH TIME ZONE DEFAULT now()
- `updated_at` TIMESTAMP WITH TIME ZONE DEFAULT now() (mutable rows only)

Optional where relevant:
- `deleted_at` TIMESTAMP WITH TIME ZONE — soft delete (bookings, services, staff)
- `created_by` / `updated_by` UUID — where the actor matters for audit

---

## Schema: `platform`

Owned by: **Platform Context** (`src/contexts/platform/`)

### `platform.tenants`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| name | VARCHAR(255) | NOT NULL |
| slug | VARCHAR(100) | UNIQUE, NOT NULL |
| settings | JSONB | Full schema → `docs/21-TENANTS_SETTINGS_SCHEMA.md` |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| updated_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |

### `platform.hotsite_configs`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL, FK → `platform.tenants(id)`, UNIQUE |
| branding | JSONB | `{ primary_color, logo_url, font }` |
| layout | JSONB | Array of modules: `[{ type, data }]` |
| seo | JSONB | NOT NULL DEFAULT `'{"title": null, "description": null}'::jsonb` — `{ title, description }`, both nullable; tenant-configured SEO overrides |
| is_published | BOOLEAN | NOT NULL DEFAULT false |
| updated_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| **INDEX** | (tenant_id) | |

---

## Schema: `customer`

Owned by: **Customer Context** (`src/contexts/customer/`)

### `customer.customers`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL, FK → `platform.tenants(id)` |
| google_oauth_id | VARCHAR(255) | NOT NULL |
| email | VARCHAR(255) | NOT NULL |
| name | VARCHAR(255) | NOT NULL |
| phone | VARCHAR(20) | NULLABLE |
| default_address | JSONB | NULLABLE — `{ street, number, complement, neighborhood, city, state, zipCode }`. Used only to pre-fill booking form. The booking stores its own copy. |
| created_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| updated_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| **INDEX** | (tenant_id, google_oauth_id) | Fast OAuth lookup |

> No UNIQUE on `google_oauth_id` alone — same person can be a customer in multiple tenants as separate rows.

---

## Schema: `staff`

Owned by: **Staff Context** (`src/contexts/staff/`)

### `staff.staff`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL, FK → `platform.tenants(id)` |
| google_oauth_id | VARCHAR(255) | NULLABLE — set on first login (UC-025) |
| email | VARCHAR(255) | NOT NULL |
| first_name | VARCHAR(100) | NOT NULL |
| last_name | VARCHAR(100) | NOT NULL |
| role | VARCHAR(50) | NOT NULL — 'MANAGER', 'STAFF' |
| is_active | BOOLEAN | NOT NULL DEFAULT false — activated on first login |
| created_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| updated_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| **UNIQUE** | (tenant_id, google_oauth_id) | Staff belongs to exactly one tenant |
| **UNIQUE** | (tenant_id, email) | Required for invite flow (UC-025, UC-028) |

---

## Schema: `booking`

Owned by: **Booking Context** (`src/contexts/booking/`)

### `booking.services`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL, FK → `platform.tenants(id)` |
| name | VARCHAR(255) | NOT NULL |
| description | TEXT | |
| price | DECIMAL(12,2) | NOT NULL |
| duration_mins | INT | NOT NULL |
| points_value | INT | NOT NULL DEFAULT 1 |
| requires_pickup_address | BOOLEAN | NOT NULL DEFAULT false |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| updated_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| **INDEX** | (tenant_id, is_active) | Fast active service list |

### `booking.bookings`
A booking is the parent of one or more `booking_lines`. All service-level details live on the lines.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| status | VARCHAR(30) | NOT NULL DEFAULT 'PENDING' — PENDING, INFO_REQUESTED, APPROVED, REJECTED, COMPLETED, CANCELLED |
| type | VARCHAR(20) | NOT NULL CHECK IN ('GUEST','CUSTOMER') |
| customer_id | UUID | NULLABLE — no FK (cross-context ref to `customer.customers`) |
| contact_email | VARCHAR(255) | NOT NULL |
| contact_name | VARCHAR(255) | NOT NULL |
| contact_phone | VARCHAR(30) | NOT NULL |
| contact_address | JSONB | NULLABLE — `{ street, number, complement?, neighborhood, city, state, zipCode }` — optional general address |
| pickup_address | JSONB | NULLABLE — same shape as `contact_address` — non-null when any line has `requires_pickup_address_at_booking = true` |
| scheduled_at | TIMESTAMPTZ | NOT NULL |
| total_duration_mins | INTEGER | NOT NULL — denormalised SUM of `booking_lines.duration_mins_at_booking` |
| total_price_amount | NUMERIC(10,2) | NOT NULL — denormalised SUM of `booking_lines.price_at_booking_amount` |
| total_actual_price_amount | NUMERIC(10,2) | NULLABLE — null until COMPLETED; SUM of `booking_lines.actual_price_charged_amount` |
| discount_points_used | INTEGER | NULLABLE — loyalty points redeemed as a discount on this booking's completion (UC-009 A6); null = no discount applied |
| discount_amount | NUMERIC(10,2) | NULLABLE — currency amount deducted from `total_actual_price_amount` via `discount_points_used`; null = no discount applied |
| before_service_photo_urls | TEXT[] | NOT NULL DEFAULT '{}' — before-service photos |
| after_service_photo_urls | TEXT[] | NOT NULL DEFAULT '{}' — after-service photos (UC-009) |
| admin_notes | TEXT | NULLABLE |
| info_request_message | TEXT | NULLABLE — admin's prompt to customer (UC-005) |
| info_requested_at | TIMESTAMPTZ | NULLABLE |
| info_requested_by | UUID | NULLABLE — no FK (cross-context ref to `staff.staff`) |
| info_response_message | TEXT | NULLABLE — customer's reply notes (UC-005) |
| info_submitted_at | TIMESTAMPTZ | NULLABLE |
| info_submitted_by | UUID | NULLABLE — customerId who submitted the response; null for guests (cross-context ref) |
| approved_at | TIMESTAMPTZ | NULLABLE |
| approved_by | UUID | NULLABLE — no FK (cross-context ref to `staff.staff`) |
| completed_at | TIMESTAMPTZ | NULLABLE |
| completed_by | UUID | NULLABLE — no FK (cross-context ref to `staff.staff`) |
| cancelled_at | TIMESTAMPTZ | NULLABLE |
| cancelled_by | UUID | NULLABLE — no FK (staff or customer UUID) |
| cancellation_reason | TEXT | NULLABLE |
| rejected_at | TIMESTAMPTZ | NULLABLE |
| rejected_by | UUID | NULLABLE — no FK (cross-context ref to `staff.staff`) |
| rejection_reason | TEXT | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| **UNIQUE** | (tenant_id, id) | Composite FK target for `booking_lines` |
| **CHECK** | `CHK_booking_bookings_discount_consistency` | `discount_points_used`/`discount_amount` must be both `NULL` or both `> 0` |
| **INDEX** | (tenant_id) | Tenant-scoped base filter |
| **INDEX** | (tenant_id, status) | Main dashboard query |
| **INDEX** | (tenant_id, customer_id) | Customer booking history |
| **INDEX** | (tenant_id, scheduled_at) | Calendar availability |

**Rules:**
- `≥ 1 booking_line` required. Application-enforced by `Booking.requestBooking()`.
- `total_price_amount`, `total_duration_mins`, `total_actual_price_amount` are denormalised for fast list queries.
- `pickup_address` must be non-null if any `booking_lines.requires_pickup_address_at_booking = true`. Enforced by the aggregate.
- `discount_points_used`/`discount_amount` are set once at completion (UC-009 A6) when a loyalty discount was applied; both remain `NULL` otherwise.

### `booking.booking_lines`
One row per service unit. Snapshots from `booking.services` at request time — intra-context FKs apply.

| Column | Type | Constraints |
|--------|------|-------------|
| line_id | UUID | PRIMARY KEY |
| booking_id | UUID | NOT NULL |
| tenant_id | UUID | NOT NULL — denormalised for composite FK / tenant isolation |
| service_id | UUID | NOT NULL — intra-context ref to `booking.services` |
| service_name_at_booking | VARCHAR(255) | NOT NULL — snapshot of `services.name` at booking time |
| price_at_booking_amount | NUMERIC(10,2) | NOT NULL CHECK >= 0 — snapshot of `services.price_amount` |
| duration_mins_at_booking | INTEGER | NOT NULL CHECK > 0 — snapshot of `services.duration_minutes` |
| points_value_at_booking | INTEGER | NOT NULL DEFAULT 0 CHECK >= 0 — snapshot of `services.loyalty_points_value` |
| requires_pickup_address_at_booking | BOOLEAN | NOT NULL DEFAULT false — snapshot of `services.requires_pickup_address` |
| actual_price_charged_amount | NUMERIC(10,2) | NULLABLE CHECK >= 0 — null until COMPLETED; zero = waived |
| **FK (composite)** | (tenant_id, booking_id) → `booking.bookings(tenant_id, id)` | Tenant-safe |
| **FK (composite)** | (tenant_id, service_id) → `booking.services(tenant_id, id)` | Intra-context |
| **INDEX** | (tenant_id) | Tenant-scoped base filter |
| **INDEX** | (tenant_id, booking_id) | Load all lines for a booking |
| **INDEX** | (tenant_id, service_id) | All bookings for service X |

**Rules:**
- Lines are INSERT-only once booking is APPROVED. Application-enforced.
- All snapshot fields (`service_name_at_booking`, `price_at_booking_amount`, `duration_mins_at_booking`, `points_value_at_booking`, `requires_pickup_address_at_booking`) are immutable after insert.
- `actual_price_charged_amount` defaults to `price_at_booking_amount` if staff does not override at completion.

### `booking.schedule_closures`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| date | DATE | NOT NULL — calendar date (YYYY-MM-DD) in tenant timezone |
| start_time | TIME | NULLABLE — null = full-day closure |
| end_time | TIME | NULLABLE — null = full-day closure |
| reason | VARCHAR(50) | NOT NULL — CHECK IN ('STAFF_DAY_OFF', 'MAINTENANCE', 'HOLIDAY') |
| notes | TEXT | NULLABLE |
| created_by | UUID | NOT NULL — staffId who created this closure |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| **INDEX** | (tenant_id) | Tenant-scoped queries |
| **INDEX** | (tenant_id, date) | Date lookup for availability |

**Rules:**
- `start_time` and `end_time` are either both null (full-day) or both set (partial window)
- When both set: `end_time > start_time`
- No overlapping `(tenant_id, date)` windows — enforced by the use case (not a DB unique constraint, since arbitrary time-range overlap cannot be expressed as a simple unique index)

---

### `booking.schedule_openings`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| date | DATE | NOT NULL — calendar date in tenant timezone |
| start_time | TIME | NOT NULL — opening window start (HH:MM) |
| end_time | TIME | NOT NULL — opening window end (HH:MM) |
| notes | TEXT | NULLABLE |
| created_by | UUID | NOT NULL — staffId |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| **INDEX** | (tenant_id) | Tenant-scoped queries |
| **UNIQUE** | (tenant_id, date) | Only one opening override per date per tenant |

**Rules:**
- `end_time > start_time`
- The day-of-week for `date` must be `null` in `businessHours` (enforced by use case, not DB)
- A `ScheduleOpening` takes priority over `ScheduleClosure` and `businessHours` in the availability algorithm

---

## Schema: `loyalty`

Owned by: **Loyalty Context** (`src/contexts/loyalty/`)

### `loyalty.loyalty_entries`
One immutable row per `BookingLine` completed for an authenticated customer. Append-only; expiration is query-time only.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL, FK → `platform.tenants(id)` |
| customer_id | UUID | NOT NULL — no FK (cross-context ref to `customer.customers`) |
| booking_id | UUID | NOT NULL — no FK (cross-context ref to `booking.bookings`) |
| booking_line_id | UUID | NOT NULL — no FK (cross-context ref to `booking.booking_lines`) |
| service_id | UUID | NOT NULL — no FK (cross-context ref to `booking.services`; denormalised for per-service queries) |
| points | INT | NOT NULL, CHECK > 0 — = `booking_lines.points_value_at_booking` at completion |
| earned_at | TIMESTAMP WITH TIME ZONE | NOT NULL, DEFAULT now() |
| expires_at | TIMESTAMP WITH TIME ZONE | NOT NULL — `earned_at + tenants.settings.loyalty.expiryDays` |
| **UNIQUE** | (tenant_id, booking_line_id) | Idempotency — replaying `BookingCompleted` is a no-op |
| **INDEX** | (tenant_id, customer_id, expires_at) | Active balance query |
| **INDEX** | (tenant_id, customer_id, service_id, expires_at) | Per-service breakdown |

**Rules:**
- INSERT only. No UPDATE, no DELETE.
- `loyalty_balances.current_points` is the authoritative active balance — read from there, not from a SUM over entries.

---

### `loyalty.loyalty_balances`
One row per `(tenant_id, customer_id)`. Maintained as a running total: incremented on earn, decremented on redemption and daily expiry cron. O(1) reads.

| Column | Type | Constraints |
|--------|------|-------------|
| tenant_id | UUID | NOT NULL, FK → `platform.tenants(id)` |
| customer_id | UUID | NOT NULL |
| current_points | INT | NOT NULL DEFAULT 0, CHECK >= 0 |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL DEFAULT now() |
| **PRIMARY KEY** | (tenant_id, customer_id) | One balance row per customer per tenant |

**Rules:**
- Upserted on every `LoyaltyEntry` insert: `INSERT … ON CONFLICT (tenant_id, customer_id) DO UPDATE SET current_points = current_points + excluded.current_points`.
- Decremented atomically in `RedeemPointsUseCase` after inserting the redemption row.
- Decremented by the daily expiry cron after computing points from entries that just expired.
- `current_points` can never go below 0 (CHECK constraint + application guard).

---

### `loyalty.loyalty_redemptions`
Append-only audit log of every redemption. Never updated or deleted.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL, FK → `platform.tenants(id)` |
| customer_id | UUID | NOT NULL |
| points_redeemed | INT | NOT NULL, CHECK > 0 |
| redeemed_by | UUID | NOT NULL — staffId who recorded the redemption |
| notes | TEXT | NULLABLE — optional admin note |
| booking_id | UUID | NULLABLE — booking the redemption was applied to |
| redeemed_at | TIMESTAMP WITH TIME ZONE | NOT NULL DEFAULT now() |
| **INDEX** | (tenant_id, customer_id) | History per customer |

**Rules:**
- INSERT only.
- Written in the same transaction as the `loyalty_balances` decrement.

---

### `loyalty.balance_expiry_log`
Idempotency guard for the daily expiry cron. One row per `loyalty_entry` whose expiry has been applied to the balance. Prevents double-decrement if the cron runs twice.

| Column | Type | Constraints |
|--------|------|-------------|
| entry_id | UUID | PRIMARY KEY — FK → `loyalty.loyalty_entries(id)` |
| processed_at | TIMESTAMP WITH TIME ZONE | NOT NULL DEFAULT now() |

**Usage pattern (cron):**
```sql
-- Find expired entries not yet processed
SELECT le.* FROM loyalty.loyalty_entries le
WHERE le.expires_at < now()
  AND NOT EXISTS (
    SELECT 1 FROM loyalty.balance_expiry_log bel WHERE bel.entry_id = le.id
  );

-- After decrementing balance, mark entries as processed
INSERT INTO loyalty.balance_expiry_log (entry_id)
VALUES ($1), ($2), ...
ON CONFLICT DO NOTHING;
```

Partial-failure safe: if the cron crashes after processing 5 of 10 entries, the next run only reprocesses the remaining 5.

---

## Schema: `notification`

Owned by: **Notification Context** (`src/contexts/notification/`)

### `notification.notification_templates`

Each row is a rendered template for one `(trigger_event, channel)` pair. Rows with `tenant_id IS NULL` are **global defaults** seeded by migration. When a new tenant is provisioned, a `TenantProvisioned` handler copies all global-default rows into tenant-specific rows (`tenant_id = newTenantId`), allowing per-tenant customisation later.

`trigger_event` stores the `NotificationTemplateKey` enum value (kebab-case, e.g. `'booking-approved-customer'`), not the domain event name. Multi-variant events (e.g. `BookingRequested`) use distinct keys: `'booking-requested-admin'` and `'booking-requested-customer'`.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NULLABLE — NULL = global default; FK → `platform.tenants(id)` when set |
| trigger_event | VARCHAR(100) | NOT NULL — `NotificationTemplateKey` enum value, e.g. `'booking-approved-customer'` |
| channel | VARCHAR(20) | NOT NULL DEFAULT `'EMAIL'` — `'EMAIL'` now; `'SMS'`/`'WHATSAPP'` when those channels are built |
| subject | VARCHAR(255) | NOT NULL — pt-BR |
| body | TEXT | NOT NULL — pt-BR; plain text for SMS, HTML for EMAIL |
| created_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| updated_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| **UNIQUE INDEX** | `(trigger_event, channel) WHERE tenant_id IS NULL` | One global default per key+channel |
| **UNIQUE INDEX** | `(tenant_id, trigger_event, channel) WHERE tenant_id IS NOT NULL` | One tenant template per key+channel |
| **INDEX** | `(tenant_id)` | Fast lookup of all templates for a tenant |

### `notification.notification_logs`

Audit trail of every notification send attempt. Pure audit — idempotency is handled by `notification.processed_events`, not here.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL, FK → `platform.tenants(id)` |
| event_id | UUID | NOT NULL — source domain event's `eventId` |
| notification_type | VARCHAR(100) | NOT NULL — `NotificationTemplateKey` value |
| channel | VARCHAR(32) | NOT NULL — `'EMAIL'` \| `'SMS'` \| `'WHATSAPP'` |
| recipient_email | VARCHAR(255) | NOT NULL |
| status | VARCHAR(20) | NOT NULL DEFAULT `'PENDING'` — `'PENDING'`, `'SENT'`, `'FAILED'` |
| retry_count | SMALLINT | NOT NULL DEFAULT 0 |
| error_message | TEXT | NULLABLE |
| sent_at | TIMESTAMP WITH TIME ZONE | NULLABLE |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL DEFAULT now() |
| **INDEX** | (tenant_id) | Tenant-scoped queries |
| **INDEX** | (tenant_id, status) | Retry queue / monitoring queries |
| **INDEX** | (tenant_id, recipient_email) | All notifications sent to a recipient |

### `notification.processed_events`

Idempotency table for Notification event consumers. Checked before processing any Pub/Sub message. The composite PK `(event_id, notification_type, channel)` allows the same domain event to produce multiple independent notifications (e.g. admin email + customer email, or EMAIL + SMS) without blocking each other.

| Column | Type | Constraints |
|--------|------|-------------|
| event_id | UUID | NOT NULL — from the event envelope `eventId` field |
| notification_type | VARCHAR(100) | NOT NULL — `NotificationTemplateKey` value |
| channel | VARCHAR(32) | NOT NULL — `'EMAIL'` \| `'SMS'` \| `'WHATSAPP'` |
| processed_at | TIMESTAMP WITH TIME ZONE | NOT NULL DEFAULT now() |
| **PRIMARY KEY** | (event_id, notification_type, channel) | One row per event × template × channel |

**Usage pattern (via `IProcessedEventRepository`):**
```typescript
// In BaseNotificationUseCase.isAlreadySent():
return this.processedEventRepo.isDuplicate(eventId, notificationType, channel);

// After successful dispatch:
await this.processedEventRepo.markProcessed(eventId, notificationType, channel);
// INSERT INTO notification.processed_events ... ON CONFLICT DO NOTHING
```

**Retention:** Rows older than 30 days can be safely deleted (Pub/Sub does not re-deliver messages older than 7 days by default).

---

## Schema: `loyalty` (addition)

### `loyalty.processed_events`

Same idempotency pattern for the Loyalty event consumer. The `UNIQUE(tenant_id, booking_line_id)` on `loyalty_entries` already guarantees idempotency for `BookingCompleted` inserts, but this table provides a uniform deduplication layer consistent with other consumers and guards against any future event types Loyalty may subscribe to.

| Column | Type | Constraints |
|--------|------|-------------|
| event_id | UUID | NOT NULL |
| consumer_name | VARCHAR(100) | NOT NULL — `'loyalty'` |
| processed_at | TIMESTAMP WITH TIME ZONE | NOT NULL DEFAULT now() |
| **PRIMARY KEY** | (event_id, consumer_name) | |
| **UNIQUE** | (event_id, consumer_name) | |

**Retention:** Same as `notification.processed_events` — prune rows older than 30 days weekly.

---

## Event Publishing — MVP Approach

> **Context:** `docs/03-DOMAIN_EVENTS.md` states that event publication must be transactional with the state change that produced it. A full transactional outbox (separate table + polling relay) is the enterprise-grade solution. For MVP, Ikaro uses the simpler approach below with a clear understanding of its trade-off.

### MVP pattern: synchronous publish after commit

```typescript
// Inside a use case (simplified)
await this.bookingRepo.save(booking);          // 1. Commit state to DB
await this.eventBus.publish(bookingApproved); // 2. Publish to Pub/Sub
```

**Trade-off:** If the process crashes between step 1 and step 2, the state is saved but the event is never published. Downstream consumers (Notification, Loyalty) will not be triggered for that specific booking action.

**Why this is acceptable for MVP:**
- GCP Pub/Sub has 99.95% uptime — the window for a crash between save and publish is tiny.
- The failure mode is silent (no email sent, no loyalty entry created) rather than data corruption.
- Staff can manually recover by re-triggering the action from the dashboard (e.g., re-marking a booking complete).
- Volume at MVP scale makes manual recovery trivial.

**Upgrade path (post-MVP):** When silent failures become unacceptable, add a `booking.domain_event_outbox` table. The use case writes to the outbox in the same DB transaction as the aggregate save. A separate relay process polls the outbox and publishes to Pub/Sub, then marks rows as published. This guarantees at-least-once delivery with zero message loss. No domain or application layer changes are needed — only the infrastructure adapter changes.

---

## Indexing Strategy

Every index **MUST** start with `tenant_id` to ensure query plans use tenant isolation first:

```sql
-- Booking context
CREATE INDEX idx_bookings_tenant_status    ON booking.bookings (tenant_id, status);
CREATE INDEX idx_bookings_tenant_scheduled ON booking.bookings (tenant_id, scheduled_at);
CREATE INDEX idx_bookings_tenant_customer  ON booking.bookings (tenant_id, customer_id);

-- Loyalty context
CREATE INDEX idx_loyalty_tenant_customer_expires   ON loyalty.loyalty_entries (tenant_id, customer_id, expires_at);
CREATE INDEX idx_loyalty_tenant_customer_service   ON loyalty.loyalty_entries (tenant_id, customer_id, service_id, expires_at);

-- Customer context
CREATE INDEX idx_customers_tenant_google ON customer.customers (tenant_id, google_oauth_id);

-- Staff context
CREATE INDEX idx_staff_tenant_google ON staff.staff (tenant_id, google_oauth_id);
```

---

## Migrations

- Migrations are per-context and live in `apps/backend/src/contexts/<context>/infrastructure/migrations/`
- Run as a **separate CI job** (Stage 4.5) before application deployment — never at app startup (`synchronize: false`)
- Every migration must follow the **Expand/Contract** pattern for rolling-deploy safety
- Must provide a `down()` method for emergency rollback

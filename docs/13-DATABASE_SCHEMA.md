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
| branding | JSONB | `HotsiteBranding` shape — ~17 fields (colors, fonts, logo, borderRadius, buttonStyle, spacing, shadowStyle, brand identity); see `docs/02-DOMAIN_MODEL.md`'s `HotsiteConfig` aggregate for the full field list, not just `primary_color`/`logo_url`/`font` |
| layout | JSONB | Array of modules: `[{ type, data }]` |
| seo | JSONB | NOT NULL DEFAULT `'{"title": null, "description": null}'::jsonb` — `{ title, description }`, both nullable; tenant-configured SEO overrides |
| is_published | BOOLEAN | NOT NULL DEFAULT false |
| updated_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| version | INTEGER | NOT NULL DEFAULT 1 — optimistic-locking column |
| **INDEX** | (tenant_id) | |

### `platform.chatbot_sessions`

One chat widget conversation. Cap enforcement (`docs/discovery/CHATBOT/CHATBOT.md` §8) `COUNT`s rows here directly — no separate counter table.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL, FK → `platform.tenants(id)` |
| client_ip | VARCHAR(45) | NOT NULL — abuse/cost-control signal (IPv4/IPv6), distinct from `id`'s job of conversation continuity |
| started_at | TIMESTAMP WITH TIME ZONE | NOT NULL DEFAULT now() |
| last_message_at | TIMESTAMP WITH TIME ZONE | NOT NULL DEFAULT now() |
| conversation_date | DATE | NOT NULL — tenant-timezone date bucket, used by the per-day caps |
| message_count | SMALLINT | NOT NULL DEFAULT 0 |
| status | VARCHAR(10) | NOT NULL DEFAULT `'ACTIVE'` — `'ACTIVE'`, `'CLOSED'`, `'CAPPED'` |
| **UNIQUE** | (tenant_id, id) | Composite FK target for `chatbot_messages` |
| **INDEX** | (tenant_id, conversation_date) | Layer 1 cap: daily conversations per tenant |
| **INDEX** | (tenant_id, client_ip, conversation_date) | Layer 2 cap: daily conversations per tenant+IP |
| **INDEX** | (tenant_id, status, last_message_at) | Layer 3 cap: concurrent conversations (live-ness proxy) |
| **INDEX** | (started_at, last_message_at) | UC-035 retention purge (M19-S07): supports `ChatbotRetentionPurgeJob`'s daily, cross-tenant `WHERE started_at < :cutoff AND last_message_at < :cutoff` scan — without it, that query full-table-scans as the table grows, same rationale as `chatbot_messages`'s own `(created_at)` index below |

### `platform.chatbot_messages`

The actual chat log — visitor questions and bot answers, both sides, not just metadata. Needed because the LLM is stateless between calls (history must be resent) and as the per-message cost audit trail.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| session_id | UUID | NOT NULL |
| tenant_id | UUID | NOT NULL, FK → `platform.tenants(id)` |
| role | VARCHAR(9) | NOT NULL — `'USER'` \| `'ASSISTANT'` |
| content | TEXT | NOT NULL |
| input_tokens | INTEGER | NOT NULL DEFAULT 0 |
| output_tokens | INTEGER | NOT NULL DEFAULT 0 |
| model_id | VARCHAR(100) | NOT NULL — recorded per-message since a tenant can override its LLM provider/model |
| cost_usd | NUMERIC(12,8) | NOT NULL DEFAULT 0, `CHECK (cost_usd >= 0)` — added by a follow-up migration (`1748400000011`, after `1748400000010` had already shipped to staging). Computed and stored once, at send-time, by the adapter that produced the message: OpenRouter's adapter reads its provider-confirmed `usage.cost`; Anthropic's and OpenAI's adapters compute it from `input_tokens`/`output_tokens` against their own private pricing constant, since neither provider returns cost in its response. Stored directly rather than reconstructed later from tokens, so a mid-day pricing-constant change never retroactively re-prices messages already sent under the old rate. Scale 8 (not `chatbot_provider_balance.remaining_usd`'s 4) — a single message routinely costs a small fraction of a cent |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL DEFAULT now() |
| **FK (composite)** | (tenant_id, session_id) → `platform.chatbot_sessions(tenant_id, id)` | Tenant-safe — a message can never reference another tenant's session |
| **INDEX** | (tenant_id, session_id) | History reassembly for a given session |
| **INDEX** | (created_at) | Required for the platform-wide daily spend circuit breaker's `WHERE created_at >= CURRENT_DATE` aggregate — without it, that query full-table-scans on every session-start request, platform-wide, as the table grows |

### `platform.chatbot_provider_balance`

Single-row-per-provider, platform-wide, not tenant-scoped. Two independent write paths update different columns on the same row — never a full-row replace from either side (see "Write discipline" below):
- `remaining_usd`/`checked_at`: upserted by S08's periodic poll (UC-036) against the provider's own account API (OpenRouter's `GET /api/v1/credits`).
- `last_success_at`/`last_failure_at`: upserted by `SendChatMessageUseCase` (S05/S06) at send-time, reflecting whether the most recent real LLM call for that provider succeeded or failed — the passive signal UC-034's provider-health condition (c) reads.

| Column | Type | Constraints |
|--------|------|-------------|
| provider | VARCHAR(32) | PRIMARY KEY — e.g. `'openrouter'` |
| remaining_usd | NUMERIC(10,4) | NULL — absent until S08's first successful poll for this provider; also genuinely absent for Anthropic/OpenAI, which have no prepaid-balance concept (`CHATBOT.md` §8.10) |
| checked_at | TIMESTAMP WITH TIME ZONE | NULL, no DEFAULT — set alongside `remaining_usd`. The original migration's `DEFAULT now()` is dropped along with `NOT NULL`, not just the latter — otherwise Postgres would silently substitute `now()` on an INSERT that deliberately omits this column (the health-only write path), producing a value that misleadingly implies a balance poll happened when it didn't |
| last_success_at | TIMESTAMP WITH TIME ZONE | NULL — most recent real `ILlmProvider.complete()` success for this provider, across any tenant |
| last_failure_at | TIMESTAMP WITH TIME ZONE | NULL — most recent real `ILlmProvider.complete()` failure for this provider, across any tenant. **Never set by a cap/volume rejection** (daily/IP/concurrency/message/length caps, global spend breaker, balance floor) — only by a genuine provider-call failure (timeout/upstream error/insufficient credits) |

**Write discipline (mandatory):** every writer must use a partial-column upsert (e.g. TypeORM `repository.upsert(entityLike, ['provider'])`, which generates `INSERT ... ON CONFLICT (provider) DO UPDATE SET <only the listed columns>`) — never `Repository.save()` on a fully-populated entity object, and never a raw full-row `UPDATE`. S08's balance write must only ever touch `remaining_usd`/`checked_at`; S05/S06's health write must only ever touch `last_success_at`/`last_failure_at`. Either writer touching the other's columns would silently clobber it — S08 polls every 15-30 minutes, so a naive full-row write from that path would wipe health data on every poll.

**Health-write ordering guard:** two concurrent `recordCallOutcome()` calls can reach Postgres out of chronological order (e.g. a slow FAILURE request's write landing after a newer SUCCESS write already committed). A plain `EXCLUDED`-based upsert would let the older write silently clobber the newer timestamp, corrupting the cooldown resolution below. `TypeOrmChatbotProviderBalanceRepository.recordCallOutcome()` guards each column independently via TypeORM's `orUpdate()` `overwriteCondition` (`... DO UPDATE SET last_success_at = EXCLUDED.last_success_at WHERE last_success_at IS NULL OR last_success_at < EXCLUDED.last_success_at`, and the equivalent for `last_failure_at`) — an incoming write only applies when the column has never been set or the incoming timestamp is strictly newer.

**Provider health resolution (UC-034 condition c):** the resolved provider is "failing a health check" only if `last_failure_at` is more recent than `last_success_at` **and** that failure happened within the last `CHATBOT_PROVIDER_HEALTH_COOLDOWN_MINUTES` (env var, default `5`) — a half-open/circuit-breaker cooldown, not a permanent trip. Without the cooldown, a single transient failure would take the widget dark forever: `available: false` means the widget never renders at all (UC-034 A1), so no visitor could ever attempt the message that would produce a new success to clear it. Once the cooldown elapses, the widget optimistically shows as available again, giving the next real visitor's attempt the chance to either confirm recovery (writes a fresh `last_success_at`) or restart the cooldown (writes a fresh `last_failure_at`). A cap/volume rejection (daily/IP/concurrency/message/length/spend/balance) must never be recorded here — only the actual `provider.complete()` call failing counts (see S05's `send-chat-message.use-case.ts` — the cap checks throw before that call is ever reached, so structurally can't land in its `catch` block).

### `platform.lead_form_configs`

One row per tenant — question catalog + audience gating for the `LEAD_FORM` hotsite module (`docs/04-USE_CASES.md` UC-037). Promoted from `docs/discovery/lead-form-module/lead-form-module.md`.

| Column | Type | Constraints |
|--------|------|-------------|
| tenant_id | UUID | PRIMARY KEY, FK → `platform.tenants(id)`, UNIQUE |
| audience_mode | VARCHAR(20) | NOT NULL DEFAULT `'GUEST_AND_CUSTOMER'` — `'GUEST_AND_CUSTOMER'` \| `'CUSTOMER_ONLY'` |
| questions | JSONB | NOT NULL DEFAULT `'[]'` — array, ≤20 entries, `{id, label, type, required, options?, order}` |
| updated_at | TIMESTAMP WITH TIME ZONE | NOT NULL DEFAULT now() |

**Why JSONB, not a child table:** the question catalog is always read and written as one atomic unit by exactly one actor (the manager editing the form) — never queried or joined per-question, same justification `hotsite_configs.layout` already uses. Bounds are small and fixed (20 questions × 10 options, worst case a few KB) — safe to fetch on every `/[slug]/lead-form` page load with no pagination concerns.

### `platform.lead_form_submissions`

One row per visitor submission (`docs/04-USE_CASES.md` UC-039/UC-040).

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY (uuidv7) |
| tenant_id | UUID | NOT NULL, FK → `platform.tenants(id)` |
| customer_id | UUID | NULLABLE — UUID-only cross-context reference to Customer, no FK (`docs/ANTI_PATTERNS.md`'s "cross-schema DB FK between contexts" row). Set whenever the submitter was authenticated, in either audience mode |
| name | VARCHAR | NOT NULL |
| email | VARCHAR | NOT NULL — validated via the existing `Email` VO |
| phone | VARCHAR | NOT NULL — validated via the existing `PhoneNumber` VO |
| answers | JSONB | NOT NULL — array of `{questionId, questionLabel, questionType, answerValue}` (full snapshot — see `docs/02-DOMAIN_MODEL.md` § `LeadFormSubmission` for why) |
| submitted_at | TIMESTAMP WITH TIME ZONE | NOT NULL DEFAULT now() |
| expires_at | TIMESTAMP WITH TIME ZONE | NOT NULL — computed once at insert from the tenant's `retentionMonths` at that moment, never recomputed live |
| ip_address | VARCHAR(45) | NOT NULL — abuse-investigation trail, also the rate-limit key (same `VARCHAR(45)` sizing as `chatbot_sessions.client_ip` — IPv4/IPv6) |
| **UNIQUE** | (tenant_id, id) | Composite FK target for `lead_form_answers` (M20-S12) — same discipline as `chatbot_messages` → `chatbot_sessions` and `booking_lines` → `bookings`. **Required, not optional**: Postgres rejects a composite FK whose referenced columns have no unique constraint/index — this must land in the same migration that first creates the table (S02), not be added later, so `lead_form_answers`'s FK (S12) has something to reference |
| **INDEX** | (tenant_id, submitted_at DESC) | Paginated Leads Submissions list (UC-041), the tenant-daily-cap `COUNT` query (mirrors `chatbot_sessions`'s `(tenant_id, conversation_date)` layer-1 cap index), and UC-041's `submittedFrom`/`submittedTo` date-range filter (M20-S12, `docs/14-API_CONTRACTS.md`) — a plain range scan on `submitted_at` already served by this same index, no new index needed |
| **INDEX** | (tenant_id, ip_address, submitted_at) | Per-IP-daily-cap `COUNT` query (mirrors `chatbot_sessions`'s `(tenant_id, client_ip, conversation_date)` layer-2 cap index) |
| **INDEX** | (tenant_id, expires_at) | Per-tenant `expires_at` range queries — not the retention purge itself (see standalone index below); this composite serves any future tenant-scoped expiry lookup |
| **INDEX** | (expires_at) | Standalone, added M20-S04 (Codex review finding, PR #422): `LeadFormRetentionPurgeJob`'s daily purge (UC-043) is an unscoped cross-tenant `WHERE expires_at < now()` — matching `ExpirePointsJob`/`ChatbotRetentionPurgeJob`'s own precedent, no per-tenant loop — so it cannot seek the composite index above (led by `tenant_id`, which this query never filters on). Mirrors `chatbot_messages.IDX_chatbot_messages_created_at` |

### `platform.lead_form_answers`

One row per **question** per submission (not one row per submission) — a denormalized search index derived from `lead_form_submissions.answers`, maintained by the same repository/transaction, never a domain aggregate of its own. Exists specifically to support UC-041's structured search (M20-S12/S13): filtering by *this specific question's* answer, and ANDing several such filters together ("estado civil = casado" AND "mora em São Paulo"), which a single flattened text blob cannot do correctly (it can't attribute a matched term to a specific question, so it can't AND two question-scoped conditions without false positives). The `lead_form_submissions.answers` JSONB column is unaffected and stays the sole source for the detail view (UC-041 main flow) — this table is write-once, read-only-for-search, never rendered directly.

**Retention purge ordering (M20-S04, extended by M20-S12):** this table has **no `ON DELETE CASCADE`** on its FK to `lead_form_submissions` — deliberately, matching the real, already-established precedent `chatbot_messages`/`chatbot_sessions` uses (`ChatbotRetentionPurgeJob` deletes the child table first, the parent second, in the same transaction; no cascade). `LeadFormRetentionPurgeJob` (UC-043) must do the same: delete every `lead_form_answers` row for the expiring submissions **before** deleting the `lead_form_submissions` rows themselves, in one transaction — otherwise the daily purge throws an FK-violation error on any submission that has at least one answered question, which in practice is nearly all of them.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY (uuidv7) |
| tenant_id | UUID | NOT NULL, FK → `platform.tenants(id)` |
| submission_id | UUID | NOT NULL — composite FK `(tenant_id, submission_id)` → `platform.lead_form_submissions(tenant_id, id)`, tenant-safe (blocks cross-tenant reference at the DB level, same discipline as `chatbot_messages` → `chatbot_sessions`). Requires `lead_form_submissions`'s own `UNIQUE (tenant_id, id)` above to exist first |
| question_id | UUID | NOT NULL — the question's `id` at submission time (informational; matching is by `question_label`, not this, since a question can be edited/removed after submission — see below) |
| question_label | TEXT | NOT NULL — snapshotted, not looked up live (same reasoning as the JSONB snapshot) |
| answer_value | TEXT | NOT NULL — one row per **selected option** for `MULTIPLE_CHOICE` (2 selected options → 2 rows, same `question_id`/`question_label`), one row for `TEXT`/`SINGLE_CHOICE`. Always a scalar string — the array-flattening happens once, at write time, so every row here is trivially `ILIKE`-able |
| **INDEX** | (tenant_id, submission_id, question_label) | The advanced filter's per-question `EXISTS` lookup — `question_label` matched by **exact equality** (the manager picks it from a dropdown, never types it — see `docs/14-API_CONTRACTS.md`), so a plain B-tree is the right and faster tool here, not trigram |
| **INDEX** | (tenant_id, question_label) | The `filter-options` endpoint's `SELECT DISTINCT question_label ... ORDER BY question_label` — the `(tenant_id, submission_id, question_label)` index above doesn't serve this well (`submission_id` sits between `tenant_id` and `question_label`, so it isn't sorted by label within one tenant); this dedicated index is |
| **INDEX (GIN)** | `answer_value gin_trgm_ops` | Partial/substring match on the answer text — both the basic free-text search box and every advanced filter's value side. Requires `CREATE EXTENSION IF NOT EXISTS pg_trgm` (this repo already has a precedent for extension-creating migrations: `btree_gist`, `apps/backend/src/contexts/booking/infrastructure/migrations/1748000000014-CreateBookingBookings.ts`). **Verified against the PostgreSQL docs (`pgtrgm.html`), not assumed:** a GIN index with `gin_trgm_ops` genuinely accelerates `LIKE`/`ILIKE` with a leading wildcard ("the search string need not be left-anchored," documented since PG 9.1) — a plain B-tree cannot do this at all, since a leading `%` has no fixed prefix to seek on. One real limitation from the same docs: "a pattern with no extractable trigrams will degenerate to a full scan" — a search term under 3 characters yields no trigrams, so the API/UI enforces a 3-character minimum before firing a search (see `docs/14-API_CONTRACTS.md`) |
| **INDEX (GIN)** | `question_label gin_trgm_ops` | Same mechanism, for the **basic** free-text search box only (which also matches partially against question labels, unlike the advanced filter's exact-match dropdown) |

**Basic search** (the single search box), always `tenant_id`-scoped on both sides of the query, never left implicit via the FK alone (per `CLAUDE.md` §2 invariant 2 — "every query filters `tenant_id`, no exceptions"):
`name ILIKE '%term%' OR email ILIKE '%term%' OR EXISTS (SELECT 1 FROM lead_form_answers a WHERE a.tenant_id = s.tenant_id AND a.submission_id = s.id AND (a.question_label ILIKE '%term%' OR a.answer_value ILIKE '%term%'))`.

**Advanced search** (structured, ANDed filters — e.g. "estado civil contém casado" AND "mora contém São Paulo"), same explicit `tenant_id` scoping: one `EXISTS (SELECT 1 FROM lead_form_answers a WHERE a.tenant_id = s.tenant_id AND a.submission_id = s.id AND a.question_label = :label AND a.answer_value ILIKE '%' || :value || '%')` per filter row, ANDed in the outer `WHERE`.

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
| name | VARCHAR(255) | NULLABLE — single field, not split first/last |
| role | VARCHAR(50) | NOT NULL — 'MANAGER', 'STAFF' |
| is_active | BOOLEAN | NOT NULL DEFAULT true — staff rows are provisioned active from creation; `google_oauth_id IS NULL` signals "pending invite", not `is_active` (`CLAUDE.md` §2 invariant 6) |
| created_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| updated_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| **UNIQUE** | (tenant_id, google_oauth_id) | Per-tenant unique — this is what *allows* the same person to have separate active rows at multiple tenants, not what prevents it (staff are multi-tenant, same shape as customers) |
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
| scheduled_end_at | TIMESTAMPTZ | NOT NULL — `scheduled_at + total_duration_mins`; the range endpoint the exclusion constraint below checks against |
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
| version | INTEGER | NOT NULL DEFAULT 1 — optimistic-locking column (`@VersionColumn`) |
| **UNIQUE** | (tenant_id, id) | Composite FK target for `booking_lines` |
| **CHECK** | `CHK_booking_bookings_discount_consistency` | `discount_points_used`/`discount_amount` must be both `NULL` or both `> 0` |
| **EXCLUDE** | `EX_booking_bookings_approved_slot` — `USING gist (tenant_id WITH =, tstzrange(scheduled_at, scheduled_end_at, '[)') WITH &&) WHERE (status = 'APPROVED')` | DB-level enforcement that no two `APPROVED` bookings for the same tenant overlap — the authoritative cross-row invariant; `version` alone cannot catch this (see `docs/ENGINEERING_RULES.md` § Transactions) |
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
| points_per_currency_unit | INTEGER | NOT NULL DEFAULT 0 — conversion rate snapshot at redemption time |
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
| locale | VARCHAR(10) | NOT NULL DEFAULT `'pt-BR'` — seeded from `packages/i18n/locales/<locale>/notifications.json`, one row per `trigger_event × locale` (TD02-S10) |
| subject | VARCHAR(255) | NOT NULL |
| body | TEXT | NOT NULL — plain text for SMS, HTML for EMAIL |
| created_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| updated_at | TIMESTAMP WITH TIME ZONE | DEFAULT now() |
| **UNIQUE INDEX** | `(trigger_event, channel, locale) WHERE tenant_id IS NULL` | One global default per key+channel+locale |
| **UNIQUE INDEX** | `(tenant_id, trigger_event, channel) WHERE tenant_id IS NOT NULL` | One tenant template per key+channel — note: **not** locale-scoped, unlike the global-default index above |
| **INDEX** | `(tenant_id)` | Fast lookup of all templates for a tenant |

### `notification.notification_logs`

Audit trail of every notification send attempt. Pure audit — idempotency is handled by `shared.inbox`, not here.

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

### `notification.processed_events` — never existed (TD24-S04, migration history squashed)

Replaced by `shared.inbox` (see **Schema: `shared`** below). Pre-production, so rather than creating this table and then copying-and-dropping it, the migration that would have created it (`CreateNotificationProcessedEvents`) was deleted outright — no environment has ever run it. The old composite key `(event_id, notification_type, channel)` is preserved as `shared.inbox`'s `consumer_name` column, composed as `` `${notificationType}:${channel}` ``.

---

## Schema: `loyalty` (addition)

### `loyalty.processed_events` — never existed (TD24-S04, migration history squashed)

Replaced by `shared.inbox` (see **Schema: `shared`** below). Pre-production, so rather than creating this table and then copying-and-dropping it, the `CREATE TABLE "loyalty"."processed_events"` block was removed from `CreateLoyaltyLoyaltyEntries` outright — no environment has ever run it. The `UNIQUE(tenant_id, booking_line_id)` on `loyalty_entries` already guarantees idempotency for `BookingCompleted` inserts; the shared inbox provides the uniform deduplication layer consistent with other consumers and guards against any future event types Loyalty may subscribe to.

---

## Schema: `shared`

Transport infrastructure for the transactional outbox/inbox pattern (TD24) — not a bounded context, and deliberately not tenant-scoped in its primary key (see `docs/06-TENANT_ISOLATION_STRATEGY.md` for the documented exemption rationale).

### `shared.outbox`

Durable staging table for every domain event/command published by an aggregate-driven write, guaranteeing at-least-once delivery to Pub/Sub even across a crash between commit and publish (TD24-S01/S02).

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY — the event's own `eventId` |
| dedup_key | VARCHAR(255) | NOT NULL, UNIQUE — the event's `eventId` for a `DomainEvent`, or the caller-supplied business key for a `Command` (e.g. a cron's per-tenant-batch key) |
| tenant_id | UUID | NOT NULL — carried for observability only, not a filter key (see tenant-isolation exemption) |
| event_name | VARCHAR(100) | NOT NULL |
| payload | JSONB | NOT NULL — the full serialized event/command envelope |
| created_at | TIMESTAMP WITH TIME ZONE | NOT NULL DEFAULT now() |
| published_at | TIMESTAMP WITH TIME ZONE | NULLABLE — set once the relay successfully publishes to Pub/Sub |
| lease_token | UUID | NULLABLE — opaque relay ownership token while a row is being published |
| lease_expires_at | TIMESTAMP WITH TIME ZONE | NULLABLE — expired leases are eligible for another relay to claim, preserving at-least-once delivery after a crash |
| **INDEX** | (created_at) WHERE published_at IS NULL | Sweep's unpublished-row scan |
| **INDEX** | (lease_expires_at) WHERE published_at IS NULL | Lease-expiry eligibility scan |
| **INDEX** | (published_at) WHERE published_at IS NOT NULL | Retention GC scan |

**Retention:** `OUTBOX_RETENTION_DAYS` (default 14) — batched trickle-delete of published rows on every relay sweep tick (`OutboxRelayService.gc()`).

**Relay lease:** `OUTBOX_CLAIM_LEASE_SECONDS` (default 120) bounds ownership after the relay claims rows in a short transaction. Pub/Sub publication happens outside that transaction; success is conditionally marked in another short transaction and failure releases the lease. A crash after publication may intentionally redeliver after expiry, so consumers remain idempotent.

**LGPD note:** `payload` persists the full event envelope — including customer names, emails, and phones for booking/customer events — in Postgres for the retention window above. This is not a new *class* of PII exposure (Pub/Sub already retains the same payload up to 7 days), but it is a new *store* and belongs in the data inventory.

### `shared.inbox`

Consumer-side dedup table (TD24-S04), replacing the per-context `loyalty.processed_events` and `notification.processed_events` tables with one shared shape. Two access patterns exist depending on whether the consumer's side effect is protected by its own DB constraint:

- **Check-then-mark** (loyalty, staff): `hasBeenProcessed` is checked before processing, outside any transaction; `markProcessed` is the one write required to happen inside the same transaction as the consumer's business effect. Safe here because each consumer's actual write is guarded by its own DB unique constraint (`UNIQUE(tenant_id, booking_line_id)` on `loyalty_entries`, `UNIQUE(tenant_id, email)` on `staff.staff`) — a race just costs a failed insert and a clean retry, never duplicate data.
- **Atomic claim** (notification): `tryClaim` — `INSERT ... ON CONFLICT (event_id, consumer_name) DO NOTHING RETURNING event_id` — is the gate itself, not just a check. Required here because notification's actual side effect (the email/SMS send) happens *before* any DB write, with no constraint to catch a duplicate send after the fact; two concurrent redeliveries racing a plain check-then-mark could both dispatch. `unclaim` (`DELETE`) reverses a claim whose send then failed, so a later redelivery can legitimately retry instead of being permanently skipped. For multi-recipient dispatch (`dispatchTemplatesToMany`), the claim is per-recipient, not per-batch (AUD-004 item 3) — each `(eventId, notificationType:channel:recipientEmail)` claims/retries independently, so a redelivery only re-sends to the recipient(s) whose dispatch actually failed, not the whole batch.

| Column | Type | Constraints |
|--------|------|-------------|
| event_id | UUID | NOT NULL — from the event envelope's `eventId` |
| consumer_name | VARCHAR(400) | NOT NULL — a stable per-consumer key; composed as `` `${notificationType}:${channel}` `` for notification's single-recipient dispatch, `` `${notificationType}:${channel}:${recipientEmail}` `` for notification's multi-recipient dispatch (AUD-004 item 3 — sized to fit an appended email), a fixed string for loyalty/staff |
| processed_at | TIMESTAMP WITH TIME ZONE | NOT NULL DEFAULT now() |
| **PRIMARY KEY** | (event_id, consumer_name) | One row per event × consumer |
| **INDEX** | (processed_at) | Retention GC scan |

**Usage pattern — check-then-mark (loyalty, staff):**
```typescript
// Before processing:
if (await this.inboxRepo.hasBeenProcessed(eventId, consumerName)) return;

// After the business effect, inside the same transaction:
await this.inboxRepo.markProcessed(eventId, consumerName);
```

**Usage pattern — atomic claim (notification):**
```typescript
// The claim is the gate — only one concurrent caller can ever get true for this pair.
if (!(await this.inboxRepo.tryClaim(eventId, consumerName))) return;
try {
  await this.dispatcher.dispatch(...); // the actual send — no DB constraint protects this
  await this.saveLog(...);             // audit record; also re-marks processed_at (harmless)
} catch (err) {
  await this.inboxRepo.unclaim(eventId, consumerName); // let a future redelivery retry
  throw err;
}
```

**Retention:** `INBOX_RETENTION_DAYS` (default 14, hard minimum 8 — must stay above Pub/Sub's 7-day max redelivery window or the dedup guarantee weakens) — batched trickle-delete on the same relay sweep tick as the outbox's own GC (`OutboxRelayService.gc()`).

---

## Event Publishing

> **Context:** `docs/03-DOMAIN_EVENTS.md` states that event publication must be transactional with the state change that produced it. TD24 (S01–S03) implemented the transactional-outbox solution below for both aggregate-driven and cron-published events; TD24-S04 (above) closed the equivalent gap on the consumer/dedup side.

### Publish-side: transactional outbox (TD24-S01/S02/S03)

```typescript
// Inside a repository's save() (simplified) — the aggregate's own repository, not the use case
await manager.save(BookingEntity, entity);              // 1. Write state, inside the transaction
await drainDomainEvents(booking, this.outboxPublisher); // 2. Insert outbox row, same transaction
// ... the transaction commits only after both writes above succeed — neither is durable until
// then. After commit: OutboxPublisher's after-commit callback relays the row via Pub/Sub —
// inline on the happy path, or the scheduled sweep (SKIP LOCKED) if that fails/crashes.
```

The 3 event-emitting aggregates (`Booking`, `Staff`, `Tenant`) get this transactionally-safe path automatically via their repositories — no use case writes a publish loop for them anymore. The 4 cron-published `Command` events (`BookingReminderDue`, `BookingReminderDueToday`, `AdminDailyScheduleReminder`, `PointsExpiringSoon`) publish through `OUTBOX_PUBLISHER` too, wrapped in a per-tenant-batch transaction (TD24-S03) — every publish site in the system now goes through the same durable path. A crash between the DB commit and the Pub/Sub publish no longer loses the event: the outbox row is durable, and the sweep delivers it on the next tick (worst case ~5 minutes later, `var.outbox_relay_schedule`).

### Consume-side: shared inbox (TD24-S04)

Every event/command consumer — the 16 domain-event handlers and `create-initial-manager.use-case.ts` (`TenantProvisioned` → staff) — checks `shared.inbox` before applying its effect and marks the row processed inside the same transaction as that effect, so Pub/Sub's at-least-once redelivery never produces more than one effect per consumer. See `shared.inbox` above for the table shape and `td/TD24-OUTBOX-INBOX-PATTERN.md` for the full design.

**Remaining evolution:** further evolution is operational (e.g. tightening the sweep interval, alerting on outbox/inbox lag — TD24-S05) rather than a new mechanism — see `td/TD24-OUTBOX-INBOX-PATTERN.md`.

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

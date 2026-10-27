# Discovery: Tenant Billing — Data Model

**Status:** Discovery — sketch at schema level (tables and columns, not DDL). Every table follows CLAUDE.md §2 unless an exemption is stated and justified. Physically a new schema `billing` (schema-per-context, `docs/DATABASE_SCHEMA.md`). PKs are `uuidv7`. Timestamps are `timestamptz` UTC.

**Companion docs:** `tenant-billing.md` · `tenant-billing_USECASES.md` · `tenant-billing_API.md`.

## 1. Purpose and critique summary

The schema serves five reads: (1) the **access check** on every request/send (by `tenant_id`, hot, cached), (2) the **billing page** (summary + paginated charges), (3) the **cross-tenant jobs** (charge issuing, status sweep, reconcile, purge) that cannot seek by `tenant_id`, (4) **webhook dedupe and tenant resolution**, (5) the **public price list**.

Database-expert findings applied:
- **Snapshot, one level:** items carry **no price**. When a charge is issued, the version selected by that charge's **service-period start** (`feature_price_versions.effective_from <= period_start`) is copied into `charge_lines.unit_price_minor`; an invoice may therefore be issued early while using its future period's price. A later list change never rewrites an issued charge (same idea as `BookingLine.priceAtBooking`). Prices referenced by an active item are never deleted; hiding a price only makes it unselectable for new choices.
- **One denormalization:** `charges.subtotal_minor` is the cached sum of its lines, and `amount_minor = subtotal_minor + tax_amount_minor`. They exist because the provider bills a single number that must equal what the tenant is shown, and the history list should not aggregate lines per row. `subtotal_minor` is written at insert; `amount_minor` is written once at insert (BR, tax-inclusive) or once when the provider finalizes the invoice (US, tax-exclusive), and never edited afterwards (a price change creates a new charge).
- **Aggregate boundary:** `charges` are not a child of `subscriptions` (one per period forever = unbounded). Paying a charge may reactivate the subscription: same-context, one transaction, row lock on the subscription (`findByIdForUpdate`); status is recomputable by the reconcile job.
- **Cross-tenant job indexes** (CLAUDE.md rule): a tenant-first composite index cannot be seeked without `tenant_id`, so each cron has its own standalone index.
- **Growth flags:** `provider_events` grows forever (retention purge), `charges` grows one per tenant per month (paginated by `(tenant_id, due_date DESC)`), `operator_audit` grows with operator actions (low).

## 2. Tables

### `billing.feature_prices` — platform-wide list prices (exempt from `tenant_id`)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `feature_key` | text NOT NULL | closed enum `FeatureKey` (CHECK mirrors it; `closed-enum-registry` detector) |
| `country_code` | char(2) NOT NULL | `BR`, `US` in v1 |
| `tier` | text NOT NULL DEFAULT `'STANDARD'` | `BASIC`/`PLUS` for `CHATBOT`; `STANDARD` elsewhere |
| `cycle` | text NOT NULL DEFAULT `'MONTHLY'` | only `MONTHLY` accepted in v1 (CHECK); column exists so annual can be added |
| `currency` | char(3) NOT NULL | BR→BRL, US→USD (validated by the VO) |
| `tax_behavior` | text NOT NULL | `INCLUSIVE` (BR) or `EXCLUSIVE` (US); a country catalog rule, never guessed at charge time |
| `selectable` | boolean NOT NULL DEFAULT true | false hides the catalog row from new selection; it never stops renewal for an existing item |
| `created_at`, `updated_at` | timestamptz | |

- `UNIQUE(feature_key, country_code, tier, cycle)`.
- **Tenant-id exemption:** global operator data with no tenant owner, same justification as `platform.chatbot_provider_balance`. To be listed in `DATABASE_SCHEMA.md` § exemptions on promotion.
- The **amount** lives in `feature_price_versions` (below), so a price change is a new dated row, never an in-place edit.
- Public read: `WHERE country_code = :c AND selectable`; renewal lookup deliberately does not require `selectable`.

### `billing.feature_price_versions` — dated amounts (exempt from `tenant_id`, same justification)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `feature_price_id` | uuid NOT NULL | FK → `feature_prices(id)` |
| `amount_minor` | bigint NOT NULL CHECK (>= 0) | centavos / cents |
| `effective_from` | date NOT NULL | the first **service period starting on or after this date** uses the amount; its early-issued invoice snapshots it |
| `announced_at` | timestamptz NULL | when the managers were notified (NULL for the seed versions) |
| `created_by` | text NOT NULL | operator id |
| `reason` | text NOT NULL | |
| `superseded_at` | timestamptz NULL | set when a newer pending version replaces this not-yet-effective one; the row is kept as history |
| `created_at` | timestamptz NOT NULL | |

- `UNIQUE(feature_price_id, effective_from) WHERE superseded_at IS NULL`; read the amount in force with `ORDER BY effective_from DESC` where `effective_from <= :periodStart AND superseded_at IS NULL` (index on `(feature_price_id, effective_from DESC) WHERE superseded_at IS NULL`).
- A not-yet-effective version can be **superseded** by a new version for the same price (the old row is marked `superseded_at`, never deleted or edited, and managers are notified again). Versions already in effect are immutable history. **Price-list changes are audited here** (`created_by`, `reason`, `created_at`, `superseded_at`) — they have no tenant, so they are not in `operator_audit`.
- Growth: one row per price change, negligible.

### `billing.billing_accounts` — one per tenant

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | `UNIQUE(tenant_id)`; also `UNIQUE(tenant_id, id)` for composite FKs |
| `tax_id_type` | text NULL | `CNPJ` \| `CPF` \| `OTHER`. **BR: NOT NULL from signup** (`tax_id` required, check digits validated — Asaas needs `cpfCnpj`; enforced by the aggregate and the signup endpoint, columns stay nullable for US and exempt tenants) |
| `tax_id` | text NULL | digits only for BR (check digits via VO); free text for `OTHER`. Which types a country accepts comes from a new `taxId` entry in `CountrySpec` (BR: CNPJ or CPF; US: none, optional free text) |
| `legal_name` | text NULL | |
| `billing_email` | text NULL | falls back to the managers' emails |
| `address` | jsonb NULL | shaped exactly like the shared `Address` value object (`street`, `number`, `complement?`, `neighborhood?`, `city`, `state`, `zipCode`), validated with the **billing country's `AddressSpec`** from `packages/i18n/src/country-defaults.ts` (labels, postal regex, state pattern, neighbourhood on/off). The country is `subscriptions.country_code`, not repeated inside the JSON. A single bounded object, never an array |
| `provider` | text NULL | `ASAAS` \| `STRIPE` |
| `provider_customer_id` | text NULL | |
| `auto_billing` | text NOT NULL DEFAULT `'NONE'` | `NONE` \| `PIX_AUTOMATICO` (card auto-billing is not offered, decision 58); mirrored from the provider (no card data) |
| `auto_billing_status` | text NOT NULL DEFAULT `'INACTIVE'` | `INACTIVE` \| `PENDING_AUTHORIZATION` \| `ACTIVE`; drives prototype states 07/07b/07c (deferred release slice) |
| `auto_billing_label` | text NULL | display label supplied by the provider, e.g. `Pix Automático ativo`; never a PAN |
| `terms_version` | text NULL | version the user accepted at signup |
| `terms_accepted_at` | timestamptz NULL | |
| `terms_accepted_by` | text NULL | Google email of the signing user |
| `created_at`, `updated_at` | timestamptz | |

- Index: `UNIQUE(provider, provider_customer_id) WHERE provider_customer_id IS NOT NULL` — **standalone** (the webhook resolves the tenant from the provider customer id before any tenant context exists).
- Why a separate aggregate from `subscriptions`: edited by a different actor (manager) for different reasons; a shared row would create needless write conflicts.
- Tax identity is financial data: never in `tenants.settings` (the manager-editable settings path).

### `billing.subscriptions` — one per tenant

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | `UNIQUE(tenant_id)`; `UNIQUE(tenant_id, id)` |
| `status` | text NOT NULL | `TRIALING` \| `ACTIVE` \| `PAST_DUE` \| `SUSPENDED` |
| `suspension_reason` | text NULL | `NON_PAYMENT` \| `CANCELED` \| `PAYMENT_REVERSED`; CHECK: NOT NULL iff `status = 'SUSPENDED'` |
| `country_code` | char(2) NOT NULL | fixed at start |
| `currency` | char(3) NOT NULL | fixed at start |
| `timezone` | text NOT NULL | IANA zone copied from `TenantProvisioned` at creation, **immutable**. Every "tenant-local" value in this schema (`next_due_date`, charge `due_date`/periods, local-midnight period boundaries, the overdue sweep) uses it; Billing never reads Platform settings |
| `merchant_profile_key` | text NOT NULL | immutable operational key for the selling legal entity/provider-account configuration, e.g. `BRL_ASAAS_IKARO_BR` or `USD_STRIPE_IKARO_BR` in production (the Stripe account is the Brazilian CNPJ's, decision 60) and **`BRL_FAKE`, `USD_FAKE`, `BRL_ASAAS_SANDBOX`, `USD_STRIPE_TEST` outside it**. The environment configuration decides which key new subscriptions receive (main doc §5.3); there is no per-tenant override, and a fake/sandbox key is rejected when `APP_ENV=production`. No KYC/legal-entity fields are duplicated in Ikaro |
| `cycle` | text NOT NULL DEFAULT `'MONTHLY'` | |
| `anchor_day` | smallint NOT NULL CHECK (1..28) | avoids the 29–31 problem |
| `trial_ends_at` | timestamptz NULL | |
| `current_period_start`, `current_period_end` | timestamptz NULL | for `TRIALING` they stay NULL until the trial ends and the first charge is paid; the sweep then sets them (period starts at trial end). For a recovery payment they are set at payment |
| `next_due_date` | date NULL | tenant-local commercial due date (in `timezone`); for a `TRIALING` subscription it is the trial-end date (the first invoice's due date); the status sweep owns the overdue transition |
| `past_due_since` | timestamptz NULL | |
| `grace_until` | timestamptz NULL | operator override |
| `cancel_at` | timestamptz NULL | end of the paid period when the manager cancelled |
| `suspended_at` | timestamptz NULL | starts the clean-up clock |
| `purge_warning_30_sent_at`, `purge_warning_7_sent_at` | timestamptz NULL | dedupe for the 30- and 7-day clean-up warning emails; set in the same transaction that writes the `TenantPurgeWarning` outbox event; cleared on reactivation (decision 74) |
| `has_ever_paid` | boolean NOT NULL DEFAULT false | set true on the first confirmed payment; **alone** selects the clean-up delay (false = 90 days, true = 180 days, any suspension reason); also gates further self-signup trials |
| `exempt` | boolean NOT NULL DEFAULT false | free access (R12): Ikaro's own tenant and tenants that must never be charged (the existing staging tenants are backfilled once; new test tenants are charged normally against the fake or sandbox, main doc §5.3) — all features, never charged, suspended, purged or emailed about billing (replaces "price 0" items). Set by the audited operator endpoint or at provisioning; reversible, except for the tenant whose slug is `PLATFORM_OWNER_TENANT_SLUG` (enforced in the aggregate). Clearing it creates the 14-day first-selection window of a trial (`TRIALING`) |
| `version` | int NOT NULL DEFAULT 0 | optimistic lock (second line of defence next to `FOR UPDATE`) |
| `created_at`, `updated_at` | timestamptz | |

Cross-tenant job indexes (standalone, partial):
- `idx_subscriptions_issue (next_due_date) WHERE status IN ('TRIALING','ACTIVE') AND NOT exempt` — charge issuing (CAND-08).
- `idx_subscriptions_sweep (status, past_due_since)` and `(trial_ends_at) WHERE status = 'TRIALING'` (trial-end rule: unpaid or no charge → `SUSPENDED`, no `PAST_DUE`), `(cancel_at) WHERE cancel_at IS NOT NULL` — status sweep (CAND-10).
- `idx_subscriptions_purge (suspended_at) WHERE status = 'SUSPENDED'` — clean-up (CAND-27).

### `billing.subscription_items` — what the tenant is entitled to and pays for

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `subscription_id` | uuid NOT NULL | composite FK `(tenant_id, subscription_id)` → `subscriptions(tenant_id, id)` |
| `feature_key` | text NOT NULL | |
| `tier` | text NOT NULL DEFAULT `'STANDARD'` | |
| `starts_at` | timestamptz NOT NULL | |
| `ends_at` | timestamptz NULL | NULL = open-ended |
| `created_by` | text NOT NULL | operator id, manager actor id, or `SYSTEM` |
| `created_at` | timestamptz | |

- **No overlapping entitlement windows per feature:** a GIST exclusion constraint on `(tenant_id, subscription_id, feature_key, tstzrange(starts_at, coalesce(ends_at, 'infinity'), '[)'))` prevents tier/schedule overlap while allowing the current row to end exactly when the replacement starts.
- **Trial modelling:** at trial start Billing creates, per feature, a trial row `[now, trial_ends_at)` and a default paid row `[trial_ends_at, ∞)` with the same feature and tier (default first paid selection = all trial features). The Plano tab replaces only the future-dated paid rows. This keeps the GIST constraint satisfiable and guarantees a first invoice can always be computed. For an exempt subscription rows are open-ended `[now, ∞)`.
- Plan changes schedule rows at the next paid service-period boundary (local midnight in `subscriptions.timezone`); saving replaces the still-future rows (`starts_at > now`) in one transaction. On suspension all open rows are end-dated at `suspended_at`; reactivation restores the rows that were active at that moment. **Entitlement = rows where `starts_at <= now AND (ends_at IS NULL OR ends_at > now)`.** Trial changes schedule the first paid period and never reduce trial access.
- Access read: `(tenant_id, subscription_id)` index (items per tenant are ≤ ~20 live rows).
- Dependencies between features are enforced in the aggregate (domain rule), not in SQL.

### `billing.charges` — one bill per period (own aggregate)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `subscription_id` | uuid NOT NULL | composite FK |
| `kind` | text NOT NULL DEFAULT `'PERIOD'` | `PERIOD` \| `RECOVERY` (one-month charge issued to reactivate a suspended subscription) |
| `period_start`, `period_end` | date NULL | NOT NULL for `PERIOD`; for `RECOVERY` they are **written when the charge is confirmed paid** (the period starts at payment) — the only fields written after issue. CHECK: NOT NULL when `kind = 'PERIOD'` |
| `due_date` | date NOT NULL | tenant-timezone date |
| `subtotal_minor` | bigint NOT NULL | **cached sum of `charge_lines`** before tax, written once at insert |
| `tax_amount_minor` | bigint NULL | immutable tax snapshot. BR/tax-inclusive: 0 at insert. **US/tax-exclusive: NULL at insert, written once when the provider finalizes the invoice** (decision 62) |
| `amount_minor` | bigint NULL | final payable amount = `subtotal_minor + tax_amount_minor`; BR: set at insert; US: written once with the tax. CHECK: NOT NULL when `provider_creation_status = 'READY'` |
| `currency` | char(3) NOT NULL | |
| `merchant_profile_key` | text NOT NULL | snapshot copied from the subscription so historical charges retain their selling-entity/provider-account identity if a later configuration changes |
| `status` | text NOT NULL | `PENDING` \| `PAID` \| `OVERDUE` \| `FAILED` \| `CANCELED` \| `REFUNDED` \| `CHARGEBACK`. `FAILED` = the provider reported a final non-recoverable payment failure (e.g. capture refused with no retry left); the manager can still get a fresh link, which creates a new provider attempt, not a new Ikaro charge |
| `method` | text NULL | `CARD` \| `PIX` \| `BOLETO` |
| `paid_at` | timestamptz NULL | |
| `provider` | text NULL | |
| `provider_charge_id` | text NULL | |
| `payment_url` | text NULL | provider's hosted page; may expire (regenerated on demand) |
| `payment_url_expires_at` | timestamptz NULL | when the link stops working; drives the "link expired" state and `payment-link` response |
| `refunded_amount_minor` | bigint NOT NULL DEFAULT 0 | partial-refund total for display; `status = REFUNDED` only for a full refund |
| `provider_creation_status` | text NOT NULL DEFAULT `'PENDING'` | `PENDING` \| `READY` \| `FAILED`; every charge is inserted `PENDING` and becomes `READY` only after the provider call succeeds (provider id, link, and for US the tax and `amount_minor` are then written once). CHECK: when `READY`, `provider_charge_id` and `amount_minor` (and `tax_amount_minor` for tax-exclusive charges) are NOT NULL. A durable retry query, run inside the issuing job, owns remote creation after local commit |
| `provider_creation_attempts`, `provider_creation_last_attempt_at` | int / timestamptz | retry observability; never provider I/O inside the insert transaction |
| `created_at`, `updated_at` | timestamptz | |

- `UNIQUE(tenant_id, subscription_id, period_start) WHERE kind = 'PERIOD'` — the issuing cron is idempotent; CHECK: a `RECOVERY` charge may have NULL `period_*` only while its status is `PENDING`, `OVERDUE`, `CANCELED` or `FAILED`; `UNIQUE(tenant_id, subscription_id) WHERE kind = 'RECOVERY' AND status IN ('PENDING','OVERDUE')` — at most one open recovery charge. On a reactivation request any open `PERIOD` charge is cancelled (never re-dated) before the recovery charge is issued.
- `UNIQUE(provider, provider_charge_id) WHERE provider_charge_id IS NOT NULL` — standalone, webhook/reconcile lookup.
- Billing page list: `(tenant_id, due_date DESC)`.
- Reconcile/open-charge scan: `(status, due_date) WHERE status IN ('PENDING','OVERDUE')`; creation retry: `(provider_creation_status, provider_creation_last_attempt_at) WHERE provider_charge_id IS NULL` — standalone.
- **Retention:** kept (anonymized) after a tenant purge for fiscal reasons — to be confirmed with the accountant (see main doc §4.6).

### `billing.charge_tax_lines` — immutable tax snapshot (zero or more per charge)

| Column | Type | Notes |
|---|---|---|
| `tenant_id`, `charge_id` | uuid NOT NULL | composite FK to `charges`; tenant-scoped even though the charge owns it |
| `jurisdiction`, `tax_type` | text NOT NULL | provider-returned jurisdiction and classification, e.g. US state/local sales tax |
| `rate_basis_points` | int NULL | provider-returned rate when available; NULL is valid for amount-only results |
| `amount_minor` | bigint NOT NULL | immutable monetary tax snapshot |
| `provider_calculation_id` | text NULL | Stripe Tax calculation/transaction reference for support and reconciliation, never a live lookup source |

- PK: `(tenant_id, charge_id, jurisdiction, tax_type)`. The charge aggregate writes its lines with the charge; later tax-rate changes never mutate them.
- `INCLUSIVE` catalogs normally create no separate line; `EXCLUSIVE` US catalogs get their tax lines from Stripe's invoice finalization (`automatic_tax`), written once together with `provider_creation_status = READY`; with no Stripe registration the result is zero tax and no lines. A US charge whose customer location is invalid (Stripe needs at least a 5-digit ZIP; the full address is required by decision 39) is never issued: provider creation stays `PENDING` and the manager is warned.

### `billing.charge_lines` — snapshot of what was billed

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `charge_id` | uuid NOT NULL | composite FK `(tenant_id, charge_id)` → `charges(tenant_id, id)` |
| `feature_key`, `tier` | text NOT NULL | |
| `unit_price_minor` | bigint NOT NULL | **snapshot at charge time** |

- Index `(tenant_id, charge_id)`.

### `billing.provider_events` — webhook idempotency inbox

| Column | Type | Notes |
|---|---|---|
| `provider` | text NOT NULL | |
| `event_id` | text NOT NULL | provider's event `id` |
| `tenant_id` | uuid NOT NULL | **resolved from `billing_accounts` before insert** so the invariant holds; events for unknown customers are acknowledged and logged, not stored |
| `event_type` | text NOT NULL | |
| `received_at` | timestamptz NOT NULL | |
| `processed_at` | timestamptz NOT NULL | set in the same transaction as the local charge/subscription change and outbox rows |

- `PRIMARY KEY (provider, event_id)`. The webhook never acknowledges a successfully inserted-but-unprocessed row: insert, processing and outbox writes commit together. Retention: purge rows older than 30 days (`/cron/billing-provider-events-purge`; provider keeps events 14 days). Standalone index `(received_at)` for the purge.

### `billing.signup_registrations` — who started a self-signup tenant

| Column | Type | Notes |
|---|---|---|
| `tenant_id` | uuid NOT NULL | PK; one row per self-signup tenant (not written for operator-provisioned tenants) |
| `google_sub` | text NOT NULL | the verified Google account that created the tenant; index `(google_sub)` — **standalone**, the signup check runs before any tenant context exists |
| `terms_version`, `terms_accepted_at` | text / timestamptz NOT NULL | copied to `billing_accounts` when the account is created |
| `created_at` | timestamptz NOT NULL | |

Trial rule (main doc §6): a new self-signup for a `google_sub` is allowed a trial only if no earlier registration of that `sub` belongs to a subscription with `has_ever_paid = false` that still exists. The row is deleted by the purge's `BILLING` step together with the tenant. It deliberately lives in Billing (it gates a Billing outcome); Platform's signup endpoint writes it through a Billing use case after provisioning, in the `TenantProvisioned` handler, not in its own transaction.

### `billing.tenant_purge_jobs` and `billing.tenant_purge_steps` — durable cross-context erasure coordinator

`tenant_purge_jobs` has `id`, `tenant_id`, `reason`, `status` (`REQUESTED` | `IN_PROGRESS` | `FAILED` | `COMPLETED`), `requested_at`, `completed_at`, `last_error`, and timestamps. `UNIQUE(tenant_id) WHERE status <> 'COMPLETED'` permits one in-flight purge only. `tenant_purge_steps` records one idempotent completion per required participant (`BOOKING`, `CUSTOMER`, `STAFF`, `LOYALTY`, `NOTIFICATION`, `PLATFORM`, `BILLING`, `STORAGE`, `PROVIDER`) with `completed_at` and diagnostic metadata.

The suspension timestamp decides eligibility; these tables record only execution. The `BILLING` step anonymizes in place: it keeps `subscriptions` (no personal data) and all `charges`/`charge_lines`/`charge_tax_lines` rows for fiscal reasons — the composite FKs and `tenant_id` stay, `tenant_id` simply no longer matches a live tenant — and deletes `billing_accounts` personal fields, `signup_registrations`, `provider_events` and `operator_audit` payloads. Retention length is the accountant's decision. Platform deletes the tenant root and releases its slug after the job has every required completion. This is deliberately separate from `subscriptions.status`.

### `billing.operator_audit` — who changed what

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `actor` | text NOT NULL | operator identifier (script/user) |
| `action` | text NOT NULL | `GRACE`, `SUSPEND`, `SET_EXEMPT` (tenant-scoped actions only; there is no operator reactivation, and price-list changes are audited on `feature_price_versions`) |
| `payload` | jsonb NOT NULL | bounded; includes the reason |
| `occurred_at` | timestamptz NOT NULL | |

- Index `(tenant_id, occurred_at DESC)`. Append-only.

## 3. Modified existing tables / settings

- `platform.tenants`: **no change.** `is_active` keeps meaning offboarding/deactivation; billing never flips it (a payment problem is not an offboarding).
- `tenants.settings.chatbot.*`: the per-tenant overrides (`llmProvider`, `llmModel`, caps) become **derived from the chatbot tier** (Platform maps tier → model + caps in code constants) instead of being set by a developer's DB update. No column change; a story removes the manual override path.
- `platform.hotsite_configs`: **no change** (`is_published` stays the manager's preference; effective value is computed — R7).
- `Slug` value object (`apps/backend/src/shared/value-objects/slug.vo.ts`): add length 3–30, no leading/trailing hyphen, and a reserved-word list with a typed error. Existing tenants are unaffected (`reconstitute()` skips validation).
- `TenantProvisioned` (event) gains `countryCode` and an optional billing hint (`exempt`, feature subset), `eventVersion` bumped; `ProvisionTenantUseCase` and `POST /internal/tenants` gain optional `exempt`. No language parameter (language derives from country). A non-exempt US tenant is rejected while `FEATURE_FLAG_SIGNUP_US` is off.
- Notification templates: new Billing template keys (pt-BR, en) and a backfill so already-provisioned tenants get them; `NotificationLog.status` today is `PENDING | SENT | FAILED` (`notification-log.aggregate.ts`), and gains `SKIPPED_TENANT_SUSPENDED` and `SKIPPED_NOT_ALLOWLISTED` (type, aggregate and any DB check change together; staging `EMAIL_RECIPIENT_ALLOWLIST`, main doc §5.3).
- Non-production data: a seed script creates one tenant per billing state (main doc §5.3). It writes through the normal use cases, never directly into tables.

## 4. Migration ordering

1. Create schema `billing` and tables, including `signup_registrations` (expand only, no existing table touched).
2. Seed `feature_prices` and one `feature_price_versions` row each, `effective_from` = release date, from the **catalog approved in story A0** (BR launch list per decisions 77; US list only for non-production until decision 78 is closed).
3. Backfill existing tenants (CAND-21): `ACTIVE`, all features, `exempt = true` (real tenants created later start as `TRIALING` through CAND-01; Ikaro's own tenant is `exempt = true` too). Idempotent; per the migration-backfill rule the endpoints are not live traffic yet, but the backfill runs in the same release anyway so no tenant is ever without a row.
4. Add the Billing notification templates.
5. Deploy code with transient-lookup fail-open only; the `TenantProvisioned` v2 consumer rejects a v1 event (it retries until the v2 publisher is live; both deploy in the same release). A successful read with no subscription is an alertable provisioning integrity failure and must not grant all features.
6. Terraform: Cloud Scheduler jobs (issue charges, status sweep, reconcile, provider-events purge, tenant purge, ops digest), Secret Manager entries (`ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, sandbox and live as separate secrets), env `PLATFORM_OWNER_TENANT_SLUG`, `FEATURE_FLAG_SIGNUP_US`, `FEATURE_FLAG_BILLING_ENFORCEMENT`, staging `EMAIL_RECIPIENT_ALLOWLIST`.

CHECK constraints added to tables that already contain rows (none here — all tables are new) would need the `NOT VALID` + `VALIDATE` split; not applicable.

## 5. Candidate domain events

All carry the standard envelope (`eventId`, `tenantId`, `occurredAt`, `correlationId`, `eventName`, `eventVersion`, `data`). Each needs a line in the Billing audit-log handler.

| Event | `data` | Consumer |
|---|---|---|
| `ChargeIssued` | `chargeId`, `dueDate`, `amountMinor`, `currency`, `paymentUrl` | Notification (email) |
| `ChargePaid` | `chargeId`, `amountMinor`, `currency`, `method`, `paidAt` | Notification (receipt) |
| `SubscriptionPastDue` | `subscriptionId`, `pastDueSince`, `suspendsAt` | Notification |
| `SubscriptionSuspended` | `subscriptionId`, `reason`, `suspendedAt`, `purgeAt` | Notification; hotsite revalidation |
| `SubscriptionReactivated` | `subscriptionId`, `reactivatedAt` | Notification; hotsite revalidation |
| `TenantPurgeWarning` | `subscriptionId`, `daysBefore` (30 or 7), `purgeAt` | Notification (email to the manager; Billing template, exempt from the gate) |
| `SubscriptionPriceChangeAnnounced` | `featureKey`, `tier`, `oldAmountMinor`, `newAmountMinor`, `currency`, `effectiveFrom`, `firstAffectedDueDate`, `newMonthlyTotalMinor` — **one event per affected tenant** (the envelope requires `tenantId`, so a platform-wide price change fans out per tenant) | Notification (email to managers) |
| `TenantPurgeRequested` | `tenantId`, `reason` | every bounded context (each deletes its own data), storage cleanup |
| `TenantPurgeContextCompleted` | `purgeJobId`, `participant`, `completedAt` | Billing purge coordinator |

Ikaro sends every billing email itself (decision 59); no handler is conditional on provider emails.

## 6. Final decisions carried to the domain document

Entitlement = active items (no separate aggregate; trial rows plus default paid rows are created together); plan rows are non-overlapping time windows; price list is global, items carry no price, and charge lines snapshot the version selected by service-period start; full payment reversal suspends immediately; cancellation cancels future unpaid invoices immediately; purge execution is a separate coordinator; `exempt` protects Ikaro's own tenant; automatic billing is adapter-backed but deferred until verified; fiscal history is retained after purge.

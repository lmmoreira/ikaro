# Discovery: Tenant Billing — Data Model

**Status:** Discovery — sketch at schema level (tables and columns, not DDL). Every table follows CLAUDE.md §2 unless an exemption is stated and justified. Physically a new schema `billing` (schema-per-context, `docs/DATABASE_SCHEMA.md`). PKs are `uuidv7`. Timestamps are `timestamptz` UTC.

**Companion docs:** `tenant-billing.md` · `tenant-billing_USECASES.md` · `tenant-billing_API.md`.

## 1. Purpose and critique summary

The schema serves five reads: (1) the **access check** on every request/send (by `tenant_id`, hot, cached), (2) the **billing page** (summary + paginated charges), (3) the **cross-tenant jobs** (charge issuing, status sweep, reconcile, purge) that cannot seek by `tenant_id`, (4) **webhook dedupe and tenant resolution**, (5) the **public price list**.

Database-expert findings applied:
- **Snapshot, one level:** items carry **no price**. The list price in force on the issue date (`feature_price_versions`) is read when a charge is issued and copied into `charge_lines.unit_price_minor`, so a later list change never rewrites an issued charge (same idea as `BookingLine.priceAtBooking`). Prices referenced by an active item are never deleted, only deactivated.
- **One denormalization:** `charges.amount_minor` is a cached sum of its lines. It exists because the provider bills a single number that must equal what the tenant is shown, and the history list should not aggregate lines per row. It is written once at issue time and never edited (a price change creates a new charge).
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
| `active` | boolean NOT NULL DEFAULT true | deactivating never touches existing items |
| `created_at`, `updated_at` | timestamptz | |

- `UNIQUE(feature_key, country_code, tier, cycle)`.
- **Tenant-id exemption:** global operator data with no tenant owner, same justification as `platform.chatbot_provider_balance`. To be listed in `DATABASE_SCHEMA.md` § exemptions on promotion.
- The **amount** lives in `feature_price_versions` (below), so a price change is a new dated row, never an in-place edit.
- Read: `WHERE country_code = :c AND active` (public price endpoint) — table is tiny; the unique index covers it.

### `billing.feature_price_versions` — dated amounts (exempt from `tenant_id`, same justification)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `feature_price_id` | uuid NOT NULL | FK → `feature_prices(id)` |
| `amount_minor` | bigint NOT NULL CHECK (>= 0) | centavos / cents |
| `effective_from` | date NOT NULL | the **first charge issued on or after this date** uses the amount |
| `announced_at` | timestamptz NULL | when the managers were notified (NULL for the seed versions) |
| `created_by` | text NOT NULL | operator id |
| `reason` | text NOT NULL | |
| `created_at` | timestamptz NOT NULL | |

- `UNIQUE(feature_price_id, effective_from)`; read the amount in force with `ORDER BY effective_from DESC` where `effective_from <= :issueDate` (index on `(feature_price_id, effective_from DESC)`).
- A not-yet-effective version can be **superseded** by a new version for the same price (the pending row is replaced and managers are notified again). Versions already in effect are immutable history.
- Growth: one row per price change, negligible.

### `billing.billing_accounts` — one per tenant

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | `UNIQUE(tenant_id)`; also `UNIQUE(tenant_id, id)` for composite FKs |
| `tax_id_type` | text NULL | `CNPJ` \| `CPF` \| `OTHER`; NULL when none |
| `tax_id` | text NULL | digits only for BR (check digits via VO); free text for `OTHER`. Which types a country accepts comes from a new `taxId` entry in `CountrySpec` (BR: CNPJ or CPF; US: none, optional free text) |
| `legal_name` | text NULL | |
| `billing_email` | text NULL | falls back to the managers' emails |
| `address` | jsonb NULL | shaped exactly like the shared `Address` value object (`street`, `number`, `complement?`, `neighborhood?`, `city`, `state`, `zipCode`), validated with the **billing country's `AddressSpec`** from `packages/i18n/src/country-defaults.ts` (labels, postal regex, state pattern, neighbourhood on/off). The country is `subscriptions.country_code`, not repeated inside the JSON. A single bounded object, never an array |
| `provider` | text NULL | `ASAAS` \| `STRIPE` \| `MANUAL` |
| `provider_customer_id` | text NULL | |
| `auto_billing` | text NOT NULL DEFAULT `'NONE'` | `NONE` \| `CARD` \| `PIX_AUTOMATICO`; mirrored from the provider (no card data) |
| `auto_billing_label` | text NULL | e.g. `Cartão final 4242` — a display label supplied by the provider, never a PAN |
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
| `suspension_reason` | text NULL | `NON_PAYMENT` \| `CANCELED`; CHECK: NOT NULL iff `status = 'SUSPENDED'` |
| `country_code` | char(2) NOT NULL | fixed at start |
| `currency` | char(3) NOT NULL | fixed at start |
| `cycle` | text NOT NULL DEFAULT `'MONTHLY'` | |
| `anchor_day` | smallint NOT NULL CHECK (1..28) | avoids the 29–31 problem |
| `trial_ends_at` | timestamptz NULL | |
| `current_period_start`, `current_period_end` | timestamptz NULL | |
| `next_due_date` | date NULL | derived from the period; stored for the issuing cron's index |
| `past_due_since` | timestamptz NULL | |
| `grace_until` | timestamptz NULL | operator override |
| `cancel_at` | timestamptz NULL | end of the paid period when the manager cancelled |
| `suspended_at` | timestamptz NULL | starts the clean-up clock |
| `has_ever_paid` | boolean NOT NULL DEFAULT false | selects the 90 vs 180 day clean-up delay |
| `exempt` | boolean NOT NULL DEFAULT false | free access: Ikaro's own tenant and staging tenants — never charged, never suspended, never purged (replaces "price 0" items) |
| `provider_subscription_id` | text NULL | |
| `version` | int NOT NULL DEFAULT 0 | optimistic lock (second line of defence next to `FOR UPDATE`) |
| `created_at`, `updated_at` | timestamptz | |

Cross-tenant job indexes (standalone, partial):
- `idx_subscriptions_issue (next_due_date) WHERE status IN ('TRIALING','ACTIVE') AND NOT exempt` — charge issuing (CAND-08).
- `idx_subscriptions_sweep (status, past_due_since)` and `(trial_ends_at) WHERE status = 'TRIALING'`, `(cancel_at) WHERE cancel_at IS NOT NULL` — status sweep (CAND-10).
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
| `first_billed_at` | timestamptz NULL | set when the item first appears in an issued charge; an item with NULL cannot be removed or downgraded by the manager outside the trial (closes the add-use-remove loophole, R11) |
| `created_at` | timestamptz | |

- **One active item per feature:** partial unique `(tenant_id, subscription_id, feature_key) WHERE ends_at IS NULL`.
- A price change ends the current row and inserts a new one: price history is the row history. **Entitlement = rows where `starts_at <= now AND (ends_at IS NULL OR ends_at > now)`.**
- Access read: `(tenant_id, subscription_id)` index (items per tenant are ≤ ~20 live rows).
- Dependencies between features are enforced in the aggregate (domain rule), not in SQL.

### `billing.charges` — one bill per period (own aggregate)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `subscription_id` | uuid NOT NULL | composite FK |
| `period_start`, `period_end` | date NOT NULL | |
| `due_date` | date NOT NULL | tenant-timezone date |
| `amount_minor` | bigint NOT NULL | **cached sum of `charge_lines`**, written once (see §1) |
| `currency` | char(3) NOT NULL | |
| `status` | text NOT NULL | `PENDING` \| `PAID` \| `OVERDUE` \| `FAILED` \| `CANCELED` \| `REFUNDED` \| `CHARGEBACK` |
| `method` | text NULL | `CARD` \| `PIX` \| `BOLETO` \| `MANUAL` |
| `paid_at` | timestamptz NULL | |
| `provider` | text NULL | |
| `provider_charge_id` | text NULL | |
| `payment_url` | text NULL | provider's hosted page; may expire (regenerated on demand) |
| `created_at`, `updated_at` | timestamptz | |

- `UNIQUE(tenant_id, subscription_id, period_start)` — the issuing cron is idempotent.
- `UNIQUE(provider, provider_charge_id) WHERE provider_charge_id IS NOT NULL` — standalone, webhook/reconcile lookup.
- Billing page list: `(tenant_id, due_date DESC)`.
- Reconcile / open-charge scans: `(status, due_date) WHERE status IN ('PENDING','OVERDUE')` — standalone.
- **Retention:** kept (anonymized) after a tenant purge for fiscal reasons — to be confirmed with the accountant (see main doc §4.6).

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
| `processed_at` | timestamptz NULL | |

- `PRIMARY KEY (provider, event_id)`. Retention: purge rows older than 30 days (`/cron/billing-provider-events-purge`; provider keeps events 14 days). Standalone index `(received_at)` for the purge.

### `billing.operator_audit` — who changed what

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `actor` | text NOT NULL | operator identifier (script/user) |
| `action` | text NOT NULL | `SET_FEATURE_PRICE`, `MARK_PAID`, `GRACE`, `SUSPEND`, `REACTIVATE` |
| `payload` | jsonb NOT NULL | bounded; includes the reason |
| `occurred_at` | timestamptz NOT NULL | |

- Index `(tenant_id, occurred_at DESC)`. Append-only.

## 3. Modified existing tables / settings

- `platform.tenants`: **no change.** `is_active` keeps meaning offboarding/deactivation; billing never flips it (a payment problem is not an offboarding).
- `tenants.settings.chatbot.*`: the per-tenant overrides (`llmProvider`, `llmModel`, caps) become **derived from the chatbot tier** (Platform maps tier → model + caps in code constants) instead of being set by a developer's DB update. No column change; a story removes the manual override path.
- `platform.hotsite_configs`: **no change** (`is_published` stays the manager's preference; effective value is computed — R7).
- `Slug` value object (`apps/backend/src/shared/value-objects/slug.vo.ts`): add length 3–30, no leading/trailing hyphen, and a reserved-word list with a typed error. Existing tenants are unaffected (`reconstitute()` skips validation).
- Notification templates: new Billing template keys (pt-BR, en) and a backfill so already-provisioned tenants get them.

## 4. Migration ordering

1. Create schema `billing` and tables (expand only, no existing table touched).
2. Seed `feature_prices` and one `feature_price_versions` row each, `effective_from` = release date (illustrative values; real prices are an operator decision).
3. Backfill existing tenants (CAND-21): `ACTIVE`, all features, `exempt = true` (real tenants created later start as `TRIALING` through CAND-01; Ikaro's own tenant is `exempt = true` too). Idempotent; per the migration-backfill rule the endpoints are not live traffic yet, but the backfill runs in the same release anyway so no tenant is ever without a row.
4. Add the Billing notification templates.
5. Deploy code with enforcement behind **fail-open** so a gap in step 3 cannot lock anyone out.
6. Terraform: Cloud Scheduler jobs, Secret Manager entries (`ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`), env `PLATFORM_OWNER_TENANT_SLUG`.

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
| `SubscriptionPriceChangeAnnounced` | `featureKey`, `tier`, `oldAmountMinor`, `newAmountMinor`, `currency`, `effectiveFrom`, `firstAffectedDueDate`, `newMonthlyTotalMinor` — **one event per affected tenant** (the envelope requires `tenantId`, so a platform-wide price change fans out per tenant) | Notification (email to managers) |
| `TenantPurgeRequested` | `tenantId`, `reason` | every bounded context (each deletes its own data), storage cleanup |

If the provider already notifies payers about issued/paid/overdue charges, the first three events and their handlers are removed.

## 6. Final decisions carried to the domain document

Entitlement = active items (no separate aggregate); price list is global, items carry no price, charge lines snapshot it at issue; suspension reason is a column, not a status; cancel is `cancel_at` + a later sweep; `exempt` protects Ikaro's own tenant; auto-billing mirrors only a label; fiscal history is retained after purge.

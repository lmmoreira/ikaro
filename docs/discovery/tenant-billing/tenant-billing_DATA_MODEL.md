# Discovery: Tenant Billing — Data Model

**Status:** Discovery — sketch at schema level (tables and columns, not DDL). Every table follows CLAUDE.md §2 unless an exemption is stated and justified. Physically a new schema `billing` (schema-per-context, `docs/DATABASE_SCHEMA.md`). PKs are `uuidv7`. Timestamps are `timestamptz` UTC.

**First-schema scope (decision 99):** the first migration is **BR-only**. Everything marked *slice E* below (tax columns, `charge_tax_lines`, `tax_behavior`) is added later by an expand migration when the Stripe/US slice is built; the provider port keeps the tax shape so nothing else changes.

**Companion docs:** `tenant-billing.md` · `tenant-billing_USECASES.md` · `tenant-billing_API.md`.

**Review 3 (2026-10-28):** each table now ends with a small **Example** (illustrative values, BR unless stated; ids shortened). New/changed: `subscriptions.plan_confirmed_at` and the `next_due_date` lifecycle (decision 115/118), `signup_registrations` renamed in role to a *provisioning registration* that keeps PII out of events (decision 120), `charges.origin` for provider-collected card charges (slice F2, decision 114), notification-log widening (§3), tenant-discard reason on the purge job (decision 116).

## 1. Purpose and critique summary

The schema serves five reads: (1) the **access check** on every request/send (by `tenant_id`, hot, cached), (2) the **billing page** (summary + paginated charges), (3) the **cross-tenant jobs** (charge issuing, status sweep, reminders, reconcile, self-heal, purge) that cannot seek by `tenant_id`, (4) **webhook dedupe and tenant resolution**, (5) the **public price list**.

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
| `feature_key` | text NOT NULL | closed enum `FeatureKey` (five members: `HOTSITE`, `BOOKING`, `LOYALTY`, `CHATBOT`, `LEAD_FORM`; CHECK mirrors it; `closed-enum-registry` detector) |
| `country_code` | char(2) NOT NULL | `BR`, `US` in v1 |
| `tier` | text NOT NULL DEFAULT `'STANDARD'` | `BASIC`/`PLUS` for `CHATBOT`; `STANDARD` elsewhere |
| `cycle` | text NOT NULL DEFAULT `'MONTHLY'` | only `MONTHLY` accepted in v1 (CHECK); column exists so annual can be added |
| `currency` | char(3) NOT NULL | BR→BRL, US→USD (validated by the VO) |
| `tax_behavior` | *slice E* | `INCLUSIVE` (BR) or `EXCLUSIVE` (US); added with the US slice. Until then every price is tax-inclusive and the column does not exist |
| `selectable` | boolean NOT NULL DEFAULT true | false hides the catalog row from new selection; it never stops renewal for an existing item |
| `created_at`, `updated_at` | timestamptz | |

- `UNIQUE(feature_key, country_code, tier, cycle)`.
- **Tenant-id exemption:** global operator data with no tenant owner, same justification as `platform.chatbot_provider_balance`. To be listed in `DATABASE_SCHEMA.md` § exemptions on promotion.
- The **amount** lives in `feature_price_versions` (below), so a price change is a new dated row, never an in-place edit.
- Public read: `WHERE country_code = :c AND selectable`; renewal lookup deliberately does not require `selectable`.

**Example** — the Plus chatbot tier for Brazil:

| id | feature_key | country_code | tier | cycle | currency | selectable |
|---|---|---|---|---|---|---|
| `0190…a1` | `CHATBOT` | `BR` | `PLUS` | `MONTHLY` | `BRL` | `true` |

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

**Example** — the seed amount and a later announced increase for the same price (the first has no `announced_at`; the second is not yet in force):

| feature_price_id | amount_minor | effective_from | announced_at | created_by | reason | superseded_at |
|---|---|---|---|---|---|---|
| `0190…a1` | `7900` | `2026-11-10` | `NULL` | `seed` | `launch catalog` | `NULL` |
| `0190…a1` | `8900` | `2027-01-10` | `2026-11-20T12:00Z` | `op:leonardo` | `annual adjustment` | `NULL` |

### `billing.billing_accounts` — one per tenant

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | `UNIQUE(tenant_id)`; also `UNIQUE(tenant_id, id)` for composite FKs |
| `tax_id_type` | text NULL | `CNPJ` \| `CPF` \| `OTHER`. **BR: NOT NULL from signup** (`tax_id` required, check digits validated — Asaas needs `cpfCnpj`; enforced by the aggregate and the signup endpoint, columns stay nullable for US and exempt tenants) |
| `tax_id` | text NULL | digits only for BR (check digits via VO); free text for `OTHER`. Which types a country accepts comes from a new `taxId` entry in `CountrySpec` (BR: CNPJ or CPF; US: none, optional free text) |
| `legal_name` | text NULL | |
| `billing_email` | text NULL | falls back to the managers' emails |
| `address` | jsonb NULL | **BR and US: required before the first paid selection (BR for provider-automatic NFS-e, decision 109; US for tax); not asked at signup.** Shaped exactly like the shared `Address` value object (`street`, `number`, `complement?`, `neighborhood?`, `city`, `state`, `zipCode`), validated with the **billing country's `AddressSpec`** from `packages/i18n/src/country-defaults.ts` (labels, postal regex, state pattern, neighbourhood on/off). The country is `subscriptions.country_code`, not repeated inside the JSON. A single bounded object, never an array |
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

**Example** — a Brazilian tenant that signed up on its own (address not yet asked; US rows differ only by `tax_id*` being NULL and `provider = STRIPE`):

| tenant_id | tax_id_type | tax_id | legal_name | billing_email | address | provider | provider_customer_id | auto_billing / status | terms_version / accepted_by |
|---|---|---|---|---|---|---|---|---|---|
| `0190…t1` | `CNPJ` | `12345678000190` | `NULL` | `NULL` (falls back to managers) | `NULL` | `ASAAS` | `cus_000012345` | `NONE` / `INACTIVE` | `2026-10` / `ana@lavacar.com` |

After the manager saves the address: `{"street":"Rua das Flores","number":"120","neighborhood":"Centro","city":"São Paulo","state":"SP","zipCode":"01310-100"}`.

### `billing.subscriptions` — one per tenant

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | `UNIQUE(tenant_id)`; `UNIQUE(tenant_id, id)` |
| `status` | text NOT NULL | `TRIALING` \| `ACTIVE` \| `PAST_DUE` \| `SUSPENDED` |
| `suspension_reason` | text NULL | `NON_PAYMENT` \| `CANCELED` \| `PAYMENT_REVERSED` \| `OPERATOR` (abuse/takedown, decision 87); CHECK: NOT NULL iff `status = 'SUSPENDED'` |
| `country_code` | char(2) NOT NULL | fixed at start |
| `currency` | char(3) NOT NULL | fixed at start |
| `timezone` | text NOT NULL | IANA zone copied from `TenantProvisioned` at creation, **immutable**. Every "tenant-local" value in this schema (`next_due_date`, charge `due_date`/periods, local-midnight period boundaries, the overdue sweep) uses it; Billing never reads Platform settings |
| `merchant_profile_key` | text NOT NULL | immutable operational key for the selling legal entity/provider-account configuration, e.g. `BRL_ASAAS_IKARO_BR` or `USD_STRIPE_IKARO_BR` in production (the Stripe account is the Brazilian CNPJ's, decision 60) and **`BRL_FAKE`, `USD_FAKE`, `BRL_ASAAS_SANDBOX`, `USD_STRIPE_TEST` outside it**. The environment configuration decides which key new subscriptions receive (main doc §5.3); there is no per-tenant override, and a fake/sandbox key is rejected when `APP_ENV=production`. No KYC/legal-entity fields are duplicated in Ikaro |
| `cycle` | text NOT NULL DEFAULT `'MONTHLY'` | |
| `anchor_day` | smallint NOT NULL CHECK (1..28) | avoids the 29–31 problem |
| `trial_ends_at` | timestamptz NULL | the tenant-local midnight that closes day 14 (decision 84) |
| `current_period_start`, `current_period_end` | timestamptz NULL | for `TRIALING` they stay NULL until the trial ends and the first charge is paid; the sweep then sets them (period starts at trial end). For a recovery payment they are set at payment |
| `next_due_date` | date NULL | tenant-local due date of the **next period still to be issued** (in `timezone`). Lifecycle (decision 118): set to the trial-end date at start; **advanced by one cycle (anchor day, clamped to 28) in the same transaction that inserts the `PERIOD` charge for it**, so an already-issued charge is never selected again; a recovery payment sets it to the day after the new period's end; a cancelled-and-re-issued charge (plan change) reuses its period and never rewinds it. The page shows the open charge's own `due_date` when one exists, else this value. The status sweep owns the overdue transition |
| `past_due_since` | timestamptz NULL | |
| `grace_until` | timestamptz NULL | operator override |
| `cancel_at` | timestamptz NULL | end of the paid period when the manager cancelled |
| `plan_confirmed_at` | timestamptz NULL | when the manager explicitly confirmed the first paid selection on the Plano tab (decision 115). While `TRIALING` and NULL, the first invoice is **not** issued until `trial_ends_at − PLAN_CONFIRM_FALLBACK_DAYS` (3), when the issue job issues it from the default selection and emails clearly. Set also by any later plan save; for a recovery or exempt-clear flow it is set at the same moment the items are written |
| `suspended_at` | timestamptz NULL | starts the clean-up clock |
| `purge_warning_30_sent_at`, `purge_warning_7_sent_at` | timestamptz NULL | dedupe for the 30- and 7-day clean-up warning emails; set in the same transaction that writes the `TenantPurgeWarning` outbox event; cleared on reactivation (decision 74) |
| `has_ever_paid` | boolean NOT NULL DEFAULT false | set true on the first confirmed payment; **alone** selects the clean-up delay (false = 90 days, true = 180 days, any suspension reason); also gates further self-signup trials |
| `exempt` | boolean NOT NULL DEFAULT false | free access (R12): Ikaro's own tenant and tenants that must never be charged (the existing staging tenants are backfilled once; new test tenants are charged normally against the fake or sandbox, main doc §5.3) — all features, never charged, suspended, purged or emailed about billing (replaces "price 0" items). Set by the audited operator endpoint or at provisioning; reversible, except for the tenant whose slug is `PLATFORM_OWNER_TENANT_SLUG` (enforced in the aggregate). Clearing it creates the 14-day first-selection window of a trial (`TRIALING`) |
| `version` | int NOT NULL DEFAULT 0 | optimistic lock (second line of defence next to `FOR UPDATE`) |
| `created_at`, `updated_at` | timestamptz | |

Cross-tenant job indexes (standalone, partial):
- `idx_subscriptions_issue (next_due_date) WHERE status IN ('TRIALING','ACTIVE') AND NOT exempt` — charge issuing (CAND-08).
- `idx_subscriptions_reminders (next_due_date) WHERE status IN ('TRIALING','ACTIVE','PAST_DUE') AND NOT exempt` (reminders job). Self-heal needs no extra index: it anti-joins `platform.tenants` against `subscriptions` on `created_at`.
- `idx_subscriptions_sweep (status, past_due_since)` and `(trial_ends_at) WHERE status = 'TRIALING'` (trial-end rule: unpaid or no charge → `SUSPENDED`, no `PAST_DUE`), `(cancel_at) WHERE cancel_at IS NOT NULL` — status sweep (CAND-10).
- `idx_subscriptions_purge (suspended_at) WHERE status = 'SUSPENDED'` — clean-up (CAND-27).

**Example** — a trialing BR tenant (trial started 2026-10-21, `timezone` America/Sao_Paulo; it has not yet confirmed its plan) and an active one:

| field | trialing tenant | active tenant |
|---|---|---|
| `status` / `suspension_reason` | `TRIALING` / `NULL` | `ACTIVE` / `NULL` |
| `country_code` / `currency` / `merchant_profile_key` | `BR` / `BRL` / `BRL_ASAAS_IKARO_BR` | same |
| `anchor_day` | `4` (trial-end day) | `20` |
| `trial_ends_at` | `2026-11-04T03:00Z` (local midnight closing day 14) | `NULL` |
| `current_period_start` → `end` | `NULL` → `NULL` | `2026-10-20` → `2026-11-20` |
| `next_due_date` | `2026-11-04` | `2026-11-20` (next unissued; the open one is on the charge) |
| `plan_confirmed_at` | `NULL` | `2026-10-10T14:02Z` |
| `has_ever_paid` / `exempt` | `false` / `false` | `true` / `false` |
| `cancel_at` / `suspended_at` | `NULL` / `NULL` | `NULL` / `NULL` |

### `billing.subscription_items` — the selected plan (what the tenant pays for, from which period)

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
- **Trial modelling (decision 83):** there are **no trial rows**. At trial start Billing creates one default paid row per feature `[trial_ends_at, ∞)` (default first paid selection = all trial features, chatbot `BASIC`); trial access is computed from `status = TRIALING`, not from rows. The Plano tab replaces only the future-dated rows. A first invoice can always be computed. For an exempt subscription rows are open-ended `[now, ∞)`.
- Plan changes schedule rows at the next paid service-period boundary (local midnight in `subscriptions.timezone`); saving replaces the still-future rows (`starts_at > now`) in one transaction. Suspension does **not** touch the rows (the status already gates access), so reactivation is a status flip with nothing to restore, and the recovery charge reads the current rows. **Entitlement = `SUSPENDED` → none; `TRIALING` → every sellable feature; otherwise the rows where `starts_at <= now AND (ends_at IS NULL OR ends_at > now)`.** Trial changes schedule the first paid period and never reduce trial access. Removing `BOOKING` is validated against live bookings, recurring schedules and alerts at save time (decision 81). The GIST exclusion needs the `btree_gist` extension (migration step 1).
- Access read: `(tenant_id, subscription_id)` index (items per tenant are ≤ ~20 live rows).
- Dependencies between features are enforced in the aggregate (domain rule), not in SQL.
- **Clearing `exempt`** (CAND-32) **replaces** the open-ended `[now, ∞)` rows with the default paid rows `[trial_ends_at, ∞)` in the same transaction (end-dating or deleting the old ones first); otherwise the GIST exclusion would reject the insert.

**Example** — a trialing tenant that chose the Plus chatbot as its first paid selection (rows exist before the trial ends; trial access ignores them, decision 83), and a paid tenant that scheduled the removal of Lead Form:

| subscription | feature_key | tier | starts_at | ends_at | created_by |
|---|---|---|---|---|---|
| trialing | `HOTSITE` | `STANDARD` | `2026-11-04T03:00Z` | `NULL` | `SYSTEM` |
| trialing | `CHATBOT` | `PLUS` | `2026-11-04T03:00Z` | `NULL` | `actor:7f3…` (manager) |
| paid | `LEAD_FORM` | `STANDARD` | `2026-10-20T03:00Z` | `2026-11-20T03:00Z` | `actor:7f3…` (end-dated by the removal) |

### `billing.charges` — one bill per period (own aggregate)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `subscription_id` | uuid NOT NULL | composite FK |
| `kind` | text NOT NULL DEFAULT `'PERIOD'` | `PERIOD` \| `RECOVERY` (one-month charge issued to reactivate a suspended subscription) |
| `period_start`, `period_end` | date NULL | NOT NULL for `PERIOD`; for `RECOVERY` they stay **NULL forever**: the period lives on `subscriptions.current_period_*` and `paid_at` is its start (decision 82). CHECK: NOT NULL when `kind = 'PERIOD'`, NULL when `RECOVERY` |
| `due_date` | date NOT NULL | tenant-timezone date |
| `subtotal_minor` | bigint NOT NULL | **cached sum of `charge_lines`** before tax, written once at insert |
| `tax_amount_minor` | *slice E* | immutable tax snapshot for tax-exclusive (US) charges, written once when the provider finalizes the invoice (decision 62). Not in the first schema |
| `amount_minor` | bigint NOT NULL | payable amount, set at insert (BR is tax-inclusive, so it equals `subtotal_minor`). Slice E relaxes this to nullable for tax-exclusive charges finalized by the provider |
| `currency` | char(3) NOT NULL | |
| `merchant_profile_key` | text NOT NULL | snapshot copied from the subscription so historical charges retain their selling-entity/provider-account identity if a later configuration changes |
| `status` | text NOT NULL | `PENDING` \| `PAID` \| `OVERDUE` \| `FAILED` \| `CANCELED` \| `REFUNDED` \| `CHARGEBACK`. `FAILED` = the provider reported a final non-recoverable payment failure (e.g. capture refused with no retry left); the manager can still get a fresh link, which creates a new provider attempt, not a new Ikaro charge |
| `method` | text NULL | `CARD` \| `PIX` \| `BOLETO` |
| `paid_at` | timestamptz NULL | |
| `provider` | text NULL | |
| `provider_charge_id` | text NULL | |
| `payment_url` | text NULL | provider's hosted page; may expire (regenerated on demand) |
| `payment_url_expires_at` | timestamptz NULL | when the link stops working; drives the "link expired" state and `payment-link` response |
| `receipt_url` | text NULL | the provider's hosted receipt/invoice link, exposed on a paid charge so receipts are self-service (decision 111) |
| `payment_return_seen_at` | timestamptz NULL | set when the manager returns from the hosted page; with `status` still open it is what `paymentConfirmationPending` means and it triggers an on-demand single-charge refresh (decision 92). It is also the signal that **extends the trial-end settlement margin** from 24 h to `PAYMENT_PENDING_MARGIN_BUSINESS_DAYS` (3 business days, decision 117): a boleto paid on a Friday may only compensate on Tuesday |
| `origin` | *slice F2* | `IKARO_ISSUED` (default) \| `PROVIDER_SUBSCRIPTION` (a charge generated by an Asaas hosted recurring-card subscription and mirrored from its webhook, decision 114). Added with the F2 expand migration; the first schema has only Ikaro-issued charges |
| `refunded_amount_minor` | bigint NOT NULL DEFAULT 0 | partial-refund total for display; `status = REFUNDED` only for a full refund |
| `provider_creation_status` | text NOT NULL DEFAULT `'PENDING'` | `PENDING` \| `READY` \| `FAILED`; every charge is inserted `PENDING` and becomes `READY` only after the provider call succeeds (provider id, link, and for US the tax and `amount_minor` are then written once). CHECK: when `READY`, `provider_charge_id` is NOT NULL. A durable retry query, run inside the issuing job, owns remote creation after local commit |
| `provider_creation_attempts`, `provider_creation_last_attempt_at` | int / timestamptz | retry observability; never provider I/O inside the insert transaction |
| `created_at`, `updated_at` | timestamptz | |

- `UNIQUE(tenant_id, subscription_id, period_start) WHERE kind = 'PERIOD' AND status <> 'CANCELED'` — the issuing cron is idempotent, and a cancelled charge (plan-change re-issue) does not block its replacement; `UNIQUE(tenant_id, subscription_id) WHERE kind = 'RECOVERY' AND status IN ('PENDING','OVERDUE')` — at most one open recovery charge. On a reactivation request any open `PERIOD` charge is cancelled (never re-dated) before the recovery charge is issued.
- `UNIQUE(provider, provider_charge_id) WHERE provider_charge_id IS NOT NULL` — standalone, webhook/reconcile lookup.
- Billing page list: `(tenant_id, due_date DESC)`.
- Reconcile/open-charge scan: `(status, due_date) WHERE status IN ('PENDING','OVERDUE')`; creation retry: `(provider_creation_status, provider_creation_last_attempt_at) WHERE provider_charge_id IS NULL` — standalone.
- **Retention:** kept (anonymized) after a tenant purge for fiscal reasons — to be confirmed with the accountant (see main doc §4.6).

**Example** — a paid `PERIOD` charge and an open `RECOVERY` charge (BR, tax-inclusive, so `amount = subtotal`):

| field | paid period charge | open recovery charge |
|---|---|---|
| `kind` / `status` | `PERIOD` / `PAID` | `RECOVERY` / `PENDING` |
| `period_start` → `period_end` | `2026-10-20` → `2026-11-19` | `NULL` → `NULL` |
| `due_date` | `2026-10-20` | `2026-11-12` (issue + 7 days) |
| `subtotal_minor` / `amount_minor` / `currency` | `24500` / `24500` / `BRL` | `24500` / `24500` / `BRL` |
| `method` / `paid_at` | `PIX` / `2026-10-18T13:44Z` | `NULL` / `NULL` |
| `provider` / `provider_charge_id` | `ASAAS` / `pay_8f2k1x` | `ASAAS` / `pay_9c7m3q` |
| `provider_creation_status` | `READY` | `READY` |
| `payment_url` / expires | `https://www.asaas.com/i/…` / `NULL` | `https://www.asaas.com/i/…` / `2027-11-12` |
| `receipt_url` | `https://www.asaas.com/comprovantes/…` | `NULL` |
| `payment_return_seen_at` | `2026-10-18T13:40Z` | `NULL` |

### `billing.charge_tax_lines` — immutable tax snapshot (zero or more per charge) — *slice E, not in the first schema*

| Column | Type | Notes |
|---|---|---|
| `tenant_id`, `charge_id` | uuid NOT NULL | composite FK to `charges`; tenant-scoped even though the charge owns it |
| `jurisdiction`, `tax_type` | text NOT NULL | provider-returned jurisdiction and classification, e.g. US state/local sales tax |
| `rate_basis_points` | int NULL | provider-returned rate when available; NULL is valid for amount-only results |
| `amount_minor` | bigint NOT NULL | immutable monetary tax snapshot |
| `provider_calculation_id` | text NULL | Stripe Tax calculation/transaction reference for support and reconciliation, never a live lookup source |

- PK: `(tenant_id, charge_id, jurisdiction, tax_type)`. The charge aggregate writes its lines with the charge; later tax-rate changes never mutate them.
- `INCLUSIVE` catalogs normally create no separate line; `EXCLUSIVE` US catalogs get their tax lines from Stripe's invoice finalization (`automatic_tax`), written once together with `provider_creation_status = READY`; with no Stripe registration the result is zero tax and no lines. A US charge whose customer location is invalid (Stripe needs at least a 5-digit ZIP; the full address is required by decision 39) is never issued: provider creation stays `PENDING` and the manager is warned.

**Example** (US, slice E) — Texas state sales tax on a US$ 59.00 subtotal:

| charge | jurisdiction | tax_type | rate_basis_points | amount_minor | provider_calculation_id |
|---|---|---|---|---|---|
| `0190…c9` | `TX` | `sales_tax` | `625` | `369` | `taxcalc_1Pq…` |

### `billing.charge_lines` — snapshot of what was billed

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `charge_id` | uuid NOT NULL | composite FK `(tenant_id, charge_id)` → `charges(tenant_id, id)` |
| `feature_key`, `tier` | text NOT NULL | |
| `unit_price_minor` | bigint NOT NULL | **snapshot at charge time** |

- Index `(tenant_id, charge_id)`.

**Example** — the lines of the paid charge above (their sum is the charge `subtotal_minor`, 24500):

| charge_id | feature_key | tier | unit_price_minor |
|---|---|---|---|
| `0190…c1` | `HOTSITE` | `STANDARD` | `4900` |
| `0190…c1` | `BOOKING` | `STANDARD` | `10900` |
| `0190…c1` | `LOYALTY` | `STANDARD` | `2900` |
| `0190…c1` | `CHATBOT` | `BASIC` | `3900` |
| `0190…c1` | `LEAD_FORM` | `STANDARD` | `1900` |

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
- **Tenant-first exemption:** the PK is `(provider, event_id)` on purpose (the webhook dedupes before it can resolve a tenant context); list it in the `DATABASE_SCHEMA.md` exemptions together with `feature_prices`, `feature_price_versions` and `provider_health`. The `tenant_id` column is still NOT NULL and resolved first.

**Example:**

| provider | event_id | tenant_id | event_type | received_at | processed_at |
|---|---|---|---|---|---|
| `ASAAS` | `evt_a1b2c3` | `0190…t1` | `PAYMENT_RECEIVED` | `2026-10-18T13:44:02Z` | `2026-10-18T13:44:02Z` |

### `billing.signup_registrations` — the provisioning registration (created before the tenant exists)

Role widened by decision 120: **every non-exempt provisioning path** (self-signup and the operator script) first creates a registration, and `TenantProvisioned` carries **only its `registrationId`** — never the Google `sub`, the CPF/CNPJ or the terms — so personal data does not travel through Pub/Sub or into the generic audit log. The Billing handler reads this row (its own data) to create the `BillingAccount`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | the reservation id, created before the tenant exists (decision 96); passed to provisioning and to the event |
| `tenant_id` | uuid NULL | `UNIQUE` when not null; NULL while `RESERVED`, set when the `TenantProvisioned` handler completes it |
| `source` | text NOT NULL | `SELF_SIGNUP` \| `OPERATOR` |
| `status` | text NOT NULL | `RESERVED` \| `COMPLETED`; a `RESERVED` row older than one hour is released by the sweep |
| `google_sub` | text NULL | the verified Google account (NOT NULL for `SELF_SIGNUP`); index `(google_sub)` — **standalone**, the signup check runs before any tenant context exists |
| `tax_id_type`, `tax_id` | text NULL | BR CPF/CNPJ collected at signup (or by the script); copied to `billing_accounts` by the handler and **cleared from this row on completion** |
| `terms_version`, `terms_accepted_at` | text / timestamptz NULL | NOT NULL for `SELF_SIGNUP`; copied to `billing_accounts` |
| `created_at` | timestamptz NOT NULL | |

Trial rule (main doc §6): a new self-signup for a `google_sub` is allowed a trial only if no earlier registration of that `sub` is `RESERVED` or belongs to a subscription with `has_ever_paid = false` that still exists; the eligibility check reserves the row under `pg_advisory_xact_lock` on the `google_sub`, so concurrent signups cannot both pass. The row is deleted by the purge's `BILLING` step together with the tenant, **and immediately by the self-service discard of a never-paid tenant** (decision 116), which is what frees the trial eligibility. It deliberately lives in Billing (it gates a Billing outcome); the BFF creates it through an internal Billing endpoint before calling Platform's provisioning (BFF orchestration, no cross-context port).

**Example** — a self-signup that completed, and one still reserved:

| id | tenant_id | source | status | google_sub | tax_id_type / tax_id | terms_version |
|---|---|---|---|---|---|---|
| `0190…r1` | `0190…t1` | `SELF_SIGNUP` | `COMPLETED` | `1098…` | `NULL` / `NULL` (cleared) | `2026-10` |
| `0190…r2` | `NULL` | `SELF_SIGNUP` | `RESERVED` | `1177…` | `CNPJ` / `12345678000190` | `2026-10` |

### `billing.tenant_purge_jobs` and `billing.tenant_purge_steps` — durable cross-context erasure coordinator

`tenant_purge_jobs` has `id`, `tenant_id`, `reason` (`SUSPENSION_AGE` \| `SELF_SERVICE_DISCARD` \| `OPERATOR_REQUEST`), `status` (`REQUESTED` | `IN_PROGRESS` | `FAILED` | `COMPLETED`), `requested_at`, `completed_at`, `last_error`, and timestamps. `UNIQUE(tenant_id) WHERE status <> 'COMPLETED'` permits one in-flight purge only. `tenant_purge_steps` records one idempotent completion per required participant (`BOOKING`, `CUSTOMER`, `STAFF`, `LOYALTY`, `NOTIFICATION`, `PLATFORM`, `BILLING`, `STORAGE`, `PROVIDER`) with `completed_at` and diagnostic metadata.

The suspension timestamp decides eligibility; these tables record only execution. The `BILLING` step anonymizes in place: it keeps `subscriptions` (no personal data) and all `charges`/`charge_lines`/`charge_tax_lines` rows for fiscal reasons — the composite FKs and `tenant_id` stay, `tenant_id` simply no longer matches a live tenant — and deletes `billing_accounts` personal fields, `signup_registrations`, `provider_events` and `operator_audit` payloads. Retention length is the accountant's decision. Platform deletes the tenant root and releases its slug after the job has every required completion. This is deliberately separate from `subscriptions.status`. Reconcile with `plan/M17-CLOUD-DEPLOY.md` S51 (manual LGPD offboarding runbooks): this coordinator is the automation S51 deferred, and S51's runbooks stay the fallback for `OPERATOR_REQUEST`.

**Example** — a purge job in progress (booking and customer done, the rest pending):

| job | tenant_id | reason | status | requested_at |
|---|---|---|---|---|
| `0190…j1` | `0190…t7` | `SUSPENSION_AGE` | `IN_PROGRESS` | `2027-04-12T03:00Z` |

| job | participant | completed_at |
|---|---|---|
| `0190…j1` | `BOOKING` | `2027-04-12T03:02Z` |
| `0190…j1` | `CUSTOMER` | `2027-04-12T03:02Z` |

### `billing.provider_health` — platform-wide provider state (exempt from `tenant_id`)

One row per `merchant_profile_key`: `last_reconcile_ok_at`, `webhook_status` (`OK` \| `PAUSED` \| `UNKNOWN`), `freeze_active`, `freeze_since`, `updated_at`. The reconcile and provider-health jobs write it; the status sweep reads it and, while `freeze_active`, suspends nobody (CAND-35, decision 108). Global operational data with no tenant owner, same justification as `feature_prices`; listed in the `DATABASE_SCHEMA.md` exemptions on promotion (precedent: `platform.chatbot_provider_balance`, `docs/TENANT_ISOLATION_STRATEGY.md` § platform-operator data).

**Example:**

| merchant_profile_key | last_reconcile_ok_at | webhook_status | freeze_active | freeze_since |
|---|---|---|---|---|
| `BRL_ASAAS_IKARO_BR` | `2026-10-28T09:00Z` | `OK` | `false` | `NULL` |

### `billing.operator_audit` — who changed what

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `actor` | text NOT NULL | operator identifier (script/user) |
| `action` | text NOT NULL | `GRACE`, `SUSPEND` (reason `OPERATOR`), `UNSUSPEND` (only for an `OPERATOR` suspension), `SET_EXEMPT` (tenant-scoped actions only; there is no operator payment override or reactivation of a `NON_PAYMENT` suspension, and price-list changes are audited on `feature_price_versions`) |
| `payload` | jsonb NOT NULL | bounded; includes the reason |
| `occurred_at` | timestamptz NOT NULL | |

- Index `(tenant_id, occurred_at DESC)`. Append-only.

**Example:**

| tenant_id | actor | action | payload | occurred_at |
|---|---|---|---|---|
| `0190…t5` | `op:leonardo` | `SUSPEND` | `{"reason":"OPERATOR","note":"phishing hotsite reported"}` | `2026-11-02T15:20Z` |

## 3. Modified existing tables / settings

- `platform.tenants`: **no change.** `is_active` keeps meaning offboarding/deactivation; billing never flips it (a payment problem is not an offboarding).
- `tenants.settings.chatbot.*`: the per-tenant overrides (`llmProvider`, `llmModel`, caps) become **derived from the chatbot tier** (Platform maps tier → model + caps in code constants) instead of being set by a developer's DB update. No column change; a story removes the manual override path.
- `platform.hotsite_configs`: **no change** (`is_published` stays the manager's preference; effective value is computed — R7).
- `Slug` value object (`apps/backend/src/shared/value-objects/slug.vo.ts`): add length 3–30, no leading/trailing hyphen, and a reserved-word list with a typed error. Existing tenants are unaffected (`reconstitute()` skips validation).
- `TenantProvisioned` (event) gains `countryCode` and a small billing hint: `exempt`, optional feature subset and **`registrationId`** (decision 120) — no Google `sub`, tax id or terms in the payload. Verified in code: `eventVersion` is declared on the envelope but **never read by the bus** (routing is by `eventName` only; repo practice is additive fields), so there is no "v1 rejected" mechanism. In-flight outbox rows keep their stored payload; the Billing handler treats a payload without `countryCode` as *legacy*, skips it and lets the self-heal job repair it (decision 119). `ProvisionTenantUseCase` and `POST /internal/tenants` gain optional `exempt` and `registrationId`. No language parameter (language derives from country). A non-exempt US tenant is rejected while `FEATURE_FLAG_SIGNUP_US` is off. Consumers today: Staff, Notification seed, Booking location resource and the Platform audit handler — all unaffected by additive fields.
- Notification templates: new Billing template keys (pt-BR, en) as **platform-level** templates (`tenant_id` NULL, not copied per tenant and not tenant-editable; decision 100). Verified touch points per new template: a `NotificationTemplateKey` enum member, an `NOTIFICATION_TEMPLATE_KEY_MAPPING` entry (event name, recipient type, variables), entries in both `packages/i18n/locales/{pt-BR,en}/notifications.json` (content comes from these files, not from the DB row; a spec checks placeholder parity) and a migration inserting the NULL-tenant rows. Today's lookup is tenant-strict (`findAllByTriggerEvent(tenantId, …)`; only `findAllDefaults()` reads NULL rows), so story C6 adds a global-template lookup for Billing send use cases. Billing emails are still **sent for a tenant** (the log row has that tenant's `tenant_id` and the event's `event_id`).
- `NotificationLog.status` today is `PENDING | SENT | FAILED` (`notification-log.aggregate.ts`) backed by `VARCHAR(20)` and `CHK_notification_logs_status` (migration 1748200000010). The two new values (`SKIPPED_TENANT_SUSPENDED`, 24 chars; `SKIPPED_NOT_ALLOWLISTED`, 23) **do not fit**: the migration widens the column (e.g. `VARCHAR(40)`) and replaces the CHECK; type, aggregate and entity change together. The log key is `(tenant_id, event_id, notification_type, channel)` and `save()` upserts, so a skip row and a real send for the same key overwrite each other; and `saveLog` always calls `markSent()` and marks the inbox row processed. The suspension/allowlist gate therefore sits **before** `BaseNotificationUseCase` dispatches (it writes the `SKIPPED_*` log itself and marks the inbox row), never inside the dispatcher where a skip would be recorded as `SENT`.
- Non-production data: a seed script creates one tenant per billing state (main doc §5.3). It writes through the normal use cases, never directly into tables.

## 4. Migration ordering

1. Create schema `billing`, `CREATE EXTENSION IF NOT EXISTS btree_gist` (needed by the items exclusion constraint) and the tables, including `signup_registrations` and `provider_health` (expand only, no existing table touched).
2. Seed `feature_prices` and one `feature_price_versions` row each, `effective_from` = release date, from the **catalog approved in story A1** (BR launch list per decisions 77; US list only for non-production until decision 78 is closed).
3. Backfill existing tenants (CAND-21): `ACTIVE`, all features, `exempt = true` (real tenants created later start as `TRIALING` through CAND-01; Ikaro's own tenant is `exempt = true` too). Idempotent; per the migration-backfill rule the endpoints are not live traffic yet, but the backfill runs in the same release anyway so no tenant is ever without a row.
4. Add the Billing notification templates.
5. Deploy code with transient-lookup fail-open only; the publisher and the Billing handler ship in the same release. The bus does not version-route (see §3), so the handler itself tolerates a legacy payload without `countryCode` (skip + self-heal, decision 119). A successful read with no subscription is an alertable provisioning integrity failure and must not grant all features.
6. Terraform: Cloud Scheduler jobs (issue charges, status sweep [hourly], billing reminders, reconcile [daily + hourly at-risk], provider health and self-heal, provider-events purge, tenant purge; no ops digest, decision 107) **plus the Pub/Sub topics/subscriptions for every new `subscribe`/`registerTrigger` call site** (`infra/terraform/pubsub-catalog.json` is generated from them by `packages/infra-scripts/src/pubsub-catalog.ts`; push mode requires `PUBSUB_AUTO_CREATE=false`), Secret Manager entries (`ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, sandbox and live as separate secrets), and the **new** env vars `PLATFORM_OWNER_TENANT_SLUG`, `FEATURE_FLAG_SIGNUP_US`, `FEATURE_FLAG_BILLING_ENFORCEMENT`, `EMAIL_RECIPIENT_ALLOWLIST` (none exists today — verified; `FEATURE_FLAG_*` is a new convention next to plain switches like `OUTBOX_INLINE_DISPATCH_ENABLED`), each added to `env.validation.ts` and to the `packages/infra-scripts` env contract so CI checks them.

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
| `SubscriptionCancelled` | `subscriptionId`, `cancelAt`, `immediate` | Notification (email to the billing email) |
| `PlanChanged` | `subscriptionId`, `effectiveFrom`, `newMonthlyTotalMinor`, `added[]`, `removed[]` | Notification (email to the billing email) |
| `BillingReminderDue` | `kind` (`PLAN_CONFIRMATION` \| `TRIAL_ENDING` \| `CHARGE_DUE_SOON` \| `CHARGE_OVERDUE`), `daysOffset`, `chargeId?`, `paymentUrl?` | Notification (dunning email, CAND-34); `PLAN_CONFIRMATION` asks an unconfirmed trial tenant to confirm its first paid plan (decision 115) |
| `TenantPurgeWarning` | `subscriptionId`, `daysBefore` (30 or 7), `purgeAt` | Notification (email to the manager; Billing template, exempt from the gate) |
| `SubscriptionPriceChangeAnnounced` | `featureKey`, `tier`, `oldAmountMinor`, `newAmountMinor`, `currency`, `effectiveFrom`, `firstAffectedDueDate`, `newMonthlyTotalMinor` — **one event per affected tenant** (the envelope requires `tenantId`, so a platform-wide price change fans out per tenant) | Notification (email to managers) |
| `TenantPurgeRequested` | `tenantId`, `reason` (`SUSPENSION_AGE` \| `SELF_SERVICE_DISCARD` \| `OPERATOR_REQUEST`) | every bounded context (each deletes its own data), storage cleanup |
| `TenantPurgeContextCompleted` | `purgeJobId`, `participant`, `completedAt` | Billing purge coordinator |

Ikaro sends every billing email itself (decision 59); no handler is conditional on provider emails.

## 6. Final decisions carried to the domain document

Entitlement = `SUSPENDED` none, `TRIALING` all, otherwise the active items (no separate aggregate, no trial rows, items untouched by suspension); plan rows are non-overlapping time windows; price list is global, items carry no price, and charge lines snapshot the version selected by service-period start; full payment reversal suspends immediately; cancellation cancels future unpaid invoices immediately; purge execution is a separate coordinator; `exempt` protects Ikaro's own tenant; automatic billing is adapter-backed but deferred until verified; fiscal history is retained after purge.

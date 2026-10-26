# Discovery: Tenant Billing — Candidate Use Cases

**Status:** Discovery — candidate/speculative. Labeled `CAND-XX`, never `UC-XXX`, so this list cannot collide with the canonical index in `docs/USE_CASES.md`. Promotion assigns real UC numbers.

**Companion docs:** `tenant-billing.md` (domain model and rules R1–R10) · `tenant-billing_DATA_MODEL.md` · `tenant-billing_API.md` · `tenant-billing_MODULE.md` · `prototype/` (start at `index.html`).

## Format

Same fields as `docs/USE_CASES.md`: Actor / Preconditions / Trigger / Main Flow / Alternative Flows / Postconditions / Events Triggered. "Operator" = Ikaro staff acting through scripts / internal endpoints (no backoffice screen in v1); every operator action records who, when and why. Status names: `TRIALING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED` (reason `NON_PAYMENT` | `CANCELED`).

## Index

| Group | CANDs |
|---|---|
| A — Subscription and pricing (operator / system reaction) | 01–07 |
| B — System jobs and provider integration | 08–11 |
| C — Manager billing | 12–14, 28–31 |
| D — Enforcement across the system | 15–21 |
| E — Self-signup, trial, clean-up | 22–27 |

---

## Group A — Subscription and pricing

### **CAND-01: Billing Starts a Trial Subscription When a Tenant Is Provisioned**
- **Actor:** System (reacting to `TenantProvisioned`).
- **Preconditions:** Tenant exists. `FeaturePrice` rows exist for the tenant's country.
- **Trigger:** `TenantProvisioned` event (from the operator script or from self-signup, CAND-22).
- **Main Flow:**
  1. Handler calls one use case with `tenantId`, `countryCode` and `correlationId`.
  2. Use case creates the `Subscription` (`TRIALING`, `trialEndsAt = now + 14 days`, currency from the country's price rows, cycle `MONTHLY`).
  3. For every feature it creates an item (chatbot at tier `BASIC`); items carry no price. Ikaro's own tenant (slug = `PLATFORM_OWNER_TENANT_SLUG`) gets `status ACTIVE` and `exempt = true`.
  4. It creates an empty `BillingAccount`, then invalidates the access cache after commit.
- **Alternative Flows:**
  - **A1: Subscription already exists** (event redelivered) → no-op; idempotent on `UNIQUE(tenant_id)`.
  - **A2: No `FeaturePrice` rows for the country** → the use case fails loudly (error logged, event retried); the tenant stays without a subscription row and **fails open** until fixed; an ops alert is sent.
  - **A3: Provisioning script passes an explicit feature subset** → items are created from that subset; the others are not created.
- **Postconditions:** Tenant has a `TRIALING` subscription with all items.
- **Events Triggered:** None (the audit log is the `TenantProvisioned` handler itself).

### **CAND-02: Operator Adds a Feature to a Tenant** — *WITHDRAWN 2026-10-26 (managers add features themselves via CAND-31; no per-tenant prices). Number kept so references stay valid.*
- **Actor:** Operator.
- **Preconditions:** Tenant has a subscription (any status except cancelled-and-purged).
- **Trigger:** Operator runs the add-feature script/endpoint with `tenantId`, `featureKey`, optional `tier`, optional `unitPriceMinor` override, `reason`.
- **Main Flow:**
  1. System validates dependencies (CAND dependency table) and that the feature is not already active.
  2. It copies the list price for (feature, country, tier, cycle) into a new item unless an override is given.
  3. The entitlement switches on **now**; the price is billed **from the next cycle**.
  4. Cache invalidated after commit; operator audit row written.
- **Alternative Flows:**
  - **A1: Dependency unmet** (e.g. `LOYALTY` without `BOOKING`) → rejected, error names the missing feature.
  - **A2: Feature already active** → rejected.
  - **A3: No list price for (feature, country, tier)** → rejected unless an override price is supplied.
  - **A4: Tenant `SUSPENDED`** → allowed (item created) but the entitlement has no effect until reactivation.
  - **A5: Currency of an override differs from the subscription currency** → rejected.
- **Postconditions:** Item active; next charge includes the line.
- **Events Triggered:** None.

### **CAND-03: Operator Removes a Feature from a Tenant** — *WITHDRAWN 2026-10-26 (managers do this via CAND-31). Text kept for history.*
- **Actor:** Operator.
- **Preconditions:** Item is active.
- **Trigger:** Operator runs remove-feature with `tenantId`, `featureKey`, optional `immediate`, `reason`.
- **Main Flow:**
  1. System checks no other active feature depends on it.
  2. It sets the item's `endsAt` to the end of the paid period (or now, if `immediate`).
  3. At `endsAt` the entitlement lapses; the manager's saved settings for the feature are untouched (R2).
- **Alternative Flows:**
  - **A1: A dependent feature is active** (e.g. removing `BOOKING` while `LOYALTY` is active) → rejected; operator must remove the dependent first.
  - **A2: Last remaining feature** → rejected (a subscription needs at least one item); use CANCEL/suspend instead.
  - **A3: Item already ended** → no-op.
- **Postconditions:** Feature entitlement ends at the chosen moment; data remains stored.
- **Events Triggered:** None.

### **CAND-04: Operator Changes a Tenant's Item Price** — *WITHDRAWN 2026-10-26 (no per-tenant prices; list changes via CAND-07 apply from the next issued charge). Text kept for history.*
- **Actor:** Operator.
- **Preconditions:** Item active.
- **Trigger:** Operator runs change-price with `tenantId`, `featureKey`, `unitPriceMinor`, `reason`.
- **Main Flow:** *(withdrawn — see title.)* Original idea kept for history: end the current item and add a new item row with the new price; already-issued charges unaffected.
- **Alternative Flows:**
  - **A1: Negative price** → rejected. **Zero price** → allowed (granted feature).
  - **A2: A charge for the next period is already issued** → the new price applies from the period after; a warning is returned.
- **Postconditions:** Next unissued charge uses the new price.
- **Events Triggered:** None.

### **CAND-05: Operator Marks a Charge Paid Manually**
- **Actor:** Operator.
- **Preconditions:** Charge in `PENDING`/`OVERDUE`.
- **Trigger:** Operator marks paid with `chargeId`, `method`, `paidAt`, `reason` (e.g. bank transfer outside the provider).
- **Main Flow:** In one transaction: the charge becomes `PAID` (method `MANUAL`); if the subscription was `PAST_DUE`/`SUSPENDED`, it is re-dated, a new period starts at `paidAt`, status becomes `ACTIVE`; row lock on the subscription. Cache invalidated after commit.
- **Alternative Flows:**
  - **A1: Charge already paid / `REFUNDED` / `CANCELED`** → rejected.
  - **A2: Provider-side charge still open** → the operator is warned to cancel it at the provider; the reconcile job (CAND-11) flags drift.
- **Postconditions:** Tenant active again.
- **Events Triggered:** `ChargePaid`; `SubscriptionReactivated` if the status changed.

### **CAND-06: Operator Extends Grace, Suspends or Reactivates a Tenant**
- **Actor:** Operator.
- **Preconditions:** Subscription exists.
- **Trigger:** Operator runs grace/suspend/reactivate with `tenantId`, `reason`, and for grace a `graceUntil`.
- **Main Flow:** Grace sets `graceUntil` (the sweep then waits until that date before suspending). Suspend sets `SUSPENDED` with reason `NON_PAYMENT`. Reactivate sets `ACTIVE` and starts a new period **without** requiring a payment (e.g. a negotiated gesture).
- **Alternative Flows:**
  - **A1: Grace on a tenant that is not `PAST_DUE`** → rejected.
  - **A2: Reactivate while a provider charge is still open** → the open charge is cancelled at the provider through the port.
- **Postconditions:** Status changed, audited.
- **Events Triggered:** `SubscriptionSuspended` / `SubscriptionReactivated`.

### **CAND-07: Operator Maintains the List Prices (`FeaturePrice`)**
- **Actor:** Operator.
- **Preconditions:** None.
- **Trigger:** Operator creates a price (`featureKey`, `countryCode`, `tier`, `cycle`, first `amountMinor`, `currency`) or schedules a price change (`amountMinor`, `effectiveFrom`, `reason`) through the operator-only endpoint (optionally `dryRun`).
- **Main Flow:** A dry run lists the affected tenants (`ACTIVE`/`PAST_DUE`, active item for that feature and tier in that country, not `exempt`) without saving. Without dry run, one transaction writes a dated `feature_price_versions` row and one `SubscriptionPriceChangeAnnounced` outbox event per affected tenant. The first charge issued on or after `effectiveFrom` uses the new amount (R4); already-issued and paid charges are untouched. The Plano tab and public prices show the current amount and the upcoming one.
- **Alternative Flows:**
  - **A1: Currency does not match the country** (BR must be BRL, US must be USD in v1) → rejected.
  - **A2: Deactivating a price in use** → allowed; existing items unaffected; new subscriptions cannot use it.
  - **A3: Cycle other than `MONTHLY`** → rejected in v1.
  - **A4: Increase with less than `PRICE_CHANGE_MIN_NOTICE_DAYS` (default 30) of notice** → rejected (`BILLING_PRICE_NOTICE_TOO_SHORT`); decreases may take effect today.
  - **A5: A pending (not yet effective) version already exists for this price** → it is superseded by the new one and managers are notified again with the new date.
  - **A6: No affected tenants** → version saved, no events.
  - **A7: Same amount as the current one** → rejected (nothing to change).
- **Postconditions:** Price available / scheduled; affected managers notified.
- **Events Triggered:** `SubscriptionPriceChangeAnnounced` (one per affected tenant).

---

## Group B — System jobs and provider integration

### **CAND-08: System Issues the Next Charge**
- **Actor:** System (Cloud Scheduler → `/cron/billing-issue-charges`).
- **Preconditions:** Subscription `TRIALING` or `ACTIVE`, not cancelling, due date within 10 days.
- **Trigger:** Daily cron.
- **Main Flow:**
  1. For each due subscription (standalone index on `(status, next_due_date)`), compute the lines from the active items for the next period, reading each amount from the price **version in force on the issue date**.
  2. Insert the `Charge` and its lines (`UNIQUE(tenant_id, subscription_id, period_start)` makes a re-run idempotent), then — outside the DB transaction — ask the provider (via the port) to create the charge and store its id and payment link.
- **Alternative Flows:**
  - **A1: Subscription is `exempt`** (Ikaro's own tenant, staging) → no charge created.
  - **A6: No active price row for an item's (feature, tier, country, cycle)** → the charge is not issued, an ops alert is sent (prices are never deleted while referenced).
  - **A2: Provider call fails** → charge stays `PENDING` without a provider id; the next run retries; an ops alert after N failures.
  - **A3: Job runs twice** → no duplicates.
  - **A4: Tenant `SUSPENDED`** → skipped (no charges while suspended).
  - **A5: Subscription is cancelling (`cancelAt` set)** → no charge for periods after `cancelAt`.
- **Postconditions:** Next period's charge exists with a payment link.
- **Events Triggered:** `ChargeIssued`.

### **CAND-09: System Handles a Provider Webhook**
- **Actor:** Provider (Asaas) → public BFF route → internal backend.
- **Preconditions:** Webhook configured with a token; secret in Secret Manager.
- **Trigger:** HTTP POST with `asaas-access-token`.
- **Main Flow:**
  1. BFF validates the token (timing-safe) and forwards the raw body to the internal endpoint.
  2. Backend resolves the tenant from the provider customer id; inserts `provider_events(provider, event_id)` — if it already exists, return 200 (duplicate).
  3. A normalizing adapter maps the payment event to `PaymentConfirmed` / `PaymentOverdue` / `PaymentRefunded` / `PaymentChargeback` / auto-billing authorized / deactivated.
  4. One use case applies it: charge status updates; `PAID` on a `PAST_DUE`/`SUSPENDED` subscription reactivates it (row lock); `OVERDUE` moves `ACTIVE` → `PAST_DUE` and sets `pastDueSince`.
  5. Respond 200 after the event row is persisted; further work is asynchronous.
- **Alternative Flows:**
  - **A1: Wrong/missing token** → 401, nothing stored.
  - **A2: Unknown provider customer** → 200, logged, no state change.
  - **A3: Out-of-order event** (paid after cancelled) → applied only if legal for the charge's current status; otherwise logged and left to reconcile.
  - **A4: Backend down** → non-2xx so the provider retries (its queue pauses after 15 consecutive failures; reconcile covers the gap).
  - **A5: Refund / chargeback** → charge status `REFUNDED` / `CHARGEBACK`; **no automatic suspension** (operator decides).
- **Postconditions:** Local state mirrors the provider.
- **Events Triggered:** `ChargePaid`, `SubscriptionPastDue`, `SubscriptionReactivated` as applicable.

### **CAND-10: System Sweeps Statuses**
- **Actor:** System (`/cron/billing-status-sweep`).
- **Preconditions:** None.
- **Trigger:** Daily cron.
- **Main Flow:** (a) `TRIALING` with `trialEndsAt` passed and its first charge unpaid → `PAST_DUE`; (b) `PAST_DUE` older than 14 days (or past `graceUntil`) → `SUSPENDED` (reason `NON_PAYMENT`); (c) `cancelAt` reached → `SUSPENDED` (reason `CANCELED`) and open provider charges cancelled; (d) a trial that was paid converts to `ACTIVE` through CAND-09 and is not touched here.
- **Alternative Flows:**
  - **A1: Job runs twice** → idempotent (status checks).
  - **A2: A payment arrives during the sweep** → row lock; the paid state wins.
  - **A3: Provider cancel call fails** → the local state still changes; the retry is picked up by reconcile.
- **Postconditions:** Statuses consistent with the ladder.
- **Events Triggered:** `SubscriptionPastDue`, `SubscriptionSuspended`.

### **CAND-11: System Reconciles Charges with the Provider**
- **Actor:** System (`/cron/billing-reconcile`).
- **Preconditions:** Provider configured.
- **Trigger:** Daily cron.
- **Main Flow:** For every open or recently changed charge, fetch its provider status and apply any difference through the same use case as CAND-09. Report drift counts.
- **Alternative Flows:**
  - **A1: Provider unreachable** → job fails, ops alert, retried next run.
  - **A2: Local charge has no provider id older than 24h** → re-attempt creation or alert.
  - **A3: Drift found** → fixed, counted, ops alert if above a threshold.
- **Postconditions:** Missed webhooks do not leave a paying tenant locked out.
- **Events Triggered:** As CAND-09.

---

## Group C — Manager billing

### **CAND-12: Manager Views the Billing Page**
- **Actor:** Staff (MANAGER). Every manager of the tenant.
- **Preconditions:** Logged in; tenant has a subscription.
- **Trigger:** Manager opens Billing (or is redirected there when suspended).
- **Main Flow:** The page shows status, trial end or next due date, active features with their tier and price, total, the open charge with **Pagar agora** (opens the provider's hosted page), the automatic-billing status, billing identity, paginated charge history (statuses `PENDING`/`PAID`/`OVERDUE`/`FAILED`/`CANCELED`/`REFUNDED`/`CHARGEBACK`), cancel link, and "Falar com a gente".
- **Alternative Flows:**
  - **A1: Loading / load error with retry** (see prototype variants).
  - **A2: No charges yet** (trial) → empty-history message.
  - **A3: Payment just made, status not yet updated** → "pagamento recebido, reativando…".
  - **A4: Payment link expired / failed** → regenerate (CAND-14).
  - **A5: `SUSPENDED`** → this is the only reachable page; other navigation items are disabled.
  - **A6: Staff or customer opens the route** → 403/redirect (manager only).
- **Postconditions:** None (read).
- **Events Triggered:** None.

### **CAND-13: Manager Updates the Billing Identity**
- **Actor:** Staff (MANAGER).
- **Preconditions:** Logged in.
- **Trigger:** Manager edits identity on the billing page.
- **Main Flow:** Fields (all optional): tax-ID type (`CNPJ`/`CPF`/`OTHER`) and number, legal name, billing email, address. The form is rendered from the billing country's `CountrySpec` — labels, placeholders, formats and fields follow the country (BR: Logradouro, Número, Complemento, Bairro, Cidade, UF, CEP with ViaCEP autofill; US: Street, Number, Apt/Suite, City, State, ZIP Code, no neighbourhood) in the tenant's language. System validates by country (shared `Address` value object + `AddressSpec`) and saves; synced to the provider customer when a charge is next issued.
- **Alternative Flows:**
  - **A1: Invalid CNPJ/CPF check digits** → field error.
  - **A2: Invalid email** → field error.
  - **A3: US tenant** → no CNPJ/CPF type offered; address labels and formats in English.
  - **A5: Postal code or state in the wrong format for the country** → field error from the country's rule (e.g. CEP `00000-000`, US ZIP `90210`).
  - **A4: Save fails** → error message, form kept.
- **Postconditions:** Identity stored; never blocks a payment (R5).
- **Events Triggered:** None.

### **CAND-14: Manager Pays an Open Charge**
- **Actor:** Staff (MANAGER).
- **Preconditions:** Open charge with a payment link.
- **Trigger:** Manager clicks **Pagar agora**.
- **Main Flow:** The BFF returns the provider's hosted payment URL; the manager pays by card, Pix or boleto on the provider's page; the webhook (CAND-09) confirms and the status updates.
- **Alternative Flows:**
  - **A1: Link expired** → `POST .../payment-link` asks the provider (port) for a new link.
  - **A2: Payment pending** (Pix/boleto compensation) → page shows "pagamento em processamento".
  - **A3: Payment fails** → charge stays open; page explains and offers retry.
  - **A4: Charge already paid** → the page refreshes to the paid state.
- **Postconditions:** Charge paid; tenant reactivated if it was `PAST_DUE`/`SUSPENDED`.
- **Events Triggered:** (via CAND-09) `ChargePaid`, `SubscriptionReactivated`.

---

## Group D — Enforcement across the system

### **CAND-15: System Resolves a Tenant's Access (`TenantAccessPort`)**
- **Actor:** Any request, job or handler.
- **Preconditions:** None.
- **Trigger:** A guard, use case, handler or cron needs "is tenant operational / is feature X entitled".
- **Main Flow:** Caller passes an explicit `tenantId` to the shared port; Billing's cached adapter returns `{ status, suspensionReason, features: [{ key, tier }] }`. `operational = status != SUSPENDED`; `entitled(f) = operational && f in features`.
- **Alternative Flows:**
  - **A1: No subscription row** → fail open (operational, all features) + a metric/log.
  - **A2: Lookup error** → fail open + log.
  - **A3: Cache stale** → invalidated best-effort after commit; TTL bounds staleness.
  - **A4: Bulk need** (a cron scanning all tenants) → batch query for suspended tenant ids, never one call per tenant.
- **Postconditions:** None.
- **Events Triggered:** None.

### **CAND-16: Login Routing by Role When Suspended**
- **Actor:** Manager / Staff / Customer.
- **Preconditions:** Tenant `SUSPENDED`.
- **Trigger:** Login or any navigation.
- **Main Flow:** Login itself is never blocked. After login: manager → billing page only (BFF guard rejects other routes; web `proxy.ts` and dashboard layouts redirect); staff → suspended notice; customer → account with "Empresa inativa" badge, history viewable, open-booking detail blocked, new bookings blocked.
- **Alternative Flows:**
  - **A1: Direct URL to a blocked page** → redirect to the role's allowed page.
  - **A2: JWT issued before suspension** → the guard checks current access, not the token claims, so it takes effect immediately (cache TTL bounded).
  - **A3: Customer of a tenant that becomes `PAST_DUE`** → no change (full access).
  - **A4: Staff with several tenants** → the staff tenant-selection list still shows the suspended tenant, marked "Suspensa"; selecting it shows the staff suspended notice. `GET /auth/staff-tenants` returns a per-tenant `operational` flag. (No customer selector exists today; a future one follows the same rule.)
- **Postconditions:** None.
- **Events Triggered:** None.

### **CAND-17: Hotsite Is Effectively Unpublished When Suspended**
- **Actor:** Visitor.
- **Preconditions:** Tenant `SUSPENDED`.
- **Trigger:** Visitor opens the hotsite, booking page, sitemap or robots.
- **Main Flow:** Effective published = `isPublished && operational` in the manifest, the booking page check, `robots`/noindex and the published-hotsites sitemap list. The page shows "Página não publicada" (reason-neutral) and keeps the top bar with team login and customer login.
- **Alternative Flows:**
  - **A1: Manager had already unpublished** → stays unpublished after reactivation (R7).
  - **A2: Stale cached manifest** → the existing on-demand revalidation is triggered on suspend/reactivate.
  - **A3: Unknown slug** → the existing not-found behavior, unchanged.
- **Postconditions:** No new bookings via the public site.
- **Events Triggered:** None.

### **CAND-18: Notification Gate Skips Suspended Tenants (Billing Emails Exempt)**
- **Actor:** System (Notification send path).
- **Preconditions:** None.
- **Trigger:** Any notification about to be sent.
- **Main Flow:** The send path asks the access port for the tenant; if suspended it skips the send and records `SKIPPED_TENANT_SUSPENDED` (not replayed later); templates belonging to Billing (R10) are exempt.
- **Alternative Flows:**
  - **A1: Billing email but the manager has no address** → logged, ops alert.
  - **A2: Access lookup error** → fail open (send).
- **Postconditions:** No tenant/customer/staff messages while suspended.
- **Events Triggered:** None.

### **CAND-19: Billing Emails to the Manager**
- **Actor:** System (one event handler per event; each handler calls exactly one use case).
- **Preconditions:** Template exists in the tenant's language (pt-BR/en) — seeded for new tenants and backfilled for existing ones.
- **Trigger:** `ChargeIssued`, `ChargePaid`, `SubscriptionPastDue`, `SubscriptionSuspended`, `SubscriptionReactivated` (the first three are dropped if the provider already emails payers), and `SubscriptionPriceChangeAnnounced` ("o valor de X passa de R$ 39 para R$ 49 a partir de 10/12; seu novo total mensal será R$ …").
- **Main Flow:** Resolve recipients (billing email, else the tenant's managers), render, send, log.
- **Alternative Flows:**
  - **A1: Template missing** → fail with alert; no silent drop.
  - **A2: Delivery fails** → existing notification-log retry/failed handling.
  - **A3: Event redelivered** → dedupe on `eventId`.
- **Postconditions:** Manager informed.
- **Events Triggered:** None.

### **CAND-20: Entitlement Enforcement per Feature and Locked UI**
- **Actor:** Any user / API caller.
- **Preconditions:** Tenant lacks the entitlement for a feature.
- **Trigger:** User opens the feature in the dashboard, or calls its API directly.
- **Main Flow:** Enforcement is declarative (main doc §5.1): `@RequiresFeature` on controllers, subscription metadata for event handlers, one tenant-scoped job helper for crons; no feature check is written inside a use case. A guard fails with a typed error (`FEATURE_NOT_ENTITLED`, in both locale files); the dashboard shows the item **locked** with an upsell ("Falar com a gente") and keeps the manager's saved settings; public endpoints (chatbot, lead form, booking) refuse.
- **Alternative Flows:**
  - **A1: Direct API call** → refused with the typed error.
  - **A2: Feature lost while the manager had it enabled** → preference preserved; feature inert; regained entitlement resumes it.
  - **A3: Chatbot tier changes** → the chatbot resolves tier → model + caps on the next conversation.
  - **A4: Cron-driven feature** (recurring-renewal reminder) → skipped for tenants without the entitlement.
- **Postconditions:** No unentitled feature use.
- **Events Triggered:** None.

### **CAND-21: Backfill Existing Tenants**
- **Actor:** System (migration/script).
- **Preconditions:** `billing` schema migrated. No real tenants exist; staging tenants are test data.
- **Trigger:** Release.
- **Main Flow:** For every tenant without a subscription: create an `ACTIVE`, `exempt = true` subscription with all features, plus a billing account; idempotent.
- **Alternative Flows:**
  - **A1: Subscription already exists** → skipped.
  - **A2: Tenant country has no price rows** → uses the tenant's `localization.country` and `localization.currency` on the exempt subscription.
- **Postconditions:** No tenant is suspended by the release.
- **Events Triggered:** None.

---

## Group E — Self-signup, trial, clean-up

### **CAND-22: Visitor Signs Up for a Trial**
- **Actor:** Guest (anyone).
- **Preconditions:** Ikaro's tenant hotsite has `TRIAL_SIGNUP_CTA` enabled; Turnstile configured.
- **Trigger:** Visitor clicks the CTA, lands on `/ikaro-trial`.
- **Main Flow:**
  1. Page shows feature descriptions and the price table (BR/US switch; CAND-23 supplies prices).
  2. Visitor passes Turnstile and signs in with Google (verified email + name).
  3. Visitor fills business name, slug, country (BR|US), language, and accepts Terms and Privacy.
  4. System re-validates server-side, then calls the existing `ProvisionTenantUseCase` (Platform) with the Google email as first manager; the accepted terms version/timestamp is stored.
  5. `TenantProvisioned` triggers Staff (first manager) and Billing (CAND-01); the visitor lands on the welcome page / dashboard.
- **Alternative Flows:**
  - **A1: Slug taken / reserved / invalid** → field error with suggestions.
  - **A2: Turnstile fails** → retry screen.
  - **A3: This Google account already has an active trial** → "Você já tem um teste ativo" + contact link.
  - **A4: Rate limit exceeded** (per IP/day) → friendly "tente mais tarde".
  - **A5: Terms not accepted** → blocked.
  - **A6: Provisioning fails halfway** → transaction rolled back, nothing half-created, retry offered.
  - **A7: Country without prices, or US while `FEATURE_FLAG_SIGNUP_US` is off (no Stripe adapter yet)** → not offered.
  - **A8: Google account already manages other tenants** → allowed (multi-tenant staff); trial rule A3 still applies.
- **Postconditions:** New tenant with a trial and a first manager.
- **Events Triggered:** `TenantProvisioned` (existing).

### **CAND-23: Visitor Reads Public Prices and Checks a Slug**
- **Actor:** Guest.
- **Preconditions:** None.
- **Trigger:** `/ikaro-trial` loads, or the visitor types a slug.
- **Main Flow:** `GET /v1/public/billing/prices?country=` returns active list prices; `GET /v1/public/signup/slug-availability?slug=` returns available/taken/reserved/invalid.
- **Alternative Flows:**
  - **A1: Prices fail to load** → error state with retry; signup stays possible.
  - **A2: Race between check and submit** → CAND-22 A1 handles it.
  - **A3: Enumeration abuse** → throttled, Turnstile-protected.
- **Postconditions:** None.
- **Events Triggered:** None.

### **CAND-24: First-Run Onboarding After Signup**
- **Actor:** Staff (MANAGER, new).
- **Preconditions:** Tenant just provisioned.
- **Trigger:** First dashboard visit.
- **Main Flow:** The welcome page shows the trial banner and a checklist (publish the site, add services, set hours), reusing the existing onboarding bootstrap / presets work where it exists.
- **Alternative Flows:**
  - **A1: Manager skips** → checklist stays visible until done or dismissed.
  - **A2: Presets not yet available** → plain checklist only.
- **Postconditions:** Tenant has a usable starting point.
- **Events Triggered:** None.

### **CAND-25: Trial Banner and First Charge**
- **Actor:** Staff (MANAGER).
- **Preconditions:** `TRIALING`.
- **Trigger:** Any dashboard page.
- **Main Flow:** Banner "Faltam N dias do seu teste" links to billing and prompts the manager to review the plan (CAND-31); 10 days before the end the first charge is issued from the current selection (CAND-08) and the manager is emailed.
- **Alternative Flows:**
  - **A1: Trial ends the same day the charge is issued** → charge issued immediately, normal due date.
  - **A2: Trial ended unpaid** → `PAST_DUE` banner (CAND-10).
- **Postconditions:** None.
- **Events Triggered:** `ChargeIssued` (via CAND-08).

### **CAND-31: Manager Changes the Plan (Self-Service)**
- **Actor:** Staff (MANAGER).
- **Preconditions:** Subscription not `SUSPENDED`.
- **Trigger:** Manager opens the "Plano" tab on the billing page.
- **Main Flow:**
  1. The tab lists every feature with its price for the tenant's country, a toggle, the chatbot tier choice (Básico/Plus), dependency hints and a live total.
  2. Manager changes the selection; the page previews each change ("entra agora, cobrado a partir de 10/11" / "sai em 10/11") and the new total.
  3. Manager saves (single primary action). System validates dependencies, applies additions (item starts now, `first_billed_at` null) and removals (`ends_at` = end of paid period), and if the next charge is already issued and unpaid, cancels and re-issues it (provider call after commit).
- **Alternative Flows:**
  - **A1: Dependency unmet / dependents active** (Loyalty without Booking; removing Booking while Loyalty is active) → whole selection rejected with the specific message; nothing saved.
  - **A2: Removing a feature not yet charged once** → blocked with "disponível para remover a partir de dd/mm" (the add-use-remove rule); not applied during the trial.
  - **A3: `PAST_DUE`** → additions disabled, removals allowed. **`SUSPENDED`** → plan tab read-only ("reative para alterar o plano").
  - **A4: Trial** → changes immediate and free; prompt to review before the first charge.
  - **A5: Empty selection** → rejected (at least one feature).
  - **A6: No list price for the country/tier** → feature shown as unavailable.
  - **A7: Next charge already paid** → change applies from the following period; the page says so.
  - **A8: Provider re-issue fails** → local change saved, charge re-issue retried; reconcile flags drift.
  - **A9: Save error** → message, selection kept.
  - **A10: Cancellation scheduled (`cancelAt` set)** → plan tab read-only ("reative a assinatura para alterar o plano").
- **Postconditions:** Items updated; entitlements follow immediately for additions.
- **Events Triggered:** None (a re-issued charge raises `ChargeIssued`).

### **CAND-26: Manager Configures the `TRIAL_SIGNUP_CTA` Module (Ikaro's Tenant Only)**
- **Actor:** Staff (MANAGER of the Ikaro tenant).
- **Preconditions:** Tenant slug = `PLATFORM_OWNER_TENANT_SLUG`.
- **Trigger:** Manager edits the hotsite layout.
- **Main Flow:** The editor offers the module; manager sets title, optional text, button label, presentation; saves; the public hotsite renders the CTA linking to `/ikaro-trial`.
- **Alternative Flows:**
  - **A1: Any other tenant tries to add it** (API call) → layout rules reject it.
  - **A2: Invalid data** (empty button label, title too long) → validation error.
  - **A3: Module disabled** → not rendered.
- **Postconditions:** CTA visible on the Ikaro hotsite.
- **Events Triggered:** Existing hotsite-config events.

### **CAND-27: System Erases Tenants Left Suspended Too Long**
- **Actor:** System (`/cron/billing-tenant-purge`).
- **Preconditions:** Tenant `SUSPENDED` for ≥ 90 days (canceled or never paid) or ≥ 180 days (paid before and lapsed).
- **Trigger:** Daily cron.
- **Main Flow:**
  1. At 30 and 7 days before, a warning email goes to the manager (Billing template, exempt from the gate).
  2. At the deadline the job publishes `TenantPurgeRequested`; each bounded context deletes its own data for that `tenantId` (idempotent), storage `tenants/<id>/` is removed, the provider customer/subscription is cancelled, the slug is released.
  3. Billing keeps the anonymized charge history for fiscal retention.
- **Alternative Flows:**
  - **A1: Tenant reactivated before the deadline** → clock cleared.
  - **A2: One context's deletion fails** → the purge is retried; the tenant is marked `PURGING` and stays inaccessible; ops alert.
  - **A3: Provider cancellation fails** → retried; does not block local erasure.
  - **A4: Ikaro's own tenant** → never purged (guarded).
- **Postconditions:** Tenant data erased; slug free.
- **Events Triggered:** `TenantPurgeRequested`.

### **CAND-28: Manager Cancels the Subscription**
- **Actor:** Staff (MANAGER).
- **Preconditions:** `ACTIVE` / `PAST_DUE` / `TRIALING`.
- **Trigger:** Manager clicks "Cancelar assinatura".
- **Main Flow:** Confirmation screen states: access continues until the end of the paid period, **nothing will be refunded**, and the clean-up policy (90/180 days). On confirm, `cancelAt = end of paid period`; no further charges are issued; the page shows "Cancelada — acesso até dd/mm" with **Reativar**. At `cancelAt` the sweep suspends the tenant with reason `CANCELED`.
- **Alternative Flows:**
  - **A1: Already cancelling** → shows the scheduled state.
  - **A2: Provider cancel fails** → local state is saved and reconciled later; the manager sees success only after the local save.
  - **A3: Trial tenant cancels** → effective immediately (nothing was paid).
  - **A4: Cancel error** → error message, retry.
- **Postconditions:** Cancellation scheduled.
- **Events Triggered:** None until `SubscriptionSuspended` at `cancelAt`.

### **CAND-29: Manager Reactivates a Cancelled or Suspended Subscription**
- **Actor:** Staff (MANAGER).
- **Preconditions:** Cancelling, or `SUSPENDED` (either reason), before the purge.
- **Trigger:** Manager clicks "Reativar assinatura" / pays the open charge.
- **Main Flow:** If still within the paid period, `cancelAt` is simply cleared. If suspended, one new charge for one month is created (or the open overdue charge is re-dated); on payment the status becomes `ACTIVE` and a new period starts at payment; no months are owed for the gap.
- **Alternative Flows:**
  - **A1: Data already purged** → not possible; a new signup is required (contact Ikaro for the trial rule).
  - **A2: Payment not completed** → remains suspended.
  - **A3: Provider charge creation fails** → error with retry.
- **Postconditions:** Tenant active.
- **Events Triggered:** `ChargeIssued`, `ChargePaid`, `SubscriptionReactivated`.

### **CAND-30: Manager Enables or Disables Automatic Charging**
- **Actor:** Staff (MANAGER).
- **Preconditions:** Provider supports it for the tenant's currency (BRL via Asaas).
- **Trigger:** Manager clicks "Ativar cobrança automática" / "Desativar".
- **Main Flow:** BFF asks the provider (port) for a hosted authorization URL (saved card, or Pix Automático approval in the bank app); the manager completes it on the provider's page; the webhook marks automatic charging active; the page shows "Cartão final 4242" / "Pix Automático ativo". Disabling asks the provider to revoke it. The manual payment link keeps working in every case.
- **Alternative Flows:**
  - **A1: Authorization not completed** → status "pendente" with a way to restart.
  - **A2: Provider error** → message, retry.
  - **A3: Authorization later revoked at the bank** → webhook sets it inactive; next charge falls back to the manual link.
  - **A4: USD tenant** → option hidden until a Stripe adapter exists.
- **Postconditions:** Subsequent charges are collected automatically.
- **Events Triggered:** None. *(Built as a later slice; depends on confirming the Asaas card/Pix flow — see open threads.)*

# Discovery: Tenant Billing — Candidate Use Cases

**Status:** Discovery — candidate/speculative. Labeled `CAND-XX`, never `UC-XXX`, so this list cannot collide with the canonical index in `docs/USE_CASES.md`. Promotion assigns real UC numbers.

**Companion docs:** `tenant-billing.md` (domain model and rules R1–R12) · `tenant-billing_DATA_MODEL.md` · `tenant-billing_API.md` · `tenant-billing_MODULE.md` · `prototype/` (start at `index.html`).

## Format

Same fields as `docs/USE_CASES.md`: Actor / Preconditions / Trigger / Main Flow / Alternative Flows / Postconditions / Events Triggered. "Operator" = Ikaro staff acting through scripts / internal endpoints (no backoffice screen in v1); every operator action records who, when and why. Status names: `TRIALING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED` (reason `NON_PAYMENT` | `CANCELED` | `PAYMENT_REVERSED`).

## Index

| Group | CANDs |
|---|---|
| A — Subscription and pricing (operator / system reaction) | 01–07, 32 |
| B — System jobs and provider integration | 08–11 |
| C — Manager billing | 12–14, 28–31 |
| D — Enforcement across the system | 15–21 |
| E — Self-signup, trial, clean-up | 22–27 |

---

## Group A — Subscription and pricing

### **CAND-01: Billing Starts a Trial Subscription When a Tenant Is Provisioned**
- **Actor:** System (reacting to `TenantProvisioned`).
- **Preconditions:** Tenant exists. `FeaturePrice` rows exist for the tenant's country.
- **Trigger:** `TenantProvisioned` event v2 (from the operator script or from self-signup, CAND-22); it carries `countryCode`, `timezone` and an optional billing hint (`exempt`, feature subset).
- **Main Flow:**
  1. Handler calls one use case with `tenantId`, `countryCode`, `timezone`, the hint and `correlationId`.
  2. Use case creates the `Subscription` (`TRIALING`, `trialEndsAt = now + 14 days`, `timezone` snapshot, `nextDueDate` = trial-end date, currency from the country's price rows, cycle `MONTHLY`).
  3. For every feature it creates a trial item `[now, trialEndsAt)` **and** a default paid item `[trialEndsAt, ∞)` with the same feature and tier (chatbot `BASIC`); items carry no price. `HOTSITE` is the root dependency and is mandatory for `BOOKING`; a booking-only selection is invalid. Ikaro's own tenant (slug = `PLATFORM_OWNER_TENANT_SLUG`) and any tenant provisioned with the `exempt` hint get `status ACTIVE`, `exempt = true` and open-ended items.
  4. It creates an empty `BillingAccount`, then invalidates the access cache after commit.
- **Alternative Flows:**
  - **A1: Subscription already exists** (event redelivered) → no-op; idempotent on `UNIQUE(tenant_id)`.
  - **A2: No `FeaturePrice` rows for the country** → the use case fails loudly (error logged, event retried); the missing row is a provisioning/data-integrity incident, access is denied rather than granted, and an urgent ops alert is sent.
  - **A3: Provisioning passes an explicit feature subset** (event hint) → items are created from that subset; the others are not created.
  - **A4: Non-exempt US tenant while `FEATURE_FLAG_SIGNUP_US` is off** → the use case fails loudly and alerts; provisioning paths also reject it up front (main doc §5.2). Exempt US tenants are allowed.
  - **A5: A v1 `TenantProvisioned` event** (published before the v2 deploy, no `countryCode`) → the handler fails and the event is retried; the v2 publisher goes live in the same release.
- **Postconditions:** Tenant has a `TRIALING` subscription with all items.
- **Events Triggered:** None (the audit log is the `TenantProvisioned` handler itself).

### **CAND-02: Operator Adds a Feature to a Tenant** — *WITHDRAWN 2026-10-26 (managers add features themselves via CAND-31; no per-tenant prices). Number kept so references stay valid.*
- **Actor:** Operator.
- **Preconditions:** Tenant has a subscription (any status except cancelled-and-purged).
- **Trigger:** Operator runs the add-feature script/endpoint with `tenantId`, `featureKey`, optional `tier`, optional `unitPriceMinor` override, `reason`.
- **Main Flow:**
  1. System validates dependencies (CAND dependency table) and that the feature is not already active.
  2. It copies the list price for (feature, country, tier, cycle) into a new item unless an override is given.
  3. The item is scheduled for the **next paid service-period start**; no entitlement switches on now and no prorated charge is created.
  4. Cache invalidated after commit; operator audit row written.
- **Alternative Flows:**
  - **A1: Dependency unmet** (e.g. `LOYALTY` without `BOOKING`) → rejected, error names the missing feature.
  - **A2: Feature already active** → rejected.
  - **A3: No list price for (feature, country, tier)** → rejected unless an override price is supplied.
  - **A4: Tenant `SUSPENDED`** → allowed (item created) but the entitlement has no effect until reactivation.
  - **A5: Currency of an override differs from the subscription currency** → rejected.
- **Postconditions:** The next-period item is scheduled; its first charge includes the line when that period begins.
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

### **CAND-04: Operator Changes a Tenant's Item Price** — *WITHDRAWN 2026-10-26 (no per-tenant prices; list changes via CAND-07 apply from the next service period whose start is on/after their effective date). Text kept for history.*
- **Actor:** Operator.
- **Preconditions:** Item active.
- **Trigger:** Operator runs change-price with `tenantId`, `featureKey`, `unitPriceMinor`, `reason`.
- **Main Flow:** *(withdrawn — see title.)* Original idea kept for history: end the current item and add a new item row with the new price; already-issued charges unaffected.
- **Alternative Flows:**
  - **A1: Negative price** → rejected. **Zero price** → allowed (granted feature).
  - **A2: A charge for the next period is already issued** → the new price applies from the period after; a warning is returned.
- **Postconditions:** Next unissued charge uses the new price.
- **Events Triggered:** None.

### **CAND-05: Operator Marks a Charge Paid Manually** — *WITHDRAWN 2026-10-26. A provider-managed charge is paid only through its provider webhook/reconciliation; there is no manual-payment override, bank-transfer exception, or `MANUAL` adapter in v1. Number kept so references stay valid.*

### **CAND-06: Operator Extends Grace or Suspends a Tenant**
- **Actor:** Operator.
- **Preconditions:** Subscription exists.
- **Trigger:** Operator runs grace/suspend with `tenantId`, `reason`, and for grace a `graceUntil`.
- **Main Flow:** Grace sets `graceUntil` (the sweep then waits until that date before suspending). Suspend sets `SUSPENDED` with reason `NON_PAYMENT`. There is no operator reactivation or payment override: only provider-confirmed payment restores access (CAND-09/CAND-29).
- **Alternative Flows:**
  - **A1: Grace on a tenant that is not `PAST_DUE`** → rejected.
  - **A2: Attempt an operator reactivation** → rejected; it cannot bypass provider-confirmed payment.
- **Postconditions:** Grace or suspension changed, audited.
- **Events Triggered:** `SubscriptionSuspended` when applicable.

### **CAND-07: Operator Maintains the List Prices (`FeaturePrice`)**
- **Actor:** Operator.
- **Preconditions:** A separately approved commercial-catalog story defines the offered features/tiers, country availability, Chatbot models/caps and seed prices. The illustrative discovery catalog is never seed data.
- **Trigger:** Operator creates a price (`featureKey`, `countryCode`, `tier`, `cycle`, first `amountMinor`, `currency`) or schedules a price change (`amountMinor`, `effectiveFrom`, `reason`) through the operator-only endpoint (optionally `dryRun`).
- **Main Flow:** A dry run lists the affected tenants (`ACTIVE`/`PAST_DUE`, active or next-period scheduled item for that feature and tier in that country, not `exempt`) without saving. Without dry run, one transaction writes a dated `feature_price_versions` row and one `SubscriptionPriceChangeAnnounced` outbox event per affected tenant. `effectiveFrom` means a **service-period start date**: an invoice snapshots the new amount only when its period starts on or after that date. Already-issued invoices are untouched. The Plano tab and public prices show the current amount and the upcoming one.
- **Alternative Flows:**
  - **A1: Currency does not match the country** (BR must be BRL, US must be USD in v1) → rejected.
  - **A2: Hiding a price from new selection** → allowed; existing subscribers continue renewing it. A full product/tier retirement needs a separately announced migration/end date, not a silent deactivation.
  - **A3: Cycle other than `MONTHLY`** → rejected in v1.
  - **A4: Increase with less than `PRICE_CHANGE_MIN_NOTICE_DAYS + CHARGE_ISSUE_LEAD_DAYS` (default 30 + 10) of notice** → rejected (`BILLING_PRICE_NOTICE_TOO_SHORT`). A decrease needs no minimum notice but still has an explicit future `effectiveFrom` service-period start; it never rewrites an issued charge or current period.
  - **A5: A pending (not yet effective) version already exists for this price** → it is superseded by the new one and managers are notified again with the new date.
  - **A6: No affected tenants** → version saved, no events.
  - **A7: Same amount as the current one** → rejected (nothing to change).
- **Postconditions:** Price available / scheduled; affected managers notified.
- **Events Triggered:** `SubscriptionPriceChangeAnnounced` (one per affected tenant).

### **CAND-32: Operator Sets or Clears a Tenant's `exempt` Flag**
- **Actor:** Operator.
- **Preconditions:** Subscription exists (or the tenant is being provisioned with the `exempt` hint).
- **Trigger:** Operator calls `PUT /internal/tenants/{tenantId}/billing/exempt` with `{ exempt, reason }`, or provisions with `exempt=true`.
- **Main Flow:**
  1. **Set:** the subscription becomes `ACTIVE`, `exempt = true`, every feature entitled with open-ended items; any open charge is cancelled locally and at the provider; billing emails stop; the tenant is excluded from charge issuing, the sweep, purge and the ops digest.
  2. **Clear:** the subscription becomes `TRIALING` with a fresh 14-day window, trial items plus default paid items (CAND-01 step 3) so the manager picks the first paid selection; nothing is charged before the trial ends.
  3. Cache invalidated after commit; `operator_audit` row (`SET_EXEMPT`, who, why) written.
- **Alternative Flows:**
  - **A1: Tenant is Ikaro's own** (`PLATFORM_OWNER_TENANT_SLUG`) → clearing is rejected.
  - **A2: Already in the requested state** → no-op, no audit row.
  - **A3: Tenant `SUSPENDED`** → setting `exempt` reactivates it without payment (the only operator route back to access, and only by making the tenant free); `SubscriptionReactivated` is raised.
- **Postconditions:** Tenant is free (or back on the paid ladder), audited.
- **Events Triggered:** `SubscriptionReactivated` (A3 only).

---

## Group B — System jobs and provider integration

### **CAND-08: System Issues the Next Charge**
- **Actor:** System (Cloud Scheduler → `/cron/billing-issue-charges`).
- **Preconditions:** Subscription `TRIALING` or `ACTIVE`, not cancelling, due date within 10 days.
- **Trigger:** Daily cron.
- **Main Flow:**
  1. For each due subscription (standalone partial index on `next_due_date`), compute lines from the items scheduled for the next service period, reading each amount from the price version in force on that period's **start date**.
  2. Outside a database transaction, calculate tax for a tax-exclusive US charge through `TaxCalculationPort` (Stripe Tax Basic); tax-inclusive BR charges use zero extra tax. The calculation result is a point-in-time input, never fetched during later reads.
  3. Insert the `Charge` (`kind = PERIOD`), feature lines and tax lines in one transaction (`UNIQUE(tenant_id, subscription_id, period_start)` makes a re-run idempotent), then — outside the DB transaction — ask the provider (via the port) to create the charge and store its id, payment link and link expiry.
  4. For a `TRIALING` subscription the first charge is issued 10 days before trial end from the default paid items (or the manager's saved selection), due at trial end.
- **Alternative Flows:**
  - **A1: Subscription is `exempt`** (Ikaro's own tenant, staging) → no charge created.
  - **A6: No renewable price version for an item's (feature, tier, country, cycle)** → the charge is not issued, an ops alert is sent. A catalog row hidden from new selection remains renewable for existing subscribers.
  - **A2: Provider call fails** → the charge keeps `provider_creation_status = PENDING`; the dedicated retry candidate query re-attempts creation without inserting a duplicate period charge; alert after N failures.
  - **A3: Job runs twice** → no duplicates.
  - **A4: Tenant `SUSPENDED`** → skipped (no charges while suspended).
  - **A5: Subscription is cancelling (`cancelAt` set)** → no charge for periods after `cancelAt`.
  - **A7: US customer location is insufficient for tax calculation** → reject first paid-plan selection until billing state and ZIP/postal code are supplied; for an existing paid tenant, hold provider-charge creation, alert the manager and never silently issue an untaxed USD charge. For a trial this means **no charge exists at trial end, and the trial-end rule of CAND-10 suspends the subscription** — the manager is warned by email and banner before that.
- **Postconditions:** Next period's charge exists with a payment link.
- **Events Triggered:** `ChargeIssued`.

### **CAND-09: System Handles a Provider Webhook**
- **Actor:** Provider (Asaas) → public BFF route → internal backend.
- **Preconditions:** Webhook configured with a token; secret in Secret Manager.
- **Trigger:** HTTP POST with `asaas-access-token`.
- **Main Flow:**
  1. BFF validates the token (timing-safe) and forwards the raw body to the internal endpoint.
  2. Backend resolves the tenant from the provider customer id, normalizes the event, and in one transaction inserts `provider_events(provider, event_id)` (duplicate → 200), updates local charge/subscription state and writes email outbox events.
  3. A normalizing adapter maps the payment event to `PaymentConfirmed` / `PaymentOverdue` / `PaymentRefunded` / `PaymentChargeback` / auto-billing authorized / deactivated. **The paid signal is method-dependent:** card `PAYMENT_CONFIRMED`, Pix and boleto `PAYMENT_RECEIVED` (verified in the Asaas sandbox before launch); whichever arrives first for the charge produces the single `PaymentConfirmed`, the later one is a no-op.
  4. `PaymentConfirmed` marks paid, sets `has_ever_paid`, and reactivates `PAST_DUE`/`SUSPENDED` subscriptions (row lock); a `SUSPENDED` recovery charge also writes its period and anchor (CAND-29). The local due-date sweep owns `PENDING` → `OVERDUE`/`PAST_DUE`, so an overdue webhook only confirms/reconciles that result.
  5. Respond 200 only after the transaction commits; email delivery is asynchronous from the outbox.
- **Alternative Flows:**
  - **A1: Wrong/missing token** → 401, nothing stored.
  - **A2: Unknown provider customer** → 200, logged, no state change.
  - **A3: Out-of-order event** (paid after cancelled) → applied only if legal for the charge's current status; otherwise logged and left to reconcile.
  - **A4: Backend down** → non-2xx so the provider retries (its queue pauses after 15 consecutive failures; reconcile covers the gap).
  - **A5: Refund / chargeback** → partial refunds do not affect access; a full confirmed refund or completed chargeback reversal that leaves the current period without settled payment immediately suspends with reason `PAYMENT_REVERSED`. A merely opened dispute does not.
- **Postconditions:** Local state mirrors the provider.
- **Events Triggered:** `ChargePaid`, `SubscriptionPastDue`, `SubscriptionReactivated` as applicable.

### **CAND-10: System Sweeps Statuses**
- **Actor:** System (`/cron/billing-status-sweep`).
- **Preconditions:** None.
- **Trigger:** Daily trigger (Cloud Scheduler → Pub/Sub → `ITriggerBus` handler; the `/cron/billing-status-sweep` endpoint is the manual path).
- **Main Flow:** all dates are evaluated in `subscriptions.timezone`. (a) any `PENDING` charge past its tenant-local due date becomes `OVERDUE`; for an `ACTIVE` subscription it becomes `PAST_DUE` and records `pastDueSince`; (a2) **trial end:** a `TRIALING` subscription whose `trialEndsAt` has passed with its first charge unpaid — or with no charge at all — becomes `SUSPENDED` (`NON_PAYMENT`) directly; there is no `PAST_DUE` after a trial; (b) `PAST_DUE` older than 14 days (or past `graceUntil`) becomes `SUSPENDED` (`NON_PAYMENT`); (c) `cancelAt` reached becomes `SUSPENDED` (`CANCELED`), end-dating its items; (d) confirmed payment converts to `ACTIVE` through CAND-09. The trial's first paid period starts at its trial end and later renewals use that anchor day. `exempt` subscriptions are never touched by this job.
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
  - **A1: No subscription row after a successful lookup** → provisioning/data-integrity incident: deny tenant operations, emit an urgent metric/log and let the durable provisioning retry repair it. This is distinct from an adapter lookup error.
  - **A2: Lookup error** → fail open + log.
  - **A3: Cache stale** → invalidated best-effort after commit; TTL bounds staleness.
  - **A4: Bulk need** (a cron scanning all tenants) → batch query for suspended tenant ids, never one call per tenant.
- **Postconditions:** None.
- **Events Triggered:** None.

### **CAND-16: Login Routing by Role When Suspended**
- **Actor:** Manager / Staff / Customer.
- **Preconditions:** Tenant `SUSPENDED`.
- **Trigger:** Login or any navigation.
- **Main Flow:** Login itself is never blocked. After login: manager → billing page only; staff → suspended notice; customer → account with "Empresa inativa" badge, booking/loyalty history readable, new booking/reschedule/redemption/earning blocked, and cancellation of an existing future booking allowed. One global guard applies declarative `@SuspensionAccess` route policy; Booking decides record-dependent open-detail/cancellation rules.
- **Alternative Flows:**
  - **A1: Direct URL to a blocked page** → typed backend denial; web routing redirects only where a role-specific safe destination exists.
  - **A2: JWT issued before suspension** → the guard checks current access, not the token claims, so it takes effect immediately (cache TTL bounded).
  - **A3: Customer of a tenant that becomes `PAST_DUE`** → no change (full access).
  - **A4: Staff with several tenants** → the staff tenant-selection list still shows the suspended tenant, marked "Suspensa"; selecting it shows the staff suspended notice. `GET /auth/staff-tenants` returns a per-tenant `operational` flag. (No customer selector exists today; a future one follows the same rule.)
- **Postconditions:** None.
- **Events Triggered:** None.

### **CAND-17: Hotsite Is Effectively Unpublished When Suspended**
- **Actor:** Visitor.
- **Preconditions:** Tenant `SUSPENDED`.
- **Trigger:** Visitor opens the hotsite, booking page, sitemap or robots.
- **Main Flow:** Effective published = `isPublished && operational` in the manifest, the booking page check, `robots`/noindex and the published-hotsites sitemap list. The page shows "Página não publicada" (reason-neutral) and keeps the top bar with team login and customer login. The same page and bar are used for every unpublished hotsite, so the page never reveals why; `Unavailable` gains the bar (it has none today).
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
- **Main Flow:** The send path asks the access port for the tenant (an `exempt` tenant is never suspended, so its sends are never skipped); if suspended it skips the send and records `SKIPPED_TENANT_SUSPENDED` (not replayed later); templates belonging to Billing (R10) are exempt.
- **Alternative Flows:**
  - **A1: Billing email but the manager has no address** → logged, ops alert.
  - **A2: Access lookup error** → fail open (send).
- **Postconditions:** No tenant/customer/staff messages while suspended.
- **Events Triggered:** None.

### **CAND-19: Billing Emails to the Manager**
- **Actor:** System (one event handler per event; each handler calls exactly one use case).
- **Preconditions:** Template exists in the tenant's language (pt-BR/en) — seeded for new tenants and backfilled for existing ones. The tenant is not `exempt` (R12): exempt tenants receive no billing emails, and the handlers skip them.
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
- **Main Flow:** Enforcement is declarative (main doc §5.1): `@RequiresFeature` plus `@SuspensionAccess` metadata on routes, subscription metadata for outbound event handlers (opt-in `skipWhenSuspended`; audit and state-sync handlers always run), and one tenant-scoped job helper for crons. A guard fails with typed errors; the dashboard shows locked items and preserves settings; public endpoints refuse. Record-dependent Booking and customer-cancellation policy stays in Booking rather than being duplicated as route `if`s.
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
  3. Visitor fills business name, slug, country (BR|US) and accepts Terms and Privacy; language derives from the country.
  4. System re-validates server-side, applies the trial rule (A3), then calls the existing `ProvisionTenantUseCase` (Platform) with the Google email as first manager; the Google `sub` and accepted terms version/timestamp are recorded in `signup_registrations`.
  5. The endpoint returns the account-created page. `TenantProvisioned` asynchronously triggers Staff (first manager) and Billing (CAND-01); once the first-manager work completes, the existing invitation/login email is sent to the verified Google email. The visitor is not issued a tenant JWT and is not sent to the dashboard by signup.
- **Alternative Flows:**
  - **A1: Slug taken / reserved / invalid** → field error with suggestions.
  - **A2: Turnstile fails** → retry screen.
  - **A3: Trial not available for this Google account** (an earlier self-signup tenant of the same `sub` never paid) → `SIGNUP_TRIAL_NOT_AVAILABLE`, "Você já tem um teste em andamento ou não concluído" + contact link. A first signup, or one where every earlier signup tenant has paid, always gets the trial.
  - **A4: Rate limit exceeded** (per IP/day) → friendly "tente mais tarde".
  - **A5: Terms not accepted** → blocked.
  - **A6: Tenant creation transaction fails** → nothing is created and retry is offered. If a post-commit `TenantProvisioned` consumer is delayed or fails, its durable event retry completes the first-manager and Billing setup; the account-created page still directs the visitor to email rather than implying that dashboard access is already ready.
  - **A7: Country without prices, or US while `FEATURE_FLAG_SIGNUP_US` is off (no Stripe adapter yet)** → not offered.
  - **A8: Google account already manages other tenants** → allowed (multi-tenant staff and owners); trial rule A3 still applies. An owner who pays can create as many tenants as they want.
- **Postconditions:** Tenant creation committed; the first manager and trial subscription are created asynchronously from `TenantProvisioned`. The visitor sees the account-created/check-email page and signs in through the first-manager invitation/login email after setup completes.
- **Events Triggered:** `TenantProvisioned` (existing).

### **CAND-23: Visitor Reads Public Prices and Checks a Slug**
- **Actor:** Guest.
- **Preconditions:** None.
- **Trigger:** `/ikaro-trial` loads, or the visitor types a slug.
- **Main Flow:** `GET /v1/public/billing/prices?country=` returns selectable list prices; `GET /v1/public/signup/slug-availability?slug=` returns available/taken/reserved/invalid.
- **Alternative Flows:**
  - **A1: Prices fail to load** → error state with retry; signup stays possible.
  - **A2: Race between check and submit** → CAND-22 A1 handles it.
  - **A3: Enumeration abuse** → throttled, Turnstile-protected.
- **Postconditions:** None.
- **Events Triggered:** None.

### **CAND-24: First-Run Onboarding After Signup**
- **Actor:** Staff (MANAGER, new).
- **Preconditions:** The account-created page has handed the visitor to the existing invitation/login email; first-manager and Billing trial setup have completed.
- **Trigger:** First authenticated dashboard visit through that email/login flow.
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
- **Main Flow:** Banner "Faltam N dias do seu teste" links to billing and prompts the manager to choose the first paid plan (CAND-31); trial entitlements remain fully enabled. Ten days before trial end, the first invoice is issued from that next-period selection (default: every trial feature continues); it is due on trial end and the manager is emailed.
- **Alternative Flows:**
  - **A1: Trial ends the same day the charge is issued** → charge issued immediately, normal due date.
  - **A2: Trial ended unpaid** → `SUSPENDED` at trial end (CAND-10 a2); the manager lands on the billing page with "Pague 1 mês para reativar". There is no `PAST_DUE` after a trial. The banner in the last days says "Faltam N dias… sua conta será suspensa se a primeira cobrança não for paga".
- **Postconditions:** None.
- **Events Triggered:** `ChargeIssued` (via CAND-08).

### **CAND-31: Manager Changes the Plan (Self-Service)**
- **Actor:** Staff (MANAGER).
- **Preconditions:** Subscription not `SUSPENDED`.
- **Trigger:** Manager opens the "Plano" tab on the billing page.
- **Main Flow:**
  1. The tab lists every feature with its price for the tenant's country, a toggle, the chatbot tier choice (Básico/Plus), dependency hints and a live total.
  2. Manager changes the **next-period** selection; the page previews each change ("entra em 10/11" / "sai em 10/11") and that period's new total.
  3. Manager saves (single primary action). System validates the proposed final dependency graph, schedules the item/tier changes at the next paid service-period start, and, if the next invoice is already issued and unpaid, cancels and re-issues it after commit. A paid invoice is never changed.
- **Alternative Flows:**
  - **A1: Dependency unmet / dependents active** (Loyalty without Booking; removing Booking while Loyalty is active) → whole selection rejected with the specific message; nothing saved.
  - **A2: `PAST_DUE` or `SUSPENDED`** → plan tab read-only until a settled payment/reactivation; no unpaid plan change is queued.
  - **A3: Trial** → all features remain active through trial; selection only determines the first paid period.
  - **A5: Empty selection** → rejected (at least one feature).
  - **A6: No list price for the country/tier** → feature shown as unavailable.
  - **A7: Next invoice already paid** → change applies from the following renewal; the page says so.
  - **A8: Provider re-issue fails** → scheduled selection is saved and the provider-creation retry handles the replacement invoice; alert on repeated failure.
  - **A9: Save error** → message, selection kept.
  - **A10: Cancellation scheduled (`cancelAt` set)** → plan tab read-only ("reative a assinatura para alterar o plano").
- **Postconditions:** Current entitlements are unchanged; the validated selection applies at the next paid service-period start.
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
- **Preconditions:** Tenant `SUSPENDED` for ≥ 90 days (`has_ever_paid = false`) or ≥ 180 days (`has_ever_paid = true`), any suspension reason; not `exempt`.
- **Trigger:** Daily trigger (`ITriggerBus`, like the other jobs).
- **Main Flow:**
  1. At 30 and 7 days before, a warning email goes to the manager (Billing template, exempt from the gate).
  2. At the deadline Billing creates a durable `TenantPurgeJob` and publishes `TenantPurgeRequested`. Each bounded context deletes its own data idempotently and publishes `TenantPurgeContextCompleted` after its local transaction commits.
  3. Billing records every completion; storage cleanup, provider cancellation and Billing anonymization are required steps. Only after all required completions does Platform delete the tenant root and release the slug.
- **Alternative Flows:**
  - **A1: Tenant reactivated before the deadline** → clock cleared.
  - **A2: One context's deletion fails** → its event handler rethrows for retry; the purge job remains `IN_PROGRESS`/`FAILED`, stays inaccessible through its existing suspension, and alerts ops. `PURGING` is not a subscription status.
  - **A3: Provider cancellation fails** → retried; does not block local erasure.
  - **A4: Ikaro's own tenant or any `exempt` tenant** → never purged (guarded).
  - **A5: Deletion capability missing in a context** → the purge cron stays disabled until every participant has shipped its idempotent deletion story.
- **Postconditions:** Tenant data erased; slug free.
- **Events Triggered:** `TenantPurgeRequested`.

### **CAND-28: Manager Cancels the Subscription**
- **Actor:** Staff (MANAGER).
- **Preconditions:** `ACTIVE` / `PAST_DUE` / `TRIALING`.
- **Trigger:** Manager clicks "Cancelar assinatura".
- **Main Flow:** For `ACTIVE`, confirmation states access continues until the paid-period end; it sets `cancelAt`, immediately cancels every unpaid charge for a period beginning on/after that date, and shows "Cancelada — acesso até dd/mm". For `PAST_DUE` and `TRIALING`, cancellation is immediate: any open charge is cancelled and the subscription becomes `SUSPENDED` (`CANCELED`). Nothing is refunded.
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
- **Main Flow:** If still within the paid period, `cancelAt` is simply cleared. If suspended, any open `PERIOD` charge is cancelled (locally and at the provider, never re-dated) and one `RECOVERY` charge for one month is issued: amount fixed at issue from the price versions in force on the issue date, lines = the items active at suspension. On payment the status becomes `ACTIVE`, the period starts at payment, `anchor_day` is the payment's tenant-local day clamped to 28, and the charge's period dates are written; no months are owed for the gap. Calling reactivate again while a recovery charge is open returns that charge.
- **Alternative Flows:**
  - **A1: Data already purged** → not possible; a new signup is required (contact Ikaro for the trial rule).
  - **A2: Payment not completed** → remains suspended.
  - **A3: Provider charge creation fails** → error with retry.
- **Postconditions:** Tenant active.
- **Events Triggered:** `ChargeIssued`, `ChargePaid`, `SubscriptionReactivated`.

### **CAND-30: Manager Enables or Disables Automatic Charging** — *DEFERRED RELEASE GATE*
- **Actor:** Staff (MANAGER).
- **Preconditions:** Provider supports it for the tenant's currency (BRL via Asaas) **and** Ikaro has verified the actual Asaas account and sandbox flow end-to-end. Until that gate passes, this UI and endpoint are not released.
- **Trigger:** Manager clicks "Ativar cobrança automática" / "Desativar".
- **Main Flow:** BFF asks the provider (port) for a hosted authorization URL (saved card, or Pix Automático approval in the bank app); the manager completes it on the provider's page; the webhook marks automatic charging active; the page shows "Cartão final 4242" / "Pix Automático ativo". Disabling asks the provider to revoke it. The hosted payment link keeps working in every case.
- **Alternative Flows:**
  - **A1: Authorization not completed** → status "pendente" with a way to restart.
  - **A2: Provider error** → message, retry.
  - **A3: Authorization later revoked at the bank** → webhook sets it inactive; next charge falls back to the hosted payment link.
  - **A4: USD tenant** → option hidden until a Stripe adapter exists.
- **Postconditions:** Subsequent charges are collected automatically.
- **Events Triggered:** None. *(Built as a later slice; depends on confirming the Asaas card/Pix flow — see open threads.)*

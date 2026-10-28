# Discovery: Tenant Billing — Candidate Use Cases

**Status:** Discovery — candidate/speculative. Labeled `CAND-XX`, never `UC-XXX`, so this list cannot collide with the canonical index in `docs/USE_CASES.md`. Promotion assigns real UC numbers.

**Companion docs:** `tenant-billing.md` (domain model and rules R1–R13) · `tenant-billing_OPERATIONS.md` (operator-free model) · `tenant-billing_DATA_MODEL.md` · `tenant-billing_API.md` · `tenant-billing_MODULE.md` · `prototype/` (start at `index.html`).

## Format

Same fields as `docs/USE_CASES.md`: Actor / Preconditions / Trigger / Main Flow / Alternative Flows / Postconditions / Events Triggered. "Operator" = Ikaro staff acting through scripts / internal endpoints (no backoffice screen in v1); every operator action records who, when and why. Status names: `TRIALING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED` (reason `NON_PAYMENT` | `CANCELED` | `PAYMENT_REVERSED` | `OPERATOR`).

## Index

| Group | CANDs |
|---|---|
| A — Subscription and pricing (operator / system reaction) | 01–07, 32, 33, 37 |
| B — System jobs and provider integration | 08–11, 34, 35 |
| C — Manager billing | 12–14, 28–31, 38 |
| D — Enforcement across the system | 15–21 |
| E — Self-signup, trial, clean-up | 22–27, 36 |

Review 3 (2026-10-28) added CAND-36 (self-service discard), CAND-37 (tenant deactivation stops billing), CAND-38 (optional automatic card collection, slice F2) and CAND-39/40 (annual billing and the mid-year add-on, slice H), and changed CAND-01, 08, 10, 19, 22, 25, 31, 32 and 34.

---

## Group A — Subscription and pricing

### **CAND-01: Billing Starts a Trial Subscription When a Tenant Is Provisioned**
- **Actor:** System (reacting to `TenantProvisioned`).
- **Preconditions:** Tenant exists. `FeaturePrice` rows exist for the tenant's country.
- **Trigger:** `TenantProvisioned` event v2 (from the operator script or from self-signup, CAND-22); it carries `countryCode`, `timezone` and an optional billing hint (`exempt`, feature subset).
- **Main Flow:**
  1. Handler calls one use case with `tenantId`, `countryCode`, `timezone`, the hint and `correlationId`.
  2. Use case creates the `Subscription` (`TRIALING`, `trialEndsAt` = the tenant-local midnight closing day 14, `timezone` snapshot, `nextDueDate` = trial-end date, currency from the country's price rows, cycle `MONTHLY`).
  3. For every feature it creates a default paid item `[trialEndsAt, ∞)` (chatbot `BASIC`); there are no trial items — trial access is computed from the status (decision 83); items carry no price. `HOTSITE` is the root dependency and is mandatory for `BOOKING`; a booking-only selection is invalid. Ikaro's own tenant (slug = `PLATFORM_OWNER_TENANT_SLUG`) and any tenant provisioned with the `exempt` hint get `status ACTIVE`, `exempt = true` and open-ended items.
  4. It creates the `BillingAccount` from the registration named by the event's `registrationId` (BR tax ID, signup terms and Google `sub`; the personal data is **not** in the event, decision 120), completes the registration (`tenant_id` set, tax id cleared) and creates the items, all in the same transaction, then invalidates the access cache after commit.
- **Alternative Flows:**
  - **A1: Subscription already exists** (event redelivered) → no-op; idempotent on `UNIQUE(tenant_id)`.
  - **A2: No `FeaturePrice` rows for the country** → the use case fails loudly (error logged, event retried); the missing row is a provisioning/data-integrity incident, access is denied rather than granted (after the provisioning window), the self-heal job retries it (CAND-35), and an alert fires only if that fails; a missing price set for an enabled country is also caught at deploy time.
  - **A3: Provisioning passes an explicit feature subset** (event hint) → the subset defines the **default paid items**; the trial still grants every feature because it is computed from the status, so the trial is always complete (an exempt tenant gets only the subset, open-ended).
  - **A4: Non-exempt US tenant while `FEATURE_FLAG_SIGNUP_US` is off** → the use case fails loudly and alerts; provisioning paths also reject it up front (main doc §5.2). Exempt US tenants are allowed.
  - **A6: Access is read before this handler has run** → the tenant is younger than `PROVISIONING_GRACE_MINUTES`, so the access port treats it as a pending trial (allowed); if the window expires without a subscription, the self-heal job (CAND-35) runs this same use case.
  - **A5: A legacy `TenantProvisioned` payload** (outbox row written before the deploy, no `countryCode`; the bus does not version-route, verified) → the handler skips it and logs; the self-heal job (CAND-35) creates the trial through the narrow read-only tenant-info port (decision 119). Publisher and handler ship in the same release.
  - **A7: Event without a `registrationId`** for a non-exempt tenant (an old script call) → the handler creates the subscription without tax id and flags the BR charge hold (CAND-08 A8); the manager supplies it in the dashboard.
- **Postconditions:** Tenant has a `TRIALING` subscription with all items.
- **Events Triggered:** None (the audit log is the `TenantProvisioned` handler itself).

### CAND-02 to CAND-05 — withdrawn (2026-10-26)

Operator add/remove feature (02, 03), operator item-price change (04) and operator mark-paid (05) were withdrawn: managers change plans themselves (CAND-31), there are no per-tenant prices, and a charge is paid only through its provider. The numbers are kept so references stay valid; the original text was removed in the 2026-10-27 second review.

### **CAND-06: Operator Extends Grace or Suspends a Tenant**
- **Actor:** Operator.
- **Preconditions:** Subscription exists.
- **Trigger:** Operator runs grace/suspend with `tenantId`, `reason`, and for grace a `graceUntil`.
- **Main Flow:** Grace sets `graceUntil` (the sweep then waits until that date before suspending). Suspend (abuse/takedown) sets `SUSPENDED` with reason `OPERATOR`: no recovery charge is issued, payment does not lift it, and the audited `unsuspend` (valid only for `OPERATOR`) restores access. Grace is a mapped edge case (OPERATIONS O9), rarely needed because the suspension freeze (CAND-35) covers provider outages. There is no operator payment override and no operator reactivation of a `NON_PAYMENT`, `CANCELED` or `PAYMENT_REVERSED` suspension: only provider-confirmed payment restores access (CAND-09/CAND-29).
- **Alternative Flows:**
  - **A1: Grace on a tenant that is not `PAST_DUE`** → rejected.
  - **A2: Attempt an operator reactivation of a payment-based suspension** → rejected; it cannot bypass provider-confirmed payment. The one exception is making the tenant `exempt` (CAND-32 A3), which makes it free rather than paid.
- **Postconditions:** Grace or suspension changed, audited.
- **Events Triggered:** `SubscriptionSuspended` when applicable.

> **Review 3 (decision 127):** the usual price change is a **percentage adjustment of every price in force for a country** (`POST /internal/billing/feature-prices/adjust`, one transaction, one consolidated email per tenant, dry run with sample tenant totals and a preview hash). The per-price flow below remains for exact amounts, corrections and new prices; both share the same rules (notice, supersede, `effective_from` = service-period start).

### **CAND-07: Operator Maintains the List Prices (`FeaturePrice`)**
- **Actor:** Operator.
- **Preconditions:** A separately approved commercial-catalog story defines the offered features/tiers, country availability, Chatbot models/caps and seed prices. BR launch prices are approved (decision 77); the US list is non-production only until decision 78 closes.
- **Trigger:** Operator creates a price (`featureKey`, `countryCode`, `tier`, `cycle`, first `amountMinor`, `currency`) or schedules a price change (`amountMinor`, `effectiveFrom`, `reason`) through the operator-only endpoint (optionally `dryRun`).
- **Main Flow:** A dry run lists the affected tenants (`TRIALING`/`ACTIVE`/`PAST_DUE`, active or next-period scheduled item for that feature and tier in that country, not `exempt`) without saving. Without dry run, one transaction writes a dated `feature_price_versions` row and one `SubscriptionPriceChangeAnnounced` outbox event per affected tenant. `effectiveFrom` means a **service-period start date**: an invoice snapshots the new amount only when its period starts on or after that date. Already-issued invoices are untouched. The Plano tab and public prices show the current amount and the upcoming one.
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
  1. **Set:** the subscription becomes `ACTIVE`, `exempt = true`, every feature entitled with open-ended items; any open charge is cancelled locally and at the provider; billing emails stop; the tenant is excluded from charge issuing, the sweep and purge (there is no ops digest, decision 107).
  2. **Clear:** the subscription becomes `TRIALING` with a fresh 14-day window and `plan_confirmed_at = NULL`; the open-ended exempt items are **replaced** by the default paid items `[trial_ends_at, ∞)` in the same transaction (the GIST exclusion forbids overlap) so the manager picks and confirms the first paid selection; nothing is charged before the trial ends.
  3. Cache invalidated after commit; `operator_audit` row (`SET_EXEMPT`, who, why) written.
- **Alternative Flows:**
  - **A1: Tenant is Ikaro's own** (`PLATFORM_OWNER_TENANT_SLUG`) → clearing is rejected.
  - **A2: Already in the requested state** → no-op, no audit row.
  - **A3: Tenant `SUSPENDED`** → setting `exempt` reactivates it without payment (the only operator route back to access, and only by making the tenant free); `SubscriptionReactivated` is raised.
- **Postconditions:** Tenant is free (or back on the paid ladder), audited.
- **Events Triggered:** `SubscriptionReactivated` (A3 only).

### **CAND-33: Developer or Operator Simulates Billing in Non-Production**
- **Actor:** Developer / operator (never a tenant user).
- **Preconditions:** `APP_ENV` is `local` or `staging`; for provider events, the target subscription uses a `*_FAKE` merchant profile key (staging subscriptions on sandbox keys receive their events from the real sandbox).
- **Trigger:** Calls an internal dev endpoint or script: `clock/advance`, `provider/simulate`, or `seed`.
- **Main Flow:**
  1. **Advance time:** the injectable clock moves forward; the next trigger run of the sweep, issuing and purge jobs evaluates trial end, due dates, grace and purge age against it.
  2. **Simulate a provider event:** the fake provider builds the signed webhook for the chosen event (using the verified per-method sequences) and delivers it to the app's own webhook route, optionally duplicated, delayed or out of order, or fails the next provider call (5xx, expired link, invalid location). The normal CAND-09 path processes it; no test-only code path exists in the use cases.
  3. **Seed:** creates one tenant per billing state through the normal use cases.
- **Alternative Flows:**
  - **A1: `APP_ENV=production`** → the routes do not exist (404); a live adapter also refuses to start outside production, and a fake/sandbox profile key is rejected at provisioning in production.
  - **A2: Subscription uses a sandbox or live key** → `simulate` is refused; staging sandboxes are driven through the provider's own sandbox actions.
  - **A3: Missing or wrong operator keys** → `401` like every operator route.
- **Postconditions:** Billing state changed exactly as the real event would have changed it; nothing was charged and no real communication was sent (Mailhog locally; staging email allowlist).
- **Events Triggered:** whatever the simulated flow triggers (`ChargePaid`, `SubscriptionPastDue`, …).

---

## Group B — System jobs and provider integration

### **CAND-08: System Issues the Next Charge**
- **Actor:** System (daily trigger: Cloud Scheduler → Pub/Sub → `ITriggerBus` handler; `/cron/billing-issue-charges` is the manual path).
- **Preconditions:** Subscription `TRIALING` or `ACTIVE`, not cancelling, due date within 10 days.
- **Trigger:** Daily cron.
- **Main Flow:**
  1. For each due subscription (standalone partial index on `next_due_date`), compute lines from the items scheduled for the next service period, reading each amount from the price version in force on that period's **start date**.
  2. Tax-inclusive BR charges carry zero extra tax and their `amount_minor` is known at insert. A tax-exclusive US charge is inserted with `subtotal_minor` only: Stripe computes the tax when it finalizes the invoice (step 3), so the provider result supplies `tax_amount_minor`, `amount_minor` and the tax lines, written once. There is no separate tax port (decision 62).
  3. Insert the `Charge` (`kind = PERIOD`) and feature lines in one transaction (`UNIQUE(tenant_id, subscription_id, period_start)` makes a re-run idempotent), then — outside the DB transaction — ask the provider (via the port, `billingType = UNDEFINED` for Asaas, a finalized `send_invoice` invoice for Stripe) to create the charge, and store its id, payment link, link expiry and, for US, the tax result and `amount_minor` with `provider_creation_status = READY`. `ChargeIssued` and the manager email go out only after READY.
  4. For a `TRIALING` subscription the first charge is issued from the manager's **confirmed** selection (`plan_confirmed_at` set, decision 115), due at trial end, as soon as it is within `CHARGE_ISSUE_LEAD_DAYS` (10 days before trial end). If the plan is still unconfirmed at `trial_ends_at − PLAN_CONFIRM_FALLBACK_DAYS` (3 days), the job issues it from the default paid items and the email says plainly which features and what total were invoiced and how to change them (A10). `next_due_date` advances one cycle in the same transaction that inserts a `PERIOD` charge (decision 118).
- **Alternative Flows:**
  - **A1: Subscription is `exempt`** (Ikaro's own tenant or an operator-exempted tenant) → no charge created.
  - **A8: BR customer has no valid CPF/CNPJ** (should not happen: signup and `POST /internal/tenants` require it) → no provider charge; manager banner and email, same hold as A7, and issuing **resumes automatically** when the identity is saved; no operator step. A trial in this state is suspended at trial end.
  - **A6: No renewable price version for an item's (feature, tier, country, cycle)** → the charge is not issued; this is prevented at deploy time (a startup/CI check requires a complete price set for every enabled country) and alerts only if it somehow happens. A catalog row hidden from new selection remains renewable for existing subscribers.
  - **A2: Provider call fails** → the charge keeps `provider_creation_status = PENDING`; the retry candidate query, run inside this same issuing job, re-attempts creation without inserting a duplicate period charge; alert after N failures.
  - **A3: Job runs twice** → no duplicates.
  - **A10: Trial plan not confirmed before the fallback day** → the invoice is issued from the default selection; if the manager changes the plan afterwards, the normal cancel-and-re-issue applies (CAND-31) as long as the invoice is unpaid.
  - **A11: Tenant deactivated (`is_active = false`)** → skipped (CAND-37).
  - **A4: Tenant `SUSPENDED`** → skipped (no charges while suspended).
  - **A5: Subscription is cancelling (`cancelAt` set)** → no charge for periods after `cancelAt`.
  - **A9: BR address missing** (decision 109) → same hold as A7 with `BILLING_ADDRESS_REQUIRED`: the first paid-plan selection is rejected until the full address is saved, issuing resumes automatically when it is saved, and a trial reaching its end with no charge is suspended by the CAND-10 trial-end rule after email and banner warnings.
  - **A7: US customer location is insufficient for tax calculation** (Stripe needs at least a 5-digit ZIP, discourages ZIP-only in many states, and leaves a standalone invoice in draft with `invoice.finalization_failed`) → reject first paid-plan selection until the full billing address (street, city, state, ZIP) is supplied; for an existing paid tenant, hold provider-charge creation, alert the manager and never silently issue an untaxed USD charge. For a trial this means **no charge exists at trial end, and the trial-end rule of CAND-10 suspends the subscription** — the manager is warned by email and banner before that.
- **Postconditions:** Next period's charge exists with a payment link.
- **Events Triggered:** `ChargeIssued`.

### **CAND-09: System Handles a Provider Webhook**
- **Actor:** Provider (Asaas) → public BFF route → internal backend.
- **Preconditions:** Webhook configured with a token; secret in Secret Manager.
- **Trigger:** HTTP POST with `asaas-access-token`.
- **Main Flow:**
  1. BFF validates the token (timing-safe) and forwards the raw body to the internal endpoint.
  2. Backend resolves the tenant from the provider customer id, normalizes the event, and in one transaction inserts `provider_events(provider, event_id)` (duplicate → 200), updates local charge/subscription state and writes email outbox events.
  3. A normalizing adapter maps the payment event to `PaymentConfirmed` / `PaymentOverdue` / `PaymentRefunded` / `PaymentChargeback` / auto-billing authorized / deactivated. **The paid signal is method-dependent (verified in Asaas docs):** Pix emits only `PAYMENT_RECEIVED`, boleto `CONFIRMED` then `RECEIVED`, card `CONFIRMED` then `RECEIVED` about 32 days later; whichever of `CONFIRMED`/`RECEIVED` arrives first for the charge produces the single `PaymentConfirmed`, the later one is a no-op. For Stripe the paid signal is `invoice.paid` (re-read from the API; events can arrive out of order). `PAYMENT_PARTIALLY_REFUNDED` and `charge.refunded` partial → no access change; `PAYMENT_CHARGEBACK_REQUESTED` → dispute opened, no access change. **For Asaas, a state-changing event is applied only after `fetchChargeStatus` confirms it and the amount matches** (decision 101), so a leaked webhook token cannot forge a payment.
  4. `PaymentConfirmed` marks paid, sets `has_ever_paid`, and reactivates `PAST_DUE`/`SUSPENDED` subscriptions (row lock); a `SUSPENDED` recovery charge also writes its period and anchor (CAND-29). A `TRIALING` subscription stays `TRIALING` after its first charge is paid until the sweep turns it `ACTIVE` at trial end (CAND-10 a3). If the provider could not cancel a stale charge because it was already paid, that charge is the payment (decision 85). The local due-date sweep owns `PENDING` → `OVERDUE`/`PAST_DUE`, so an overdue webhook only confirms/reconciles that result.
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
- **Actor:** System (`/cron/billing-status-sweep`, **hourly**, decision 92).
- **Preconditions:** None.
- **Trigger:** Hourly trigger (decision 92; Cloud Scheduler → Pub/Sub → `ITriggerBus` handler; the `/cron/billing-status-sweep` endpoint is the manual path).
- **Main Flow:** all dates are evaluated in `subscriptions.timezone`. (a) any `PENDING` charge past its tenant-local due date becomes `OVERDUE`; for an `ACTIVE` subscription it becomes `PAST_DUE` and records `pastDueSince`; (a2) **trial end:** a `TRIALING` subscription whose `trialEndsAt` plus the settlement margin has passed (`PAYMENT_SETTLEMENT_MARGIN_HOURS` = 24 h, or `PAYMENT_PENDING_MARGIN_BUSINESS_DAYS` = 3 business days when `payment_return_seen_at` shows the manager already tried to pay a still-open charge, decision 117), after re-reading the charge from the provider, with its first charge unpaid — or with no charge at all — becomes `SUSPENDED` (`NON_PAYMENT`) directly; there is no `PAST_DUE` after a trial; (b) `PAST_DUE` older than 14 days (or past `graceUntil`) becomes `SUSPENDED` (`NON_PAYMENT`); **on every suspension for `NON_PAYMENT` or `PAYMENT_REVERSED` the sweep cancels the stale open charge (locally and at the provider) and issues the recovery charge** (decision 72); (c) `cancelAt` reached becomes `SUSPENDED` (`CANCELED`); (a3) **trial → paid:** a `TRIALING` subscription whose `trialEndsAt` has passed and whose first charge is `PAID` becomes `ACTIVE` (period starts at trial end, `anchor_day` = trial-end local day clamped to 28); (d) confirmed payment converts `PAST_DUE`/`SUSPENDED` to `ACTIVE` through CAND-09. The trial's first paid period starts at its trial end and later renewals use that anchor day. `exempt` subscriptions are never touched by this job.
- **Alternative Flows:**
  - **A1: Job runs twice** → idempotent (status checks).
  - **A2: A payment arrives during the sweep** → row lock; the paid state wins.
  - **A3: Provider cancel call fails** → the local state still changes; the retry is picked up by reconcile.
  - **A4: Suspension freeze active** (`billing.provider_health.freeze_active`, CAND-35) → the sweep still marks `OVERDUE`/`PAST_DUE` but suspends nobody until reconcile succeeds again.
- **Postconditions:** Statuses consistent with the ladder.
- **Events Triggered:** `SubscriptionPastDue`, `SubscriptionSuspended`.

### **CAND-11: System Reconciles Charges with the Provider**
- **Actor:** System (`/cron/billing-reconcile`).
- **Preconditions:** Provider configured.
- **Trigger:** Daily cron.
- **Main Flow:** For every open or recently changed charge, fetch its provider status and apply any difference through the same use case as CAND-09; charges of at-risk tenants (`TRIALING` near its end, `PAST_DUE`, `SUSPENDED` with an open recovery charge) are reconciled **hourly**, the rest daily. A manager's return from the hosted page triggers an on-demand single-charge refresh (`payment_return_seen_at`). Each successful run updates `billing.provider_health`. Drift is corrected by itself. Report drift counts.
- **Alternative Flows:**
  - **A1: Provider unreachable** → job fails, ops alert, retried next run.
  - **A2: Local charge has no provider id older than 24h** → re-attempt creation through the issuing job's retry query, or alert.
  - **A3: Drift found** → fixed, counted, ops alert if above a threshold.
- **Postconditions:** Missed webhooks do not leave a paying tenant locked out.
- **Events Triggered:** As CAND-09.

---

## Group C — Manager billing

### **CAND-12: Manager Views the Billing Page**
- **Actor:** Staff (MANAGER). Every manager of the tenant.
- **Preconditions:** Logged in; tenant has a subscription.
- **Trigger:** Manager opens Billing (or is redirected there when suspended).
- **Main Flow:** The page shows status, trial end or next due date, active features with their tier and price, total, the open charge with **Pagar agora** (opens the provider's hosted page), the automatic-billing status, billing identity, paginated charge history (each charge shows subtotal, tax lines per jurisdiction for US and total; BR has none; statuses `PENDING`/`PAID`/`OVERDUE`/`FAILED`/`CANCELED`/`REFUNDED`/`CHARGEBACK`, each paid charge with its receipt link), cancel link, and "Falar com a gente".
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
- **Main Flow:** Fields: tax-ID type (`CNPJ`/`CPF`/`OTHER`) and number (**BR: always present from signup, editable but never blankable** because the provider needs it, decision 57; US: optional), legal name, billing email, address (**BR and US: the full address is required before the first paid selection**, decisions 39 and 109). The form is rendered from the billing country's `CountrySpec` — labels, placeholders, formats and fields follow the country (BR: Logradouro, Número, Complemento, Bairro, Cidade, UF, CEP with ViaCEP autofill; US: Street, Number, Apt/Suite, City, State, ZIP Code, no neighbourhood) in the tenant's language. System validates by country (shared `Address` value object + `AddressSpec`) and saves; synced to the provider customer when a charge is next issued.
- **Alternative Flows:**
  - **A1: Invalid CNPJ/CPF check digits** → field error.
  - **A2: Invalid email** → field error.
  - **A3: US tenant** → no CNPJ/CPF type offered; address labels and formats in English.
  - **A5: Postal code or state in the wrong format for the country** → field error from the country's rule (e.g. CEP `00000-000`, US ZIP `90210`).
  - **A4: Save fails** → error message, form kept.
- **Postconditions:** Identity stored. It never blocks *using* the product (R5); the minimum (BR CPF/CNPJ, US full address) is what lets a charge be issued.
- **Events Triggered:** None.

### **CAND-14: Manager Pays an Open Charge**
- **Actor:** Staff (MANAGER).
- **Preconditions:** Open charge with a payment link.
- **Trigger:** Manager clicks **Pagar agora**.
- **Main Flow:** The BFF returns the provider's hosted payment URL; the manager pays by card, Pix or boleto on the provider's page; the webhook (CAND-09) confirms and the status updates.
- **Alternative Flows:**
  - **A1: Link expired** → `POST .../payment-link` asks the provider (port) for a usable link: Stripe hosted invoice URLs expire 30 days after the due date and a fresh one is issued; Asaas's `invoiceUrl` has no documented expiry (the Pix QR stays valid 12 months after due, a boleto may be auto-cancelled after due), so the adapter re-reads the charge and returns the current URL — behaviour after due date is a launch gate (`tenant-billing_PROVIDERS.md` §5).
  - **A2: Payment pending** (Pix/boleto compensation) → page shows "pagamento em processamento".
  - **A3: Payment fails** → charge stays open; page explains and offers retry.
  - **A4: Charge already paid** → the page refreshes to the paid state.
- **Postconditions:** Charge paid; tenant reactivated if it was `PAST_DUE`/`SUSPENDED`. While `SUSPENDED`, `summary.openCharge` is the `RECOVERY` charge (issued at suspension, or on "Reativar assinatura" for a `CANCELED` suspension).
- **Events Triggered:** (via CAND-09) `ChargePaid`, `SubscriptionReactivated`.

---

## Group D — Enforcement across the system

### **CAND-15: System Resolves a Tenant's Access (`TenantAccessPort`)**
- **Actor:** Any request, job or handler.
- **Preconditions:** None.
- **Trigger:** A guard, use case, handler or cron needs "is tenant operational / is feature X entitled".
- **Main Flow:** Caller passes an explicit `tenantId` to the shared port; Billing's cached adapter returns `{ status, suspensionReason, features: [{ key, tier }] }`. `operational = status != SUSPENDED`; `entitled(f) = operational && f in features`.
- **Alternative Flows:**
  - **A1: No subscription row after a successful lookup** → provisioning/data-integrity incident: after the `PROVISIONING_GRACE_MINUTES` window deny tenant operations, emit a metric/log and let the self-heal job (CAND-35) repair it; an alert fires only if self-heal fails. Inside the window the tenant is treated as a pending trial. This is distinct from an adapter lookup error.
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
- **Main Flow:** The send path asks the access port for the tenant (an `exempt` tenant is never suspended, so its sends are never skipped); if suspended it skips the send and records `SKIPPED_TENANT_SUSPENDED` (not replayed later); templates belonging to Billing (R10) are exempt. **Placement (verified in code):** the gate runs in `BaseNotificationUseCase` *before* dispatch and writes the `SKIPPED_*` log and inbox row itself — inside the dispatcher a skip would be logged as `SENT` (`saveLog` always calls `markSent()`); the `status` column is widened first (`VARCHAR(20)` cannot hold the new names); the parallel `SendAvailabilityAlertMatchedEmailService` send path needs the same gate.
- **Alternative Flows:**
  - **A1: Billing email but the manager has no address** → logged, ops alert.
  - **A2: Access lookup error** → fail open (send).
  - **A3: `APP_ENV=staging` and the recipient is not in `EMAIL_RECIPIENT_ALLOWLIST`** → the send is dropped and logged `SKIPPED_NOT_ALLOWLISTED`, for every template including Billing's (decision 69). Ignored in `production` and `local` (Mailhog).
- **Postconditions:** No tenant/customer/staff messages while suspended.
- **Events Triggered:** None.

### **CAND-19: Billing Emails to the Manager**
- **Actor:** System (one event handler per event; each handler calls exactly one use case).
- **Preconditions:** A platform-level (NULL-tenant) template exists in both languages (pt-BR/en) — shipped by migration and read through the new global-template lookup; **no per-tenant copy or backfill** (decision 100). The tenant is not `exempt` (R12): exempt tenants receive no billing emails, and the handlers skip them.
- **Trigger:** `ChargeIssued`, `ChargePaid`, `SubscriptionPastDue`, `SubscriptionSuspended`, `SubscriptionReactivated`, `SubscriptionCancelled`, `PlanChanged`, `BillingReminderDue` (Ikaro sends all of them: Asaas customers are created with `notificationDisabled = true` and Stripe customer emails are off, decision 59), and `SubscriptionPriceChangeAnnounced` ("o valor de X passa de R$ 39 para R$ 49 a partir de 10/12; seu novo total mensal será R$ …").
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
  3. Visitor fills business name, slug, country (BR|US), **CPF or CNPJ for BR** and accepts Terms and Privacy; language derives from the country.
  4. System re-validates server-side; the BFF asks Billing to reserve the registration (internal endpoint, advisory lock on the Google `sub`, trial rule A3), which stores the Google `sub`, the BR tax id and the accepted terms version/timestamp in `signup_registrations`; the BFF then calls Platform's signup use case, which verifies Turnstile and calls the existing `ProvisionTenantUseCase` with the Google email as first manager and the `registrationId`. None of the personal data travels in the event (decision 120).
  5. The endpoint returns the account-created page. `TenantProvisioned` asynchronously triggers Staff (first manager) and Billing (CAND-01); once the first-manager work completes, the existing invitation/login email is sent to the verified Google email. The visitor is not issued a tenant JWT and is not sent to the dashboard by signup.
- **Alternative Flows:**
  - **A1: Slug taken / reserved / invalid** → field error with suggestions.
  - **A2: Turnstile fails** → retry screen.
  - **A3: Trial not available for this Google account** (an earlier self-signup tenant of the same `sub` never paid) → `SIGNUP_TRIAL_NOT_AVAILABLE`, "Você já tem um teste em andamento ou não concluído" with two self-service actions: "Entrar na conta existente" and "Descartar o teste não pago e começar de novo" (CAND-36, which needs a signed-in manager of that tenant; until the purge participants ship it shows the honest interim message, OPERATIONS O13). A first signup, or one where every earlier signup tenant has paid, always gets the trial.
  - **A4: Rate limit exceeded** (per IP/day) → friendly "tente mais tarde".
  - **A5: Terms not accepted** → blocked.
  - **A9: BR tax ID missing or with invalid check digits** → `SIGNUP_TAX_ID_REQUIRED` / `SIGNUP_TAX_ID_INVALID`, field error; nothing is created.
  - **A6: Tenant creation transaction fails** → nothing is created and retry is offered. If a post-commit `TenantProvisioned` consumer is delayed or fails, its durable event retry completes the first-manager and Billing setup; the account-created page still directs the visitor to email rather than implying that dashboard access is already ready.
  - **A7: Country without prices, or US while `FEATURE_FLAG_SIGNUP_US` is off (no Stripe adapter yet)** → not offered.
  - **A10: Confirmation email not received** → the account-created page offers a rate-limited resend and, once the first manager exists, a one-click Google sign-in to the existing staff login.
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
- **Main Flow:** Banner "Faltam N dias do seu teste" links to billing and, until the plan is confirmed, shows "Confirme seu plano para gerarmos a primeira cobrança" (CAND-31, decision 115); trial entitlements remain fully enabled. The first invoice is issued as soon as the manager confirms (from 10 days before trial end on), or automatically from the default selection 3 days before the end with a plain-language email (CAND-08 A10); it is due on trial end.
- **Alternative Flows:**
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
  3. Manager saves (single primary action; during the trial the same action is labelled **Confirmar plano** and also sets `plan_confirmed_at`, `POST /v1/billing/plan/confirm` confirms the default untouched, decision 115). System validates the proposed final dependency graph, schedules the item/tier changes at the next paid service-period start, and, if the next invoice is already issued and unpaid, cancels and re-issues it after commit. A paid invoice is never changed.
- **Alternative Flows:**
  - **A1: Dependency unmet / dependents active** (Loyalty without Booking; removing Booking while Loyalty is active) → whole selection rejected with the specific message; nothing saved.
  - **A2: `PAST_DUE` or `SUSPENDED`** → plan tab read-only until a settled payment/reactivation; no unpaid plan change is queued.
  - **A3: Trial** → all features remain active through trial; selection only determines the first paid period.
  - **A5: Empty selection** → rejected (at least one feature).
  - **A6: No list price for the country/tier** → feature shown as unavailable.
  - **A7: Next invoice already paid** → change applies from the following renewal; the page says so.
  - **A8: Provider re-issue fails** → scheduled selection is saved and the provider-creation retry handles the replacement invoice; alert on repeated failure.
  - **A9: Save error** → message, selection kept.
  - **A11: Removing `BOOKING`** (which includes recurring reservations and availability alerts) while any `PENDING`/`INFO_REQUESTED`/`APPROVED` booking, `PENDING_APPROVAL`/`ACTIVE` recurring schedule or `ACTIVE` alert extends on or after the effective date → rejected with `BILLING_FEATURE_IN_USE`; after a valid save a `bookableUntil` cap applies to every booking-window consumer (decision 81, main doc §4.1 lists the new Booking queries and consumers).
  - **A12: The provider refuses to cancel the old invoice because it was just paid** → the change waits for the following renewal and the page says so.
  - **A10: Cancellation scheduled (`cancelAt` set)** → plan tab read-only ("reative a assinatura para alterar o plano").
- **Postconditions:** Current entitlements are unchanged; the validated selection applies at the next paid service-period start.
- **Events Triggered:** `PlanChanged` (emailed to the billing email); a re-issued charge raises `ChargeIssued`.

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
  1. At 30 and 7 days before, a `TenantPurgeWarning` event (one per threshold, deduped by `purge_warning_30_sent_at`/`purge_warning_7_sent_at` on the subscription, cleared on reactivation) sends a warning email to the manager (Billing template, exempt from the gate) that says what will be deleted and how to ask for an export.
  2. At the deadline Billing creates a durable `TenantPurgeJob` and publishes `TenantPurgeRequested`. Each bounded context deletes its own data idempotently and publishes `TenantPurgeContextCompleted` after its local transaction commits.
  3. Billing records every completion; storage cleanup, provider cancellation and Billing anonymization are required steps. Only after all required completions does Platform delete the tenant root and release the slug.
- **Alternative Flows:**
  - **A1: Tenant reactivated before the deadline** → clock cleared.
  - **A2: One context's deletion fails** → its event handler rethrows and is retried with exponential backoff; the purge job remains `IN_PROGRESS`/`FAILED` and stays inaccessible through its existing suspension; an alert fires only after N failed attempts (OPERATIONS O8). `PURGING` is not a subscription status.
  - **A3: Provider cancellation fails** → retried; does not block local erasure.
  - **A4: Ikaro's own tenant or any `exempt` tenant** → never purged (guarded).
  - **A5: Deletion capability missing in a context** → the purge cron stays disabled until every participant has shipped its idempotent deletion story.
- **Postconditions:** Tenant data erased; slug free.
- **Events Triggered:** `TenantPurgeRequested`.

### **CAND-28: Manager Cancels the Subscription**
- **Actor:** Staff (MANAGER).
- **Preconditions:** `ACTIVE` / `PAST_DUE` / `TRIALING`.
- **Trigger:** Manager clicks "Cancelar assinatura".
- **Main Flow:** For `ACTIVE`, confirmation states access continues until the paid-period end; it sets `cancelAt`, immediately cancels every unpaid charge for a period beginning on/after that date, and shows "Cancelada — acesso até dd/mm". For `PAST_DUE`, cancellation is immediate: any open charge is cancelled and the subscription becomes `SUSPENDED` (`CANCELED`). For `TRIALING`, if the first invoice is already `PAID` the cancel is scheduled at trial end (`cancelAt = trialEndsAt`, access continues, nothing lost); otherwise it is immediate. `cancelAt` for `ACTIVE` is the end of the last paid period. Nothing is refunded.
- **Alternative Flows:**
  - **A1: Already cancelling** → shows the scheduled state.
  - **A2: Provider cancel fails** → local state is saved and reconciled later; the manager sees success only after the local save.
  - **A3: Trial tenant cancels** → immediate if nothing was paid; scheduled at trial end if the first invoice is already paid (decision 89).
  - **A4: Cancel error** → error message, retry.
- **Postconditions:** Cancellation scheduled (`ACTIVE`) or the subscription suspended (`PAST_DUE`/`TRIALING`).
- **Events Triggered:** `SubscriptionCancelled` on every cancel (emailed to the billing email); `SubscriptionSuspended` immediately for `PAST_DUE` or an unpaid `TRIALING`; for `ACTIVE` none until `SubscriptionSuspended` at `cancelAt`. Response: `200 { cancelAt }` for a scheduled cancel, `200 { status: "SUSPENDED", cancelAt: null }` for an immediate one.

> **Slice H note (annual billing, §4.8):** CAND-28's "end of the last paid period" is a year for an annual subscription, with no refund; CAND-29's recovery charge for an annual tenant is always one month at the monthly price and returns the subscription to `MONTHLY` (decisions 125–126).

### **CAND-29: Manager Reactivates a Cancelled or Suspended Subscription**
- **Actor:** Staff (MANAGER).
- **Preconditions:** Cancelling, or `SUSPENDED` (either reason), before the purge.
- **Trigger:** Manager clicks "Reativar assinatura" (a `CANCELED` suspension or a scheduled cancel) or pays the recovery charge shown while suspended (`NON_PAYMENT`/`PAYMENT_REVERSED`, issued at suspension).
- **Main Flow:** If still within the paid period, `cancelAt` is simply cleared. If suspended, any open `PERIOD` charge is cancelled (locally and at the provider, never re-dated) and one `RECOVERY` charge for one month is issued: amount fixed at issue from the price versions in force on the issue date, lines = the current items. On payment the status becomes `ACTIVE`, the period starts at payment, `anchor_day` is the payment's tenant-local day clamped to 28, (the period lives on the subscription; the charge's own period stays empty); no months are owed for the gap. Calling reactivate again while a recovery charge is open returns that charge.
- **Alternative Flows:**
  - **A1: Data already purged** → not possible; a new signup is required (contact Ikaro for the trial rule).
  - **A2: Payment not completed** → remains suspended.
  - **A3: Provider charge creation fails** → error with retry.
- **Postconditions:** Tenant active.
- **Events Triggered:** `ChargeIssued`, `ChargePaid`, `SubscriptionReactivated`.

### **CAND-30: Manager Enables or Disables Automatic Charging (Pix Automático only)** — *DEFERRED RELEASE GATE*
- **Actor:** Staff (MANAGER).
- **Preconditions:** BRL tenant on Asaas, Ikaro's Asaas account is a PJ with a CNPJ active 6+ months **and** the Pix Automático flow is verified end-to-end in the sandbox and production (`tenant-billing_PROVIDERS.md` §5). Until that gate passes, this UI and endpoint are not released. Card auto-billing is not offered (Asaas tokenization passes card data through Ikaro's server, decision 58).
- **Trigger:** Manager clicks "Ativar cobrança automática" / "Desativar".
- **Main Flow:** BFF asks the provider (port) for a hosted authorization URL (Pix Automático: the first payment's QR code carries the authorization, approved in the bank app); the manager completes it on the provider's page; the webhook marks automatic charging active once the bank confirms; the page shows "Pix Automático ativo". Ikaro keeps creating each charge itself (`paymentCreationMode = MANUAL`) referencing the authorization. Disabling asks the provider to revoke it. The hosted payment link keeps working in every case.
- **Alternative Flows:**
  - **A1: Authorization not completed** → status "pendente" with a way to restart.
  - **A2: Provider error** → message, retry.
  - **A3: Authorization later revoked at the bank** → webhook sets it inactive; next charge falls back to the hosted payment link.
  - **A4: USD tenant** → option hidden until a Stripe adapter exists.
- **Postconditions:** Subsequent charges are collected automatically.
- **Events Triggered:** None. *(Built as a later slice, after the Pix Automático gate.)*

### **CAND-34: System Sends Dunning Reminders**
- **Actor:** System (daily `billing-reminders` job via the trigger pattern; `/cron/billing-reminders` is the manual path).
- **Preconditions:** Subscription not `exempt`; the tenant has a billing email or managers.
- **Trigger:** Daily.
- **Main Flow:** For each subscription it publishes `BillingReminderDue` once per milestone (deduped by `(subscription, kind, daysOffset, chargeId)`): `PLAN_CONFIRMATION` at 10, 7 and 4 days before trial end while `plan_confirmed_at` is NULL (decision 115; the last one says the default plan will be invoiced in one day), `TRIAL_ENDING` at 7 and 3 days before trial end and on the last day (with the payment link when the first invoice exists), `CHARGE_DUE_SOON` 3 days before a charge's due date, `CHARGE_OVERDUE` at 1, 3, 7 and 12 days after the due date of a `PAST_DUE` subscription (the last says the date of suspension). Ikaro sends every reminder itself because provider notifications are off (decision 59). Billing templates are exempt from the suspension gate.
- **Alternative Flows:**
  - **A1: Charge paid between scheduling and sending** → the handler re-checks and skips.
  - **A2: No recipient** → logged; the banner remains.
- **Postconditions:** The manager had repeated, dated warnings before any suspension; no human sends reminders.
- **Events Triggered:** `BillingReminderDue`.

### **CAND-35: System Heals Itself (Provisioning Repair, Provider Health, Suspension Freeze)**
- **Actor:** System (hourly `billing-self-heal` trigger).
- **Preconditions:** None.
- **Trigger:** Hourly.
- **Main Flow:**
  1. **Provisioning repair:** tenants older than `PROVISIONING_GRACE_MINUTES` with no subscription get their trial created through the CAND-01 use case (idempotent), using the stored `TenantProvisioned` data.
  2. **Provider health:** checks each provider's webhook state through its API; a paused or disabled webhook is re-enabled where the API allows (launch-gate check), otherwise an alert is raised. Records `billing.provider_health`.
  3. **Suspension freeze:** if reconcile has not succeeded for 24 hours, or the provider is unreachable, `freeze_active` is set and the status sweep suspends nobody; it clears itself after the next successful reconcile. Tenants are never locked out because Ikaro or the provider was down, and no operator grace is needed.
- **Alternative Flows:**
  - **A1: Repair fails repeatedly** → alert after N attempts (OPERATIONS O8).
  - **A2: Provider API cannot re-enable the webhook** → alert with the runbook; reconcile keeps money correct meanwhile.
- **Postconditions:** The common failure modes resolve without an operator.
- **Events Triggered:** None (a repaired trial raises nothing new; `SubscriptionSuspended` is simply delayed during a freeze).

### **CAND-36: Manager Discards a Never-Paid Tenant (Self-Service)** — *review 3, decision 116*
- **Actor:** Staff (MANAGER).
- **Preconditions:** Subscription has `has_ever_paid = false`, is not `exempt`, and is `TRIALING` or `SUSPENDED` (`NON_PAYMENT` or `CANCELED`; not `OPERATOR`). The purge participants (stories G1–G10) are deployed.
- **Trigger:** Manager opens "Descartar este teste" on the billing page (or follows the link from the `SIGNUP_TRIAL_NOT_AVAILABLE` page after signing in).
- **Main Flow:**
  1. A confirmation page lists exactly what is erased (hotsite, services, bookings, customers, staff, uploads) and that it cannot be undone; the manager types the tenant slug to confirm.
  2. Billing cancels any open charge (locally and at the provider), creates a `TenantPurgeJob` with reason `SELF_SERVICE_DISCARD` and publishes `TenantPurgeRequested`; the subscription is shown as "Descartando…" (job status, not a subscription status) and every login for that tenant is already inert (it is `SUSPENDED` first when it was `TRIALING`).
  3. The same participant pipeline as CAND-27 runs immediately; when it completes, Billing deletes the `signup_registrations` row (frees the trial eligibility) and Platform deletes the tenant root and releases the slug.
  4. A confirmation email goes to the billing email/managers before erasure starts (Billing template, gate-exempt) — the last message the tenant receives.
- **Alternative Flows:**
  - **A1: Any charge was ever paid** → refused (`BILLING_DISCARD_NOT_ALLOWED`); the tenant follows the 180-day path or cancels.
  - **A2: A participant fails** → retried with backoff like CAND-27; alert after N attempts (O8); the tenant stays inaccessible.
  - **A3: Purge participants not yet deployed** → the action is not offered and the signup error page names the interim operator path (OPERATIONS O13).
  - **A4: Slug typed wrongly** → blocked.
- **Postconditions:** Tenant erased, slug and trial eligibility free; no support contact needed.
- **Events Triggered:** `TenantPurgeRequested` (reason `SELF_SERVICE_DISCARD`).

### **CAND-37: A Deactivated Tenant Stops Being Billed** — *review 3, open decision O-D1*
- **Actor:** System (reacting to a future `TenantDeactivated` event from the offboarding flow, M17-S51).
- **Preconditions:** The offboarding flow exists (today `Tenant.deactivate()` has no production caller — verified).
- **Main Flow:** Billing cancels any open charge (locally and at the provider), clears `cancel_at`, and sets a `SUSPENDED`/`CANCELED` subscription so no further charge is issued and the clean-up clock starts; the issue job also skips tenants with `is_active = false`.
- **Alternative Flows:** **A1:** `exempt` tenant → no change. **A2:** Re-activation of a tenant → manual reactivation path (CAND-29) applies.
- **Postconditions:** A paying tenant that is offboarded is not charged afterwards.
- **Events Triggered:** `SubscriptionCancelled`.

### **CAND-39: Manager Chooses or Switches the Billing Cycle (Monthly / Annual)** — *slice H, decision 123*
- **Actor:** Staff (MANAGER).
- **Preconditions:** Slice H released; subscription `TRIALING` or `ACTIVE` (not `PAST_DUE`/`SUSPENDED`, plan read-only), not cancelling.
- **Trigger:** Manager toggles **Mensal | Anual** on the Plano tab (or during the trial, when confirming the first plan).
- **Main Flow:** The tab re-quotes every feature and the total in the chosen cycle (annual amounts with "equivale a R$ X/mês"); saving schedules `next_cycle` for the next paid period start and shows the date; the next unpaid invoice, if already issued, is cancelled and re-issued in the new cycle (annual: issued 30 days before the period start). A trial confirms its first plan and cycle together (CAND-31).
- **Alternative Flows:** **A1:** next invoice already paid → the switch waits for the following renewal. **A2:** no annual price for a selected feature/tier/country → the annual option is hidden (no mixed cycles). **A3:** annual → monthly → applies at the end of the paid year, nothing is refunded. **A4:** price change on an annual price → announced with at least 60 days' notice.
- **Postconditions:** `next_cycle`/`next_cycle_from` scheduled; entitlements unchanged until then.
- **Events Triggered:** `PlanChanged` (carries the cycle); a re-issued charge raises `ChargeIssued`.

### **CAND-40: Annual Subscriber Adds a Feature Mid-Year (Co-terminus Add-on)** — *slice H, decision 124 (confirmed by the owner, 2026-10-28)*
- **Actor:** Staff (MANAGER).
- **Preconditions:** `ACTIVE` annual subscription, dependencies satisfied, no pending cycle switch.
- **Trigger:** Manager adds a feature on the Plano tab of an annual subscription.
- **Main Flow:** The page shows "Você paga só os meses restantes": remaining whole months × the feature's monthly price, never more than its annual price. On confirm, Billing creates an `ADDON` charge (due on issue) and its provider link; when it is paid the item starts at payment and joins the annual selection from the next renewal. Entitlement before payment is unchanged.
- **Alternative Flows:** **A1:** payment never completes → charge expires, no item. **A2:** the feature is removed later → effective at renewal, nothing refunded. **A3:** monthly subscription → not applicable (monthly additions start next period, as before).
- **Postconditions:** Feature active now; renews with the plan.
- **Events Triggered:** `ChargeIssued`, `ChargePaid`, `PlanChanged`.

### **CAND-38: Manager Enables Automatic Card Collection (Provider-Hosted Recurring Checkout)** — *slice F2, decision 114, gated*
- **Actor:** Staff (MANAGER).
- **Preconditions:** BRL tenant on Asaas; the F2 launch gates of `tenant-billing_PROVIDERS.md` §5 are verified in the sandbox and production (card data never touches Ikaro, account enablement, terminal behaviour after refused attempts). Until then the UI and endpoints are not released.
- **Trigger:** Manager clicks "Pagar automaticamente no cartão".
- **Main Flow:** Billing asks the provider (port) to create a hosted recurring checkout whose first due date is the next unissued `next_due_date` and whose value is the current plan total; the manager enters the card on the provider's page; `CHECKOUT_PAID`/subscription-created webhooks mark automatic collection active. From then on the provider generates each period charge; Billing mirrors it from the webhook as a `PERIOD` charge with `origin = PROVIDER_SUBSCRIPTION` (lines from the current items) and does not issue its own; plan/price changes `PUT` the subscription value at the period boundary. A refused charge follows the normal ladder (reminders, `PAST_DUE`, 14 days) and the hosted link remains available.
- **Alternative Flows:**
  - **A1: Checkout abandoned/expired** → status stays manual; restart offered.
  - **A2: Card replaced/expired** → provider webhook; the manager is emailed and falls back to the hosted link.
  - **A3: Disable** → provider subscription cancelled (pending charges removed); Ikaro resumes issuing its own charges from the next unissued period, without duplicates.
  - **A4: Gate fails** → slice dropped; baseline unaffected.
  - **A5: Both an Ikaro-issued and a provider-generated charge exist for one period** → the provider one wins if paid; the other is cancelled; a double payment is refunded in the provider console (OPERATIONS O5).
- **Postconditions:** Monthly payment needs no manager action while the card works.
- **Events Triggered:** `ChargeIssued` (mirrored), `ChargePaid`.

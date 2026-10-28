# Discovery: Tenant Billing — API Sketch

**Status:** Discovery — endpoint inventory and shapes at sketch level. Final contracts are written into `docs/API_CONTRACTS.md` on promotion. Conventions follow `docs/API_CONTRACTS.md` § Base Standards: the web only talks to the **BFF** (`/v1`), the BFF forwards actor headers to the internal backend, errors are RFC 9457 Problem Details, money is **integer minor units + ISO currency** (never floats), dates ISO-8601 UTC (`due_date`: `YYYY-MM-DD`). List endpoints use **Pattern A** pagination (`items` + `pagination {limit, offset, total, hasMore}`) like `GET /bookings`.

**Companion docs:** `tenant-billing.md` · `tenant-billing_USECASES.md` · `tenant-billing_DATA_MODEL.md` · `tenant-billing_MODULE.md` · `tenant-billing_OPERATIONS.md`.

Placement rules: public routes live in the billing slice's `billing.public.controller.ts` (`@Public()`); authenticated routes in `billing.controller.ts`; the signup routes (`/v1/public/signup/*`) live in the `platform` slice (`platform.public.controller.ts`, decision 96) and reach Billing only through BFF orchestration; response types/Zod schemas in sibling `.types.ts`/`.schemas.ts`; mappers in `billing.mapper.ts` (BFF layout, CLAUDE.md §11). Types shared with the web go in `@ikaro/types` (grep it first).

## 1. Manager-facing (BFF, JWT, role MANAGER)

All require `Authorization` (httpOnly cookie) and tenant scope from the JWT; staff/customer get 403. For a **manager** of a `SUSPENDED` tenant these are the only routes allowed (alongside the access endpoint, logout and the tenant-switch endpoints, `@SuspensionAccess(AUTH_TENANT_SWITCH)`); staff and customer have their own narrow suspended-state routes (notice, history, cancel a future booking — §9).

| Method / path | Purpose | CAND |
|---|---|---|
| `GET /v1/billing/summary` | status, dates, active features, total, open charge, auto-billing, cancel state | 12 |
| `GET /v1/billing/charges?limit=&offset=` | paginated history | 12 |
| `GET /v1/billing/identity` | read billing identity | 13 |
| `PUT /v1/billing/identity` | save billing identity | 13 |
| `POST /v1/billing/charges/{chargeId}/payment-link` | (re)generate a hosted payment URL | 14 |
| `POST /v1/billing/charges/{chargeId}/payment-return` | the web calls it when the manager returns from the hosted page: sets `payment_return_seen_at` and triggers an on-demand single-charge refresh from the provider | 09, 14 |
| `GET /v1/billing/plan` | catalog, current and next-paid-period selection, tiers, dependencies and effective date | 31 |
| `POST /v1/billing/plan/preview` | preview the proposed **next paid period** selection and total | 31 |
| `PUT /v1/billing/plan` | schedule the next paid-period selection (`items: [{ featureKey, tier }]`); during the trial it also sets `plan_confirmed_at` | 31 |
| *(slice H)* `PUT /v1/billing/plan`, `POST /plan/preview`, `POST /plan/confirm` | accept an optional `cycle: "MONTHLY"|"ANNUAL"` (default: the subscription's current cycle); the preview returns the total and the monthly equivalent in that cycle; `GET /plan` returns both cycles' prices per feature and `nextCycle`/`nextCycleFrom` | 39 |
| *(slice H)* `POST /v1/billing/plan/addon` | annual subscribers: `{ featureKey, tier }` → `201 { chargeId, amountMinor, months }` (co-terminus `ADDON` charge; the web then calls `payment-link`); `409 BILLING_ADDON_NOT_ALLOWED` on a monthly subscription | 40 |
| `POST /v1/billing/plan/confirm` | trial only: confirm the current (default or saved) first paid selection unchanged → `200 { planConfirmedAt }`; triggers first-invoice issuing when within the 10-day lead; `409 BILLING_PLAN_ALREADY_CONFIRMED` | 31, 08 |
| `POST /v1/billing/discard` | self-service discard of a never-paid tenant `{ confirmSlug }` → `202 { purgeJobId }`; `409 BILLING_DISCARD_NOT_ALLOWED` when a charge was ever paid | 36 |
| `POST /v1/billing/cancel` | schedule cancellation at end of paid period | 28 |
| `POST /v1/billing/reactivate` | undo scheduled cancel / cancel the stale open charge and issue the one-month recovery charge | 29 |
| `POST /v1/billing/auto-billing` | **deferred release slice:** start verified provider-hosted authorization → `{ authorizationUrl }` (`mode` `PIX_AUTOMATICO`, or `CARD_RECURRING` in slice F2 → hosted recurring checkout URL) | 30, 38 |
| `DELETE /v1/billing/auto-billing` | **deferred release slice:** revoke automatic charging | 30, 38 |

```
GET /v1/billing/summary
200 {
  "status": "ACTIVE",                       // TRIALING | ACTIVE | PAST_DUE | SUSPENDED
  "exempt": false,                          // true: no charges ever; the page shows "Conta isenta de cobrança" and no actions
  "suspensionReason": null,                 // NON_PAYMENT | CANCELED | PAYMENT_REVERSED | OPERATOR when SUSPENDED
  "currency": "BRL", "countryCode": "BR",
  "cycle": "MONTHLY",                       // MONTHLY | ANNUAL (slice H); totals and item prices below are in this cycle
  "nextCycle": null, "nextCycleFrom": null, // a scheduled switch (slice H)
  "trialEndsAt": null, "nextDueDate": "2026-11-20", "pastDueSince": null,
  "suspendsAt": null,                       // PAST_DUE only: coalesce(grace_until, past_due_since + 14 days)
  "cancelAt": null,
  "purgeAt": null,                          // SUSPENDED only: suspended_at + 90 days (never paid) or 180 days (has_ever_paid)
  "planConfirmationRequired": false,        // true while TRIALING and plan_confirmed_at is NULL: the page and banner ask for "Confirmar plano" and no first invoice exists yet (decision 115)
  "planConfirmationFallbackAt": null,       // the date the default plan will be invoiced automatically if still unconfirmed
  "canDiscard": false,                      // never-paid TRIALING/SUSPENDED tenant and the purge participants are deployed → shows "Descartar este teste" (decision 116)
  "addressRequired": false,                 // BR and US: true until the full billing address is saved (NFS-e for BR, tax for US, decision 109); drives the Dados/Plano/banner warning (CAND-08 A7/A9)
  "items": [ { "featureKey": "HOTSITE", "tier": "STANDARD", "unitPriceMinor": 4900 },   // current-period price display (items store no price)
             { "featureKey": "CHATBOT", "tier": "BASIC", "unitPriceMinor": 3900 } ],
  "totalMinor": 8800,                       // net of tax; for US the page labels it "+ imposto calculado na cobrança" (tax exists only on the issued charge)
  "openCharge": { "id": "…", "kind": "PERIOD|RECOVERY", "dueDate": "2026-11-20", "subtotalMinor": 8800, "taxMinor": 0, "amountMinor": 8800, "status": "PENDING", "hasPaymentLink": true, "paymentLinkExpiresAt": "…" } | null,
  "autoBilling": { "mode": "NONE" | "PIX_AUTOMATICO" | "CARD_RECURRING", "status": "INACTIVE" | "PENDING_AUTHORIZATION" | "ACTIVE", "label": "Pix Automático ativo" | null },
  "paymentConfirmationPending": false,      // true while payment_return_seen_at is set and the charge is still open, until the paid webhook/reconcile lands (UI polls every 5 s, max ~60 s; the return already triggered an on-demand provider refresh)
  "upcomingPriceChanges": [ { "featureKey":"CHATBOT","tier":"PLUS","currentAmountMinor":7900,"newAmountMinor":8900,"effectiveFrom":"2026-12-10" } ]   // illustrative amounts
}

GET /v1/billing/charges?limit=20&offset=0
200 { "items": [ { "id","kind":"PERIOD|RECOVERY","periodStart"|null,"periodEnd"|null,"dueDate","subtotalMinor","taxMinor","amountMinor","currency",
                   "status": "PAID|PENDING|OVERDUE|FAILED|CANCELED|REFUNDED|CHARGEBACK",
                   "method":"PIX","paidAt","receiptUrl"|null, "lines":[{"featureKey","tier","unitPriceMinor"}],
                   "taxLines":[{"jurisdiction":"TX","taxType":"sales_tax","rateBasisPoints":625,"amountMinor":369}] } ],
      // taxLines is always [] and taxMinor 0 for BR (tax-inclusive prices); for US (slice E) the lines are the immutable Stripe Tax snapshot of that charge only — the tenant sees its own billing address's jurisdictions, never other locations; amountMinor = subtotalMinor + taxMinor
      "pagination": { "limit":20,"offset":0,"total":7,"hasMore":false } }

PUT /v1/billing/identity   (every field optional)
{ "taxIdType": "CNPJ|CPF|OTHER|null", "taxId": "12.345.678/0001-90", "legalName": "…",
  "billingEmail": "…", "address": { "street","number","complement?","neighborhood?","city","state","zipCode" } }
200 same shape | 422 BILLING_IDENTITY_TAX_ID_INVALID | BILLING_IDENTITY_EMAIL_INVALID | the existing Address error codes (postal/state format for the billing country)
   Field labels, placeholders and validation come from the billing country's CountrySpec.address; the BR form reuses the CEP lookup (useAddressLookup / ViaCEP).

POST /v1/billing/charges/{id}/payment-link   → 200 { "paymentUrl": "https://…", "expiresAt": "…" }
POST /v1/billing/cancel                      → 200 { "cancelAt": "…" } (ACTIVE) | 200 { "status": "SUSPENDED", "cancelAt": null } (PAST_DUE/TRIALING, immediate) | 409 BILLING_ALREADY_CANCELLING
POST /v1/billing/reactivate                  → 200 { "cancelAt": null, "openCharge": { …, "kind": "RECOVERY" } | null }   (the web then calls payment-link for the URL; reactivate never returns a URL)
POST /v1/billing/auto-billing {"mode":"PIX_AUTOMATICO"} → 200 { "authorizationUrl": "https://…" }   (field is `mode`, never `method`)
```

The BFF mapper (not the backend) builds display strings (e.g. the auto-billing label comes from the provider as data; formatting of money/dates is the web's) — per the presentation-layer boundary rule.

## 2. Access (authenticated, any role)

| Method / path | Purpose | CAND |
|---|---|---|
| `GET /v1/billing/access` | role-reduced `{ status, operational, features: [{ key, tier }] }` for the caller's tenant | 15, 16, 20 |

Used by the web layouts / `proxy.ts` (routing by role when suspended), the dashboard (locked items) and the customer account (badge). Cached (operational answers 60 s/30 s, `SUSPENDED` answers 10 s, explicit invalidation on suspend/reactivate; the billing page bypasses the BFF cache); **fails open** on error. The BFF global guard calls the backend's internal access endpoint (§5) through the shared `TenantAccessPort` consumer, not this route.

## 3. Public (BFF, `@Public()`, no JWT)

| Method / path | Purpose | CAND |
|---|---|---|
| `GET /v1/public/billing/prices?country=BR` | selectable list prices | 23 |
| `GET /v1/public/signup/slug-availability?slug=` | `available \| taken \| reserved \| invalid` | 23 |
| `GET /v1/public/signup/session` | verified Google identity of the in-progress signup → `{ email, name, trialAvailable, existingTenantSlug? }` (`trialAvailable = false` when an earlier self-signup tenant of that Google `sub` never paid; `existingTenantSlug` lets the error page link to sign-in/discard, CAND-36) | 22 |
| `POST /v1/public/signup/tenant` | BFF reserves the registration (Billing, internal) then creates the tenant (Platform's signup use case → provisioning with `registrationId`) | 22 |
| `POST /v1/public/signup/resend` | rate-limited resend of the first-manager invitation email from the account-created page | 22 |
| `POST /v1/public/billing/webhooks/asaas` | Asaas webhook; **must answer exactly `200`** | 09 |
| `POST /v1/public/billing/webhooks/stripe` | Stripe webhook; `Stripe-Signature` on the raw body, 2xx fast, event ids deduped, object re-read before applying | 09 |

```
GET /v1/public/billing/prices?country=BR
200 { "countryCode":"BR","currency":"BRL",
      "taxBehavior":"INCLUSIVE",
      // slice H: also accepts &cycle=ANNUAL (default MONTHLY); each item then carries the annual amount and `monthlyEquivalentMinor`
      "items":[ {"featureKey":"HOTSITE","tier":"STANDARD","amountMinor":4900},
                {"featureKey":"CHATBOT","tier":"BASIC","amountMinor":3900},
                {"featureKey":"CHATBOT","tier":"PLUS","amountMinor":7900,"upcoming":{"amountMinor":8900,"effectiveFrom":"2026-12-10"}} ] }   // `upcoming` present only when a dated change is scheduled; amounts illustrative
   (cacheable; feature descriptions are translated copy in the web app, not API data)

GET /v1/public/signup/slug-availability?slug=lavacar-top
200 { "status":"available" } | { "status":"reserved" } | { "status":"taken" } | { "status":"invalid","reason":"TOO_SHORT" }

POST /v1/public/signup/tenant
  Body: { "businessName","slug","countryCode":"BR|US",
          "taxId":"12.345.678/0001-90"  (BR only, CPF or CNPJ with valid check digits; omitted for US),
          "acceptedTermsVersion":"2026-10","turnstileToken":"…" }
  (email and name come from the verified signup session, never from the body; language derives from countryCode, there is no language field)
  201 { "tenantSlug":"lavacar-top", "nextPath":"/ikaro-trial/conta-criada" }
  409 SIGNUP_SLUG_TAKEN | 409 SIGNUP_TRIAL_NOT_AVAILABLE | 422 SIGNUP_SLUG_INVALID | 422 SIGNUP_TAX_ID_INVALID | 422 SIGNUP_TAX_ID_REQUIRED | 422 SIGNUP_SLUG_RESERVED | 422 SIGNUP_TERMS_NOT_ACCEPTED
  400 SIGNUP_TURNSTILE_FAILED | 429 SIGNUP_RATE_LIMITED (Retry-After)
```

- **Signup session:** after Google sign-in the BFF issues a short-lived (30 min), httpOnly, signed cookie carrying only `{ email, name, googleSub }` (no tenant yet), built on `JwtService`/`OAuthStateService` — **there is no "staff selection token" to reuse** (verified: `/select-staff-tenant` is a page and `switch-staff-tenant` re-issues the session JWT). The `201` clears it and does **not** issue a tenant JWT: the browser navigates to the account-created/check-email page. `TenantProvisioned` then creates the first manager asynchronously; the existing invitation/login email is the only dashboard-access handoff.
- **Abuse protection:** Turnstile on `POST /signup/tenant` and on the first step; per-IP and per-Google-account throttles; slug-availability is throttled to limit enumeration. The BFF `WebOnlyGuard` allowance must cover these routes.
- **Webhooks:** both routes carry `@Public()`, `@BypassWebOnlyGuard()` (the `WebOnlyGuard` has no `@Public()` escape; only the health controller bypasses it today, so these are the first) and `@SkipThrottle()` (or a tuned `@Throttle`) so provider retries from a few source IPs are not rate-limited. Asaas: header `asaas-access-token` (the configured `authToken`) validated timing-safe, no IP allowlist (the official IP list is not published); it counts only HTTP `200` as success, so the route returns exactly 200 after commit and never 201/204/redirects, and its queue pauses after 15 consecutive failures. Stripe: HMAC-SHA256 signature (5-minute tolerance) verified on the raw body; events can be duplicated and out of order. Common contract: raw body preserved (signature/replay checks need it). For Asaas, whose token is the only authenticity proof, a state-changing event is applied only after `fetchChargeStatus` confirms it and the amount matches (decision 101). The internal endpoint validates, deduplicates, applies the local charge/subscription transition and writes its outbox rows in **one transaction**; it returns `200` only after that transaction commits. Email is dispatched asynchronously from the outbox.

## 4. Hotsite changes

- `GET /v1/public/platform/manifest/:slug` (manifest; the real route in `platform.public.controller.ts`): `isPublished` becomes the **effective** value (`manager's flag && operational`); the payload for a suspended tenant keeps `branding` but stays minimal exactly like today's `isPublished: false` (still `200`, never `404`).
- `GET /v1/public/platform/published-hotsites`: excludes non-operational tenants.
- New hotsite module type `TRIAL_SIGNUP_CTA` — see `tenant-billing_MODULE.md`.
- Customer booking/loyalty: the BFF exposes a customer-safe `tenantOperational` flag for the inactive badge and read-only history. While suspended, Booking allows cancellation of an existing future booking but refuses new booking, reschedule and open-detail access; Loyalty allows balance/history reads but refuses earning/redemption.

## 5. Internal backend endpoints (BFF/operator → backend; `InternalApiGuard`; operator routes also `PlatformAdminGuard`)

| Method / path | Purpose | CAND |
|---|---|---|
| `GET /internal/tenants/{tenantId}/access` | the access answer for BFF guards | 15 |
| `POST /internal/billing/registrations` | creates the provisioning registration `{ source, googleSub?, taxId?, terms? }` and, for `SELF_SIGNUP`, runs the trial-eligibility check under the advisory lock → `{ registrationId, trialAvailable }`; used by the BFF (self-signup) and by `provision-tenant.sh` (operator, `source = OPERATOR`); replaces the old GET-with-side-effect `signup-trial-eligibility` (decisions 96, 120) | 22, 01 |
| `GET /internal/tenants/{tenantId}/billing/tenant-info` | not an endpoint: the read-only tenant-info **port** used by self-heal/backfill only (decision 119) | 35, 21 |
| `GET /internal/billing/suspended-tenant-ids` | batch for the rare cross-tenant scan | 15 |
| `POST /internal/billing/webhooks/{provider}` | normalized processing of the provider webhook (`asaas` \| `stripe`) | 09 |
| `PUT /internal/billing/feature-prices` | create a price (feature × country × tier × cycle) with its first amount, or set `selectable = false` to hide it from new selection | 07 |
| `POST /internal/billing/feature-prices/{featureKey}/{countryCode}/{tier}/versions?dryRun=` | **schedule a price change** `{ amountMinor, effectiveFrom, reason }`; operator-only; announces it to every affected manager | 07 |
| `POST /internal/tenants/{tenantId}/billing/suspend` (reason `OPERATOR`) \| `/unsuspend` (valid only for an `OPERATOR` suspension) \| `/grace` (rare edge case O9) | the mapped operator edge cases (`tenant-billing_OPERATIONS.md` §4); never a payment override or a reactivation of a payment-based suspension | 06 |
| `PUT /internal/tenants/{tenantId}/billing/exempt` | `{ exempt: boolean, reason }` — set or clear free access (R12); `403 BILLING_EXEMPT_PROTECTED` for Ikaro's own tenant; audited as `SET_EXEMPT` | 32 |
| `POST /internal/tenants` (existing, UC-024) | gains optional `exempt: boolean` and, for a non-exempt BR tenant, a **required** valid `taxId` (CPF/CNPJ), both also on `scripts/provision-tenant.sh` (`422 SIGNUP_TAX_ID_REQUIRED`/`_INVALID`); a non-exempt US tenant is rejected while `FEATURE_FLAG_SIGNUP_US` is off (`BILLING_US_NOT_AVAILABLE`) | 01, 32 |
| `GET /internal/billing/tenants?status=` | read-only investigation list (status, overdue age, last charge); not a daily worklist (decision 107) | 06 |

Operator calls run from the script/relay path exactly like `scripts/provision-tenant.sh` (four protection layers); each tenant-scoped call takes `reason` and records `operator_audit`. Price-list changes have no tenant and are audited on `feature_price_versions` (`created_by`, `reason`).

The webhook route is `@Public()` and must also carry the `WebOnlyGuard` bypass decorator (`BYPASS_WEB_ONLY_GUARD_KEY`): Asaas is not the web app and sends no `x-web-internal-key`.

## 6. Cron triggers (Cloud Scheduler → Pub/Sub → `ITriggerBus`; HTTP endpoints are the manual path)

Following `CronLeadFormController`/`CronChatbotController`: in production Cloud Scheduler publishes a tenant-less trigger delivered through the shared `/pubsub/push` receiver to a handler registered with `ITriggerBus.registerTrigger`; the `/cron/*` controllers below are thin publishers behind `InternalApiGuard` (local/manual run, bypass `RequestInterceptor`). Triggers carry no tenant id, so each job selects its own tenants via its standalone indexes.

| Path | Purpose | CAND |
|---|---|---|
| `POST /cron/billing-issue-charges` | issue next charges 10 days before due | 08 |
| `POST /cron/billing-status-sweep` | **hourly**: tenant-local due date → overdue/past-due, trial end (with the settlement margin), past-due → suspended, cancel-at; honours the suspension freeze | 10 |
| `POST /cron/billing-reconcile` | reconcile with the provider (daily for all open charges, hourly for at-risk tenants) | 11 |
| `POST /cron/billing-provider-events-purge` | retention of `provider_events` | 09 |
| `POST /cron/billing-tenant-purge` | warnings (30/7 days) and erasure | 27 |
| `POST /cron/billing-reminders` | daily dunning reminders (`BillingReminderDue`) | 34 |
| `POST /cron/billing-self-heal` | hourly: provisioning repair, provider health, suspension freeze | 35 |

All idempotent; the job passes an explicit `tenantId` to every use case (no `RequestContext`); provider calls never inside `txManager.run()`. `exempt` subscriptions are skipped by every job.

### Percentage adjustment endpoint (operator only — the normal way to raise prices, decision 127)

```
POST /internal/billing/feature-prices/adjust?dryRun=true
  Body: { "countryCode": "BR", "percent": 20, "roundToMinor": 100, "effectiveFrom": "2027-01-10",
          "reason": "annual adjustment", "cycles": ["MONTHLY","ANNUAL"] (optional, default all),
          "exclude": [ { "featureKey": "LEAD_FORM", "tier": "STANDARD" } ] (optional) }
  200 (dryRun) { "batchPreview": [ { "featureKey","tier","cycle","oldAmountMinor":7900,"newAmountMinor":9500 }, … ],
                 "affectedTenants": 14, "sampleTenantTotals": [ { "tenantId","oldTotalMinor":24500,"newTotalMinor":29200 } ],
                 "minNoticeDays": 40, "effectiveFrom": "2027-01-10", "previewHash": "…" }
  Without dryRun: body also carries "expectedPreviewHash"; 201 { "batchId", "versions": 6, "affectedTenants": 14, "announced": true }
  422 BILLING_PRICE_NOTICE_TOO_SHORT | 409 BILLING_PRICE_BATCH_CHANGED (the active prices moved since the dry run) | 422 BILLING_PRICE_UNCHANGED (a price would not change after rounding)
```
It selects **every price of that country that is in force today** (a version with `effective_from <= today`, not superseded) and is either `selectable` or still used by a non-exempt subscription item (hidden prices that subscribers keep renewing are adjusted too), applies `percent` (negative = decrease) and rounds half-up to a multiple of `roundToMinor` (default 100 = whole real/dollar). In **one transaction** it inserts one `feature_price_versions` row per price sharing a `batch_id`, `effective_from` and `reason`, supersedes any pending version of those prices, and writes **one** `SubscriptionPriceChangeAnnounced` outbox event per affected tenant carrying only that tenant's changed features and its new total — one email, never one per feature. The notice check runs once for the whole batch (40 days; 60 when an `ANNUAL` price is included, slice H). The dry run shows the operator every new price and sample tenant totals so rounding is checked before saving, and `previewHash` makes the apply fail if the active prices changed in between. The audit is the `batch_id` group on `feature_price_versions` (who, why, when, old and new amounts).

### Single exact price change (operator only — rare, e.g. a correction or one new tier)

```
POST /internal/billing/feature-prices/CHATBOT/BR/PLUS/versions?dryRun=true
  Body: { "amountMinor": 4900, "effectiveFrom": "2026-12-10", "reason": "annual adjustment" }
  200 { "affectedTenants": 14, "currency": "BRL", "oldAmountMinor": 3900, "newAmountMinor": 4900,
        "minNoticeDays": 40, "effectiveFrom": "2026-12-10" }          // dryRun: nothing saved, nothing sent
  Without dryRun: 201 { "versionId": "…", "affectedTenants": 14, "announced": true }
  422 BILLING_PRICE_NOTICE_TOO_SHORT  (an increase must be effective at least PRICE_CHANGE_MIN_NOTICE_DAYS + CHARGE_ISSUE_LEAD_DAYS from today; defaults: 30 + 10 days)
```
It runs through the operator path (script / relay) like the other internal operator routes: `InternalApiGuard` + `PlatformAdminGuard`, audited. The affected tenants are those in `TRIALING`, `ACTIVE` or `PAST_DUE` with an active or next-period scheduled item for that feature and tier in that country, and not `exempt`. Trial tenants are announced too (decision 73) and also see it on the Plano tab; suspended tenants are not notified. In **one transaction** it writes the version and one outbox event `SubscriptionPriceChangeAnnounced` per affected tenant. `effectiveFrom` is the first service-period start that uses the amount, even though its invoice may be issued earlier. `GET /v1/public/billing/prices` and the Plano tab show current and upcoming amounts.

### Non-production endpoints (do not exist when `APP_ENV=production`)

| Method / path | Purpose | CAND |
|---|---|---|
| `POST /internal/dev/clock/advance` | `{ days?, hours? }` advances the injectable `IClock` for Billing decisions | 33 |
| `POST /internal/dev/billing/provider/simulate` | `{ tenantId or chargeId, event: PAID_PIX \| PAID_BOLETO \| PAID_CARD \| OVERDUE \| REFUND_FULL \| REFUND_PARTIAL \| CHARGEBACK_OPENED \| CHARGEBACK_LOST, delivery: NORMAL \| DUPLICATE \| DELAYED \| OUT_OF_ORDER, failure?: PROVIDER_5XX \| LINK_EXPIRED \| INVALID_LOCATION }` makes the fake provider send the corresponding signed webhook to the app's own webhook route | 33 |
| `POST /internal/dev/billing/seed` | creates one tenant per billing state through the normal use cases | 33 |

All three sit behind `InternalApiGuard` + `PlatformAdminGuard`, are registered only when `APP_ENV` is `local` or `staging`, and `simulate` only works for subscriptions whose `merchant_profile_key` is a `*_FAKE` key (staging sandboxes receive their events from the real sandbox).

## 7. Provider port (Ikaro's terms)

```ts
interface BillingProviderPort {
  ensureCustomer(tenantId, identity): Promise<{ providerCustomerId: string }>;   // Asaas: name + cpfCnpj required, notificationDisabled=true; Stripe: location for tax
  // Asaas: billingType UNDEFINED, our charge id as externalReference. Stripe: one finalized invoice (send_invoice) with automatic_tax.
  createCharge(input: { merchantProfileKey, customerId, dueDate, lines, currency, taxBehavior, customerLocation, description, externalReference }):
    Promise<{ providerChargeId, paymentUrl, expiresAt, totalMinor, tax: { totalTaxMinor, lines, providerCalculationId? } }>;   // tax is empty in the BR-only first schema (all prices tax-inclusive); the Stripe adapter fills it in slice E
  regeneratePaymentLink(providerChargeId): Promise<{ paymentUrl, expiresAt }>;
  cancelCharge(providerChargeId): Promise<void>;
  startAutoBilling(customerId, mode): Promise<{ authorizationUrl }>;
  revokeAutoBilling(customerId): Promise<void>;
  fetchChargeStatus(providerChargeId): Promise<NormalizedChargeStatus>;
}
// Inbound: adapter.parseWebhook(rawBody, headers) -> NormalizedProviderEvent
//   PaymentConfirmed | PaymentOverdue | PaymentRefunded | PaymentChargeback | AutoBillingAuthorized | AutoBillingRevoked
//   The adapter decides which provider event is the paid signal per payment method (Asaas: card = PAYMENT_CONFIRMED,
//   Pix/boleto = PAYMENT_RECEIVED; verify in the sandbox); the first one for a charge yields PaymentConfirmed, a later one is a no-op.
```
Adapters: `AsaasBillingProvider` (BRL), `StripeBillingProvider` (USD) and the non-production `FakeBillingProvider` (BRL/USD) share this port, and one contract test suite runs against the fake on every PR and against the Asaas sandbox and Stripe test mode nightly. A live adapter refuses to start unless `APP_ENV=production`. There is no separate tax port: Stripe returns the tax breakdown from invoice finalization (decision 62), and Asaas charges are tax-inclusive. The subscription's immutable `merchantProfileKey` resolves to the provider account and selling legal entity through operational configuration/secrets; provider dashboards remain the source of truth for KYC and legal-entity data. Automatic authorization operations (Pix Automático only) remain in the provider-shaped port but are not released until the real flow is verified end to end. There is no `ManualBillingProvider` or manual mark-paid route. No provider type leaks beyond the adapter.

## 8. New error codes (each needs entries in both `packages/i18n/locales/{pt-BR,en}/errors.json`, CI-enforced)

Names follow the existing per-context convention in `packages/types/src/error-codes.ts` (`STAFF_*`, `LOYALTY_*`, `PLATFORM_*`): Billing codes are `BILLING_*`, signup codes `SIGNUP_*`.

**Plumbing for the new origins (verified):** a `BillingErrorCode` and a `SignupErrorCode` const (each `<ORIGIN>_<MEMBER>`) in `packages/types/src/error-codes.ts`, both added to the `AnyErrorCode` union, to the hard-coded `CATALOGS` map in `apps/web/shared/lib/i18n/error-codes-exhaustiveness.spec.ts`, to both `errors.json` files and to `docs/ERROR_CATALOG.md`; a BFF-thrown code must also enter the `BffThrowableCode` union used by `throwProblemDetail`. New this review: `BILLING_PLAN_ALREADY_CONFIRMED`, `BILLING_DISCARD_NOT_ALLOWED`, `BILLING_PRICE_UNCHANGED`, `BILLING_PRICE_BATCH_CHANGED` (the percentage-adjust endpoint), and for slice H `BILLING_ADDON_NOT_ALLOWED`, `BILLING_CYCLE_NOT_AVAILABLE` (no annual price for a selected feature).

`BILLING_FEATURE_NOT_ENTITLED`, `BILLING_TENANT_SUSPENDED`, `BILLING_ALREADY_CANCELLING`, `BILLING_IDENTITY_TAX_ID_INVALID`, `BILLING_IDENTITY_EMAIL_INVALID`, `BILLING_FEATURE_DEPENDENCY_UNMET`, `BILLING_FEATURE_HAS_DEPENDENTS`, `BILLING_FEATURE_IN_USE`, `BILLING_NO_PRICE_FOR_COUNTRY`, `BILLING_CHARGE_NOT_PAYABLE`, `BILLING_PRICE_NOTICE_TOO_SHORT`, `BILLING_PLAN_EMPTY`, `BILLING_PLAN_CHANGE_NOT_ALLOWED`, `SIGNUP_SLUG_TAKEN`, `SIGNUP_SLUG_RESERVED`, `SIGNUP_SLUG_INVALID`, `SIGNUP_TERMS_NOT_ACCEPTED`, `SIGNUP_TAX_ID_INVALID`, `SIGNUP_TAX_ID_REQUIRED`, `SIGNUP_TRIAL_NOT_AVAILABLE`, `SIGNUP_RATE_LIMITED`, `BILLING_ADDRESS_REQUIRED`, `BILLING_PROVIDER_UNAVAILABLE`, `BILLING_EXEMPT_PROTECTED`, `BILLING_US_NOT_AVAILABLE`. Turnstile: the only existing code is lead-form specific (`PLATFORM_LEAD_FORM_TURNSTILE_VERIFICATION_FAILED`); signup uses a new generic `SIGNUP_TURNSTILE_FAILED` (decided).

## 9. Declarative gating metadata

Tenant-scoped routes declare `@RequiresFeature(FeatureKey.X)` where applicable and `@SuspensionAccess(...)` (`MANAGER_BILLING`, `STAFF_NOTICE`, `CUSTOMER_HISTORY`, `AUTH_TENANT_SWITCH`, `PUBLIC_NONE`, `DEFAULT_DENY`). `@NoFeatureGate()` is only for health, auth and webhooks. One global `TenantAccessGuard` enforces metadata; an architecture check makes omission fail. Record-dependent Booking policy remains in Booking. The staff tenant-selection endpoint returns `operational: boolean` and never filters suspended tenants; switching must not reject one.

Verified placement: the backend `TenantAccessGuard` runs before `RequestInterceptor`, so it reads the `x-tenant-id` header itself (never `RequestContext`); `/internal/*`, `/cron/*`, `/pubsub/*` and `/health` bypass the interceptor, so the tenant-less signup/registration routes live under `/internal/*`; the staff-tenant list (`GET /auth/staff-tenants`, `StaffTenantOption` has no status field today) gains `operational` and both `switch-staff-tenant` and the customer `switch-tenant` must accept a suspended tenant.

## 10. Auth and headers

Manager routes: JWT cookie, `X-Actor-ID/Type/Role` forwarded by the BFF; backend reads `RequestContext`. Public routes: `X-Tenant-Slug` only where tenant-scoped (the signup and prices routes are platform-level and carry none). The suspension guard is a **Guard** in the BFF (global, after `JwtAuthGuard`/`TenantGuard`), allow-listing the §1/§2 routes for managers — never an Interceptor.

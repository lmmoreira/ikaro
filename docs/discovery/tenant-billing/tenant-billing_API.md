# Discovery: Tenant Billing — API Sketch

**Status:** Discovery — endpoint inventory and shapes at sketch level. Final contracts are written into `docs/API_CONTRACTS.md` on promotion. Conventions follow `docs/API_CONTRACTS.md` § Base Standards: the web only talks to the **BFF** (`/v1`), the BFF forwards actor headers to the internal backend, errors are RFC 9457 Problem Details, money is **integer minor units + ISO currency** (never floats), dates ISO-8601 UTC (`due_date`: `YYYY-MM-DD`). List endpoints use **Pattern A** pagination (`items` + `pagination {limit, offset, total, hasMore}`) like `GET /bookings`.

**Companion docs:** `tenant-billing.md` · `tenant-billing_USECASES.md` · `tenant-billing_DATA_MODEL.md` · `tenant-billing_MODULE.md`.

Placement rules: public routes live in the billing slice's `billing.public.controller.ts` (`@Public()`); authenticated routes in `billing.controller.ts`; response types/Zod schemas in sibling `.types.ts`/`.schemas.ts`; mappers in `billing.mapper.ts` (BFF layout, CLAUDE.md §11). Types shared with the web go in `@ikaro/types` (grep it first).

## 1. Manager-facing (BFF, JWT, role MANAGER)

All require `Authorization` (httpOnly cookie) and tenant scope from the JWT; staff/customer get 403. These are **the only routes allowed while the tenant is `SUSPENDED`** (alongside the access endpoint and logout).

| Method / path | Purpose | CAND |
|---|---|---|
| `GET /v1/billing/summary` | status, dates, active features, total, open charge, auto-billing, cancel state | 12 |
| `GET /v1/billing/charges?limit=&offset=` | paginated history | 12 |
| `GET /v1/billing/identity` | read billing identity | 13 |
| `PUT /v1/billing/identity` | save billing identity | 13 |
| `POST /v1/billing/charges/{chargeId}/payment-link` | (re)generate a hosted payment URL | 14 |
| `GET /v1/billing/plan` | catalog, current and next-paid-period selection, tiers, dependencies and effective date | 31 |
| `POST /v1/billing/plan/preview` | preview the proposed **next paid period** selection and total | 31 |
| `PUT /v1/billing/plan` | schedule the next paid-period selection (`items: [{ featureKey, tier }]`) | 31 |
| `POST /v1/billing/cancel` | schedule cancellation at end of paid period | 28 |
| `POST /v1/billing/reactivate` | undo scheduled cancel / cancel the stale open charge and issue the one-month recovery charge | 29 |
| `POST /v1/billing/auto-billing` | **deferred release slice:** start verified provider-hosted authorization → `{ authorizationUrl }` | 30 |
| `DELETE /v1/billing/auto-billing` | **deferred release slice:** revoke automatic charging | 30 |

```
GET /v1/billing/summary
200 {
  "status": "ACTIVE",                       // TRIALING | ACTIVE | PAST_DUE | SUSPENDED
  "exempt": false,                          // true: no charges ever; the page shows "Conta isenta de cobrança" and no actions
  "suspensionReason": null,                 // NON_PAYMENT | CANCELED | PAYMENT_REVERSED when SUSPENDED
  "currency": "BRL", "countryCode": "BR",
  "trialEndsAt": null, "nextDueDate": "2026-11-20", "pastDueSince": null, "suspendsAt": null,
  "cancelAt": null, "purgeAt": null,
  "items": [ { "featureKey": "HOTSITE", "tier": "STANDARD", "unitPriceMinor": 4900 },   // current-period price display (items store no price)
             { "featureKey": "CHATBOT", "tier": "BASIC", "unitPriceMinor": 3900 } ],
  "totalMinor": 8800,                       // net of tax; for US the page labels it "+ imposto calculado na cobrança" (tax exists only on the issued charge)
  "openCharge": { "id": "…", "kind": "PERIOD|RECOVERY", "dueDate": "2026-11-20", "amountMinor": 8800, "status": "PENDING", "hasPaymentLink": true, "paymentLinkExpiresAt": "…" } | null,
  "autoBilling": { "mode": "NONE" | "PIX_AUTOMATICO", "status": "INACTIVE" | "PENDING_AUTHORIZATION" | "ACTIVE", "label": "Pix Automático ativo" | null },
  "paymentConfirmationPending": false,
  "upcomingPriceChanges": [ { "featureKey":"CHATBOT","tier":"PLUS","currentAmountMinor":3900,"newAmountMinor":4900,"effectiveFrom":"2026-12-10" } ]
}

GET /v1/billing/charges?limit=20&offset=0
200 { "items": [ { "id","periodStart","periodEnd","dueDate","amountMinor","currency",
                   "status": "PAID|PENDING|OVERDUE|FAILED|CANCELED|REFUNDED|CHARGEBACK",
                   "method":"PIX","paidAt", "lines":[{"featureKey","tier","unitPriceMinor"}] } ],
      "pagination": { "limit":20,"offset":0,"total":7,"hasMore":false } }

PUT /v1/billing/identity   (every field optional)
{ "taxIdType": "CNPJ|CPF|OTHER|null", "taxId": "12.345.678/0001-90", "legalName": "…",
  "billingEmail": "…", "address": { "street","number","complement?","neighborhood?","city","state","zipCode" } }
200 same shape | 422 BILLING_IDENTITY_TAX_ID_INVALID | BILLING_IDENTITY_EMAIL_INVALID | the existing Address error codes (postal/state format for the billing country)
   Field labels, placeholders and validation come from the billing country's CountrySpec.address; the BR form reuses the CEP lookup (useAddressLookup / ViaCEP).

POST /v1/billing/charges/{id}/payment-link   → 200 { "paymentUrl": "https://…", "expiresAt": "…" }
POST /v1/billing/cancel                      → 200 { "cancelAt": "…" } | 409 BILLING_ALREADY_CANCELLING
POST /v1/billing/reactivate                  → 200 { "cancelAt": null, "openCharge": { …, "kind": "RECOVERY" } | null }   (the web then calls payment-link for the URL; reactivate never returns a URL)
POST /v1/billing/auto-billing {"mode":"PIX_AUTOMATICO"} → 200 { "authorizationUrl": "https://…" }   (field is `mode`, never `method`)
```

The BFF mapper (not the backend) builds display strings (e.g. the auto-billing label comes from the provider as data; formatting of money/dates is the web's) — per the presentation-layer boundary rule.

## 2. Access (authenticated, any role)

| Method / path | Purpose | CAND |
|---|---|---|
| `GET /v1/billing/access` | role-reduced `{ status, operational, features: [{ key, tier }] }` for the caller's tenant | 15, 16, 20 |

Used by the web layouts / `proxy.ts` (routing by role when suspended), the dashboard (locked items) and the customer account (badge). Cached; **fails open** on error. The BFF global guard calls the backend's internal access endpoint (§5) through the shared `TenantAccessPort` consumer, not this route.

## 3. Public (BFF, `@Public()`, no JWT)

| Method / path | Purpose | CAND |
|---|---|---|
| `GET /v1/public/billing/prices?country=BR` | selectable list prices | 23 |
| `GET /v1/public/signup/slug-availability?slug=` | `available \| taken \| reserved \| invalid` | 23 |
| `GET /v1/public/signup/session` | verified Google identity of the in-progress signup | 22 |
| `POST /v1/public/signup/tenant` | create the tenant (calls Platform's provisioning) | 22 |
| `POST /v1/public/billing/webhooks/asaas` | Asaas webhook; **must answer exactly `200`** | 09 |
| `POST /v1/public/billing/webhooks/stripe` | Stripe webhook; `Stripe-Signature` on the raw body, 2xx fast, event ids deduped, object re-read before applying | 09 |

```
GET /v1/public/billing/prices?country=BR
200 { "countryCode":"BR","currency":"BRL",
      "taxBehavior":"INCLUSIVE",
      "items":[ {"featureKey":"HOTSITE","tier":"STANDARD","amountMinor":4900},
                {"featureKey":"CHATBOT","tier":"BASIC","amountMinor":3900},
                {"featureKey":"CHATBOT","tier":"PLUS","amountMinor":7900} ] }
   (cacheable; feature descriptions are translated copy in the web app, not API data)

GET /v1/public/signup/slug-availability?slug=lavacar-top
200 { "status":"available" } | { "status":"reserved" } | { "status":"taken" } | { "status":"invalid","reason":"TOO_SHORT" }

POST /v1/public/signup/tenant
  Body: { "businessName","slug","countryCode":"BR|US",
          "taxId":"12.345.678/0001-90"  (BR only, CPF or CNPJ with valid check digits; omitted for US),
          "acceptedTermsVersion":"2026-10","turnstileToken":"…" }
  (email and name come from the verified signup session, never from the body; language derives from countryCode, there is no language field)
  201 { "tenantSlug":"lavacar-top", "nextPath":"/ikaro-trial/conta-criada" }
  409 SIGNUP_SLUG_TAKEN | 409 SIGNUP_TRIAL_NOT_AVAILABLE | 422 SIGNUP_SLUG_INVALID | 422 SIGNUP_TAX_ID_INVALID | 422 SIGNUP_TAX_ID_REQUIRED | SIGNUP_TERMS_NOT_ACCEPTED
  400 SIGNUP_TURNSTILE_FAILED | 429 SIGNUP_RATE_LIMITED (Retry-After)
```

- **Signup session:** after Google sign-in the BFF issues a short-lived, httpOnly, signed cookie carrying only the verified email/name (no tenant yet). The `201` clears that signup-only session and does **not** issue a tenant JWT: the browser navigates to the account-created/check-email page. `TenantProvisioned` then creates the first manager asynchronously; the existing invitation/login email is the only dashboard-access handoff. The exact signup-session mechanism (reuse of the staff selection-token pattern vs a new token) is decided in story discovery.
- **Abuse protection:** Turnstile on `POST /signup/tenant` and on the first step; per-IP and per-Google-account throttles; slug-availability is throttled to limit enumeration. The BFF `WebOnlyGuard` allowance must cover these routes.
- **Webhooks:** both routes carry `@Public()` and the `WebOnlyGuard` bypass. Asaas: header `asaas-access-token` (the configured `authToken`) validated timing-safe, no IP allowlist (the official IP list is not published); it counts only HTTP `200` as success, so the route returns exactly 200 after commit and never 201/204/redirects, and its queue pauses after 15 consecutive failures. Stripe: HMAC-SHA256 signature (5-minute tolerance) verified on the raw body; events can be duplicated and out of order. Common contract: raw body preserved (signature/replay checks need it). The internal endpoint validates, deduplicates, applies the local charge/subscription transition and writes its outbox rows in **one transaction**; it returns `200` only after that transaction commits. Email is dispatched asynchronously from the outbox.

## 4. Hotsite changes

- `GET /v1/public/platform/hotsite` (manifest): `isPublished` becomes the **effective** value (`manager's flag && operational`); the payload for a suspended tenant keeps `branding` but stays minimal exactly like today's `isPublished: false` (still `200`, never `404`).
- `GET /v1/public/platform/published-hotsites`: excludes non-operational tenants.
- New hotsite module type `TRIAL_SIGNUP_CTA` — see `tenant-billing_MODULE.md`.
- Customer booking/loyalty: the BFF exposes a customer-safe `tenantOperational` flag for the inactive badge and read-only history. While suspended, Booking allows cancellation of an existing future booking but refuses new booking, reschedule and open-detail access; Loyalty allows balance/history reads but refuses earning/redemption.

## 5. Internal backend endpoints (BFF/operator → backend; `InternalApiGuard`; operator routes also `PlatformAdminGuard`)

| Method / path | Purpose | CAND |
|---|---|---|
| `GET /internal/tenants/{tenantId}/access` | the access answer for BFF guards | 15 |
| `GET /internal/billing/suspended-tenant-ids` | batch for the rare cross-tenant scan | 15 |
| `POST /internal/billing/webhooks/{provider}` | normalized processing of the provider webhook (`asaas` \| `stripe`) | 09 |
| `PUT /internal/billing/feature-prices` | create a price (feature × country × tier × cycle) with its first amount, or deactivate it | 07 |
| `POST /internal/billing/feature-prices/{featureKey}/{countryCode}/{tier}/versions?dryRun=` | **schedule a price change** `{ amountMinor, effectiveFrom, reason }`; operator-only; announces it to every affected manager | 07 |
| `POST /internal/tenants/{tenantId}/billing/grace` \| `/suspend` | operator controls (never payment override or reactivation) | 06 |
| `PUT /internal/tenants/{tenantId}/billing/exempt` | `{ exempt: boolean, reason }` — set or clear free access (R12); `403 BILLING_EXEMPT_PROTECTED` for Ikaro's own tenant; audited as `SET_EXEMPT` | 32 |
| `POST /internal/tenants` (existing, UC-024) | gains optional `exempt: boolean` (and `scripts/provision-tenant.sh` a flag); a non-exempt US tenant is rejected while `FEATURE_FLAG_SIGNUP_US` is off (`BILLING_US_NOT_AVAILABLE`) | 01, 32 |
| `GET /internal/billing/tenants?status=` | operator list: status, overdue age, last charge | 06 |

Operator calls run from the script/relay path exactly like `scripts/provision-tenant.sh` (four protection layers); each tenant-scoped call takes `reason` and records `operator_audit`. Price-list changes have no tenant and are audited on `feature_price_versions` (`created_by`, `reason`).

The webhook route is `@Public()` and must also carry the `WebOnlyGuard` bypass decorator (`BYPASS_WEB_ONLY_GUARD_KEY`): Asaas is not the web app and sends no `x-web-internal-key`.

## 6. Cron triggers (Cloud Scheduler → Pub/Sub → `ITriggerBus`; HTTP endpoints are the manual path)

Following `CronLeadFormController`/`CronChatbotController`: in production Cloud Scheduler publishes a tenant-less trigger delivered through the shared `/pubsub/push` receiver to a handler registered with `ITriggerBus.registerTrigger`; the `/cron/*` controllers below are thin publishers behind `InternalApiGuard` (local/manual run, bypass `RequestInterceptor`). Triggers carry no tenant id, so each job selects its own tenants via its standalone indexes.

| Path | Purpose | CAND |
|---|---|---|
| `POST /cron/billing-issue-charges` | issue next charges 10 days before due | 08 |
| `POST /cron/billing-status-sweep` | tenant-local due date → overdue/past-due, trial end, past-due → suspended, cancel-at | 10 |
| `POST /cron/billing-reconcile` | reconcile with the provider | 11 |
| `POST /cron/billing-provider-events-purge` | retention of `provider_events` | 09 |
| `POST /cron/billing-tenant-purge` | warnings (30/7 days) and erasure | 27 |
| `POST /cron/billing-ops-digest` | daily overdue/suspended list to Ikaro's ops manager | alerts |

All idempotent; the job passes an explicit `tenantId` to every use case (no `RequestContext`); provider calls never inside `txManager.run()`. `exempt` subscriptions are skipped by every job.

### Price-change endpoint (operator only)

```
POST /internal/billing/feature-prices/CHATBOT/BR/PLUS/versions?dryRun=true
  Body: { "amountMinor": 4900, "effectiveFrom": "2026-12-10", "reason": "annual adjustment" }
  200 { "affectedTenants": 14, "currency": "BRL", "oldAmountMinor": 3900, "newAmountMinor": 4900,
        "minNoticeDays": 30, "effectiveFrom": "2026-12-10" }          // dryRun: nothing saved, nothing sent
  Without dryRun: 201 { "versionId": "…", "affectedTenants": 14, "announced": true }
  422 BILLING_PRICE_NOTICE_TOO_SHORT  (an increase must be effective at least PRICE_CHANGE_MIN_NOTICE_DAYS + CHARGE_ISSUE_LEAD_DAYS from today; defaults: 30 + 10 days)
```
It runs through the operator path (script / relay) like the other internal operator routes: `InternalApiGuard` + `PlatformAdminGuard`, audited. The affected tenants are those in `ACTIVE` or `PAST_DUE` with an active or next-period scheduled item for that feature and tier in that country, and not `exempt`. Trial tenants see the new price on the Plano tab; suspended tenants are not notified. In **one transaction** it writes the version and one outbox event `SubscriptionPriceChangeAnnounced` per affected tenant. `effectiveFrom` is the first service-period start that uses the amount, even though its invoice may be issued earlier. `GET /v1/public/billing/prices` and the Plano tab show current and upcoming amounts.

## 7. Provider port (Ikaro's terms)

```ts
interface BillingProviderPort {
  ensureCustomer(tenantId, identity): Promise<{ providerCustomerId: string }>;   // Asaas: name + cpfCnpj required, notificationDisabled=true; Stripe: location for tax
  // Asaas: billingType UNDEFINED, our charge id as externalReference. Stripe: one finalized invoice (send_invoice) with automatic_tax.
  createCharge(input: { merchantProfileKey, customerId, dueDate, lines, currency, taxBehavior, customerLocation, description, externalReference }):
    Promise<{ providerChargeId, paymentUrl, expiresAt, totalMinor, tax: { totalTaxMinor, lines, providerCalculationId? } }>;   // tax empty/zero for tax-inclusive BR
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
Adapters: `AsaasBillingProvider` (BRL) and `StripeBillingProvider` (USD) share this port. There is no separate tax port: Stripe returns the tax breakdown from invoice finalization (decision 62), and Asaas charges are tax-inclusive. The subscription's immutable `merchantProfileKey` resolves to the provider account and selling legal entity through operational configuration/secrets; provider dashboards remain the source of truth for KYC and legal-entity data. Automatic authorization operations (Pix Automático only) remain in the provider-shaped port but are not released until the real flow is verified end to end. There is no `ManualBillingProvider` or manual mark-paid route. No provider type leaks beyond the adapter.

## 8. New error codes (each needs entries in both `packages/i18n/locales/{pt-BR,en}/errors.json`, CI-enforced)

Names follow the existing per-context convention in `packages/types/src/error-codes.ts` (`STAFF_*`, `LOYALTY_*`, `PLATFORM_*`): Billing codes are `BILLING_*`, signup codes `SIGNUP_*`.

`BILLING_FEATURE_NOT_ENTITLED`, `BILLING_TENANT_SUSPENDED`, `BILLING_ALREADY_CANCELLING`, `BILLING_IDENTITY_TAX_ID_INVALID`, `BILLING_IDENTITY_EMAIL_INVALID`, `BILLING_FEATURE_DEPENDENCY_UNMET`, `BILLING_FEATURE_HAS_DEPENDENTS`, `BILLING_NO_PRICE_FOR_COUNTRY`, `BILLING_CHARGE_NOT_PAYABLE`, `BILLING_PRICE_NOTICE_TOO_SHORT`, `BILLING_PLAN_EMPTY`, `BILLING_PLAN_CHANGE_NOT_ALLOWED`, `SIGNUP_SLUG_TAKEN`, `SIGNUP_SLUG_RESERVED`, `SIGNUP_SLUG_INVALID`, `SIGNUP_TERMS_NOT_ACCEPTED`, `SIGNUP_TAX_ID_INVALID`, `SIGNUP_TAX_ID_REQUIRED`, `SIGNUP_TRIAL_NOT_AVAILABLE`, `SIGNUP_RATE_LIMITED`, `BILLING_TAX_LOCATION_REQUIRED`, `BILLING_PROVIDER_UNAVAILABLE`, `BILLING_EXEMPT_PROTECTED`, `BILLING_US_NOT_AVAILABLE`. Turnstile: the only existing code is lead-form specific (`PLATFORM_LEAD_FORM_TURNSTILE_VERIFICATION_FAILED`); signup uses a new generic `SIGNUP_TURNSTILE_FAILED` unless story discovery generalizes the existing one.

## 9. Declarative gating metadata

Tenant-scoped routes declare `@RequiresFeature(FeatureKey.X)` where applicable and `@SuspensionAccess(...)` (`MANAGER_BILLING`, `STAFF_NOTICE`, `CUSTOMER_HISTORY`, `AUTH_TENANT_SWITCH`, `PUBLIC_NONE`, `DEFAULT_DENY`). `@NoFeatureGate()` is only for health, auth and webhooks. One global `TenantAccessGuard` enforces metadata; an architecture check makes omission fail. Record-dependent Booking policy remains in Booking. The staff tenant-selection endpoint returns `operational: boolean` and never filters suspended tenants; switching must not reject one.

## 10. Auth and headers

Manager routes: JWT cookie, `X-Actor-ID/Type/Role` forwarded by the BFF; backend reads `RequestContext`. Public routes: `X-Tenant-Slug` only where tenant-scoped (the signup and prices routes are platform-level and carry none). The suspension guard is a **Guard** in the BFF (global, after `JwtAuthGuard`/`TenantGuard`), allow-listing the §1/§2 routes for managers — never an Interceptor.

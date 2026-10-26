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
| `POST /v1/billing/cancel` | schedule cancellation at end of paid period | 28 |
| `POST /v1/billing/reactivate` | undo scheduled cancel / create the reactivation charge | 29 |
| `POST /v1/billing/auto-billing` | start provider-hosted authorization → `{ authorizationUrl }` | 30 |
| `DELETE /v1/billing/auto-billing` | revoke automatic charging | 30 |

```
GET /v1/billing/summary
200 {
  "status": "ACTIVE",                       // TRIALING | ACTIVE | PAST_DUE | SUSPENDED
  "suspensionReason": null,                 // NON_PAYMENT | CANCELED when SUSPENDED
  "currency": "BRL", "countryCode": "BR",
  "trialEndsAt": null, "nextDueDate": "2026-11-20", "pastDueSince": null, "suspendsAt": null,
  "cancelAt": null, "purgeAt": null,
  "items": [ { "featureKey": "HOTSITE", "tier": "STANDARD", "unitPriceMinor": 4900 },
             { "featureKey": "CHATBOT", "tier": "BASIC", "unitPriceMinor": 3900 } ],
  "totalMinor": 8800,
  "openCharge": { "id": "…", "dueDate": "2026-11-20", "amountMinor": 8800, "status": "PENDING", "hasPaymentLink": true } | null,
  "autoBilling": { "mode": "NONE" | "CARD" | "PIX_AUTOMATICO", "label": "Cartão final 4242" | null },
  "paymentConfirmationPending": false
}

GET /v1/billing/charges?limit=20&offset=0
200 { "items": [ { "id","periodStart","periodEnd","dueDate","amountMinor","currency",
                   "status": "PAID|PENDING|OVERDUE|FAILED|CANCELED|REFUNDED|CHARGEBACK",
                   "method":"PIX","paidAt", "lines":[{"featureKey","tier","unitPriceMinor"}] } ],
      "pagination": { "limit":20,"offset":0,"total":7,"hasMore":false } }

PUT /v1/billing/identity   (every field optional)
{ "taxIdType": "CNPJ|CPF|OTHER|null", "taxId": "12.345.678/0001-90", "legalName": "…",
  "billingEmail": "…", "address": { "street","number","city","state","zip","country" } }
200 same shape | 422 BILLING_IDENTITY_TAX_ID_INVALID | BILLING_IDENTITY_EMAIL_INVALID

POST /v1/billing/charges/{id}/payment-link   → 200 { "paymentUrl": "https://…", "expiresAt": "…" }
POST /v1/billing/cancel                      → 200 { "cancelAt": "…" } | 409 BILLING_ALREADY_CANCELLING
POST /v1/billing/reactivate                  → 200 { "openCharge": { … } | null }
POST /v1/billing/auto-billing {"mode":"CARD|PIX_AUTOMATICO"} → 200 { "authorizationUrl": "https://…" }
```

The BFF mapper (not the backend) builds display strings (e.g. the auto-billing label comes from the provider as data; formatting of money/dates is the web's) — per the presentation-layer boundary rule.

## 2. Access (authenticated, any role)

| Method / path | Purpose | CAND |
|---|---|---|
| `GET /v1/billing/access` | `{ status, suspensionReason, features: [{ key, tier }] }` for the caller's tenant | 15, 16, 20 |

Used by the web layouts / `proxy.ts` (routing by role when suspended), the dashboard (locked items) and the customer account (badge). Cached; **fails open** on error. The BFF global guard calls the backend's internal access endpoint (§5) through the shared `TenantAccessPort` consumer, not this route.

## 3. Public (BFF, `@Public()`, no JWT)

| Method / path | Purpose | CAND |
|---|---|---|
| `GET /v1/public/billing/prices?country=BR` | active list prices | 23 |
| `GET /v1/public/signup/slug-availability?slug=` | `available \| taken \| reserved \| invalid` | 23 |
| `GET /v1/public/signup/session` | verified Google identity of the in-progress signup | 22 |
| `POST /v1/public/signup/tenant` | create the tenant (calls Platform's provisioning) | 22 |
| `POST /v1/public/billing/webhooks/asaas` | provider webhook | 09 |

```
GET /v1/public/billing/prices?country=BR
200 { "countryCode":"BR","currency":"BRL",
      "items":[ {"featureKey":"HOTSITE","tier":"STANDARD","amountMinor":4900},
                {"featureKey":"CHATBOT","tier":"BASIC","amountMinor":3900},
                {"featureKey":"CHATBOT","tier":"PLUS","amountMinor":7900} ] }
   (cacheable; feature descriptions are translated copy in the web app, not API data)

GET /v1/public/signup/slug-availability?slug=lavacar-top
200 { "status":"available" } | { "status":"reserved" } | { "status":"taken" } | { "status":"invalid","reason":"TOO_SHORT" }

POST /v1/public/signup/tenant
  Body: { "businessName","slug","countryCode":"BR|US","language":"pt-BR|en",
          "acceptedTermsVersion":"2026-10","turnstileToken":"…" }
  (email and name come from the verified signup session, never from the body)
  201 { "tenantSlug":"lavacar-top", "redirectUrl":"/dashboard" }
  409 SIGNUP_SLUG_TAKEN | 409 SIGNUP_TRIAL_ALREADY_ACTIVE | 422 SIGNUP_SLUG_INVALID | SIGNUP_TERMS_NOT_ACCEPTED
  400 TURNSTILE_FAILED | 429 SIGNUP_RATE_LIMITED (Retry-After)
```

- **Signup session:** after Google sign-in the BFF issues a short-lived, httpOnly, signed cookie carrying only the verified email/name (no tenant yet). The exact mechanism (reuse of the staff selection-token pattern vs a new token) is decided in story discovery.
- **Abuse protection:** Turnstile on `POST /signup/tenant` and on the first step; per-IP and per-Google-account throttles; slug-availability is throttled to limit enumeration. The BFF `WebOnlyGuard` allowance must cover these routes.
- **Webhook:** header `asaas-access-token` validated timing-safe; raw body preserved (signature/replay checks need it); always respond 200 after the event row is persisted; the body is forwarded to the internal backend endpoint (§5).

## 4. Hotsite changes

- `GET /v1/public/platform/hotsite` (manifest): `isPublished` becomes the **effective** value (`manager's flag && operational`); the payload for a suspended tenant keeps `branding` but stays minimal exactly like today's `isPublished: false` (still `200`, never `404`).
- `GET /v1/public/platform/published-hotsites`: excludes non-operational tenants.
- New hotsite module type `TRIAL_SIGNUP_CTA` — see `tenant-billing_MODULE.md`.
- Customer booking list/detail: the BFF mapper adds `tenantOperational` so the web can render the "Empresa inativa" badge and block open-booking detail; the backend refuses `POST /bookings` for a suspended tenant (`TENANT_SUSPENDED`).

## 5. Internal backend endpoints (BFF/operator → backend; `InternalApiGuard`; operator routes also `PlatformAdminGuard`)

| Method / path | Purpose | CAND |
|---|---|---|
| `GET /internal/tenants/{tenantId}/access` | the access answer for BFF guards | 15 |
| `GET /internal/billing/suspended-tenant-ids` | batch for the rare cross-tenant scan | 15 |
| `POST /internal/billing/webhooks/asaas` | normalized processing of the provider webhook | 09 |
| `PUT /internal/billing/feature-prices` | upsert list prices | 07 |
| `POST /internal/tenants/{tenantId}/billing/items` | add feature `{featureKey, tier?, unitPriceMinor?, reason}` | 02 |
| `DELETE /internal/tenants/{tenantId}/billing/items/{featureKey}?immediate=` | remove feature | 03 |
| `PATCH /internal/tenants/{tenantId}/billing/items/{featureKey}/price` | change a tenant's price | 04 |
| `POST /internal/tenants/{tenantId}/billing/charges/{chargeId}/mark-paid` | manual payment | 05 |
| `POST /internal/tenants/{tenantId}/billing/grace` \| `/suspend` \| `/reactivate` | operator controls | 06 |
| `GET /internal/billing/tenants?status=` | operator list: status, overdue age, last charge | 06 |

Operator calls run from the script/relay path exactly like `scripts/provision-tenant.sh` (four protection layers); each takes `reason` and records `operator_audit`.

## 6. Cron endpoints (Cloud Scheduler, `InternalApiGuard`, bypass `RequestInterceptor`)

| Path | Purpose | CAND |
|---|---|---|
| `POST /cron/billing-issue-charges` | issue next charges 10 days before due | 08 |
| `POST /cron/billing-status-sweep` | trial end, past-due → suspended, cancel-at | 10 |
| `POST /cron/billing-reconcile` | reconcile with the provider | 11 |
| `POST /cron/billing-provider-events-purge` | retention of `provider_events` | 09 |
| `POST /cron/billing-tenant-purge` | warnings (30/7 days) and erasure | 27 |
| `POST /cron/billing-ops-digest` | daily overdue/suspended list to Ikaro's ops manager | alerts |

All idempotent; each takes explicit `tenantId`s from queries (no `RequestContext`); provider calls never inside `txManager.run()`.

## 7. Provider port (Ikaro's terms)

```ts
interface BillingProviderPort {
  ensureCustomer(tenantId, identity): Promise<{ providerCustomerId: string }>;
  createCharge(input: { customerId, dueDate, amountMinor, currency, description, externalReference }): Promise<{ providerChargeId, paymentUrl }>;
  regeneratePaymentLink(providerChargeId): Promise<{ paymentUrl, expiresAt }>;
  cancelCharge(providerChargeId): Promise<void>;
  startAutoBilling(customerId, mode): Promise<{ authorizationUrl }>;
  revokeAutoBilling(customerId): Promise<void>;
  fetchChargeStatus(providerChargeId): Promise<NormalizedChargeStatus>;
}
// Inbound: adapter.parseWebhook(rawBody, headers) -> NormalizedProviderEvent
//   PaymentConfirmed | PaymentOverdue | PaymentRefunded | PaymentChargeback | AutoBillingAuthorized | AutoBillingRevoked
```
Adapters: `AsaasBillingProvider` (BRL), `ManualBillingProvider` (operator marks paid), `StripeBillingProvider` (USD; in scope of the milestone sequence, US signup gated by `FEATURE_FLAG_SIGNUP_US` until live). Selected by the subscription's currency/country. No provider type leaks beyond the adapter.

## 8. New error codes (each needs entries in both `packages/i18n/locales/{pt-BR,en}/errors.json`, CI-enforced)

`FEATURE_NOT_ENTITLED`, `TENANT_SUSPENDED`, `BILLING_ALREADY_CANCELLING`, `BILLING_IDENTITY_TAX_ID_INVALID`, `BILLING_IDENTITY_EMAIL_INVALID`, `BILLING_FEATURE_DEPENDENCY_UNMET`, `BILLING_FEATURE_ALREADY_ACTIVE`, `BILLING_FEATURE_HAS_DEPENDENTS`, `BILLING_NO_PRICE_FOR_COUNTRY`, `BILLING_CHARGE_NOT_PAYABLE`, `SIGNUP_SLUG_TAKEN`, `SIGNUP_SLUG_RESERVED`, `SIGNUP_SLUG_INVALID`, `SIGNUP_TERMS_NOT_ACCEPTED`, `SIGNUP_TRIAL_ALREADY_ACTIVE`, `SIGNUP_RATE_LIMITED`, `TURNSTILE_FAILED` (reuse the existing code if one exists).

## 9. Declarative gating metadata

Backend and BFF controllers carry exactly one of: `@RequiresFeature(FeatureKey.X)`, `@AllowWhenSuspended()` (billing, access, logout), or `@NoFeatureGate()` (health, auth, webhooks). One global `TenantAccessGuard` enforces it; an `architecture-check` detector fails any route without one. Details: `tenant-billing.md` §5.1. The staff tenant-selection endpoint (`GET /auth/staff-tenants`) returns `operational: boolean` per tenant and never filters suspended tenants out; `POST /auth/switch-staff-tenant` must not reject a suspended tenant.

## 10. Auth and headers

Manager routes: JWT cookie, `X-Actor-ID/Type/Role` forwarded by the BFF; backend reads `RequestContext`. Public routes: `X-Tenant-Slug` only where tenant-scoped (the signup and prices routes are platform-level and carry none). The suspension guard is a **Guard** in the BFF (global, after `JwtAuthGuard`/`TenantGuard`), allow-listing the §1/§2 routes for managers — never an Interceptor.

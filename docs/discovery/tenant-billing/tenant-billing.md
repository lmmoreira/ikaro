# Discovery: Tenant Billing (Ikaro charging its tenants)

**Status:** Discovery — pre-canonical. Nothing here is implemented or promoted. Use cases are labeled `CAND-XX`, never `UC-XXX`.
**Date:** 2026-10-26 · **Slug:** `tenant-billing`
**Companion docs:** `tenant-billing_USECASES.md` (CAND-01..CAND-30) · `tenant-billing_DATA_MODEL.md` (schema `billing`) · `tenant-billing_API.md` (endpoints, webhook, crons) · `tenant-billing_MODULE.md` (hotsite module `TRIAL_SIGNUP_CTA`) · `prototype/` (start at `index.html`)
**Promote with:** `/discovery-to-milestone docs/discovery/tenant-billing/tenant-billing.md`

---

## 1. Problem statement

Ikaro is a multi-tenant SaaS, and today nothing in it models Ikaro itself being paid. There is no plan, price, subscription, entitlement or tenant billing status anywhere in the code (verified: no Stripe/payment code; `platform.tenants` has only `is_active`, which nothing enforces on the auth path). Tenants are provisioned by an operator script (UC-024) and every feature is available to every tenant.

The business needs to:

1. Charge each tenant a **different, negotiable price per feature**, in the currency of its country (BR → BRL, US → USD).
2. **Sell features separately** (hotsite only, or hotsite + booking + loyalty + chatbot + recurrence + lead form + availability alerts) and switch each one on only while it is paid for.
3. **Stop tenants that do not pay** without a hard "login blocked" wall: a lapsed tenant's manager can still log in, but only to a billing page where they can pay.
4. Let **anyone start a 14-day trial on their own** (self-signup from Ikaro's own hotsite), with all features, no card.
5. Keep Ikaro simple: **the payment provider owns everything money-related it can**.

## 2. Standing rules (the decisions that govern everything else)

| # | Rule |
|---|---|
| R1 | **The payment provider owns the money.** Charging, retries, hosted payment pages, receipts, refunds, chargebacks, saved cards and Pix mandates are the provider's. Ikaro stores only the status it needs (see R8). Ikaro never stores card data and never renders card forms. |
| R2 | **Entitlement gates, preference tunes, and both must pass.** An *entitlement* (Ikaro grants the feature because the tenant pays for it) is a different layer from a manager *preference* (hotsite `enabled`, `settings.*`). Effective availability = entitled AND enabled. Losing an entitlement never deletes or rewrites the manager's preference; regaining it resumes exactly as left. |
| R3 | **Everything sellable is a feature**, including the hotsite. A plan is a bundle of features. There is no always-included base. |
| R4 | **Price is per feature × country × tier**, in the country's currency. No FX conversion. A tenant's price is a snapshot copied into its subscription item when the feature is added; later list-price changes never touch existing tenants. |
| R5 | **Nothing fiscal is ever required of the tenant.** Tax ID, legal name and address are optional billing identity. Nota fiscal (NFS-e) is a fiscal process outside Ikaro v1 (handled in the provider console / by the accountant). |
| R6 | **Access control reads state, not events.** The tenant's billing status and entitled features are read synchronously through one shared `TenantAccessPort` (fail open). Events exist only to trigger emails. |
| R7 | **Billing never mutates the manager's `isPublished`.** Effective published = manager's `isPublished` AND tenant operational. |
| R8 | **Ikaro owns three policies only:** the access ladder, the entitlement set, and the clean-up. Everything else is mirrored from the provider via webhook + a reconcile job. |
| R9 | **Provider behind a port.** `BillingProviderPort` is defined in Ikaro's terms (start payment, give a payment link, cancel, enable auto-billing; inbound normalized events), never in the provider's. Asaas is the first adapter; Stripe is a later adapter for USD. |
| R10 | **Billing emails to the manager are exempt from the suspension gate**; every tenant-facing and customer-facing send stops while suspended. |

## 3. Industry research and provider decision record

**How the market structures this** (vendor docs; blog numbers are directional):
- Four layers: catalog → subscription → entitlements → dunning/access. Stripe recommends persisting entitlements in your own DB from its webhook instead of calling the API per request ([Stripe Entitlements](https://docs.stripe.com/billing/entitlements)).
- Subscription statuses `trialing → active → past_due → unpaid/canceled`; failed payments move to `past_due` and the provider retries ([Stripe subscriptions](https://docs.stripe.com/billing/subscriptions/overview.md)). Typical grace is 7–14 days with retries around days 1, 3, 5, 7; cutting access immediately raises churn ([SaaS billing guide](https://fungies.io/subscription-billing-implementation-saas-guide)).
- Access is graduated (banner → restricted → suspended) and the customer does not choose the due date: it anchors to the contract date. Updating the payment method and downloading invoices is done in the provider's hosted portal.
- Sales-led SaaS invoices manually; product-led SaaS uses processor subscriptions; most B2B SaaS ends up hybrid with its own subscription table and the processor as one way to collect. Ikaro is designed for both.

**Provider decision (2026-10-26): Asaas first, behind a port; Stripe later for USD.**

| Provider | Verdict | Evidence |
|---|---|---|
| **Asaas** | First adapter (BR) | Recurring Pix (Pix Automático) supported, and since a May 2026 changelog Asaas can generate later charges itself ([Pix Automático](https://docs.asaas.com/docs/pix-automatico)); subscriptions create charges ahead of due date (default 40 days, configurable 14 or 7) ([Assinaturas](https://docs.asaas.com/docs/assinaturas)); webhook auth by `asaas-access-token` header, at-least-once delivery, dedupe on event `id`, queue pauses after 15 consecutive failures, events kept 14 days ([webhooks](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook)); NFS-e with the charge, PJ account required, about R$ 0,49 per note ([FAQ](https://docs.asaas.com/docs/faq-de-notas-fiscais)). |
| **Stripe** | Second adapter, **in scope of the same milestone sequence** (USD, international; unlocks US signup) | Best API/portal/entitlements. For BRL: recurring Pix is documented ([Pix subscriptions](https://docs.stripe.com/billing/subscriptions/pix)) but a Stripe support article says Brazilian accounts only get one-time Pix ([support](https://support.stripe.com/questions/how-to-enable-pix-as-a-payment-method-in-brazil)) — conflicting; needs a Brazilian entity; no NFS-e. The owner has no Stripe account yet. Whether a Brazilian entity's Stripe account can charge foreign customers in USD (and what it settles in) is **not confirmed** — public sources only show Pix in BRL and BRL payouts ([search notes](https://business.ebanx.com/en/press-room/press-releases/stripe-users-can-now-accept-pix-in-brazil-via-ebanx)); confirm with Stripe before building. |
| **Appmax** | Rejected for this use | E-commerce checkout; recurring product exists but webhooks, NFS-e and Pix Automático are not confirmed ([appmax.com.br](https://appmax.com.br/)). |

Unverified items carried as open threads: §11.

## 4. Domain model summary

### 4.1 Features and dependencies

`FeatureKey` (closed enum in `@ikaro/types`, mirrored per the `closed-enum-registry` detector): `HOTSITE`, `BOOKING`, `LOYALTY`, `CHATBOT`, `LEAD_FORM`, `RECURRENCE`, `AVAILABILITY_ALERTS`.

| Feature | Requires |
|---|---|
| `BOOKING` | `HOTSITE` (assumed: customers reach booking through the hotsite) |
| `LOYALTY`, `RECURRENCE`, `AVAILABILITY_ALERTS` | `BOOKING` |
| `CHATBOT`, `LEAD_FORM` | `HOTSITE` |

Adding a feature whose dependency is not active is rejected; removing a feature that another active feature depends on is rejected.

**Tiers.** `CHATBOT` has tiers (`BASIC`, `PLUS` — names are placeholders). Billing only stores the tier on the item; the chatbot code (Platform) maps tier → LLM model + caps. Trial tenants get `BASIC`.

### 4.2 Aggregates (context `Billing`, a 7th bounded context)

| Aggregate | Owns |
|---|---|
| `Subscription` (1 per tenant) | status, suspension reason, currency, country, cycle (`MONTHLY` only in v1), anchor day, trial end, period, `pastDueSince`, `graceUntil`, `cancelAt`, provider ids; child **items** (feature, tier, price snapshot, `startsAt`, `endsAt`) |
| `BillingAccount` (1 per tenant) | optional tax identity (type, number), legal name, billing email, address, provider customer id, accepted terms |
| `Charge` | one bill for one period (due date, amount, status, method, provider charge id, payment link) + **lines** (price snapshot per feature) |
| `FeaturePrice` (platform-wide, no `tenant_id`) | list price per feature × country × tier × cycle; the starting point copied into items |

Entitlement is not an aggregate: **the entitled features are the currently active subscription items**. A granted/free feature is an item at price 0.

Boundary note: paying a `Charge` may move the `Subscription` back to `ACTIVE`. This is two aggregates in one use case, in one transaction, with a row lock on the subscription (`findByIdForUpdate`). Status is recomputable (the reconcile job re-derives it), so the invariant does not depend on the transaction alone.

### 4.3 Status ladder

`TRIALING → ACTIVE → PAST_DUE (14 days) → SUSPENDED`

| Status | Access | Notes |
|---|---|---|
| `TRIALING` | Everything, all features, tier `BASIC` for chatbot | 14 days, no card. First charge is issued 10 days before the trial ends. Unpaid at trial end → `PAST_DUE` like any late payment. |
| `ACTIVE` | Per active items | |
| `PAST_DUE` | **Full access**, banner for managers | 14 days (`graceUntil` can extend it by hand). Provider retries; reminders. |
| `SUSPENDED` (reason `NON_PAYMENT` or `CANCELED`) | See 4.4 | No expiry until the clean-up (4.6). **No new charges are issued while suspended.** |

Reactivation: the tenant pays the **one** open charge; the charge is re-dated and a new period starts at payment. The tenant never owes the months it could not use. (The 14 grace days before suspension were not paid for — accepted cost of the grace period.)

### 4.4 What suspension does

| Who / what | While `SUSPENDED` |
|---|---|
| Manager | Can log in; reaches **only** the billing page (everything else redirects there). |
| Staff | Can log in; sees only "Esta conta está suspensa. Fale com o gerente." |
| Customer | Can log in to their account; sees bookings with an "Empresa inativa" badge; history is viewable; the **detail page of open bookings is blocked**; cannot create bookings. |
| Tenant selection (staff with several tenants) | A suspended tenant **stays listed**, marked "Suspensa"; selecting it logs in and staff see the suspended notice. Never hidden, never an error page. (Customers sign in per tenant slug; no customer selector exists today — a future switcher must follow the same rule.) |
| Public hotsite | Effective-unpublished. Shows "Página não publicada" (reason-neutral), keeping the top bar with team login and customer login. |
| Notifications / reminders / loyalty emails | Stop for that tenant (gate at the notification send). **Billing emails to the manager still go out (R10).** Events produced meanwhile are dropped, not replayed on reactivation. |
| Crons (loyalty expiry etc.) | Run unchanged. Loyalty points expire on schedule even during a suspension (deliberate: gives tenants a reason to pay on time). Their *emails* are stopped by the notification gate. |
| Bookings already confirmed | Remain in the tenant's data; not visible to staff; customers see the badge. |

### 4.5 Cancelling and re-enabling

The manager can cancel on the billing page. Cancel takes effect at the **end of the already-paid period** (access continues until then; banner "Cancelada — acesso até dd/mm"). Message: nothing is refunded. At that date the tenant becomes `SUSPENDED` with reason `CANCELED`; open charges are cancelled at the provider; no new charges are issued. "Reativar assinatura" on the billing page creates one new charge for one month; paying it starts a new period. Possible until the clean-up runs.

### 4.6 Clean-up (tenant erasure)

A daily job erases tenants that stay `SUSPENDED` too long: **90 days** if the tenant cancelled or never paid, **180 days** if it paid before and lapsed. Warning emails to the manager **30 and 7 days** before the purge. Erasure publishes `TenantPurgeRequested`; **each bounded context deletes its own data** (every table has `tenant_id`) and the storage prefix `tenants/<tenantId>/` is removed. The slug is released. **Billing's charge history is retained (anonymized) for fiscal retention** — to be confirmed with the accountant. After the purge the person would have to sign up again; the one-active-trial-per-Google-account rule applies (contact Ikaro).

### 4.7 Pricing

`FeaturePrice`: `(feature_key, country_code, tier, cycle)` → `amount_minor` + `currency`. Countries in v1: **BR (BRL), US (USD)**. No fallback row. Adding a country = a country spec + price rows. Illustrative list (not decided; no prices are defined yet — Ikaro absorbs provider fees, to be added into prices):

| Feature | BR | US |
|---|---|---|
| HOTSITE | R$ 49,00 | US$ 12 |
| BOOKING | R$ 79,00 | US$ 19 |
| LOYALTY | R$ 29,00 | US$ 7 |
| CHATBOT BASIC / PLUS | R$ 39,00 / tbd | US$ 9 / tbd |
| LEAD_FORM | R$ 19,00 | US$ 5 |
| RECURRENCE | R$ 29,00 | US$ 7 |
| AVAILABILITY_ALERTS | R$ 19,00 | US$ 5 |

Adding a feature mid-cycle: switches on now, billed from the next cycle. Removing: effective at period end (operator can force). Price change on an item: from the next cycle. Annual billing: **deferred** (the `cycle` column exists so it can be added; it needs proration or aligned renewals first). No coupons. Billing country is fixed when the subscription starts.

## 5. Architecture

- **One `Billing` context** owns catalog, subscription, charges, the provider adapter, the webhook, crons and the access resolver. **No projection in Platform.**
- **`TenantAccessPort`** lives in `src/shared/ports/` (cross-cutting, like the tenant-settings port the request filter already uses). It returns status, suspension reason and the entitled features. Billing implements it with a short-TTL cache (`CachingXxx` pattern, `CachePort`), invalidated best-effort after commit. Callers pass an explicit `tenantId` (crons/handlers have no `RequestContext`). **Fail open**: no subscription row or a lookup error lets the tenant through, so a billing bug never locks out paying tenants; a new tenant always gets its subscription row from CAND-01.
- **Enforcement points** (CAND-15..20): BFF login routing and a global guard (Guard, never an Interceptor), web `proxy.ts` + dashboard layouts, the hotsite manifest/booking page/sitemap/robots (effective published), the notification send gate, each feature's use cases (entitlement), the public chatbot endpoint, locked UI in the dashboard.
- **Access cache:** the shared port's cache TTL is short (target ≤ 60 s, final value in story discovery) and the BFF guard keeps its own short cache so it does not call the backend per request; other instances serve the old answer until the TTL expires, which is accepted (a suspension or payment takes effect within the TTL).
- **Enforcement without scattered flags:** see §5.1.
- **Events (five, all email-triggering):** `ChargeIssued`, `ChargePaid`, `SubscriptionPastDue`, `SubscriptionSuspended`, `SubscriptionReactivated`, plus `TenantPurgeRequested` for erasure. If Asaas already emails payers about issued/paid/overdue charges (to verify), the first three and their handlers are dropped. Each event needs a line in the Billing audit-log handler (CI-enforced `domain-event-audit-coverage`).
- **Webhook:** a `@Public()` route in the BFF billing public controller, token-validated (`asaas-access-token`), raw body preserved, forwards to an internal backend endpoint; dedupe on provider event id; the tenant is resolved from the provider customer id before the event row is stored; unknown customers are acknowledged and logged; processing is idempotent. No provider I/O inside `txManager.run()`.
- **Crons (Cloud Scheduler → `/cron/billing-*`):** issue charges, status sweep (trial end, `PAST_DUE` → `SUSPENDED`, cancel-at), reconcile with the provider (webhook queues can stall and events expire after 14 days), provider-events retention purge, tenant clean-up. Cross-tenant jobs get their own standalone indexes.
### 5.1 Enforcement without scattered flags

A feature or the suspension state is checked at a few **declarative choke points**, never with ad-hoc `if (tenant.hasChatbot)` code inside use cases.

1. **HTTP (backend and BFF):** decorators `@RequiresFeature(FeatureKey.X)` on a controller or route, `@AllowWhenSuspended()` for the billing and access routes, and `@NoFeatureGate()` to opt out explicitly (health, auth, webhooks). One global **`TenantAccessGuard`** (a Guard, never an Interceptor) reads that metadata with `Reflector`, asks `TenantAccessPort`, and throws `FEATURE_NOT_ENTITLED` or `TENANT_SUSPENDED`. Guards run before interceptors, so the guard takes `tenantId` from the request headers/JWT (and resolves it from the slug for `@Public()` tenant-scoped routes), not from `RequestContext` — verify against how the existing role guards do it.
2. **Completeness is CI-enforced:** an `architecture-check` detector fails when a controller route carries none of the three decorators, so a new endpoint cannot ship ungated by omission.
3. **Events:** the gate lives in the event dispatcher. A handler declares its requirement in its subscription metadata (`subscribe(Event.name, handler, CONSUMER, { requires: FeatureKey.LOYALTY })`); the dispatcher skips and logs for suspended or unentitled tenants. Handlers contain no access logic. Billing's own handlers use `{ allowWhenSuspended: true }`.
4. **Crons:** one shared tenant-scoped job helper iterates tenants through a single method that already excludes suspended and unentitled tenants (one batch query); individual crons do not check.
5. **Notifications:** the single send path (CAND-18), with Billing templates exempt.
6. **Web:** one route-to-feature registry feeds the dashboard nav (locked items), the layouts and `proxy.ts`, plus one `<FeatureGate feature>` wrapper for the locked state.
7. **Kill switch:** `FEATURE_FLAG_BILLING_ENFORCEMENT` (default `true`; `false` = fail open everywhere). It is read in exactly one place (the port), so every choke point honors it.

Adding a sellable feature then means: add the `FeatureKey`, decorate its controllers, tag its subscriptions. Nothing else. Risks: the dispatcher change touches the shared event bus and needs care; the `@Public()` slug resolution adds a tenant lookup on those routes (cached).

- **Anti-pattern check (CLAUDE.md §8):** `useClass` not `useExisting`; no new cross-context Port+Adapter (one shared port); money and tax-id value objects with typed errors (`vo-bare-error`); new error codes in both locale files; check `@ikaro/types` before adding web types; validation schemas duplicated in BFF and backend; no raw SQL outside repositories; `@Global()` modules must `export` their tokens; architecture-policy entries for any permitted edge.
- **Cost / infra tail:** new third-party dependency (Asaas), secrets (API key, webhook token), 5+ Cloud Scheduler jobs, a new schema `billing`, the 7th context in `BOUNDED_CONTEXTS.md`, new email templates (pt-BR and en) that must reach already-provisioned tenants, Terraform for scheduler/secrets.

## 6. Self-signup, trial and Ikaro's own tenant

- Ikaro is a tenant too (its hotsite is the marketing site). That tenant is **exempt from billing** (subscription with every feature at price 0).
- Hotsite module **`TRIAL_SIGNUP_CTA`** (title, optional text, button label) — a CTA only, no form. It is restricted to the tenant whose slug is the platform owner's (`PLATFORM_OWNER_TENANT_SLUG`). The button opens the public page **`/ikaro-trial`**. Detail: `tenant-billing_MODULE.md`.
- `/ikaro-trial` shows feature descriptions (translated copy in the web app) and the **price table** (read from `FeaturePrice`, BR/US switch), then: Turnstile → Google sign-in (verified email and name) → form (business name, slug, country BR|US, language, **Terms and Privacy checkbox**) → provision → welcome. The signup endpoint lives in **Platform** and calls the existing `ProvisionTenantUseCase`; Billing reacts to `TenantProvisioned` (CAND-01).
- **US at signup:** the country selector offers BR; **US is enabled by `FEATURE_FLAG_SIGNUP_US=true` once the Stripe adapter is live**, so no US trial can end without a way to pay. US prices exist in `feature_prices` from the start.
- Rules: slug 3–30 chars, `a-z0-9-`, no leading/trailing hyphen, reserved list generated from the **real top-level routes** (`dashboard`, `login`, `account`, `ikaro-trial`, `api`, `admin`, `www`, …) plus platform words, not changeable in v1 (extends the existing `Slug` VO, which today only checks the regex); **one active trial per Google account**; Turnstile + per-IP rate limit; chatbot at tier `BASIC`.
- Acceptance of Terms/Privacy (version + timestamp) is stored on the tenant's billing account.

## 7. Roles and visibility

Operator = Ikaro staff acting through scripts/internal endpoints (no backoffice screen in v1). Every operator action is audited (who, when, why). Every MANAGER of a tenant sees its billing page; billing emails go to the billing email, falling back to the managers' emails. Alerts to Ikaro (failed webhooks, reconcile drift, daily overdue/suspended list) are emails to the manager of Ikaro's own tenant.

## 8. Non-Goals / explicitly deferred

Annual billing and proration · coupons / free months · in-app payment-method forms · refund screens (provider console) · NFS-e issuing · FX conversion · currency or country change after start · operator backoffice screen · trial-extension action · additional limits beyond the chatbot tier (staff count, resources, services, lead submissions) · plan bundles / templates · usage-based pricing · self-serve plan changes (every change goes through the operator) · replaying events produced during a suspension.

## 9. Standing "known good" integrations and reuse

Hotsite publish state already exists (`hotsite_configs.is_published`, `<Unavailable />`, `manifest.isPublished` checked by the booking page): suspension is a new *reason* for the existing state, not a new mechanism. Turnstile verification and the lead-form public-write pattern are reused. Chatbot per-tenant caps and `llmProvider`/`llmModel` overrides already exist in `settings.chatbot` (dev-only today); the chatbot tier becomes their official source.

## 10. Historical questions & decisions (dated 2026-10-26)

1. *Scope:* flexible per-tenant pricing, feature entitlements, payments, restricted login. → Confirmed; research on how SaaS do it done first.
2. *Is entitlement the same as the hotsite `enabled` flag?* → No. Hotsite `enabled` is the manager's preference; entitlement is Ikaro's permission. Both must pass (R2).
3. *Self-signup?* → First "script for now", then **self-serve from day zero**. Final: in scope, 14-day trial, no card, all features.
4. *Provider:* Stripe vs Asaas vs Appmax. → Asaas first, Stripe later, port-based (§3). No Stripe account exists.
5. *Collection model:* manual-first vs provider-first. → Provider owns the money (R1); manual adapter remains a designed-for option.
6. *Access ladder:* → `TRIAL → ACTIVE → PAST_DUE (14 days) → SUSPENDED`; the proposed `RESTRICTED` step was merged into `SUSPENDED`.
7. *Suspension behavior:* manager billing-only; staff blocked; customers see badge, history ok, no open-booking detail, no new bookings; hotsite unpublished with topbar login; no notifications/loyalty emails; crons unchanged.
8. *Loyalty expiry across suspension:* points expire on schedule (no special handling).
9. *Context:* new `Billing` context + shared `TenantAccessPort`; the Platform-projection idea was rejected as extra machinery.
10. *Events:* trimmed from 10 to 5 email-triggering + `TenantPurgeRequested`.
11. *Price list:* `FeaturePrice` by feature × country (then × tier × cycle); no fallback; BR and US only.
12. *Fiscal:* nothing mandatory for the tenant; optional billing identity; nota fiscal outside the product.
13. *Mid-cycle add:* billed from next cycle. *Remove:* end of period.
14. *Cancel:* at end of paid period, no refund; one `SUSPENDED` status with a reason; reactivation pays one month; no charges while suspended.
15. *Clean-up:* 90 / 180 days with 30 and 7-day warnings; billing history retained.
16. *Refunds/chargebacks:* provider console; Ikaro only records `REFUNDED`/`CHARGEBACK`.
17. *Limits:* chatbot tier (model + caps) is the only v1 limit; annual billing deferred with a `cycle` column; no coupons; no trial extension.
18. *Signup details:* module `TRIAL_SIGNUP_CTA` (CTA only) on Ikaro's tenant, `/ikaro-trial` page, Google first, Terms checkbox, one trial per Google account, slug rules.
19. *Existing tenants:* none real; staging tenants migrated by script as `ACTIVE`, features at price 0.
20. *Billing visibility:* all managers.
21. *Route name:* the signup page is `/ikaro-trial` (not `/testar`); the reserved-slug list comes from the real top-level routes.
22. *UI pattern:* billing is one page with tabs (Resumo, Cobranças, Dados de cobrança, Cobrança automática) and a single primary action per tab, like the service editor; destructive actions are a separate confirmation page.
23. *Enforcement design:* declarative (decorators + one guard + dispatcher/cron/notification choke points), a CI detector for completeness, and one kill switch (§5.1) — accepted so no feature flags are scattered through the code.
24. *Stripe:* the adapter is in scope of the milestone sequence; US signup is gated by `FEATURE_FLAG_SIGNUP_US` until it is live.
25. *Access staleness:* a short cache TTL is acceptable.
26. *Suspended tenants stay visible in the staff tenant selection;* staff who select one see the suspended notice. (A customer selector does not exist in the code today.)

## 11. Open threads

- Asaas: hosted payment page and "update payment method" flow; full charge-event list and `PAYMENT_OVERDUE` payload; whether Asaas emails payers about issued/paid/overdue charges; card-tokenization flow (hosted vs in-app, PCI impact); sandbox parity; fees; account approval for the entity. Pix Automático availability on the owner's account.
- Accountant: nota fiscal obligation for BR tenants; export-of-services and US sales-tax treatment; retention period for billing history.
- Existing auth error reason `tenant-deactivated` (`journeys/staff/prototypes/login/01d-error-tenant-deactivated.html`): suspension must **not** reuse it (login is never blocked); decide whether it stays for true deactivation (`is_active=false`).
- Stripe: USD charging and settlement for a Brazilian entity; account opening.
- Whether `<Unavailable />` already renders the top bar (needed for "Página não publicada" with team/customer login).
- Whether a booking-only tenant without a hotsite should exist (assumed no).
- Chatbot tier names and the model/caps per tier; real prices.
- Design of the short-lived signup session between Google sign-in and provisioning (cookie vs token) — decide in story discovery, reusing the staff selection-token pattern where possible.
- Enforcement checklist per feature (public chatbot endpoint, recurring renewal reminders cron, availability-alert creation, lead-form endpoint, loyalty write paths).
- Legal texts for Termos de Uso and Política de Privacidade (owner to provide).

## 12. Canonical docs this will touch on promotion

`DOMAIN_MODEL`, `BOUNDED_CONTEXTS` (7th context), `DATABASE_SCHEMA` (schema `billing`, `feature_prices` tenant-id exemption), `USE_CASES`, `API_CONTRACTS`, `DOMAIN_EVENTS`, `TENANTS_SETTINGS_SCHEMA` (chatbot tier source), `HOTSITE_DYNAMIC_ARCHITECTURE` (§3, §4, §7 for `TRIAL_SIGNUP_CTA`; unpublished state), `ERROR_CATALOG` + both locale `errors.json`, `ENGINEERING_RULES_BACKEND` (webhook, cron, access port), `LOCK_CATALOG` (subscription row lock), `RUNBOOKS` (billing incident), `TECH_STACK_DECISIONS` (provider choice), Terraform scheduler/secrets, `CLAUDE.md` §3 and §11 (context and slice lists).

# Discovery: Tenant Billing (Ikaro charging its tenants)

**Status:** Discovery — pre-canonical. Nothing here is implemented or promoted. Use cases are labeled `CAND-XX`, never `UC-XXX`.
**Date:** 2026-10-26 (reviewed and revised 2026-10-27: decisions 42–64) · **Slug:** `tenant-billing`
**Companion docs:** `tenant-billing_USECASES.md` (CAND-01..CAND-32) · `tenant-billing_DATA_MODEL.md` (schema `billing`) · `tenant-billing_API.md` (endpoints, webhook, crons) · `tenant-billing_MODULE.md` (hotsite module `TRIAL_SIGNUP_CTA`) · `tenant-billing_PROVIDERS.md` (verified Asaas/Stripe facts, account-opening checklist, launch gates) · `tenant-billing_PROMOTION_SKETCH.md` (suggested milestone and story order) · `prototype/` (start at `index.html`)
**Promote with:** `/discovery-to-milestone docs/discovery/tenant-billing/tenant-billing.md`

---

## 1. Problem statement

Ikaro is a multi-tenant SaaS, and today nothing in it models Ikaro itself being paid. There is no plan, price, subscription, entitlement or tenant billing status anywhere in the code (verified: no Stripe/payment code; `platform.tenants` has only `is_active`, which nothing enforces on the auth path). Tenants are provisioned by an operator script (UC-024) and every feature is available to every tenant.

The business needs to:

1. Charge each tenant a **price per feature, set by its country** (BR → BRL, US → USD), with one list for everyone and no per-tenant negotiation.
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
| R4 | **Price is per feature × country × tier × cycle**, from one list, in the country's currency. No FX conversion and **no per-tenant prices or negotiation**. BR prices are tax-inclusive; US prices are net and receive a separately displayed Stripe Tax amount once the customer's location is known. When an invoice is issued, it selects the list-price version in force at that invoice's **service-period start** and snapshots both its feature lines and any tax result; no issued invoice is edited (the only writes after insert are the provider-finalized tax/amount of a US charge and a recovery charge's period dates). A list change is **operator-only, dated and announced**. An increase needs at least `PRICE_CHANGE_MIN_NOTICE_DAYS + CHARGE_ISSUE_LEAD_DAYS` notice (30 + 10 days by default), so managers know the amount before the early invoice is issued. Annual / semester contracts are extra price rows (`cycle`), deferred. |
| R5 | **Nothing fiscal is required to *use* the product; the minimum billing identity is required to *charge* it, and formats follow the billing country.** Address and tax-ID fields, labels and validation come from the existing per-country `CountrySpec` (`AddressSpec` + a new tax-ID entry), in the tenant's language. The minimum is what the provider needs to create a payable charge: **BR = CPF or CNPJ** (Asaas requires `cpfCnpj` to create a customer), collected at signup; **US = the full address** (street, city, state, ZIP — Stripe Tax needs at least a 5-digit ZIP and discourages ZIP-only), collected before the first paid-plan selection. Legal name and billing email stay optional. Nota fiscal (NFS-e) is a fiscal process outside Ikaro v1 (handled in the provider console / by the accountant). |
| R6 | **Access control reads state, not events.** The tenant's billing status and entitled features are read synchronously through one shared `TenantAccessPort`. A transient lookup failure fails open so Billing downtime cannot lock out a paying tenant; a successfully-read **missing subscription** is a provisioning/data-integrity incident, never unrestricted access. Events trigger emails and durable cross-context work only. |
| R7 | **Billing never mutates the manager's `isPublished`.** Effective published = manager's `isPublished` AND tenant operational. |
| R8 | **Ikaro owns three policies only:** the access ladder, the entitlement set, and the clean-up. Everything else is mirrored from the provider via webhook + a reconcile job. |
| R9 | **Providers behind a port.** `BillingProviderPort` is defined in Ikaro's terms (start payment, give a payment link, cancel, enable auto-billing; inbound normalized events), never in the provider's. Both Asaas (BRL) and Stripe (USD) are designed in the billing scope; a country/provider activation is released only after its real account and sandbox flow is verified. |
| R10 | **Billing emails to the manager are exempt from the suspension gate**; every tenant-facing and customer-facing send stops while suspended. |
| R11 | **Plan changes are self-service.** The manager adds or removes features and picks the chatbot tier on a "Plano" tab, sees the new total before saving, and no contact is needed. There is no operator step for prices. |
| R12 | **`exempt` is the one switch for "never charge this tenant".** An exempt subscription has every feature, is never charged, never suspended, never purged and receives no billing emails. It is set by an audited operator endpoint (or at provisioning) and can be cleared again; Ikaro's own tenant can never be un-exempted. It is not a price of zero and not the global kill switch. |

## 3. Industry research and provider decision record

**How the market structures this** (vendor docs; blog numbers are directional):
- Four layers: catalog → subscription → entitlements → dunning/access. Stripe recommends persisting entitlements in your own DB from its webhook instead of calling the API per request ([Stripe Entitlements](https://docs.stripe.com/billing/entitlements)).
- Subscription statuses `trialing → active → past_due → unpaid/canceled`; failed payments move to `past_due` and the provider retries ([Stripe subscriptions](https://docs.stripe.com/billing/subscriptions/overview.md)). Typical grace is 7–14 days with retries around days 1, 3, 5, 7; cutting access immediately raises churn ([SaaS billing guide](https://fungies.io/subscription-billing-implementation-saas-guide)).
- Access is graduated (banner → restricted → suspended) and the customer does not choose the due date: it anchors to the contract date. Updating the payment method and downloading invoices is done in the provider's hosted portal.
- Sales-led SaaS invoices manually; product-led SaaS uses processor subscriptions; most B2B SaaS ends up hybrid with its own subscription table and the processor as one way to collect. Ikaro is designed for both.

**Provider decision (2026-10-26): Asaas (BRL) and Stripe (USD), behind one port.**

| Provider | Verdict | Evidence |
|---|---|---|
| **Asaas** | First adapter (BR) | Recurring Pix (Pix Automático) supported, and since a May 2026 changelog Asaas can generate later charges itself ([Pix Automático](https://docs.asaas.com/docs/pix-automatico)); subscriptions create charges ahead of due date (default 40 days, configurable 14 or 7) ([Assinaturas](https://docs.asaas.com/docs/assinaturas)); webhook auth by `asaas-access-token` header, at-least-once delivery, dedupe on event `id`, queue pauses after 15 consecutive failures, events kept 14 days ([webhooks](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook)); NFS-e with the charge, PJ account required, about R$ 0,49 per note ([FAQ](https://docs.asaas.com/docs/faq-de-notas-fiscais)). |
| **Stripe** | USD adapter, **in scope of the same milestone sequence** (US signup is enabled only after its real account/sandbox verification) | Best API/portal/hosted invoices. Verified 2026-10-27 (`tenant-billing_PROVIDERS.md` §2): a Brazilian CNPJ account is allowed but settles in BRL only, with no USD payouts and no ACH; first US account = that account, cards only (decision 60). Hosted object = **Invoices** with `automatic_tax`; Stripe Tax calculates only where the account is registered and never files. Ikaro's selling company remains merchant of record and responsible for registration/filing. Real-account checks are launch gates. |
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

`HOTSITE` is therefore the root of every other feature and is effectively mandatory: it can never be removed (the plan keeps at least one feature, and every other feature requires it). There is no billable booking-only tenant.

Adding a feature whose dependency is not active is rejected; removing a feature that another active feature depends on is rejected.

**Tiers.** `CHATBOT` has tiers (`BASIC`, `PLUS` — names are placeholders). Billing only stores the tier on the item; the chatbot code (Platform) maps tier → LLM model + caps. Trial tenants get `BASIC`.

### 4.2 Aggregates (context `Billing`, a 7th bounded context)

| Aggregate | Owns |
|---|---|
| `Subscription` (1 per tenant) | status, suspension reason, currency, country, **timezone (snapshot)**, cycle (`MONTHLY` only in v1), anchor day, trial end, period, `pastDueSince`, `graceUntil`, `cancelAt`, `exempt`, provider ids; child **items** (feature, tier, `startsAt`, `endsAt` — **no price**) |
| `BillingAccount` (1 per tenant) | optional tax identity (type, number), legal name, billing email, address, provider customer id, accepted terms |
| `Charge` | one bill for one period (due date, amount, status, method, provider charge id, payment link) + **lines** (price snapshot per feature) |
| `FeaturePrice` (platform-wide, no `tenant_id`) | catalog identity + dated versions per feature × country × tier × cycle; items reference the tuple logically and charge lines snapshot the selected version |

Entitlement is not an aggregate: **the entitled features are the currently active subscription items**. Free access (Ikaro's own tenant, staging tenants) is the `exempt` flag on the subscription, not a price of zero. Items carry no price: the amount of a charge is read from the price list when the charge is issued.

Boundary note: paying a `Charge` may move the `Subscription` back to `ACTIVE`. This is two aggregates in one use case, in one transaction, with a row lock on the subscription (`findByIdForUpdate`). Status is recomputable (the reconcile job re-derives it), so the invariant does not depend on the transaction alone.

### 4.3 Status ladder

`TRIALING → ACTIVE → PAST_DUE (14 days) → SUSPENDED`; a trial whose first invoice is unpaid goes **directly** `TRIALING → SUSPENDED` (no grace).

| Status | Access | Notes |
|---|---|---|
| `TRIALING` | Everything, all features, tier `BASIC` for chatbot | 14 days, no card. The Plan tab chooses the first paid period but never changes trial entitlements. **Default first paid selection = every trial feature continues** (chatbot `BASIC`) unless the manager changes it. The first invoice is issued 10 days before trial end, is due at trial end, and—when paid—anchors later renewals to the trial-end day. **If the trial ends without a paid first invoice — unpaid at its due date, or no charge could be issued — the subscription becomes `SUSPENDED` (`NON_PAYMENT`) at trial end. There is no `PAST_DUE` grace after a trial.** |
| `ACTIVE` | Per active items | |
| `PAST_DUE` | **Full access**, banner for managers | 14 days (`graceUntil` can extend it by hand). Provider retries; reminders. |
| `SUSPENDED` (reason `NON_PAYMENT`, `CANCELED`, or `PAYMENT_REVERSED`) | See 4.4 | No expiry until the clean-up (4.6). **No new charges are issued while suspended.** A full confirmed refund or completed chargeback reversal that leaves the current period unpaid suspends immediately as `PAYMENT_REVERSED`; a dispute merely opened does not. |

Reactivation: the old open charge is **never edited or re-dated**. On a reactivation request Billing cancels it (locally and at the provider) and issues one **recovery charge**: one month, amount fixed at issue from the price versions in force on the issue date, lines = the last active items. When that charge is confirmed paid, the subscription becomes `ACTIVE`, `current_period_start` = the payment moment, `anchor_day` = the payment's tenant-local day clamped to 28, and the recovery charge's `period_start`/`period_end` are written then (the only charge fields written after issue, because the period does not exist until paid). The tenant never owes the months it could not use. (The 14 grace days before suspension were not paid for — accepted cost of the grace period.)

### 4.4 What suspension does

| Who / what | While `SUSPENDED` |
|---|---|
| Manager | Can log in; reaches **only** the billing page (everything else redirects there). |
| Staff | Can log in; sees only "Esta conta está suspensa. Fale com o gerente." |
| Customer | Can log in to their account; sees bookings with an "Empresa inativa" badge; history is viewable; open-booking details, rescheduling and new booking are blocked, but a customer may **cancel** an existing future booking. Loyalty balance/history stay read-only; earning and redemption are blocked. |
| Tenant selection (staff with several tenants) | A suspended tenant **stays listed**, marked "Suspensa"; selecting it logs in and staff see the suspended notice. Never hidden, never an error page. (Customers sign in per tenant slug; no customer selector exists today — a future switcher must follow the same rule.) |
| Public hotsite | Effective-unpublished. Shows "Página não publicada" (reason-neutral), keeping the top bar with team login and customer login. The same page, with the same bar, is shown for **every** unpublished hotsite (a different page for suspended tenants would leak the reason). `Unavailable` does not render the bar today — a code change (decision 49). |
| Notifications / reminders / loyalty emails | Stop for that tenant (gate at the notification send). **Billing emails to the manager still go out (R10).** Events produced meanwhile are dropped, not replayed on reactivation. |
| Crons (loyalty expiry etc.) | Run unchanged. Loyalty points expire on schedule even during a suspension (deliberate: gives tenants a reason to pay on time). Their *emails* are stopped by the notification gate. |
| Bookings already confirmed | Remain in the tenant's data; not visible to staff; customers see the badge. |

### 4.5 Cancelling and re-enabling

The manager can cancel on the billing page. An `ACTIVE` subscription cancels at the **end of its already-paid period** (access continues until then; banner "Cancelada — acesso até dd/mm"). On confirmation, every unpaid charge whose service period begins on/after `cancelAt` is immediately cancelled locally and at the provider, so no cancelled service remains payable. A `PAST_DUE` or `TRIALING` subscription cancels immediately because it has no paid period left: it becomes `SUSPENDED` with reason `CANCELED`. "Reativar assinatura" clears a still-future `cancelAt`; after suspension it issues one new recovery charge for one month (see §4.3), and confirmed payment starts a new period anchored to the payment date. When a subscription is cancelled, its items are end-dated at the suspension; the recovery charge's lines and the restored items are the items that were active at that moment. Nothing is refunded.

### 4.6 Clean-up (tenant erasure)

A daily job selects tenants that stay `SUSPENDED` too long: **90 days** if the subscription never paid (`has_ever_paid = false`), **180 days** if it paid at least once — regardless of the suspension reason. Warning emails go to the manager **30 and 7 days** before the deadline. Selection creates a durable `TenantPurgeJob`; it then publishes `TenantPurgeRequested`. Each bounded context deletes its own data idempotently and publishes its completion after commit; Billing records the completions. Storage cleanup, provider cancellation and Billing's anonymized fiscal history are also required steps. Only after every required step completes does Platform delete the tenant root and release its slug. The job is an operational process (`REQUESTED`/`IN_PROGRESS`/`FAILED`/`COMPLETED`), not a Subscription status. Tenant erasure does not exist anywhere in the code today: every bounded context, storage, chatbot and audit data each need their own deletion story, sequenced before the purge cron is enabled. After a completed purge the signup trial rule of §6 is evaluated again.

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

**Self-service plan changes (R11):** additions, removals, chatbot upgrades and downgrades all become effective at the **next paid service-period start**. They never change current-period entitlements, require no proration and cannot be used without payment. During the **trial**, all features remain enabled; the Plan tab only records the first paid selection. The proposed final selection is validated as one dependency graph, so dependent features may be added together in one save. A plan always keeps at least one feature. `PAST_DUE` and `SUSPENDED` plans are read-only. If the next invoice is already issued and unpaid, it is cancelled and re-issued from the scheduled next-period selection; a paid invoice is never changed. **List price changes:** the operator schedules a dated version and announces it by email to every affected `ACTIVE`/`PAST_DUE` manager. `effective_from` is a **service-period start date**, and an increase requires at least `PRICE_CHANGE_MIN_NOTICE_DAYS + CHARGE_ISSUE_LEAD_DAYS` notice (default 40 days). A catalog row may be hidden from new selection while existing subscribers continue renewing it; a planned retirement needs a separately announced migration date. Annual billing is deferred. No coupons. Billing country is fixed when the subscription starts. **A newly selected feature starts only at the next paid period, up to about a month later:** the locked-feature screens and the Plano tab say so ("começa em dd/mm"), they never imply instant access. **US totals shown on the Summary and Plano tabs are net of tax** and carry a "+ imposto calculado na cobrança" label; the tax amount exists only on the issued charge (R4). A suspended tenant is not notified of price changes; its recovery charge snapshots the price in force on its issue date.

## 5. Architecture

- **One `Billing` context** owns catalog, subscription, charges, the provider adapter, the webhook, crons and the access resolver. **No projection in Platform.**
- **`TenantAccessPort`** lives in `src/shared/ports/` (cross-cutting, like the tenant-settings port the request filter already uses). It returns status, suspension reason and entitled features. Billing implements it with a short-TTL cache (`CachingXxx` pattern, `CachePort`), invalidated best-effort after commit. Callers pass an explicit `tenantId`. A temporary lookup error fails open; a successful read with no subscription is a provisioning/data-integrity incident, emits an urgent alert, and never grants unrestricted access.
- **Enforcement points** (CAND-15..20): BFF login routing and a global guard (Guard, never an Interceptor), web `proxy.ts` + dashboard layouts, the hotsite manifest/booking page/sitemap/robots (effective published), the notification send gate, each feature's use cases (entitlement), the public chatbot endpoint, locked UI in the dashboard.
- **Access cache:** the shared port's cache TTL is short (target ≤ 60 s, final value in story discovery) and the BFF guard keeps its own short cache so it does not call the backend per request; other instances serve the old answer until the TTL expires, which is accepted (a suspension or payment takes effect within the TTL).
- **Enforcement without scattered flags:** see §5.1.
- **Events:** `ChargeIssued`, `ChargePaid`, `SubscriptionPastDue`, `SubscriptionSuspended`, `SubscriptionReactivated`, `SubscriptionPriceChangeAnnounced` (one per affected tenant), and purge command/completion events. Ikaro sends all of these emails itself (decision 59). Each event needs a Billing audit-log subscription.
- **Webhook:** a `@Public()` BFF route validates `asaas-access-token`, preserves the raw body and forwards internally. The backend resolves the tenant, deduplicates the provider event, applies the local charge/subscription state and writes any outbox event **in one transaction**, then returns exactly `200` (Asaas treats 201/204/3xx as failures, decision 61). Email delivery is asynchronous from the outbox. Unknown customers are acknowledged and logged; provider I/O never occurs inside `txManager.run()`.
- **Crons follow the existing trigger pattern, not a bespoke HTTP one:** Cloud Scheduler publishes a tenant-less trigger over Pub/Sub, delivered through the shared `/pubsub/push` receiver to a handler registered with `ITriggerBus.registerTrigger(name, handler, consumer)`; the `/cron/billing-*` controller endpoints are only the local/manual publisher behind `InternalApiGuard`, exactly like `CronLeadFormController`. Jobs: issue charges, status sweep (trial end, due-date overdue, `PAST_DUE` → `SUSPENDED`, cancel-at), reconcile with the provider (webhook queues can stall and events expire after 14 days), provider-events retention purge, tenant clean-up, ops digest. Each job selects its own tenants through standalone indexes (no tenant id arrives with the trigger).
### 5.1 Enforcement without scattered flags

A feature or the suspension state is checked at a few **declarative choke points**, never with ad-hoc `if (tenant.hasChatbot)` code inside use cases.

1. **HTTP (backend and BFF):** `@RequiresFeature(FeatureKey.X)` declares entitlement and `@SuspensionAccess(...)` declares the exceptional suspended-state route policy (`MANAGER_BILLING`, `STAFF_NOTICE`, `CUSTOMER_HISTORY`, `AUTH_TENANT_SWITCH`, `PUBLIC_NONE`, or `DEFAULT_DENY`). `@NoFeatureGate()` is only for health, auth and webhooks. One global **`TenantAccessGuard`** reads metadata with `Reflector`, asks `TenantAccessPort`, and throws typed errors. Record-dependent exceptions—customer cancellation is allowed but an open-booking detail is not—remain Booking domain policy, not a guessed route rule.
2. **Completeness is CI-enforced:** an `architecture-check` detector requires explicit entitlement and suspension metadata (or `@NoFeatureGate`) on every tenant-scoped route.
3. **Events (opt-in gate):** `IEventBus.subscribe` has no options parameter today, so this adds an optional fourth argument. A handler that sends something outbound (notifications, loyalty emails, reminders) declares it — `subscribe(Event.name, handler, CONSUMER, { requires: FeatureKey.LOYALTY, skipWhenSuspended: true })` — and the dispatcher then skips and logs it for suspended or unentitled tenants. **The default is to run:** audit-log handlers, state-sync handlers and Billing's own handlers are never skipped, so a suspension cannot create audit gaps or half-applied state. Skipped events are dropped, not replayed. Handlers contain no access logic.
4. **Crons:** one shared tenant-scoped job helper iterates tenants through a single method that already excludes suspended and unentitled tenants (one batch query); individual crons do not check. Billing's own jobs deliberately do not use it.
5. **Notifications:** the single send path (CAND-18), with Billing templates exempt.
6. **Web:** one route-to-feature registry feeds the dashboard nav (locked items), the layouts and `proxy.ts`, plus one `<FeatureGate feature>` wrapper for the locked state.
7. **Kill switch:** `FEATURE_FLAG_BILLING_ENFORCEMENT` (default `true`; `false` = fail open everywhere). It is read in exactly one place, so every choke point honors it; it is an emergency switch, not normal policy.

Adding a sellable feature then means: add the `FeatureKey`, decorate its controllers, tag its subscriptions. Nothing else. Risks: the dispatcher change touches the shared event bus and needs care; the `@Public()` slug resolution adds a tenant lookup on those routes (cached).

### 5.2 Changes to existing Platform provisioning

Verified against the code: `ProvisionTenantUseCase` takes `{name, slug, adminEmail, country_code, timezone?}` and `TenantProvisioned` carries only `{name, slug, adminEmail, timezone}`. Billing and signup need more, so promotion includes:
- `TenantProvisioned` gains `countryCode` and an optional billing hint (`exempt`, optional feature subset); bump `eventVersion`. Billing's trial handler reads `countryCode`, `timezone` and the hint from the event and never calls Platform.
- `ProvisionTenantUseCase`/`POST /internal/tenants`/`scripts/provision-tenant.sh` gain an optional `exempt` flag. No `language` parameter is added: **language always derives from country** (BR → `pt-BR`, US → `en`), as today.
- Self-signup records the creator's Google `sub` and the accepted Terms version/time in the new `billing.signup_registrations` table (data model) and hands the terms to Billing through the same event hint.
- **A non-exempt US tenant is rejected while `FEATURE_FLAG_SIGNUP_US` is off**, by the script path as well as by self-signup (Billing fails loudly and alerts); exempt US tenants (test tenants) are allowed.

- **Anti-pattern check (CLAUDE.md §8):** `useClass` not `useExisting`; no new cross-context Port+Adapter (one shared port); money and tax-id value objects with typed errors (`vo-bare-error`); new error codes in both locale files; check `@ikaro/types` before adding web types; validation schemas duplicated in BFF and backend; no raw SQL outside repositories; `@Global()` modules must `export` their tokens; architecture-policy entries for any permitted edge.
- **Cost / infra tail:** new third-party dependency (Asaas), secrets (API key, webhook token), 5+ Cloud Scheduler jobs, a new schema `billing`, the 7th context in `BOUNDED_CONTEXTS.md`, new email templates (pt-BR and en) that must reach already-provisioned tenants, Terraform for scheduler/secrets.

## 6. Self-signup, trial and Ikaro's own tenant

- Ikaro is a tenant too (its hotsite is the marketing site). That tenant is **exempt from billing** (`exempt = true`: all features, never charged, never suspended, never purged).
- Hotsite module **`TRIAL_SIGNUP_CTA`** (title, optional text, button label) — a CTA only, no form. It is restricted to the tenant whose slug is the platform owner's (`PLATFORM_OWNER_TENANT_SLUG`). The button opens the public page **`/ikaro-trial`**. Detail: `tenant-billing_MODULE.md`.
- `/ikaro-trial` shows feature descriptions (translated copy in the web app) and the **price table** (read from `FeaturePrice`, BR/US switch), then: Turnstile → Google sign-in (verified email and name) → form (business name, slug, country BR|US, **CPF or CNPJ for BR (decision 57)**, **Terms and Privacy checkbox**; language is derived from the country) → create tenant → **account-created / check-email page**. The signup endpoint lives in **Platform** and calls the existing `ProvisionTenantUseCase`; `TenantProvisioned` asynchronously creates the first manager and Billing trial. The visitor is not issued a tenant JWT or sent to the dashboard by signup; they use the existing first-manager invitation/login email once that work completes (CAND-22).
- **US at signup and provisioning:** the country selector offers BR; **US is enabled by `FEATURE_FLAG_SIGNUP_US=true` once the Stripe adapter is live**, and the same flag blocks a non-exempt US tenant provisioned by script (§5.2), so no US trial can end without a way to pay. US prices exist in `feature_prices` from the start.
- Rules: slug 3–30 chars, `a-z0-9-`, no leading/trailing hyphen, reserved list generated from the **real top-level routes** (`dashboard`, `login`, `account`, `ikaro-trial`, `api`, `admin`, `www`, …) plus platform words (including `ikaro` and the owner slug), not changeable in v1 (extends the existing `Slug` VO, which today only checks the regex); **trial limit per Google account (below)**; Turnstile + per-IP rate limit; chatbot at tier `BASIC`.
- **Trial limit.** A Google account may own several tenants. Its **first** self-signup tenant gets a free trial. A **further** self-signup gets a trial only while every earlier self-signup tenant of that Google `sub` has `has_ever_paid = true`; otherwise signup is refused with `SIGNUP_TRIAL_NOT_AVAILABLE` ("conclua o pagamento do seu teste atual"). Paying owners can add tenants freely; letting a trial lapse and signing up again is blocked until that tenant is paid or purged. The check reads `billing.signup_registrations (google_sub, tenant_id)`; Gmail aliases and several Google accounts are accepted residual abuse, mitigated by Turnstile and the IP rate limit.
- Acceptance of Terms/Privacy (version + timestamp) is stored on the tenant's billing account.

## 7. Roles and visibility

Operator = Ikaro staff acting through scripts/internal endpoints (no backoffice screen in v1), used only for the price list, grace, suspension and the `exempt` switch (R12). There is no operator payment override or reactivation: provider-confirmed payment is the only way to restore access. Plan changes are done by the manager (R11), and there is no per-tenant price negotiation. Every operator action is audited (who, when, why). Every MANAGER of a tenant sees its billing page; billing emails go to the billing email, falling back to the managers' emails. Alerts to Ikaro (failed webhooks, reconcile drift, daily overdue/suspended list) are emails to the manager of Ikaro's own tenant.

## 8. Non-Goals / explicitly deferred

Annual billing and proration · coupons / free months · in-app payment-method forms · refund screens (provider console) · NFS-e issuing · FX conversion · currency or country change after start · operator backoffice screen · trial-extension action · additional limits beyond the chatbot tier (staff count, resources, services, lead submissions) · plan bundles / templates · usage-based pricing · replaying events produced during a suspension.

## 9. Standing "known good" integrations and reuse

Hotsite publish state already exists (`hotsite_configs.is_published`, `<Unavailable />`, `manifest.isPublished` checked by the booking page, `FrontendRevalidationPort` for on-demand revalidation): suspension is a new *reason* for the existing state, not a new mechanism. `<Unavailable />` itself needs a change: it renders no `HotsiteAuthBar` today. Turnstile verification and the lead-form public-write pattern are reused. Chatbot per-tenant caps and `llmProvider`/`llmModel` overrides already exist in `settings.chatbot` (dev-only today); the chatbot tier becomes their official source.

## 10. Historical questions & decisions (dated 2026-10-26)

1. *Scope:* flexible per-tenant pricing, feature entitlements, payments, restricted login. → Confirmed; research on how SaaS do it done first.
2. *Is entitlement the same as the hotsite `enabled` flag?* → No. Hotsite `enabled` is the manager's preference; entitlement is Ikaro's permission. Both must pass (R2).
3. *Self-signup?* → First "script for now", then **self-serve from day zero**. Final: in scope, 14-day trial, no card, all features.
4. *Provider:* Stripe vs Asaas vs Appmax. → Asaas first, Stripe later, port-based (§3). No Stripe account exists.
5. *Collection model:* processor-hosted payment links first vs automatic authorization later. → Provider owns the money (R1); there is no manual adapter or Ikaro-side payment override. The generic provider port already models recurring collection, but automatic authorization is released only after real Asaas end-to-end verification.
6. *Access ladder:* → `TRIAL → ACTIVE → PAST_DUE (14 days) → SUSPENDED`; the proposed `RESTRICTED` step was merged into `SUSPENDED`.
7. *Suspension behavior:* manager billing-only; staff blocked; customers see badge, history ok, no open-booking detail, no new bookings; hotsite unpublished with topbar login; no notifications/loyalty emails; crons unchanged.
8. *Loyalty expiry across suspension:* points expire on schedule (no special handling).
9. *Context:* new `Billing` context + shared `TenantAccessPort`; the Platform-projection idea was rejected as extra machinery.
10. *Events:* trimmed from 10 to 5 email-triggering + `TenantPurgeRequested`. *(Superseded 2026-10-27: §5 lists the current set — the five plus `SubscriptionPriceChangeAnnounced` and the purge command/completion events.)*
11. *Price list:* `FeaturePrice` by feature × country (then × tier × cycle); no fallback; BR and US only.
12. *Fiscal:* nothing mandatory for the tenant; optional billing identity; nota fiscal outside the product.
13. *Plan timing (superseded):* the earlier mixed model (mid-cycle add now, removal later) is superseded by decision 30: every plan change is next paid service period only.
14. *Cancel:* `ACTIVE` cancels at the end of its paid period and cancels every future-period unpaid invoice immediately; `PAST_DUE` and `TRIALING` cancel immediately. No refund; one `SUSPENDED` status with a reason; reactivation requires provider-confirmed payment; no charges while suspended.
15. *Clean-up:* 90 days if the subscription never paid, 180 days if it paid at least once (any suspension reason; see decision 45), with 30 and 7-day warnings; billing history retained.
16. *Refunds/chargebacks:* provider console; Ikaro records `REFUNDED`/`CHARGEBACK`. A full confirmed reversal that leaves the current period unpaid suspends immediately with `PAYMENT_REVERSED`; partial refunds and opened disputes do not change access.
17. *Limits:* chatbot tier (model + caps) is the only v1 limit; annual billing deferred with a `cycle` column; no coupons; no trial extension.
18. *Signup details:* module `TRIAL_SIGNUP_CTA` (CTA only) on Ikaro's tenant, `/ikaro-trial` page, Google first, Terms checkbox, one trial per Google account, slug rules.
19. *Existing tenants:* none real; staging tenants are migrated by script as `ACTIVE` with `exempt = true`.
20. *Billing visibility:* all managers.
21. *Route name:* the signup page is `/ikaro-trial` (not `/testar`); the reserved-slug list comes from the real top-level routes.
22. *UI pattern:* billing is one page with tabs (Resumo, Plano, Cobranças, Dados de cobrança, Cobrança automática) and a single primary action per tab, like the service editor; destructive actions are a separate confirmation page.
23. *Enforcement design:* declarative (decorators + one guard + dispatcher/cron/notification choke points), a CI detector for completeness, and one kill switch (§5.1) — accepted so no feature flags are scattered through the code.
24. *Stripe:* the adapter is in scope of the milestone sequence; US signup is gated by `FEATURE_FLAG_SIGNUP_US` until it is live.
25. *Access staleness:* a transient access lookup failure fails open under a short cache TTL; a missing subscription is a provisioning/data-integrity incident and access is denied with an urgent alert.
27. *Self-service plan changes (superseded):* the earlier "add now, bill later, first-billed lock" model is superseded by decision 30.
28. *No per-tenant prices:* prices come only from the list by country/tier/cycle; no operator negotiation or overrides; charge lines snapshot the version selected by the service-period start; an increase applies from its announced effective service-period start; free access = `exempt`; annual/semester contracts are deferred.
29. *Price changes:* only the operator, through one dated, announced endpoint; managers of every affected tenant get an email (`SubscriptionPriceChangeAnnounced`, one event per tenant); increases need minimum notice; prices live in dated versions.
26. *Suspended tenants stay visible in the staff tenant selection;* staff who select one see the suspended notice. (A customer selector does not exist in the code today.)
30. *Final plan timing:* additions, removals, upgrades and downgrades all become effective at the next paid service-period start. Trial access always stays fully enabled; the Plan tab chooses the first paid selection. No proration or entitlement before payment; `PAST_DUE` and `SUSPENDED` are read-only.
31. *Price activation:* `effective_from` selects the price by service-period start, never invoice issue date. An increase requires at least `PRICE_CHANGE_MIN_NOTICE_DAYS + CHARGE_ISSUE_LEAD_DAYS` notice (defaults 30 + 10); scheduling writes one email/outbox event per affected tenant.
32. *Payment and overdue ownership (revised by decision 56):* the adapter normalizes the provider's paid signal per payment method into one `PaymentConfirmed` that restores access; settlement/balance availability is informational. Ikaro's due-date sweep moves a locally due charge to `OVERDUE`/`PAST_DUE` and begins the 14-day grace; provider events reconcile it.
33. *Purge coordination:* suspension age selects eligibility, but a durable `TenantPurgeJob` coordinates idempotent deletion in every bounded context; Platform deletes the tenant root only after every completion is recorded.
34. *Signup handoff:* provisioning does not issue a tenant JWT. It ends on an account-created/check-email page; the existing first-manager invitation/login email is the asynchronous dashboard handoff. The trial limit is decision 44.
35. *Feature root:* Hotsite is mandatory for Booking in v1. A booking-only tenant is unsupported; this preserves one public-entry model and the dependency graph `HOTSITE ← BOOKING`.
36. *Merchant of record:* each selling company is configured as the legal/business entity in its payment-provider account (Asaas for BRL, Stripe for USD). Ikaro does not duplicate KYC or legal-entity data; it keeps an immutable merchant-profile key on the subscription and each charge, resolving that key to provider-account configuration held operationally/secrets-side.
37. *US tax (reworded by decision 63):* Stripe Tax, used through invoice `automatic_tax`, is the calculation/collection layer. It does not make Stripe merchant of record: Ikaro's US selling company remains responsible for registrations and filings; the accountant/provider setup is a launch gate.
38. *Tax presentation:* BR catalog prices are tax-inclusive. US catalog prices are net; Stripe computes tax when it finalizes the invoice (decision 62), the amount is shown as a separate line and snapshot once with the charge. The final US total is `feature subtotal + tax`.
39. *US billing location (revised by decision 62):* a US manager must provide the **full billing address** (street, city, state, ZIP) before saving the first paid-plan selection. Stripe needs at least a 5-digit ZIP and discourages ZIP-only in many states, so the full address is required; Ikaro never falls back to issuing an untaxed USD charge when the location is invalid.
40. *Commercial catalog:* tier names, AI models, caps, country availability and real BRL/USD amounts are a dedicated prerequisite story in the billing milestone. It seeds the approved `FeaturePrice`/version catalog and validates the offered Chatbot tiers before any signup or charge-issuing path is activated; the illustrative discovery prices never become production defaults.
41. *Universal price timing:* every price change, increase or decrease, applies only from an explicitly scheduled next paid service-period start. Increases require the settled 40-day minimum notice; decreases do not, but never rewrite an already-issued invoice or current contract period.
42. *Trial end:* an unpaid first invoice, or no charge issuable, suspends the subscription directly at trial end (`SUSPENDED`/`NON_PAYMENT`); there is no `PAST_DUE` grace after a trial.
43. *Default first paid selection:* every trial feature continues (chatbot `BASIC`) unless the manager changes it on the Plano tab; the first invoice is issued from it 10 days before trial end.
44. *Trial limit:* a Google account may own many tenants; its first self-signup gets a trial, a further one only while all earlier self-signup tenants have paid at least once (`signup_registrations`, error `SIGNUP_TRIAL_NOT_AVAILABLE`).
45. *Purge delay:* `has_ever_paid` alone selects 90 (never paid) or 180 (paid before) days, whatever the suspension reason.
46. *Reactivation:* the old open charge is cancelled, never re-dated; one recovery charge is issued with its amount fixed at issue; the period (and `anchor_day`, clamped to 28) is set when it is paid.
47. *Timezone:* `billing.subscriptions.timezone` is copied from `TenantProvisioned` at creation and is immutable; period boundaries are local midnight in it; Billing never reads Platform settings.
48. *Signup language:* no language field; language derives from the country, as in provisioning and settings today.
49. *Unavailable page:* the team/customer login bar is shown for every unpublished hotsite, keeping the page reason-neutral.
50. *Exempt switch (R12):* audited operator endpoint plus an optional provisioning flag; reversible except for Ikaro's own tenant; clearing it starts a first-paid-selection window like a trial.
51. *US before Stripe:* a non-exempt US tenant is rejected by every provisioning path while `FEATURE_FLAG_SIGNUP_US` is off.
52. *Event gate:* opt-in (`skipWhenSuspended`) for outbound handlers only; audit, state-sync and Billing handlers always run.
53. *Crons:* Cloud Scheduler → Pub/Sub trigger → `ITriggerBus` handler, like the existing cron jobs; HTTP `/cron/*` is the manual path only.
54. *Deferred access:* new features start at the next paid period and every locked or Plano screen says the start date.
55. *Hotsite mandatory:* `HOTSITE` is the root of every feature and cannot be removed; no booking-only tenant.
56. *Paid signal per method (verified):* Asaas Pix emits only `PAYMENT_RECEIVED`; boleto `CONFIRMED` → `RECEIVED`; card `CONFIRMED` then `RECEIVED` about 32 days later. The adapter treats the first of `CONFIRMED`/`RECEIVED` for a charge as the single paid signal (idempotent).
57. *BR tax ID at signup:* the signup form asks BR businesses for CPF or CNPJ (check digits validated), stored on the billing account, because Asaas requires `cpfCnpj` to create a customer. R5 is amended: required to charge, never to use the product. US collects the full address in the dashboard instead.
58. *Auto-billing:* v1 offers **Pix Automático only** (hosted authorization, PJ account with a CNPJ active 6+ months). Card auto-billing is dropped: Asaas tokenization passes card data through the caller's server, contradicting R1. Tenants still pay any charge by card on the hosted page every month.
59. *Billing emails:* Ikaro sends every billing email itself (all six events). Asaas customers are created with `notificationDisabled = true` (Asaas bills a fee per notification) and Stripe customer emails are switched off in the Dashboard.
60. *Entities:* Asaas = Ikaro as PJ with a CNPJ active 6+ months. Stripe = the same Brazilian CNPJ, cards only, BRL payouts; a US entity (Atlas) is a later option only if ACH or USD payouts are needed.
61. *Webhook contract:* the Asaas webhook returns exactly HTTP `200` after commit (201/204/3xx count as failures; the queue pauses after 15 consecutive failures); authenticity is the `asaas-access-token` (no IP allowlist); the Stripe webhook verifies `Stripe-Signature` on the raw body, tolerates out-of-order and duplicate events and re-reads the invoice before applying.
62. *Tax in the provider call:* `TaxCalculationPort` is removed. Stripe computes tax when it finalizes the invoice, so `createCharge` returns the tax breakdown; for a tax-exclusive charge Billing writes `tax_amount_minor`, `amount_minor` and the tax lines once, with `provider_creation_status = READY`, and emails the manager only afterwards. Provider object: Stripe Invoices (`send_invoice`, hosted URL), never Subscriptions/Billing.
63. *US tax at launch:* the code is tax-ready (invoice `automatic_tax`, SaaS tax code `txcd_10103001`). Stripe returns zero tax until a registration is added in the Dashboard; whether and when Ikaro registers is the accountant's call (launch gate). Stripe Tax pricing is 0.5% per transaction where registered.
64. *Recovery-charge due date:* `RECOVERY_CHARGE_DUE_DAYS` (default 7) after issue; an unpaid recovery charge simply becomes `OVERDUE` (the tenant is already suspended) and its provider link keeps working as long as the provider allows it (Asaas Pix: 12 months after due; boleto after due is a launch gate).

## 11. Open threads

- **Provider and account launch gates:** the full list (Asaas, Stripe, accountant, owner) with how to open each account is `tenant-billing_PROVIDERS.md` §4–§5. None blocks promotion; each blocks activation of its provider.
- `CountrySpec` has an address spec but no tax-ID spec: add one (BR: CNPJ/CPF check digits; US: none) alongside the existing `AddressSpec`, reusing the shared `Address` VO and `useAddressLookup` (ViaCEP) for Brazil.
- Existing auth error reason `tenant-deactivated` (`journeys/staff/prototypes/login/01d-error-tenant-deactivated.html`): suspension must **not** reuse it (login is never blocked); decide whether it stays for true deactivation (`is_active=false`).
- `<Unavailable />` does not render the top bar today (verified); adding it is part of the suspension story (decision 49).
- Commercial-catalog story: approve Chatbot tier names, models/caps, country availability and real prices (US prices absorb Stripe's card cost, about 6%+ until confirmed), then seed the catalog before billing/signup activation.
- Design of the short-lived signup session between Google sign-in and provisioning (cookie vs token) — decide in story discovery, reusing the staff selection-token pattern where possible.
- Enforcement checklist per feature (public chatbot endpoint, recurring renewal reminders cron, availability-alert creation, lead-form endpoint, loyalty write paths).
- Legal texts for Termos de Uso and Política de Privacidade (owner to provide).

## 12. Canonical docs this will touch on promotion

`DOMAIN_MODEL`, `BOUNDED_CONTEXTS` (7th context), `USE_CASES` UC-024 (its step 9 says the invitation is sent "in pt-BR" — stale: it uses the tenant locale — and it needs the `exempt` flag), `DOMAIN_EVENTS` (`TenantProvisioned` v2), `ENGINEERING_RULES_BACKEND` (`subscribe()` options, `ITriggerBus` billing jobs), `scripts/provision-tenant.sh`, `packages/types` error codes, `DATABASE_SCHEMA` (schema `billing`, `feature_prices` tenant-id exemption), `USE_CASES`, `API_CONTRACTS`, `DOMAIN_EVENTS`, `TENANTS_SETTINGS_SCHEMA` (chatbot tier source), `HOTSITE_DYNAMIC_ARCHITECTURE` (§3, §4, §7 for `TRIAL_SIGNUP_CTA`; unpublished state), `ERROR_CATALOG` + both locale `errors.json`, `ENGINEERING_RULES_BACKEND` (webhook, cron, access port), `LOCK_CATALOG` (subscription row lock), `RUNBOOKS` (billing incident), `TECH_STACK_DECISIONS` (provider choice), Terraform scheduler/secrets, `CLAUDE.md` §3 and §11 (context and slice lists).

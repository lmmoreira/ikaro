# Discovery: Tenant Billing — Promotion Sketch (suggested milestone and story order)

**Status:** Discovery — a rough, non-binding sketch to give `/discovery-to-milestone` a starting point. Story names are placeholders, sizes are not estimated, and `/discovery-to-milestone` re-derives the real sequence (it also decides how many milestones). CAND numbers refer to `tenant-billing_USECASES.md`. `GATE` = needs something outside the code, see `tenant-billing_PROVIDERS.md` §5.

## Ordering principles

1. **Nothing changes for any tenant until enforcement ships**, and enforcement ships only after the access port, the trial/backfill rows and the kill switch exist (so a release can never lock anyone out).
2. **Backend/BFF before frontend**, per the repo rule; each frontend story sits after the endpoint it needs.
3. **The money loop (issue → pay → webhook → status) is one small vertical** built first against a **`FakeBillingProvider`** (every environment can run it with no account), with a thin Asaas sandbox spike right after milestone A to confirm the port shape. The real Asaas adapter is built late, against the same contract tests (`tenant-billing.md` §5.3).
4. **Each provider and each optional slice is independently releasable and flag-gated** (`FEATURE_FLAG_BILLING_ENFORCEMENT`, `FEATURE_FLAG_SIGNUP_US`, Pix Automático gate).
5. **Purge ships last**: the first possible erasure is 90 days after the first suspension, so it can follow launch by weeks.

## Milestone A — Billing foundation (no tenant-visible change)

| # | Story | CAND | Notes |
|---|---|---|---|
| A0 | Commercial catalog decisions (prices BRL/USD, chatbot tiers/models/caps, country availability) | 07 | **GATE (owner)**; a document + seed spec, no code risk, but it blocks A1's seed |
| A1 | `billing` schema, 7th context, `FeatureKey`, `FeaturePrice` + versions, seed, docs/`architecture-policy` entries | 07 | Pure expand; `closed-enum-registry` and detector wiring |
| A2 | `Subscription`/items/`BillingAccount` aggregates; `TenantProvisioned` v2 (+`countryCode`, hint); trial creation handler; backfill of existing tenants as `exempt` | 01, 21 | Rolling-deploy safe (v1 events retried) |
| A3 | Operator `exempt` endpoint + provisioning flag + audit; US-before-Stripe rejection | 32 | Also unblocks your own test tenants early |
| A4 | `TenantAccessPort` + caching adapter + access endpoints (`/v1/billing/access`, internal) + kill switch | 15 | Read-only; nothing calls it yet |
| A5 | `IClock` port + system clock, adopted by Billing; dev-only `POST /internal/dev/clock/advance` + script; `APP_ENV` guards for dev endpoints | 33 | Every later date rule depends on it, so it lands early |
| A6 | Provider port + `FakeBillingProvider` + shared contract suite skeleton + `simulate` endpoint; environment-based `merchant_profile_key` assignment and the live-adapter startup guard | 33 | The port shape comes from the verified facts in `tenant-billing_PROVIDERS.md` |
| A7 | **Asaas sandbox spike** (about a day): create customer and charge, pay it with the sandbox confirm call, receive the webhook; adjust the port if anything differs | 09 | **GATE (Asaas sandbox account)**; a spike, not the adapter |

## Milestone B — Enforcement (behind `FEATURE_FLAG_BILLING_ENFORCEMENT`)

| # | Story | CAND | Notes |
|---|---|---|---|
| B1 | Declarative gating: `@RequiresFeature`, `@SuspensionAccess`, `@NoFeatureGate`, global `TenantAccessGuard` (backend + BFF), `architecture-check` completeness detector, annotate every existing route | 16, 20 | Largest mechanical story; split by context if needed |
| B2 | Event dispatcher opt-in gate (`skipWhenSuspended`), tenant-scoped cron helper, notification send gate + `SKIPPED_TENANT_SUSPENDED` | 18, 20 | Touches the shared event bus; careful review |
| B3 | Hotsite effective-published (manifest, booking page, sitemap, robots), `Unavailable` + login bar, revalidation on suspend/reactivate | 17 | Includes the customer-safe `tenantOperational` flag |
| B4 | Suspended experience: staff notice, customer "Empresa inativa" (cancel allowed, open detail/new booking/loyalty blocked), `staff-tenants.operational` | 16 | Booking/Loyalty record-level policy lives in those contexts |
| B5 | Web enforcement: route-to-feature registry, locked UI/`FeatureGate`, `proxy.ts`/layout redirects | 20 | After B1 and the access endpoint |

## Milestone C — Manager billing and Asaas collection (BR)

| # | Story | CAND | Notes |
|---|---|---|---|
| C1 | Webhook route(s) + `provider_events` idempotency inbox + normalizer + exact-`200` contract, running on the fake provider | 09 | Same code path the real adapters use |
| C2 | `Charge`/lines, charge-issuing trigger job, recovery-charge issuing, retry of provider creation | 08, 29 | `ITriggerBus` pattern |
| C3 | Status sweep (due-date overdue, trial end → `SUSPENDED`, `PAST_DUE` → `SUSPENDED`, cancel-at) + reconcile + provider-events purge | 10, 11 | Tenant-timezone logic |
| C4 | Billing emails (templates pt-BR/en + backfill, six handlers, no provider emails) | 19 | Exempt from the suspension gate |
| C5 | Billing page read API + Resumo/Cobranças tabs, pay-now link, banners (trial/past-due), "Assinatura" nav | 12, 14, 25 | First manager-visible billing UI |
| C6 | Billing identity (`CountrySpec` tax-ID entry, BR CPF/CNPJ VO, address, tab) | 13 | BR tax ID already collected at signup (D3) |
| C7 | Plano tab: preview/save, next-period items, re-issue unpaid invoice | 31 | Dependency-graph validation in the aggregate |
| C8 | Cancel and reactivate (confirm page, scheduled cancel, recovery flow UI) | 28, 29 | |
| C9 | Operator price-change endpoint + manager announcement + Plano/Resumo notice | 07, 19 | Can slip past launch if prices are static at first |
| C10 | Ops digest, alerts, `RUNBOOKS` section | — | Needed before real money |
| C11 | Seed script (one tenant per billing state), staging `EMAIL_RECIPIENT_ALLOWLIST` + `SKIPPED_NOT_ALLOWLISTED`, nightly sandbox contract-test job | 33 | Makes staging fully testable |
| C12 | **Real `AsaasBillingProvider`** (customer with `cpfCnpj` and `notificationDisabled`, charge `UNDEFINED`, cancel, link) passing the contract suite on the sandbox, then production | 08, 09 | **GATE (Asaas production account, launch gates in PROVIDERS §5)**; last story before launch |

## Milestone D — Self-signup and trial (BR)

| # | Story | CAND | Notes |
|---|---|---|---|
| D1 | `Slug` VO rules + reserved list from real routes + slug-availability endpoint | 23 | |
| D2 | Hotsite module `TRIAL_SIGNUP_CTA` (contract, component, editor panel, owner-slug restriction) | 26 | |
| D3 | Signup session (Google), signup endpoint, Turnstile, rate limits, `signup_registrations`, trial rule, BR tax ID, terms | 22 | Session mechanism decided in story discovery |
| D4 | `/ikaro-trial` pages (details + prices, form, account-created), public prices endpoint | 22, 23 | Marketing styling decision |
| D5 | First-run onboarding checklist | 24 | Optional polish |

## Later slices (each independent)

| Slice | Stories | Gate |
|---|---|---|
| **E — US / Stripe** | E1 `StripeBillingProvider` (invoices, webhook, tax breakdown in the provider call); E2 US identity (full address) + plan-save guard; E3 US price rows, `FEATURE_FLAG_SIGNUP_US`, enable signup | **GATE:** Stripe account checks and the accountant's US tax decision |
| **F — Pix Automático** | F1 authorization flow, tab, webhooks, `MANUAL` charge creation referencing it | **GATE:** real Asaas PJ account verification |
| **G — Tenant purge** | G1..G7 one deletion story per context + storage/provider; G8 purge coordinator, warnings, trigger job | After launch; enable the cron only when all participants exist |

## Suggested critical path to a first BR launch

`A0 → A1 → A2 → A3 → A4 → A5 → A6 → A7` then `(B1 → B2 → B3 → B4 → B5)` in parallel with `(C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C10 → C11)`, then `D1 → D2 → D3 → D4`, and `C12` (real Asaas) last before launch. The whole flow is testable on the fake from C1 onward; enforcement (B) can be merged dark and switched on once C1–C5 work end to end on staging.

## Open the accounts now

- **Asaas sandbox now** (free, auto-approved) for the A7 spike; **Asaas production** is only needed for C12, but request PJ approval early because KYC time is unknown.
- **Stripe** is not needed until slice E; opening the BR account early only lets you ask support the §5 questions. E1 follows the same fake-first pattern (the fake already covers USD).
- **Accountant** questions in `tenant-billing_PROVIDERS.md` §5 gate E and the nota fiscal answer; start them in parallel with A.

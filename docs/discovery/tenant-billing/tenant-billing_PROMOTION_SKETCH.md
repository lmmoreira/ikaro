# Discovery: Tenant Billing — Promotion Sketch (suggested milestones and story order)

**Status:** Discovery — a rough, non-binding sketch to give `/discovery-to-milestone` a starting point. Revised in the 2026-10-27 second review: the work is split into **two milestones plus later slices** (it was one with about 45 stories; milestones 2 and 3 were merged on 2026-10-28 into one "collection, self-signup and launch" milestone, third review), the Asaas spike moved first, the tax-ID value object moved into the foundation, gating rollout made safe for in-flight branches, and the operator-free work (`tenant-billing_OPERATIONS.md`) became explicit stories. Story names are placeholders and sizes are not estimated (about 40 stories to the first BR launch: 17 in milestone 1 and 23–24 in milestone 2, plus about 26 in the later slices); the promotion skill decides the final split and may break C3, C10 and B1a–d further, and canonical-docs promotion (`DOMAIN_MODEL`, `USE_CASES`, `API_CONTRACTS`, …, main doc §12) is its Phase A, not a story here; `/discovery-to-milestone` re-derives the real sequence. CAND numbers refer to `tenant-billing_USECASES.md`. `GATE` = needs something outside the code, see `tenant-billing_PROVIDERS.md` §5.

## Ordering principles

1. **Nothing changes for any tenant until enforcement is switched on**, and it is switched on only after the access port, the trial/backfill rows and the kill switch exist, so a release can never lock anyone out.
2. **Backend/BFF before frontend**; each frontend story sits after the endpoint it needs.
3. **Verify the provider before designing the port.** The Asaas sandbox spike is the first story, and the Asaas production account (KYC lead time unknown) is requested today.
4. **The money loop (issue → pay → webhook → status) is built against the `FakeBillingProvider`** so every environment runs it with no account; the real Asaas adapter is built late against the same contract suite (`tenant-billing.md` §5.3).
5. **Operator-free by default (R13).** Self-heal, reminders, provider health, exception-only alerts and runbooks are stories of milestone 2 (before launch), not post-launch polish: no real money flows until they exist.
6. **Each provider and optional slice is independently releasable and flag-gated** (`FEATURE_FLAG_BILLING_ENFORCEMENT`, `FEATURE_FLAG_SIGNUP_US`, Pix Automático gate).
7. **Purge ships last**: the first possible erasure is 90 days after the first suspension.
8. **First schema is BR-only** (decision 99); US tax columns and tables arrive with slice E.

## Milestone 1 — Foundation and dark enforcement (no tenant-visible change)

| # | Story | CAND | Notes |
|---|---|---|---|
| A0 | **Asaas sandbox spike** (about a day): customer with `cpfCnpj`, charge `UNDEFINED`, pay with the sandbox confirm call, receive the webhook, check re-read by id, webhook re-enable through the API, cancel of a paid charge; **plus the F2 checks** (PROVIDERS §5 Asaas 8–10): hosted recurring checkout with a future `nextDueDate`, card typed only on Asaas's page, subscription value `PUT`, refused-attempt behaviour, `billingType` after the payer picks a method | 09, 38 | **GATE (Asaas sandbox account)**; produces the verified facts the port is built from; its F2 answers decide whether slice F2 stays |
| A1 | Commercial catalog: BR list is decided (BOOKING R$ 109, decision 80); settle the Kimi model id and Plus caps, define tiers by caps not model name, validate OpenRouter settings for Kimi; US list stays staging-only | 07 | Small; only the Plus model/caps block the production seed |
| A2 | `billing` schema (`btree_gist`), 7th context, five-member `FeatureKey`, `FeaturePrice` + versions, seed, `provider_health`, **CPF/CNPJ value object and `CountrySpec` tax-ID entry**, **error-code plumbing for the two new origins (`BillingErrorCode`, `SignupErrorCode`: `error-codes.ts`, `AnyErrorCode`, the `CATALOGS` list in the web exhaustiveness spec, both `errors.json`, `ERROR_CATALOG.md`, `BffThrowableCode`)**, docs and `architecture-policy` entries | 07 | Pure expand; closed-enum detector wiring. Moved here from the identity story because A3 needs it |
| A3 | `Subscription`/items/`BillingAccount` aggregates (entitlement formula, no trial rows, `plan_confirmed_at`, `next_due_date` lifecycle); `TenantProvisioned` additive fields (`countryCode`, `exempt`, `registrationId`); trial handler tolerant of legacy payloads; `signup_registrations` with `POST /internal/billing/registrations` (self-signup and script); read-only tenant-info port for self-heal/backfill; environment-based `merchant_profile_key`; backfill as `exempt`; `taxId` required for non-exempt BR in `POST /internal/tenants` **and `scripts/provision-tenant.sh` updated (`--exempt`, tax id, registration call)** | 01, 21 | The bus does not version-route (verified): publisher, handler and registration endpoint ship in one release; legacy outbox rows are repaired by self-heal |
| A4 | `TenantAccessPort` + caching adapter (asymmetric TTL, explicit invalidation, provisioning window) + access endpoints + kill switch | 15 | Read-only; nothing calls it yet |
| A5 | `IClock` port + system clock; dev-only clock advance endpoint and script; `APP_ENV` guards | 33 | Every later date rule depends on it |
| A6 | Provider port (from A0's facts) + `FakeBillingProvider` + contract suite skeleton; live-adapter startup guard; fake/sandbox key rule | 33 | |
| A7 | Operator edge cases: `exempt` set/clear, `suspend`/`unsuspend` (reason `OPERATOR`), `grace`, read-only tenant list, audit; US-before-Stripe rejection | 32, 06 | Exactly the mapped operator touchpoints, nothing more |
| B1 | Gating framework: `@RequiresFeature`, `@SuspensionAccess`, `@NoFeatureGate`, global `TenantAccessGuard` (backend + BFF), completeness detector **in warn mode** | 16, 20 | Does not break open branches (decision 94) |
| B1a–B1d *(sizes unknown: count the routes with the detector in warn mode first, then split further if needed)* | Annotate every existing route, one story per context group (Platform, Booking, Loyalty/Customer/Staff, Notification); then **flip the detector to enforcing** | 20 | Schedule when no other large milestone is mid-flight |
| B2 | Event dispatcher opt-in gate + explicit-declaration detector (the `subscribe` 4th argument also teaches `pubsub-catalog.ts` the new call shape), **new** shared tenant-scoped cron helper extracted from Booking's `WindowedTenantJob` (`includeSuspended`), notification send gate placed before dispatch + `SKIPPED_TENANT_SUSPENDED` (widen `notification_logs.status`, replace the CHECK; gate the parallel availability-alert email path too) | 18, 20 | Touches the shared event bus; careful review |
| B3 | Hotsite effective-published (manifest, booking page, sitemap, robots, `published-hotsites` operational filter), module filtering by entitlement, `Unavailable` + login bar, revalidation via `IFrontendRevalidationPort.revalidate(slug)` on suspend/reactivate (`[slug]/login` and `[slug]/my-account` stay reachable by design) | 17 | Includes the customer-safe `tenantOperational` flag |
| B4 | Suspended experience: staff notice, customer "Empresa inativa", `staff-tenants.operational` (the list has no status field today), both tenant-switch endpoints accept a suspended tenant; settle O-B1 (customer notice) and O-L1 (loyalty expiry pause) | 16 | Record-level policy lives in Booking/Loyalty |
| B5 | Web enforcement: route-to-feature registry, locked UI/`FeatureGate`, `proxy.ts`/layout redirects | 20 | After B1 and A4 |

Enforcement can be merged dark and stays off until milestone 2's launch story (L1).

## Milestone 2 — BR collection, self-signup and launch (no real money until C16 and L1)

| # | Story | CAND | Notes |
|---|---|---|---|
| C1 | Infra first: Terraform for the scheduler jobs (issue, hourly sweep, reminders, reconcile, self-heal, provider-events purge) **and their Pub/Sub topics/subscriptions via the regenerated `pubsub-catalog.json`**, sandbox secrets, env vars and flags (all new: `FEATURE_FLAG_*`, `PLATFORM_OWNER_TENANT_SLUG`, `EMAIL_RECIPIENT_ALLOWLIST` through `env.validation.ts` and the env contract) | — | Staging cannot run any cron without it; live check per CLAUDE.md §9 |
| C2 | Webhook route(s) + `provider_events` inbox + normalizer + exact-`200` contract + re-read/amount verification, on the fake; the fake's `simulate` endpoint | 09, 33 | Same code path the real adapter uses |
| C3 *(split at promotion: C3a charge + lines + issuing job, C3b recovery charge + creation retry + identity hold)* | `Charge`/lines, charge-issuing job (first invoice only after `plan_confirmed_at` or the 3-day fallback; `next_due_date` advanced in the insert transaction), recovery-charge issuing, creation retry, identity-hold auto-resume | 08, 29 | `ITriggerBus` pattern |
| C4 | Hourly status sweep (due date, trial end with the method-aware settlement margin, `PAST_DUE` → `SUSPENDED`, cancel-at) honouring the suspension freeze | 10 | Tenant-timezone logic; business-day calendar for the 3-day margin |
| C5 | Reconcile (daily, hourly at-risk, on-demand single charge), `provider_health`, **self-heal job** (provisioning repair, provider health, suspension freeze), provider-events purge | 11, 35 | The operator-free core |
| C6 | Billing emails: platform-level templates (per template: enum key, mapping entry, both `notifications.json`, NULL-tenant migration rows; new global-template lookup), handlers for all events, `BillingReminderDue` job with the dunning cadence incl. `PLAN_CONFIRMATION` | 19, 34 | Exempt from the suspension gate |
| C7 | Billing page read API + Resumo/Cobranças tabs, pay-now link, receipts, `payment-return`, banners, "Assinatura" nav, **`POST /plan/confirm` + the "Confirmar plano" trial banner (moved here from C10 so the issue job in C3 has its real trigger)** | 12, 14, 25 | First manager-visible billing UI |
| C8 | Billing identity tab (value object already exists from A2) | 13 | |
| C9 | Platform: chatbot tier → model/caps mapping; remove the manual settings override | — | Must precede the Plano tab |
| C10 | Plano tab: preview/save, next-period items, re-issue unpaid invoice, **BOOKING removal guard + `bookableUntil` cap** (Booking): three new repository queries (bookings ending on/after, schedules by `endsOn`, tenant-wide active alerts), a cross-context port + `architecture-policy` edge, and the cap honoured by every window consumer (booking/staff/reschedule, recurring helpers, alert `selectableDays`, manifest) | 31 | Dependency-graph validation in the aggregate; split into C10a (Plano + confirm) and C10b (Booking guard + cap) |
| C11 | Cancel and reactivate (confirm page, scheduled cancel, trial-with-paid-invoice rule, recovery flow UI) | 28, 29 | |
| C12 | Operator **percentage-adjust endpoint** (`/feature-prices/adjust`, dry run + preview hash, `batch_id`, whole-unit rounding, one consolidated `SubscriptionPriceChangeAnnounced` per tenant) plus the single exact-price endpoint; manager announcement + Plano/Resumo notice | 07, 19 | May follow launch if prices are static at first |
| C13 | **Operations package**: exception-only alert policies and dashboard (OPERATIONS §5–6), RUNBOOKS Billing section, UC-024 documented as the exception path, weekly KPI numbers, customer help/FAQ text | — | Required before real money (R13) |
| C14 | Seed script (one tenant per billing state), staging `EMAIL_RECIPIENT_ALLOWLIST` + `SKIPPED_NOT_ALLOWLISTED` | 33 | |
| C15 | E2E: money loop on the fake and the suspended experience per role | — | Playwright helpers per `TESTING_STRATEGY` |
| C16 | **Real `AsaasBillingProvider`** passing the contract suite on the sandbox, nightly sandbox contract job, automatic NFS-e emission configured, webhook re-enable verified | 08, 09 | **GATE (Asaas production account, PROVIDERS §5, nota fiscal)** |

| D1 | `Slug` VO rules + reserved/impersonation list from real routes + slug-availability endpoint | 23 | No dependencies; may start early |
| D2 | Hotsite module `TRIAL_SIGNUP_CTA` (contract, component, editor panel, owner-slug restriction) | 26 | |
| D3 | Signup session (Google; built on `JwtService`/`OAuthStateService`), registration via `POST /internal/billing/registrations` under the advisory lock, signup use case in Platform (Turnstile port reuse, new `SIGNUP_TURNSTILE_FAILED`), BFF throttle tier, resend endpoint, trial rule, BR tax ID, terms; reserved-slug shared constant + guard test | 22 | |
| D4 | `/ikaro-trial` pages (details + prices, form, account-created with resend and one-click sign-in), public prices endpoint | 22, 23 | Owner-tenant branding via rewrite (decision 71) |
| D5 | Hosting of the Terms and Privacy pages (owner-supplied texts) | 22 | Linked from the signup checkbox |
| D6 | First-run onboarding checklist | 24 | Optional |
| D7 | **Manual offboarding runbook for never-paid tenants** (minimal slice of `plan/M17` S51: operator-triggered erase of a stuck trial tenant, OPERATIONS O13) so the signup dead end has an answer at launch, before the automated discard (G12) exists | 36 (interim) | Without it a mistyped slug has no fix at launch |
| L1 | **Launch readiness**: production config and secrets, dedicated non-exempt smoke-test tenant, smoke test, takedown runbook check, flip `FEATURE_FLAG_BILLING_ENFORCEMENT`, go-live checklist (NFS-e gate, accountant answers) | — | Last story before launch |

## Later slices (each independent)

| Slice | Stories | Gate |
|---|---|---|
| **E — US / Stripe** | E1 `StripeBillingProvider` (invoices, webhook, tax in the provider call); **E0 expand migration adding the tax columns, `charge_tax_lines` and `tax_behavior`**; E2 US identity (full address) + plan-save guard; E3 US price rows, `FEATURE_FLAG_SIGNUP_US`, enable signup | **GATE:** Stripe account checks and the accountant's US tax decision |
| **F — Automatic collection** | F1 (CAND-30) Pix Automático authorization flow, tab, webhooks, `MANUAL` charge creation; **F2 (CAND-38) hosted recurring-card checkout**: `charges.origin` expand migration, mirror of provider-generated charges, subscription `PUT`/`DELETE`, fallback to the hosted link; the Stripe equivalent rides with slice E | **GATE:** real Asaas PJ account verification; **F2 also gated on A0's F2 checks** |
| **H — Annual billing** (CAND-39/40, `tenant-billing.md` §4.8) | H1 commercial catalog: real annual amounts per feature/country; H2 expand migration (`feature_prices.cycle` CHECK, `anchor_month`, `next_cycle*`, `charges.kind = ADDON`) + annual price seeds; H3 cycle-aware period/anchor maths, 30-day issue lead and 60-day price notice in the issue job and sweep; H4 Plano tab cycle toggle, public price toggle, cycle switch at next period; H5 co-terminus add-on (`POST /plan/addon`, `ADDON` charge); H6 annual recovery (monthly) and cancel rules, Terms wording; H7 annual renewal reminders and emails | **GATE:** owner sets the annual prices and confirms decisions 125–126 (124 is confirmed); annual automatic collection also needs the F2 provider check |
| **G — Tenant purge** | G1..G9 one deletion story per participant (Booking, Customer, Staff, Loyalty, Notification, Platform incl. chatbot/audit, Storage, Provider cancellation, Billing anonymization); G10 coordinator, `TenantPurgeWarning` emails, trigger job (CAND-27); **G11 self-service data export**; **G12 self-service discard of a never-paid tenant (CAND-36)** and **G13 deactivation stops billing (CAND-37, with M17-S51)**. Reconcile G with `plan/M17` S51 (manual runbooks) first | After launch; enable the cron only when all participants exist |

## Suggested critical path to a first BR launch

`A0 → A1 → A2 → A3 → A4 → A5 → A6 → A7`, then milestone 1's `B1 → B1a–d → B2 → B3 → B4 → B5` in parallel with milestone 2's `C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C9 → C10 → C11 → C13 → C14 → C15`, then `C16` (real Asaas), then `D1 → D2 → D3 → D4 → D5 → D7` and `L1` (still milestone 2). Everything is testable on the fake from C2 onward; enforcement is merged dark and switched on in L1.

## Open the accounts now

- **Asaas sandbox now** (free, auto-approved) for A0; request the **Asaas production PJ account today** because KYC time is unknown and C16 and L1 wait on it.
- **Stripe** is not needed until slice E; opening the BR account early only lets you ask support the PROVIDERS §5 questions.
- **Accountant** questions in PROVIDERS §5 gate slice E and the nota fiscal answer for the BR go-live (decision 109); start them in parallel with milestone 1.

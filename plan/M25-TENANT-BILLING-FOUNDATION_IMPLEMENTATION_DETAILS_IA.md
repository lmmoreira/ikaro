# M25 — Tenant Billing: Foundation & Dark Enforcement — Implementation Details (IA)

36 stories done (S01–S22, S24–S34 incl. S15a/b, S18a/b, S21a, S31a/b); S21b merged into S21a; S23 dropped. Nothing is charged: every existing tenant is backfilled `exempt`, so enforcement ships dark. M26 builds the money loop on this.

## Artifacts

### Backend — Billing context (`apps/backend/src/contexts/billing/`)

| Artifact | Path (under `contexts/billing/`) |
|---|---|
| `Subscription` aggregate (root, 1 per tenant): `startTrial`, `startExempt`, `entitledAt(now)`, `validateSelection`, `previewSelection`, `suspendByOperator`, `unsuspendOperator`, `extendGrace`, `setExempt`, `clearExempt(…, isPlatformOwner)`; `TRIAL_DAYS = 14`, `GRACE_DAYS = 14` | `domain/subscription.aggregate.ts`, `domain/subscription.types.ts`, `domain/subscription-item.ts`, `domain/subscription-trial-window.ts` |
| `BillingAccount`, `FeaturePrice` (platform-wide, no `tenant_id`), `SignupRegistration`, `OperatorAudit` (`OPERATOR_AUDIT_ACTIONS` = GRACE/SUSPEND/UNSUSPEND/SET_EXEMPT), `MinorAmount` VO | `domain/{billing-account.aggregate,feature-price.aggregate,signup-registration,operator-audit}.ts`, `domain/value-objects/minor-amount.vo.ts` |
| `MERCHANT_PROFILE_KEYS` (`BRL_FAKE`, `USD_FAKE`, `BRL_ASAAS_SANDBOX`, `USD_STRIPE_TEST`, `BRL_ASAAS_LIVE`, `USD_STRIPE_LIVE`), `resolveMerchantProfileKey` (appEnv x country) | `domain/merchant-profile-key.ts` |
| Use cases (one file each): `CreateTrialSubscription` (`CONSUMER_NAME='create-trial-subscription'`), `GetTenantAccess` (`PROVISIONING_GRACE_MINUTES = 15`), `SuspendTenantByOperator`, `UnsuspendTenant`, `ExtendGrace`, `SetTenantExempt`, `ListTenantBillingStatus`, `ReserveSignupRegistration`, `GetFeaturePriceAt`, `ListSelectablePrices`, clock use cases | `application/use-cases/*.use-case.ts` |
| `CachingSubscriptionRepository` (decorator over `ISubscriptionRepository`; invalidates on its own `save()`, after commit) | `infrastructure/repositories/caching-subscription.repository.ts` |
| `TenantAccessAdapter` (implements shared `TENANT_ACCESS_PORT`) | `infrastructure/adapters/tenant-access.adapter.ts` |
| `BillingPlatformAdapter` (the one read-only Platform tenant-info edge) | `infrastructure/cross-context/billing-platform.adapter.ts` |
| Controllers: operator, access, registrations, dev clock | `infrastructure/controllers/internal-billing-{operator,access,registration}.controller.ts`, `internal-dev-clock.controller.ts` |
| `BillingProviderPort` (ensureCustomer, createCharge, regeneratePaymentLink, cancelCharge, start/revokeAutoBilling, fetchChargeStatus, readAccountHealth, reenableWebhookQueue, parseWebhook), `BillingProviderRegistry`, `FakeBillingProvider`, `AsaasEventNormalizer`, `provider-config.guard.ts` | `application/ports/billing-provider.port.ts`, `infrastructure/providers/` |

### Shared (backend `src/shared/`, packages)

| Artifact | Path |
|---|---|
| `TenantAccessPort` (`getAccess`, `listSuspendedTenantIds`, `findTenantIdsNotEntitledTo`), `TenantAccess` (`provisional`/`degraded` internal markers) | `apps/backend/src/shared/ports/tenant-access.port.ts` |
| `DevClockModule.register(appEnv)` — empty module in `production` (routes 404) | `contexts/billing/infrastructure/dev-clock.module.ts` |
| `resolveAppEnv` / `APP_ENVS` (`local`/`staging`/`production`) | `apps/backend/src/shared/database/resolve-app-env.ts` |
| `TaxId` VO (CPF, CNPJ incl. alphanumeric, EIN, OTHER) + `TaxIdValidationError` (code `SignupErrorCode`) | `apps/backend/src/shared/value-objects/tax-id.vo.ts`; `TaxIdSpec`/`TaxIdType` in `packages/i18n/src/country-defaults.ts` |
| `FEATURE_KEYS` = HOTSITE, BOOKING, LOYALTY, CHATBOT, LEAD_FORM; `CHATBOT_TIERS` = BASIC, PLUS | `packages/validation/src/billing.ts` |
| `BillingErrorCode` (`BILLING_EXEMPT_PROTECTED`, `_GRACE_NOT_ALLOWED`, `_UNSUSPEND_NOT_ALLOWED`, `_CONCURRENT_MODIFICATION`, `_FEATURE_NOT_ENTITLED`, `_TENANT_SUSPENDED`), `SignupErrorCode` (`SIGNUP_TAX_ID_INVALID`, `_TAX_ID_REQUIRED`, `_TERMS_NOT_ACCEPTED`) | `packages/types/src/error-codes.ts`; both locales `packages/i18n/locales/{pt-BR,en}/errors.json` |
| `HOTSITE_MODULE_FEATURE` (module type to `FeatureKey`), `CUSTOMER_FEATURE_KEYS` | `packages/types/src/enums.ts` |
| `HOTSITE_LINK_TARGET_MODULE` | `packages/types/src/hotsite.ts` |
| Gating decorators `RequiresFeature`, `SuspensionAccess`, `NoFeatureGate`, `readTenantAccessRequirement` (metadata keys `tenantAccess:*`) | `packages/nestjs-http/src/tenant-access-{decorators,metadata}.ts` |

### Enforcement machinery

| Artifact | Path |
|---|---|
| `TenantAccessGuard` — global `APP_GUARD` (backend only), reads `x-tenant-id` + `x-actor-role` headers (runs before `RequestContext`), fails open on lookup error, passes requests without a tenant | `apps/backend/src/shared/guards/tenant-access.guard.ts`, registered in `apps/backend/src/app.module.ts` |
| `GatedEventBus` (`EVENT_BUS`) over `EVENT_BUS_TRANSPORT` (the Pub/Sub adapter, sole `useClass`); `TRIGGER_BUS`/`PUSHABLE_EVENT_BUS` are `useExisting` aliases of the transport | `apps/backend/src/shared/infrastructure/event-bus/{gated-event-bus,event-bus.module}.ts`, `shared/ports/event-bus.port.ts` (`SubscribeOptions { skipWhenSuspended?, requires? }`) |
| `TenantJobRunner.forEachTenant` (`scope: operational\|includingSuspended`, `requires`, `isDue`) | `apps/backend/src/shared/application/jobs/tenant-job-runner.ts` |
| CI detectors: `tenant-access-route-metadata` (enforcing since S24; warn mode deleted), `event-handler-suspension-declaration` (fails from first commit) | `packages/architecture-check/src/detectors/` |
| Web: `feature-registry.ts` (`ROUTE_FEATURES`, `UNGATED_ROUTES`, `featureForPath`), `access.server.ts` (`fetchTenantAccess`, `fetchCustomerFeatures`, `redirectCustomerWithoutFeature`, `redirectCustomerWhenBookingUnavailable`), `suspended-redirect.ts`, `locked-modules.ts`, `tenant-access.ts` | `apps/web/shared/lib/billing/` |
| Web registries: `HOTSITE_PAGE_FEATURE`, `SETTINGS_SECTION_FEATURE`, `resolveCustomerCapabilities` + `CustomerTenantAccessProvider` | `apps/web/features/platform/hotsite/feature-availability.ts`, `apps/web/features/platform/settings-locked-sections.ts`, `apps/web/features/customer/customer-capabilities.ts`, `…/components/customer-tenant-access-context.tsx` |
| `FeatureGate`, `LockedFeatureCard`, `LockedFeaturePage`, `Manager/StaffSuspendedNotice`; page `app/dashboard/suspended` | `apps/web/features/billing/components/` |
| Hotsite `UnavailablePage`, `Unavailable` | `apps/web/shells/hotsite/components/` |
| BFF: `billing.controller.ts` (`GET /v1/billing/access`, no `@Roles`, tenant from JWT), `tenant-access.reader.ts` (`readTenantAccess`, `readOperationalByTenant`: fail-open, no cache) | `apps/bff/src/features/billing/` |

### Platform, Booking, Notification consumers

| Artifact | Path |
|---|---|
| `RevalidateTenantHotsiteUseCase` (`CONSUMER_NAME_ON_SUSPENSION='revalidate-hotsite-on-suspension'`, `CONSUMER_NAME_ON_REACTIVATION='revalidate-hotsite-on-reactivation'`) + two handlers | `contexts/platform/application/use-cases/revalidate-tenant-hotsite.use-case.ts`, `contexts/platform/infrastructure/events/subscription-{suspended,reactivated}-hotsite-revalidation.handler.ts` |
| `GetHotsiteManifestUseCase` (effective `isPublished`, `unavailableFeatures`), `ListPublishedHotsitesUseCase` (drops suspended ids in memory, fails open) | `contexts/platform/application/use-cases/` |
| `SubscriptionSuspendedTenantUnavailableHandler` (`'fan-out-tenant-unavailable-notice'`), `RaiseTenantUnavailableNoticesUseCase`, command `TenantUnavailableNoticeDue` (carries `customerId` only) | `contexts/booking/infrastructure/events/`, `contexts/booking/application/use-cases/`, `contexts/booking/domain/commands/tenant-unavailable-notice-due.command.ts` |
| `TenantUnavailableNoticeHandler` (`'notify-customer-tenant-unavailable'`), `SendTenantUnavailableNoticeNotificationUseCase`, template key `TENANT_UNAVAILABLE_CUSTOMER` | `contexts/notification/` (migration `1748500000044-AddTenantUnavailableCustomerTemplate`) |

### Scripts and infra

| Artifact | Path |
|---|---|
| `scripts/billing-operator.sh` (`suspend`, `unsuspend`, `grace`, `exempt --set\|--clear`, `list`; every write needs `--reason` + `--operator`), `scripts/lib/relay-auth.sh` (relay VM auth; secrets on curl stdin), `scripts/billing-clock-advance.sh`, `scripts/provision-tenant.sh` (`--exempt`, `--tax-id`; reserves a registration then `POST /internal/tenants` with `registrationId`) | `scripts/` |
| Relay VM module: `startup-script.sh.tftpl` (flush-left, `templatefile()`), `additional_scripts` map (path under `/usr/local/bin` to content; base64 install), `tenant_provision_script` unchanged, pinned-sha256 proxy download | `infra/terraform/modules/relay-vm/{main.tf,variables.tf,startup-script.sh.tftpl,README.md,tests/}` |

## HTTP surface (all backend; BFF has only `GET /v1/billing/access`)

| Route | Notes |
|---|---|
| `POST /internal/billing/registrations` | reserve signup registration; B-A1 lock on googleSub; `exempt` flag on the registration |
| `GET /internal/billing/tenants/:tenantId/access` | role-reduced by the BFF; `@NoFeatureGate()` + `@SuspensionAccess('ANY_AUTHENTICATED')`; unknown tenant = Platform's tenant-not-found 404 |
| `GET /internal/billing/suspended-tenant-ids` | `{ tenantIds: [] }`, unpaginated. `findTenantIdsNotEntitledTo` has no route (in-process crons) |
| `POST /internal/tenants/:tenantId/billing/{suspend,unsuspend,grace}`, `PUT …/billing/exempt`, `GET /internal/billing/tenants` | `@UseGuards(InternalApiGuard, PlatformAdminGuard)`; the backend is on internal ingress, so the only production path is `billing-operator.sh` from the relay VM |
| `/internal/dev/clock` (GET, `POST advance`, `POST reset`) | non-production only; `IClock` = `CLOCK` port, `now()` only, `AdvanceableClock` offset is process-wide |
| `GET /v1/billing/access` (BFF) | MANAGER `{status, operational, features}`; STAFF `{operational, features}`; CUSTOMER `{operational, features}` (customer-facing keys only); no role sees `suspensionReason`, `provisional`, `degraded` |

## DB Schema (`billing`)

Migrations (`contexts/billing/infrastructure/migrations/`): `1748500000039-CreateBillingSchema` (schema + `btree_gist` + all first-schema tables), `…040-SeedFeaturePrices` (BR list: HOTSITE 49, BOOKING 109, LOYALTY 29, CHATBOT Basic 39 / Plus 79, LEAD_FORM 19; idempotent), `…041-BackfillExemptSubscriptions`, `…042-AllowEinTaxIdType`, `…043-AddExemptToSignupRegistrations`. Notification: `1748500000044-AddTenantUnavailableCustomerTemplate`.

Tables created by 039: `feature_prices`, `feature_price_versions`, `billing_accounts`, `subscriptions`, `subscription_items`, `signup_registrations`, `operator_audit` (all with aggregate/entity in M25) and DDL-only `charges`, `charge_lines`, `provider_events`, `tenant_purge_jobs`, `tenant_purge_steps`, `provider_health` (M26/M27).
- GIST exclusion on `subscription_items` (no overlap per feature); `UQ_billing_charges_open_recovery` partial unique (exercised in M26); standalone partial index on `subscriptions(suspended_at) WHERE status='SUSPENDED'` serves the cross-tenant batch read.
- Expand-only: no existing table changed (the `notification_logs.status` widening planned as S23 was dropped).

## Version facts

| Fact | Value |
|---|---|
| Trial / grace | 14 days / 14 days (`TRIAL_DAYS`, `GRACE_DAYS`) |
| Provisioning window | 15 min (`PROVISIONING_GRACE_MINUTES`): a tenant younger than that with no subscription gets a trial-shaped, uncached `provisional` answer |
| Access cache (`CachingSubscriptionRepository`) | `OPERATIONAL_TTL_MS = 300_000`, `SUSPENDED_TTL_MS = 10_000`; per instance, no broadcast; worst-case staleness on another instance 300 s for a suspension, 10 s for a lifting (no live check may assume less); a missing subscription is never cached |
| Fail-open answer | lookup error: `operational: true`, `ACTIVE`, every feature (chatbot BASIC), `degraded: true`, never cached |
| Plus chatbot | `anthropic/claude-haiku-5.5`; Basic unchanged (`deepseek/deepseek-v4-flash-0731`); same caps |
| Env vars | `PLATFORM_OWNER_TENANT_SLUG` (backend `env.validation.ts`, `apps/backend/.env.example`; the owner tenant can never be un-exempted); `APP_ENV` resolved only by `resolveAppEnv`; no billing kill-switch flag exists (dropped at S07: the emergency lever is a reviewed SQL update that reproduces `startExempt`'s end state) |
| `SuspensionAccessPolicy` set | `DEFAULT_DENY`, `MANAGER_BILLING`, `STAFF_NOTICE`, `CUSTOMER_HISTORY`, `AUTH_TENANT_SWITCH`, `ANY_AUTHENTICATED`, `PUBLIC_MANIFEST`, `PUBLIC_NONE` (the BFF-only `PUBLIC_ALWAYS` was removed in S33) |
| Locks | B-A1 `pg_advisory_xact_lock(hashtextextended('signup:'||googleSub, 0))`; B-R1 `findByTenantIdForUpdate` (`docs/LOCK_CATALOG.md`) |

## Pub/Sub

No new topic names beyond three event types in `infra/terraform/pubsub-catalog.json`:

| Event | Consumers (catalog) |
|---|---|
| `SubscriptionSuspended` | `audit-log`, `fan-out-tenant-unavailable-notice`, `revalidate-hotsite-on-suspension` |
| `SubscriptionReactivated` | `audit-log`, `revalidate-hotsite-on-reactivation` |
| `TenantUnavailableNoticeDue` (a Command) | `notify-customer-tenant-unavailable` |

`TenantProvisioned` gained a Billing consumer (`create-trial-subscription`); `countryCode` and `registrationId` are required on the event (no legacy payload exists). All five new consumers above declare `{ skipWhenSuspended: false }` (they exist because of the suspension or the provisioning; `create-trial-subscription` declares false too). Subscriptions, DLQs and IAM are generated by Foundation from the catalog.

## Structural decisions

- **Backend is the only enforcement point (S33).** The BFF `TenantAccessGuard`, `TenantAccessLookup`, its annotations, the `PUBLIC_ALWAYS` policy and the whole BFF cache layer (`BffCache`, `TtlCache`, `backend-read-cache`) were removed; the BFF forwards the backend's typed 403. Where the BFF was stricter, the backend route was re-annotated, never a BFF check kept. Rule: `docs/ANTI_PATTERNS.md`.
- **Route gating:** `@RequiresFeature(key)` + `@SuspensionAccess(policy)` (+ `@NoFeatureGate()` for routes with no sellable feature, which skips entitlement only). Unannotated = `DEFAULT_DENY`. A suspended tenant is decided by the policy alone: an admitting policy skips entitlement (a suspended subscription has `features: []`, which would turn the public manifest into a `FEATURE_NOT_ENTITLED`). Entitlement/`@NoFeatureGate` resolve at the nearest scope (handler, else controller); policy inherits separately.
- **Event gate (S21a, S21b merged in):** a decorator, not code in the Pub/Sub adapter (the adapter cannot depend on Billing: `EVENT_BUS` to `TENANT_ACCESS_PORT` to `OUTBOX_PUBLISHER` to `OutboxRelayService` to `EVENT_BUS` would be a cycle). Skipped events are acked and dropped, never replayed; envelope without `tenantId` and lookup error deliver. Every `eventBus.subscribe(` must pass a literal `{ skipWhenSuspended: true|false }` (detector). UC-123 (notification suppression) is delivered by this gate; no separate notification gate (S23 dropped).
- **Crons (S22):** `TenantJobRunner` replaces Booking's own tenant loops; `requires: 'BOOKING'` only on the four outbound jobs (both reminders, renewal reminder, availability-alert sweep); the three cleanup jobs (expire holds/alerts/approvals) skip suspended tenants but declare no `requires`; system-wide sweeps (loyalty expiry, retention, occupancy purge) and Billing's own trigger jobs are not converted. The runner tries every tenant, then throws once.
- **Hotsite (S25):** `effective isPublished = flag && operational`; Billing never mutates `isPublished`. Published list filters suspended ids in memory (no `findActiveExcluding`), fails open. Manifest module filtering by `HOTSITE_MODULE_FEATURE`. Manifest and published list are `PUBLIC_MANIFEST`: `200` with `isPublished:false`, never a typed denial.
- **Hotsite unavailable:** one neutral "Página indisponível" page with the login bar for every case; `[slug]/login` and `[slug]/my-account` never check `isPublished` (that is what keeps staff notice and customer badge reachable). Two maps on purpose: `HOTSITE_MODULE_FEATURE` (module to feature) and `HOTSITE_LINK_TARGET_MODULE` (module a header button needs enabled; `booking-form` needs none).
- **Missing feature vs suspended, per actor (S29/S31a/S34):** visitor and customer: absent (pages redirect to Início via `redirectCustomerWithoutFeature`); manager and staff: locked (`FeatureGate`, `LockedFeatureCard`, padlock `NavLockMark`); suspended customer: all tabs stay, "Empresa inativa" badge, creating actions disabled. Contract specs scan `app/[slug]/**` and `my-account/**` so a page without a decision fails. Table: `docs/ENGINEERING_RULES_FRONTEND.md` § A surface of a missing feature or a suspended tenant.
- **Suspended manager (interim):** `resolveSuspendedRedirect` (from the dashboard shell-context loader, `proxy.ts` untouched) sends them to `/dashboard/suspended`; M26 repoints it to billing.
- **Suspended-customer notice (S28):** Booking owns the fan-out (reads its own bookings); command carries `customerId` only (no email/name in outbox, Pub/Sub or DLQ); recipients = logged-in customers with an `APPROVED` booking starting after the event's `suspendedAt`; one command per distinct customer; guests, PENDING, INFO_REQUESTED get nothing; allow-list of reasons `OPERATOR`, `NON_PAYMENT`, `PAYMENT_REVERSED` (not `CANCELED`); no quiet window. Written with `publishToOutboxInChunks` (`apps/backend/src/shared/utils/publish-to-outbox-in-chunks.ts`, 500 per chunk).
- **Loyalty (S27):** points keep expiring while suspended (a pause ledger was built and dropped; PR #788 closed unmerged; revisit if suspensions get long or common). Docs only.
- **Provisioning:** reserve via `POST /internal/billing/registrations` (may carry `exempt`), then `POST /internal/tenants` with `registrationId`; `TenantProvisioned` creates the trial (or exempt) subscription.
- **Operator:** `PlatformAdminGuard` is in `src/shared/guards/`; every operator write leaves a `billing.operator_audit` row (`actor`, `payload.reason`); a repeated `suspend` of an already suspended tenant writes no row and emits no event; `suspend` refuses an exempt tenant (clear exempt first); `exempt --clear` on Ikaro's own tenant is `403 BILLING_EXEMPT_PROTECTED`.
- **Provider seam (S14):** `BillingProviderRegistry.resolve()` refuses a live key outside production and a fake/sandbox/test key in production, at lookup, never at startup; network methods registered in `externalSideEffectPorts` (`transactional-io`). Only the fake exists; Asaas adapter is M26.
- **Cross-context edges** are exact-path `permittedEdges` in `packages/architecture-check/architecture-policy.json`: Billing handler from Platform `TenantProvisioned`; Billing to Platform tenant-info read; Platform handlers from Billing suspension events; Booking handler from Billing `SubscriptionSuspended`; Notification handler from Booking `TenantUnavailableNoticeDue`.

## Staging test tenants (permanent, synthetic, never removed)

`elviodentista` (created with `provision-tenant.sh --exempt`, one bookable service; the tenant the operator suspends) and `smassagem` (the "other tenant"; its client has an upcoming approved booking). Idle state of `elviodentista`: active and exempt (a non-exempt tenant would suspend itself on non-payment). Recipe: `docs/RUNBOOKS.md` § Operator cases ("Staging billing test tenant"); re-seed upcoming bookings before each run; mail via Brevo, plus-aliases of the operator's inbox.

## Live-verification outcomes (S32, 2026-11-18, PR #812; teardown PR #813; Foundation run `44322772563`)

Verified live on the staging relay VM:
- Round trip on `elviodentista`: `list`, `exempt --clear`, `suspend`, repeated `suspend`, `unsuspend`, `exempt --set`; exactly four `operator_audit` rows (SET_EXEMPT, SUSPEND, UNSUSPEND, SET_EXEMPT); repeated suspend wrote nothing; `SubscriptionSuspended` and `SubscriptionReactivated` each logged once by the audit consumer.
- Argument checks rejected pre-network; `exempt --clear` on Ikaro's own tenant = `403 BILLING_EXEMPT_PROTECTED`, no row; `ps` samples showed no key or token.
- S28 mail: one command, one email for the one logged-in customer with two approved bookings; guest, pending and `smassagem`'s client got nothing; `unsuspend` sent nothing; six `-dlq-inspect` subscriptions empty.
- Relay VM defects found and fixed (module PR #812): indented `<<-EOT` heredoc terminators swallowed the script (VM booted doing no install since commit `0ba1f1d02`, 2026-07-28); only `provision-tenant.sh` was ever installed (operator script absent); a hard reset after the proxy download left a truncated executable (SIGBUS) fixed by a pinned sha256 + temp-name download. 31 module tests, mutation-checked.

Accepted gaps (carry nothing forward except where stated):
- Two-different-customers email case not exercised live (needs a second logged-in identity; staging Dev Login is an API); covered by unit and integration specs.
- Hotsite revalidation: the public page was seen flipping to Unavailable and back, but the manifest's `isPublished` and the published list were not read directly (BFF unreachable from outside); consumers log nothing on success (TD51 Story 7). S25's own live delivery check was waived 2026-11-15 and absorbed here.
- Tfsec not run (Checkov is the gate, clean on #812).
- S11's end-to-end `provision-tenant.sh` run on the relay VM was deferred and is carried to M26-S24 (which also covers the `relay-auth.sh` refactor).

## Carried items

- **M26-S24 (relay VM Foundation wiring):** both Foundation env roots (`infra/terraform/foundation/envs/{staging,prod}/main.tf`) do not pass `additional_scripts` yet (verified: no occurrence). M26-S24 makes that PR first (pass `billing-operator.sh` and `lib/relay-auth.sh` through `file()`), applies Foundation, then repeats the first-boot and second-boot checks from applied metadata (both S32 boot checks ran with the fixed script set by hand as instance metadata). The relay VM is currently torn down in staging; prod VM is off.
- **M26 builds on:** webhook + `provider_events`, charges, status sweep, dunning, real `AsaasBillingProvider`, manager billing UI, signup; extends `bookableUntil` on the access answer (M26-S18b), exempt hook (M26-S20), `isActive` on tenant-info port (M26-S05). M27 (purge) gates M26's launch story.
- **TD51 Story 7:** success log line for hotsite revalidation.

## Stories and PRs

S01 #749; S02 #750 (docs); S03 #751; S04 #754; S05 #757; S06 #759 (+#761); S07 #752; S08 #762; S09 #765; S10 #767; S11 #769 (+#770 fix); S12 #760; S13 #771; S14 #768; S15a #772; S15b #774; S16 #775; S17 #777; S18a #779; S18b #780; S19 #781; S20 #782; S21a #778; S22 #776; S24 #783; S25 #786; S26 #787; S27 #789 (docs); S28 #791; S29 #802; S30 #805; S31a #808; S31b #810; S32 #812 (+#813 teardown); S33 #784; S34 #809.

## Gotchas

- **A suspended tenant's access answer has `features: []`**; read as "every feature missing" it hides every customer tab. Trust a feature list only when the same answer has `operational === true`; otherwise fail open (`docs/ENGINEERING_RULES_FRONTEND.md` § A surface of a missing feature or a suspended tenant; `docs/ANTI_PATTERNS.md`).
- **A dashboard layout that reads a record (booking, service) before `FeatureGate` renders** gets a typed 403 for a locked feature; skip the read when the route's feature is locked (`docs/ANTI_PATTERNS.md`; `docs/ENGINEERING_RULES_FRONTEND.md`).
- **A lock cue never dims the whole link** (contrast fell to about 1.7:1): use the padlock `NavLockMark`.
- **Guards run before `RequestContext`:** `TenantAccessGuard` reads headers directly; an Interceptor would not run for a Guard-rejected request (`docs/ENGINEERING_RULES_SHARED.md` § RequestContext).
- **Event-bus cycle:** never inject `TENANT_ACCESS_PORT` into the transport adapter; inside `GatedEventBus` the wrapped field is named `transport`, never `eventBus` (the Pub/Sub catalog scanner matches that receiver name and throws on a non-literal first arg). Harnesses asserting suspension override only `EVENT_BUS_TRANSPORT` (`docs/TESTING_STRATEGY.md`).
- **A handler that exists because of the suspension** (hotsite revalidation, fan-out notice, audit log) must declare `skipWhenSuspended: false`, or the gate drops its own trigger.
- **Cross-context adapters ending in a bare `catch` returning `null`/`[]`** silently dropped notices; `null` must mean "does not exist".
- **A module whose wiring depends on `APP_ENV` is `XxxModule.register(appEnv)`** imported right after `ConfigModule.forRoot()`; reading `process.env` inside a module runs at import time, before `.env` loads (`docs/ENGINEERING_RULES_BACKEND.md`; `ClockModule`/`DevClockModule`).
- **A migration file exports only its migration class** (TypeORM calls `new` on every exported function); a `QueryRunner` migration must be added to `PERSISTENCE_BYPASS_IGNORES` in `apps/backend/eslint.config.js`; a migration class must be registered in `integration-global-setup.ts` (`docs/ENGINEERING_RULES_BACKEND.md` § Migration backfills).
- **A brand-new error origin** (`BILLING_*`, `SIGNUP_*`) needs the `AnyErrorCode` union, both locale files and the mapper-coverage entries in the same change; copy for a multi-country code is country-neutral (`docs/ENGINEERING_RULES_SHARED.md` § Adding a new error).
- **An operator script must not pass a token or key in process arguments** (`ps` lists them): headers go to curl on stdin via `--config -` with `printf` (`docs/ENGINEERING_RULES_INFRA.md`).
- **A script embedded in Terraform:** never an inline `<<-` heredoc (interpolated script lands at column 0, terminators stay indented, the script is swallowed with no error); use a `*.tftpl`, pin terminators in a `terraform test`, prove with a real boot (`journalctl`), trust a downloaded binary only by sha256 (`docs/ENGINEERING_RULES_INFRA.md` § A script embedded in Terraform or instance metadata).
- **`modules/relay-vm/**` and `foundation/**` cannot share a PR** (playbook rule 1, `infra/terraform/README.md` § New-resource PR-sequencing playbook); `infra-app-mix-ok` added after the PR opens does not re-run the check (`docs/CI_TRAPS.md`).
- **A live merchant key is refused outside production and a fake/sandbox key in production, at lookup** (`BillingProviderRegistry.resolve()`), not at startup, because the key is a DB column (`docs/ENGINEERING_RULES_INFRA.md` § Billing configuration).
- **Playwright specs that advance the dev clock** run in one serial project on spec-owned tenants (`docs/TESTING_STRATEGY.md`).
- **Registries are tested by looping them; React's `cache` is a no-op under Vitest**, so "one shared read per render" needs a memoising stand-in (`docs/ENGINEERING_RULES_TESTING.md` § A registry is tested by looping it). `home` maps to `null` in the link-target registry: a lookup must treat `null` and "not a target" the same (keep the button); use an own-property check for arbitrary manifest strings.
- **A table with no tenant to scope by** (`billing.signup_registrations`, `tenant_id` NULL until completion) is cleaned by the spec's own rows only (`docs/ENGINEERING_RULES_TESTING.md`).
- **A bot's "PR deletes/touches X" claim** was a stale base (S09, #765): merge `origin/main`, never rebase (`docs/CI_TRAPS.md`).
- **Widening a value set** (e.g. `EIN` in migration `…042`) is a stale-reference sweep (`docs/DEFINITION_OF_DONE.md`).

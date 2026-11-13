# Ikaro — Repository Structure

> **When to load:** creating files in unfamiliar locations, answering architecture questions, or setting up a new context module.
> **Tags:** agent-process, backend, bff, web

---

## Monorepo (pnpm workspaces)

```text
.
├── apps/
│   ├── backend/          # NestJS modular monolith
│   │   └── src/contexts/ # booking/ customer/ staff/ loyalty/ notification/ platform/ billing/ (schema, price-list, subscription and billing-account aggregates and repositories; charges and use cases planned)
│   ├── bff/              # NestJS BFF (feature slices under src/features/)
│   └── web/              # Next.js 16 (domain features + shell slices + shared/)
├── packages/
│   ├── types/            # shared TypeScript types / DTOs
│   ├── config/           # shared ESLint, tsconfig, Prettier configs
│   ├── observability/    # shared BaseAppLogger (backend + bff each subclass it)
│   ├── env-validation/   # shared validateEnvWithSchema() (backend + bff env.validation.ts)
│   ├── hotsite-templates/ # the hotsite template catalogue: definitions, per-locale copy, versioned image assets + append-only asset manifest (README.md is the maintainer guide)
│   ├── http-utils/       # shared HTTP helpers
│   ├── i18n/             # shared locale files + formatting helpers
│   ├── infra-scripts/    # shared infra/tooling scripts
│   ├── nestjs-http/      # shared NestJS HTTP module helpers (backend + bff)
│   ├── validation/       # shared validation primitives (e.g. phone/email format checks)
│   └── architecture-check/ # full-codebase static architecture validation (contextDependencyMatrix, VO registry, max-lines exceptions)
├── infra/
│   └── terraform/        # GCP resources (Cloud Run, Cloud SQL, Pub/Sub, Secret Manager) — modules/, envs/{staging,prod}/, foundation/; see infra/terraform/README.md
├── .github/workflows/    # CI/CD pipeline YAML files
├── scripts/              # repo tooling: pre-pr.sh, ci-local.sh, infra-e2e.sh, provision-tenant.sh, relay-vm-up/down.sh, dep-cruise, attw and knip helpers
├── knip.config.ts · sonar-project.properties  # unused-code and SonarCloud configuration
├── docker/               # docker-compose.yml, init-db.sh (local dev); each app owns its Dockerfile
├── .copilot/context.md   # canonical agent context (symlinked as AGENTS.md, CLAUDE.md, gemini.md)
├── docs/                 # source of truth documentation (see CLAUDE.md §10)
├── journeys/             # canonical journeys + HTML prototypes per actor (guest/customer/staff/manager/shared); index: journeys/README.md
├── plan/                 # milestone plans (M*.md) and their IMPLEMENTATION_DETAILS files
├── td/                   # technical-debt files (TD*.md), stories in the same schema as milestones
└── archive/              # superseded docs — never load
```

---

## Backend target structure

Backend is already in the canonical shape and should stay close to this layout:

```text
apps/backend/src/
├── config/
├── contexts/
│   ├── billing/       # schema (M25-S03); aggregates land story by story: FeaturePrice (M25-S04), Subscription and BillingAccount (M25-S08) are built, Charge is not; the access resolution (the shared `TenantAccessPort`, its adapter and the `CachingSubscriptionRepository` cache, M25-S13) is built
│   ├── booking/
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   ├── customer/
│   ├── loyalty/
│   ├── notification/
│   ├── platform/
│   └── staff/
├── eslint/            # local ESLint rule specs (persistence-boundary, restricted-imports-syntax)
├── health/
├── shared/
├── test/
├── app.module.ts
├── main.ts
└── tracing.ts
```

### Per-context structure (`apps/backend/src/contexts/<context>/`)

```text
├── domain/           # entities, value objects, events, domain services (no framework deps)
├── application/      # use cases, port interfaces, DTOs
└── infrastructure/   # adapters: TypeORM repos, REST controllers, Pub/Sub publishers, HTTP clients
    └── migrations/   # TypeORM migrations scoped to this context's schema
```

### Shared folder (`apps/backend/src/shared/`)

Cross-cutting concerns ONLY. Domain objects and repositories are NEVER here, and neither are use cases — with two carve-outs: `application/use-cases/log-domain-event.use-case.ts`, the cross-cutting `audit-log` consumer every context's `<Context>AuditLogHandler` calls (M23-S36), and `application/jobs/`, the tenant-looping cron runner every context's jobs call (`TenantJobRunner`, M25-S22; it sits in `application/` because a job may never import `shared/infrastructure/`).

```text
apps/backend/src/shared/
├── ports/            # IEventBus, IOutboxRepository, ITransactionManager, ITriggerBus … (cross-cutting ports only; each context's repository ports live in its own application/ports/) — no barrel index.ts (ESLint enforced); Billing's `clock.port.ts` (M25-S12) and `tenant-access.port.ts` (M25-S13, the one access contract every context injects)
├── application/      # use-cases/log-domain-event.use-case.ts (the shared audit-log consumer, M23-S36) and jobs/ (TenantJobRunner + localTimeWindow, the shared tenant-looping cron runner, M25-S22)
├── domain/           # AggregateRoot, DomainEvent, ValueObject base classes — no barrel index.ts
├── value-objects/    # Email, PhoneNumber, Address, Money, HexColor, Timezone, TimeOfDay, CalendarDate, Slug, CountryCode, SeoTitle, SeoDescription
│                     # (plus the plain-type files business-hours.vo.ts and tenant-settings-data.ts — interfaces, not VO classes)
├── utils/            # deepMerge, startOfDayUTC, endOfDayUTC, todayUTC, todayInTimezone, localDateTimeToUTCIso,
│                     # utcDateToLocalDate, utcDateToLocalHHMM, getUtcWeekDayName, plus calendar-date.ts (addDaysUTC, addMonthsUTC,
│                     # localDayBounds*), escapeLikePattern, escapeHtml, redact-email/storage-path-for-logging, text-normalization —
│                     # `ls apps/backend/src/shared/utils/` is the authoritative list
├── request/          # RequestContext (request-scoped), RequestInterceptor
├── observability/    # app-logger only (BaseAppLogger subclass); OTel/tracing code lives in packages/observability and apps/backend/src/tracing.ts
├── http/             # Shared validation-error mappers (address, VO); the RFC 9457 ProblemDetail type lives in packages/types
├── guards/           # role guards used by more than one context
├── decorators/       # cross-cutting decorators (e.g. @Public())
├── filters/          # cross-cutting exception filters (RFC 9457 error filter)
├── infrastructure/   # transaction manager, typeorm helpers, cross-cutting adapters, audit-log/ (AuditLogHandlerBase), outbox/, inbox/, cache/
└── database/         # data-source.ts, seed.ts
```

**Context isolation rule:** a context module MUST NOT import from another context's path. Only `src/shared/` is importable across contexts.

---

## BFF target structure

The BFF mirrors backend ownership by feature slice. Domain-owned code uses the canonical domain names; technical slices stay explicit.

```text
apps/bff/src/
├── features/
│   ├── auth/                 # technical slice: OAuth, JWT issuance, tenant selection
│   ├── billing/              # domain slice (partly built): `GET /v1/billing/access` (M25-S13, role-reduced); manager billing routes, provider webhooks and public prices are planned
│   ├── booking/              # domain slice: bookings, schedule, services, attachments
│   ├── customer/             # domain slice
│   ├── loyalty/              # domain slice
│   ├── platform/             # domain slice: hotsite, tenant settings, manifest
│   ├── staff/                # domain slice
│   └── uploads/              # NOT a current slice — would exist only if the signed-url flow became genuinely shared
├── shared/                   # cross-cutting transport and infra helpers only (planned with Billing: `shared/cache/bff-cache.port.ts`, the async `BffCache` port, with `in-memory-bff-cache.ts` over `ttl-cache.ts` as its in-process adapter, behind the backend clients' opt-in `cache` option in `shared/http/backend-read-cache.ts`)
├── config/
├── health/
├── test/
├── main.ts
├── tracing.ts
└── app.module.ts
```

### BFF root-level exceptions

- `features/` is the primary business-owning tree.
- `shared/` is for reusable transport, guards, interceptors, and observability code only.
- `config/` and `health/` remain root-level app concerns.
- `main.ts` and `app.module.ts` remain at the root.

### BFF placement rules

- `schedule`, `services`, and booking-related attachment flows belong inside `features/booking/`.
- `platform/hotsite` belongs inside `features/platform/`, not a standalone hotsite domain.
- Public and authenticated endpoints for the same capability stay together unless auth boundaries require a hard split.
- Controllers sit at the feature slice's root (`<domain>.controller.ts`, `<domain>.public.controller.ts`); the BFF has no `presentation/application/infrastructure` subfolders (`docs/BFF_ARCHITECTURE.md` § Module & Controller Naming Conventions).
- Response shaping and repeated mapping belong in the slice's `<domain>.mapper.ts` (plain functions).

---

## Web target structure

The web app is route-driven at the top, but feature-owned underneath. Dashboard and hotsite are shell slices, not business domains.

```text
apps/web/
├── app/                     # Next.js routes and layouts only
│   ├── [slug]/
│   ├── dashboard/
│   ├── auth/
│   ├── bookings/            # guest info-submission page (bookings/[id]/submit-info)
│   ├── select-staff-tenant/
│   ├── switch-tenant/
│   ├── v1/[...path]/        # same-origin gateway to the BFF (see docs/BFF_ARCHITECTURE)
│   └── api/
├── proxy.ts                 # route protection (Next.js 16 proxy, formerly middleware)
├── features/
│   ├── auth/
│   ├── billing/              # planned: the manager billing page, banner, locked-feature UI
│   ├── booking/
│   ├── customer/
│   ├── loyalty/
│   ├── platform/
│   │   └── hotsite/
│   └── staff/
├── shells/
│   ├── dashboard/
│   └── hotsite/
├── shared/
│   ├── components/
│   │   └── ui/
│   ├── lib/                 # illustrative: `ls apps/web/shared/lib` is authoritative
│   │   ├── address/ api/ auth/ eslint/ formatting/ health/
│   │   └── i18n/ preferences/ runtime-env/ upload/
│   └── utils/
├── providers/
├── i18n/
└── e2e/
```

### Web root-level exceptions

- `app/` remains the routing and layout surface.
- `features/` is the business-owning tree for billing (planned), booking, customer, loyalty, platform, staff, and auth (`uploads` is not a current slice — see the BFF tree above for the condition under which it would become one).
- `shells/` owns route-composition only.
- `shared/` is for cross-surface primitives and helpers only.
- `providers/` stays root-level because it is app-wide composition.
- `i18n/request.ts` remains a thin Next Intl request entrypoint.
- `e2e/` remains at the root for Playwright specs and helpers.

### Web placement rules

- Domain-owned code lives under `features/<domain>/`.
- Feature-local transport helpers: `customer` and `loyalty` use flat `api.ts` (client-safe) and `api.server.ts` (server-only) at the feature root, and `auth` only a flat `api.ts`; `booking` and `staff` use an `api/` folder with `<resource>.ts` / `<resource>.server.ts` files; `platform` has both the flat files and an `api/` folder. Follow the convention of the feature you are editing.
- Feature-local non-transport shared logic belongs in sibling folders such as `model/`, `hooks/`, `components/`, or `utils/`, depending on the concern.
- Which UI layer a new piece belongs to (primitive, composed pattern, feature component, shell, page), what each may import and what ESLint enforces: `docs/ENGINEERING_RULES_FRONTEND.md` § UI layer model.
- A large screen area under `components/` is grouped by flow, not left flat: `features/booking/components/dashboard/bookings/` holds `mark-complete/`, `reschedule/`, `recurring/`, `detail/`, `sheets/`, `queue/` and `new-booking/`, each component beside its spec. A `hooks/` or `model/` file does not import from a `components/` directory (`shared/components/ui/**` excepted); a type both sides share lives in `model/` (e.g. `model/booking-detail-state.ts`, `model/booking-submission-status.ts`), and a value a component owns, such as the dashboard topbar status, is passed into the hook by the component. ESLint's `no-restricted-imports` rule in `apps/web/eslint.config.js` enforces it for `features/*/hooks`, `features/*/model` and `shells/*/model`; it sees static imports, `import type` and `export … from`, not a dynamic `import()`.
- `features/platform/hotsite` owns hotsite page-model logic, manifest shaping, and public fetchers.
- `shells/dashboard` owns authenticated dashboard composition and shell-only presentation.
- `shells/hotsite` owns public route composition only.
- Route files stay thin and delegate reusable logic into the owning feature or shell slice.
- Shared UI primitives live only under `shared/components/ui/`; the one exception is the public hotsite's branded components under `shared/components/hotsite/`: the feedback components read only `--ba-radius`, `--ba-body-font` and `--ba-heading-font`, and the secondary-surface pieces (`BrandedPanel`, `brandedFieldStyle`, `BrandedMutedText`, `brandedSurfaceStyle`) and the form-control atoms (`BrandedInput`, `BrandedTextarea`, `BrandedSelect`) read `--ba-secondary` and its derived `--ba-secondary-text`, `--ba-secondary-accent`, `--ba-secondary-muted` and `--ba-field-border` (`docs/ENGINEERING_RULES_FRONTEND.md` § The `--ba-*` exception).
- Shared transport helpers live under `shared/lib/`.
- Shared pure utilities live under `shared/utils/`.
- **Actor-scoped view of another domain's aggregate** (e.g. a Customer reading/mutating their own Booking or Loyalty data): the *transport* (fetchers, and hooks that wrap them) and the domain logic live in the *owning* domain's slice (`booking`/`loyalty`), never the actor's own slice (`customer`) — matches the existing Staff-facing pattern. Decided 2026-07-23 per TD31 Story 11, closing a prior undocumented split where Customer-facing Booking/Loyalty transport had drifted into `features/customer/`. See `.copilot/context.md` §11 for the export-naming convention (e.g. `cancelBookingAsCustomer`).
- **Customer-shell pages** (the `my-account` booking list/detail/cancel/reschedule, loyalty) live together in `features/customer/components/my-account/` and import the owning slice's fetchers — they are one surface, the same way `features/booking/components/dashboard/` groups the staff screens. Clarified at M23-S30 discovery: the rule above covers transport and domain logic, and no customer-shell page has ever lived in the owning slice's `components/`.

---

## Guard placement

- **`src/shared/guards/`** - guards used across multiple contexts: the role guards that enforce the `X-Actor-Role` header contract (`CustomerRoleGuard`, `ManagerRoleGuard`, `StaffOrManagerRoleGuard`, `AnyAuthenticatedRoleGuard`) the service-to-service guards (`InternalApiGuard`, `PubSubPushGuard`) and `PlatformAdminGuard` (`platform-admin.guard.ts`, moved here from the Platform context by M25-S15a because Billing's operator routes also use it). Every guard has its own `.spec.ts`.
- **`src/contexts/<context>/infrastructure/guards/`** - guards with domain-specific logic tied to one context (none exists today since `PlatformAdminGuard` moved to `src/shared/guards/`; a guard that injects a repository of one context, for example, would stay local). These stay local.
- Never import a guard from another context's `infrastructure/guards/` path - that is a context-isolation violation.

---

## Test helpers location

```text
apps/backend/src/test/
├── infrastructure/   # InMemory doubles: InMemoryEventBus, InMemoryTransactionManager,
│                     # InMemoryXxxRepository, InMemoryXxxPort, InMemoryStorageService
├── utils/            # create{Booking,Customer,Loyalty,Notification,Platform}IntegrationApp(),
│                     # waitFor() (wait-for.ts), date-helpers.ts, address-helpers.ts,
│                     # actor-headers.ts, fake-config.ts, test-config-module.ts,
│                     # test-cache-module.ts, business-hours-fixtures.ts,
│                     # seed-resource-occupancy.ts / occupancy-seed.ts, future-commitment-*
│                     # fixtures, booking-lock-race-world.ts, chatbot-test-helpers.ts
├── builders/         # per-context builder classes (mandatory for entity/aggregate tests):
│                     # booking, customer, loyalty, notification, platform, staff, and
│                     # shared/ (inbox-record and outbox-event entity builders)
├── factories/        # real-outbox-publisher.factory.ts, request-context.factory.ts
└── repositories/     # test-only repository helpers
```

Also at the root of `apps/backend/src/test/`: `test-datasource.ts`, `integration-global-setup.ts`, `integration-global-teardown.ts` and `integration-run-guard.ts`.

`apps/bff/src/test/` holds the BFF equivalents: `backend-http.mock.ts`, `component-test.helpers.ts`, `execution-context.factory.ts` and `builders/` (`current-user-payload`, `hotsite-service`).

`integration-global-setup.ts` — explicit import lists for all migrations and TypeORM entities. Every new migration + entity must be registered here in the same commit.

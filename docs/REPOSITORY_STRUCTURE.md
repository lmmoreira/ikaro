# Ikaro — Repository Structure

> **When to load:** creating files in unfamiliar locations, answering architecture questions, or setting up a new context module.

---

## Monorepo (pnpm workspaces)

```text
.
├── apps/
│   ├── backend/          # NestJS modular monolith
│   │   └── src/contexts/ # booking/ customer/ staff/ loyalty/ notification/ platform/
│   ├── bff/              # NestJS BFF (feature slices under src/features/)
│   └── web/              # Next.js 16 (domain features + shell slices + shared/)
├── packages/
│   ├── types/            # shared TypeScript types / DTOs
│   ├── config/           # shared ESLint, tsconfig, Prettier configs
│   ├── observability/    # shared BaseAppLogger (backend + bff each subclass it)
│   └── env-validation/   # shared validateEnvWithSchema() (backend + bff env.validation.ts)
├── infrastructure/
│   └── terraform/        # planned, not yet created — GCP resources (Cloud Run, Cloud SQL, Pub/Sub, Secret Manager)
├── .github/workflows/    # CI/CD pipeline YAML files
├── docker/               # Dockerfiles + docker-compose.yml (local dev)
├── .copilot/context.md   # canonical agent context (symlinked as claude.md, CLAUDE.md, gemini.md)
└── docs/                 # source of truth documentation (see CLAUDE.md §10)
```

---

## Backend target structure

Backend is already in the canonical shape and should stay close to this layout:

```text
apps/backend/src/
├── config/
├── contexts/
│   ├── booking/
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   ├── customer/
│   ├── loyalty/
│   ├── notification/
│   ├── platform/
│   └── staff/
├── health/
├── shared/
└── test/
```

### Per-context structure (`apps/backend/src/contexts/<context>/`)

```text
├── domain/           # entities, value objects, events, domain services (no framework deps)
├── application/      # use cases, port interfaces, DTOs
└── infrastructure/   # adapters: TypeORM repos, REST controllers, Pub/Sub publishers, HTTP clients
    └── migrations/   # TypeORM migrations scoped to this context's schema
```

### Shared folder (`apps/backend/src/shared/`)

Cross-cutting concerns ONLY. Domain objects, use cases, and repositories are NEVER here.

```text
apps/backend/src/shared/
├── ports/            # IEventBus, IRepository<T> — no barrel index.ts (ESLint enforced)
├── domain/           # AggregateRoot, DomainEvent, ValueObject base classes — no barrel index.ts
├── value-objects/    # Email, PhoneNumber, Address, HexColor, Timezone, TimeOfDay, Slug
├── utils/            # deepMerge, startOfDayUTC, endOfDayUTC, todayUTC, localDateTimeToUTCIso,
│                     # utcDateToLocalDate, utcDateToLocalHHMM, getUtcWeekDayName
├── request/          # RequestContext (request-scoped), RequestInterceptor
├── observability/    # Logger, OTel tracer, structured log helpers
├── http/             # Pagination DTOs, RFC 9457 ProblemDetail base type
├── guards/           # role guards used by more than one context
├── infrastructure/   # transaction manager, typeorm helpers, cross-cutting adapters
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
│   ├── booking/              # domain slice: bookings, schedule, services, attachments
│   ├── customer/             # domain slice
│   ├── loyalty/              # domain slice
│   ├── platform/             # domain slice: hotsite, tenant settings, manifest
│   ├── staff/                # domain slice
│   └── uploads/              # technical slice only if the signed-url flow is genuinely shared
├── shared/                   # cross-cutting transport and infra helpers only
├── config/
├── health/
├── main.ts
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
- Controllers belong in the feature slice's presentation layer.
- Response shaping and repeated mapping belong in slice-local application helpers or mappers.

---

## Web target structure

The web app is route-driven at the top, but feature-owned underneath. Dashboard and hotsite are shell slices, not business domains.

```text
apps/web/
├── app/                     # Next.js routes and layouts only
│   ├── [slug]/
│   ├── dashboard/
│   ├── auth/
│   ├── select-staff-tenant/
│   ├── switch-tenant/
│   └── api/
├── features/
│   ├── auth/
│   ├── booking/
│   ├── customer/
│   ├── loyalty/
│   ├── platform/
│   │   └── hotsite/
│   ├── staff/
│   └── uploads/
├── shells/
│   ├── dashboard/
│   └── hotsite/
├── shared/
│   ├── components/
│   │   └── ui/
│   ├── lib/
│   │   ├── api/
│   │   ├── formatting/
│   │   └── i18n/
│   └── utils/
├── providers/
├── i18n/
└── e2e/
```

### Web root-level exceptions

- `app/` remains the routing and layout surface.
- `features/` is the business-owning tree for booking, customer, loyalty, platform, staff, auth, and uploads.
- `shells/` owns route-composition only.
- `shared/` is for cross-surface primitives and helpers only.
- `providers/` stays root-level because it is app-wide composition.
- `i18n/request.ts` remains a thin Next Intl request entrypoint.
- `e2e/` remains at the root for Playwright specs and helpers.

### Web placement rules

- Domain-owned code lives under `features/<domain>/`.
- Feature-local transport helpers use a normalized API folder: `features/<domain>/api/<resource>.ts` for client-safe code and `features/<domain>/api/<resource>.server.ts` for server-only code.
- Feature-local non-transport shared logic belongs in sibling folders such as `model/`, `hooks/`, `components/`, or `utils/`, depending on the concern.
- `features/platform/hotsite` owns hotsite page-model logic, manifest shaping, and public fetchers.
- `shells/dashboard` owns authenticated dashboard composition and shell-only presentation.
- `shells/hotsite` owns public route composition only.
- Route files stay thin and delegate reusable logic into the owning feature or shell slice.
- Shared UI primitives live only under `shared/components/ui/`.
- Shared transport helpers live under `shared/lib/`.
- Shared pure utilities live under `shared/utils/`.

---

## Guard placement

- **`src/shared/guards/`** - role guards that enforce the `X-Actor-Role` header contract across multiple contexts (`CustomerRoleGuard`, `ManagerRoleGuard`, `StaffOrManagerRoleGuard`). Every guard has its own `.spec.ts`.
- **`src/contexts/<context>/infrastructure/guards/`** - guards with domain-specific logic tied to one context (e.g. `PlatformAdminGuard` which injects `ConfigService`). These stay local.
- Never import a guard from another context's `infrastructure/guards/` path - that is a context-isolation violation.

---

## Test helpers location

```text
apps/backend/src/test/
├── infrastructure/   # InMemory doubles: InMemoryEventBus, InMemoryTransactionManager,
│                     # InMemoryXxxRepository, InMemoryXxxPort, InMemoryStorageService
├── utils/            # createBookingIntegrationApp(), createNotificationIntegrationApp(),
│                     # createLoyaltyIntegrationApp(), waitFor(), date-helpers.ts,
│                     # address-helpers.ts
├── builders/         # per-context builder classes (mandatory for entity/aggregate tests)
├── factories/        # test data factories
└── repositories/     # test-only repository helpers
```

`integration-global-setup.ts` — explicit import lists for all migrations and TypeORM entities. Every new migration + entity must be registered here in the same commit.

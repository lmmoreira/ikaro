# Ikaro — Repository Structure

> **When to load:** creating files in unfamiliar locations, answering architecture questions, or setting up a new context module.

---

## Monorepo (pnpm workspaces)

```
.
├── apps/
│   ├── backend/          # NestJS modular monolith
│   │   └── src/contexts/ # booking/ customer/ staff/ loyalty/ notification/ platform/
│   ├── bff/              # NestJS BFF (separate service, own container)
│   └── web/              # Next.js 16 (hotsite + dashboard)
├── packages/
│   ├── types/            # shared TypeScript types / DTOs
│   └── config/           # shared ESLint, tsconfig, Prettier configs
├── infrastructure/
│   └── terraform/        # ← planned, not yet created — GCP resources (Cloud Run, Cloud SQL, Pub/Sub, Secret Manager)
├── .github/workflows/    # CI/CD pipeline YAML files
├── docker/               # Dockerfiles + docker-compose.yml (local dev)
├── .copilot/context.md   # canonical agent context (symlinked as claude.md, CLAUDE.md, gemini.md)
└── docs/                 # source of truth documentation (see CLAUDE.md §10)
```

---

## Per-context structure (`apps/backend/src/contexts/<context>/`)

```
├── domain/           # entities, value objects, events, domain services (no framework deps)
├── application/      # use cases, port interfaces, DTOs
└── infrastructure/   # adapters: TypeORM repos, REST controllers, Pub/Sub publishers, HTTP clients
    └── migrations/   # TypeORM migrations scoped to this context's schema
```

---

## Shared folder (`apps/backend/src/shared/`)

Cross-cutting concerns ONLY — domain objects (entities, aggregates, use cases, repositories) are NEVER here.

```
src/shared/
├── ports/            # IEventBus, IRepository<T> — NO barrel index.ts (ESLint enforced)
├── domain/           # AggregateRoot, DomainEvent, ValueObject base classes — NO barrel index.ts
├── value-objects/    # Email, PhoneNumber, Address, HexColor, Timezone, TimeOfDay, Slug
├── utils/            # deepMerge, startOfDayUTC, endOfDayUTC, todayUTC, localDateTimeToUTCIso,
│                     # utcDateToLocalDate, utcDateToLocalHHMM, getUtcWeekDayName
├── tenant/           # TenantContext (request-scoped), TenantInterceptor
├── observability/    # Logger, OTel tracer, structured log helpers
├── http/             # Pagination DTOs, RFC 9457 ProblemDetail base type
├── guards/           # Role guards used by more than one context
└── database/         # data-source.ts, seed.ts
```

**Context isolation rule:** A context module MUST NOT import from another context's path. Only `src/shared/` is importable across contexts.

---

## Guard placement

- **`src/shared/guards/`** — role guards that enforce the `X-Actor-Role` header contract across multiple contexts (`CustomerRoleGuard`, `ManagerRoleGuard`, `StaffOrManagerRoleGuard`). Every guard has its own `.spec.ts`.
- **`src/contexts/<context>/infrastructure/guards/`** — guards with domain-specific logic tied to one context (e.g. `PlatformAdminGuard` which injects `ConfigService`). These stay local.
- Never import a guard from another context's `infrastructure/guards/` path — that is a context-isolation violation.

---

## Test helpers location

```
src/test/
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

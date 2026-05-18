# BeloAuto — Agent Context (canonical)

**Symlinked as:** `claude.md`, `gemini.md`  
**Audience:** Any AI coding agent (Claude Code, Copilot CLI, Cursor, Aider, etc.)  
**Rule:** Read this file first on every conversation. Then use §10 to load only the docs you need.  
**Last updated:** 2026-05-18

---

## 0. Permission Protocol (non-negotiable)

Before writing or editing ANY file (`.md`, `.ts`, `.tf`, `.yml`, configs):

1. **Discuss** the change with the user.
2. **Summarise** what you intend to write.
3. **Ask:** "May I now create/update `<path>`?"
4. **Write only after** an explicit yes.

Exceptions: read-only ops (`Read`, `grep`, `ls`, `git status`, memory files).

---

## 1. Project Facts

| Fact | Value |
|---|---|
| **Product** | BeloAuto |
| **Type** | Multi-tenant SaaS — car-wash booking & loyalty |
| **Market** | Brazil 🇧🇷 |
| **Currency** | BRL (R$) — `Money` value object must carry currency code |
| **Locale** | pt-BR (email templates, UI copy, date/number formats) |
| **Default TZ** | `America/Sao_Paulo` (UTC-3); one timezone per tenant via `settings.business_hours.timezone` |
| **Branch** | `main` · Trunk-Based Development · short-lived `feat/UC-xxx` / `fix/xxx` branches |
| **Commits** | Conventional Commits (`feat(booking):`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`) |
| **Languages** | TypeScript strict mode — backend + frontend |
| **Backend** | NestJS v11 modular monolith |
| **BFF** | Separate NestJS v11 service (`apps/bff/`) |
| **Frontend** | Next.js 16 + React 19 |
| **Monorepo** | pnpm workspaces (`apps/`, `packages/`) |
| **ORM** | TypeORM v0.3+ |
| **DB** | PostgreSQL 15 — single shared schema, `tenant_id` everywhere |
| **DB migrations** | TypeORM migrations; run via **separate CI job** before deploy — app never auto-migrates at startup |
| **Event bus** | GCP Pub/Sub (prod) · GCP Pub/Sub Emulator (local dev docker-compose) · behind `IEventBus` port |
| **Auth** | Google OAuth 2.0 · JWT sessions (`sub` = backend entity UUID, `tenantId`, `tenantSlug`, `role` in payload) · BFF forwards `X-Actor-ID` / `X-Actor-Type` / `X-Actor-Role` headers to backend |
| **Storage** | S3-compatible (GCS/S3) · paths: `tenants/<tenant_id>/bookings/<booking_id>/<file>` |
| **Observability** | Prometheus + Grafana + OpenTelemetry + Loki + OTel Collector |
| **Container** | Docker · GCP Cloud Run (MVP) → Kubernetes if needed |
| **IaC** | Terraform (GCP provider MVP; cloud-agnostic adapters) |
| **Secrets** | GCP Secret Manager (MVP) → HashiCorp Vault if multi-cloud · `PLATFORM_ADMIN_KEY` (min 32 chars) protects `POST /internal/tenants` |
| **Errors** | RFC 9457 Problem Details on all non-2xx responses |
| **Coverage gate** | ≥ 80% on **changed code** (differential, not global) |
| **Rate limiting** | NestJS `@nestjs/throttler` on all public endpoints |
| **Feature flags** | Environment variables (`FEATURE_FLAG_XYZ=true`) — no external system for MVP |

---

## 2. Multi-Tenancy Invariants (NEVER violate)

Any code that breaks these is a defect regardless of test coverage.

1. Every table has `tenant_id UUID NOT NULL`, indexed first in every composite index.
2. Every query filters `WHERE tenant_id = :tenantId`. No exceptions.
3. Every domain event includes `tenantId`, `eventId` (idempotency key), `occurredAt` (ISO-8601 UTC), `correlationId`.
4. Composite FKs use `(tenant_id, id)` to block cross-tenant references at DB level.
5. **Customers are multi-tenant** — same Google `sub` → multiple `Customer` rows (one per tenant). No unique on `google_oauth_id` alone.
6. **Staff are single-tenant** — `UNIQUE(tenant_id, google_oauth_id)` at DB level.
7. File paths prefixed by tenant (see §1 Storage).
8. Logs, metrics, traces include `tenant_id`. OTel span attrs: `tenant.id`, `user.id`, `correlation.id`.
9. Event consumers are idempotent (at-least-once delivery). Dedup via `eventId`.
10. JWT contains `tenantId`/`tenantSlug`. BFF rejects mismatches.
11. JWT `sub` is always the **backend entity UUID** — `staffId` for STAFF/MANAGER, `customerId` for CUSTOMER (never Google's OAuth `sub`). BFF forwards it as `X-Actor-ID`, along with `X-Actor-Type` (`STAFF`|`CUSTOMER`) and `X-Actor-Role` (`STAFF`|`MANAGER`|`CUSTOMER`). Guest requests carry none of the `X-Actor-*` headers. Backend reads these from `TenantContext`.

Raise a doc bug if a UC appears to violate these — do not "make it work."

---

## 3. Bounded Contexts (brief — load `docs/05-BOUNDED_CONTEXTS.md` for detail)

| Context | Type | Aggregates | Publishes |
|---|---|---|---|
| **Booking** | Core | `Booking`, `Service`, `ScheduleClosure` | `BookingRequested/Approved/Rejected/InfoRequested/InfoSubmitted/Completed/Cancelled/Rescheduled` + `BookingReminderDue`, `BookingReminderDueToday`, `AdminDailyScheduleReminder` |
| **Customer** | Supporting | `Customer` (multi-tenant rows) | — |
| **Staff** | Supporting | `Staff` (single-tenant) | — |
| **Loyalty** | Supporting | `LoyaltyEntry` (append-only, earn-only) | `ServicePointsEarned`, `PointsExpiringSoon` |
| **Notification** | Supporting | `NotificationTemplate`, `NotificationLog` | `EmailSent`, `EmailFailed` |
| **Platform** | Foundational | `Tenant`, `HotsiteConfig` | `TenantProvisioned`, `StaffInvited`, `StaffDeactivated` |

**Loyalty MVP rules (strict):** One immutable `LoyaltyEntry` per `BookingLine` completed. Idempotent via `UNIQUE(tenant_id, booking_line_id)`. Active balance = `SUM(points) WHERE expires_at > now()`. No redemption, no tiers, no manual adjustments.

---

## 4. Event Envelope (every event)

```json
{
  "eventId": "uuid-v7",
  "tenantId": "uuid-v7",
  "occurredAt": "2026-05-11T14:23:45.123Z",
  "correlationId": "uuid-v7",
  "eventName": "BookingCompleted",
  "eventVersion": 1,
  "data": { }
}
```

For full payload definitions → `docs/03-DOMAIN_EVENTS.md`

---

## 5. Booking State Machine

```
PENDING        → INFO_REQUESTED | APPROVED | REJECTED | CANCELLED
INFO_REQUESTED → PENDING (customer responded) | APPROVED | REJECTED | CANCELLED
APPROVED       → COMPLETED | CANCELLED
COMPLETED      (terminal)
REJECTED       (terminal)
CANCELLED      (terminal)
```

`NO_SHOW` is **not** in MVP. UC-014 and UC-015 are **superseded** by UC-021/UC-022 — do not implement.

---

## 6. Use Cases Index (load `docs/04-USE_CASES.md` for detail)

| UC | Title | Status |
|---|---|---|
| UC-001 | Guest requests booking | Active |
| UC-002 | Authenticated customer requests booking | Active |
| UC-003 | Admin approves booking | Active |
| UC-004 | Admin rejects booking | Active |
| UC-005 | Admin requests more info | Active |
| UC-006 | Customer views & manages bookings | Active |
| UC-007 | Customer cancels booking (48 h window from `settings`) | Active |
| UC-008 | Admin cancels / reschedules booking | Active |
| UC-009 | Admin marks booking complete + after-photos | Active |
| UC-010 | Admin closes schedule | Active |
| UC-011 | Guest views calendar availability | Active |
| UC-012 | Admin creates service | Active |
| UC-013 | Admin edits / deactivates service | Active |
| UC-014 | Customer login | **SUPERSEDED by UC-021** |
| UC-015 | Staff login | **SUPERSEDED by UC-022** |
| UC-016 | View customer loyalty metrics | Active |
| UC-017 | Booking analytics | Future — out of MVP |
| UC-018 | Admin daily schedule reminder (6 AM) | Active |
| UC-019 | Customer reminder day-before (6 AM) | Active |
| UC-020 | Customer reminder day-of (6 AM) | Active |
| UC-021 | Customer login + tenant selection | Active (canonical) |
| UC-022 | Staff login — single tenant | Active (canonical) |
| UC-023 | Customer switches tenant | Active |
| UC-024 | Developer provisions new tenant (CLI) | Active |
| UC-025 | Admin first login / accepts invite | Active |
| UC-026 | Admin edits tenant settings | Active |
| UC-027 | Admin manages hotsite content | Active |
| UC-028 | Admin invites new staff member | Active |
| UC-029 | Admin deactivates staff member | Active |

**Missing UCs (do not implement until documented):** Customer profile edit, audit log view, notification template management, failed-notification retry.

---

## 7. Engineering Rules

### Hexagonal layers (per context)
```
src/contexts/<context>/
├── domain/           # entities, value objects, domain events, domain services — zero framework deps
├── application/      # use cases, ports (interfaces), DTOs
└── infrastructure/   # adapters: persistence, REST controllers, event publishers, HTTP clients
```
Shared cross-cutting code → `src/shared/` (logger, OTel, `IEventBus` port, tenant-context).

### Shared utilities and value objects (mandatory rules)

**Utility functions used in more than one place MUST live in `src/shared/utils/`** — never duplicated inline.
Examples already there: `deepMerge` (`src/shared/utils/deep-merge.ts`).
When you find a helper (validation, formatting, transformation) repeated across files, extract it immediately.

**Fields that carry their own validation MUST be value objects in `src/shared/value-objects/`**, not plain primitives.
The rule: if a string needs to be validated before it is accepted anywhere in the domain, it is a value object.

| Field | Value Object | File | Why |
|---|---|---|---|
| Email address | `Email` | `email.vo.ts` | format validation (`@`, domain, TLD); normalises to lowercase |
| Phone number | `PhoneNumber` | `phone-number.vo.ts` | Brazilian 10–11 digits (no country code); strips non-digits on `create()`; `format()` → `(XX) XXXXX-XXXX` |
| Physical address | `Address` | `address.ts` | structured fields; `create()` validates CEP length; `reconstitute()` skips validation (for DB reads) |
| Money amount | `Money` | `money.vo.ts` (future) | currency code + decimal precision — never a plain `number` |
| Hex colour | `HexColor` | `hex-color.vo.ts` | must match `#RRGGBB`; normalises to uppercase |
| IANA timezone | `Timezone` | `timezone.vo.ts` | validates against `Intl.supportedValuesOf('timeZone')` |
| HH:MM time | `TimeOfDay` | `time-of-day.vo.ts` | validates HH:MM string; `isBefore()` comparison |
| URL-safe slug | `Slug` | `slug.vo.ts` | `/^[a-z0-9-]+$/`; used for tenant slugs |

These live in `src/shared/value-objects/` and are imported by any context that needs them.
Every value object must have a `.spec.ts` unit test covering valid and invalid inputs.
Never duplicate a `isValidXxx` function — extract it into the shared value object once.

### Value-object-typed aggregate fields (mandatory — Option A)

Aggregate **props interfaces use VO types**, not plain primitives. **Getters return the VO** — not a derived string.

```typescript
// ✅ correct — props typed with VOs; getter returns VO
export interface CustomerProps {
  email: Email;
  phone: PhoneNumber | null;
  defaultAddress: Address | null;
  slug: Slug;           // for aggregates that have slugs
}
get email(): Email { return this.props.email; }
get phone(): PhoneNumber | null { return this.props.phone; }

// ❌ wrong — aggregate typed as string; caller must revalidate
export interface CustomerProps { email: string; }
get email(): string { return this.props.email; }
```

**`create()` factory** receives raw strings from user input / DTOs and constructs VOs:
```typescript
static create(raw: { email: string; phone: string | null }): Customer {
  return new Customer({
    email: Email.create(raw.email),
    phone: raw.phone === null ? null : PhoneNumber.create(raw.phone),
  });
}
```

**Repository mapper pattern — always:**
- `toDomain()` reads DB primitives → constructs VOs: `email: Email.create(entity.email)`
- `toEntity()` extracts primitives from VOs: `entity.email = customer.email.address`
- JSONB columns (e.g. `defaultAddress`) require a double cast + `reconstitute()` to bypass re-validation:
  ```typescript
  // toDomain — JSONB → VO (skip validation; data was valid at write time)
  defaultAddress: entity.defaultAddress
    ? Address.reconstitute(entity.defaultAddress as unknown as AddressProps)
    : null,
  // toEntity — VO → JSONB (extract plain object)
  entity.defaultAddress =
    (customer.defaultAddress?.toJSON() as unknown as Record<string, unknown>) ?? null;
  ```
- VOs with `.value` getter (Slug, PhoneNumber): `entity.slug = tenant.slug.value`
- VOs with named getter (Email): `entity.email = customer.email.address`

In-memory repos must also use `.value` / `.address` when comparing: `if (tenant.slug.value === slug)`.

### Code standards
- `strict: true` TypeScript — no `any`, no `@ts-ignore`, no `// eslint-disable`
- Functions ≤ 20 lines, classes ≤ 200 lines
- Repository signature: `findByTenant(id, tenantId)`, `findAllByTenant(tenantId, filters)`, `save(entity, tenantId)`
- No raw SQL outside repository adapters
- No business logic in controllers — controllers call use cases only
- No direct cross-context calls — data flows through the hierarchy described in "Cross-context data access" below
- DI everywhere — no `new SomeRepository()` in services
- No barrel `index.ts` in `ports/` or `shared/domain/` directories — always import from the specific file (e.g. `./ports/tenant-repository.port`). Test builder barrels (`src/test/builders/`) are the only exception. ESLint `no-restricted-imports` enforces this at CI.
- All configurable values (48 h window, 180 d expiry) read from `tenants.settings`, never hardcoded
- Email templates in pt-BR; Money display as `R$ 1.234,56`
- Domain errors → HTTP status mapping belongs in a `mapXxxError(err: unknown): never` helper in `infrastructure/http/` — never multiple `if (err instanceof X)` chains inside a controller method. The controller method should be one line: `return this.useCase.execute(dto).catch(mapXxxError)`
- Guards that protect a single context's endpoints belong in `src/contexts/<context>/infrastructure/guards/` — only truly cross-cutting guards (used by multiple contexts) go in `src/shared/guards/`
- Every new REST endpoint must have a corresponding request block in `apps/backend/http/<context>/<resource>.http` — include the happy path, all 4xx error cases, and edge cases. Use the existing files as a template.

### Cross-context data access (priority order — follow strictly)

When a use case in Context A needs data owned by Context B, choose the **first** option that applies:

1. **Domain events (preferred — async):** Context B publishes an event; Context A subscribes and projects the data it needs into its own read model. No runtime coupling.
2. **BFF orchestration (preferred — sync read):** The BFF calls both contexts independently and assembles the response. No context knows about the other.
3. **Port + adapter (last resort — sync, same process):** Define an interface (port) in Context A's `application/ports/` (e.g. `ILoyaltyPointsPort`). The infrastructure adapter in Context A implements it by injecting Context B's **service** (never its repository token). Context B must export the service — never the repository.

**None of the above is ever a direct SQL JOIN across schemas inside a repository.** A repository may only query its own context's schema. Cross-schema SQL is the hardest coupling possible — it defeats schema independence, makes migrations risky, and cannot be swapped out via a port.

```typescript
// ❌ never — Customer repo joining loyalty schema
.leftJoin('loyalty.loyalty_entries', 'le', 'le.customer_id = c.id …')

// ✅ option 3 — port in Customer application layer
export const LOYALTY_POINTS_PORT = Symbol('ILoyaltyPointsPort');
export interface ILoyaltyPointsPort {
  getActivePoints(tenantId: string, customerId: string): Promise<number>;
}
// adapter in Customer infrastructure injects LoyaltyService (exported by LoyaltyModule)
```

**Repository responsibility boundary:** a repository returns only what its own aggregate owns. Fields that belong to another context are **not** on the repository return type — they are assembled by the use case via the appropriate port.

### Transactions (multi-aggregate writes)

Any use case that writes to two or more aggregates **must** wrap all writes in `ITransactionManager.run()`:

```typescript
// ✅ atomic — both saves commit or both roll back
await this.txManager.run(async () => {
  await this.tenantRepo.save(tenant);
  await this.hotsiteRepo.save(config);
});

// ❌ partial failure leaves DB inconsistent
await this.tenantRepo.save(tenant);   // succeeds
await this.hotsiteRepo.save(config);  // fails → orphaned tenant row
```

| Artifact | Location | Notes |
|---|---|---|
| Port | `src/shared/ports/transaction-manager.port.ts` | `ITransactionManager { run<T>(work: () => Promise<T>): Promise<T> }` |
| Real adapter | `src/shared/infrastructure/typeorm-transaction-manager.ts` | `DataSource.transaction()` + `AsyncLocalStorage` |
| Global module | `src/shared/infrastructure/transaction-manager.module.ts` | `@Global()` — imported once in `AppModule` |
| Test double | `src/test/infrastructure/in-memory-transaction-manager.ts` | Simply calls `work()` — no real transaction needed for in-memory repos |
| Context propagation | `src/shared/infrastructure/transaction-context.ts` | `runWithEntityManager` / `getActiveEntityManager` via `AsyncLocalStorage` |

**Repository transaction-awareness:** every TypeORM repo write method checks `getActiveEntityManager()` from `transaction-context.ts` — if a transaction is active it uses that `EntityManager`, otherwise falls back to `this.repo`. Read methods (`findById`, `existsBySlug`, etc.) do not need to be transaction-aware.

### Testing

#### Philosophy — three test layers
| Layer | Tool | What it tests | Speed |
|---|---|---|---|
| Unit | Jest (`.spec.ts`) | Domain logic, use case behaviour, mapping | < 1s per file |
| Integration | Jest (`.integration.spec.ts`) + Testcontainers | Adapter behaviour against a real DB | ~30s total (singleton container) |
| E2E | Playwright | Happy paths through the full stack | minutes |

- TDD for domain logic — red-green-refactor
- Every UC: ≥1 unit test, ≥1 integration test, ≥1 tenant-isolation test
- Tenant-isolation test pattern: create data for Tenant A, attempt access as Tenant B → expect 404/403
- E2E (Playwright): happy paths only
- No `.skip()`, `.only()`, `setTimeout` in tests

#### Test Data Builder pattern (mandatory)
Never construct domain objects inline in tests. Use builders in `src/test/builders/<context>/`:

```typescript
// ✅ correct
const tenant = new TenantBuilder().withSlug('lavacar-belo').build();
const config = new HotsiteConfigBuilder().withTenantId(tenant.id).buildWithContent();

// ❌ wrong — couples tests to constructor signature
const tenant = Tenant.create('BeloAuto', 'beloauto', 'America/Sao_Paulo');
```

- One builder class per aggregate / value object / TypeORM entity
- Sensible defaults for every field — tests only set what they care about
- Builders live in `src/test/builders/<context>/index.ts` (barrel export)
- Infrastructure tests (TypeORM entities) have their own **entity builders** in the same folder
- **Every TypeORM entity used in a test MUST have an `XxxEntityBuilder`** — never construct entity objects inline with `makeXxx()` helpers or plain object literals. Inline helpers couple tests to the DB schema and bypass the builder pattern.
- Naming: `CustomerEntityBuilder`, `TenantEntityBuilder`, `StaffEntityBuilder`, etc. — always suffix `EntityBuilder` to distinguish from domain aggregate builders.
- **The `id` field in every `XxxEntityBuilder` MUST default to `uuidv7()`** — never a hardcoded string. Two builder instances sharing a hardcoded default `id` silently upsert over each other; the second `save()` overwrites the first, making row-count and tenant-isolation assertions unreliable.

#### In-memory repository pattern (for use case tests)
Each port has two implementations: the real TypeORM adapter and a test double:

```
ITenantRepository (port)
├── TypeOrmTenantRepository  ← real adapter, tested by integration tests
└── InMemoryTenantRepository ← test double, used by use case unit tests
```

In-memory repos live in `src/test/repositories/<context>/`. Use them in use case unit tests so no DB is needed:

```typescript
const tenantRepo = new InMemoryTenantRepository();
const useCase = new ProvisionTenantUseCase(tenantRepo, ...);
await useCase.execute({ slug: 'lavacar-belo' });
expect(await tenantRepo.findBySlug('lavacar-belo')).not.toBeNull();
```

**Do NOT delete TypeORM adapter unit tests** — they provide coverage that SonarCloud requires (integration test coverage is not merged into the lcov report).

**SonarCloud only ingests lcov from unit tests** (`--selectProjects unit`). Integration tests give you DB-level confidence but are invisible to the coverage gate. Every new controller and use case must have a `.spec.ts` unit test to satisfy the ≥ 80% new-code threshold — integration tests alone are not sufficient.

#### In-memory infrastructure test doubles

Every shared port that produces side effects has an in-memory double in `src/test/infrastructure/`. **Always prefer these over `jest.fn()` mocks** — they capture state, make assertions more readable, and never leak between tests.

**Controller unit tests** should wire the real use case with an `InMemoryXxxRepository` rather than mocking the use case with `jest.fn()`. This tests the actual controller→use-case→repo slice at unit-test speed, without a DB.

```typescript
// ✅ preferred — real use case, in-memory repo
beforeEach(() => {
  const repo = new InMemoryCustomerRepository();
  controller = new InternalCustomerController(new GetCustomerTenantsUseCase(repo));
});

// ❌ avoid — jest.fn() on the use case hides real behaviour
const useCase = { execute: jest.fn() } as unknown as GetCustomerTenantsUseCase;
```

Exception: when a dependency has no in-memory double (e.g. `BackendHttpService` in BFF controllers), `jest.fn()` is the correct approach.

| Port | In-memory double | Key feature |
|---|---|---|
| `IEventBus` | `InMemoryEventBus` | `published: DomainEvent[]` — assert on `.published` array |
| `ITransactionManager` | `InMemoryTransactionManager` | Simply calls `work()` — no real transaction, in-memory repos don't need one |

```typescript
// ✅ preferred
const eventBus = new InMemoryEventBus();
await useCase.execute(dto);
expect(eventBus.published[0].eventName).toBe('TenantProvisioned');

// ❌ avoid — jest.fn() gives no state to assert on
const eventBus = { publish: jest.fn() };
```

#### Integration test rules
- **Singleton Testcontainers** — one PostgreSQL container per `jest --selectProjects integration` run, started in `src/test/integration-global-setup.ts` via Jest `globalSetup`. Never create a container inside a test file.
- **Story-based tests** — each `it()` tells a meaningful sequence of domain operations (create → update → verify → assert isolation). Avoid narrow method-verification tests ("does `save()` call `repo.save()`?").
- **File-local slug prefixes** — since all integration files share one DB, each file uses unique slugs to avoid UNIQUE constraint conflicts when tests run in parallel.
- Each integration spec calls `createTestDataSource()` in `beforeAll` and `dataSource.destroy()` in `afterAll`.

### CI gates (block merge)
- ESLint + Prettier — zero warnings
- `tsc --noEmit` — zero errors
- All tests pass — 100%
- Coverage ≥ 80% on changed code
- SonarCloud Quality Gate GREEN
- Snyk SCA — zero high/critical vulns
- Gitleaks — zero secrets detected
- Trivy image scan — zero high/critical
- Checkov/Tfsec IaC scan — zero high

### Definition of Done
- [ ] Matches cited UC's main + alt flows
- [ ] Unit + integration + tenant-isolation tests pass
- [ ] Coverage delta ≥ 80% on changed code
- [ ] All queries filter by `tenant_id`
- [ ] All events use standard envelope with `tenantId`, `eventId`, `correlationId`
- [ ] No hardcoded config values — read from `tenants.settings`
- [ ] No secrets in code
- [ ] Migration is backward-compatible (expand/contract)
- [ ] CI passes locally: `pnpm lint`, `pnpm test`, `pnpm type-check`
- [ ] API change reflected in `docs/14-API_CONTRACTS.md` (with permission)
- [ ] Conventional Commit + PR description links the UC

---

## 8. Anti-Patterns (BLOCK MERGE)

| Pattern | Problem | Fix |
|---|---|---|
| `WHERE id = ?` without `tenant_id` | Cross-tenant data leak | Add `AND tenant_id = ?` |
| Event missing `tenantId` in envelope | Can't isolate per tenant | Include in every event |
| Hardcoded `48`, `180`, `7` for business rules | Breaks per-tenant config | Read from `tenants.settings` |
| `@ts-ignore`, `any`, `eslint-disable` | Defeats static analysis | Fix the type/lint error |
| `.skip()` / `.only()` in tests | Hides failures in CI | Remove before commit |
| Synchronous call from Loyalty → Booking | Tight coupling | Subscribe to `BookingCompleted` event |
| `new XRepository()` inside a service | Untestable | Inject via DI |
| Same template body for all tenants | Breaks branding | Templates are per-tenant aggregates |
| Photo stored at `bookings/<id>/` without tenant prefix | No isolation | Path: `tenants/<tid>/bookings/<bid>/<file>` |
| Logging without `tenant_id` | Can't slice per-tenant | Add to structured log context |
| Running migrations at app startup | Unsafe for rolling deploys | Run as separate CI job before deploy |
| English copy in email templates | Wrong locale | All customer-facing text in pt-BR |
| Money as plain `number` | Loses currency | Use `Money { amount: Decimal, currency: 'BRL' }` |
| Import from `src/contexts/<B>/` inside Context A | Breaks context isolation | Only import from `src/shared/` or own context |
| SQL JOIN into another context's schema inside a repository (e.g. Customer repo joining `loyalty.*` or `platform.*`) | Hardest possible coupling — defeats schema independence, makes migrations risky, bypasses ports entirely | Repository queries its own schema only; cross-context data assembled by the use case via events, BFF, or a port+adapter (see §7 "Cross-context data access") |
| Cross-schema DB FK between contexts | Tight schema coupling | Store UUID only; no FK constraint across schemas |
| Event consumer querying another context to fill missing data | Defeats self-contained events | Add the needed data to the event payload |
| Placing a domain entity or use case in `src/shared/` | Blurs context ownership | Only ports, base classes, and multi-context VOs in shared |
| Exporting repository tokens from a `*.module.ts` (e.g. `exports: [TENANT_REPOSITORY]`) | Makes the repo injectable by any importing module — a direct BC isolation violation | Never export repository tokens; cross-context data goes through BFF orchestration, self-contained events, or a shared read-only port in `src/shared/ports/` |
| Writing to two or more aggregates without `ITransactionManager.run()` | Partial DB failure leaves inconsistent state (orphaned rows) — compensating deletes are not atomic | Wrap all writes in `txManager.run(async () => { ... })` |
| Using `jest.fn()` to stub `IEventBus` or `ITransactionManager` | Misses state assertions; mock expectations are brittle | Use `InMemoryEventBus` / `InMemoryTransactionManager` from `src/test/infrastructure/` |
| Multiple `if (err instanceof X)` chains inside a controller method | Noisy, hard to read, inflates cognitive complexity | Extract into a `mapXxxError(err: unknown): never` helper in `infrastructure/http/` |
| Placing a context-specific guard in `src/shared/guards/` | Implies the guard is cross-cutting when it isn't — misleads future agents | Guards protecting a single context live in `src/contexts/<context>/infrastructure/guards/` |
| Barrel `index.ts` in `ports/` or `shared/domain/` directories | Hides which symbols come from where; grows into circular dependency risk as the codebase scales | Import directly from the specific file; blocked by `no-restricted-imports` ESLint rule (regex on import path ending) |
| Single `DATABASE_URL` connection string for TypeORM | `pg` parses credentials out of the URL — passwords with special characters (`@`, `:`, `/`) break silently; production passwords from GCP Secret Manager use arbitrary chars | Use five explicit vars: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — always plain strings, no URL encoding |
| `TypeOrmModule.forRoot({ … process.env['X'] … })` | Module decorator evaluated at import time, before dotenv runs — `process.env['X']` is always `undefined` | Use `TypeOrmModule.forRootAsync({ useFactory: () => ({ … }) })` — factory runs during DI build, after dotenv |
| `{{$env varName}}` in `.http` REST Client files | `$env` reads OS-level env vars — REST Client environment values (e.g. `backendUrl`) live in `.vscode/settings.json`, not the OS env; resolves to empty string → "connection refused" even when server is running | Use `{{varName}}` for REST Client env vars; use `{{$dotenv VAR}}` only for `.env` secrets |
| Duplicating a validation function (`isValidEmail`, `isValidTimezone`, etc.) across files | Validation drift — two copies diverge silently; bug fixed in one place, missed in another | Extract into a shared value object (`Email`, `Timezone`, etc.) in `src/shared/value-objects/` with a single `.spec.ts` |
| Storing email, phone, address, money, colour as a plain `string` / `number` | Primitives carry no validation — invalid values reach the domain silently | Wrap in a value object (`Email`, `PhoneNumber`, `Address`, `Money`, `HexColor`) that validates on construction |
| Duplicating a utility function (deep merge, formatting, etc.) across use cases or contexts | Two copies diverge; the second author doesn't know the first exists | Extract into `src/shared/utils/` with a unit test; all callers import from the same place |
| Aggregate field typed as `string` when a shared VO exists for it (e.g. `email: string`, `slug: string`) | The type system lies — invalid values can be stored in props; callers must re-validate | Type aggregate props with the VO (`email: Email`, `slug: Slug`); getters return the VO (not `.address` or `.value`) |
| `makeEntity()` helper or plain object literal used in a test instead of `XxxEntityBuilder` | Couples the test directly to the TypeORM entity's constructor signature; bypasses the builder pattern | Create an `XxxEntityBuilder` (e.g. `CustomerEntityBuilder`) with sensible defaults in `src/test/builders/<context>/` |
| Seed file calling `CREATE TABLE`, `CREATE SCHEMA`, or `DROP TABLE` | Drift from migrations — seeds and migrations diverge, leading to silent column/constraint mismatches | Seeds are data-only; schema is 100% owned by TypeORM migrations. If `ensureSchemas()` or DDL appears in seed, delete it |
| `XxxEntityBuilder` with a hardcoded default `id` (e.g. `private id = '00000000-...'`) | Two builder instances in the same test share the same primary key; second `save()` silently upserts over the first — row-count and tenant-isolation assertions produce false positives | Default `id` to `uuidv7()` in every `XxxEntityBuilder` constructor: `private id = uuidv7()` |
| Controller directly injecting a repository token | Bypasses the use-case layer — domain errors are never thrown, HTTP→error mapping is skipped, persistence is coupled to the HTTP layer | Controllers inject use cases only. The use case throws domain errors; the controller maps them via `mapXxxError` |
| `jest.fn()` mock for a use case in a controller unit test | Hides real behaviour; only verifies delegation, not the controller→use-case→repo slice | Wire the real use case with `InMemoryXxxRepository` — same test speed, tests the actual integrated slice |
| Exporting constants or helpers from `main.ts` | `import { X } from '../main'` triggers the bootstrap function, which calls `validateEnv()` / `process.exit(1)` in test environments | Move shared constants to a dedicated module file (e.g. `auth/cookie-options.ts`); `main.ts` may re-export them |
| Inline `schema.safeParse(body)` inside a controller method | Inconsistent with the `ZodValidationPipe` + DTO pattern used everywhere else; inflates the controller method; loses the typed `@Body()` parameter | Define schema + `z.infer<>` type in `application/dtos/`; apply `@UsePipes(new ZodValidationPipe(schema))` on the method; type `@Body() dto: DtoType` |
| `z.string().uuid()` / `z.string().url()` | Deprecated in Zod v4 (SonarCloud S1874). Zod v4's `z.uuid()` is also stricter — it enforces RFC 4122 version/variant bits, so test values like `'00000000-0000-0000-0000-000000000001'` fail (segment-3 must start with `[1-8]`) | Use `z.uuid()` and `z.url()` directly; use RFC 4122-compliant test UUIDs: `'10000000-0000-4000-8000-000000000001'` |
| Declaring a dynamic route (`@Get(':id')`) before a static route (`@Get('by-slug/:slug')`) in the same NestJS controller | NestJS resolves routes in declaration order — the dynamic route matches all requests before the static route is ever reached | Always declare static/prefix routes first, then parameterized ones |

---

## 9. Story Implementation Workflow (mandatory — every story, no exceptions)

Every story follows this sequence. Skipping steps — especially branch creation — is a defect in agent behaviour.

### Step 1 — Create feature branch (BEFORE writing any code)
```bash
git checkout -b feat/M0X-SYY-<short-description>
# e.g. feat/M02-S01-platform-domain
```
Never write code on `main`. If you are already on `main` with uncommitted changes, stash first.

### Step 2 — Implement the story
Write all files defined in the story spec. See §0 for permission rules (code files = autonomous once story is approved; `.md` / architecture docs still require explicit approval).

### Step 3 — Verify locally before committing
```bash
pnpm --filter @beloauto/backend run type-check   # zero errors
pnpm --filter @beloauto/backend run lint          # zero warnings
pnpm --filter @beloauto/backend exec jest --testPathPatterns="<context>" --no-coverage
```

### Step 4 — Commit with Conventional Commit
```bash
git add <specific files — never git add -A or git add .>
git commit -m "feat(<context>): <description> (M0X-SYY)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Step 5 — Push (pre-push hook runs `ci:fast` automatically)
```bash
git push -u origin feat/M0X-SYY-<short-description>
# ci:fast = lint + prettier + type-check + unit tests (~15 s)
```
If `ci:fast` fails the push is blocked. Fix, re-commit, re-push.

### Step 6 — Run `ci:local` (optional — developer decides)
```bash
pnpm ci:local   # ~5 min — Docker must be running (pnpm infra:up)
# lint → type-check → unit tests → integration tests →
# gitleaks → docker build ×3 → trivy ×3
```
This is **not mandatory**. GitHub CI will catch the same issues. Run it when you want early feedback before the PR (e.g. touching Dockerfiles, infra, or integration-test paths). Skip it for pure domain/unit-test changes.

### Step 7 — Self-review the full diff (MANDATORY — before every PR)

Read the complete diff of the branch before opening any PR:
```bash
git diff main...HEAD
```
Go through every changed file and verify **all** of the following:
- [ ] No framework imports (`HttpException`, NestJS decorators) in domain or application layers — only controllers/guards/pipes may use them. Use domain errors instead; the controller maps them to HTTP status codes.
- [ ] Every use case that writes to two or more aggregates wraps all writes in `ITransactionManager.run()` — no compensating deletes.
- [ ] Every new REST endpoint has a corresponding block in `apps/backend/http/<context>/<resource>.http` covering happy path + all error cases.
- [ ] No redundant or duplicated test assertions — each test call to the system under test has a purpose.
- [ ] Every aggregate field that corresponds to a shared value object is typed as that VO (not `string`/`number`). Getters return the VO.
- [ ] Every TypeORM entity used in a test is built via `XxxEntityBuilder` — no inline `makeEntity()` helpers or object literals.
- [ ] Every public method on a controller/service has an explicit return type annotation.
- [ ] `@Global()` modules have a comment explaining why they are global and where they are imported.
- [ ] Any new required env var is documented in `.env.example` AND added to the local `.env` (never committed).
- [ ] No non-null assertions (`!`) or `any` casts in production code; minimised in test code.
- [ ] All SonarCloud-prone patterns addressed: `!`, `as unknown`, `as any`, long functions, cognitive complexity.
- [ ] §8 Anti-Patterns — check the list for anything introduced.
- [ ] Every controller injects use cases only — no repository tokens, `DataSource`, or `EntityManager` directly.
- [ ] `@Body()` validation uses `ZodValidationPipe` + a DTO file — no inline `safeParse()` in controller methods.
- [ ] Ran `/domain-audit <context>` — zero findings in the changed context(s).

**Do not open the PR until every item above is satisfied.** This review is the agent's responsibility, not the user's.

### Step 8 — Open the PR  _(was Step 7)_
```bash
gh pr create \
  --title "feat(<context>): <description> (M0X-SYY)" \
  --body "## Summary
- <bullet>

## Story
M0X-SYY — <title>

## Test plan
- [ ] Unit tests pass
- [ ] Type-check clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)" \
  --repo lmmoreira/beloauto
```

### Step 9 — Monitor CI; self-fix any failure
```bash
gh pr checks <PR-number> --repo lmmoreira/beloauto
# On failure:
gh run view <run-id> --repo lmmoreira/beloauto --log-failed
# Fix → commit → push → re-check. Loop until all checks are green.
```

### Step 10 — Ask user before merging (MANDATORY)
Once all CI checks are green, report the result and ask:
> "All checks are green on PR #N. Have you reviewed it and are you happy to merge?"

**Never merge without explicit user confirmation.** Only after they say yes:
```bash
gh pr merge <PR-number> --repo lmmoreira/beloauto --squash --delete-branch
git checkout main && git pull origin main
```

### Step 11 — Mark story done (only after the squash commit is on `main`)
In `plan/M0X-<NAME>.md`:
```
### M0X-SYY — title  →  ### M0X-SYY — title ✅ Done
```
Commit this change to `main` directly (`chore(plan): mark M0X-SYY done`).

### Step 12 — Milestone complete? Create wrap-up docs
If every story in the milestone is now `✅ Done`, see §15 item 16 for the two wrap-up files to create.

---

## 10. Dynamic Context Loading — Load Only What You Need

**Always start with this file.** Then use the table below to load only the docs relevant to your task.

| Task | Docs to load | ~KB |
|---|---|---|
| Quick clarification | This file only | 0 |
| Implement a UC | `docs/04-USE_CASES.md` (that UC's section) + `docs/02-DOMAIN_MODEL.md` (relevant aggregate) + `docs/03-DOMAIN_EVENTS.md` (relevant events) | 4–6 |
| Database / migration | `docs/13-DATABASE_SCHEMA.md` + `docs/02-DOMAIN_MODEL.md` (relevant aggregate) | 4 |
| API endpoint | `docs/14-API_CONTRACTS.md` + the cited UC | 3–5 |
| Event handler | `docs/03-DOMAIN_EVENTS.md` (event) + `docs/05-BOUNDED_CONTEXTS.md` (context) | 3 |
| Hotsite / public frontend | `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` + `docs/14-API_CONTRACTS.md` (tenants section) + `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` (folder structure) | 4 |
| Dashboard / admin frontend | `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` + `docs/14-API_CONTRACTS.md` | 3 |
| BFF implementation | `docs/24-BFF_ARCHITECTURE.md` + `docs/14-API_CONTRACTS.md` | 4 |
| Architecture question | `docs/11-ARCHITECTURE.md` + `docs/05-BOUNDED_CONTEXTS.md` | 5 |
| Multi-tenancy / isolation | `docs/06-TENANT_ISOLATION_STRATEGY.md` | 2 |
| Testing patterns | `docs/08-TESTING_STRATEGY.md` | 3 |
| CI / pipelines | `docs/09-CI_CD_PIPELINE.md` + `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` | 4 |
| Deployment / infra | `docs/12-DEPLOYMENT_STRATEGY.md` + `docs/22-TECH_STACK_DECISIONS.md` | 5 |
| Observability | `docs/10-OBSERVABILITY_STRATEGY.md` | 2 |
| Full feature (UC + API + DB + tests) | All of the above relevant rows | 12–18 |
| Working on M01+ (any backend/BFF/web task) | `plan/M00-MONOREPO-FOUNDATION_IMPLEMENTATION_DETAILS_IA.md` — version gotchas, stubs, CJS/ESM decisions, seed UUIDs, testing setup | 3 |
| Working on M02+ (any task touching CI, Dockerfiles, or deployment) | `plan/M01-CI-QUALITY-GATES_IMPLEMENTATION_DETAILS_IA.md` — workflow job map, Dockerfile gotchas (pnpm deploy, --ignore-scripts, npm removal, .next/.dist copy), Checkov path-filter, local vs CI gate coverage, required GitHub Secrets | 2 |
| Working on M03+ (any task touching Platform context, TenantContext, TypeORM setup, settings, deepMerge, or REST Client HTTP files) | `plan/M02-PLATFORM-CONTEXT_IMPLEMENTATION_DETAILS_IA.md` — DB_* vars, forRootAsync timing, AsyncLocalStorage TenantContext, ManagerRoleGuard stub, deepMerge null/array behaviour, error mapper pattern, test builders | 3 |
| Working on M04+ (any task touching auth, BFF guards, OAuth flow, customer login, JWT, Zod validation, or BFF→backend internal calls) | `plan/M03-AUTHENTICATION_IMPLEMENTATION_DETAILS_IA.md` — Zod v4 UUID format, OAuth state pattern, `passReqToCallback` signature, `JWT_COOKIE_OPTIONS` location, `FindOrCreateCustomer` flow, SonarCloud unit-test-only coverage, EntityBuilder `id` default | 3 |

**Never load:** anything under `docs/archive/` — superseded content.  
**Never load:** `plan/*_DEVELOPER.md` files — written for the human developer, not for agents.

---

## 11. Repository Layout

### Monorepo (pnpm workspaces)
```
.
├── apps/
│   ├── backend/          # NestJS modular monolith
│   │   └── src/contexts/ # booking/ customer/ staff/ loyalty/ notification/ platform/
│   ├── bff/              # NestJS BFF (separate service, own container)
│   └── web/              # Next.js 14 (hotsite + dashboard)
├── packages/
│   ├── types/            # shared TypeScript types / DTOs
│   └── config/           # shared ESLint, tsconfig, Prettier configs
├── infrastructure/
│   └── terraform/        # GCP resources (Cloud Run, Cloud SQL, Pub/Sub, Secret Manager)
├── .github/workflows/    # CI/CD pipeline YAML files
├── docker/               # Dockerfiles + docker-compose.yml (local dev)
├── .copilot/context.md   # THIS FILE
├── claude.md             # → symlink to .copilot/context.md
├── CLAUDE.md             # Claude Code project instructions
└── docs/                 # source of truth documentation (see §10)
```

### Per-context structure (inside `apps/backend/src/contexts/<context>/`)
```
├── domain/           # entities, value objects, events, domain services (no framework)
├── application/      # use cases, port interfaces, DTOs
└── infrastructure/   # adapters: TypeORM repos, REST controllers, Pub/Sub publishers, HTTP clients
    └── migrations/   # TypeORM migrations scoped to this context's schema
```

### Shared folder — cross-cutting concerns ONLY (`apps/backend/src/shared/`)
```
src/shared/
├── ports/            # IEventBus, IEmailSender, IRepository<T>
├── domain/           # AggregateRoot, DomainEvent, ValueObject (base classes)
├── value-objects/    # Money, Address (used by multiple contexts)
├── tenant/           # TenantContext (request-scoped), TenantInterceptor
├── observability/    # Logger, OTel tracer, structured log helpers
└── http/             # Pagination DTOs, RFC 9457 ProblemDetail base type
```

**Rule:** A context module MUST NOT import from another context's path. Only `src/shared/` is importable across contexts. Domain objects (entities, aggregates, use cases, repositories) are NEVER in shared.

---

## 12. Open Decisions (stop and ask before implementing)

Only truly unresolved items remain here:

1. **Multi-location (post-MVP):** Multiple locations per tenant = separate tenants or sub-tenant model?

---

## 13. Doc Contradictions — This File Overrides Until Fixed

| # | Topic | Canonical answer | Fix status |
|---|---|---|---|
| 1 | Event bus | GCP Pub/Sub + emulator locally | ✅ Fixed in docs 05, 11, 18 |
| 2 | DB migrations | Separate CI job (Stage 4.5), never at app startup | ✅ Fixed in doc 09 |
| 3 | Brazil/BRL/pt-BR | Currency BRL, locale pt-BR, America/Sao_Paulo | ✅ Fixed in docs 01, 07, 21 |
| 4 | Coverage threshold | ≥80% on **changed code** | ✅ Fixed in docs 07, 08, 09 |
| 5 | Cancellation window | Read from `tenants.settings.booking.cancellation_window_hours` | ✅ Fixed |
| 6 | Booking status enum | `PENDING/INFO_REQUESTED/APPROVED/REJECTED/COMPLETED/CANCELLED` | ✅ Resolved |
| 7 | Event envelope | Standard 7-field envelope (see §4) | ✅ Resolved |
| 8 | BFF | Separate NestJS service in `apps/bff/` | ✅ Fixed in doc 22 |
| 9 | Monorepo paths | `apps/backend/src/contexts/` canonical | ✅ Fixed in docs 22, 11 |
| 10 | UC-014/UC-015 | Superseded by UC-021/UC-022 | ✅ Noted clearly in doc 04 |
| 11 | Loyalty expiry | Read from `tenants.settings.loyalty.expiry_days` | ✅ Fixed in doc 21 |
| 12 | Platform context | 6th context: `Tenant`, `HotsiteConfig`; UC-024–029 | ✅ Fixed in docs 02, 03, 04, 05 |
| 13 | Component library | **shadcn/ui** (Radix UI + Tailwind) | ✅ Fixed in docs 16, 22 |
| 14 | Email service | **SendGrid** (default adapter); `IEmailSender` port for swappability | ✅ Fixed in docs 05, 10, 22 |
| 15 | Reminder events | `BookingReminderDue` / `BookingReminderDueToday`; cron emits, Notification sends | ✅ Fixed in docs 03, 04, 05 |
| 16 | Loyalty idempotency key | `UNIQUE(tenant_id, booking_line_id)` — not `booking_id` | ✅ Fixed in doc 05 |
| 17 | Reschedule event | `BookingRescheduled` event added; Notification sends email | ✅ Fixed in docs 03, 04, 05, 14 |
| 18 | Error tracking | No Sentry in MVP; Loki + Grafana | ✅ Fixed in docs 10, 18 |

---

## 14. Glossary

| Term | Definition |
|---|---|
| **Tenant** | A car-wash company on the platform. Unit of isolation. |
| **Slug** | URL-safe tenant identifier (e.g. `lavacar-belo`). Globally unique. |
| **BFF** | Backend-for-Frontend — separate NestJS service, sole entry point for the web layer. |
| **Hotsite** | Public unauthenticated tenant-branded marketing + booking page. |
| **Hotsite Manifest** | JSON with branding + module layout served to the frontend per tenant slug. |
| **Port** | Interface owned by the application layer (e.g. `IBookingRepository`). |
| **Adapter** | Infrastructure implementation of a port (e.g. `TypeOrmBookingRepository`). |
| **Tenant Context** | Request-scoped object holding active `tenantId`, injected by `TenantInterceptor`. |
| **Idempotent consumer** | Event handler whose effect is identical whether the message arrives 1 or N times. |
| **Composite FK** | Multi-column FK `(tenant_id, id)` blocking cross-tenant DB references. |
| **Expand/Contract** | Two-phase migration pattern safe for rolling deploys. |

---

## 15. Self-Check Before Submitting

> **BEFORE WRITING ANY CODE:** Create a feature branch first — `git checkout -b feat/M0X-SYY-<description>`. Never code directly on `main`. See §9 for the full workflow.

1. Did I read this file at the start of the conversation? ✓
2. Did I get permission before writing any file? ✓
3. Does every query / event / log include `tenant_id`? ✓
4. Is the change scoped to one UC cited in the PR? ✓
5. Does coverage delta stay ≥ 80% on changed code? ✓
6. Did I follow Conventional Commits? ✓
7. Did I check §13 for overrides before trusting individual docs? ✓
8. For any item in §12 (Open Decisions), did I stop and ask instead of guessing? ✓
9. Are functions ≤ 20 lines, no `any`, no hardcoded config values? ✓
10. Is all customer-facing text in pt-BR, money in BRL? ✓
11. Does the integration test include a tenant-isolation assertion? ✓
12. Did I run `pnpm ci:fast` before pushing? (lint + prettier + type-check + unit tests — auto-runs via pre-push hook if `git config core.hooksPath .githooks` is set) ✓
13. (Optional) Did I run `pnpm ci:local` if the change touches Dockerfiles, infra, or integration-test paths? GitHub CI catches this regardless — skip for pure domain/unit changes. ✓
14. After opening the PR, did I verify all CI checks passed (`gh pr checks <N> --repo lmmoreira/beloauto`)? If any failed — fix, commit, push, re-verify. Once all checks are green, merge: `gh pr merge <N> --repo lmmoreira/beloauto --squash --delete-branch`. Do not report done until the squash commit is on `main`. ✓
15. After merging, did I mark the story as `✅ Done` in `plan/<milestone>.md`? (heading: `### MXX-SYY — title ✅ Done`) ✓
16. Are ALL stories in this milestone now `✅ Done`? If yes — the milestone is complete. Before reporting done, create both wrap-up files:
    - `plan/MXX-<NAME>_IMPLEMENTATION_DETAILS_IA.md` — token-efficient: artifacts table, critical gotchas, version facts, structural decisions, common commands. For AI agents only.
    - `plan/MXX-<NAME>_IMPLEMENTATION_DETAILS_DEVELOPER.md` — detailed: concepts explained with rationale, code examples from the actual codebase. For the human developer only.
    - Add the IA file to §10 of this file (Dynamic Context Loading table) so future agents know to load it. ✓

---

## 17. Project Slash Commands (Claude Code)

Commands live in `.claude/commands/`. Claude Code auto-discovers them — type `/` to see the list. Other agents (Cursor, Copilot, Gemini) don't execute these, but knowing they exist helps them suggest the right workflow.

| Command | File | When to use |
|---|---|---|
| `/domain-audit [context-path]` | `.claude/commands/domain-audit.md` | Before opening a PR — scans for VO violations, missing `XxxEntityBuilder`, seed DDL, duplicated validators, inline `makeXxx()` helpers. Optional arg narrows scope to one context (e.g. `contexts/customer`). |

**Adding new commands:** create `.claude/commands/<name>.md`. Use `$ARGUMENTS` as the placeholder for optional user-typed arguments. Document it in this table.

---

## 16. Changelog

| Date | Change |
|---|---|
| 2026-05-18 | **M03-S06 lessons captured.** §7 Testing: `XxxEntityBuilder.id` must default to `uuidv7()`; SonarCloud only counts unit test lcov; controller unit tests should wire real use case + InMemoryRepo. §8 Anti-patterns: 8 new rows (hardcoded builder `id`, controller injecting repo, use-case mocking with `jest.fn()`, exporting from `main.ts`, inline `safeParse`, `z.string().uuid()/url()` deprecated in Zod v4, static route after dynamic). §9 Step 7: 2 new checklist items. §10: M03 IA doc added. Created `plan/M03-AUTHENTICATION_IMPLEMENTATION_DETAILS_IA.md`. |
| 2026-05-17 | **§17 Slash Commands added; `/domain-audit` skill created.** `.claude/commands/domain-audit.md` scans for VO violations, missing EntityBuilders, seed DDL, duplicated validators. §9 Step 7 checklist and §17 table document the command. Explained per-tool skill conventions (Copilot uses `.github/copilot-instructions.md`; Cursor uses `.cursor/rules/`). |
| 2026-05-17 | **VO-typed aggregate fields, repository mapper pattern, XxxEntityBuilder rule.** §7 expanded with full VO catalog (Email, PhoneNumber, Address, Money, HexColor, Slug, Timezone, TimeOfDay + file paths), Option A VO-getter rule, repository mapper pattern (toDomain/toEntity), JSONB double-cast pattern. §8 anti-patterns: 3 new rows (aggregate typed as string, makeEntity inline, seed DDL). §9 Step 7 checklist: 2 new VO/builder items. |
| 2026-05-15 | **§9 Story Implementation Workflow added.** Explicit branch-first, commit, push, ci:fast, ci:local, PR, CI monitor, squash-merge, mark-done sequence. §15 updated with branch-creation reminder. M00 IA doc §14 mirrors this. |
| 2026-05-12 (wave 3) | **Platform Context added + LGPD removed.** Added Platform Context (UC-024 to UC-029, aggregates, events `StaffInvited`/`StaffDeactivated`) across docs 02, 03, 04, 05. Removed LGPD scope (localization only: BRL, pt-BR). Fixed UC-024/025/026 for Google OAuth-only auth and BRL currency. Added UC-028 (invite staff) and UC-029 (deactivate staff). CLAUDE.md now symlinks to this file. |
| 2026-05-12 (wave 2) | **Doc fixes propagated.** Event bus (05, 11, 18) → GCP Pub/Sub; CI/CD (09) → Stage 4.5 migrations, coverage "changed code"; use cases (04) → cancellation window from settings; docs 01/07 → Brazil/BRL/pt-BR. All agent files (CLAUDE.md, claude.md, gemini.md) symlink to this file. |
| 2026-05-12 (wave 1) | **Full rewrite of this file.** Resolved: event bus → GCP Pub/Sub + emulator; BFF → separate NestJS service; monorepo → pnpm workspaces; DB migrations → separate CI job; feature flags → env vars; rate limiting → NestJS ThrottlerModule. Added: Brazil market, BRL currency, pt-BR locale, LGPD. Archived root-level audit files. Rewrote for dynamic-loading-first structure. |
| 2026-05-11 (pm) | Wave 1: branch `main`, `INFO_REQUESTED` state, 80% coverage on changed code, event envelope, `LoyaltyEntry` model, photo fields plural. |
| 2026-05-11 (am) | First CLI-agnostic rewrite. Added permission protocol, invariants, anti-patterns, self-check. |

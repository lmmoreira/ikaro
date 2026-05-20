# BeloAuto — Agent Context (canonical)

**Symlinked as:** `claude.md`, `gemini.md`  
**Audience:** Any AI coding agent (Claude Code, Copilot CLI, Cursor, Aider, etc.)  
**Rule:** Read this file first on every conversation. Then use §10 to load only the docs you need.  
**Last updated:** 2026-05-20 (post-review refactor)

---

## 0. Permission Protocol (non-negotiable)

Before writing or editing any **documentation or architecture file** (`.md`, `.tf`, `.yml`, configs):

1. **Discuss** the change with the user.
2. **Summarise** what you intend to write.
3. **Ask:** "May I now create/update `<path>`?"
4. **Write only after** an explicit yes.

**Exception — code files within an approved story:** Once a story spec has been discussed and agreed, create all its `.ts` source and test files autonomously without asking per-file. The permission gate applies to `.md` docs, architecture docs, Terraform, and CI/CD config — not to code within an approved implementation.

Exceptions always: read-only ops (`Read`, `grep`, `ls`, `git status`, memory files).

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
| **Staff** | Supporting | `Staff` (single-tenant) | `StaffInvited`, `StaffDeactivated` |
| **Loyalty** | Supporting | `LoyaltyEntry` (append-only, earn-only) | `ServicePointsEarned`, `PointsExpiringSoon` |
| **Notification** | Supporting | `NotificationTemplate`, `NotificationLog` | `EmailSent`, `EmailFailed` |
| **Platform** | Foundational | `Tenant`, `HotsiteConfig` | `TenantProvisioned` |

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

**Fields that carry their own validation MUST be value objects in `src/shared/value-objects/`**, not plain primitives.

| Field | Value Object | File |
|---|---|---|
| Email address | `Email` | `email.vo.ts` |
| Phone number | `PhoneNumber` | `phone-number.vo.ts` |
| Physical address | `Address` | `address.ts` |
| Money amount | `Money` | `money.vo.ts` (future) |
| Hex colour | `HexColor` | `hex-color.vo.ts` |
| IANA timezone | `Timezone` | `timezone.vo.ts` |
| HH:MM time | `TimeOfDay` | `time-of-day.vo.ts` |
| URL-safe slug | `Slug` | `slug.vo.ts` |

Every value object must have a `.spec.ts` unit test covering valid and invalid inputs. Never duplicate a `isValidXxx` function — put it in the VO once.

### Value-object-typed aggregate fields (mandatory — Option A)

Aggregate **props interfaces use VO types**, not plain primitives. **Getters return the VO** — not a derived string. `create()` factory receives raw strings and constructs VOs; `reconstitute()` skips validation for DB reads. JSONB columns require a double cast (`as unknown as XxxProps`).

→ For `create()`/`reconstitute()` code patterns, mapper examples, and in-memory repo comparisons see `docs/VALUE_OBJECTS_REFERENCE.md`.

### Code standards
- `strict: true` TypeScript — no `any`, no `@ts-ignore`, no `// eslint-disable`
- Functions ≤ 20 lines, classes ≤ 200 lines
- Repository signature: `findById(id, tenantId)`, `findAllByTenant(tenantId, filters)`, `save(entity)`
- No raw SQL outside repository adapters
- No business logic in controllers — controllers call use cases only
- No direct cross-context calls — data flows through the hierarchy described in "Cross-context data access" below
- DI everywhere — no `new SomeRepository()` in services
- No barrel `index.ts` in `ports/` or `shared/domain/` directories — always import from the specific file (e.g. `./ports/tenant-repository.port`). Test builder barrels (`src/test/builders/`) are the only exception. ESLint `no-restricted-imports` enforces this at CI.
- All configurable values (48 h window, 180 d expiry) read from `tenants.settings`, never hardcoded
- Email templates in pt-BR; Money display as `R$ 1.234,56`
- Domain errors → HTTP status mapping belongs in a `mapXxxError(err: unknown): never` helper in `infrastructure/http/` — never multiple `if (err instanceof X)` chains inside a controller method. The controller method should be one line: `return this.useCase.execute(dto).catch(mapXxxError)`
- **Use case domain error contract (mandatory):** Before writing any use case, define its failure modes as domain errors in `domain/errors/<context>-domain.error.ts` and register them in `infrastructure/http/<context>-error.mapper.ts`. Use cases throw these domain errors for every non-happy-path condition. They **never** return `null`/`undefined` to signal "not found", never throw `HttpException`, and never return a Result/Either type. The controller's `.catch(mapXxxError)` is the sole HTTP translation point — the controller itself contains zero error-checking logic.
- **Use case result type naming (mandatory):** Every use case `execute()` method must return a named exported type following the pattern `{UseCaseClassName}Result` — defined and exported in the same `.use-case.ts` file. Never use `*Info`, `*Dto`, raw arrays (`T[]`), or any other ad-hoc name. Example: `GetTenantByIdUseCase` → `GetTenantByIdUseCaseResult`; `FindOrCreateCustomerUseCase` → `FindOrCreateCustomerUseCaseResult`.
- **Request DTO naming (mandatory):** Input DTOs for use cases and controllers are named `{Action}Dto` — never `{Action}RequestDto`, `{Action}InputDto`, or any other suffix. The Zod schema is named `{Action}Schema`. When a path param must be combined with a request body (e.g. `staffId` from `@Param` + body fields), pass them as **separate arguments** to the use case (`execute(staffId, dto)`) rather than merging into a composite DTO. One DTO per use case — no split `RequestDto` + merged `Dto` pattern.
- Guards that protect a single context's endpoints belong in `src/contexts/<context>/infrastructure/guards/` — only truly cross-cutting guards (used by multiple contexts) go in `src/shared/guards/`
- **`/internal` routes skip `TenantInterceptor` — `TenantContext` is never populated for them.** The interceptor calls `next.handle()` early for any path starting with `/internal`. Use `/internal` only for auth-flow lookups (OAuth, email, activate) where the caller passes `tenantId` explicitly. Management endpoints that need `tenantId`/`actorId` from context must live on a non-`/internal` path (e.g. `/staff/*`) so `TenantInterceptor` runs normally. Consequence: management controllers that inject `TenantContext` must have their module import `TenantModule` explicitly (`TenantModule` is NOT `@Global()`).
- **Domain error messages are English only.** pt-BR copy in UC specs is frontend UI copy — it never goes in domain error constructors. All existing domain errors (`StaffNotFoundError`, etc.) are English; follow the same pattern.
- **Zod v4 format validators:** use `z.uuid()` and `z.email()` — never `z.string().uuid()` / `z.string().email()`. The chained forms are deprecated in Zod v4 and flagged by SonarCloud as issues.
- **Domain events belong in the publishing context.** Define `StaffInvited`, `StaffDeactivated` etc. in `staff/domain/events/`, not in `platform/`. Duplicate class definitions across contexts cause SonarCloud duplication failures. When moving an event from the wrong context, verify no imports remain before deleting.
- **Aggregate-driven events (mandatory — no exceptions):** Aggregates record domain events via `this.addDomainEvent()` inside their domain methods — including system-initiated factory methods like `inviteFromProvisioning()`. Use cases flush via `aggregate.clearDomainEvents()` **after** `txManager.run()` completes. **Never** construct or publish events directly from a use case — not even when there is no `TenantContext` (pass `correlationId` as a parameter to the factory method instead). The `AggregateRoot` base class provides `addDomainEvent()` and `clearDomainEvents()` — always use them.
- **Thin vs fat events:** if the data needed by subscribers is persistently stored on the entity, the event carries only the ID — subscribers query for the rest. If the data is transient (not stored in the entity, or represents state at a specific point in time that may change before the subscriber runs), it must be in the event payload. Example: `StaffInvited` is thin (`staffId` only) because name/email/invitedBy are now stored on the entity. `TenantProvisioned` is fat because `adminEmail` is not stored on `Tenant`.
- **`correlationId` in domain events must come from `TenantContext.correlationId`**, not from `uuidv7()`. Pass it from the use case into the aggregate method that records the event. For `/internal` routes (no `TenantContext`), generate one `uuidv7()` at the top of the use case and pass it through — never re-generate it per event.
- **Domain error base classes must include `Object.setPrototypeOf(this, new.target.prototype)`** immediately after `super()`. Without it, `instanceof` checks silently fail in compiled TypeScript — error mappers fall through to 500 instead of the correct 4xx. Every `XxxDomainError extends Error` base class needs this line.
- **Controller early-exit guards must use `return Promise.reject(...)` not `throw`** when the controller method signature returns `Promise<T>`. A synchronous `throw` does not become a Promise rejection and bypasses the `.catch(mapXxxError)` chain. Use `return Promise.reject(new HttpException({...}, status))` for all early validation checks in controller methods.
- **Default parameters must come after required parameters** (SonarCloud S1788 MAJOR). Never declare a method/function with a default param followed by a required one: `create(name, slug, timezone = '...', adminEmail)` is invalid — move the default to last position.
- Every new REST endpoint must have a corresponding request block in `apps/backend/http/<context>/<resource>.http` — include the happy path, all 4xx error cases, and edge cases. Use the existing files as a template.

### Cross-context data access (priority order — follow strictly)

When a use case in Context A needs data owned by Context B, choose the **first** option that applies:

1. **Domain events (preferred — async):** Context B publishes an event; Context A subscribes and projects the data it needs into its own read model. No runtime coupling.
2. **BFF orchestration (preferred — sync read):** The BFF calls both contexts independently and assembles the response. No context knows about the other.
3. **Port + adapter (last resort — sync, same process):** Define an interface (port) in Context A's `application/ports/` (e.g. `ILoyaltyPointsPort`). The infrastructure adapter in Context A implements it by injecting Context B's **service** (never its repository token). Context B must export the service — never the repository.

**None of the above is ever a direct SQL JOIN across schemas inside a repository.** A repository may only query its own context's schema. Fields that belong to another context are assembled by the use case via the appropriate port.

### Transactions (every write — no exceptions)

**Every `save()` call in every use case must be wrapped in `ITransactionManager.run()`**, including single-aggregate writes. TypeORM's `save()` is a merge operation (internal SELECT + UPDATE/INSERT); without a transaction those two DB operations are not atomic.

**Scope rule — keep transactions short:** wrap only the `save()` call(s), not the entire use case body. Reads, validations, and domain mutations happen *before* `txManager.run()` opens.

```typescript
// ✅ CORRECT — read/validate outside, only the save inside
const entity = await this.repo.findById(id, tenantId);
if (!entity) throw new NotFoundError(id);
entity.doSomething();
await this.txManager.run(async () => {
  await this.repo.save(entity);
});

// ❌ WRONG — wrapping the entire use case body (long transaction)
return this.txManager.run(async () => {
  const entity = await this.repo.findById(id, tenantId);
  entity.doSomething();
  await this.repo.save(entity);
});

// ❌ WRONG — no transaction at all
entity.doSomething();
await this.repo.save(entity);  // TypeORM merge not atomic
```

**Multi-aggregate writes** (two or more `save()` calls) must wrap all saves together in a single `txManager.run()` to ensure atomicity across aggregates.

**Test wiring (mandatory):** inject `new InMemoryTransactionManager()` as the second constructor argument in every unit spec and controller spec that constructs a write use case directly. For `Test.createTestingModule`, provide `{ provide: TRANSACTION_MANAGER, useValue: new InMemoryTransactionManager() }`. For integration specs that bootstrap a full NestJS module, import `TransactionManagerModule`.

| Artifact | Location |
|---|---|
| Port | `src/shared/ports/transaction-manager.port.ts` |
| Real adapter | `src/shared/infrastructure/typeorm-transaction-manager.ts` |
| Global module | `src/shared/infrastructure/transaction-manager.module.ts` |
| Test double | `src/test/infrastructure/in-memory-transaction-manager.ts` |
| Context propagation | `src/shared/infrastructure/transaction-context.ts` |

**Repository transaction-awareness:** every TypeORM repo write method checks `getActiveEntityManager()` — if a transaction is active it uses that `EntityManager`, otherwise falls back to `this.repo`. Read methods do not need to be transaction-aware.

### Event handlers (Pub/Sub consumers)

Event handlers live in `<context>/infrastructure/events/`. They are **infrastructure**, not application layer.

- **Thin by law:** `handle()` calls exactly one use case and rethrows any error. Zero domain logic inside a handler.
- **Subscribe in `onModuleInit()`** via `eventBus.subscribe(eventName, handler, consumerName)`. `consumerName` determines the Pub/Sub subscription name — must be unique per consumer (e.g. `'staff'`, `'notification'`).
- **Rethrow errors** — Pub/Sub nacks the message and retries. Never swallow errors in `handle()`.
- **Idempotency in the use case** — DB check via `findByXxx`. No in-memory sets (lost on restart, not shared across pods).
- **`correlationId` propagation** — pass `event.correlationId` into the use case DTO; never generate a new UUID in the handler.

**Pub/Sub naming (mandatory — one topic per event type):**

| Thing | Pattern | Example |
|---|---|---|
| Topic | `beloauto-{eventName}` | `beloauto-StaffInvited` |
| Subscription | `beloauto-{eventName}-{consumerName}` | `beloauto-StaffInvited-notification` |

`GcpPubSubEventBusAdapter` (`src/shared/infrastructure/gcp-pubsub-event-bus.adapter.ts`) auto-creates topics and subscriptions on `onApplicationBootstrap()`. Local dev connects to the emulator via `PUBSUB_EMULATOR_HOST=localhost:8085` (set in `.env`, loaded by `validateEnv()` before NestJS boots). Production topics/subscriptions are pre-provisioned by Terraform (M15-S08).

**Test wiring for event handlers:**

| Test type | Event bus | When to use |
|---|---|---|
| Handler unit spec | `InMemoryEventBus` + call `handler.handle(event)` directly | Tests handler → use case logic in isolation |
| Story integration spec | Real `EventBusModule` (no override) + `waitFor()` | Tests full publish → Pub/Sub → handler → DB chain |
| Controller integration spec | Override `EVENT_BUS` with `InMemoryEventBus` | Controller tests HTTP layer — no Pub/Sub needed |

`waitFor()` utility lives at `src/test/utils/wait-for.ts`. Use it in story integration specs to poll for async side effects — this is the approved pattern instead of raw `setTimeout` in tests.

### Testing

Three layers: **Unit** (`.spec.ts`, Jest) · **Integration** (`.integration.spec.ts`, Jest + Testcontainers singleton) · **E2E** (Playwright, happy paths only). Full details → `docs/08-TESTING_STRATEGY.md`.

- TDD for domain logic. Every UC: ≥1 unit + ≥1 integration + ≥1 tenant-isolation test (Tenant A data, Tenant B access → 404/403).
- **Builders mandatory** — `XxxEntityBuilder` in `src/test/builders/<context>/` for every TypeORM entity. `id` defaults to `uuidv7()`. Never construct entities inline.
- **InMemory doubles over `jest.fn()`** — `InMemoryEventBus`, `InMemoryTransactionManager`, `InMemoryXxxRepository` from `src/test/infrastructure/` + `src/test/repositories/`. Controller unit tests wire the real use case with in-memory repos; only use `jest.fn()` when no double exists (e.g. `BackendHttpService` in BFF).
- **SonarCloud ingests lcov from unit tests only** — every new controller and use case needs a `.spec.ts`; integration tests alone don't count toward coverage.
- No `.skip()`, `.only()`, `setTimeout` in tests.
- **Integration test DB isolation (mandatory):** Integration tests share a live DB with no cleanup between tests within the same file. Any `it()` sensitive to aggregate counts (`countActiveManagersByTenant`, `total` in pagination, etc.) **must use a unique tenant UUID** that no other test in the file creates data in. Never reuse suite-level `TENANT_A`/`TENANT_B` constants for count-sensitive assertions — define an inline UUID for that specific test instead.

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

Full list in `docs/ANTI_PATTERNS.md` (checked by `/pre-pr`). Highest-severity patterns — memorise these:

| Pattern | Problem | Fix |
|---|---|---|
| `WHERE id = ?` without `tenant_id` | Cross-tenant data leak | Add `AND tenant_id = ?` |
| Event missing `tenantId` in envelope | Can't isolate per tenant | Include in every event |
| SQL JOIN into another context's schema inside a repository | Hardest coupling — defeats schema independence | Repository queries its own schema only; cross-context via events, BFF, or port+adapter |
| Throwing `HttpException` directly from a use case | Couples app layer to HTTP | Throw domain errors only; `mapXxxError` converts them |
| Using `jest.fn()` to stub `IEventBus` or `ITransactionManager` | Misses state assertions; brittle mocks | Use `InMemoryEventBus` / `InMemoryTransactionManager` from `src/test/infrastructure/` |
| Non-UUID string as path/query param for a PostgreSQL UUID column | `QueryFailedError` → 500 instead of 404 | Add `ParseUUIDPipe`; use RFC 4122-format IDs in tests |
| Integration test `it()` with only supertest `.expect(status)` and no Jest `expect()` | SonarCloud S6957 BLOCKER | Every `it()` needs at least one `expect()` call |
| Reusing `TENANT_A` for count-sensitive integration tests | Later tests see data from earlier tests → wrong count → wrong assertion | Use a dedicated inline UUID for any test that asserts on totals or last-X logic |
| Defining a domain event in the wrong bounded context (e.g. `StaffInvited` in `platform/`) | SonarCloud duplication when the correct context also defines it | Events live in the context that publishes them |
| Using `z.string().uuid()` or `z.string().email()` in Zod schemas | Deprecated in Zod v4 — SonarCloud MINOR issue blocks `ci:fast` | Use `z.uuid()` / `z.email()` |
| `TenantModule` missing from a module that injects `TenantContext` | NestJS DI fails to compile — integration tests crash with `TypeError: Cannot read properties of undefined` | Every module with a controller that injects `TenantContext` must import `TenantModule` |
| Publishing events directly from a use case (`await this.eventBus.publish(new XxxEvent(...))`) | Bypasses aggregate encapsulation; `correlationId` ends up as a fresh `uuidv7()` instead of the request's; use case must know event internals | Record in aggregate via `addDomainEvent()`; flush with `clearDomainEvents()` after `txManager.run()` |
| Missing `Object.setPrototypeOf(this, new.target.prototype)` in domain error base class | `instanceof` checks fail silently in compiled TypeScript — every error mapper falls through to 500 | Add `Object.setPrototypeOf(this, new.target.prototype)` immediately after `super()` in every `XxxDomainError extends Error` base class |
| Business logic inside an event handler (`handle()` creates aggregates, calls repos, publishes events directly) | Handler is infrastructure — mixing logic bypasses the use case layer, skips transaction management, and makes the handler untestable in isolation | Handler calls exactly one use case; all logic lives there |
| Using an in-memory set for Pub/Sub handler idempotency (`private processedEventIds = new Set()`) | Set is cleared on process restart and not shared across pods — duplicate messages get processed after any deploy or scale event | Idempotency via DB check in the use case (`findByXxx`) or the `processed_events` table (M11) |
| Not overriding `EVENT_BUS` with `InMemoryEventBus` in controller integration specs | Controller boots `GcpPubSubEventBusAdapter` which connects to the emulator — gRPC timeouts fail every test if emulator is unreachable | Override `EVENT_BUS` with `new InMemoryEventBus()` in all controller integration specs that don't need end-to-end Pub/Sub routing |

---

## 9. Story Implementation Workflow (mandatory — every story, no exceptions)

Every story follows this sequence. Skipping steps — especially branch creation — is a defect in agent behaviour.

### Step 1 — Create feature branch (BEFORE writing any code)
`git checkout -b feat/M0X-SYY-<short-description>`

Never write code on `main`. If you are already on `main` with uncommitted changes, stash first.

### Step 2 — Implement the story
Write all files defined in the story spec. See §0 for permission rules (code files = autonomous once story is approved; `.md` / architecture docs still require explicit approval).

### Step 3 — Verify locally before committing
Run type-check, lint, and jest for the changed context — zero errors and warnings required.

### Step 4 — Commit with Conventional Commit
Stage specific files only (never `git add -A` or `git add .`). Message format:
```
feat(<context>): <description> (M0X-SYY)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

### Step 5 — Push (pre-push hook runs `ci:fast` automatically)
`git push -u origin feat/M0X-SYY-<short-description>`

`ci:fast` = lint + prettier + type-check + unit tests (~15 s). If it fails the push is blocked. Fix, re-commit, re-push.

### Step 6 — Run `ci:local` (optional)
`pnpm ci:local` (~5 min, Docker required). Run only when touching Dockerfiles, infra, or integration-test paths.

### Step 7 — Self-review the full diff (MANDATORY — before every PR)

Run `/pre-pr` — must report **zero issues** before the PR is opened.

### Step 8 — Open the PR
```bash
gh pr create --title "feat(<context>): <description> (M0X-SYY)" \
  --body "## Summary\n- <bullet>\n\n## Story\nM0X-SYY — <title>\n\n## Test plan\n- [ ] Unit tests pass\n- [ ] Type-check clean\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)" \
  --repo lmmoreira/beloauto
```

### Step 9 — Monitor CI; self-fix any failure
`gh pr checks <PR-number> --repo lmmoreira/beloauto` — fix → commit → push → re-check until all green.

### Step 10 — Ask user before merging (MANDATORY)
Once all CI checks are green, ask: *"All checks are green on PR #N. Have you reviewed it and are you happy to merge?"*

**Never merge without explicit user confirmation.** Then: `gh pr merge <PR-number> --repo lmmoreira/beloauto --squash --delete-branch && git checkout main && git pull origin main`

### Step 11 — Mark story done (only after the squash commit is on `main`)
Run `/mark-done M0X-SYY`. The skill updates the plan file, commits to main, and alerts if all stories in the milestone are now done.

### Step 12 — Milestone complete? Create wrap-up docs
If every story in the milestone is now `✅ Done`, see §15 item 7 for the two wrap-up files to create.

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
| Value objects / aggregate mappers | `docs/VALUE_OBJECTS_REFERENCE.md` | 1 |
| CI / pipelines | `docs/09-CI_CD_PIPELINE.md` + `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` | 4 |
| Deployment / infra | `docs/12-DEPLOYMENT_STRATEGY.md` + `docs/22-TECH_STACK_DECISIONS.md` | 5 |
| Observability | `docs/10-OBSERVABILITY_STRATEGY.md` | 2 |
| Full feature (UC + API + DB + tests) | All of the above relevant rows | 12–18 |
| Working on M01+ (any backend/BFF/web task) | `plan/M00-MONOREPO-FOUNDATION_IMPLEMENTATION_DETAILS_IA.md` — version gotchas, stubs, CJS/ESM decisions, seed UUIDs, testing setup | 3 |
| Working on M02+ (any task touching CI, Dockerfiles, or deployment) | `plan/M01-CI-QUALITY-GATES_IMPLEMENTATION_DETAILS_IA.md` — workflow job map, Dockerfile gotchas (pnpm deploy, --ignore-scripts, npm removal, .next/.dist copy), Checkov path-filter, local vs CI gate coverage, required GitHub Secrets | 2 |
| Working on M03+ (any task touching Platform context, TenantContext, TypeORM setup, settings, deepMerge, or REST Client HTTP files) | `plan/M02-PLATFORM-CONTEXT_IMPLEMENTATION_DETAILS_IA.md` — DB_* vars, forRootAsync timing, AsyncLocalStorage TenantContext, ManagerRoleGuard stub, deepMerge null/array behaviour, error mapper pattern, test builders | 3 |
| Working on M04+ (any task touching auth, BFF guards, OAuth flow, customer/staff login, JWT, tenant switching, Zod validation, or BFF→backend internal calls) | `plan/M03-AUTHENTICATION_IMPLEMENTATION_DETAILS_IA.md` — OAuth state encoding (`__staff__` vs slug vs empty), `passReqToCallback` signature, `JWT_COOKIE_OPTIONS` location, `FindOrCreate` flow, switch-tenant 3-call pattern, `mapXxxError` + dedicated mapper spec, optional-chain SonarCloud S6582, `BackendHttpService` jest.fn() pattern, Zod v4 UUID format | 3 |
| Working on M05+ (any task touching Staff aggregate, Notification context, staff invite/activate/deactivate flows, IDeliveryChannel strategy, notification_logs idempotency, SYSTEM_ACTOR_ID, or cross-context port+adapter pattern) | `plan/M04-STAFF-MANAGEMENT_IMPLEMENTATION_DETAILS_IA.md` — Staff VO-typed props, reinvite upsert, last-manager race fix, thin StaffInvited event, IDeliveryChannel[] strategy pattern, notification_logs DB idempotency, SMTP env vars, Pub/Sub subscription names, migration timestamps | 4 |

**Anti-patterns reference:** `docs/ANTI_PATTERNS.md` — full 48-row table; loaded automatically by `/pre-pr`.

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
│   └── web/              # Next.js 16 (hotsite + dashboard)
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
├── ports/            # IEventBus, IRepository<T>
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

## 14. Glossary

| Term | Definition |
|---|---|
| **Tenant** | A car-wash company on the platform. Unit of isolation. |
| **Hotsite** | Public unauthenticated tenant-branded marketing + booking page. |
| **Hotsite Manifest** | JSON with branding + module layout served to the frontend per tenant slug. |
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
5. Does the integration test include a tenant-isolation assertion? ✓
6. Did I follow §9 workflow? (branch → implement → ci:fast → /pre-pr → PR → CI all-green → user approval → merge → /mark-done) ✓
7. Are ALL stories in this milestone now `✅ Done`? If yes — create both wrap-up files:
    - `plan/MXX-<NAME>_IMPLEMENTATION_DETAILS_IA.md` — token-efficient reference for AI agents: artifacts table, critical gotchas, version facts, structural decisions. No prose, no tutorials.
    - `plan/MXX-<NAME>_IMPLEMENTATION_DETAILS_DEVELOPER.md` — detailed learning doc for the human developer: every concept explained with rationale, real code examples from this codebase, enough depth that a developer can learn NestJS, DDD, and the engineering patterns used here just by reading it.
    - Add the IA file to §10 of this file. ✓

---

## 17. Project Slash Commands (Claude Code)

Commands live in `.claude/commands/`. Claude Code auto-discovers them — type `/` to see the list. Other agents (Cursor, Copilot, Gemini) don't execute these, but knowing they exist helps them suggest the right workflow.

| Command | File | When to use |
|---|---|---|
| `/pre-pr` | `.claude/commands/pre-pr.md` | **Before every PR** — runs all 14 checks (framework imports, transactions, .http blocks, return types, VO typing, EntityBuilders, ZodValidationPipe, SonarCloud patterns) + domain-audit. Must report zero issues. |
| `/domain-audit [context-path]` | `.claude/commands/domain-audit.md` | Structural VO/builder scan. Called automatically by `/pre-pr`; run standalone for a quicker focused check. |
| `/mark-done M0X-SYY` | `.claude/commands/mark-done.md` | **After merge to main** — marks the story `✅ Done` in the plan file, commits, and alerts if the milestone is now complete. |

**Adding new commands:** create `.claude/commands/<name>.md`. Use `$ARGUMENTS` as the placeholder for optional user-typed arguments. Document it in this table.

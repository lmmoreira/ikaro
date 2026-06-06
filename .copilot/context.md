# BeloAuto — Agent Context (canonical)

> **AGENT EDITING NOTICE:** `CLAUDE.md`, `claude.md`, and `gemini.md` are all symlinks to **`.copilot/context.md`**. If you need to edit this file, always write to `.copilot/context.md` directly — never attempt to write through the symlinks.

**Symlinked as:** `claude.md`, `gemini.md`  
**Audience:** Any AI coding agent (Claude Code, Copilot CLI, Cursor, Aider, etc.)  
**Rule:** Read this file first on every conversation. Then use §10 to load only the docs you need.  
**Last updated:** 2026-06-06 (M115-S03 story extended — InternalApiGuard global via APP_GUARD; APP_GUARD anti-pattern added to §8 + ANTI_PATTERNS.md)

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
| **Loyalty** | Supporting | `LoyaltyEntry` (append-only), `LoyaltyBalance` (running total), `LoyaltyRedemption` (append-only) | `ServicePointsEarned`, `PointsExpiringSoon` |
| **Notification** | Supporting | `NotificationTemplate`, `NotificationLog` | `EmailSent`, `EmailFailed` |
| **Platform** | Foundational | `Tenant`, `HotsiteConfig` | `TenantProvisioned` |

**Loyalty MVP rules:** One immutable `LoyaltyEntry` per `BookingLine` completed. Idempotent via `UNIQUE(tenant_id, booking_line_id)`. Active balance stored in `loyalty_balances.current_points` (O(1) — not a SUM). Incremented on earn, decremented on redemption or daily expiry cron (idempotent via `balance_expiry_log`). Admins record redemptions via `POST /v1/loyalty/redeem`. No tiers, no manual bonus adjustments.

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

### Shared utilities and value objects

Utility functions used in more than one place → `src/shared/utils/`. Already there: `deepMerge`, `startOfDayUTC` / `endOfDayUTC` / `todayUTC` / `localDateTimeToUTCIso` / `utcDateToLocalDate` / `utcDateToLocalHHMM` / `getUtcWeekDayName`.

Fields with their own validation → `src/shared/value-objects/` (never plain primitives):

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

Every VO must have a `.spec.ts` covering valid and invalid inputs. → PhoneNumber format and VO normalisation boundary rules: `docs/CODE_STANDARDS.md`.

### Value-object-typed aggregate fields (mandatory — Option A)

Aggregate props interfaces use VO types; getters return VOs; `create()` constructs VOs from raw strings; `reconstitute()` skips validation. JSONB columns require a double cast (`as unknown as XxxProps`).

→ Code patterns, mapper examples, in-memory repo comparisons: `docs/VALUE_OBJECTS_REFERENCE.md`.

### Code standards

→ Full mandatory rules: `docs/CODE_STANDARDS.md`. Critical invariants always active:

- `strict: true` — no `any`, no `@ts-ignore`, no `// eslint-disable`. Functions ≤ 20 lines, classes ≤ 200.
- Controllers call use cases only. No business logic in controllers.
- Domain errors thrown by use cases; `mapXxxError(err: unknown): never` at HTTP layer; controller = `return this.useCase.execute(dto).catch(mapXxxError)`. Never throw `HttpException` from a use case.
- Use case result: `{UseCaseClassName}Result`. DTO: `{Action}Dto`. Zod schema: `{Action}Schema`.
- **Aggregate-driven events:** `this.addDomainEvent()` in aggregate method; flush `clearDomainEvents()` **after** `txManager.run()`. Never publish events directly from a use case.
- `correlationId` from `TenantContext.correlationId` (not `uuidv7()`). Domain error base class needs `Object.setPrototypeOf(this, new.target.prototype)` after `super()`.
- Zod v4: `z.uuid()` / `z.email()` — never `z.string().uuid()` / `z.string().email()`.
- `/internal` routes skip `TenantInterceptor`. `TenantModule` is not `@Global()` — import explicitly in every module whose controller injects `TenantContext`.
- Domain events belong in the publishing context (`StaffInvited` in `staff/domain/events/`, not `platform/`).
- Domain error messages are **English only**. Default params must come after required params (SonarCloud S1788).
- No barrel `index.ts` in `ports/` or `shared/domain/` — ESLint enforces. Every new REST endpoint → `.http` file.

### Cross-context data access (priority order — follow strictly)

When Context A needs data owned by Context B, choose the **first** option that applies:

1. **Domain events (preferred — async):** Context B publishes; Context A subscribes and projects into its own read model.
2. **BFF orchestration (preferred — sync read):** BFF calls both contexts independently. No context knows the other.
3. **Port + adapter (last resort — sync, same process):** Interface in Context A's `application/ports/`. Adapter injects Context B's **service** (never its repository token).

**Never** a direct SQL JOIN across contexts inside a repository. A repository queries its own schema only.

### Transactions (every write — no exceptions)

Every `save()` in every use case must be wrapped in `ITransactionManager.run()` — including single-aggregate writes. TypeORM's `save()` is a merge (internal SELECT + UPDATE/INSERT); without a transaction those two DB ops are not atomic.

**Scope rule:** wrap only the `save()` call(s) — reads, validations, and domain mutations happen *before* `txManager.run()` opens.

**Multi-aggregate writes:** wrap all saves together in a single `txManager.run()`.

**Test wiring:** inject `new InMemoryTransactionManager()` in every unit/controller spec. For `Test.createTestingModule`: `{ provide: TRANSACTION_MANAGER, useValue: new InMemoryTransactionManager() }`. For integration: import `TransactionManagerModule`.

**Repository transaction-awareness:** write methods check `getActiveEntityManager()` — use active `EntityManager` if present, else fall back to `this.repo`. Read methods do not need this.

| Artifact | Location |
|---|---|
| Port | `src/shared/ports/transaction-manager.port.ts` |
| Real adapter | `src/shared/infrastructure/typeorm-transaction-manager.ts` |
| Global module | `src/shared/infrastructure/transaction-manager.module.ts` |
| Test double | `src/test/infrastructure/in-memory-transaction-manager.ts` |
| Context propagation | `src/shared/infrastructure/transaction-context.ts` |

### Event handlers (Pub/Sub consumers)

Handlers live in `<context>/infrastructure/events/`. They are **infrastructure**, not application layer.

- **Thin by law:** `handle()` calls exactly one use case and rethrows any error. Zero domain logic inside a handler.
- **Subscribe in `onModuleInit()`** via `eventBus.subscribe(eventName, handler, consumerName)`. `consumerName` determines the Pub/Sub subscription name — unique per consumer.
- **Rethrow errors** — Pub/Sub nacks and retries. Never swallow errors.
- **Idempotency in the use case** — DB check via `findByXxx`. No in-memory sets (lost on restart, not shared across pods).
- **`correlationId` propagation** — pass `event.correlationId` into the use case DTO; never generate a new UUID in the handler.

**Pub/Sub naming (one topic per event type):**

| Thing | Pattern | Example |
|---|---|---|
| Topic | `beloauto-{eventName}` | `beloauto-StaffInvited` |
| Subscription | `beloauto-{eventName}-{consumerName}` | `beloauto-StaffInvited-notification` |

`GcpPubSubEventBusAdapter` auto-creates topics/subscriptions on `onApplicationBootstrap()`. Local dev: `PUBSUB_EMULATOR_HOST=localhost:8085`.

**Test wiring for event handlers:**

| Test type | Event bus | When to use |
|---|---|---|
| Handler unit spec | `InMemoryEventBus` + call `handler.handle(event)` directly | Handler → use case logic in isolation |
| Story integration spec | Real `EventBusModule` (no override) + `waitFor()` | Full publish → Pub/Sub → handler → DB chain |
| Controller integration spec | Override `EVENT_BUS` with `InMemoryEventBus` | HTTP layer — no Pub/Sub needed |

`waitFor()` at `src/test/utils/wait-for.ts`. Use in story integration specs to poll async side effects.

### Testing

Three layers: **Unit** (`.spec.ts`, Jest) · **Integration** (`.integration.spec.ts`, Jest + Testcontainers) · **E2E** (Playwright, happy paths only). Full mandatory patterns → `docs/08-TESTING_STRATEGY.md §Mandatory Patterns`.

- TDD for domain logic. Every UC: ≥1 unit + ≥1 integration + ≥1 tenant-isolation test (Tenant A data, Tenant B access → 404/403).
- **Builders mandatory** for ALL test data — class with fluent `withXxx()` / `build()`. Never plain factory functions. `XxxEntityBuilder` (entities), `XxxBuilder` (aggregates), `TenantContextBuilder` (shared stubs).
- **InMemory doubles over `jest.fn()`** — `InMemoryEventBus`, `InMemoryTransactionManager`, `InMemoryXxxRepository`. Cross-context ports: `InMemoryXxxPort` class in `src/test/infrastructure/`.
- **BFF:** two test files per controller (`.spec.ts` + `.component.spec.ts`). Strict helper-file isolation: `component-test.helpers.ts` for component specs only; `backend-http.mock.ts` for unit specs only.
- **SonarCloud ingests unit tests only** — every new controller/use case needs a `.spec.ts`.
- No `.skip()`, `.only()`, `setTimeout` in tests.
- **Integration DB isolation:** unique inline tenant UUID for any `it()` sensitive to aggregate counts. Never reuse `TENANT_A`/`TENANT_B` for count assertions.
- **Notification specs:** use `createNotificationIntegrationApp()`; suppress unrelated handlers; drain provisioning noise before recording idempotency baseline. See `docs/08-TESTING_STRATEGY.md`.
- **New migration/entity → register in global setup:** `src/test/integration-global-setup.ts` uses explicit import lists (no glob). Every new migration class and TypeORM entity must be added there (and to any context-specific helper like `notification-integration-app.ts`) in the **same commit** as the migration file. Skipping this causes silent failures — unit tests pass but integration tests error on the first DB query.

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

Full list in `docs/ANTI_PATTERNS.md` (checked by `/pre-pr`). Highest-severity patterns:

| Pattern | Problem | Fix |
|---|---|---|
| `WHERE id = ?` without `tenant_id` | Cross-tenant data leak | Add `AND tenant_id = ?` |
| Event missing `tenantId` in envelope | Can't isolate per tenant | Include in every event |
| SQL JOIN into another context's schema inside a repository | Defeats schema independence | Repository queries its own schema only |
| Throwing `HttpException` directly from a use case | Couples app layer to HTTP | Throw domain errors only; `mapXxxError` converts them |
| Publishing events directly from a use case | Bypasses aggregate encapsulation; wrong `correlationId` | Record via `addDomainEvent()`; flush after `txManager.run()` |
| Missing `Object.setPrototypeOf(this, new.target.prototype)` in domain error base class | `instanceof` fails silently — every error mapper falls through to 500 | Add immediately after `super()` in every `XxxDomainError extends Error` base class |
| `TenantModule` missing from a module that injects `TenantContext` | NestJS DI fails — integration tests crash with `TypeError: Cannot read properties of undefined` | Every module with a controller injecting `TenantContext` must import `TenantModule` |
| In-memory set for Pub/Sub handler idempotency (`private processedEventIds = new Set()`) | Set cleared on restart; not shared across pods | DB check in the use case (`findByXxx`) |
| `@Public()` BFF endpoint calling `backendHttp.post()` or `.patch()` | `JwtAuthGuard` skips `@Public()` routes — `req.user` is `undefined`, `post()` sends `X-Tenant-ID: ''`, backend rejects with 400 | Decode JWT manually with `tryDecodeRawJwt`, then use `postForPublic(path, body, user.tenantId)` which sets the header explicitly |
| Infrastructure port implementation named `XxxService` | Misleads readers — services hold business logic, adapters implement ports | Name it `XxxAdapter` in `xxx.adapter.ts`; examples: `GcpPubSubEventBusAdapter`, `GcsSignedUrlAdapter` |
| Tenant-isolation test with only supertest `.expect(404)` and no Jest `expect()` | SonarCloud S2699 — test has zero assertions | Destructure `{ body }` and add `expect(body.status).toBe(404)` |
| `@UseGuards(InternalApiGuard)` on individual controllers instead of `APP_GUARD` in `AppModule` | New controllers silently skip the guard | Register `{ provide: APP_GUARD, useClass: InternalApiGuard }` in `AppModule.providers` — every controller is automatically protected |

---

## 9. Story Implementation Workflow (mandatory — every story, no exceptions)

> ❗ **NON-NEGOTIABLE PR GATE — READ THIS BEFORE TOUCHING `gh pr create`**
>
> **`gh pr create` is FORBIDDEN until `/pre-pr` is complete.**
> The sequence is always:
> 1. `git push` → ci:fast pre-push hook runs (unit tests only — NOT sufficient alone)
> 2. `/pre-pr` → all 4 steps in order — Step 4 is a hard stop: ask the user to run integration tests and wait for their pasted output
> 3. Only after Step 4 clears → `gh pr create`
>
> ci:fast passing does NOT mean integration tests passed. SonarCloud issues, missing .http files, VO violations, and cross-tenant leaks are only caught by `/pre-pr`. Skipping it has caused repeated CI failures and user frustration.

### Step 1 — Create feature branch (BEFORE writing any code)
`git checkout -b feat/M0X-SYY-<short-description>`

Never write code on `main`. If already on `main` with uncommitted changes, stash first.

### Step 2 — Implement the story
Write all files defined in the story spec. See §0 for permission rules.

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

> **AGENT HARD RULE — NO EXCEPTIONS:**
> You MUST run `/pre-pr` and wait for it to report zero issues AND receive the user's integration test output (Step 4 of the `/pre-pr` skill) before calling `gh pr create`. Skipping or reordering these steps is a critical workflow violation. The pre-push hook only runs unit tests; integration tests are only caught here. Even if ci:fast passes, even if all unit tests pass — **do not open the PR until `/pre-pr` Step 4 is complete and the user has pasted passing integration test output.**

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
| Writing any code | `docs/CODE_STANDARDS.md` + `docs/AGENT_PATTERNS.md` | 6 |
| CI failure / pre-PR debugging | `docs/CI_TRAPS.md` | 1 |
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
| Working on M06+ (any task touching Service aggregate, booking.services table, Money VO price storage, PATCH partial-update pattern, StaffOrManagerRoleGuard, public BFF endpoints, or TenantContextBuilder) | `plan/M05-SERVICE-CATALOG_IMPLEMENTATION_DETAILS_IA.md` — price NUMERIC storage, booking schema migration, ServiceEntity in global setup, BookingModule no-export rule, guard-before-interceptor 403 behaviour, UpdateService positional merge, logical delete pattern, BFF slug→tenantId two-step, getForPublic(), TenantContextBuilder | 3 |
| Working on M07+ (any task touching ScheduleClosure, ScheduleOpening, AvailabilityService, availability algorithm, `time` columns, `IBookingAvailabilityPort`, calendar-date utils, or integration test tenant seeding) | `plan/M06-CALENDAR-SCHEDULE_IMPLEMENTATION_DETAILS_IA.md` — PostgreSQL `time` → HH:MM:SS normalised by TimeOfDay VO, `getSchedulingSettings()` one-DB-trip rule, `utcDateToLocalDate` vs `utcDateToLocalHHMM`, `todayUTC()` boundary, booking availability stub, no UNIQUE on schedule_closures, opening precedence, half-open interval overlap, API-driven tenant seeding via `POST /internal/tenants`, three-layer resolution, M07 integration points | 4 |
| Working on M08+ (any task touching Booking aggregate, BookingLine, booking state machine, RequestBookingUseCase, ICustomerProfilePort, BookingRequested notification, customer profile endpoints, postForPublic(), linesModified flag, or post-commit event flush) | `plan/M07-BOOKING-CREATION_IMPLEMENTATION_DETAILS_IA.md` — linesModified flag & delete-then-insert, post-commit event flush (not outbox), ICustomerProfilePort + CustomerProfileAdapter cross-context pattern, Money NUMERIC(10,2) as string, composite FK (tenant_id, booking_id), serviceNameAtBooking snapshot, postForPublic() headers, BFF phone validation, createBookingIntegrationApp() entities, notification dispatcher scoped to adminEmail, UpdateCustomerProfileUseCase partial-update pattern | 4 |
| Working on M09+ (any task touching booking approval flow, BookingSlotConflictService, guest info-submission token, notification handlers for approval events, findAllByTenantPaginated, role-based list filtering, or FRONTEND_URL/JWT_SECRET env vars) | `plan/M08-BOOKING-APPROVAL_IMPLEMENTATION_DETAILS_IA.md` — slot conflict half-open interval, linesModified skip in state transitions, 404-not-403 for cross-customer access, N+1 avoidance in paginated repo, guest JWT token flow (sign in notification → verify in BFF → backend receives guestEmail), z.coerce.number() for BFF query params, notification idempotency via notification_logs, FRONTEND_URL + JWT_SECRET vars | 4 |
| Working on M10+ (any task touching customer cancel, admin cancel, reschedule, cancellation window, BookingCancelled/Rescheduled events, BaseNotificationUseCase, or dual-notification partial-idempotency) | `plan/M09-CANCELLATION-RESCHEDULING_IMPLEMENTATION_DETAILS_IA.md` — single BFF endpoint branches on role, window only for APPROVED status, reschedule self-exclusion in slot conflict, previousSlot captured before mutation, event payload as full snapshot (lineSummaryPayload/totalPricePayload helpers), BaseNotificationUseCase + base DTOs, partial-idempotency pattern for dual-type notifications, getTenantInfo skipped on full-idempotent path | 4 |
| Working on M11+ (any task touching LoyaltyEntry/LoyaltyBalance/LoyaltyRedemption aggregates, ServicePointsEarned event, booking completion loyalty flow, balance expiry HTTP trigger, IServiceCatalogPort, ILoyaltyTenantSettingsPort, or loyalty BFF endpoints) | `plan/M10-COMPLETION-LOYALTY_IMPLEMENTATION_DETAILS_IA.md` — LoyaltyBalance is running total (never SUM entries), expiry via HTTP trigger not @Cron (Cloud Run + multi-pod reasons), TenantContext unavailable in Pub/Sub handlers (use ILoyaltyTenantSettingsPort), post-commit event flush, balance_expiry_log idempotency, clamped decrement, DataSource injection for cross-context reads, createLoyaltyIntegrationApp() helper, balance_expiry_log cleanup needs QueryBuilder (no tenant_id column) | 5 |
| Working on M12+ (any task touching NotificationTemplate/NotificationLog aggregates, Pub/Sub DLQ, email adapter chain, cron reminder jobs, notification idempotency via processed_events, BaseNotificationUseCase, or createNotificationIntegrationApp()) | `plan/M11-NOTIFICATIONS-CRON_IMPLEMENTATION_DETAILS_IA.md` — email adapter chain (IEmailSender vs IDeliveryChannel), processed_events dedup design, notification_logs upsert retry_count, DLQ programmatic routing (not native policy), PUBSUB_AUTO_CREATE flag, template lookup fallback, BaseBookingReminderNotificationUseCase abstract-property pattern, PUBSUB_SUBSCRIPTION_SUFFIX integration test isolation | 5 |
| Working on M115 (GCS signed-URL photo upload, dev-login OAuth bypass, InternalApiGuard hardening for `/internal/*` routes, or `guest*` → `contact*` rename) | `plan/M115-PRODUCTION-READINESS.md` — 3-step upload contract (signed-URL → PUT → filePath), `dev::` OAuth ID prefix, `ENABLE_DEV_AUTH` guard pattern, `InternalApiGuard` + `X-Internal-Key` header, `BackendHttpService` propagation; S04: all 4 `guest*` fields renamed to `contact*` across aggregate/events/entity/DB columns/notification DTOs/BFF/packages; DB columns renamed in existing migration (disposable local DB); `{{guestName}}` → `{{contactName}}` in notification seed migration; `base-guest-notification.dto.ts` → `base-contact-notification.dto.ts`; `submit-guest-booking-info.dto.ts` filename unchanged; note: `afterServicePhotoUrls` in M10-S01 stores plain strings until M115-S01 is live; S01 shipped: `GcsSignedUrlAdapter` (not Service) in `gcs-signed-url.adapter.ts`; BFF signed-URL endpoint is `@Public()` — use `postForPublic(path, body, user.tenantId)` not `post()` for JWT scenarios; `createBookingIntegrationApp()` now accepts `overrideProviders` option to swap infrastructure ports (e.g. `STORAGE_SERVICE`) in integration tests; `guest-token.util.ts` exports `tryDecodeRawJwt` + `verifyGuestToken` only — `tryVerifyGuestToken` was removed as dead code | 2 |

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
├── http/             # Pagination DTOs, RFC 9457 ProblemDetail base type
└── guards/           # Role guards used by more than one context (CustomerRoleGuard, ManagerRoleGuard, StaffOrManagerRoleGuard)
```

**Rule:** A context module MUST NOT import from another context's path. Only `src/shared/` is importable across contexts. Domain objects (entities, aggregates, use cases, repositories) are NEVER in shared.

**Guard placement rule:**
- `src/shared/guards/` — role guards that enforce the `X-Actor-Role` header contract and are applied across multiple contexts. Every role guard lives here with its own `.spec.ts`.
- `src/contexts/<context>/infrastructure/guards/` — guards with domain-specific logic tied to one context (e.g. `PlatformAdminGuard` which injects `ConfigService` and guards a single `/internal` route). These stay local.
- Never import a guard from another context's `infrastructure/guards/` path — that is a context-isolation violation.

---

## 12. Open Decisions (stop and ask before implementing)

1. **Multi-location (post-MVP):** Multiple locations per tenant = separate tenants or sub-tenant model?

---

## 15. Self-Check Before Submitting

> **BEFORE WRITING ANY CODE:** Create a feature branch first — `git checkout -b feat/M0X-SYY-<description>`. Never code directly on `main`. See §9 for the full workflow.

1. Did I read this file at the start of the conversation? ✓
2. Did I get permission before writing any doc/config file? ✓
3. Does every query / event / log include `tenant_id`? ✓
4. Is the change scoped to one UC cited in the PR? ✓
5. Does the integration test include a tenant-isolation assertion? ✓
6. Did I follow §9 workflow? (branch → implement → ci:fast → /pre-pr → PR → CI all-green → user approval → merge → /mark-done) ✓
7. **Did I run `/pre-pr` AND wait for the user to paste passing integration test output BEFORE calling `gh pr create`?** If the answer is no — do not open the PR. Go back and run `/pre-pr` first. ✓
8. Are ALL stories in this milestone now `✅ Done`? If yes — create `plan/MXX-<NAME>_IMPLEMENTATION_DETAILS_IA.md` + `_DEVELOPER.md`; add IA file to §10 of this file. ✓

---

## 17. Project Slash Commands (Claude Code)

Commands live in `.claude/commands/`. Claude Code auto-discovers them — type `/` to see the list.

| Command | File | When to use |
|---|---|---|
| `/pre-pr` | `.claude/commands/pre-pr.md` | **Before every PR** — runs all 14 checks + domain-audit. Must report zero issues. |
| `/domain-audit [context-path]` | `.claude/commands/domain-audit.md` | Structural VO/builder scan. Called automatically by `/pre-pr`. |
| `/mark-done M0X-SYY` | `.claude/commands/mark-done.md` | **After merge to main** — marks story done, commits, alerts if milestone complete. |
| `/story-discovery M0X-SYY` | `.claude/commands/story-discovery.md` | **Before starting a story** — checks doc clarity, dep symbols, and consistency; asks targeted questions; proposes doc patches; emits READY / NOT READY verdict. |

**Adding new commands:** create `.claude/commands/<name>.md`. Use `$ARGUMENTS` for optional user-typed arguments. Document it in this table.

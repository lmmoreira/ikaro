# Ikaro — Engineering Rules: Testing

> **When to load:** writing or reviewing tests (unit, integration, component, E2E).
> Split from `docs/ENGINEERING_RULES.md` (TD41-S4, 2026-09-23). Summary rules are in `CLAUDE.md §7`.

---

## Testing Patterns (detail)

Full mandatory rules → `docs/08-TESTING_STRATEGY.md §Mandatory Patterns`.

### Builder pattern (mandatory)

All test data uses builder classes with fluent `withXxx()` / `build()`. Never plain factory functions or raw object literals in specs.

Builder types:
- `XxxEntityBuilder` — TypeORM entity builders
- `XxxBuilder` — aggregate builders
- `XxxEventBuilder` / `XxxCommandBuilder` — `DomainEvent`/`Command` builders (e.g. `StaffInvitedEventBuilder`, `BookingReminderDueCommandBuilder`) — mandatory for any event/command class constructed inline in more than one spec file
- `RequestContextBuilder` — shared request-context stub

### InMemory doubles

Prefer InMemory classes over `jest.fn()` for any port or repository:
- `InMemoryEventBus` — event bus
- `InMemoryTransactionManager` — transaction manager
- `InMemoryXxxRepository` — per-context repos
- `InMemoryXxxPort` — cross-context ports (in `src/test/infrastructure/`)
- `InMemoryCachePort` — `CachePort` (get/set/del + configurable failure injection for error-path tests)

**A same-directory precedent file can itself predate this rule and be non-compliant — check this section before pattern-matching off a neighboring `*.spec.ts`.** (PR #373 review, Codex, 2026-08-15: `caching-service.repository.spec.ts` was written using raw `jest.fn()` mocks, copying `caching-tenant.repository.spec.ts`'s style exactly — but that file predates `InMemoryCachePort`'s existence and violates this same documented rule. Both were rewritten to use `InMemoryCachePort` in the same PR.)

### Caching decorator repositories — DI wiring

Building a new `CachingXxxRepository` (wrapping a `TypeOrmXxxRepository` behind `CachePort`, same shape as `CachingTenantRepository`/`CachingServiceRepository`)? Two DI-registration mistakes are easy to make and easy to miss, since `tsc --noEmit` doesn't catch either — only a real Nest DI container resolving the module at runtime does:

- **Constructor parameter type must be the port interface (`IXxxRepository`), not the concrete `TypeOrmXxxRepository` class — but that requires an explicit `@Inject(TypeOrmXxxRepository)` token.** Interfaces are erased at compile time, so Nest's constructor-reflection metadata can't infer an injection token from an interface-typed parameter; omitting the explicit `@Inject()` fails at runtime with an unresolvable-dependency error, not a type error. The interface typing is what makes the class substitutable with an `InMemoryXxxRepository` in a unit spec — don't drop it in favor of the concrete class just to avoid adding the decorator.
- **Don't register the caching class as its own bare provider once its only real consumer is the port token binding.** `providers: [TypeOrmXxxRepository, CachingXxxRepository, { provide: XXX_REPOSITORY, useClass: CachingXxxRepository }]` instantiates `CachingXxxRepository` **twice** — once for the bare class token, once for `XXX_REPOSITORY` — unless something else in the module actually injects it by class reference. Register only `TypeOrmXxxRepository` (needed for the `@Inject()` token above) and the `{ provide: XXX_REPOSITORY, useClass: CachingXxxRepository }` binding.

(PR #373 review, Codex, 2026-08-15: both mistakes were introduced in `CachingServiceRepository`'s first draft and fixed in the same PR — see `apps/backend/src/contexts/booking/infrastructure/repositories/caching-service.repository.ts` and `booking.module.ts` for the corrected shape. `CachingTenantRepository`'s own registrations in `platform.module.ts`/`platform-settings.module.ts` still carry the redundant-bare-provider version of the second mistake — left as-is, out of scope for that PR; don't copy it as precedent.)

### Platform tenant cache — adapter boundary and invalidation timing

Tenant read caching lives in `CachingTenantRepository` behind `CachePort`, never in `TypeOrmTenantRepository` — the raw TypeORM adapter stays cache-free, exactly the same layering `CachingServiceRepository`/`TypeOrmServiceRepository` already use. Cache writes and invalidations are best-effort (a cache failure never fails the write) and happen *after* the owning transaction commits, not inside it — invalidating before commit risks a reader repopulating the cache with the pre-write value if it races the still-open transaction. Don't reintroduce cache concerns (a `CachePort` dependency, an invalidation call) into the raw TypeORM adapter to "simplify" a call site — that's exactly the layering this split exists to keep out of the persistence adapter.

### Integration test DB isolation

Unique inline tenant UUID for any `it()` sensitive to aggregate counts. Never reuse `TENANT_A`/`TENANT_B` for count assertions — cross-test contamination.

### Shared test-builder date defaults

A shared test builder's default field representing a point in time (`expiresAt`, `startedAt`, `lastMessageAt`, …) must be computed relative to `Date.now()` at construction time, never a hardcoded calendar-date literal. A hardcoded date is only safe for as long as real calendar time stays behind it — it silently drifts from "safely far in the future" into "already expired" as the codebase ages, with no error anywhere, until something actually queries for staleness. In this codebase that "something" is a global, cross-tenant retention-purge job (`ChatbotRetentionPurgeJob`, `LeadFormRetentionPurgeJob`) that scans the *entire* shared integration-test Postgres instance with no per-file/per-tenant boundary — so a leftover row from any other spec file that used a builder's stale default is a legitimate purge candidate, and an integration test asserting an *exact* deleted-row count will intermittently fail depending on file execution order and how much real time has passed since the builder was written.

Confirmed to recur twice with the identical root cause and symptom:
- `ChatbotSessionEntityBuilder`'s hardcoded `startedAt`/`lastMessageAt` caused `ChatbotRetentionPurgeJob`'s own integration spec to sweep up a leftover row from `tenant-settings.controller.integration.spec.ts` — worked around locally in that one call site (`recentSession()`, forcing both fields to "now") rather than fixed at the builder itself, so the underlying defect was left in place for the next builder to repeat.
- `LeadFormSubmissionBuilder`'s hardcoded `expiresAt` (`2026-07-01`) caused the identical failure for `LeadFormRetentionPurgeJob`'s own integration spec once real calendar time passed that date (M20-S04 precedent, 2026-08-25 — caught in CI, not locally, since the contaminating row came from a *different* spec file than the one being debugged).

**Fix, both times:** compute the default relative to construction time (e.g. `new Date(Date.now() + 180 * DAY_MS)`), not a literal ISO string. **Also harden any test asserting an exact global count from a job with no tenant/file boundary** — prefer row-level existence/non-existence assertions for the fixtures the test itself created, with the count assertion relaxed to a lower bound (`toBeGreaterThanOrEqual`) rather than an exact `toBe`, since the test can never assume it's the only source of rows in the shared database.

### Integration app helpers — mandatory default overrides

Every integration app helper that imports a module with a network-calling adapter must default-override that adapter's token with an in-memory stub **before** the caller's overrides run (caller wins):

```ts
let builder = Test.createTestingModule({ imports: [..., BookingModule] })
  .overrideProvider(EVENT_BUS).useValue(routingBus)
  .overrideProvider(STORAGE_SERVICE).useValue(new InMemoryStorageService()); // default

for (const { provide, useValue } of overrideProviders) {
  builder = builder.overrideProvider(provide).useValue(useValue); // caller wins
}
```

Current helpers and required default overrides:

| Helper | Default override |
|---|---|
| `createBookingIntegrationApp()` | `STORAGE_SERVICE` → `InMemoryStorageService` |
| `createNotificationIntegrationApp()` | `STORAGE_SERVICE` → `InMemoryStorageService` |

When adding a new shared module with a network-calling adapter, update every helper that imports it.

### Reuse the shared Nest cache test module

Any integration test harness that needs `CacheModule` wiring must import `apps/backend/src/test/utils/test-cache-module.ts` instead of copy-pasting `CacheModule.register(...)` inline — keeps cache TTL/store config consistent across every harness that needs it.

### NestJS module provider pattern (useClass not useExisting)

Full explanation and the worked before/after example now live in `docs/ANTI_PATTERNS.md` row 68 (relocated 2026-09-20, TD41 — this rule was independently, fully explained in both that row and here, with no pointer between them; collapsed to one canonical copy).

### Notification spec setup

Use `createNotificationIntegrationApp()`; suppress unrelated handlers; drain provisioning noise before recording idempotency baseline. See `docs/08-TESTING_STRATEGY.md`.

### Migration / entity registration

Every new migration class and TypeORM entity must be added to `src/test/integration-global-setup.ts` (and to any context-specific helper like `notification-integration-app.ts`) in the **same commit** as the migration file. Skipping causes silent failures — unit tests pass but integration tests error on the first DB query. This applies to a migration that only adds an index, not just one that creates a table — `pnpm architecture-check`'s `test-harness-registration` detector catches a missing entry either way.

### Standalone index for a cross-tenant system job

`docs/13-DATABASE_SCHEMA.md`'s Indexing Strategy rule ("every index MUST start with `tenant_id`") has one narrow, explicit exception: a system-triggered job that deletes/scans across **every tenant in one pass, with no `tenant_id` predicate at all** — a daily retention purge (`ChatbotRetentionPurgeJob`, `LeadFormRetentionPurgeJob`), matching `ExpirePointsJob`'s own precedent. A `(tenant_id, X)` composite index can't be seeked by a query that never filters on `tenant_id` — Postgres has to fall back to a full index/table scan regardless of how well `X` alone would narrow the search, which degrades as the table grows.

When drafting a new job of this shape, check the table's existing indexes for a **standalone** index on the job's own filter column, not just a composite one that happens to include it as a trailing column. Confirmed to be missed twice in a row before being caught by review: `chatbot_messages.IDX_chatbot_messages_created_at` (added after the fact by `AddStartedAtIndexToChatbotSessions`, M19-S07) and `lead_form_submissions.IDX_platform_lead_form_submissions_expires_at` (added after the fact in M20-S04, 2026-08-25, Codex review finding on PR #422 — the story's own draft named only the pre-existing `(tenant_id, expires_at)` composite index, by habit, without checking whether the job's actual query could seek it). When a new story's job description says "mirror `<X>RetentionPurgeJob`'s shape exactly," that includes checking whether `<X>`'s table needed this same standalone-index fix — not just copying the job/handler/controller file shapes.

`packages/architecture-check/architecture-policy.json`'s `testDataHarnessRegistrations` section is the machine-checked source of truth for this — one entry per file that declares a TypeORM `entities:`/`migrations:` array (`integration-global-setup.ts` plus the 6 `src/test/utils/*-integration-app.ts`/`test-datasource.ts` helpers). `integration-global-setup.ts` is declared `"complete"` and must carry every production entity/migration; the rest are `"partial"` with an explicit, intentional `entities` subset. Adding a new entity to one of the partial helpers' code array without updating its matching policy entry (or vice versa) is flagged as drift by `pnpm architecture-check`'s `test-harness-registration` detector (TD37-S07) — update both in the same commit, not just the code.

### BFF tests

Two test files per controller: `.spec.ts` (unit) + `.component.spec.ts` (component). Helper-file isolation:
- `component-test.helpers.ts` — for component specs only
- `backend-http.mock.ts` — for unit specs only

`test:cov` must exclude component specs — coverage instruments `AppModule` at import time, triggering `validateEnv` before env vars are set.

---


## Cloudflare Turnstile's test sitekey never renders an interactive iframe

Relocated to `docs/CI_TRAPS.md`'s "Cloudflare Turnstile's test sitekey never renders an interactive iframe" entry (2026-09-20, TD41) — this is a test-execution nuance, not a code anti-pattern, so it lives with the other CI/E2E traps `/pre-pr` and `/story-discovery` sessions actually consult; the M20-S09 precedent and the wait-on-hidden-input fix are there.

---


## SonarCloud's duplicate-test rule (`S5976`) can retroactively flag pre-existing tests once a new similarly-shaped test is added

**The rule's threshold is 3-or-more structurally-similar test bodies in the same file — adding a single new test can tip an already-existing, previously-unflagged pair over that threshold, even though neither pre-existing test changed.** Fixing one flagged group of 3 near-identical tests does not make the file immune to a *second*, unrelated finding of the same shape forming elsewhere in the same file from your own new addition.

Before adding a new "mock one input, render, assert one output" style test to a spec file, grep that file for other tests sharing the same shape (a single `mockReturnValue`/`mock` call, a `render`, and one assertion) — if 2 already exist, your new one will form a flaggable trio. Parameterize into a single `it.each()` proactively (see `BottomNav.spec.tsx` for the established pattern in this codebase) rather than discovering it in a second bot-review round.

**M21-S04 precedent, 2026-09-02:** fixing one flagged trio of near-identical resource-route topbar tests by parameterizing them into `it.each()`, then separately adding one new simple "resources list title" test in the same file, formed a brand-new flaggable trio out of that new test plus two unrelated, pre-existing tests — "renders the page title matching the current pathname" (bookings route) and "falls back to 'Dashboard' for an unrecognised pathname" — that had coexisted, unflagged, in the same file for months before this change.


## Node's default V8 heap limit is unrelated to actual host/container RAM — a Jest OOM kill on a host with plenty of free memory is the default ceiling, not a leak

**V8's old-space heap defaults to ~2240MB regardless of how much RAM the host or container actually has** — `node -p "require('v8').getHeapStatistics().heap_size_limit"` confirms this even on a machine reporting gigabytes of free RAM via `free -h`. An OOM kill on backend Jest runs is not evidence of a real memory leak or an under-provisioned host until this default is ruled out first.

Set `--max-old-space-size` explicitly on every Jest entry point that can run a large suite, not just the one that happened to OOM — a fix scoped to `test`/`test:integration` alone leaves `test:unit`/`test:cov` (what CI's own coverage job actually runs) exposed to the identical failure mode.

**TD08 AUD-044 precedent, PR #484, 2026-09-16:** a local OOM kill on a KVM VM with 6GB+ free RAM traced directly to this default. Fixed by adding `--max-old-space-size=6144` to all four backend Jest scripts (`test`, `test:unit`, `test:integration`, `test:cov`) — the first fix covered only two of the four and was caught by a PR review round.


## An integration test seeding fixtures under fixed/hardcoded tenant UUIDs needs symmetric, complete setup/teardown — CI's Testcontainers reuse can carry a prior run's corruption into an unrelated later run

**`TESTCONTAINERS_REUSE_ENABLE: 'true'` reuses the same Postgres container across separate, unrelated CI runs — a local run never reuses a container, so this class of bug is invisible locally no matter how many times you re-run the suite.** A test seeding fixtures under fixed tenant UUIDs whose `afterAll` doesn't delete every child table, in FK-safe order, for every fixture tenant, can crash mid-cleanup on one run and leave orphaned rows a *later*, unrelated run's `beforeAll` builds on top of.

Extract one cleanup helper covering every fixture tenant in FK-safe order; call it both defensively at the top of `beforeAll` and as the entirety of `afterAll` (wrapped in `try/finally`).

**TD08 AUD-045 precedent, PR #484, 2026-09-16:** a 3-tenant fixture's `afterAll` only cleaned 2 tenants' child rows; the third's FK violation aborted cleanup, and the reused CI container carried that into a later run, which failed a content assertion instead. Passed 3/3 locally; failed 2/2 on CI before the fix.


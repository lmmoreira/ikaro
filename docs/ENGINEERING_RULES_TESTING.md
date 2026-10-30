# Ikaro — Engineering Rules: Testing

> **When to load:** writing or reviewing tests (unit, integration, component, E2E), including (planned Billing) tests that use the provider fake, the injectable clock or the provider contract suite.
> Split from the former single `ENGINEERING_RULES.md` (TD41-S4, 2026-09-23). Summary rules are in `CLAUDE.md §7`.
> **Tags:** agent-process, testing

---

## Testing Patterns (detail)

Full mandatory rules → `docs/TESTING_STRATEGY.md §Mandatory Patterns`.

### Builder pattern (mandatory)

All test data uses builder classes with fluent `withXxx()` / `build()`. Never plain factory functions or raw object literals in specs. Naming, location and the coverage detector: `docs/TESTING_STRATEGY.md` § Builder class pattern (all test data).

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

Unique inline tenant UUID for any `it()` sensitive to aggregate counts. Never reuse `TENANT_A`/`TENANT_B` for count assertions — cross-test contamination. → the full rule, including full-table-sweep tests that must not assert an aggregate mock call count: `docs/TESTING_STRATEGY.md` § Integration test DB isolation.

### Shared test-builder date defaults

A shared test builder's default field representing a point in time (`expiresAt`, `startedAt`, `lastMessageAt`, …) must be computed relative to `Date.now()` at construction time, never a hardcoded calendar-date literal. A hardcoded date is only safe for as long as real calendar time stays behind it — it silently drifts from "safely far in the future" into "already expired" as the codebase ages, with no error anywhere, until something actually queries for staleness. In this codebase that "something" is a global, cross-tenant retention-purge job (`ChatbotRetentionPurgeJob`, `LeadFormRetentionPurgeJob`) that scans the *entire* shared integration-test Postgres instance with no per-file/per-tenant boundary — so a leftover row from any other spec file that used a builder's stale default is a legitimate purge candidate, and an integration test asserting an *exact* deleted-row count will intermittently fail depending on file execution order and how much real time has passed since the builder was written.

Confirmed to recur twice with the identical root cause and symptom:
- `ChatbotSessionEntityBuilder`'s hardcoded `startedAt`/`lastMessageAt` caused `ChatbotRetentionPurgeJob`'s own integration spec to sweep up a leftover row from `tenant-settings.controller.integration.spec.ts` — worked around locally in that one call site (`recentSession()`, forcing both fields to "now") rather than fixed at the builder itself, so the underlying defect was left in place for the next builder to repeat.
- `LeadFormSubmissionBuilder`'s hardcoded `expiresAt` (`2026-07-01`) caused the identical failure for `LeadFormRetentionPurgeJob`'s own integration spec once real calendar time passed that date (M20-S04 precedent, 2026-08-25 — caught in CI, not locally, since the contaminating row came from a *different* spec file than the one being debugged).

**Fix, both times:** compute the default relative to construction time (e.g. `new Date(Date.now() + 180 * DAY_MS)`), not a literal ISO string. **Also harden any test asserting an exact global count from a job with no tenant/file boundary** — prefer row-level existence/non-existence assertions for the fixtures the test itself created, with the count assertion relaxed to a lower bound (`toBeGreaterThanOrEqual`) rather than an exact `toBe`, since the test can never assume it's the only source of rows in the shared database.

### A booking test takes its start from `openSlotAt`, never a fixed UTC time

Booking creation, approval and reschedule refuse a start the business is closed for (`BOOKING_SLOT_CLOSED`, `BOOKING_OUTSIDE_BUSINESS_HOURS`), so a test that builds a start as `` `${futureDate(n)}T10:00:00.000Z` `` passes or fails with the weekday it runs on: that instant is 07:00 in `America/Sao_Paulo` and may be a Sunday. Take every booking start from `apps/backend/src/test/utils/date-helpers.ts`: `openSlot(n)` / `openSlotAt(n, localHour)` (the nth open day of the default test tenant, at a local hour from 9 to 15), `openDate(n)` (the date alone) and `nextOpenInstant()` (a start soon from now, for a cancellation-window case). Different `n` give different days, so specs that must not contend for one resource pass different `n`; a case that needs a closed day builds one from a closure, not from a hardcoded Sunday. An approval is judged at the booking's own time too, so a seeded booking that will be approved needs an open start as well (the lock-race world and the worklist fixtures use `openSlotAt`). Do not widen an integration tenant to 24/7 hours to make fixed times pass: it hides the check in every other spec (TD50-S00 decision 6).

### Integration app helpers — mandatory default overrides

Every integration app helper that imports a module with a network-calling adapter must default-override that adapter's token with an in-memory stub **before** the caller's overrides run (caller wins). The code pattern, the current per-helper override table and the `EVENT_BUS`/`OUTBOX_PUBLISHER` dual-token rule live once, in `docs/TESTING_STRATEGY.md` (§ Integration app helpers — mandatory default overrides for network-calling adapters); when adding a new shared module with a network-calling adapter, update every helper that imports it.

### Reuse the shared Nest cache test module

Any integration test harness that needs `CacheModule` wiring must import `apps/backend/src/test/utils/test-cache-module.ts` instead of copy-pasting `CacheModule.register(...)` inline — keeps cache TTL/store config consistent across every harness that needs it.

### NestJS module provider pattern (useClass not useExisting)

Register a replaceable adapter token with `useClass`; `useExisting` is wrong only when its target class is also registered as its own provider. See `docs/TESTING_STRATEGY.md` § Integration app helpers — mandatory default overrides for network-calling adapters (the root cause and the before/after example).

### Notification spec setup

Use `createNotificationIntegrationApp()`; suppress unrelated handlers; drain provisioning noise before recording idempotency baseline. See `docs/TESTING_STRATEGY.md`.

### Migration / entity registration

Every new migration class and TypeORM entity must be registered in `src/test/integration-global-setup.ts` (and any context helper) in the same commit as the migration: `docs/TESTING_STRATEGY.md` § Registering new migrations and entities in the global setup (MANDATORY).

### Migration specs

Do not write an integration spec for a migration. A migration's correctness is exercised by every integration suite running on top of the schema `integration-global-setup.ts` builds from it, and a spec that re-invokes `up()`/`down()` against the shared test datasource mostly tests Postgres while mutating state other suites depend on. Verify a data-moving migration (a backfill, a guard that refuses to proceed) against real data in a real environment before merging, and record the result in the story.

### Standalone index for a cross-tenant system job

`docs/DATABASE_SCHEMA.md`'s Indexing Strategy rule ("every index MUST start with `tenant_id`") has one narrow, explicit exception: a system-triggered job that deletes/scans across **every tenant in one pass, with no `tenant_id` predicate at all** — a daily retention purge (`ChatbotRetentionPurgeJob`, `LeadFormRetentionPurgeJob`), matching `ExpirePointsJob`'s own precedent. A `(tenant_id, X)` composite index can't be seeked by a query that never filters on `tenant_id` — Postgres has to fall back to a full index/table scan regardless of how well `X` alone would narrow the search, which degrades as the table grows.

When drafting a new job of this shape, check the table's existing indexes for a **standalone** index on the job's own filter column, not just a composite one that happens to include it as a trailing column. Confirmed to be missed twice in a row before being caught by review: `chatbot_messages.IDX_chatbot_messages_created_at` (added after the fact by `AddStartedAtIndexToChatbotSessions`, M19-S07) and `lead_form_submissions.IDX_platform_lead_form_submissions_expires_at` (added after the fact in M20-S04, 2026-08-25, Codex review finding on PR #422 — the story's own draft named only the pre-existing `(tenant_id, expires_at)` composite index, by habit, without checking whether the job's actual query could seek it). When a new story's job description says "mirror `<X>RetentionPurgeJob`'s shape exactly," that includes checking whether `<X>`'s table needed this same standalone-index fix — not just copying the job/handler/controller file shapes.

`packages/architecture-check/architecture-policy.json`'s `testDataHarnessRegistrations` section is the machine-checked source of truth for this — one entry per file that declares a TypeORM `entities:`/`migrations:` array (`integration-global-setup.ts` plus the 6 `src/test/utils/*-integration-app.ts`/`test-datasource.ts` helpers). `integration-global-setup.ts` is declared `"complete"` and must carry every production entity/migration; the rest are `"partial"` with an explicit, intentional `entities` subset. Adding a new entity to one of the partial helpers' code array without updating its matching policy entry (or vice versa) is flagged as drift by `pnpm architecture-check`'s `test-harness-registration` detector (TD37-S07) — update both in the same commit, not just the code.

### BFF tests

Two test files per controller: `.spec.ts` (unit) + `.component.spec.ts` (component). Helper-file isolation:
- `component-test.helpers.ts` — for component specs only
- `backend-http.mock.ts` — for unit specs only

`test:cov` must exclude component specs — coverage instruments `AppModule` at import time, triggering `validateEnv` before env vars are set.

---



### A spec that reads the real clock must not assert one fixed "earliest" time

A spec that lets the code under test read the real clock and then asserts an exact earliest start (`'14:00'`) passes most of the week and fails when it is run inside the window it describes, for example on a Monday between 14:00 and 15:00 local, when that day's earlier slot has already gone. Pass the clock in (`sweep(now)`), or assert the property the test is about (the start lies inside the 14:00–16:00 window) instead of one slot. A failing unit spec blocks the pre-push hook for everyone who pushes in that hour (`match-availability-alerts.use-case.spec.ts`, M23-S21).
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

**TD08 AUD-044 precedent, PR #484, 2026-09-16:** a local OOM kill on a KVM VM with 6GB+ free RAM traced directly to this default. Fixed by adding an explicit `--max-old-space-size` to all four backend Jest scripts (`test`, `test:unit`, `test:integration`, `test:cov`; live values in `apps/backend/package.json` — currently 5120 for `test`/`test:integration`, 3072 for `test:unit`/`test:cov`) — the first fix covered only two of the four and was caught by a PR review round.


## An integration test seeding fixtures under fixed/hardcoded tenant UUIDs needs symmetric, complete setup/teardown — CI's Testcontainers reuse can carry a prior run's corruption into an unrelated later run

**`TESTCONTAINERS_REUSE_ENABLE: 'true'` reuses the same Postgres container across separate, unrelated CI runs — a local run never reuses a container, so this class of bug is invisible locally no matter how many times you re-run the suite.** A test seeding fixtures under fixed tenant UUIDs whose `afterAll` doesn't delete every child table, in FK-safe order, for every fixture tenant, can crash mid-cleanup on one run and leave orphaned rows a *later*, unrelated run's `beforeAll` builds on top of.

Extract one cleanup helper covering every fixture tenant in FK-safe order; call it both defensively at the top of `beforeAll` and as the entirety of `afterAll` (wrapped in `try/finally`).

**TD08 AUD-045 precedent, PR #484, 2026-09-16:** a 3-tenant fixture's `afterAll` only cleaned 2 tenants' child rows; the third's FK violation aborted cleanup, and the reused CI container carried that into a later run, which failed a content assertion instead. Passed 3/3 locally; failed 2/2 on CI before the fix.


## An E2E helper that picks a date N days ahead must navigate months until the day cell is visible

The shared calendar opens on the current month and has no `calendar-next-month` test id. A helper that clicks `[data-day="<iso>"] button` directly works only while the target date falls in the month on screen, so the suite stays green for most of the month and turns red the first time a CI run lands within N days of a month end (M23-S23, 2026-10-13: the recurring-reservation specs failed on 1 Nov, and the cause looked unrelated to the PR under test).

**Fix:** one shared helper (`pickCalendarDay` in `apps/web/e2e/helpers/recurring-schedule.ts`) clicks the next-month button until the cell is visible (a bounded loop, never unbounded), and every spec uses it. Match the button by an accessible name that accepts both shipped languages (`/^(Go to the Next Month|Ir para o próximo mês)$/`), because the name follows the calendar's locale. A spec never clicks a `data-day` cell directly. When a date-dependent E2E fails in CI but not on the author's machine, check the calendar date before anything else.

## An E2E test that computes "today" itself must match the app's own tenant-timezone computation, not the runner's system clock

**This app resolves "today" as `Intl.DateTimeFormat('en-CA', { timeZone: businessHours.timezone }).format(new Date())` (tenant-local, e.g. `America/Sao_Paulo`) — a naive UTC/local "today" (`new Date().toISOString().slice(0, 10)`, or a day-offset helper anchored to the runner's own clock) diverges from it for a real ~3-hour window every single day** (00:00–03:00 UTC, when UTC's calendar date is already a day ahead of São Paulo's). A fixture built on the wrong "today" doesn't fail loudly — it silently lands on a date the app itself doesn't consider "today," making any assertion about today-specific behavior (a scroll-to-now marker, a same-day badge, a cancellation-window boundary) meaningless rather than red.

**Fix:** compute the fixture's date the exact same way the app under test does, not with a generic day-offset helper:

```ts
const tenantTodayKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
}).format(new Date());
```

**Confirmed empirically (TD44-S4, PR #516, 2026-09-26):** a new scroll-to-now E2E test used a generic `nextOpenDateKey(0)` helper (runner-clock "today") for its fixture; CI hit the divergent window twice before the fixture was switched to the tenant-timezone computation above.


## An E2E that needs a booking inside an hours-based window (cancel, reschedule) must not use a day offset — `daysAhead` counts weekdays

`parseDayOffset(daysAhead)` (`e2e/helpers/booking/slot-seed.ts`) skips Saturday and Sunday, because the seeded tenants are closed on Sunday and for part of Saturday, so `daysAhead: 1` means "the next weekday". From a Friday that is Monday, 60+ hours away, outside the 48h `cancellationWindowHours` and reschedule window. A spec asserting "inside the window" with `createFreshApprovedBooking(page, 1, …)` therefore passes Monday to Thursday and fails every Friday, Saturday and Sunday run, with nothing in the code under test to blame.

- **Inside a window measured in hours:** `createFreshApprovedBooking(page, 'soonest', …)`. `parseSoonestSlot` picks the nearest open slot between one hour and 47 hours ahead, including Saturday 08:00–14:00 (São Paulo), and throws when none fits instead of returning a start that makes the scenario assert nothing. `createFreshApprovedBooking` makes one attempt for `'soonest'`: a later open day is outside the window it exists for.
- **Outside the window:** a large weekday offset (the existing specs use 9 or more); no weekday can bring that one inside.
- `e2e/helpers/booking/slot-seed.spec.ts` sweeps every half hour of two weeks and pins the Friday-evening and Saturday-evening cases; run any new date helper the same way rather than on the day it was written. A date-dependent E2E that passes today proves nothing about tomorrow.

## An E2E fixture or assertion that depends on "what is bookable now" must trim to the clock and leave room — the availability read lists elapsed slots, and the last half hour of a day has nothing to spare

**The availability read lists the whole business day, including hours already behind the clock.** Staff and the alert sweep read the same endpoint, so it is deliberately not trimmed (`docs/BUSINESS_LOGIC_REFERENCE.md` § Booking — Booking Window). Booking a start at or before now is `422 BOOKING_SCHEDULED_IN_PAST`, and the public booking page hides slots before `now + minimum notice`. Four consequences, each of which failed CI for a different spec:

1. **A count compared with the page** (`toHaveCount(apiSlots.length)`) must come from the slots that start after now. `slotsOnDate()` in `apps/web/e2e/helpers/booking-form/flow.ts` already does this; a raw API list over-counts by every elapsed slot of today.
2. **A spec that books "the first slot" and then expects other slots for the same resource needs a day with room.** Booking blocks the slot's duration plus the service buffer, so in the last ~30 minutes before a service's final slot of the day the one slot left is also the last, everything else is already past, and the page shows none. `findFirstSlot()` therefore takes the first day with at least 8 upcoming slots and falls back to the roomiest day for a long multi-leg service that never lists that many.
3. **"The first enabled day in the strip" is not "a day with slots".** Today stays enabled after business hours with nothing left in it. Use `openFirstDayWithSlots()` (same file), which opens the first enabled day that actually lists a slot.
4. **These only reproduce with the real clock.** Moving only the helper's clock forward leaves the page's own clock behind, and the spec passes. When one fails in CI and not locally, download the run's `playwright-traces` and `server-logs` artifacts: each failed test's `error-context.md` is the page snapshot, and `trace.zip`'s `*-trace.network` plus `resources/` hold the exact slot lists the page received (`docs/CI_TRAPS.md`).

5. **A spec that must book the very slot the guest's page picked cannot recompute it.** `findFirstSlot()` skips days with fewer than 8 upcoming slots (consequence 2) while the page opens the first day that lists any slot, so late in the day they name different days: the "other customer" books tomorrow, no conflict arises and the guest's booking succeeds. Derive the slot from the day the page opened, after the guest reached the confirmation step: `firstSlotOnDate(page, serviceId, await pickFirstSlot(guest.page), picks)` (`flow.ts`). Every E2E must pass at any hour of the day; a spec that only passes in the morning has two sources of "now" that disagree.

**Confirmed empirically (M23-S33, PRs #566 and #568, 2026-10-07):** 20+ specs failed in a run at 22:14 São Paulo time (today had nothing left), 7 more at about 10:30 (the helper picked elapsed slots), and 3 at 15:52 (the one remaining slot was consumed by the spec's own booking, leaving none for the same resource) — three facets of one dependency, none visible in a single run.

**Confirmed empirically (M23-S28, 2026-10-08):** four slot-conflict specs (`booking-chosen-resource`, `booking-journey-basket` ×2, `booking-submit-routing`) were green at about 10:00 São Paulo time and red from about 13:00, on `main` as well, until they used `firstSlotOnDate()`.

## An integration test never reads the developer's `.env` — build its config module with `testConfigModule()`

**Every backend integration app, and every spec that builds its own Nest module, uses `testConfigModule()`** (`apps/backend/src/test/utils/test-config-module.ts`): `ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })`. Never a bare `ConfigModule.forRoot()` in test code. `process.env` is still merged, so what `integration-global-setup.ts` exports and what a spec sets itself keep working; only the gitignored `apps/backend/.env` is ignored.

**Why:** a bare `forRoot()` reads `apps/backend/.env` from the working directory. CI's fresh checkout has none, so a local run can differ from CI's in a way no test shows. It happened: Playwright's chatbot spec needs `CHATBOT_LLM_PROVIDER=fake` in that file, and the chatbot integration spec, which injects its own double under the `openrouter` registry key, then selected the app's built-in `FakeLlmAdapter` instead and failed 3 of 7, locally only (M23-S33 follow-up, PR #569, 2026-10-07).

**How to apply:** a new `*-integration-app.ts` helper, or an integration spec that builds its own module, imports the factory (a sibling of `testCacheModule()`). A value a spec needs goes into `process.env` in the spec or in the global setup, never into `.env`. The BFF's test code builds no `ConfigModule` today, so there is nothing equivalent to change there.

**Enforced:** `no-restricted-imports` in `apps/backend/eslint.config.js` bans importing `ConfigModule` from `@nestjs/config` in `src/test/**` and every `*.spec.ts`; `test-config-module.ts` is the one exemption. The *import* is banned, not a call shape, so an alias (`ConfigModule as CM`), a namespace import, a re-export and a computed or destructured call are all closed at once. A dynamic `import()` or `require()` is not covered.

## A fixed-time-slot booking fixture on a shared/reused tenant needs either a retry-on-conflict loop, or — check this first — no booking at all

**At least one tenant used across this repo's E2E suite (`lavacar-beloauto`) has a single degenerate LOCATION resource with no per-time-of-day capacity — any two bookings whose windows overlap at all conflict, regardless of which spec file created them.** Several specs already book "today" (`daysAhead: 0`) on this same tenant for legitimate reasons (cancellation-window edge cases), and this codebase has an established, repeated pattern for exactly this shape of problem: retry booking-creation across candidate day offsets/times on a `409`, rather than assuming a fixed slot is free (see `createUniqueScheduleBooking`, `createAuthenticatedBooking`, `createFreshApprovedBooking`). A new test that creates a booking at a fixed date+time with no retry logic will eventually collide with another spec's own fixture on the same tenant.

**Before reaching for that retry loop, check whether the feature under test actually needs a booking to exist at all.** The best fix is often to remove the fixture entirely, not to make its conflict-handling more robust.

**Confirmed empirically (TD44-S4, PR #516, 2026-09-26):** a new scroll-to-now E2E test created a real "today, 10:00" booking with no retry, which passed in isolation but later collided with an unrelated spec's own `daysAhead: 0` fixture on the same tenant, failing with `409 BOOKING_SLOT_UNAVAILABLE` on every attempt including the first. The booking turned out to be unnecessary — the feature being tested (a marker positioned from wall-clock time and business hours) renders unconditionally whether or not any booking exists on the viewed day. Removing the booking fixture removed the whole conflict class, rather than adding a matching retry-across-times loop to route around it.


## `scrollIntoView({ block: 'start' })` on a zero-height marker element is a fragile edge case for Playwright's `toBeInViewport()`

**A zero-height `<div>` scrolled with `block: 'start'` lands its top edge exactly on the viewport boundary — a fencepost case an "in viewport" intersection check can report as a 0 ratio, intermittently, even though the element genuinely exists in the DOM at the expected position.** This reproduces as CI flakiness that looks unrelated to the actual feature (the failure is "viewport ratio 0", not "element not found"), and won't necessarily reproduce locally on every run.

**Fix:** use `block: 'center'` instead of `'start'` for any zero-height (or otherwise boundary-hugging) scroll target — it clears the viewport edge entirely and, for a "scroll to this moment in time" feature, also better matches showing context on both sides rather than pinning the target to the very top.

**Confirmed empirically (TD44-S4, PR #516, 2026-09-26):** a scroll-to-now marker div using `scrollIntoView({ block: 'start' })` passed locally and in early CI rounds, then failed a later round with `toBeInViewport()` reporting a 0 ratio on the very first assertion. Switching to `block: 'center'` resolved it.


---

## A new table written from existing flows breaks fixtures in three ways the harness registration check does not cover — grep for them before the first full integration run

**When a story makes an existing flow start writing rows into a new table (an audit/history table written by every status change is the canonical case), three kinds of already-green integration fixtures fail, none of them reported by `architecture-check`'s `test-harness-registration` detector (which only covers the shared harness files, not a spec's own setup):**

1. **A spec with its own local `entities:` array.** A spec that builds its own `TypeOrmModule`/`DataSource` instead of using `createBookingIntegrationApp()` / `createTestDataSource()` lists its entities by hand. The new entity is missing, and TypeORM does not say so — `manager.insert(NewEntity, …)` fails with the unhelpful `TypeError: this.subQuery is not a function` (the class is treated as a subquery factory because it has no metadata). Grep `entities: \[` across `*.integration.spec.ts` for a spec that registers the parent entity (e.g. `BookingEntity`) but not the new one.
2. **A teardown that deletes the parent rows.** A `delete({ tenantId })` on the parent now violates the new table's composite foreign key. Delete the child rows first in every helper that deletes the parent — `afterEach`/`beforeEach` blocks *and* shared fixture helpers such as `src/test/utils/future-commitment-db-fixture.ts`. Same symmetric-teardown principle as the fixed-tenant-UUID rule above.
3. **A non-UUID or missing correlation id in test headers.** A `NOT NULL UUID` `correlation_id` column rejects `'test-correlation-id'`, and a spec that sends no `x-correlation-id` at all gets `null` (the real `CorrelationMiddleware` always substitutes a UUIDv7, but the test harness does not mount it). Use a real UUID in `actorHeaders()` and in any spec-local header helper.

**Cheapest check:** run the *full* integration project once before opening the PR, not just the specs for the touched context — in M23-S26 the failures were in `loyalty`, `notification` and `shared/outbox` specs far from the changed code, found only because the whole suite ran (76 suites).

---

## An E2E that seeds a recurring-schedule service needs one resource requirement, an explicit `AUTO_CONFIRM`, and a room of its own

**`POST /recurring-booking-schedules` refuses a service the seeded fixed service is not (`assertServiceEligible`), and answers `PENDING_APPROVAL` with no bookings when the approval mode is unset.** A plain `createService()` has no resource requirement and `defaultApprovalMode: null`, so a spec that only flips `recurrenceEligible` fails in two different, misleading ways. Seed it like this (`apps/web/e2e/helpers/recurring-schedule.ts` → `seedRecurrenceEligibleService`):

1. **Exactly one resource requirement, of a mode that matches the policy.** `resourceRequirements.length !== 1` is a `422` (`legged-or-bundled`); `RESOLVE_PER_OCCURRENCE` needs `AUTO_ANY` or `AUTO_FUNGIBLE_POOL`, `FIXED_ASSIGNMENT` needs `CUSTOMER_CHOICE`.
2. **`defaultApprovalMode: 'AUTO_CONFIRM'` in the same `setBookingPolicy` call.** `null` counts as manual, so the schedule is created `PENDING_APPROVAL` and no occurrence booking exists for the page under test to list.
3. **A room created for that one test.** Occurrences hold real slots; two specs recurring on the shared default pool answer each other `409`. A candidate-start-time loop in the creation helper covers the residual clash, and must break on any status that is not `409` and put the response body in its error — a bare status code hid the eligibility `422` above through a full CI round.

(M23-S12, 2026-10-10: four of five new scenarios failed in CI on the first two causes before a single page was exercised; the E2E had never run locally.)

---

## On a customer account or dashboard detail page every action exists twice — scope an E2E click to `action-pane-desktop`

**The action pane is rendered once for mobile (`action-pane-mobile`, `lg:hidden`) and once for desktop (`action-pane-desktop`, `hidden lg:block`), with identical `data-testid`s inside both.** At Playwright's default desktop viewport the mobile copy is `display: none`, so `getByTestId('…').first()` resolves to the hidden one and `click()` waits for visibility until it times out. Chain from the pane: `page.getByTestId('action-pane-desktop').getByTestId('end-schedule-confirm').click()` (as `my-account-detail-cancel.spec.ts` already does for the cancel button). A list that is rendered only once (an occurrence row's skip link) does not need this.

## An E2E that asserts a tenant-wide number (a sidebar badge, a total) races with parallel specs on the shared tenant — assert how it moved, not what it is

**The Reservas a resolver badge counts every open entry of the tenant, and other specs in the same run raise and close entries on that tenant.** An exact `toHaveText(String(openBefore))` before and `openBefore - 2` after passes alone and flakes in CI. Assert a bound the spec itself guarantees: `>= 2` before, and `<= openBefore - 2` after (`expect.poll` with a helper that reads the badge, 0 when it is hidden). Find the spec's own rows by a name it created (a fresh room name), never by position or total. A helper that leaves rows behind must clean them up: `seedWorklistEntries().cleanup()` cancels the bookings still active on the shared rooms before deactivating them, so entries do not pile up on the tenant.

Related: when the point of the spec is that a *cache* is refreshed, navigate client-side (see `docs/ENGINEERING_RULES_FRONTEND.md` § A mutation that changes server state owned by another feature must invalidate that feature's query keys).

## An E2E that navigates to the public booking page goes through `gotoBookingPage()` — a bare `goto()` races with the streamed second copy of the wizard

The booking page wraps its form in a Suspense boundary, so for a moment after `load` the hidden streaming segment (`<div hidden id="S:0">`) holds a second copy of the wizard beside the visible one, until React swaps it in. Playwright's strict mode throws at once on a locator that matches both (`strict mode violation: getByTestId('step-service-selection') resolved to 2 elements`), so the same spec passes or fails with the runner's speed. The page is fine; the test looked too early. Navigate with `gotoBookingPage(page, path)` (`apps/web/e2e/helpers/booking-form/goto.ts`), which waits until no hidden streaming segment is left. Do not paper over it with `.first()` or a retry: that hides a second element that should not be there. The first failure is in the trace's frame snapshot (look for `div#S:0[hidden]` next to the wizard), not in the error text.

## Concurrency tests — a tenant per scenario, deterministic first, and a test that passes without the lock is not coverage

Where the strategy lives: `docs/TESTING_STRATEGY.md` § Concurrency Tests; the lock-to-test map: `docs/LOCK_CATALOG.md` § 3.1. The rules a new concurrency test follows:

- **A tenant of its own per scenario** (`createLockRaceWorld`: fresh tenant id, tenant row, two rooms, one service). Nothing is shared, so a failing scenario leaves nothing another test can trip over and no cleanup is needed on a reused database (the staff race test failed once on rows left by an earlier run). The tenant row is required: the events these flows publish are handled by listeners that read the tenant's settings.
- **Prefer the deterministic lock contract to a race.** Hold the lock (`holdTransaction`, `holdResourceLocks`), start the operation, `Promise.race` the blocked-lock probe against the operation finishing (so a missing lock fails with a clear message instead of a timeout), assert it has not finished, release in a `finally`, then assert the result. Use a race loop only to check an invariant a contract test cannot, with 3 to 6 rounds, a fresh world per round, and `expectNoDeadlock`.
- **Scope the blocked-lock probe.** `waitForBlockedLock(ds, kind, since)` counts only sessions that began waiting after `since` (`databaseNow`), so a waiter left over from another test can never satisfy it.
- **Mutation-check every new test.** Remove or bypass the lock in the production code (keep the variable used, or the file will not compile and "0 tests ran" looks like a pass), run the test, confirm it fails, and revert in a separate step. Two tests this story first wrote passed without the lock: the service-row "waits" test (a held `FOR UPDATE` blocks the writer's own `UPDATE` anyway) and the two-request HTTP race for the last manager (the requests never overlapped). Both were dropped or replaced; a test that passes either way gives false assurance.
- **Never feed `it.each` a tuple row shorter than the callback's parameter list.** Jest then passes `done` as the extra argument and the test waits for a callback that never comes, failing only when its timeout runs out (nine scenarios, nine minutes). Map each row to an object: `it.each(rows.map(([name, prepare]) => ({ name, prepare })))('$name', async ({ prepare }) => …)`.
- **A test that holds a lock must not make the waiter wait more than 2s**, because every transaction now fails with `TransactionContentionError` after `DB_LOCK_TIMEOUT_MS` (M23-S49). The contract tests release as soon as the blocked-lock probe sees the waiter; a test that means to outlast the timeout asserts that error instead (`run-in-new-transaction.integration.spec.ts`). To prove a pooled connection does not carry the timeout, use a `DataSource` with `extra: { max: 1 }`.
- **Run an integration spec under `timeout`** when iterating (`timeout 240 pnpm test:integration -- <file>`), so a hang costs seconds.
- **A spec that builds its own TypeORM entity list** must include every entity the code under test now reads. `outbox-full-topology` returned 500 on approve until `FutureCommitmentExceptionEntity` was added, because approve began reading the booking's open worklist entries.

## A test of URL composition uses a base URL shaped like the deployed one and different from the local default

A URL that is composed from configuration (a public host, a bucket) is correct only if the test configures it the way a deployed environment does. Local and CI shared one convention (a bucket-inclusive value) that the web's resolver relied on and Terraform did not provide, so every unit test and E2E passed while staging showed broken images (TD56-S07, 2026-10-25).

- Give the test double or the config a base URL that **differs from the local default** in host, in path shape and in whether it carries the bucket (`https://img.example.test/public-bucket`), and assert the whole composed URL, not a suffix.
- A test that passes only because local and CI agree proves nothing about a deployed environment. Where a value can be wrong only after deploy, add an E2E assertion on the real result (an `<img>` with `naturalWidth > 0` and a `src` on the backend-resolved host) instead of on the input.
- Trace how the consumer composes an app-consumed environment variable before you wire its value (`infra/terraform/README.md` § Gotchas).

## Billing provider tests *(planned)* — a forgiving fake, a real clock or a shared contract gap each hide a money bug

> **PLANNED, NOT YET BUILT** (Billing milestone). The strategy and the environment matrix are in `docs/TESTING_STRATEGY.md` § Testing the billing provider — fake, sandbox, contract suite and clock; this section is only the writing-time traps.

- **The fake must reproduce the provider's verified quirks, not an idealised flow.** If `FakeBillingProvider` emitted one clean "paid" event for every method, a handler that waits for `CONFIRMED` would pass every test and lock out every Pix payer in production (the verified per-method event sequences are in `docs/TESTING_STRATEGY.md` § Testing the billing provider — fake, sandbox, contract suite and clock). Every webhook handler spec drives the duplicate, delayed and out-of-order variants, not just the happy path.
- **Never stub `BillingProviderPort` with `jest.fn()`.** Use the fake double (`FakeBillingProvider` is also a real adapter wired in `local`). `no-jest-fn-for-repository-or-port` recognises a port by an `I…Port` name or a `/ports/` path, so declare the interface under `application/ports/`; it does not inspect `Test.createTestingModule(...).overrideProvider(...).useValue(...)`, so there the fake is a convention you keep by hand. A spec that needs a provider failure asks the fake to fail the next call.
- **Every Billing date decision reads `IClock`.** A spec that sets `Date.now()` or a hard-coded calendar date passes today and fails on the wrong day (the shared-builder date rule above applies: compute dates relative to the injected clock). Trial end, due date, grace and purge age are tenant-local midnights in `subscriptions.timezone`; assert at least one non-UTC zone.
- **A change to the port's behaviour changes the contract suite first.** The same suite runs against the fake (every PR) and the sandboxes (nightly); adding an assertion only on the fake side defeats the proof that the swap is safe.
- **A concurrency spec for the subscription row lock** (a payment webhook racing the status sweep) uses the pattern in § Concurrency tests — a tenant per scenario, deterministic first, and a test that fails without the lock (`docs/LOCK_CATALOG.md` B-R1).


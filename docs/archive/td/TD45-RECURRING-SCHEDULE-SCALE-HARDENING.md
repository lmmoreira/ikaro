# TD45 — Recurring Schedule Scale Hardening

## Status
- **Type**: Technical Debt / Performance & Scalability
- **Priority**: Low (no correctness impact; MVP-scale car-wash tenants are unlikely to hit either ceiling soon, but both degrade linearly/unboundedly as usage grows)
- **Context**: apps/backend — booking context (`RecurringBookingSchedule`, M23-S04)
- **Created**: 2026-09-28
- **Discovered**: Codex round-3 `/pr-review` of PR #521 (M23-S04), both findings declined for that PR as out-of-scope (not correctness bugs; no pagination was ever part of the documented API contract) and tracked here instead
- **Decision status**: Story 0 shipped (PR #532). Story 1 discovered 2026-09-29 and ready for implementation.
- **Related**: M23-S04 (`plan/M23-MULTIVERTICAL-APPOINTMENT-BOOKING.md`), `docs/14-API_CONTRACTS.md` § Recurring Private Reservation Schedules

## Problem

`RecurringBookingSchedule`'s creation-time conflict check and its list endpoint were both shipped in M23-S04 without a batching/pagination story, since M23-S04's own AC never called for either (weekly-recurrence-only MVP, 90-day default horizon, a per-resource/service cap of 50 active schedules). As tenants accumulate schedules and use longer horizons, two hot paths degrade:

1. **Creation-time conflict check is O(occurrences), not O(1)** — `assertPatternConflictFree()` in `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.ts` loops over every enumerated occurrence and calls `assertOccurrenceFree()` — a full `resolveBookingLinesResourceCandidates()` + `BookingSlotConflictService.assertSlotFree()` round-trip per occurrence. `enumerateRecurrenceOccurrences()` can produce up to ~90 occurrences for a daily pattern at the default 90-day horizon, so a single `POST /recurring-booking-schedules` can issue up to ~90 sequential DB round-trips, all inside the same advisory-locked transaction — inflating request latency and holding the lock (and the DB connection) longer than necessary.
2. **`GET /recurring-booking-schedules` has no pagination** — `TypeOrmRecurringBookingScheduleRepository.findAllByTenant()` / `ListRecurringBookingSchedulesUseCase` return every matching row with no `limit`/`offset`. `docs/14-API_CONTRACTS.md`'s documented contract for this endpoint has no pagination params. A STAFF/MANAGER "approval queue" view or a long-lived customer account will eventually load every schedule row for the tenant in one response, unbounded.

Neither is a correctness defect — 671+674 backend tests pass on PR #521, and the PR is otherwise merge-ready. Both are scale ceilings worth closing before the M23-S05 generation worker and heavier production usage compound the same shapes elsewhere.

## Story 0 — Batch the recurring-schedule creation-time conflict check into O(1) queries per pattern ✅ Done

**Agent:** backend-ts
**Complexity:** M
**Docs to load:** `docs/ENGINEERING_RULES_BACKEND.md` § Transactions, `docs/02-DOMAIN_MODEL.md` § RecurringBookingSchedule
**Dependencies:** none
**Pattern:** plain composition — load the eligible resources once, run one overlap query, decide per occurrence in memory; no new named pattern

**Description:** `assertPatternConflictFree()` in `recurring-booking-schedule-request.helpers.ts` currently calls `assertOccurrenceFree()` once per enumerated occurrence (up to ~90 at the default 90-day horizon), each doing its own `resolveBookingLinesResourceCandidates()` (resource load) + `BookingSlotConflictService.assertSlotFree()` (advisory lock + overlap query) — roughly 3 × N DB calls for `FIXED_ASSIGNMENT` and 4–5 × N for `RESOLVE_PER_OCCURRENCE`. Replace the loop, for **all three** selection modes, with a fixed number of calls independent of N (locked in story-discovery, 2026-09-29; the original "leave `RESOLVE_PER_OCCURRENCE` as-is" default was rejected — this check is on the core booking path and must stay fast for every policy):

1. **Load the eligible resources once.** `FIXED_ASSIGNMENT`: the caller-chosen resource(s), validated with the same rules `resolveRequirementResources` applies today (active, matching type, inside `resourcePoolIds`). `AUTO_ANY`/`AUTO_FUNGIBLE_POOL`: the tenant's active resources of the requirement's type, pool-restricted — export `resolveEligibleResources` from `resource-requirement-resolution.helpers.ts` rather than duplicating it.
2. **Build one window per (resource × occurrence).** `startsAt = occurrenceStart`, `endsAt = occurrenceStart + durationMinutes + effectiveFlatGapMinutes(service.bufferAfterMinutes ?? 0, resource.turnoverMinutes)` — the same per-resource gap math the current single-line path uses.
3. **Lock the whole eligible set once** via `ITenantLockPort.lockResources()` (the adapter already sorts and dedupes ids, so overlapping sets can't deadlock). The lock is `pg_advisory_xact_lock`, held until the transaction ends — a few milliseconds, since no network I/O runs inside `txManager.run()`. Today only each occurrence's chosen resource is locked; locking the full eligible set for `AUTO_*` is a deliberate small widening that preserves today's serialization against concurrent one-off bookings.
4. **Run one overlap query** through a new `IResourceOccupancyRepository.findConflictingWindows(tenantId, windows, excludeBookingLineIds?)` that returns the conflicting input `(resourceId, startsAt, endsAt)` pairs. Same SQL as `findConflictingResourceIds` (`unnest` + `tstzrange &&`, `lock_state IN ('HOLD','COMMITTED')`, `tenant_id = $1`) with the window columns selected instead of `DISTINCT resource_id`. `findConflictingResourceIds` now derives from it (`distinct resourceId` of the conflicting windows) so the overlap SQL lives in exactly one place.
5. **Decide per occurrence in memory:** `FIXED_ASSIGNMENT` — reject on any conflicting window for the chosen resource; `AUTO_ANY` — reject an occurrence only if **every** eligible resource conflicts in its window (the workload sort never affects accept/reject, so it is dropped); `AUTO_FUNGIBLE_POOL` — the first eligible resource must be free, exactly as `resolveRequirementResources` behaves today (it picks `eligible[0]` with no free-filter — existing behavior, preserved, out of scope to change here). Any rejection throws `RecurringBookingScheduleConflictError`.

Preserved behavior: zero occurrences remain a no-op (return before loading anything); resolution errors (inactive/wrong-type/missing resource) surface as today; `assertNoActiveScheduleOverlap`, the cap check and `lockForCapCheck` in `request-recurring-booking-schedule.use-case.ts` are untouched. Because step 5 re-implements a small "is any eligible resource free" rule outside the shared resolution helper, a **parity test** is mandatory: it runs the batched check and the old per-occurrence loop (`resolveBookingLinesResourceCandidates` + `assertSlotFree`) over the same seeded occupancy and asserts identical accept/reject — this is what guards against the two drifting apart.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.ts` (modify — rewrite `assertPatternConflictFree`, remove `assertOccurrenceFree`)
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.spec.ts` (**new** — does not exist today)
- `apps/backend/src/contexts/booking/application/use-cases/resource-requirement-resolution.helpers.ts` (modify — export `resolveEligibleResources`)
- `apps/backend/src/contexts/booking/application/ports/resource-occupancy-repository.port.ts` (modify — add `findConflictingWindows`)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-resource-occupancy.repository.ts` (modify — implement it)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-resource-occupancy.repository.integration.spec.ts` (modify — `findConflictingWindows` scenarios)
- `apps/backend/src/test/repositories/booking/in-memory-resource-occupancy.repository.ts` (modify — implement it in the test double, same REQUESTED-exclusion semantics)
- `apps/backend/src/contexts/booking/infrastructure/controllers/recurring-booking-schedule.controller.integration.spec.ts` (modify — real-DB conflict scenarios)

**Acceptance criteria — product:**
- [ ] Creating a recurring schedule issues a fixed number of DB calls for the conflict check regardless of how many occurrences the pattern implies (long horizon / daily pattern is not slower than a single weekly occurrence), for `FIXED_ASSIGNMENT`, `AUTO_ANY` and `AUTO_FUNGIBLE_POOL`.

**Acceptance criteria — technical:**
- Unit (new `recurring-booking-schedule-request.helpers.spec.ts`, using `jest.spyOn` on the `InMemoryResourceOccupancyRepository`/`InMemoryTenantLock` doubles — never a `jest.fn()` port stub):
  - [ ] `FIXED_ASSIGNMENT` conflicting on only the 5th of N occurrences is rejected, with exactly one `lockResources` call and one `findConflictingWindows` call
  - [ ] `FIXED_ASSIGNMENT` with no conflict is accepted, with one call each
  - [ ] `AUTO_ANY` is accepted when at least one eligible resource is free in every occurrence window, and rejected when every eligible resource is busy in one occurrence
  - [ ] `AUTO_FUNGIBLE_POOL` is rejected when the first eligible resource is busy, even if another is free (parity with today)
  - [ ] Zero occurrences make no repository or lock calls
  - [ ] Per-resource turnover gap is applied to each resource's own window
  - [ ] Parity: batched result equals the old per-occurrence loop for the same seeded occupancy across all three modes
- Integration:
  - [ ] `findConflictingWindows` returns exactly the conflicting `(resourceId, window)` pairs, ignores REQUESTED rows and honors `excludeBookingLineIds` (`typeorm-resource-occupancy.repository.integration.spec.ts`)
  - [ ] `POST /recurring-booking-schedules` (FIXED_ASSIGNMENT) with a real `resource_occupancy` row on only the 5th weekly occurrence returns 409 and persists no schedule; the same request without the row returns 201
  - [ ] Same 409/201 pair for an `AUTO_ANY` service (all eligible resources busy on one occurrence vs. one free)
- Tenant isolation:
  - [ ] Tenant B's occupancy in the same time window never blocks tenant A's request (unit + integration)
- E2E: none — covered by existing M23-S04 E2E scope (S12)
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

## Story 1 — Paginate GET /recurring-booking-schedules ✅ Done

**Agent:** backend-ts + bff-ts
**Complexity:** S
**Docs to load:** `docs/14-API_CONTRACTS.md` § Recurring Private Reservation Schedules, § Pagination Strategy (Pattern A), `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer
**Dependencies:** none (independent of Story 0)
**Pattern:** plain composition — mirrors `IBookingRepository.findAllByTenantPaginated` / `ListBookingsUseCase` exactly; no new pattern

**Description:** Add offset pagination and an optional `status` filter to `GET /recurring-booking-schedules`, following the Booking list precedent (locked in story-discovery, 2026-09-29):

1. **Query params** (backend Zod DTO `list-recurring-booking-schedules.dto.ts`, mirroring `list-bookings.dto.ts`): `limit` (int, 1–100, default 25), `offset` (int ≥ 0, default 0), `status` (optional, single `RecurringBookingSchedule` status: `PENDING_APPROVAL|ACTIVE|PAUSED|CANCELLED`). Omitting `status` returns every status — the filter narrows, it never changes what the unfiltered list means. M23-S13's approval queue passes `status=PENDING_APPROVAL`.
2. **Response** (Pattern A, additive): `{ items, pagination: { limit, offset, total, hasMore } }`. `items` keeps its shape and position.
3. **Behavior change, stated explicitly:** an unparameterized request now returns the first 25 rows (newest first) plus `pagination.total`/`hasMore`, instead of every row. No production caller exists yet (no `apps/web` code calls this endpoint), so nothing breaks; M23-S12/S13 consume the paginated shape from day one.
4. **Repository:** replace the unbounded `findAllByTenant` on `IRecurringBookingScheduleRepository` with `findAllByTenantPaginated(tenantId, filters: { customerId?, status?, limit, offset }): Promise<{ items, total }>`, using `findAndCount` ordered `createdAt DESC, id DESC` (the `id` tie-breaker keeps rows from skipping or duplicating across page boundaries, per the Booking precedent). The one spec helper still calling `findAllByTenant` (`request-recurring-booking-schedule.use-case.spec.ts`) moves to the paginated method, so no unbounded read remains on the port. Child rows stay unhydrated, as today.
5. **BFF:** `limit`/`offset`/`status` validated by a BFF Zod query schema with the same bounds, then forwarded to the backend; the response type gains `pagination`. Still a thin proxy — actor scoping stays backend-side.

**Backend HTTP surface:** extends `GET /recurring-booking-schedules` (customer sees own via `actorId`; STAFF|MANAGER see all). No new endpoint.

**BFF endpoint spec:** `GET /recurring-booking-schedules?limit=&offset=&status=` → `Roles('CUSTOMER','MANAGER','STAFF')`, response as above.

**New migration / i18n keys / env vars / feature flags:** none. (`(tenant_id, status, approval_hold_expires_at)` and `(tenant_id, customer_id, status)` already cover the filtered reads.)

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/dtos/list-recurring-booking-schedules.dto.ts` (**new**)
- `apps/backend/src/contexts/booking/application/ports/recurring-booking-schedule-repository.port.ts` (modify — replace `findAllByTenant`, extend filters)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-recurring-booking-schedule.repository.ts` (modify)
- `apps/backend/src/test/repositories/booking/in-memory-recurring-booking-schedule.repository.ts` (modify — same order/paging semantics)
- `apps/backend/src/contexts/booking/application/use-cases/list-recurring-booking-schedules.use-case.ts` (+ spec) (modify)
- `apps/backend/src/contexts/booking/application/use-cases/request-recurring-booking-schedule.use-case.spec.ts` (modify — spec helper off `findAllByTenant`)
- `apps/backend/src/contexts/booking/infrastructure/controllers/recurring-booking-schedule.controller.ts` (+ spec) (modify — query parsing)
- `apps/backend/http/booking/recurring-booking-schedules.http` (modify — paginated/filtered GET examples)
- `apps/bff/src/features/booking/recurring-booking-schedules.controller.ts` (+ spec) (modify)
- `apps/bff/src/features/booking/recurring-booking-schedules.schemas.ts` (modify — query schema)
- `apps/bff/src/features/booking/recurring-booking-schedules.types.ts` (modify — `pagination`)
- `docs/14-API_CONTRACTS.md` (modify — new params, defaults, response)

**Acceptance criteria — product:**
- [ ] `GET /recurring-booking-schedules` returns a bounded, newest-first page with `pagination.total`/`hasMore`, so a client can walk every schedule for the tenant (or for one customer) page by page.
- [ ] `status=PENDING_APPROVAL` returns only pending schedules, paginated; omitting `status` returns every status.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `ListRecurringBookingSchedulesUseCase` passes `limit`/`offset`/`status`/`customerId` through and computes `hasMore`
  - [ ] Omitted params resolve to `limit=25, offset=0`, no status filter
  - [ ] Empty result returns `items: []`, `total: 0`, `hasMore: false`
  - [ ] DTO rejects `limit` 0/101 and negative `offset` (backend) and the same in the BFF query schema
  - [ ] In-memory double orders `createdAt DESC, id DESC` and pages identically to the TypeORM adapter
- Integration:
  - [ ] Repository: N+1 seeded rows, page size N → N rows, second page → remainder, `total` = N+1
  - [ ] Repository: rows sharing one `createdAt` never skip or duplicate across a page boundary
  - [ ] Repository: `status` filter returns only matching rows and `total` counts only them
  - [ ] Controller (real DB): a CUSTOMER pages only their own schedules; STAFF pages all; `limit=101` → 400
- Tenant isolation:
  - [ ] Tenant B's schedules never appear in tenant A's page and never count toward `total` (unit + integration)
- E2E: none — no UI consumes this yet; M23-S12/S13 own the UI E2E
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

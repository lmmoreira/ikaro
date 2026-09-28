# TD45 — Recurring Schedule Scale Hardening

## Status
- **Type**: Technical Debt / Performance & Scalability
- **Priority**: Low (no correctness impact; MVP-scale car-wash tenants are unlikely to hit either ceiling soon, but both degrade linearly/unboundedly as usage grows)
- **Context**: apps/backend — booking context (`RecurringBookingSchedule`, M23-S04)
- **Created**: 2026-09-28
- **Discovered**: Codex round-3 `/pr-review` of PR #521 (M23-S04), both findings declined for that PR as out-of-scope (not correctness bugs; no pagination was ever part of the documented API contract) and tracked here instead
- **Decision status**: Ready for discovery and implementation in the order below; individual stories still begin with `/story-discovery`
- **Related**: M23-S04 (`plan/M23-MULTIVERTICAL-APPOINTMENT-BOOKING.md`), `docs/14-API_CONTRACTS.md` § Recurring Private Reservation Schedules

## Problem

`RecurringBookingSchedule`'s creation-time conflict check and its list endpoint were both shipped in M23-S04 without a batching/pagination story, since M23-S04's own AC never called for either (weekly-recurrence-only MVP, 90-day default horizon, a per-resource/service cap of 50 active schedules). As tenants accumulate schedules and use longer horizons, two hot paths degrade:

1. **Creation-time conflict check is O(occurrences), not O(1)** — `assertPatternConflictFree()` in `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.ts` loops over every enumerated occurrence and calls `assertOccurrenceFree()` — a full `resolveBookingLinesResourceCandidates()` + `BookingSlotConflictService.assertSlotFree()` round-trip per occurrence. `enumerateRecurrenceOccurrences()` can produce up to ~90 occurrences for a daily pattern at the default 90-day horizon, so a single `POST /recurring-booking-schedules` can issue up to ~90 sequential DB round-trips, all inside the same advisory-locked transaction — inflating request latency and holding the lock (and the DB connection) longer than necessary.
2. **`GET /recurring-booking-schedules` has no pagination** — `TypeOrmRecurringBookingScheduleRepository.findAllByTenant()` / `ListRecurringBookingSchedulesUseCase` return every matching row with no `limit`/`offset`. `docs/14-API_CONTRACTS.md`'s documented contract for this endpoint has no pagination params. A STAFF/MANAGER "approval queue" view or a long-lived customer account will eventually load every schedule row for the tenant in one response, unbounded.

Neither is a correctness defect — 671+674 backend tests pass on PR #521, and the PR is otherwise merge-ready. Both are scale ceilings worth closing before the M23-S05 generation worker and heavier production usage compound the same shapes elsewhere.

## Story 0 — Batch the recurring-schedule creation-time conflict check into O(1) queries per pattern

**Agent:** backend-ts
**Complexity:** M
**Docs to load:** `docs/ENGINEERING_RULES_BACKEND.md` § Transactions, `docs/02-DOMAIN_MODEL.md` § RecurringBookingSchedule
**Dependencies:** none
**Pattern:** plain composition — replaces a per-occurrence loop with a batched query; no new named pattern

**Description:** `assertPatternConflictFree()` in `recurring-booking-schedule-request.helpers.ts` currently calls `assertOccurrenceFree()` once per enumerated occurrence (up to ~90 at the default 90-day horizon), each doing its own `resolveBookingLinesResourceCandidates()` + `BookingSlotConflictService.assertSlotFree()` round-trip. For `FIXED_ASSIGNMENT` (a fixed, caller-chosen resource), replace this with a single query checking `resource_occupancy` overlap against all occurrence windows at once (e.g. one query with an `OR`'d set of time ranges, or a GiST range-overlap check keyed by the resource, matching the exclusion-constraint style already used elsewhere per `docs/13-DATABASE_SCHEMA.md`). `RESOLVE_PER_OCCURRENCE` has no fixed resource to batch against upfront (per-occurrence resolution is inherent to that policy) — leave its loop as-is unless discovery finds a safe batching shape for it too. Story-discovery must confirm the batched query produces identical accept/reject results to the current per-occurrence loop for every existing unit/integration test scenario before this ships.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.ts` (modify — `assertPatternConflictFree`/`assertOccurrenceFree`)
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.spec.ts` (modify/new — batched-query unit coverage)
- `apps/backend/src/contexts/booking/infrastructure/controllers/recurring-booking-schedule.controller.integration.spec.ts` (modify — a scenario with a multi-occurrence pattern conflicting on only one of its occurrences, proving the batched check still finds it)

**Acceptance criteria — product:**
- [ ] Creating a recurring schedule with a long horizon/daily pattern is not noticeably slower than creating one with a single weekly occurrence.

**Acceptance criteria — technical:**
- Unit:
  - [ ] Batched conflict query rejects when any one of N occurrences overlaps existing occupancy
  - [ ] Batched conflict query accepts when no occurrence overlaps
- Integration:
  - [ ] A multi-occurrence FIXED_ASSIGNMENT request conflicting on only its 5th occurrence is rejected in one round-trip, not five
- Tenant isolation:
  - [ ] Conflict check never compares occupancy across tenants
- E2E: none — covered by existing M23-S04 E2E scope (S12)
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

## Story 1 — Paginate GET /recurring-booking-schedules

**Agent:** backend-ts + bff-ts
**Complexity:** S
**Docs to load:** `docs/14-API_CONTRACTS.md` § Recurring Private Reservation Schedules, `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer
**Dependencies:** none (independent of Story 0)
**Pattern:** plain composition — mirrors `findAllByTenantPaginated`'s existing precedent on `IBookingRepository`/`TypeOrmBookingRepository`

**Description:** Add `limit`/`offset` (or cursor, matching whichever style `findAllByTenantPaginated` already established for Booking) query params to `GET /recurring-booking-schedules`, threaded through `ListRecurringBookingSchedulesUseCase` and a new `findAllByTenantPaginated()` on `IRecurringBookingScheduleRepository`/`TypeOrmRecurringBookingScheduleRepository`, mirroring the existing `IBookingRepository.findAllByTenantPaginated` shape exactly rather than inventing a new pagination convention. Update `docs/14-API_CONTRACTS.md`'s documented contract for this endpoint to state the new params and default page size. BFF passes the params through unchanged (thin proxy, per the existing `RecurringBookingSchedulesController` comment).

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/ports/recurring-booking-schedule-repository.port.ts` (modify — add `findAllByTenantPaginated`)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-recurring-booking-schedule.repository.ts` (modify)
- `apps/backend/src/contexts/booking/application/use-cases/list-recurring-booking-schedules.use-case.ts` (+ spec) (modify)
- `apps/backend/src/contexts/booking/infrastructure/controllers/recurring-booking-schedule.controller.ts` (+ spec) (modify — query param parsing)
- `apps/bff/src/features/booking/recurring-booking-schedules.controller.ts` (+ schemas, spec) (modify)
- `docs/14-API_CONTRACTS.md` (modify — document the new params)

**Acceptance criteria — product:**
- [ ] STAFF/MANAGER's approval-queue view and a customer's own schedule list both page correctly once schedule counts exceed one page.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `ListRecurringBookingSchedulesUseCase` passes limit/offset through and returns a bounded page
  - [ ] Omitted params default to the existing (unpaginated-looking but actually page-1) behavior — no breaking change for existing callers
- Integration:
  - [ ] Seeding N+1 schedules and requesting page size N returns exactly N, with a second page returning the remainder
- Tenant isolation:
  - [ ] Pagination never leaks another tenant's rows into a page
- E2E: none — covered by existing M23-S04 E2E scope (S12)
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

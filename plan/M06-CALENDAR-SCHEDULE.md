# M06 — Calendar & Schedule Availability

**Phase:** Local Development  
**Goal:** A guest can call the availability endpoint and receive a list of bookable time slots for a given date and set of services. An admin can close specific dates (full day or a partial time window) to block new bookings, and can open normally-closed days (e.g., a Sunday) as a one-off exception. The availability algorithm implements a three-layer resolution — `ScheduleOpening` > `ScheduleClosure` > `business_hours` — and accounts for partial closures at slot level.  
**Depends on:** M05 (service durations drive availability), M02-S06 (settings provide business hours + buffer)  
**Blocks:** M07 (booking creation must re-verify slot availability)

---

## Stories

---

### M06-S01 — ScheduleClosure aggregate domain + migration (partial-day support) ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § ScheduleClosure, `docs/04-USE_CASES.md` § UC-010a/b, `docs/13-DATABASE_SCHEMA.md` § booking schema

**Description:**  
Implement (or update) the `ScheduleClosure` aggregate with support for both **full-day** and **partial-day** closures. A full-day closure has `startTime = null, endTime = null`. A partial closure carries explicit `startTime`/`endTime` (HH:MM). The availability algorithm (M06-S03) will treat them differently: a full-day closure voids the whole date; a partial closure blocks only the overlapping slots.

> **Note:** The initial implementation of M06-S01 only supported full-day closures. This story extends it to the complete model described in the domain docs.

**Domain layer — `ScheduleClosure` aggregate:**
- Properties: `id` (UUID v7), `tenantId`, `date` (YYYY-MM-DD), `startTime: string | null` (HH:MM), `endTime: string | null` (HH:MM), `reason` (`STAFF_DAY_OFF | MAINTENANCE | HOLIDAY`), `notes: string | null`, `createdBy` (staffId), `createdAt`
- Factory: `ScheduleClosure.close({ tenantId, date, reason, createdBy, resourceId?, startTime?, endTime?, notes? })` — a single input object, not positional args (M21-S03 refactor; `resourceId` added by M21 Cluster 1 — see `docs/02-DOMAIN_MODEL.md`)
- Invariants:
  - `date` is not in the past (UTC date comparison)
  - `startTime` and `endTime` are both null or both set (never one without the other)
  - When set: `endTime > startTime` (validated as HH:MM string comparison)
  - Valid HH:MM format when set (00:00–23:59)
- `reconstitute()` skips validation for DB reads

**Helpers:**
- `closure.isFullDay(): boolean` → `startTime === null`
- `closure.overlaps(otherStart: string | null, otherEnd: string | null): boolean` → used by use case to detect conflicts before persisting

**Migration update: `booking.schedule_closures`**

Drop the old `UNIQUE(tenant_id, date)` constraint (cannot use a simple unique index for arbitrary time-range overlap). Add `start_time` and `end_time` columns:

```sql
-- New columns added to existing table
start_time  TIME      NULLABLE   ← null = full-day closure
end_time    TIME      NULLABLE   ← null = full-day closure

-- Constraint: both null or both set
CHECK (
  (start_time IS NULL AND end_time IS NULL) OR
  (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
)

-- Keep INDEX (tenant_id) and INDEX (tenant_id, date) for queries
-- Remove UNIQUE (tenant_id, date) — overlap enforcement is in the use case
```

> Since the migration runs as a separate step before deploy (expand/contract), the `start_time`/`end_time` columns are nullable — existing rows default to null (full-day), which is correct behaviour.

**Repository port `IScheduleClosureRepository`:**
- `findByTenantAndDateRange(tenantId, from, to): Promise<ScheduleClosure[]>` — returns ALL closures (full + partial) sorted by date ASC, then startTime ASC nulls first
- `findByTenantAndDate(tenantId, date): Promise<ScheduleClosure[]>` — returns all closures for that date (may be multiple partials or one full-day)
- `findById(id, tenantId): Promise<ScheduleClosure | null>`
- `save(closure): Promise<void>`
- `delete(id, tenantId): Promise<void>`

> Note: `findByTenantAndDate` signature changes from returning `ScheduleClosure | null` to `ScheduleClosure[]` — a date may now have multiple partial closures.

**Test builders:**
- `ScheduleClosureBuilder` — expose `withStartTime(t)` / `withEndTime(t)` fluent methods
- `ScheduleClosureEntityBuilder` — expose same methods

**Acceptance criteria:**
- [ ] `ScheduleClosure.close(...)` with past date throws domain error
- [ ] `startTime` set without `endTime` (or vice versa) throws domain error
- [ ] `endTime <= startTime` throws domain error
- [ ] Full-day closure: `startTime = null, endTime = null` → `isFullDay() = true`
- [ ] Partial closure: `startTime = "10:00", endTime = "12:00"` → `isFullDay() = false`
- [ ] `overlaps()` returns true when two partial windows overlap; false when they don't
- [ ] Migration adds `start_time`/`end_time` columns; `down()` removes them
- [ ] `findByTenantAndDate` returns all closures for a date sorted by startTime
- [ ] All queries filter by `tenant_id`
- [ ] Unit tests: ≥15 covering all invariants, overlaps, full-day vs partial

**Dependencies:** M00-S08, M00-S07

---

### M06-S02 — UC-010a/b: Admin manages schedule closures (full-day + partial) ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-010a/b, `docs/14-API_CONTRACTS.md` § Schedule Closures

**Description:**  
Implement the use cases and endpoints for creating, listing, and removing schedule closures. Supports both full-day and partial closures. The use case enforces the no-overlap invariant that the DB cannot express as a unique index.

**Backend use cases:**
- `CloseScheduleUseCase` — validates: date not past; no conflicting closure on same `(tenantId, date)` window; creates `ScheduleClosure`, persists
  - Conflict check: if new closure is full-day → any existing closure on date is a conflict; if new closure is partial → any existing closure whose window overlaps is a conflict; full-day existing + new partial → conflict
- `RemoveClosureUseCase` — finds closure by `(id, tenantId)`, deletes it

**Conflict detection (use case layer, not DB):**
```
existing = repo.findByTenantAndDate(tenantId, date)
if existing.any(c => c.overlaps(newStartTime, newEndTime)):
    throw ScheduleAlreadyClosedError(date)
```

**Error → HTTP mapping (`booking-error.mapper.ts`):**
- `ClosureDateInPastError` → `422`
- `ScheduleAlreadyClosedError` → `409`
- `ScheduleClosureNotFoundError` → `404`

**BFF endpoints:**
- `GET /v1/schedule/closures?from=YYYY-MM-DD&to=YYYY-MM-DD` — JWT + `MANAGER|STAFF`; returns list sorted by date ASC
- `POST /v1/schedule/closures` — JWT + `MANAGER|STAFF`
  ```json
  { "date": "2026-12-26", "reason": "HOLIDAY", "startTime": "10:00", "endTime": "12:00", "notes": "..." }
  ```
  `startTime`/`endTime` optional — omit for full-day; returns `201`
- `DELETE /v1/schedule/closures/:id` — JWT + `MANAGER|STAFF`; returns `204`

**Acceptance criteria:**
- [ ] Full-day closure: `POST` with no `startTime`/`endTime` → `201`; `isFullDay() = true` on returned entity
- [ ] Partial closure: `POST` with `startTime`/`endTime` → `201`; only that window blocked
- [ ] Past date → `422`
- [ ] Overlapping partial closure on same date → `409`
- [ ] Full-day closure when any partial already exists on that date → `409`
- [ ] `DELETE` removes closure; `GET` no longer returns it
- [ ] `GET ?from=&to=` returns all closures in range
- [ ] Customer role on POST/DELETE → `403`
- [ ] Tenant isolation: DELETE closure from another tenant → `404`

**Dependencies:** M06-S01, M03-S05

---

### M06-S03 — Availability calculation domain service (3-layer resolution) ✅ Done

**Agent:** `backend-ts`  
**Complexity:** L  
**Docs to load:** `docs/04-USE_CASES.md` § UC-011 (full algorithm), `docs/02-DOMAIN_MODEL.md` § Three-Layer Schedule Resolution, `docs/21-TENANTS_SETTINGS_SCHEMA.md` § business_hours + buffer_minutes

**Description:**  
Implement the `AvailabilityService` domain service — the core algorithm that calculates free booking slots. Implements the three-layer schedule resolution: `ScheduleOpening` > `ScheduleClosure` > `business_hours`. Must be thoroughly unit-tested with no database or HTTP dependencies.

**Algorithm inputs:**
- `date` — the requested date (YYYY-MM-DD, in tenant timezone)
- `services[]` — the services being requested (durations summed)
- `tenantSettings` — provides `business_hours`, `service_buffer_minutes`, `slot_granularity_minutes`, `timezone`
- `closures[]` — all `ScheduleClosure` records for that date (full-day and partial)
- `opening: ScheduleOpening | null` — the `ScheduleOpening` for that date, if any
- `existingBookings[]` — all APPROVED bookings for that date

**Three-layer resolution (in order):**
1. If `opening` exists → `effectiveHours = { open: opening.startTime, close: opening.endTime }`; skip closures + business_hours
2. Else if `business_hours[dayOfWeek] = null` → return `[]`
3. Else if any closure is full-day (`isFullDay() = true`) → return `[]`
4. Else → `effectiveHours = business_hours[dayOfWeek]`; filter slots blocked by partial closures

**Slot generation:**
- Generate candidate start times at `slot_granularity_minutes` intervals within `effectiveHours`
- Total required duration: `SUM(service.durationMinutes) + service_buffer_minutes`
- For each candidate slot: check it and all consecutive required slots are within `effectiveHours`, not overlapping any partial closure window, and not overlapping any APPROVED booking window
- Return available start times as ISO-8601 UTC datetime strings (convert from tenant timezone)

**Acceptance criteria:**
- [ ] `ScheduleOpening` exists → uses opening hours; ignores closures and business_hours
- [ ] `ScheduleOpening` exists but APPROVED booking fills it → correctly blocks overlapping slots
- [ ] Day-of-week is `null` in business_hours, no opening → returns `[]`
- [ ] Day-of-week is `null` in business_hours, opening exists → returns slots within opening window
- [ ] Full-day `ScheduleClosure` → returns `[]`
- [ ] Partial closure `10:00–12:00` → slots in that window blocked; slots outside it remain
- [ ] Multiple partial closures on same day → all blocked windows respected
- [ ] 2 services × 30 min + 15 min buffer = 75 min; slots generated correctly
- [ ] APPROVED booking 10:00–11:00 blocks overlapping slots
- [ ] Business hours 08:00–18:00, 75 min duration, 15 min granularity → correct slot count
- [ ] All slots returned as UTC ISO-8601 strings
- [ ] 20+ unit tests: opening override, closed day, full-day closure, partial closure, booking overlap, buffer, edge of hours, no services

**Dependencies:** M06-S01, M06-S06, M02-S01

**Implementation observations (added after delivery):**

*Why a domain service and not a use case?* `AvailabilityService` is a pure computation (no I/O, no ports, no side effects) that will be called by two use cases: M06-S04 (guest views calendar) and M07 booking creation (re-verifies slot before persisting). A use case calling another use case is an anti-pattern; the correct abstraction is a domain service. Rule of thumb: if it has no `execute()`, no actor, no repository calls, and multiple callers need it — it's a domain service.

*`existingBookings[]` is a parameter, not a fetch.* The service receives APPROVED bookings as input — it doesn't know where they come from. The use case (M06-S04) is responsible for loading them. This keeps the domain service fully testable without a database and makes it reusable by M07 with zero changes.

*Buffer is part of the booked window, not a gap.* `totalMins = SUM(service.durationMinutes) + service_buffer_minutes`. The buffer is included in the blocked calendar window `[startsAt, startsAt + totalMins)`. This means a 60-min service with 15-min buffer occupies 75 min on the calendar — the next booking can only start once the full 75-min window has cleared.

*Slot granularity controls start times only.* A 75-min booking with 30-min granularity does NOT round up to 90 min. The granularity (`slot_granularity_minutes`) only determines where candidate start times land on the clock (09:00, 09:30, 10:00…). The actual blocked window is always the raw `totalMins`.

*UTC output, local input.* Business hours and the requested `date` are in the tenant's timezone; the service converts every slot start/end to UTC ISO-8601 for storage/API. Luxon was added as a dependency for this (`localDateTimeToUTCIso`, `utcDateToLocalHHMM` — see `shared/utils/calendar-date.ts`).

*Shared utilities extracted during this story:*
- `shared/utils/calendar-date.ts` — `getUtcWeekDayName`, `localDateTimeToUTCIso`, `utcDateToLocalHHMM`. Any future code needing timezone conversion imports from here.
- `TimeOfDay` VO gained `toMinutes()`, `fromMinutes()`, `addMinutes()` — HH:MM arithmetic now lives on the VO that owns the type, not scattered as inline helpers.
- `overlaps(aStart, aEnd, bStart, bEnd)` stays private in `AvailabilityService` — it's a single-use algorithm helper, not a VO concern. `TimeOfDay` is a point in time, not an interval; interval overlap belongs to a hypothetical future `TimeRange` VO.
- `IScheduleTenantSettingsPort` was extended with `getBookingSettings()` (adapter + in-memory double updated) to expose `slot_granularity_minutes` and `service_buffer_minutes` to the use case layer.

---

### M06-S04 — UC-011: Guest views calendar availability ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-011, `docs/14-API_CONTRACTS.md` § schedule/availability endpoint

**Description:**  
Wire up the availability domain service (M06-S03) into a use case and expose it as a public REST endpoint. This endpoint is called by the hotsite booking form — no authentication required, only `X-Tenant-Slug`.

**Backend use case `GetAvailabilityUseCase`:**
1. Resolve `tenantId` from slug (via `ITenantRepository.findBySlug`)
2. Load tenant settings
3. Load services by `serviceIds[]` (validate all belong to this tenant + are active)
4. Load existing APPROVED bookings for the requested date
5. Load all `ScheduleClosures` for `(tenantId, date)` — both full-day and partial
6. Load `ScheduleOpening` for `(tenantId, date)` if any
7. Call `AvailabilityService.calculate(...)` with all inputs → slot list
8. Return available slots

**BFF endpoint:** `GET /v1/schedule/availability`
- **Public** — requires only `X-Tenant-Slug` header
- Query params: `date=YYYY-MM-DD`, `serviceIds=uuid,uuid`
- Returns: `{ date, slots: [{ startsAt: 'ISO-8601', endsAt: 'ISO-8601' }], available: boolean }`

**Acceptance criteria:**
- [ ] `GET /v1/schedule/availability?date=2026-06-01&serviceIds=<id>` returns a list of available slots
- [ ] A date with a full-day `ScheduleClosure` returns `{ slots: [], available: false }`
- [ ] A date with a partial `ScheduleClosure` (e.g., 10:00–12:00) returns only slots outside that window
- [ ] A normally-closed day with a `ScheduleOpening` returns slots within the opening window
- [ ] Requesting a `serviceId` that doesn't belong to the tenant returns `400`
- [ ] Requesting a deactivated service returns `400`
- [ ] `date` in the past returns `422`
- [ ] No JWT required — request with only `X-Tenant-Slug` works
- [ ] Integration test: create a service + an APPROVED booking → verify that slot is blocked in availability response

**Dependencies:** M06-S03, M06-S06, M05-S03, M03-S05

---

### M06-S05 — Availability edge case tests + tenant isolation ✅ Done

**Agent:** `test-ts`  
**Complexity:** M  
**Docs to load:** `docs/08-TESTING_STRATEGY.md` § tenant isolation pattern, `docs/06-TENANT_ISOLATION_STRATEGY.md`

**Description:**  
Write a dedicated integration test suite for both availability endpoints (single-date detail and range summary) covering edge cases and tenant isolation. Requires Testcontainers.

**Test scenarios — single-date endpoint (`GET /schedule/availability`)**

Closure + opening scenarios:
- Date has a full-day `ScheduleClosure` → returns `[]`
- Date has a partial `ScheduleClosure` (10:00–12:00) → slots outside window still available; slots in window blocked
- Date has multiple partial closures → all blocked windows respected
- Date has a `ScheduleOpening` → uses opening hours; full-day closure on same date is ignored (opening wins)
- Day-of-week is `null` in business_hours, `ScheduleOpening` exists → slots within opening window returned

Booking + tenant isolation:
- Two tenants with bookings on the same date — Tenant A's booking does not affect Tenant B's availability
- All slots taken by existing bookings → returns `{ available: false, slots: [] }`
- A CANCELLED booking does NOT block slots (only APPROVED blocks)
- `serviceIds` from Tenant B while querying as Tenant A → `400`
- Date exactly on business hours boundary (first and last slots are edge cases)
- `ScheduleOpening` exists but APPROVED booking fills the window → correct partial availability

**Test scenarios — range summary endpoint (`GET /schedule/availability/summary`)**

- Week range (7 days): returns 7 entries, one per date
- Day with full-day closure → `{ available: false, slotCount: 0 }` in result
- Day with ScheduleOpening on a Sunday → `{ available: true }` in result
- Range spanning closed + open days returns correct mix
- Tenant isolation: Tenant A's bookings do not affect Tenant B's summary
- Past dates in range → `{ available: false, slotCount: 0 }` without error
- `from > to` → 422
- Range > 90 days → 422

**Acceptance criteria:**
- [ ] All scenarios above have dedicated integration tests with descriptive names
- [ ] Tenant isolation verified for both endpoints
- [ ] Testcontainers PostgreSQL used for all integration assertions
- [ ] No `.skip()`, `.only()`, or `setTimeout`
- [ ] Tests run under 30 seconds

**Dependencies:** M06-S04, M06-S08

---

### M06-S08 — Calendar availability summary endpoint (range) ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-011 two-phase flow, `docs/14-API_CONTRACTS.md` § Customer Availability, `docs/02-DOMAIN_MODEL.md` § IBookingAvailabilityPort

**Description:**  
Implement the range-based availability summary endpoint — Phase 1 of the two-phase calendar UX. A single call loads all data for the requested date range in 3 DB queries, runs `AvailabilityService.calculate()` per day in memory, and returns a lightweight per-day summary `[{ date, available, slotCount }]`.

**Port extension — `IBookingAvailabilityPort`:**
Add `findApprovedByTenantAndDateRange(tenantId, from, to): Promise<BookedSlot[]>`.
- Update `InMemoryBookingAvailabilityPort` (test) with a sensible default (filter by date range using `utcDateToLocalDate`)
- Update `InMemoryBookingAvailabilityAdapter` (production stub) to return `[]`

**New domain error:**
- `AvailabilityRangeInvalidError` → 422 (`from > to`, or `to - from > max_booking_advance_days`)

**New DTO — `GetAvailabilitySummaryDto`:**
```typescript
{ from: string; to: string; serviceIds: string[] }
```
Zod schema: `from`, `to` as YYYY-MM-DD regex; `serviceIds` comma-split → `z.array(z.uuid()).min(1)`.

**New use case — `GetAvailabilitySummaryUseCase`:**
1. Validate `from ≤ to`; range ≤ `bookingSettings.max_booking_advance_days`
2. Load services by IDs; validate all exist and active
3. Load in parallel: `closures = findByTenantAndDateRange(from, to)`, `openings = findByTenantAndDateRange(from, to)`, `bookings = findApprovedByTenantAndDateRange(from, to)`
4. Load `businessHours` + `bookingSettings` via settings port
5. For each date in `[from..to]` (inclusive):
   - Filter `closures`, `openings`, `bookings` for this date
   - Call `AvailabilityService.calculate({date, closures: dayClosures, opening: dayOpening, existingBookings: dayBookings, ...})`
   - Push `{ date, available: slots.length > 0, slotCount: slots.length }`
6. Return array

Result type: `GetAvailabilitySummaryUseCaseResult = Array<{ date: string; available: boolean; slotCount: number }>`

**Backend controller:** `GET /schedule/availability/summary` — no auth, `TenantContext` from `X-Tenant-ID` header.

**BFF controller:** `GET /v1/schedule/availability/summary` — `@Public()`, `X-Tenant-Slug` required, slug→tenantId resolution, calls `getForPublic`.

**Acceptance criteria:**
- [ ] `GET /v1/schedule/availability/summary?from=2026-06-01&to=2026-06-07&serviceIds=<id>` returns 7 entries
- [ ] Day with full-day closure → `{ available: false, slotCount: 0 }`
- [ ] Sunday (null in business_hours, no opening) → `{ available: false, slotCount: 0 }`
- [ ] Sunday with ScheduleOpening → `{ available: true, slotCount: > 0 }`
- [ ] Past dates → `{ available: false, slotCount: 0 }` (no error)
- [ ] `from > to` → 422
- [ ] Range > 90 days → 422
- [ ] Unknown/inactive serviceId → 400
- [ ] No JWT required — public endpoint
- [ ] Unit tests follow `beforeEach` pattern; ≥8 tests on use case, ≥5 on controller
- [ ] BFF unit + component specs included

**Dependencies:** M06-S04, M06-S03

---

### M06-S06 — ScheduleOpening aggregate domain + migration ✅ Done

**Agent:** `backend-ts`  
**Complexity:** S  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § ScheduleOpening, `docs/04-USE_CASES.md` § UC-010c/d, `docs/13-DATABASE_SCHEMA.md` § booking.schedule_openings

**Description:**  
Implement the `ScheduleOpening` aggregate and its infrastructure. `ScheduleOpening` is the inverse of `ScheduleClosure`: it opens a normally-closed day (one whose day-of-week is `null` in `business_hours`) for a specific time window. The availability algorithm (M06-S03) checks for an opening first, before consulting `business_hours`.

**Domain layer — `ScheduleOpening` aggregate:**
- Properties: `id` (UUID v7), `tenantId`, `date` (YYYY-MM-DD), `startTime` (HH:MM, required), `endTime` (HH:MM, required), `notes: string | null`, `createdBy` (staffId), `createdAt`
- Factory: `ScheduleOpening.open({ tenantId, date, startTime, endTime, createdBy, resourceId?, notes? })` — a single input object, not positional args (M21-S03 refactor; `resourceId` added by M21 Cluster 1 — see `docs/02-DOMAIN_MODEL.md`)
- Invariants:
  - `date` is not in the past
  - `endTime > startTime` (HH:MM string comparison)
  - Valid HH:MM format for both fields
- `reconstitute()` skips validation for DB reads

**Migration: `booking.schedule_openings`**
```sql
id          UUID PRIMARY KEY
tenant_id   UUID NOT NULL
date        DATE NOT NULL
start_time  TIME NOT NULL
end_time    TIME NOT NULL  CHECK (end_time > start_time)
notes       TEXT
created_by  UUID NOT NULL
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()

INDEX (tenant_id)
UNIQUE (tenant_id, date)   ← one opening per date per tenant
```

**Repository port `IScheduleOpeningRepository`:**
- `findByTenantAndDate(tenantId, date): Promise<ScheduleOpening | null>`
- `findByTenantAndDateRange(tenantId, from, to): Promise<ScheduleOpening[]>`
- `findById(id, tenantId): Promise<ScheduleOpening | null>`
- `save(opening): Promise<void>`
- `delete(id, tenantId): Promise<void>`

**Test utilities:**
- `ScheduleOpeningBuilder` in `src/test/builders/booking/`
- `ScheduleOpeningEntityBuilder` in `src/test/builders/booking/`
- `InMemoryScheduleOpeningRepository` in `src/test/repositories/booking/`
- Add `ScheduleOpeningEntity` to `integration-global-setup.ts` and `test-datasource.ts`
- Register `SCHEDULE_OPENING_REPOSITORY` in `BookingModule`

**Acceptance criteria:**
- [ ] `ScheduleOpening.open(...)` with past date throws domain error
- [ ] `endTime <= startTime` throws domain error
- [ ] Migration runs and reverts cleanly; `UNIQUE(tenant_id, date)` enforced at DB level
- [ ] `findByTenantAndDate` returns null when no opening exists
- [ ] All queries filter by `tenant_id`
- [ ] Unit tests: ≥8 covering all invariants and reconstitute

**Dependencies:** M06-S01, M00-S08

---

### M06-S07 — UC-010c/d: Admin manages schedule openings ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-010c/d, `docs/14-API_CONTRACTS.md` § Schedule Openings

**Description:**  
Implement use cases and endpoints for creating and removing schedule openings. The use case must validate that the selected date's day-of-week is `null` in `business_hours` — creating an opening for a day that is already open in the regular schedule is not allowed.

**Backend use cases:**
- `OpenScheduleUseCase` — validates: date not past; day-of-week is closed in `business_hours`; no `ScheduleOpening` already exists for `(tenantId, date)`; creates and persists `ScheduleOpening`
- `RemoveScheduleOpeningUseCase` — finds opening by `(id, tenantId)`, deletes it

**Domain errors to add (`booking-domain.error.ts`):**
- `OpeningDateInPastError` → `422`
- `DayAlreadyOpenInSettingsError` → `422`
- `ScheduleOpeningAlreadyExistsError` → `409`
- `ScheduleOpeningNotFoundError` → `404`

**BFF endpoints:**
- `GET /v1/schedule/openings?from=YYYY-MM-DD&to=YYYY-MM-DD` — JWT + `MANAGER|STAFF`
- `POST /v1/schedule/openings` — JWT + `MANAGER|STAFF`
  ```json
  { "date": "2026-12-28", "startTime": "09:00", "endTime": "14:00", "notes": "..." }
  ```
  Returns `201`
- `DELETE /v1/schedule/openings/:id` — JWT + `MANAGER|STAFF`; returns `204`

**Backend also needs:**
- `IScheduleOpeningRepository` injected into `OpenScheduleUseCase` via `SCHEDULE_OPENING_REPOSITORY`
- `ITenantRepository` (or settings port) to read `business_hours` — use the existing `TenantSettingsPort` pattern from M02

**Acceptance criteria:**
- [ ] `POST /v1/schedule/openings` on a day already open in `business_hours` → `422`
- [ ] `POST /v1/schedule/openings` on a past date → `422`
- [ ] `POST /v1/schedule/openings` when opening already exists → `409`
- [ ] `POST /v1/schedule/openings` on a valid normally-closed day → `201`; subsequent availability call for that date returns slots
- [ ] `DELETE /v1/schedule/openings/:id` → `204`; date reverts to closed
- [ ] `GET /v1/schedule/openings?from=&to=` returns all openings in range
- [ ] Customer role on POST/DELETE → `403`
- [ ] Tenant isolation: DELETE opening from another tenant → `404`

**Dependencies:** M06-S06, M06-S02, M03-S05

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
- Factory: `ScheduleClosure.close(tenantId, date, reason, createdBy, startTime?, endTime?, notes?)`
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

### M06-S03 — Availability calculation domain service (3-layer resolution)

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

---

### M06-S04 — UC-011: Guest views calendar availability

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

### M06-S05 — Availability edge case tests + tenant isolation

**Agent:** `test-ts`  
**Complexity:** M  
**Docs to load:** `docs/08-TESTING_STRATEGY.md` § tenant isolation pattern, `docs/06-TENANT_ISOLATION_STRATEGY.md`

**Description:**  
Write a dedicated test suite for availability edge cases and tenant isolation. This is a separate story from M06-S04 because the edge cases are numerous and the tenant isolation tests require Testcontainers setup.

**Test scenarios to cover:**

Closure + opening scenarios:
- Date has a full-day `ScheduleClosure` → returns `[]`
- Date has a partial `ScheduleClosure` (10:00–12:00) → slots outside window still available; slots in window blocked
- Date has multiple partial closures → all blocked windows respected
- Date has a `ScheduleOpening` → uses opening hours; full-day closure on same date is ignored (opening wins)
- Day-of-week is `null` in business_hours, `ScheduleOpening` exists → slots within opening window returned

Booking + tenant isolation scenarios:
- Two tenants with bookings on the same date — Tenant A's booking does not affect Tenant B's availability
- All slots taken by existing bookings → returns `[]`
- A CANCELLED booking does NOT block slots (only APPROVED blocks)
- `serviceIds` from Tenant B while querying as Tenant A → `400`
- Date exactly on business hours boundary (first and last slots are edge cases)
- `ScheduleOpening` exists but APPROVED booking fills the window → correct partial availability

**Acceptance criteria:**
- [ ] All scenarios above have dedicated integration tests with descriptive names
- [ ] Tenant isolation: Tenant A's booked slot does NOT block Tenant B's availability
- [ ] Testcontainers PostgreSQL used for all integration assertions
- [ ] No `.skip()`, `.only()`, or `setTimeout`
- [ ] Tests run under 30 seconds

**Dependencies:** M06-S04

---

### M06-S06 — ScheduleOpening aggregate domain + migration ✅ Done

**Agent:** `backend-ts`  
**Complexity:** S  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § ScheduleOpening, `docs/04-USE_CASES.md` § UC-010c/d, `docs/13-DATABASE_SCHEMA.md` § booking.schedule_openings

**Description:**  
Implement the `ScheduleOpening` aggregate and its infrastructure. `ScheduleOpening` is the inverse of `ScheduleClosure`: it opens a normally-closed day (one whose day-of-week is `null` in `business_hours`) for a specific time window. The availability algorithm (M06-S03) checks for an opening first, before consulting `business_hours`.

**Domain layer — `ScheduleOpening` aggregate:**
- Properties: `id` (UUID v7), `tenantId`, `date` (YYYY-MM-DD), `startTime` (HH:MM, required), `endTime` (HH:MM, required), `notes: string | null`, `createdBy` (staffId), `createdAt`
- Factory: `ScheduleOpening.open(tenantId, date, startTime, endTime, createdBy, notes?)`
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

### M06-S07 — UC-010c/d: Admin manages schedule openings

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

# M06 — Calendar & Schedule Availability

**Phase:** Local Development  
**Goal:** A guest can call the availability endpoint and receive a list of bookable time slots for a given date and set of services. An admin can close specific dates to block new bookings. The availability algorithm correctly accounts for business hours, existing bookings, closures, service durations, and the buffer between appointments — all read from tenant settings.  
**Depends on:** M05 (service durations drive availability), M02-S06 (settings provide business hours + buffer)  
**Blocks:** M07 (booking creation must re-verify slot availability)

---

## Stories

---

### M06-S01 — ScheduleClosure aggregate domain + migration

**Agent:** `backend-ts`  
**Complexity:** S  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § ScheduleClosure, `docs/04-USE_CASES.md` § UC-010, `docs/13-DATABASE_SCHEMA.md` § booking schema

**Description:**  
Implement the `ScheduleClosure` aggregate (domain + migration) that represents a day or period when the tenant is not available for bookings.

**Domain layer:**
- `ScheduleClosure` aggregate:
  - Properties: `id` (UUID v7), `tenantId`, `date` (ISO date, `YYYY-MM-DD`), `reason` (`STAFF_DAY_OFF | MAINTENANCE | HOLIDAY`), `notes?`, `createdBy` (staffId), `createdAt`
  - Methods: `close(tenantId, date, reason, createdBy)` (static factory)
  - Invariants: `date` cannot be in the past, `reason` must be one of the 3 enum values

**Migration: `booking.schedule_closures`**
```sql
id          UUID PRIMARY KEY
tenant_id   UUID NOT NULL
date        DATE NOT NULL
reason      VARCHAR(50) NOT NULL CHECK (reason IN ('STAFF_DAY_OFF','MAINTENANCE','HOLIDAY'))
notes       TEXT
created_by  UUID NOT NULL           ← staffId
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()

INDEX (tenant_id)
UNIQUE (tenant_id, date)            ← one closure per day per tenant
```

**Repository port `IScheduleClosureRepository`:**
- `findByTenantAndDateRange(tenantId, from, to): Promise<ScheduleClosure[]>`
- `findByTenantAndDate(tenantId, date): Promise<ScheduleClosure | null>`
- `save(closure): Promise<void>`
- `delete(id, tenantId): Promise<void>`

**Acceptance criteria:**
- [ ] Creating two closures for the same tenant on the same date causes a unique constraint violation
- [ ] Creating a closure for a past date throws a domain error
- [ ] Migration runs and reverts cleanly
- [ ] `findByTenantAndDateRange` returns closures sorted by date ascending
- [ ] All queries include `WHERE tenant_id = :tenantId`
- [ ] Unit test: `ScheduleClosure.close(...)` with a past date throws

**Dependencies:** M00-S08, M00-S07

---

### M06-S02 — UC-010: Admin closes schedule

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-010, `docs/14-API_CONTRACTS.md` § schedule endpoints

**Description:**  
Implement the use cases and endpoints for managing schedule closures. An admin can add a closure for a specific date, remove an existing closure, and list all closures in a date range.

**Backend use cases:**
- `CloseScheduleUseCase` — validates date not in past + not already closed, creates `ScheduleClosure`, persists
- `OpenScheduleUseCase` — finds closure by `(id, tenantId)`, deletes it

**BFF endpoints:**
- `POST /v1/schedule/closures` — requires JWT + `MANAGER|STAFF`; body: `{ date: 'YYYY-MM-DD', reason, notes? }`; returns `201`
- `DELETE /v1/schedule/closures/:id` — requires JWT + `MANAGER|STAFF`; returns `204`
- `GET /v1/schedule/closures` — requires JWT + `MANAGER|STAFF`; query: `?from=YYYY-MM-DD&to=YYYY-MM-DD`; returns list

**Acceptance criteria:**
- [ ] `POST /v1/schedule/closures` with a past date returns `422` with pt-BR error message
- [ ] `POST /v1/schedule/closures` with a date already closed returns `409`
- [ ] `DELETE /v1/schedule/closures/:id` removes the closure; subsequent availability check for that date shows slots again
- [ ] `GET /v1/schedule/closures?from=2026-01-01&to=2026-01-31` returns all closures in January 2026
- [ ] Customer role calling POST/DELETE returns `403`
- [ ] Tenant isolation: cannot delete a closure from another tenant (returns `404`)

**Dependencies:** M06-S01, M03-S05

---

### M06-S03 — Availability calculation domain service

**Agent:** `backend-ts`  
**Complexity:** L  
**Docs to load:** `docs/04-USE_CASES.md` § UC-011 (full algorithm description), `docs/21-TENANTS_SETTINGS_SCHEMA.md` § business_hours + buffer_minutes

**Description:**  
Implement the `AvailabilityService` domain service — the core algorithm that calculates free booking slots for a given date and list of services. This is the most complex piece of domain logic in the system. It must be thoroughly unit-tested with no database or HTTP dependencies.

**Algorithm inputs:**
- `tenantId` — to load settings and existing bookings
- `date` — the requested date (`YYYY-MM-DD`, in tenant timezone)
- `serviceIds[]` — the services being requested (durations summed)
- `tenantSettings` — provides `business_hours`, `buffer_minutes`, `timezone`
- `existingBookings[]` — all APPROVED bookings for that date (from repository)
- `closures[]` — any `ScheduleClosure` records for that date

**Algorithm steps (from UC-011):**
1. Convert `date` to tenant timezone; if `ScheduleClosure` exists for that date → return empty list immediately
2. Look up `business_hours` for that day-of-week from `tenantSettings`; if day is closed → return empty list
3. Calculate total required duration: `SUM(service.durationMinutes)` + `buffer_minutes`
4. Generate candidate slots at `buffer_minutes` granularity between `open` and `close` times
5. For each candidate slot, check if `[slot_start, slot_start + required_duration]` overlaps with any existing APPROVED booking's window
6. Return non-overlapping slots as ISO-8601 UTC datetime strings

**Acceptance criteria:**
- [ ] No tenant settings in memory = closure → returns `[]`
- [ ] Day-of-week is closed in business hours → returns `[]`
- [ ] Date has a `ScheduleClosure` → returns `[]`
- [ ] 2 services of 30 min each + 15 min buffer = 75 min total required duration; slots are generated correctly
- [ ] An existing APPROVED booking from 10:00–11:00 blocks slots that would overlap [10:00, 11:00]
- [ ] Business hours 08:00–18:00 with 75 min duration and 15 min granularity generates exactly the correct number of slots
- [ ] All slot times are returned in UTC (not tenant local time) — UI converts for display
- [ ] 15+ unit tests covering: closed day, closure, overlap, buffer, edge of business hours, no services

**Dependencies:** M06-S01, M02-S01

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
5. Load closures for the requested date
6. Call `AvailabilityService.calculate(...)` → slot list
7. Return available slots

**BFF endpoint:** `GET /v1/schedule/availability`
- **Public** — requires only `X-Tenant-Slug` header
- Query params: `date=YYYY-MM-DD`, `serviceIds=uuid,uuid`
- Returns: `{ date, slots: [{ startsAt: 'ISO-8601', endsAt: 'ISO-8601' }], available: boolean }`

**Acceptance criteria:**
- [ ] `GET /v1/schedule/availability?date=2026-06-01&serviceIds=<id>` returns a list of available slots
- [ ] A date with a `ScheduleClosure` returns `{ slots: [], available: false }`
- [ ] Requesting a `serviceId` that doesn't belong to the tenant returns `400`
- [ ] Requesting a deactivated service returns `400`
- [ ] `date` in the past returns `422`
- [ ] No JWT required — request with only `X-Tenant-Slug` works
- [ ] Integration test: create a service + an APPROVED booking → verify that slot is blocked in availability response

**Dependencies:** M06-S03, M05-S03, M03-S05

---

### M06-S05 — Availability edge case tests + tenant isolation

**Agent:** `test-ts`  
**Complexity:** M  
**Docs to load:** `docs/08-TESTING_STRATEGY.md` § tenant isolation pattern, `docs/06-TENANT_ISOLATION_STRATEGY.md`

**Description:**  
Write a dedicated test suite for availability edge cases and tenant isolation. This is a separate story from M06-S04 because the edge cases are numerous and the tenant isolation tests require Testcontainers setup.

**Test scenarios to cover:**
- Two tenants with overlapping bookings on the same date — Tenant A's booking does not affect Tenant B's availability
- All slots taken by existing bookings → returns empty slots list
- Business hours that span midnight (e.g., 22:00–02:00 next day — edge case to handle)
- Request for `serviceIds` from Tenant B while authenticated as Tenant A → `400`
- Date exactly on business hours boundary (first and last slots)
- A booking that was CANCELLED does NOT block slots (only APPROVED blocks)
- Two services with different tenants' durations — isolation confirmed

**Acceptance criteria:**
- [ ] All 7 edge case scenarios have dedicated tests with descriptive names
- [ ] Tenant isolation test: Tenant A's booked slot does NOT appear as unavailable in Tenant B's availability query
- [ ] Test using real Testcontainers PostgreSQL (no mocks for availability domain service tests — use in-memory data)
- [ ] No `.skip()`, `.only()`, or `setTimeout` in test files
- [ ] Tests run in under 30 seconds

**Dependencies:** M06-S04

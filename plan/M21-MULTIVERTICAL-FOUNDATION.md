# M21 — Multi-Vertical Scheduling: Foundation

**Phase:** Local Development
**Goal:** Introduce the `Resource` aggregate — the generic bookable unit (`LOCATION`/`STAFF`/`ROOM`/`EQUIPMENT`) that every subsequent Multi-Vertical Scheduling milestone builds on — plus resource-scoped schedule closures/openings, giving a manager the first piece of the domain model needed to represent a business as something other than "the whole tenant is the resource."
**Depends on:** none (first milestone of the Multi-Vertical Scheduling sequence)
**Blocks:** M22 (Service Extensions & Availability Engine), M23 (Appointment Booking & Extensions), M24 (Classes & Sessions) — all three depend on `Resource` existing.
**Design rationale:** `docs/discovery/multivertical-booking/multivertical-booking.md` §3, §9 items 1/6/9/11 (promoted via `/discovery-to-milestone` on 2026-08-31) — kept as the permanent *why*; this file and the canonical docs it cites (`docs/04-USE_CASES.md` UC-044–049, UC-010e/f, `docs/02-DOMAIN_MODEL.md` § Booking Context, `docs/03-DOMAIN_EVENTS.md`, `docs/05-BOUNDED_CONTEXTS.md`, `docs/13-DATABASE_SCHEMA.md`, `docs/14-API_CONTRACTS.md`) are the source of truth for implementation — nothing below should require opening the discovery doc to understand.

## Non-Goals

- **Every other Cluster 1–4 concept** (`Service.resourceRequirements`/`legs`, the `resource_occupancy` exclusivity engine, class templates/sessions, recurring reservations, contracts) — deferred to M22/M23/M24. This milestone's own `Resource` aggregate is deliberately inert beyond scheduling itself: nothing yet references it from a `Service`.
- **Multi-location resourcing** — one tenant remains one physical unit in this phase (ties to `CLAUDE.md` §12's open decision; the `Resource` model leaves room for a location dimension later without attempting to resolve §12 here).
- **The manager multi-resource day grid (UC-057)** — promoted as part of Cluster 2, not this milestone; it depends on the availability engine's resource-scoped query, not merely on `Resource` existing.

## Build order

| Wave | Story | Theme |
|---|---|---|
| 1 | M21-S01 | `Resource` aggregate — backend CRUD (create/edit/deactivate/reactivate/list) + BFF endpoints + `StaffDeactivated` cascade consumer (UC-044–049) |
| 2 | M21-S02 | LOCATION backfill migration for every existing tenant |
| 2 | M21-S03 | Resource-scoped schedule closures/openings — backend + BFF (UC-010e, UC-010f) |
| 3 | M21-S04 | Manager "Recursos" frontend — list/create/edit-hours/deactivate/reactivate |
| 4 | M21-S05 | Staff/Manager "Horários" resource-scoped extension frontend — resource picker + scoped calendar |

```mermaid
graph TD
  S01 --> S02
  S01 --> S03
  S02 --> S04
  S01 --> S04
  S03 --> S05
  S04 --> S05
```

**Wave note (corrected during this milestone's own self-dry-run):** S05 was originally proposed as Wave 3, parallel with S04. The mechanical supplying-endpoint check found `ResourcePicker` (S05) needs S04's `useResources()` hook to populate its dropdown — nothing else in this milestone supplies a resource-list read for the frontend. S05 is therefore **Wave 4**, sequential after S04, not parallel with it.

**Likely-independent stories (preview — not authoritative):** S02 and S03 share no files (S02 touches only a new migration + backfill script scoped to `resources`/`service_resource_requirements`* seams; S03 touches `schedule_closures`/`schedule_openings` entities, repositories, controllers, and their `.http` files) and have no `Dependencies:` edge between them — a candidate `/run-batch` pair once S01 lands. `/run-batch` re-derives this live at run time; this is a courtesy preview, not a green light.

---

### M21-S01 — `Resource` aggregate + backend CRUD + BFF endpoints + `StaffDeactivated` cascade consumer

**Agent:** `backend-ts` + `bff-ts`
**Complexity:** L
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Booking Context (`Resource` aggregate), `docs/13-DATABASE_SCHEMA.md` § `booking.resources`, `docs/14-API_CONTRACTS.md` § Resource Management, `docs/04-USE_CASES.md` UC-044–049, `docs/05-BOUNDED_CONTEXTS.md` § Booking Context / Staff Context (`StaffDeactivated` consumer), `docs/AGENT_PATTERNS.md` Pattern #1 (port+adapter), `docs/24-BFF_ARCHITECTURE.md` § Module & Controller Naming Conventions, `docs/ENGINEERING_RULES.md` § RequestContext (tenant business hours: controller reads `RequestContext.settings.businessHours`, forwards as an explicit DTO field — `IBookingPlatformPort`/`AvailabilityService` do NOT carry a tenant-hours lookup, corrected during story discovery 2026-09-01)
**Dependencies:** none
**Pattern:** Repository + Adapter (`IResourceRepository` port, `TypeOrmResourceRepository` adapter) — matches every other Booking-context aggregate; no new named pattern.

**Description:**
Create the `Resource` aggregate in `apps/backend/src/contexts/booking/domain/resource.aggregate.ts` — one row per bookable unit, per `docs/02-DOMAIN_MODEL.md`'s exact field list: `resourceId`, `tenantId`, `type: 'LOCATION'|'STAFF'|'ROOM'|'EQUIPMENT'`, `refId: StaffId | null` (set only when `type='STAFF'`), `name`, `workingHours: BusinessHours | null` (`null` = inherits tenant hours), `turnoverMinutes` (default 0), `maxCapacity: int | null`, `isActive`, `createdAt`, `updatedAt`.

**Aggregate invariants (enforced in `Resource.create()`, not just the DB):**
- `(type === 'STAFF') === (refId !== null)` — a staff wrapper must reference a Staff ID; every other type must not.
- Every `workingHours` window (when set) must be a subset of the tenant's recurring `businessHours` window. **Corrected during story discovery (2026-09-01):** `IBookingPlatformPort` has no tenant-hours method and `AvailabilityService` does not use it — it receives `businessHours` as a plain input. Per `docs/ENGINEERING_RULES.md` § RequestContext, the correct source is the controller: `resource.controller.ts` extracts `settings.businessHours` from the injected `RequestContext` and forwards it as an explicit `tenantBusinessHours` DTO field into `CreateResourceUseCase`/`UpdateResourceUseCase`, which pass it into `Resource.create()`/`Resource.update()`. Use cases must never inject `RequestContext` directly. **Broadened during bot review (PR #457, round 9+):** `PATCH /resources/:id` was originally scoped to `workingHours` only (`UpdateResourceWorkingHoursUseCase`); per user decision, every field is now independently editable — see UC-046 and `docs/02-DOMAIN_MODEL.md` § Resource's `update()` method.
- `maxCapacity`, when set, must be `> 0`.
- `LOCATION` is never created through this use case — `POST /resources` with `type: 'LOCATION'` is rejected (`422`); every tenant's one `LOCATION` resource comes from S02's backfill migration only.

**Backend use case steps:**
1. **`CreateResourceUseCase`** (UC-045): validates the `STAFF`⟺`refId` invariant, validates the referenced `Staff` row exists/is active/belongs to the tenant via a narrow lookup adapter (new `infrastructure/cross-context/booking-staff.adapter.ts` — grep `infrastructure/cross-context/` first per `CLAUDE.md` §8; none exists yet for Booking→Staff, so this is a genuinely new adapter, not a duplicate), validates working-hours-within-tenant-hours, persists via `IResourceRepository.save()`. `409 BOOKING_RESOURCE_STAFF_ALREADY_WRAPPED` if that staff member already has a `Resource` row (UC-045 A1); `422 BOOKING_RESOURCE_NO_WORKING_HOURS` if no hours are set and the tenant has none either (UC-045 A2).
2. **`UpdateResourceUseCase`** (UC-046): loads by `(tenantId, id)`, merges any sent fields (`name`/`type`/`refId`/`workingHours`/`turnoverMinutes`/`maxCapacity`) over the resource's current values, re-runs `create()`'s own invariants against the resolved state via `Resource.update()`, saves. Re-validates the staff-wrap check (via the shared `StaffWrapValidationService`, excluding the resource being updated from the "already wrapped" check) when `type` is changing to `STAFF`. Rejects (`409`) a `type` change to/from `LOCATION`. `404` if not found/cross-tenant.
3. **`DeactivateResourceUseCase`** (UC-047): sets `isActive = false`. Does **not** cancel or demote anything else — this milestone has no bookings/sessions referencing `Resource` yet, so the "resolution worklist" UC-047 describes is a no-op list (empty) until M22+ exists; still call the same method so M22+ can extend it without changing this use case's own shape.
4. **`ReactivateResourceUseCase`** (UC-049): sets `isActive = true`. No event published — descoped during story discovery (2026-09-01): `ResourceReactivated` has no consumer yet, and an event drained into the outbox with zero subscribers gets no Pub/Sub topic from the auto-generated catalog (M20-S16 precedent, `docs/ENGINEERING_RULES.md` § Aggregate domain events → outbox); config-only, same as steps 1–3. `409` if already active.
5. **`ListResourcesUseCase`** (UC-044): `findByTenant(tenantId, { type?, isActive? })`, returns the list.
6. **`CascadeStaffDeactivationUseCase`** (UC-048): looks up the `Resource` row by `(tenantId, refId=staffId)`; no-op if none exists (A1); otherwise calls the exact same deactivation path as step 3.

**Backend HTTP surface:** new controller `infrastructure/controllers/resource.controller.ts` — `GET /resources`, `POST /resources`, `PATCH /resources/:id`, `DELETE /resources/:id`, `POST /resources/:id/reactivate`. `MANAGER`-only on every route (`@UseGuards(ManagerRoleGuard)` — the real backend convention; `@Roles(...)` is a BFF-only decorator, verified via `docs-audit` that it has zero backend usages) — a deliberate, self-consistent restriction distinct from every other Booking-context admin surface (`docs/14-API_CONTRACTS.md` § Resource Management explains why). Register in `booking.module.ts` alongside the existing `ScheduleClosureController`/`ScheduleOpeningController`.

**Event consumer (UC-048):** new `infrastructure/events/staff-deactivated.handler.ts` in the Booking context, following the exact shape of `apps/backend/src/contexts/loyalty/infrastructure/events/booking-completed.handler.ts` (the real, existing cross-context consumer precedent) — `OnModuleInit` subscribes to `StaffDeactivated` (imported from `../../../staff/domain/events/staff-deactivated.event.ts`), `handle()` calls exactly `CascadeStaffDeactivationUseCase.execute()` and rethrows on failure, passes `event.correlationId` into the DTO, zero domain logic in the handler itself. This is `StaffDeactivated`'s first real consumer — no existing subscription to build on.

**BFF endpoint spec:** new `apps/bff/src/features/booking/resource.controller.ts` + `resource.schemas.ts` + `resource.types.ts`, forwarding to the backend via `BackendHttpService`, same `MANAGER`-only guard. Register in the existing `apps/bff/src/features/booking/` module (extend, not a new NestJS module — mirrors how `schedule.module.ts` already hosts multiple related controllers).

**New migration / i18n keys / env vars / feature flags:** new migration `apps/backend/src/contexts/booking/infrastructure/migrations/<next-timestamp>-CreateBookingResources.ts` creating `booking.resources` exactly per `docs/13-DATABASE_SCHEMA.md` (all listed columns, both partial unique indexes, the `(type='STAFF') = (ref_id IS NOT NULL)` CHECK). Migration timestamps are global — verify the current highest across all contexts at implementation time (`1748500000006` is the latest as of this milestone's drafting; don't reuse it).

**Files to create/modify:**
- `apps/backend/src/contexts/booking/domain/resource.aggregate.ts` (new)
- `apps/backend/src/contexts/booking/domain/resource.spec.ts` (new)
- `apps/backend/src/contexts/booking/domain/resource.types.ts` (new — `ResourceType` enum, `BusinessHours` reuse)
- `apps/backend/src/contexts/booking/domain/errors/resource-*.error.ts` (new — one per new error code)
- `apps/backend/src/contexts/booking/application/ports/resource-repository.port.ts` (new)
- `apps/backend/src/contexts/booking/application/use-cases/create-resource.use-case.ts` (+ `.spec.ts`) (new)
- `apps/backend/src/contexts/booking/application/use-cases/update-resource.use-case.ts` (+ `.spec.ts`) (new — renamed from `update-resource-working-hours.use-case.ts` when the endpoint's scope broadened, PR #457 round 9+)
- `apps/backend/src/contexts/booking/application/services/staff-wrap-validation.service.ts` (+ `.spec.ts`) (new — extracted from `CreateResourceUseCase`'s private `assertStaffWrappable()` once `UpdateResourceUseCase` needed the identical check, PR #457 round 9+)
- `apps/backend/src/contexts/booking/application/use-cases/deactivate-resource.use-case.ts` (+ `.spec.ts`) (new)
- `apps/backend/src/contexts/booking/application/use-cases/reactivate-resource.use-case.ts` (+ `.spec.ts`) (new)
- `apps/backend/src/contexts/booking/application/use-cases/list-resources.use-case.ts` (+ `.spec.ts`) (new)
- `apps/backend/src/contexts/booking/application/use-cases/cascade-staff-deactivation.use-case.ts` (+ `.spec.ts`) (new)
- `apps/backend/src/contexts/booking/infrastructure/entities/resource.entity.ts` (new)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-resource.repository.ts` (+ `.spec.ts`) (new)
- `apps/backend/src/contexts/booking/infrastructure/controllers/resource.controller.ts` (+ `.spec.ts`, `.integration.spec.ts`) (new)
- `apps/backend/src/contexts/booking/infrastructure/events/staff-deactivated.handler.ts` (+ `.spec.ts`, `.integration.spec.ts`) (new)
- `apps/backend/src/contexts/booking/infrastructure/cross-context/booking-staff.adapter.ts` (+ `.spec.ts`) (new — narrow Staff lookup: same-tenant/existing/active; depends on the Staff context's existing `GetStaffByIdUseCase` per `docs/ENGINEERING_RULES.md` § Backend read use cases for cross-context access, not a new query service. "Schedulable" clarified during story discovery (2026-09-01) to mean `isActive` only — no separate role restriction; both `STAFF` and `MANAGER` roles can be wrapped)
- `apps/backend/src/contexts/booking/infrastructure/migrations/<timestamp>-CreateBookingResources.ts` (new)
- `apps/backend/src/contexts/booking/booking.module.ts` (modify — register controller, use cases, repository provider with `useClass`, entity, event handler)
- `apps/backend/src/test/integration-global-setup.ts` (modify — register `ResourceEntity`, matching the existing `ScheduleClosureEntity` registration; missing registration causes silent integration-test failures)
- `apps/backend/http/booking/resources.http` (new)
- `packages/types/src/error-codes.ts` (modify — add `BOOKING_RESOURCE_STAFF_ALREADY_WRAPPED`, `BOOKING_RESOURCE_NO_WORKING_HOURS`, `BOOKING_RESOURCE_ALREADY_ACTIVE`, `BOOKING_RESOURCE_NOT_FOUND` to `BookingErrorCode`)
- `packages/i18n/locales/pt-BR/errors.json` + `.../en/errors.json` (modify — translation entries for all 4 new codes)
- `apps/bff/src/features/booking/resource.controller.ts` (+ `.spec.ts`, `.component.spec.ts`) (new)
- `apps/bff/src/features/booking/resource.schemas.ts` (new)
- `apps/bff/src/features/booking/resource.types.ts` (new)
- `apps/bff/http/booking/resources.http` (new)

**Acceptance criteria — product:**
- [ ] Manager can create a `STAFF`/`ROOM`/`EQUIPMENT` resource, list all resources filtered by type/active state, edit any field of an existing resource (including correcting a mistaken `type`/`refId`), deactivate, and reactivate it.
- [ ] Manager cannot create a `LOCATION` resource directly, nor change any resource's `type` to/from `LOCATION` — only S02's backfill produces or corrects one.
- [ ] Deactivating the `Staff` row behind a `STAFF`-type resource (existing UC-029) automatically deactivates that resource too, with no manual step.
- [ ] STAFF-role users get `403` on every Resource Management endpoint (MANAGER-only, by design).

**Acceptance criteria — technical:**
- Unit:
  - [ ] `Resource.create()` rejects `type='STAFF'` with no `refId` and vice versa
  - [ ] `Resource.create()` rejects a `workingHours` window outside the tenant's business hours
  - [ ] `CreateResourceUseCase` throws `BOOKING_RESOURCE_STAFF_ALREADY_WRAPPED` on a duplicate staff wrap
  - [ ] `CreateResourceUseCase` throws `BOOKING_RESOURCE_NO_WORKING_HOURS` when neither the resource nor the tenant has hours
  - [ ] `ReactivateResourceUseCase` throws on an already-active resource
  - [ ] `StaffDeactivatedHandler.handle()` calls `CascadeStaffDeactivationUseCase.execute()` exactly once and rethrows on failure
  - [ ] `CascadeStaffDeactivationUseCase` no-ops when no `Resource` wraps the deactivated staff member
- Integration:
  - [ ] `POST /resources` persists a real row and is retrievable via `GET /resources`
  - [ ] `StaffDeactivatedHandler` integration test: deactivate a real `Staff` row via `UC-029`'s use case, assert the wrapping `Resource.isActive` flips to `false` end-to-end through the real event bus
  - [ ] `TypeOrmResourceRepository` round-trips all fields including the two partial unique indexes (one `LOCATION` per tenant, one `Resource` per staff member)
- Tenant isolation:
  - [ ] `GET /resources` for tenant A never returns tenant B's resources
  - [ ] `PATCH /resources/:id` / `DELETE /resources/:id` for a cross-tenant `id` returns `404`, not the other tenant's data
- E2E:
  - [ ] none — covered by unit/integration; the frontend E2E lands with S04/S05
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

---

### M21-S02 — LOCATION backfill migration for every existing tenant

**Agent:** `backend-ts`
**Complexity:** S
**Docs to load:** `docs/13-DATABASE_SCHEMA.md` § `booking.resources`, `docs/discovery/multivertical-booking/multivertical-booking_DATA_MODEL.md` §4 (migration ordering — Cluster 1 scope only: create the `LOCATION` row, nothing about `service_resource_requirements`, which is M22's own migration)
**Dependencies:** M21-S01 (needs `booking.resources` to exist)
**Pattern:** plain composition — no named pattern applies; a one-time data migration.

**Description:**
A pure-data migration (no schema change — S01's migration already created the table) that inserts one active `LOCATION` resource per existing tenant: `{ type: 'LOCATION', refId: null, name: '<tenant.name> (unidade única)', workingHours: null (inherits tenant hours), turnoverMinutes: 0, maxCapacity: null, isActive: true }`. Idempotent — safe to re-run (skip a tenant that already has an active `LOCATION` row, so this migration can be re-applied without violating the `UNIQUE (tenant_id) WHERE type='LOCATION' AND is_active` constraint). Runs as a normal migration in the same CI job as every other migration (`CLAUDE.md` §1 — "migrations via separate CI job, never auto at startup"), not a one-off script.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/infrastructure/migrations/<timestamp>-BackfillLocationResources.ts` (new — data migration, `up()` inserts, `down()` deletes only the rows it created, identifiable by `type='LOCATION' AND ref_id IS NULL` for tenants that had zero resources before this migration ran)
- `apps/backend/src/contexts/booking/infrastructure/migrations/backfill-location-resources.spec.ts` (new — or co-located test per this repo's migration-testing convention; verify the exact convention against a recent data-migration precedent before writing, e.g. `td/TD*` migrations that did a similar backfill)

**Acceptance criteria — product:**
- [ ] Every tenant that existed before this migration ran has exactly one active `LOCATION` resource after it.
- [ ] No existing booking, service, or schedule closure/opening is altered by this migration — it only inserts new `resources` rows.

**Acceptance criteria — technical:**
- Unit: none — this is a data migration, not application logic.
- Integration:
  - [ ] Migration test seeds N tenants (including one with zero resources and, defensively, one that somehow already has an active `LOCATION` row) and asserts exactly one active `LOCATION` resource exists per tenant after running, and that re-running the migration is a no-op (idempotency)
- Tenant isolation:
  - [ ] Each backfilled `LOCATION` resource's `tenant_id` matches the tenant it was generated for — no cross-tenant row
- E2E: none — covered by the migration integration test
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

---

### M21-S03 — Resource-scoped schedule closures/openings — backend + BFF

**Agent:** `backend-ts` + `bff-ts`
**Complexity:** M
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Booking Context (`ScheduleClosure`/`ScheduleOpening`, resourceId), `docs/13-DATABASE_SCHEMA.md` § `booking.schedule_closures`/`booking.schedule_openings` (M21 Cluster 1 modifications), `docs/14-API_CONTRACTS.md` § Schedule Closures/Schedule Openings, `docs/04-USE_CASES.md` UC-010e, UC-010f
**Dependencies:** M21-S01 (needs `Resource` to exist as a validatable reference)
**Pattern:** plain composition — extends the existing `ScheduleClosure`/`ScheduleOpening` aggregates and their existing use cases; no new pattern.

**Description:**
Add an optional `resourceId: ResourceId | null` to both `ScheduleClosure` and `ScheduleOpening` (`null` = tenant-wide, today's exact unchanged behavior — the "everything" sentinel). Extend the existing `close-schedule.use-case.ts`/`open-schedule.use-case.ts` to accept and validate it (resource exists, belongs to the tenant, `404` otherwise), and extend the overlap-check queries in `list-closures`/`remove-closure`/`list-openings`/`remove-schedule-opening` use cases to scope by `(tenantId, resourceId, date)` instead of just `(tenantId, date)` when `resourceId` is set.

**Constraint fix (required in the same migration, not a follow-up):** `booking.schedule_openings`' current `UNIQUE(tenant_id, date)` silently stops enforcing "one opening per date" the moment `resource_id` becomes nullable (Postgres treats `NULL ≠ NULL`). Replace with the two partial unique indexes from `docs/13-DATABASE_SCHEMA.md`: `UNIQUE(tenant_id, date) WHERE resource_id IS NULL` and `UNIQUE(tenant_id, resource_id, date) WHERE resource_id IS NOT NULL`.

**Auth exception:** a request body with `resourceId` set requires `MANAGER` specifically (not `STAFF`) — matches the Resource Management restriction from S01. The existing tenant-wide case (`resourceId` omitted) stays `STAFF|MANAGER`, unchanged. Add this as a guard check inside the existing controller actions (role from `RequestContext`, branch on whether `resourceId` is present in the body), not a second route.

**Backend use case steps:**
1. **`CreateScheduleClosureUseCase`** (extend, UC-010e): accept optional `resourceId`; if set, validate via `IResourceRepository.findById(tenantId, resourceId)` (`404` if missing/cross-tenant), require `MANAGER`, scope the overlap check to `(tenantId, resourceId, date)`.
2. **`CreateScheduleOpeningUseCase`** (extend, UC-010f): same shape, plus the two-partial-index migration described above.
3. List/remove use cases: extend their query methods with an optional `resourceId` filter (`docs/14-API_CONTRACTS.md`'s `GET .../closures?...&resourceId=` / `.../openings?...&resourceId=`).

**Backend HTTP surface:** reuses the existing `POST /schedule/closures`, `DELETE /schedule/closures/:id`, `GET /schedule/closures`, and the equivalent `/schedule/openings` routes — `resourceId` is a new optional body/query field on each, not a new route.

**BFF endpoint spec:** extend the existing `apps/bff/src/features/booking/schedule.controller.ts`/`schedule-opening.controller.ts` and their `.schemas.ts` files to pass through the new optional `resourceId` field — same routes, same guard split as today, plus the `MANAGER`-only branch when `resourceId` is present.

**New migration / i18n keys / env vars / feature flags:** new migration adding `resource_id UUID NULLABLE` (composite FK `(tenant_id, resource_id)` → `resources`) to both tables, plus the two-partial-index replacement on `schedule_openings`.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/domain/schedule-closure.aggregate.ts` (modify — add `resourceId`)
- `apps/backend/src/contexts/booking/domain/schedule-closure.spec.ts` (modify)
- `apps/backend/src/contexts/booking/domain/schedule-opening.aggregate.ts` (modify — add `resourceId`)
- `apps/backend/src/contexts/booking/domain/schedule-opening.spec.ts` (modify)
- `apps/backend/src/contexts/booking/application/ports/schedule-closure-repository.port.ts` (modify — resourceId-aware query signature)
- `apps/backend/src/contexts/booking/application/ports/schedule-opening-repository.port.ts` (modify)
- `apps/backend/src/contexts/booking/application/use-cases/close-schedule.use-case.ts` (+ `.spec.ts`) (modify)
- `apps/backend/src/contexts/booking/application/use-cases/open-schedule.use-case.ts` (+ `.spec.ts`) (modify)
- `apps/backend/src/contexts/booking/application/use-cases/list-closures.use-case.ts` (+ `.spec.ts`) (modify)
- `apps/backend/src/contexts/booking/application/use-cases/list-openings.use-case.ts` (+ `.spec.ts`) (modify)
- `apps/backend/src/contexts/booking/infrastructure/entities/schedule-closure.entity.ts` (modify)
- `apps/backend/src/contexts/booking/infrastructure/entities/schedule-opening.entity.ts` (modify)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-schedule-closure.repository.ts` (+ `.spec.ts`) (modify)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-schedule-opening.repository.ts` (+ `.spec.ts`) (modify)
- `apps/backend/src/contexts/booking/infrastructure/controllers/schedule-closure.controller.ts` (+ `.spec.ts`, `.integration.spec.ts`) (modify)
- `apps/backend/src/contexts/booking/infrastructure/controllers/schedule-opening.controller.ts` (+ `.spec.ts`, `.integration.spec.ts`) (modify)
- `apps/backend/src/contexts/booking/infrastructure/migrations/<timestamp>-AddResourceIdToScheduleClosuresAndOpenings.ts` (new)
- `apps/backend/http/booking/schedule-closures.http` (modify — add resourceId examples)
- `apps/backend/http/booking/schedule-openings.http` (modify)
- `apps/bff/src/features/booking/schedule.controller.ts` (+ `.spec.ts`, `.component.spec.ts`) (modify)
- `apps/bff/src/features/booking/schedule.schemas.ts` (modify)
- `apps/bff/src/features/booking/schedule-opening.controller.ts` (+ `.spec.ts`, `.component.spec.ts`) (modify)
- `apps/bff/src/features/booking/schedule-opening.schemas.ts` (modify)
- `apps/bff/http/booking/schedule-closures.http` (modify, if it exists as a separate BFF-side file — verify path at implementation time)
- `apps/bff/http/booking/schedule-openings.http` (modify, same verification note)

**Acceptance criteria — product:**
- [ ] Manager can create a closure/opening scoped to a specific resource; that resource's calendar reflects it, other resources at the same tenant are unaffected.
- [ ] Leaving `resourceId` unset behaves byte-identically to today (UC-010a–d, unchanged) — **explicit non-regression AC**, not assumed: an existing STAFF|MANAGER tenant-wide closure/opening flow produces the same result before and after this story.
- [ ] STAFF users can still create/remove tenant-wide closures/openings (unchanged); STAFF gets `403` only when `resourceId` is present in the request.
- [ ] A tenant-wide opening and a resource-scoped opening for the same date never collide with each other; two tenant-wide (or two resource-scoped, same resource) openings for the same date still collide as before.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `ScheduleClosure`/`ScheduleOpening` validate `resourceId` presence doesn't change any other existing invariant
  - [ ] `CreateScheduleClosureUseCase`/`CreateScheduleOpeningUseCase` reject a `resourceId` that doesn't belong to the tenant
  - [ ] `CreateScheduleOpeningUseCase` rejects `resourceId` set by a STAFF-role actor with `403`
- Integration:
  - [ ] A resource-scoped closure and a tenant-wide closure for the same date coexist without a false-positive overlap rejection
  - [ ] The two-partial-index migration: insert a tenant-wide opening and a resource-scoped opening for the same date successfully; insert a second tenant-wide opening for that date and assert it's rejected; insert a second resource-scoped opening for the same resource/date and assert it's rejected
- Tenant isolation:
  - [ ] A `resourceId` belonging to another tenant is rejected with `404`, never silently scoped to the wrong tenant's resource
- E2E: none — covered by unit/integration; the frontend E2E lands with S05
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

---

### M21-S04 — Manager "Recursos" frontend

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer, `docs/14-API_CONTRACTS.md` § Resource Management
**Dependencies:** M21-S01 (BFF endpoints), M21-S02 (LOCATION backfill — the list screen's `LOCATION` row must already exist to review against)
**Pattern:** plain composition — matches the existing `team`/`services` dashboard feature shape exactly; no new pattern.
**Prototype references:** `plan/journey/manager/resources.md`, `plan/journey/manager/prototypes/resources/` (01-resources-list.html, 02-criar-recurso.html, 02b-criar-recurso-erro.html)

**Description:**
Build the Resource Management dashboard pages from the already-relocated, discovery-validated prototype (`plan/journey/manager/prototypes/resources/`), following the exact structural precedent `apps/web/features/staff/components/team/` already establishes for a MANAGER-only list/create/deactivate/reactivate flow. Add a new MANAGER-only sidebar item ("Recursos") to `apps/web/shells/dashboard/model/team-route.ts`-equivalent nav config (`Sidebar.tsx`'s `MANAGER_NAV_KEYS` array), same tier as Equipe/Configurações/Hotsite.

Working-hours edit (UC-046), deactivate confirmation (UC-047), and reactivate confirmation (UC-049) have **no discovery-stage prototype** — per `plan/journey/manager/prototypes/resources/dev-notes.md`'s own flagged gap, design these from `staff/prototypes/horarios/`'s existing per-weekday hours editor (for the edit form) and `manager/prototypes/equipe/03-deactivate-confirm.html` (for the deactivate/reactivate confirmation shape), not from scratch.

**Files to create/modify:**
- `apps/web/app/dashboard/resources/page.tsx` (new)
- `apps/web/app/dashboard/resources/new/page.tsx` (new)
- `apps/web/app/dashboard/resources/[id]/page.tsx` (new — working-hours edit)
- `apps/web/app/dashboard/resources/[id]/deactivate/page.tsx` (new — dedicated page, not a modal, matching `team/[id]/deactivate/page.tsx`'s precedent)
- `apps/web/features/booking/components/dashboard/resources/ResourceListPage.tsx` (+ `.spec.tsx`) (new)
- `apps/web/features/booking/components/dashboard/resources/ResourceCreateForm.tsx` (+ `.spec.tsx`) (new)
- `apps/web/features/booking/components/dashboard/resources/ResourceEditForm.tsx` (+ `.spec.tsx`) (new)
- `apps/web/features/booking/components/dashboard/resources/ResourceDeactivateConfirm.tsx` (+ `.spec.tsx`) (new)
- `apps/web/features/booking/components/dashboard/resources/ResourceReactivateConfirm.tsx` (+ `.spec.tsx`) (new)
- `apps/web/features/booking/api/resources.ts` (new — `bffClient`-based React Query hooks: `useResources`, `useCreateResource`, `useUpdateResource` (renamed from `useUpdateResourceWorkingHours` — PATCH now edits every field, PR #457 round 9+), `useDeactivateResource`, `useReactivateResource`)
- `apps/web/features/booking/types/resource.ts` (new — grep `@ikaro/types` first per `CLAUDE.md` §8's anti-pattern table; verify against the live BFF schema before inventing a duplicate shape)
- `apps/web/shells/dashboard/components/Sidebar.tsx` (modify — add "Recursos" to `MANAGER_NAV_KEYS`)
- `apps/web/shells/dashboard/components/BottomNav.tsx` (modify, if Resources needs a bottom-nav/MoreSheet entry on mobile — verify against `MoreSheet.tsx`'s existing MANAGER-item pattern at implementation time)
- `packages/i18n/locales/pt-BR/web.json` + `.../en/web.json` (modify — dashboard UI copy lives under the top-level `"dashboard"` key in `web.json`, not a separate `dashboard.json`, confirmed against `dashboard.nav`/`dashboard.teamPage`'s real shape at implementation time; add a `dashboard.nav.resources` key alongside the existing `dashboard.nav` entries and a new `dashboard.resourcesPage` namespace mirroring `dashboard.teamPage`'s shape — no hardcoded visible text per `CLAUDE.md` §7 Testing)

**Acceptance criteria — product:**
- [ ] Manager sees "Recursos" in the sidebar (MANAGER-only — STAFF never sees it).
- [ ] Manager can list resources grouped by type, create a new STAFF/ROOM/EQUIPMENT resource, edit working hours, deactivate, and reactivate — matching the prototype's flows.
- [ ] The `LOCATION` resource row never offers a "Desativar" action (S02 backfills exactly one; a tenant must always retain an always-active default).
- [ ] All new UI copy is localized in both pt-BR and en in this same commit.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `ResourceListPage` renders grouped-by-type with correct Ativo/Inativo badges (jsdom + Testing Library)
  - [ ] `ResourceCreateForm` type-switcher swaps STAFF-picker ↔ name field, matches prototype interactivity
  - [ ] `ResourceCreateForm` surfaces the 409/422 error states inline
- Integration: n/a — no `.integration.spec.ts` tier for `apps/web` (Vitest jsdom/node only)
- Tenant isolation: n/a — no tenant-data-shaping logic lives client-side beyond what `useTenant()` already scopes
- E2E:
  - [ ] Playwright: manager creates a STAFF resource, sees it in the list, deactivates it, reactivates it — full round trip against the real BFF/backend
  - [ ] Playwright: STAFF-role user does not see "Recursos" in the sidebar and gets a forbidden response if the route is hit directly
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

---

### M21-S05 — Staff/Manager "Horários" resource-scoped extension frontend

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/14-API_CONTRACTS.md` § Schedule Closures/Openings (M21 Cluster 1 extension), `docs/08-TESTING_STRATEGY.md`
**Dependencies:** M21-S03 (BFF resourceId support), M21-S04 (`ResourcePicker` reuses S04's `useResources()` hook from `apps/web/features/booking/api/resources.ts` to populate its dropdown — found via this milestone's own mechanical supplying-endpoint check: nothing else in this milestone supplies a resource-list read for the frontend)
**Pattern:** plain composition — extends the existing, shipped `SchedulePage` component; no new pattern.
**Prototype references:** `plan/journey/staff/horarios.md` (M21 Cluster 1 extension section), `plan/journey/staff/prototypes/horarios/07-horarios-recurso.html`, `dev-notes.md`'s own ❓ GAP section

**Description:**
Extend the existing, shipped `SchedulePage` (`apps/web/features/booking/components/dashboard/schedule/SchedulePage.tsx`, `M13-S21`) with a new `ResourcePicker` at the top — selecting a resource re-scopes every BFF call (`GET`/`POST /schedule/closures`, `.../openings`) to include `resourceId`, and re-renders the same calendar UI against that resource's own occupied windows instead of the tenant-wide view. Leaving the picker on "Todo o negócio" (default) preserves today's exact behavior — this is an additive extension of an already-well-tested component, not a rewrite.

**Files to create/modify:**
- `apps/web/features/booking/components/dashboard/schedule/SchedulePage.tsx` (modify — add `resourceId` to its query state, pass through to all BFF calls)
- `apps/web/features/booking/components/dashboard/schedule/ResourcePicker.tsx` (+ `.spec.tsx`) (new)
- `apps/web/features/booking/components/dashboard/schedule/ClosureFormSheet.tsx` (modify — pass the currently-selected `resourceId` into the create request body)
- `apps/web/features/booking/components/dashboard/schedule/OpeningFormSheet.tsx` (modify — same)
- `apps/web/features/booking/api/schedule.ts` (modify — extend existing hooks with optional `resourceId` param; verify this file's exact name/location against `apps/web/features/booking/api/` at implementation time, per `M13-S21`'s own dev-notes)
- `packages/i18n/locales/pt-BR/web.json` + `.../en/web.json` (modify — `ResourcePicker` copy under `dashboard.schedule`, same file as S04's `dashboard.nav`/`dashboard.resourcesPage` additions, not a separate `dashboard.json`)

**Acceptance criteria — product:**
- [ ] Manager can pick a resource from a new selector on the Horários page; the calendar and closure/opening actions then scope to that resource.
- [ ] Leaving the picker on the default ("Todo o negócio") produces byte-identical behavior to before this story — explicit non-regression AC, matching S03's own backend-side requirement.
- [ ] STAFF users can still use the tenant-wide view unchanged; resource-scoped actions require MANAGER (S03's auth exception surfaces correctly in the UI — the picker itself, or the resulting write action, is hidden/disabled for STAFF).

**Acceptance criteria — technical:**
- Unit:
  - [ ] `ResourcePicker` renders the tenant's active resources plus a "Todo o negócio" default option
  - [ ] `SchedulePage` passes the selected `resourceId` through to closure/opening creation and list queries
- Integration: n/a — no `.integration.spec.ts` tier for `apps/web`
- Tenant isolation: n/a — client-side; server-side isolation already covered by S03
- E2E:
  - [ ] Playwright: manager selects a resource, creates a resource-scoped closure, sees it reflected only on that resource's calendar, not the tenant-wide one
  - [ ] Playwright: default "Todo o negócio" view still creates a tenant-wide closure exactly as before this story (regression guard)
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

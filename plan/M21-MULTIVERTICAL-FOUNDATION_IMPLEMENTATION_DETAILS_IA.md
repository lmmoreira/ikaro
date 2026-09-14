# M21 — Multi-Vertical Scheduling: Foundation — Implementation Details (IA)

## Artifacts

### Backend — domain

| Artifact | Path |
|---|---|
| `Resource` aggregate (`LOCATION`/`STAFF`/`ROOM`/`EQUIPMENT`) | `apps/backend/src/contexts/booking/domain/resource.aggregate.ts` |
| `ResourceType` enum, `BusinessHours` reuse | `apps/backend/src/contexts/booking/domain/resource.types.ts` |
| Domain errors (`ResourceTypeNotCreatableError`, `ResourceStaffAlreadyWrappedError`, `ResourceStaffNotFoundError`, `ResourceNotFoundError`, `ResourceNotActiveError`, `ResourceAlreadyActiveError`, `ResourceLocationCannotBeDeactivatedError`, `ResourceLocationTypeImmutableError`, `ResourceLocationWorkingHoursImmutableError`, etc.) | `apps/backend/src/contexts/booking/domain/errors/resource-*.error.ts` |
| `ScheduleClosure`/`ScheduleOpening` — extended with `resourceId: string | null` (M21 Cluster 1; plain string, no VO) | `apps/backend/src/contexts/booking/domain/schedule-closure.aggregate.ts`, `schedule-opening.aggregate.ts` |

### Backend — application

| Artifact | Path |
|---|---|
| `IResourceRepository` port | `apps/backend/src/contexts/booking/application/ports/resource-repository.port.ts` |
| `CreateResourceUseCase` / `UpdateResourceUseCase` / `DeactivateResourceUseCase` / `ReactivateResourceUseCase` / `ListResourcesUseCase` / `GetResourceByIdUseCase` / `CascadeStaffDeactivationUseCase` | `apps/backend/src/contexts/booking/application/use-cases/{create,update,deactivate,reactivate,list,get-resource-by-id,cascade-staff-deactivation}-resource.use-case.ts` |
| `StaffWrapValidationService` (extracted once `UpdateResourceUseCase` needed `CreateResourceUseCase`'s private staff-wrap check too) | `apps/backend/src/contexts/booking/application/services/staff-wrap-validation.service.ts` |
| `CreateTenantLocationResourceUseCase` (S02 part 2 — `TenantProvisioned` consumer's use case) | `apps/backend/src/contexts/booking/application/use-cases/create-tenant-location-resource.use-case.ts` |
| `ITenantLockPort.lockTenantStaff` (S06 — advisory lock closing the staff-wrap-vs-`StaffDeactivated` race, `tenantstaff:` namespaced key; `lockTenantDay`'s existing key is byte-for-byte unchanged for deploy-rollout compatibility) | `apps/backend/src/contexts/booking/application/ports/tenant-lock.port.ts` |
| `IBookingPlatformPort.getBusinessHoursAndLocale` (S02) / `.getBusinessHoursAndLocaleForUpdate` (S03, row-locked, bypasses `CachingTenantRepository`) | `apps/backend/src/contexts/booking/application/ports/booking-platform.port.ts` |
| `CloseScheduleUseCase`/`OpenScheduleUseCase`/`ListClosuresUseCase`/`ListOpeningsUseCase` — extended with optional `resourceId` (S03) | `apps/backend/src/contexts/booking/application/use-cases/{close,open,list-closures,list-openings}-schedule*.use-case.ts` |

### Backend — infrastructure

| Artifact | Path |
|---|---|
| `ResourceController` (`GET/POST /resources`, `GET/PATCH/DELETE /resources/:id`, `POST /resources/:id/reactivate` — `ManagerRoleGuard` on every route) | `apps/backend/src/contexts/booking/infrastructure/controllers/resource.controller.ts` |
| `TypeOrmResourceRepository` | `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-resource.repository.ts` |
| `ResourceEntity` (partial unique indexes are migration-only, undeclared on the entity — no TypeORM WHERE-clause decorator exists) | `apps/backend/src/contexts/booking/infrastructure/entities/resource.entity.ts` |
| `StaffDeactivatedHandler` (Booking's first real `StaffDeactivated` consumer — UC-048) | `apps/backend/src/contexts/booking/infrastructure/events/staff-deactivated.handler.ts` |
| `TenantProvisionedBookingHandler` (class name qualified — see Gotchas) | `apps/backend/src/contexts/booking/infrastructure/events/tenant-provisioned.handler.ts` |
| `BookingStaffAdapter` (narrow Booking→Staff lookup: same-tenant/existing/active) | `apps/backend/src/contexts/booking/infrastructure/cross-context/booking-staff.adapter.ts` |
| `TypeOrmTenantLockAdapter.lockTenantStaff` | `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-tenant-lock.adapter.ts` |
| Migrations (4, in order) | `1748500000007-CreateBookingResources.ts`, `1748500000008-BackfillLocationResources.ts`, `<AddResourceIdToScheduleClosuresAndOpenings>.ts` (S03), no new migration in S06 |
| Backfill migration test (lives outside `migrations/` — Jest's `integration` project ignores that dir) | `apps/backend/src/contexts/booking/infrastructure/backfill-location-resources.integration.spec.ts` |

### BFF

| Artifact | Path |
|---|---|
| `ResourceController` (MANAGER-only passthrough to backend) | `apps/bff/src/features/booking/resource.controller.ts` + `resource.schemas.ts` + `resource.types.ts` |
| `schedule.controller.ts`/`schedule-opening.controller.ts` — extended with `resourceId` passthrough, no extra guard (S03; backend already forwards its own `403`) | `apps/bff/src/features/booking/{schedule,schedule-opening}.controller.ts` |

### Web — dashboard (Recursos, S04)

| Artifact | Path |
|---|---|
| `ResourceListPage.tsx` / `ResourceRow.tsx` (grouped by type, Ativo/Inativo badges, inline reactivate) | `apps/web/features/booking/components/dashboard/resources/` |
| `ResourceCreateForm.tsx`, `ResourceEditForm.tsx` + `ResourceEditFormFields.tsx`, `ResourceDeactivatePage.tsx` | same dir |
| `ResourceWorkingHoursEditor.tsx`, `ResourceIdentityFields.tsx` (shared create/edit blocks) | same dir |
| `week-day-row.tsx` (`DayRow`, promoted to `shared/` once Booking needed the same per-weekday editor `platform`'s Settings hours section already had) | `apps/web/shared/components/ui/week-day-row.tsx` |
| `useResources`/`useCreateResource`/`useUpdateResource`/`useDeactivateResource`/`useReactivateResource` | `apps/web/features/booking/hooks/useResources.ts` |
| `api/resources.ts` (plain `bffClient` fetchers only — hooks live in `hooks/useResources.ts`, not here) | `apps/web/features/booking/api/resources.ts` |
| `resource-route.ts` (mirrors `team-route.ts` for `BottomNav`'s hide-on-drill-down logic) | `apps/web/shells/dashboard/model/resource-route.ts` |
| Routes | `apps/web/app/dashboard/resources/{page,new/page,[id]/page,[id]/deactivate/page}.tsx` |

### Web — dashboard (Horários resource-scoping, S05 — shipped shape, post mid-implementation revision)

| Artifact | Path |
|---|---|
| `ResourceFilterMenu.tsx` (multi-select checkbox **view** filter, MANAGER-only, mirrors `ScheduleStatusFilterMenu`) | `apps/web/features/booking/components/dashboard/schedule/ResourceFilterMenu.tsx` |
| `ResourceSelectField.tsx` (single-select embedded in `ClosureFormSheet`/`OpeningFormSheet`, always resets to "Todo o negócio" on open — independent of the filter menu) | `apps/web/features/booking/components/dashboard/schedule/ResourceSelectField.tsx` |
| `useSelectableResources.ts` (shared active/non-`LOCATION` resource list behind both controls above) | `apps/web/features/booking/schedule/useSelectableResources.ts` |
| `useReconciledSelectedResourceIds` (drops a persisted resource id no longer active; STAFF's *effective* selection is force-emptied regardless of what's persisted — see Gotchas) | `apps/web/features/booking/schedule/schedule-page-core-data.ts` |
| `useScheduleClosures`/`useScheduleOpenings` — `useQueries` fan-out (explicit tenant-wide + one query per checked resource id, merge+de-dupe by item id) | `apps/web/features/booking/schedule/useSchedule.ts` |
| `schedule-preferences.ts` — `selectedResourceIds` persisted `localStorage`, keyed by `tenantId` (unlike `selectedStatuses`, tenant-agnostic) | `apps/web/features/booking/schedule/schedule-preferences.ts` |
| `schedule-timeline-window.ts` (extracted from `schedule-timeline.ts` to stay under the 250-line file cap) — `findTenantWideOpening`, `resolveActiveWindow`, `resolveActiveTimelineHours`, `buildOpeningTimelineEvents` | `apps/web/features/booking/schedule/schedule-timeline-window.ts` |
| `schedule-timeline-events.ts` — generic `assignLanes<T>`/`groupOverlappingEvents<T>` (generalized from a booking-only `assignBookingLanes`), `ClosureTimelineEvent`/`OpeningTimelineEvent.resourceName` | `apps/web/features/booking/schedule/schedule-timeline-events.ts` |
| `ResourceNameBadge` (`data-testid="timeline-block-resource-name"`) + lane-split positioning on closure/opening blocks | `apps/web/features/booking/components/dashboard/schedule/ScheduleTimelineEventRenderer.tsx` |
| `TenantProvider` — extended with `role: 'STAFF' \| 'MANAGER'`, sourced from `shell.role` at all 4 call sites (`schedule`/`loyalty`/`bookings` layouts + `DashboardLayoutShell`) | `apps/web/providers/tenant-provider.tsx` |

### Shared types / validation

| Artifact | Path |
|---|---|
| `Resource`/`ResourceType`/`ResourceWorkingHours`/`ResourceListResponse`/`CreateResourceRequest`/`UpdateResourceRequest` | `packages/types/src/resource.dto.ts` |
| `ScheduleClosure`/`ScheduleOpening.resourceId`, `Create{Closure,Opening}Request.resourceId?` | `packages/types/src/schedule.dto.ts` |
| Error codes (`BOOKING_RESOURCE_*` — 11 total, see Error Mapping below) | `packages/types/src/error-codes.ts` |

### Test infrastructure

| Double | Path |
|---|---|
| `InMemoryResourceRepository`, `InMemoryTenantLockPort` (no-op `lockTenantStaff` added S06) | `apps/backend/src/test/repositories/booking/`, `apps/backend/src/test/infrastructure/in-memory-tenant-lock.ts` |
| `ResourceBuilder` / `ResourceEntityBuilder` | `apps/backend/src/test/builders/booking/` |
| `TenantEntityBuilder.withName()` (S02, needed to assert locale-aware generated names) | `apps/backend/src/test/builders/platform/tenant-entity.builder.ts` |
| E2E specs | `apps/web/e2e/resources-manage.spec.ts` (S04), `apps/web/e2e/schedule.spec.ts` (5 M21-S05-tagged scenarios) |
| E2E helpers | `apps/web/e2e/helpers/booking/resource-api.ts`, `apps/web/e2e/helpers/schedule/schedule-helpers.ts` (`createScheduleClosureAt`/`createScheduleOpeningAt`) |

---

## DB Schema (`booking` schema)

### `booking.resources` (new, S01)
```sql
id                UUID PRIMARY KEY
tenant_id         UUID NOT NULL, FK -> platform.tenants(id)
type              VARCHAR(20) NOT NULL   -- CHECK IN ('LOCATION','STAFF','ROOM','EQUIPMENT')
ref_id            UUID NULLABLE          -- staffId when type='STAFF'; no cross-schema FK
name              VARCHAR(255) NOT NULL
working_hours     JSONB NULLABLE          -- same per-weekday shape as tenants.settings.businessHours, no timezone key; NULL = inherits tenant
turnover_minutes  INT NOT NULL DEFAULT 0 CHECK >= 0
max_capacity      INT NULLABLE CHECK > 0
is_active         BOOLEAN NOT NULL DEFAULT true
created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (tenant_id, id)                                      -- composite FK target
UNIQUE (tenant_id, id, type)                                -- lets Cluster 2+ prove resource_type matches
UNIQUE (tenant_id, ref_id) WHERE type='STAFF' AND ref_id IS NOT NULL   -- one Resource per Staff
UNIQUE (tenant_id) WHERE type='LOCATION' AND is_active       -- exactly one active LOCATION/tenant
CHECK (type = 'STAFF') = (ref_id IS NOT NULL)
CHECK type != 'STAFF' OR max_capacity IS NULL
INDEX (tenant_id, type, is_active)                           -- resource pickers
```
Every existing tenant got one active `LOCATION` row via the S02 backfill migration; every tenant provisioned after S02 gets one via `TenantProvisionedBookingHandler` instead.

### `booking.schedule_closures` / `booking.schedule_openings` — extended (S03)
```sql
resource_id  UUID NULLABLE   -- FK (tenant_id, resource_id) -> resources. NULL = tenant-wide (unchanged default).
```
`schedule_closures` gained `INDEX (tenant_id, resource_id, date)`. `schedule_openings`' old `UNIQUE(tenant_id, date)` was **replaced**, not kept — Postgres treats `NULL ≠ NULL`, so a plain unique on a nullable `resource_id` would stop enforcing "one tenant-wide opening per date" entirely:
```sql
UNIQUE (tenant_id, date) WHERE resource_id IS NULL
UNIQUE (tenant_id, resource_id, date) WHERE resource_id IS NOT NULL
```
`ScheduleOpeningEntity`'s old `@Unique(['tenantId','date'])` decorator was removed — TypeORM has no WHERE-clause decorator, so the two partial indexes exist migration-only (same as `ResourceEntity`'s own indexes).

---

## Structural Decisions

### Single-select `ResourcePicker` → two decoupled controls (S05, mid-implementation revision, 2026-09-14)
The story's own discovery lock-in specified one dropdown driving both "what the calendar shows" and "which resource a new block targets." Live manual testing by the user surfaced two gaps a single-select can't cover: (1) a manager needs to see *multiple* resources merged into one view at once, and (2) creating a block needs its own resource choice independent of whatever the view is currently scoped to. Shipped design: `ResourceFilterMenu` (multi-select checkbox, view-only) + `ResourceSelectField` (single-select, creation-only, always resets to "Todo o negócio"). `ResourcePicker.tsx` was built, then deleted. See the plan file's own S05 section for the full revision note.

### `useSchedule.ts`'s explicit tenant-wide + per-resource fan-out, never assumed inclusion
The backend's `resourceId` filter is an **exact** match (`WHERE resource_id = :id OR resource_id IS NULL` is NOT what the repository does — it's `resourceId ?? IsNull()`, one or the other, never both). A resource-scoped `GET` never includes tenant-wide items automatically. `resolveScopes()` always includes `undefined` (tenant-wide) alongside every checked resourceId, fanned out via `useQueries`, merged+de-duplicated client-side. **Getting this wrong was a real round-7 Critical bug** — the original fan-out assumed resource-scoped responses already carried the tenant-wide items, verified false only by reading the actual repository filter.

### STAFF's effective resource selection is force-emptied, never merely "assumed always empty"
`useReconciledSelectedResourceIds` computes a `reconciled` value for MANAGER (dropping stale/deactivated ids) but returns `EMPTY_RESOURCE_IDS` unconditionally for anyone else — **not** whatever is in `localStorage`. A device that was MANAGER yesterday and is STAFF today (role change, shared device, a different staff member's own session) must never silently see resource-scoped content STAFF has no UI to control. Found as a genuinely real round-14 Critical (AC violation, though the bot's guessed 403-error failure mode was itself inaccurate — GET isn't MANAGER-gated at the backend).

### Overlap/lane-splitting generalized from bookings-only to any timeline event
`assignBookingLanes` → `assignLanes<T extends TimelineEventBase>` — used for overlapping bookings (unchanged behavior) and, new in S05, overlapping same-kind closures/resource-scoped openings, so multiple resources blocked at the same time render side-by-side (each `1/N` width) instead of fully stacked. A resource-scoped opening always lane-splits only against *other* resource-scoped openings, never against the tenant-wide opening — the tenant-wide one stays a full-width backdrop every resource-scoped window is guaranteed (by domain invariant) to sit inside.

### `lockTenantDay`'s key format was NOT renamespaced, even though `lockTenantStaff` got one (S06)
Both looked like the same "add a namespace prefix, can never theoretically collide" cleanup. Renaming `lockTenantDay`'s already-live key would desynchronize an old and a new instance during a rolling/blue-green Cloud Run deploy (each hashing a different key for the same `(tenantId, date)`), silently reopening the M21-S03 race for the deploy window. `lockTenantStaff` is a brand-new key with nothing live to desync against, so it got the `tenantstaff:` prefix from day one. Caught by Codex, PR #461 round 1.

### `TenantProvisionedBookingHandler`, not bare `TenantProvisionedHandler` (S02 part 2)
`packages/infra-scripts/src/pubsub-catalog.ts`'s Pub/Sub-topic generator keys every collected `static readonly` prop by `"${className}.${propName}"` with no file/module qualifier. A second class named `TenantProvisionedHandler` with a different `CONSUMER_NAME` (Staff context already has one) throws a generator conflict at CI's catalog-generation step. Notification context's own handler already solved this the same way (`TenantProvisionedNotificationHandler`) — Booking's follows the identical precedent.

### Race closed via advisory lock, not by adding the lock call alone (S06)
Closing the staff-wrap-vs-`StaffDeactivated` race required *moving the authoritative check inside the transaction* for all four call sites (`CreateResourceUseCase`, `UpdateResourceUseCase`, `ReactivateResourceUseCase`, `CascadeStaffDeactivationUseCase`) — acquiring `lockTenantStaff` alone, without relocating what it protects, would have closed nothing. `UpdateResourceUseCase` additionally needed a **fresh re-read under the lock** (`findById()` after acquiring it) even for the `refId`-*unchanged* sub-case (a `turnoverMinutes`-only PATCH), since its own blind `save()` on a stale in-memory `isActive` could silently undo a concurrently-committed cascade deactivation — widened during CodeRabbit review, PR #461 round 1.

---

## Error Mapping

| Error code | HTTP status | Trigger |
|---|---|---|
| `BOOKING_RESOURCE_TYPE_NOT_CREATABLE` | 422 | `POST /resources` with `type: 'LOCATION'` |
| `BOOKING_RESOURCE_TYPE_REF_ID_MISMATCH` | 400/422 | `(type==='STAFF') !== (refId != null)` |
| `BOOKING_RESOURCE_WORKING_HOURS_OUTSIDE_TENANT_HOURS` | 422 | `workingHours` window not a subset of tenant `businessHours` |
| `BOOKING_RESOURCE_NO_WORKING_HOURS` | 422 | neither resource nor tenant has hours for a day |
| `BOOKING_RESOURCE_MAX_CAPACITY_INVALID` | 422 | `maxCapacity` set and `<= 0`, or set for a STAFF resource |
| `BOOKING_RESOURCE_STAFF_ALREADY_WRAPPED` | 409 | staff member already has a `Resource` row |
| `BOOKING_RESOURCE_STAFF_NOT_FOUND` | 404/422 | referenced staff doesn't exist/isn't active/not schedulable |
| `BOOKING_RESOURCE_NOT_FOUND` | 404 | resource id missing or cross-tenant (also used for a bad `resourceId` on a closure/opening) |
| `BOOKING_RESOURCE_NOT_ACTIVE` | 409/422 | operating on a deactivated resource where active is required |
| `BOOKING_RESOURCE_ALREADY_ACTIVE` | 409 | `POST /resources/:id/reactivate` on an already-active resource |
| `BOOKING_RESOURCE_LOCATION_CANNOT_BE_DEACTIVATED` | 409 | `DELETE` on the tenant's `LOCATION` resource |
| `BOOKING_RESOURCE_LOCATION_TYPE_IMMUTABLE` | 409 | `PATCH` changing `type` to/from `LOCATION` |
| `BOOKING_RESOURCE_LOCATION_WORKING_HOURS_IMMUTABLE` | 409 | `PATCH` setting custom `workingHours` on `LOCATION` (always inherits tenant hours) |
| `BOOKING_TENANT_OPENING_REQUIRED` | 422 | resource-scoped opening on a date the tenant has no tenant-wide opening for, and the day is normally closed |
| `BOOKING_OPENING_EXCEEDS_TENANT_WINDOW` | 422 | resource-scoped opening window extends beyond the bounding tenant window |
| `BOOKING_TENANT_OPENING_HAS_RESOURCE_DEPENDENTS` | 409 | `DELETE` on a tenant-wide opening while a resource-scoped opening still depends on it for that date |

---

## Pub/Sub Topics

| Trigger | Topic | Handler |
|---|---|---|
| `StaffDeactivated` (existing, first Booking consumer) | — | `StaffDeactivatedHandler` → `CascadeStaffDeactivationUseCase` |
| `TenantProvisioned` (existing, new Booking-side subscription, `CONSUMER_NAME = 'booking'`) | — | `TenantProvisionedBookingHandler` → `CreateTenantLocationResourceUseCase` |

No new domain events published by any M21 story — `ResourceReactivated`/config-only changes stay eventless (no consumer yet; would get no Pub/Sub topic from the auto-generated catalog per the zero-subscriber rule).

---

## Auth Model

| Surface | Guard |
|---|---|
| Every `/resources*` route (backend + BFF) | `MANAGER`-only, unconditionally |
| `POST/PATCH /schedule/closures`, `/schedule/openings` with `resourceId` set in the body | `MANAGER`-only (in-controller branch, not a separate route) |
| Same routes, `resourceId` omitted | `MANAGER\|STAFF` — unchanged from pre-M21 |
| `DELETE /schedule/closures/:id`, `/schedule/openings/:id` | `MANAGER\|STAFF` unconditionally, even for a resource-scoped item — **not symmetric** with create's restriction; DELETE carries no `resourceId`, out of scope for UC-010e/f |
| `ResourceFilterMenu`/`ResourceSelectField` (frontend) | rendered only for `role === 'MANAGER'` (hidden, not disabled) — `role` sourced from `useTenant()`, itself sourced from `shell.role` |

---

## Test Infrastructure

See Artifacts table above. `InMemoryResourceRepository`/`ResourceBuilder`/`ResourceEntityBuilder` live in `apps/backend/src/test/{repositories,builders}/booking/`, matching the existing per-context layout. Migration tests for data-only migrations live as siblings of `migrations/`, not inside it (`jest.config.ts`'s `integration` project ignores `/migrations/`).

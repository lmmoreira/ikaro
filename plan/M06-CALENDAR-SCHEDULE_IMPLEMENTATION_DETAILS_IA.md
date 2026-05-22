# M06 — Calendar & Schedule — Implementation Details (IA)

Token-efficient reference for AI agents. No prose — facts, gotchas, structural decisions only.

---

## Artifacts

| Artifact | Path |
|---|---|
| ScheduleClosure aggregate | `apps/backend/src/contexts/booking/domain/schedule-closure.aggregate.ts` |
| ScheduleOpening aggregate | `apps/backend/src/contexts/booking/domain/schedule-opening.aggregate.ts` |
| ScheduleClosure migration | `apps/backend/src/contexts/booking/infrastructure/migrations/1748000000012-CreateBookingScheduleClosures.ts` |
| ScheduleOpening migration | `apps/backend/src/contexts/booking/infrastructure/migrations/1748000000013-CreateBookingScheduleOpenings.ts` |
| Closure entity | `apps/backend/src/contexts/booking/infrastructure/entities/schedule-closure.entity.ts` |
| Opening entity | `apps/backend/src/contexts/booking/infrastructure/entities/schedule-opening.entity.ts` |
| Closure TypeORM repo | `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-schedule-closure.repository.ts` |
| Opening TypeORM repo | `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-schedule-opening.repository.ts` |
| Closure repo port | `apps/backend/src/contexts/booking/application/ports/schedule-closure-repository.port.ts` |
| Opening repo port | `apps/backend/src/contexts/booking/application/ports/schedule-opening-repository.port.ts` |
| Tenant settings port | `apps/backend/src/contexts/booking/application/ports/schedule-tenant-settings.port.ts` |
| Tenant settings adapter | `apps/backend/src/contexts/booking/infrastructure/cross-context/schedule-tenant-settings.adapter.ts` |
| PlatformSettingsModule | `apps/backend/src/contexts/platform/platform-settings.module.ts` |
| Closure use cases | `apps/backend/src/contexts/booking/application/use-cases/close-schedule.use-case.ts`, `remove-closure.use-case.ts`, `list-closures.use-case.ts` |
| Opening use cases | `apps/backend/src/contexts/booking/application/use-cases/open-schedule.use-case.ts`, `remove-schedule-opening.use-case.ts`, `list-openings.use-case.ts` |
| Closure controller | `apps/backend/src/contexts/booking/infrastructure/controllers/schedule-closure.controller.ts` |
| Opening controller | `apps/backend/src/contexts/booking/infrastructure/controllers/schedule-opening.controller.ts` |
| Error mapper | `apps/backend/src/contexts/booking/infrastructure/http/booking-error.mapper.ts` |
| BFF closure controller | `apps/bff/src/schedule/schedule.controller.ts` |
| BFF opening controller | `apps/bff/src/schedule/schedule-opening.controller.ts` |
| BFF schedule module | `apps/bff/src/schedule/schedule.module.ts` |
| BFF schedule types | `apps/bff/src/schedule/schedule.types.ts` |
| In-memory closure repo | `apps/backend/src/test/repositories/booking/in-memory-schedule-closure.repository.ts` |
| In-memory opening repo | `apps/backend/src/test/repositories/booking/in-memory-schedule-opening.repository.ts` |
| In-memory tenant settings port | `apps/backend/src/test/infrastructure/in-memory-schedule-tenant-settings.ts` |
| Closure entity builder | `apps/backend/src/test/builders/booking/schedule-closure-entity.builder.ts` |
| Opening entity builder | `apps/backend/src/test/builders/booking/schedule-opening-entity.builder.ts` |
| Closure aggregate builder | `apps/backend/src/test/builders/booking/schedule-closure.builder.ts` |
| Opening aggregate builder | `apps/backend/src/test/builders/booking/schedule-opening.builder.ts` |
| Backend HTTP file | `apps/backend/http/booking/schedule-closures.http`, `schedule-openings.http` |

---

## Critical Gotchas

### 1. PostgreSQL `time` columns return `HH:MM:SS`, not `HH:MM`

PostgreSQL `time` column type returns `'09:00:00'` strings when read via TypeORM. The `TimeOfDay` VO `create()` method normalises `HH:MM:SS → HH:MM` automatically (added in M06-S07). **Do not add `.slice(0, 5)` in repository `toDomain()` — the VO handles it.** Both `ScheduleClosureEntity` and `ScheduleOpeningEntity` use `type: 'time'` columns. Any future entity with a `time` column passes the raw value directly to `TimeOfDay.create()`.

### 2. `PlatformSettingsModule` — lightweight cross-context read module

`BookingModule` cannot import the full `PlatformModule` because `PlatformModule` includes `ProvisionTenantUseCase` which depends on `IEventBus`. Booking integration tests don't provide `EventBusModule`, so the full import would fail. **Use `PlatformSettingsModule` instead** — it only registers `TypeOrmTenantRepository` + `GetTenantByIdUseCase`, no event bus.

```typescript
// BookingModule imports
PlatformSettingsModule  // ✅ lightweight — no IEventBus
// NOT PlatformModule  // ❌ brings ProvisionTenantUseCase → IEventBus → integration test crash
```

`GetTenantByIdUseCaseResult` now includes `settings: TenantSettingsProps` (added M06-S07). Use it to read `business_hours` without a separate use case.

### 3. Integration tests must include `TenantEntity` in `TypeOrmModule.forRoot({ entities })`

`BookingModule` imports `PlatformSettingsModule` which uses `TypeOrmModule.forFeature([TenantEntity])`. Any integration test that imports `BookingModule` must list `TenantEntity` in its `forRoot` entities array, otherwise TypeORM cannot create the tenant repository.

Current booking integration tests entity list:
```typescript
entities: [ServiceEntity, ScheduleClosureEntity, ScheduleOpeningEntity, TenantEntity]
```

### 4. Opening integration tests must seed `TenantEntity` rows

`OpenScheduleUseCase` calls `IScheduleTenantSettingsPort.getBusinessHours(tenantId)` which hits the DB via `GetTenantByIdUseCase`. Integration tests for `ScheduleOpeningController` must insert `TenantEntity` rows in `beforeAll` for every `tenantId` used in POST tests. Use `TenantEntityBuilder` — its default settings have `sunday: null` (closed), Mon–Sat open.

```typescript
await tenantRepo.save(new TenantEntityBuilder().withId(TENANT_A).withSlug('tenant-a-400').build());
```

This is NOT needed for closure, DELETE, or GET tests (they don't call the settings port).

### 5. `OpenScheduleUseCase` validates date before settings lookup

Validation order in `execute()` is intentional:
1. Past date check (throws `OpeningDateInPastError`) — before DB call
2. `getBusinessHours()` — DB read
3. Day-of-week check (throws `DayAlreadyOpenInSettingsError`)
4. Duplicate check (throws `ScheduleOpeningAlreadyExistsError`)
5. `ScheduleOpening.open()` — aggregate validates endTime > startTime

If past-date check came after the settings lookup, a past Thursday would throw `DayAlreadyOpenInSettingsError` (wrong error). Keep the guard at the top.

### 6. Day-of-week calculation uses UTC

```typescript
const DAY_NAMES: (keyof BusinessHours)[] = ['sunday','monday',...,'saturday'];
const dayName = DAY_NAMES[new Date(`${dto.date}T00:00:00Z`).getUTCDay()];
```

The `T00:00:00Z` suffix forces UTC parsing — never use `new Date(dto.date)` alone (local timezone offset can shift the day).

### 7. Full-day closures have `null` startTime/endTime — partial closures do not

`ScheduleClosure` supports both modes. `isFullDay()` returns `startTime === null`. The `overlaps()` method handles both cases for duplicate detection. `ScheduleOpening` always requires explicit `startTime` and `endTime` (no null mode).

---

## `InMemoryScheduleTenantSettingsPort` default

Located at `apps/backend/src/test/infrastructure/in-memory-schedule-tenant-settings.ts`.

Default: Mon–Sat open (`{ open: '09:00', close: '18:00' }` / `'17:00'`), Sunday `null`. Matches `TenantSettings.default()`. Use for any test that needs `IScheduleTenantSettingsPort` — no setup required unless overriding per-tenant hours.

```typescript
const settingsPort = new InMemoryScheduleTenantSettingsPort();
// To override:
settingsPort.setBusinessHours(tenantId, { ...customHours });
```

---

## `nextWeekday` helper

`src/test/utils/date-helpers.ts` exports `nextWeekday(utcDayOfWeek: 0|1|2|3|4|5|6, weeksAhead = 1): string`.

```typescript
nextWeekday(0)  // next Sunday  (closed in default settings)
nextWeekday(1)  // next Monday  (open in default settings)
nextWeekday(0, 2)  // Sunday two weeks from now
```

Use instead of inline `nextSunday()` / `nextMonday()` — those are banned by CLAUDE.md §7.

---

## BFF test helper file isolation

Two files in `apps/bff/src/test/`:

| File | Imports AppModule? | Used by |
|---|---|---|
| `backend-http.mock.ts` | No | Unit specs (`*.spec.ts`) |
| `component-test.helpers.ts` | Yes (via `createTestApp`) | Component specs (`*.component.spec.ts`) |

`MockBackendHttpService` type is defined in `backend-http.mock.ts` and re-exported from `component-test.helpers.ts`. Unit specs import from `backend-http.mock.ts`; importing from `component-test.helpers.ts` in a unit spec causes `validateEnv()` to crash the coverage run.

---

## Error mappings (booking-error.mapper.ts)

| Error | HTTP status |
|---|---|
| `ServiceNotFoundError` | 404 |
| `ScheduleClosureNotFoundError` | 404 |
| `ScheduleOpeningNotFoundError` | 404 |
| `ServiceDeactivatedError` | 409 |
| `ScheduleAlreadyClosedError` | 409 |
| `ScheduleOpeningAlreadyExistsError` | 409 |
| `ClosureDateInPastError` | 422 |
| `OpeningDateInPastError` | 422 |
| `DayAlreadyOpenInSettingsError` | 422 |
| `BookingDomainError` (base) | 400 |

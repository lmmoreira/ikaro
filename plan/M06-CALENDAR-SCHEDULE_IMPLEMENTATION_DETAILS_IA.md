# M06 — Calendar & Schedule — Implementation Details (IA)

Token-efficient reference for AI agents. No prose — facts, gotchas, structural decisions only.

---

## Artifacts

### Domain

| Artifact | Path |
|---|---|
| ScheduleClosure aggregate | `contexts/booking/domain/schedule-closure.aggregate.ts` |
| ScheduleOpening aggregate | `contexts/booking/domain/schedule-opening.aggregate.ts` |
| BookedSlot interface | `contexts/booking/domain/booked-slot.ts` — `{ scheduledAt: Date; totalDurationMins: number }` |
| AvailabilityService | `contexts/booking/domain/services/availability.service.ts` — pure domain service, no I/O |
| Domain errors | `contexts/booking/domain/errors/booking-domain.error.ts` |

### Application ports

| Artifact | Path |
|---|---|
| Closure repo port | `contexts/booking/application/ports/schedule-closure-repository.port.ts` |
| Opening repo port | `contexts/booking/application/ports/schedule-opening-repository.port.ts` |
| Service repo port | `contexts/booking/application/ports/service-repository.port.ts` — added `findByIds` in M06 |
| Tenant settings port | `contexts/booking/application/ports/schedule-tenant-settings.port.ts` — `getSchedulingSettings()` returns both in one DB trip |
| Booking availability port | `contexts/booking/application/ports/booking-availability.port.ts` — `findApprovedByTenantAndDate` + `findApprovedByTenantAndDateRange`; stubbed until M07 |

### Application use cases

| Artifact | Path |
|---|---|
| CloseScheduleUseCase | `contexts/booking/application/use-cases/close-schedule.use-case.ts` |
| RemoveClosureUseCase | `contexts/booking/application/use-cases/remove-closure.use-case.ts` |
| ListClosuresUseCase | `contexts/booking/application/use-cases/list-closures.use-case.ts` |
| OpenScheduleUseCase | `contexts/booking/application/use-cases/open-schedule.use-case.ts` |
| RemoveScheduleOpeningUseCase | `contexts/booking/application/use-cases/remove-schedule-opening.use-case.ts` |
| ListOpeningsUseCase | `contexts/booking/application/use-cases/list-openings.use-case.ts` |
| GetAvailabilityUseCase | `contexts/booking/application/use-cases/get-availability.use-case.ts` — result: `GetAvailabilityUseCaseResult` |
| GetAvailabilitySummaryUseCase | `contexts/booking/application/use-cases/get-availability-summary.use-case.ts` — result: `GetAvailabilitySummaryUseCaseResult = DaySummary[]` |

### Infrastructure

| Artifact | Path |
|---|---|
| Closure migration | `contexts/booking/infrastructure/migrations/1748000000012-CreateBookingScheduleClosures.ts` |
| Opening migration | `contexts/booking/infrastructure/migrations/1748000000013-CreateBookingScheduleOpenings.ts` |
| Closure entity | `contexts/booking/infrastructure/entities/schedule-closure.entity.ts` |
| Opening entity | `contexts/booking/infrastructure/entities/schedule-opening.entity.ts` |
| Closure TypeORM repo | `contexts/booking/infrastructure/repositories/typeorm-schedule-closure.repository.ts` |
| Opening TypeORM repo | `contexts/booking/infrastructure/repositories/typeorm-schedule-opening.repository.ts` |
| Booking availability stub | `contexts/booking/infrastructure/cross-context/in-memory-booking-availability.adapter.ts` |
| Tenant settings adapter | `contexts/booking/infrastructure/cross-context/schedule-tenant-settings.adapter.ts` |
| Closure controller (backend) | `contexts/booking/infrastructure/controllers/schedule-closure.controller.ts` |
| Opening controller (backend) | `contexts/booking/infrastructure/controllers/schedule-opening.controller.ts` |
| Availability controller (backend) | `contexts/booking/infrastructure/controllers/schedule-availability.controller.ts` |
| Summary controller (backend) | `contexts/booking/infrastructure/controllers/schedule-availability-summary.controller.ts` |
| Error mapper | `contexts/booking/infrastructure/http/booking-error.mapper.ts` |

### BFF

| Artifact | Path |
|---|---|
| Schedule closures/openings controller | `apps/bff/src/schedule/schedule.controller.ts`, `schedule-opening.controller.ts` |
| Availability controller | `apps/bff/src/schedule/schedule-availability.controller.ts` — `@Public()` |
| Summary controller | `apps/bff/src/schedule/schedule-availability-summary.controller.ts` — `@Public()` |
| BFF types | `apps/bff/src/schedule/schedule.types.ts` |

### Shared utilities (added in M06)

| Artifact | Path |
|---|---|
| calendar-date utils | `shared/utils/calendar-date.ts` — `todayUTC()`, `getUtcWeekDayName()`, `localDateTimeToUTCIso()`, `utcDateToLocalHHMM()`, `utcDateToLocalDate()` |
| TimeOfDay VO (extended) | `shared/value-objects/time-of-day.vo.ts` — added `toMinutes()`, `fromMinutes()`, `addMinutes()` |

### Test infrastructure

| Artifact | Path |
|---|---|
| InMemory closure repo | `test/repositories/booking/in-memory-schedule-closure.repository.ts` |
| InMemory opening repo | `test/repositories/booking/in-memory-schedule-opening.repository.ts` |
| InMemory service repo | `test/repositories/booking/in-memory-service.repository.ts` — added `findByIds` |
| InMemoryScheduleTenantSettingsPort | `test/infrastructure/in-memory-schedule-tenant-settings.ts` |
| InMemoryBookingAvailabilityPort | `test/infrastructure/in-memory-booking-availability.ts` |
| Builders | `test/builders/booking/` — ScheduleClosureBuilder, ScheduleOpeningBuilder, ServiceBuilder (all with entity variants) |
| date-helpers | `test/utils/date-helpers.ts` — `futureDate`, `pastDate`, `nextWeekday`, `addDays` |

---

## Critical Gotchas

### 1. PostgreSQL `time` → `HH:MM:SS` — normalised by `TimeOfDay.create()`

TypeORM returns `time` columns as `'09:00:00'` strings. `TimeOfDay.create('09:00:00')` normalises to `'09:00'` inside the VO. **Never add `.slice(0, 5)` in `toDomain()` mappers.** Both closure and opening entities have `type: 'time'` columns; pass the raw value directly to `TimeOfDay.create()`.

### 2. `getSchedulingSettings()` — one DB trip, not two

Do NOT call `getBusinessHours(tenantId)` + `getBookingSettings(tenantId)` separately — that is two queries to the same row. Use `getSchedulingSettings(tenantId)` which calls `GetTenantByIdUseCase` once and returns `{ businessHours, bookingSettings }`.

### 3. `utcDateToLocalDate` vs `utcDateToLocalHHMM`

`utcDateToLocalHHMM(utcDate, tz)` → `'HH:MM'` string.
`utcDateToLocalDate(utcDate, tz)` → `'YYYY-MM-DD'` string in tenant timezone.

The summary use case uses `utcDateToLocalDate` to bucket existing bookings by local date. Using `utcDateToLocalHHMM` here was a bug (returns time, not date).

### 4. `todayUTC()` boundary — today is NOT past

The condition is `date < today` (strict less-than). Today itself goes through normal availability calculation. Integration tests asserting "all past → available:false" must use a range entirely in the past — e.g. `pastDate(7)` to `pastDate(2)`. Using `pastDate()` to `todayUTC()` fails because today may have open slots.

### 5. `IBookingAvailabilityPort` stub — always returns `[]`

`InMemoryBookingAvailabilityAdapter` always returns `[]` for both methods until M07 wires `TypeOrmBookingAvailabilityAdapter`. Booking-overlap availability scenarios are covered by unit tests on `AvailabilityService`; integration-level overlap tests land in M07.

### 6. No `UNIQUE(tenant_id, date)` on `schedule_closures`

A date can have multiple partial closures. Overlap detection is in `CloseScheduleUseCase` via `c.overlaps(newStart, newEnd)` — not at DB level. `schedule_openings` keeps `UNIQUE(tenant_id, date)` — one opening per date.

### 7. Opening precedence is absolute

If `ScheduleOpening` exists for a date, `AvailabilityService.resolveEffectiveHours()` returns the opening window and ignores ALL closures and `businessHours`. Full-day closure + opening on the same date → opening wins.

### 8. `overlaps()` uses half-open intervals

`[aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅` iff `aStart < bEnd && bStart < aEnd`. A slot at 12:00 does NOT overlap a closure ending at 12:00.

### 9. BFF public endpoints use `throw`, not `return Promise.reject()`

SonarCloud S6959 flags `return Promise.reject()` in async functions as a code smell. BFF availability controllers use `throw new HttpException(...)` for early-exit errors. Backend controllers that chain `.catch(mapBookingError)` still use `return Promise.reject(new HttpException(...))`.

### 10. Integration test tenant seeding — API-driven via `POST /internal/tenants`

Booking integration tests that call the settings port (availability, openings) must provision tenants via the platform API — not `ds.getRepository(TenantEntity).save()`. Pattern:

```typescript
const TEST_KEY = 'some-test-key-at-least-32-chars-xxx'; // ≥32 chars

beforeAll(async () => {
  process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;

  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({ entities: [TenantEntity, HotsiteConfigEntity, ...], ... }),
      EventBusModule,         // required by PlatformModule
      TransactionManagerModule,
      TenantModule,
      PlatformModule,         // provides POST /internal/tenants
      BookingModule,
    ],
    providers: [{ provide: APP_INTERCEPTOR, useClass: TenantInterceptor }],
  })
    .overrideProvider(EVENT_BUS)
    .useValue(new InMemoryEventBus())    // avoid Pub/Sub in integration tests
    .compile();

  // ...

  const { body } = await request(app.getHttpServer())
    .post('/internal/tenants')
    .set('Authorization', `Bearer ${TEST_KEY}`)
    .send({ name: 'Test', slug: 'unique-slug', adminEmail: 'a@test.com' })
    .expect(201);
  tenantId = body.tenantId as string;
});

afterAll(async () => {
  delete process.env['PLATFORM_ADMIN_KEY'];
  await app.close();
});
```

`TenantEntity` and `HotsiteConfigEntity` must be in `forRoot`'s entities list. `ProvisionTenantUseCase` emits `TenantProvisioned` — override `EVENT_BUS` with `InMemoryEventBus` to prevent Pub/Sub connection attempts.

### 11. `AvailabilityService` is a domain service, not a use case

No `execute()`, no actor, no ports — pure computation. Registered as a plain provider in `BookingModule`. Called by both `GetAvailabilityUseCase` and (in M07) `RequestBookingUseCase`. Using it from multiple use cases is correct; a use case calling another use case would be an anti-pattern.

### 12. `OpenScheduleUseCase` validates date before settings lookup

Order matters: past-date check before `getBusinessHours()` DB call. A past Thursday must throw `OpeningDateInPastError`, not `DayAlreadyOpenInSettingsError`.

---

## Three-Layer Resolution (quick reference)

```
if (opening exists for date)           → use opening.startTime/endTime; ignore closures + businessHours
else if (businessHours[day] == null)  → return []
else if (any closure.isFullDay())      → return []
else                                   → use businessHours[day]; filter slots blocked by partial closures
```

---

## Default Tenant Settings (TenantSettings.default())

| Setting | Value |
|---|---|
| Mon–Fri | 09:00–18:00 |
| Saturday | 09:00–17:00 |
| Sunday | `null` (closed) |
| `serviceBufferMinutes` | 60 |
| `slotGranularityMinutes` | 30 |
| `maxBookingAdvanceDays` | 90 |
| timezone | `America/Sao_Paulo` (UTC-3) |

---

## Error → HTTP Mappings (booking-error.mapper.ts)

| Error | HTTP |
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
| `AvailabilityDateInPastError` | 422 |
| `AvailabilityRangeInvalidError` | 422 |
| `BookingDomainError` (base) | 400 |

---

## Test Helpers

**`InMemoryScheduleTenantSettingsPort`** — defaults Mon–Sat open, Sunday null (matches `TenantSettings.default()`). Use for all tests needing `IScheduleTenantSettingsPort` without DB. Override per-tenant:
```typescript
settingsPort.setBusinessHours(tenantId, { ...customHours });
```

**`nextWeekday(dow, weeksAhead=1)`** — use `nextWeekday(0)` for Sunday (closed), `nextWeekday(1)` for Monday (open). Never define inline `nextSunday()` / `nextMonday()`.

**`addDays(date, n)`** — added to `date-helpers.ts` in M06. Required for range-based tests (summary endpoint).

---

## M07 Integration Points

M07-S03 must implement `TypeOrmBookingAvailabilityAdapter` with:
- `findApprovedByTenantAndDate(tenantId, date)` — filter APPROVED bookings whose `scheduled_at` falls on `date` in tenant TZ
- `findApprovedByTenantAndDateRange(tenantId, from, to)` — same for a range

Replace the `InMemoryBookingAvailabilityAdapter` binding in `BookingModule` with `TypeOrmBookingAvailabilityAdapter` once M07-S03 is done. `AvailabilityService` itself needs no changes — `RequestBookingUseCase` calls `calculate()` with the same inputs already defined.

## BFF Test Isolation Rule

`apps/bff/src/test/component-test.helpers.ts` imports `AppModule` → triggers `validateEnv()`. Unit specs (`*.spec.ts`) must import from `backend-http.mock.ts` only. Component specs (`*.component.spec.ts`) import from `component-test.helpers.ts`.

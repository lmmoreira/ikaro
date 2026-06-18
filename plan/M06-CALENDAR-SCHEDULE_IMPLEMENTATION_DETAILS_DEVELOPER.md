# M06 — Calendar & Schedule Availability — Developer Learning Guide

Detailed explanation of every concept implemented in M06. Use this to understand NestJS patterns, DDD structures, and design decisions. Written for a developer who may be new to hexagonal architecture or the Ikaro codebase.

---

## Table of Contents

1. [What M06 Builds](#1-what-m06-builds)
2. [Domain Aggregates: ScheduleClosure and ScheduleOpening](#2-domain-aggregates)
3. [The Availability Algorithm](#3-the-availability-algorithm)
4. [Why AvailabilityService is a Domain Service, Not a Use Case](#4-why-availabilityservice-is-a-domain-service)
5. [Cross-Context Data: IBookingAvailabilityPort](#5-cross-context-data-ibookingavailabilityport)
6. [The Two-Phase Calendar UX (Range + Detail)](#6-two-phase-calendar-ux)
7. [Shared Utilities: calendar-date.ts and TimeOfDay VO](#7-shared-utilities)
8. [Public BFF Endpoints and the @Public() Decorator](#8-public-bff-endpoints)
9. [Integration Testing Across Bounded Contexts](#9-integration-testing-across-bounded-contexts)
10. [Key Design Decisions and Tradeoffs](#10-key-design-decisions)

---

## 1. What M06 Builds

M06 implements two things:

**Schedule management** — admins can close specific dates (full day or a time window) to block bookings, and open normally-closed days (e.g., a Sunday) as one-off exceptions.

**Availability API** — guests call a public endpoint to see available booking slots. The algorithm respects business hours, closures, openings, and existing APPROVED bookings.

The availability algorithm uses a three-layer priority system:
```
ScheduleOpening > ScheduleClosure > business_hours
```

---

## 2. Domain Aggregates

### ScheduleClosure

A `ScheduleClosure` blocks a date from receiving new bookings. It can be:
- **Full-day**: `startTime = null, endTime = null` — the entire day is blocked
- **Partial**: `startTime = '10:00', endTime = '12:00'` — only that window is blocked

```typescript
// Creating a closure
const closure = ScheduleClosure.close(tenantId, '2026-12-25', 'HOLIDAY', staffId);
const partial = ScheduleClosure.close(tenantId, '2026-12-26', 'MAINTENANCE', staffId, '09:00', '11:00');

// Checking type
closure.isFullDay();  // true
partial.isFullDay();  // false

// Checking overlap (used by CloseScheduleUseCase before saving a second closure)
existing.overlaps('09:30', '10:30');  // true if windows intersect
```

**Important DB decision:** There is NO `UNIQUE(tenant_id, date)` constraint on `schedule_closures`. A date can have multiple partial closures (e.g., 09:00–11:00 AND 14:00–16:00). Overlap detection is enforced in `CloseScheduleUseCase` at the application layer, not the DB. This is the correct hexagonal architecture pattern — DB constraints enforce structural integrity (NOT NULL, FK), while business rules live in the domain/application layers.

### ScheduleOpening

A `ScheduleOpening` opens a normally-closed day for a specific time window. The classic use case: a car wash is closed on Sundays, but this particular Sunday they'll work 09:00–14:00.

```typescript
const opening = ScheduleOpening.open(tenantId, '2026-12-28', '09:00', '14:00', staffId);
```

`ScheduleOpening` has `UNIQUE(tenant_id, date)` at the DB level — only one opening per date makes sense. `OpenScheduleUseCase` also validates that the day's `business_hours` is `null` (you can't open a day that's already open in the regular schedule).

### Why Props Use Value Objects

Both aggregates store `startTime`/`endTime` as `TimeOfDay` value objects in domain props, not raw strings. This means:

```typescript
// Domain aggregate
opening.startTime           // TimeOfDay VO
opening.startTime.value     // '09:00' (string)
opening.startTime.toMinutes()  // 540

// TypeORM entity
entity.startTime            // '09:00' (raw string, possibly '09:00:00' from PostgreSQL)
```

The TypeORM `toDomain()` mapper passes the raw string to `TimeOfDay.create()` which normalises `'09:00:00'` → `'09:00'`. This is the VO's job — never add `.slice(0, 5)` in a mapper.

---

## 3. The Availability Algorithm

`AvailabilityService.calculate(input)` is a pure function — given schedule data, it returns available time slots. Here's how it works step by step:

### Step 1 — Resolve effective hours

```typescript
private resolveEffectiveHours(date, businessHours, closures, opening) {
  // Priority 1: ScheduleOpening wins over everything
  if (opening) {
    return { open: opening.startTime.value, close: opening.endTime.value, partialClosures: [] };
  }

  // Priority 2: Business hours — null means closed
  const dayHours = businessHours[getUtcWeekDayName(date)];
  if (!dayHours) return null;  // closed day

  // Priority 3: Full-day closure voids the day
  if (closures.some(c => c.isFullDay())) return null;

  // Otherwise: use business hours, carrying partial closures for slot filtering
  return { open: dayHours.open, close: dayHours.close, partialClosures: closures.filter(c => !c.isFullDay()) };
}
```

### Step 2 — Generate candidate slots

```typescript
const totalMins = services.reduce((sum, s) => sum + s.durationMinutes, 0) + serviceBufferMinutes;
// e.g., 30 min service + 60 min buffer = 90 min total

let cursor = TimeOfDay.create(open);  // start at business open time
const closeTime = TimeOfDay.create(close);

while (cursor.addMinutes(totalMins).toMinutes() <= closeTime.toMinutes()) {
  // check if slot is blocked...
  cursor = cursor.addMinutes(slotGranularityMinutes);  // advance by granularity (e.g., 30 min)
}
```

**Key insight about buffer:** The buffer is part of the booked window, not a gap between bookings. A 30-min service with 60-min buffer occupies 90 min on the calendar. The *next* booking can start once the full 90 min has cleared.

**Key insight about granularity:** Granularity controls where start times land (09:00, 09:30, 10:00...), not how much time a booking occupies. A 90-min booking with 30-min granularity does NOT round up to 120 min.

### Step 3 — Check each slot for conflicts

```typescript
const blockedByClosure = partialClosures.some(c =>
  this.overlaps(cursor.value, endTime.value, c.startTime!.value, c.endTime!.value)
);

const blockedByBooking = bookedRanges.some(b =>
  this.overlaps(cursor.value, endTime.value, b.start, b.end)
);
```

**Overlap algorithm:** Two half-open intervals `[A, B)` and `[C, D)` overlap when `A < D && C < B`. A slot ending exactly at 12:00 does NOT overlap a closure starting at 12:00. This is intuitive: a 10:30–12:00 slot and a 12:00–14:00 closure are adjacent, not overlapping.

### Step 4 — Convert to UTC

All output slots use ISO-8601 UTC timestamps. Business hours are in tenant timezone:

```typescript
// '2026-06-15' + '09:00' in 'America/Sao_Paulo' (UTC-3) → '2026-06-15T12:00:00.000Z'
startsAt: localDateTimeToUTCIso(date, cursor.value, timezone)
```

---

## 4. Why AvailabilityService is a Domain Service

This is a common architecture question. Here's the decision framework:

| Question | Use Case | Domain Service |
|---|---|---|
| Has an actor (who performs the action)? | Yes | No |
| Calls ports/repositories? | Yes | No |
| Has a single caller? | Usually | No — multiple callers |
| Named after a domain concept? | "Request booking" | "Calculate availability" |

`AvailabilityService` has no actor, no I/O, no `execute()` method. It is called by:
1. `GetAvailabilityUseCase` (M06-S04) — guest views available slots
2. `RequestBookingUseCase` (M07) — re-verifies a slot hasn't been taken since the calendar was viewed

If this were a use case, `RequestBookingUseCase` would have to call another use case — which is an anti-pattern in DDD (use cases are application-layer entry points, not internal helpers).

In NestJS, a domain service is registered as a plain provider:
```typescript
// BookingModule
providers: [
  AvailabilityService,  // no interface, no token — just a class provider
  GetAvailabilityUseCase,
]
```

`GetAvailabilityUseCase` receives it via constructor injection:
```typescript
constructor(
  // ...
  private readonly availabilityService: AvailabilityService,
) {}
```

---

## 5. Cross-Context Data: IBookingAvailabilityPort

The availability algorithm needs to know about existing APPROVED bookings to block their slots. But the `Booking` aggregate doesn't exist yet in M06 — it's implemented in M07.

This is solved with a **port + stub adapter** pattern:

```
Booking context (M06)
  └── application/ports/booking-availability.port.ts  ← defines the interface
  └── infrastructure/cross-context/in-memory-booking-availability.adapter.ts  ← stub (always returns [])
```

The interface:
```typescript
export interface IBookingAvailabilityPort {
  findApprovedByTenantAndDate(tenantId: string, date: string): Promise<BookedSlot[]>;
  findApprovedByTenantAndDateRange(tenantId: string, from: string, to: string): Promise<BookedSlot[]>;
}
```

The stub:
```typescript
@Injectable()
export class InMemoryBookingAvailabilityAdapter implements IBookingAvailabilityPort {
  async findApprovedByTenantAndDate() { return []; }
  async findApprovedByTenantAndDateRange() { return []; }
}
```

In M07-S03, this stub is replaced with `TypeOrmBookingAvailabilityAdapter` which queries the real `booking.bookings` table. The only change needed in `BookingModule` is swapping the provider:
```typescript
// Before (M06):
{ provide: BOOKING_AVAILABILITY_PORT, useClass: InMemoryBookingAvailabilityAdapter }

// After (M07):
{ provide: BOOKING_AVAILABILITY_PORT, useClass: TypeOrmBookingAvailabilityAdapter }
```

`AvailabilityService` is unchanged. `GetAvailabilityUseCase` is unchanged.

The `BookedSlot` interface shape was designed to match what M07's `Booking` aggregate will provide:
```typescript
export interface BookedSlot {
  scheduledAt: Date;      // UTC start time
  totalDurationMins: number;  // sum of service durations + buffer
}
```

---

## 6. Two-Phase Calendar UX

A booking calendar shows a month/week view where the user selects a day, then picks a time slot.

**Naive approach:** Call the single-date availability endpoint for each visible day in parallel. For a 7-day week view: 7 API calls × 3 DB queries each = 21 DB queries. For a 30-day month: 90 DB queries.

**M06 approach:** Two endpoints with different purposes:

**Phase 1 — Range summary** `GET /v1/schedule/availability/summary?from=2026-06-01&to=2026-06-07&serviceIds=...`
- Returns `[{ date, available: boolean, slotCount: number }]` for each day
- 3 total DB queries regardless of range length:
  1. `findByTenantAndDateRange(closures)`
  2. `findByTenantAndDateRange(openings)`
  3. `findApprovedByTenantAndDateRange(bookings)`
- Then loops in memory per day, calling `AvailabilityService.calculate()`

**Phase 2 — Day detail** `GET /v1/schedule/availability?date=2026-06-03&serviceIds=...`
- Returns full slot list for a single date: `{ date, slots: [{ startsAt, endsAt }], available }`
- Called when user clicks a day in the calendar

This design separates "which days are available" from "what times are available on a specific day", optimising both.

### How the summary loads bookings correctly

The range query returns bookings across multiple days. To assign them to a specific local date, the use case converts each booking's UTC `scheduledAt` to the tenant's local date:

```typescript
const dayBookings = bookings.filter(b =>
  utcDateToLocalDate(b.scheduledAt, tz) === date  // e.g., '2026-06-03'
);
```

`utcDateToLocalDate` uses Luxon internally:
```typescript
export function utcDateToLocalDate(utcDate: Date, timezone: string): string {
  return DateTime.fromJSDate(utcDate, { zone: 'utc' }).setZone(timezone).toISODate()!;
}
```

A booking at 23:00 UTC on June 3 is 20:00 São Paulo time on June 3 — correctly assigned to June 3. A booking at 02:00 UTC on June 4 is 23:00 São Paulo time on June 3 — also correctly assigned to June 3, not June 4.

---

## 7. Shared Utilities

### calendar-date.ts

All timezone-aware date/time functions live in `shared/utils/calendar-date.ts` using Luxon. Do not use `moment` or `date-fns` for timezone work — they don't handle DST correctly.

```typescript
// Today in UTC — used for "past date" validation
todayUTC(): string  // '2026-06-03'

// Day name for business_hours lookup
getUtcWeekDayName('2026-06-01'): 'monday'  // forces UTC parsing

// Convert local date + time to UTC ISO string
localDateTimeToUTCIso('2026-06-01', '09:00', 'America/Sao_Paulo'): '2026-06-01T12:00:00.000Z'

// Convert UTC Date to local HH:MM string
utcDateToLocalHHMM(new Date('2026-06-01T12:00:00Z'), 'America/Sao_Paulo'): '09:00'

// Convert UTC Date to local YYYY-MM-DD string
utcDateToLocalDate(new Date('2026-06-02T02:00:00Z'), 'America/Sao_Paulo'): '2026-06-01'
```

**Why UTC matters for day-of-week:** `new Date('2026-06-01')` without a time suffix is interpreted as UTC midnight in modern JS engines, but behaviour is implementation-defined in some contexts. Always use `new Date('2026-06-01T00:00:00Z')` to force UTC, then call `.getUTCDay()`.

### TimeOfDay VO extensions

M06 added arithmetic methods to `TimeOfDay` for slot generation:

```typescript
const start = TimeOfDay.create('09:00');
start.toMinutes()           // 540
start.addMinutes(90)        // TimeOfDay('10:30')
TimeOfDay.fromMinutes(540)  // TimeOfDay('09:00')
```

These replace what were originally private helpers in `AvailabilityService`. Moving them to the VO makes the VO the single source of truth for HH:MM arithmetic — anyone importing `TimeOfDay` automatically gets these capabilities.

The `overlaps()` function stayed private in `AvailabilityService`. It operates on two intervals (four strings), not on a single `TimeOfDay` point — it belongs to interval logic, not point-in-time logic. A hypothetical future `TimeRange` VO might own it.

---

## 8. Public BFF Endpoints and the @Public() Decorator

Schedule availability endpoints are public — no login required. The BFF uses a JWT guard by default. To bypass it:

```typescript
@Public()  // bypasses JwtAuthGuard
@Controller('v1/schedule/availability')
export class ScheduleAvailabilityController {
  // ...
}
```

`@Public()` is a custom decorator that sets metadata:
```typescript
export const Public = () => SetMetadata('isPublic', true);
```

The `JwtAuthGuard` checks this metadata before requiring a token.

Since there's no JWT, there's no `X-Actor-*` headers and no `TenantContext` actor. The BFF resolves the tenant using only the `X-Tenant-Slug` header:

```typescript
// BFF controller pattern for public endpoints
async get(@Headers('X-Tenant-Slug') slug: string, @Query() query: AvailabilityQueryDto) {
  if (!slug) throw new HttpException({ ... }, 400);
  const tenant = await this.backendHttp.getForPublic(`/internal/tenants/by-slug/${slug}`);
  return this.backendHttp.getForPublic(`/schedule/availability?...`, tenant.tenantId);
}
```

`getForPublic` sets `X-Tenant-ID` without any `X-Actor-*` headers. The backend's `TenantInterceptor` populates `TenantContext` with `tenantId` but no actor — which is correct for public guest access.

**Error handling:** BFF async controllers use `throw new HttpException(...)` for early exits (missing header, etc.). This is required because `return Promise.reject(new HttpException(...))` in an async function triggers SonarCloud S6959. The `.catch(mapXxxError)` pattern is only used on the backend side where controller methods return synchronous Promises.

---

## 9. Integration Testing Across Bounded Contexts

### The Problem

`GetAvailabilityUseCase` calls `IScheduleTenantSettingsPort.getSchedulingSettings(tenantId)` which internally queries the `tenants` table in the `platform` schema. Integration tests for the booking context therefore need real tenant rows.

### The Wrong Approach (anti-pattern)

```typescript
// ❌ Direct cross-context DB access — violates bounded contexts
await ds.getRepository(TenantEntity).save(
  new TenantEntityBuilder().withId(TENANT_A).build()
);
```

This crosses the context boundary in test code. It also means tests know the internal data shape of the platform context.

### The Right Approach

Seed tenant data through the platform's own API:

```typescript
// ✅ API-driven seeding — respects bounded contexts
const { body } = await request(app.getHttpServer())
  .post('/internal/tenants')
  .set('Authorization', `Bearer ${TEST_KEY}`)
  .send({ name: 'Test', slug: 'test-slug', adminEmail: 'a@test.com' })
  .expect(201);
tenantId = body.tenantId as string;
```

To make this work, the test module must include `PlatformModule` (which provides `POST /internal/tenants`) and `EventBusModule` (because `ProvisionTenantUseCase` emits a `TenantProvisioned` event):

```typescript
imports: [
  TypeOrmModule.forRoot({ entities: [TenantEntity, HotsiteConfigEntity, ...], ... }),
  EventBusModule,
  TransactionManagerModule,
  TenantModule,
  PlatformModule,    // ← adds POST /internal/tenants
  BookingModule,
],
providers: [{ provide: APP_INTERCEPTOR, useClass: TenantInterceptor }],
```

Override `EVENT_BUS` to avoid connecting to the Pub/Sub emulator:
```typescript
.overrideProvider(EVENT_BUS)
.useValue(new InMemoryEventBus())
```

Set and clean up `PLATFORM_ADMIN_KEY`:
```typescript
beforeAll(async () => { process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY; ... });
afterAll(async () => { delete process.env['PLATFORM_ADMIN_KEY']; await app.close(); });
```

### Why the Returned `tenantId` Matters

`ProvisionTenantUseCase` generates the tenant's UUID with `uuidv7()` — you cannot specify a fixed UUID. Tests capture the returned `tenantId` and use it for all subsequent calls:

```typescript
let tenantAId: string;  // let, not const

// in beforeAll:
tenantAId = body.tenantId as string;

// in tests:
.set(actorHeaders(tenantAId, MANAGER_ID))
```

This is different from the earlier pattern of using fixed UUIDs like `'10000000-0000-4000-8000-000000000500'`. The API-driven approach produces different UUIDs each run, which is fine since Testcontainers creates a fresh DB per run.

### What Doesn't Need Tenant Seeding

Tests for `CloseScheduleUseCase`, `RemoveClosureUseCase`, and `ListClosuresUseCase` do NOT need tenant rows — those use cases never call the settings port. Only use cases that check `business_hours` or `booking` settings require a seeded tenant.

---

## 10. Key Design Decisions

### Why Luxon instead of native Date?

JavaScript's native `Date` has no timezone support. `new Date('2026-06-01T09:00:00')` in São Paulo and in UTC produces different absolute times. Luxon provides:
- Explicit timezone control: `DateTime.fromISO('2026-06-01T09:00:00', { zone: 'America/Sao_Paulo' })`
- DST-aware arithmetic
- `toISODate()` / `toISOTime()` for clean output

All timezone conversions are centralised in `shared/utils/calendar-date.ts`. No other file imports Luxon directly.

### Why not store slots in the DB?

Slots are computed on-the-fly from business hours + closures + openings + existing bookings. Storing pre-computed slots would require invalidating them whenever any of those inputs changes. Computing them on request is simpler, correct-by-construction, and fast enough (pure in-memory arithmetic after DB reads).

### Why not use a cron to pre-compute summaries?

The range summary endpoint (`/availability/summary`) does 3 DB queries regardless of the date range length, then runs pure arithmetic per day in memory. For a 7-day range this is ~50ms total. Pre-computing and caching would add complexity (cache invalidation on closure/opening changes) without meaningful performance gain.

### `getSchedulingSettings()` — one method, one DB trip

The use cases need both `businessHours` (for slot generation) and `bookingSettings` (for `slot_granularity_minutes`, `service_buffer_minutes`, `max_booking_advance_days`). Both are stored in the same JSONB `settings` column on the `tenants` row.

If you call `getBusinessHours()` and `getBookingSettings()` separately (even with `Promise.all`), you're running two DB queries to the same row. The `getSchedulingSettings()` method was added specifically to avoid this:

```typescript
// ❌ Two queries — same row twice
const [businessHours, bookingSettings] = await Promise.all([
  settingsPort.getBusinessHours(tenantId),
  settingsPort.getBookingSettings(tenantId),
]);

// ✅ One query
const { businessHours, bookingSettings } = await settingsPort.getSchedulingSettings(tenantId);
```

### Why `findByTenantAndDate` returns `ScheduleClosure[]` but `ScheduleOpening | null`

A date can have multiple partial closures (e.g., 09:00–11:00 AND 14:00–16:00). But there's only one opening per date enforced by `UNIQUE(tenant_id, date)`. The port signatures reflect this:
- `IScheduleClosureRepository.findByTenantAndDate()` → `ScheduleClosure[]`
- `IScheduleOpeningRepository.findByTenantAndDate()` → `ScheduleOpening | null`

This prevents callers from incorrectly assuming at most one closure.

### Why `ServiceEntityBuilder` uses `Service.reconstitute()` not `new Service()`

When creating a `Service` aggregate in test builders, you should bypass domain validation (the aggregate was previously valid when saved). `Service.reconstitute()` skips validation, while `Service.create()` enforces all invariants (price > 0, duration > 0, etc.). The builder uses `reconstitute()` so it can set arbitrary test values without triggering domain errors.

### Integration test tenant isolation via API

Before M06-S05, each test tenant had a fixed UUID like `'10000000-0000-4000-8000-000000000500'`. This worked but crossed context boundaries. After the M06-S05 refactor, tenants are provisioned via API and their UUIDs are captured at runtime. Count-sensitive assertions (e.g., checking how many closures exist) still need unique tenants per test, but now these are created via API within the test rather than as hardcoded constants.

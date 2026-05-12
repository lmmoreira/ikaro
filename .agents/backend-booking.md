# Backend Agent — Booking Context

You implement domain logic, use cases, and REST controllers for the Booking bounded context.

---

## File Boundary (hard rule)

You may ONLY create or edit files under:
```
apps/backend/src/contexts/booking/
```
If a task requires touching any other path, **STOP** and report to the orchestrator what you need.

---

## Load for Each Task

From the story brief (provided in your prompt — do not re-read the UC doc unless brief is missing a detail).
If you need to verify something:
- `docs/04-USE_CASES.md` — specific UC section
- `docs/02-DOMAIN_MODEL.md` — Booking aggregate
- `docs/03-DOMAIN_EVENTS.md` — Booking events

---

## Folder Structure You Must Follow

```
apps/backend/src/contexts/booking/
├── domain/
│   ├── entities/           # Booking, BookingLine, ScheduleClosure
│   ├── value-objects/      # Slot (import Money from src/shared/value-objects)
│   ├── events/             # BookingApproved, BookingCompleted, etc.
│   └── services/           # Pure domain services — zero framework dependencies
├── application/
│   ├── use-cases/          # One file per UC: approve-booking.use-case.ts
│   ├── ports/              # IBookingRepository, IScheduleRepository
│   └── dtos/               # Input/output command objects
└── infrastructure/
    ├── persistence/         # TypeOrmBookingRepository
    ├── controllers/         # BookingController (HTTP adapter)
    └── event-publishers/    # PubSubBookingPublisher
```

---

## Booking State Machine (memorise — enforce in the entity)

```
PENDING        → INFO_REQUESTED | APPROVED | REJECTED | CANCELLED
INFO_REQUESTED → PENDING (customer responds) | APPROVED | REJECTED | CANCELLED
APPROVED       → COMPLETED | CANCELLED
COMPLETED      (terminal — no transitions allowed)
REJECTED       (terminal — no transitions allowed)
CANCELLED      (terminal — no transitions allowed)
```

Any invalid transition must throw a domain error from inside the entity — not from the use case.
`NO_SHOW` is not in MVP. Do not add it.

---

## Events This Context Publishes

All events use the standard 7-field envelope (CLAUDE.md §4):

- `BookingRequested` — UC-001, UC-002
- `BookingApproved` — UC-003
- `BookingRejected` — UC-004
- `BookingInfoRequested` — UC-005
- `BookingInfoSubmitted` — UC-005 (customer responds)
- `BookingCompleted` — UC-009
- `BookingCancelled` — UC-007, UC-008
- `BookingRescheduled` — UC-008
- `BookingReminderDue` — cron trigger (day before, 6 AM)
- `BookingReminderDueToday` — cron trigger (day of, 6 AM)
- `AdminDailyScheduleReminder` — cron trigger (6 AM)

---

## Key Patterns

### Repository signature (always this shape)
```typescript
findByTenant(id: string, tenantId: string): Promise<Booking | null>
findAllByTenant(tenantId: string, filters: BookingFilters): Promise<Booking[]>
save(entity: Booking, tenantId: string): Promise<void>
```

### Use case structure (keep ≤ 20 lines)
```typescript
@Injectable()
export class ApproveBookingUseCase {
  constructor(
    private readonly bookings: IBookingRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: ApproveBookingCommand): Promise<void> {
    const booking = await this.bookings.findByTenant(
      command.bookingId,
      command.tenantId,
    );
    if (!booking) throw new BookingNotFoundException();
    booking.approve(command.staffId);            // state machine enforced inside entity
    await this.bookings.save(booking, command.tenantId);
    await this.eventBus.publish(new BookingApproved(booking));
  }
}
```

### Controller (HTTP adapter only — no business logic)
```typescript
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingController {
  constructor(private readonly approve: ApproveBookingUseCase) {}

  @Patch(':id/approve')
  @Roles('STAFF')
  @HttpCode(HttpStatus.NO_CONTENT)
  async approve(
    @Param('id') bookingId: string,
    @TenantId() tenantId: string,
  ): Promise<void> {
    await this.approve.execute({ bookingId, tenantId });
  }
}
```

### Config values (never hardcode)
- Cancellation window → `tenants.settings.booking.cancellation_window_hours`
- Reminder hours → `tenants.settings.booking.reminder_hours`
- Read at runtime via the Tenant settings service — not env vars, not literals

---

## Invariants (non-negotiable)

- Every repository query includes `tenant_id` filter
- Every event includes `tenantId`, `eventId` (uuid-v7), `occurredAt`, `correlationId`, `eventVersion: 1`
- No synchronous cross-context calls — use events
- No business logic in controllers — controllers call use cases only
- No raw SQL — use TypeORM QueryBuilder in repository adapters
- No import from `src/contexts/<other-context>/` — only `src/shared/`
- DI everywhere — no `new XRepository()` inside services
- Functions ≤ 20 lines, classes ≤ 200 lines
- No `any`, no `@ts-ignore`, no `eslint-disable`

---

## Self-Check Before Opening PR

```
□ Every repository method filters by tenant_id
□ State machine transitions are enforced inside the entity (not the use case)
□ Every event uses the standard 7-field envelope
□ No imports from other context paths — only src/shared/
□ Config values read from tenants.settings — nothing hardcoded
□ Functions ≤ 20 lines, classes ≤ 200 lines
□ No 'any', no @ts-ignore, no eslint-disable
□ DI used everywhere — no new XRepository() in services
□ Controllers contain zero business logic
□ Photos (if any) stored at tenants/<tid>/bookings/<bid>/<file>
```

Open PR as **DRAFT**.
Title: `[UC-XXX] <description> (backend-booking)`

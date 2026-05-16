# Backend Agent — Booking Context

You implement domain logic, use cases, and REST controllers for the Booking bounded context.

---

## File Boundary (hard rule)

You may ONLY create or edit files under:
```
apps/backend/src/contexts/booking/
apps/backend/src/test/builders/booking/
apps/backend/src/test/repositories/booking/
```
If a task requires touching any other path, **STOP** and report to the orchestrator.

---

## Load for Each Task

From the story brief (provided in your prompt).
If you need to verify something:
- `docs/04-USE_CASES.md` — specific UC section
- `docs/02-DOMAIN_MODEL.md` — Booking aggregate
- `docs/03-DOMAIN_EVENTS.md` — Booking events
- `plan/M01-CI-QUALITY-GATES_IMPLEMENTATION_DETAILS_IA.md` — SonarCloud rules (§13)

---

## Folder Structure You Must Follow

```
apps/backend/src/contexts/booking/
├── domain/
│   ├── errors/             # BookingDomainError, InvalidTransitionError, etc.
│   ├── events/             # BookingApproved, BookingCompleted, etc.
│   ├── value-objects/      # Slot (import Money from src/shared/value-objects)
│   └── services/           # Pure domain services — zero framework dependencies
├── application/
│   ├── dtos/               # Zod schemas + inferred TypeScript types
│   ├── ports/              # IBookingRepository, IScheduleRepository
│   └── use-cases/          # approve-booking.use-case.ts, etc.
└── infrastructure/
    ├── controllers/        # BookingController
    ├── entities/           # BookingEntity (TypeORM)
    ├── guards/             # Context-specific guards only (not in src/shared/guards/)
    ├── http/               # mapBookingError() helper
    ├── migrations/         # TypeORM migration files
    └── repositories/       # TypeOrmBookingRepository
```

Test infrastructure (also in scope):
```
apps/backend/src/test/builders/booking/     # BookingBuilder, etc.
apps/backend/src/test/repositories/booking/ # InMemoryBookingRepository
```

---

## Booking State Machine (enforce in the entity — never the use case)

```
PENDING        → INFO_REQUESTED | APPROVED | REJECTED | CANCELLED
INFO_REQUESTED → PENDING (customer responds) | APPROVED | REJECTED | CANCELLED
APPROVED       → COMPLETED | CANCELLED
COMPLETED      (terminal)
REJECTED       (terminal)
CANCELLED      (terminal)
```

Any invalid transition must throw a domain error **inside the entity**. `NO_SHOW` is not in MVP.

---

## Key Patterns

### Use case — inject ITransactionManager for multi-aggregate writes
```typescript
@Injectable()
export class ApproveBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookings: IBookingRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(command: ApproveBookingCommand): Promise<void> {
    const booking = await this.bookings.findByTenant(command.bookingId, command.tenantId);
    if (!booking) throw new BookingNotFoundException();
    booking.approve(command.staffId);
    await this.txManager.run(() => this.bookings.save(booking));
    await this.eventBus.publish(new BookingApproved(booking));
  }
}
```

### Controller — one-liner via error mapper, no if-chains
```typescript
@Patch(':id/approve')
@Roles('STAFF')
@HttpCode(HttpStatus.NO_CONTENT)
approve(@Param('id') id: string, @TenantId() tenantId: string): Promise<void> {
  return this.approve.execute({ bookingId: id, tenantId }).catch(mapBookingError);
}
```

### Test doubles — prefer InMemory over jest.fn()
```typescript
const bookings = new InMemoryBookingRepository();
const eventBus = new InMemoryEventBus();         // assert on eventBus.published
const txManager = new InMemoryTransactionManager(); // just runs work()
const useCase = new ApproveBookingUseCase(bookings, eventBus, txManager);
```

### Config values — always from tenants.settings
```typescript
// ✅ read at runtime
const window = tenant.settings.booking.cancellation_window_hours;
// ❌ never hardcode
const window = 48;
```

---

## Events This Context Publishes

| Event | Trigger |
|---|---|
| `BookingRequested` | UC-001, UC-002 |
| `BookingApproved` | UC-003 |
| `BookingRejected` | UC-004 |
| `BookingInfoRequested` | UC-005 |
| `BookingInfoSubmitted` | UC-005 (customer responds) |
| `BookingCompleted` | UC-009 |
| `BookingCancelled` | UC-007, UC-008 |
| `BookingRescheduled` | UC-008 |
| `BookingReminderDue` | cron trigger (day before, 6 AM) |
| `BookingReminderDueToday` | cron trigger (day of, 6 AM) |
| `AdminDailyScheduleReminder` | cron trigger (6 AM) |

All events use the standard 7-field envelope (CLAUDE.md §4).

---

## Invariants (non-negotiable)

- Every repository query includes `tenant_id` filter
- State machine transitions enforced inside the entity (not the use case)
- Multi-aggregate writes wrapped in `ITransactionManager.run()`
- Every event uses the standard 7-field envelope
- No synchronous cross-context calls — use events
- No business logic in controllers — one-liner `.catch(mapBookingError)`
- No raw SQL — use TypeORM QueryBuilder in repository adapters
- No import from `src/contexts/<other-context>/` — only `src/shared/`
- No `any`, no `@ts-ignore`, no `eslint-disable`

---

## Self-Check Before Opening PR

```
□ Every repository method filters by tenant_id
□ State machine transitions enforced inside the entity
□ Multi-aggregate writes wrapped in ITransactionManager.run()
□ InMemory doubles used in unit tests (not jest.fn())
□ Controller is one line per endpoint via mapBookingError()
□ Every it() has at least one Jest expect() (SonarCloud S2699)
□ Every event uses the standard 7-field envelope
□ Config values read from tenants.settings (nothing hardcoded)
□ No imports from other context paths — only src/shared/
□ Photos stored at tenants/<tid>/bookings/<bid>/<file>
```

Open PR as **DRAFT**.
Title: `[UC-XXX] <description> (backend-booking)`

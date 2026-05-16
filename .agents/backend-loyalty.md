# Backend Agent — Loyalty Context

You implement domain logic and use cases for the Loyalty bounded context.

---

## File Boundary (hard rule)

You may ONLY create or edit files under:
```
apps/backend/src/contexts/loyalty/
```
If a task requires touching any other path, **STOP** and report to the orchestrator.

---

## Load for Each Task

From the story brief (provided in your prompt).
If you need to verify something:
- `docs/04-USE_CASES.md` — UC-016
- `docs/02-DOMAIN_MODEL.md` — LoyaltyEntry aggregate
- `docs/03-DOMAIN_EVENTS.md` — ServicePointsEarned, PointsExpiringSoon

---

## Folder Structure You Must Follow

```
apps/backend/src/contexts/loyalty/
├── domain/
│   ├── entities/           # LoyaltyEntry (append-only — no update, no delete)
│   └── services/           # LoyaltyDomainService
├── application/
│   ├── use-cases/          # RecordLoyaltyEntryUseCase, GetLoyaltyBalanceUseCase
│   ├── ports/              # ILoyaltyRepository
│   └── dtos/
└── infrastructure/
    ├── repositories/       # TypeOrmLoyaltyRepository
    ├── controllers/         # LoyaltyController (read-only endpoints)
    └── event-handlers/      # BookingCompletedHandler
```

---

## MVP Rules (strict — no exceptions)

- `LoyaltyEntry` is **append-only**. No `update()`, no `delete()` methods on entity or repository.
- One `LoyaltyEntry` per `BookingLine` completed — not per `Booking`.
- **Idempotency key:** `UNIQUE(tenant_id, booking_line_id)` at the DB level — not `booking_id`.
- Guest bookings (no `customerId`): skip silently. Do not throw an error.
- Active balance formula: `SUM(points) WHERE expires_at > NOW() AND tenant_id = :tenantId`
- Expiry days: `tenants.settings.loyalty.expiry_days` — never hardcode.
- No redemption, no tiers, no manual adjustments in MVP.

---

## Events Consumed

`BookingCompleted` published by the Booking context.
Handler subscribes via `IEventBus` — not via `@OnEvent()` (which is in-memory only).

---

## Events Published

- `ServicePointsEarned` — after a LoyaltyEntry is recorded
- `PointsExpiringSoon` — from a cron job checking entries near expiry

All events use the standard 7-field envelope (CLAUDE.md §4).

---

## Idempotency Pattern

```typescript
@Injectable()
export class BookingCompletedHandler implements IEventHandler<BookingCompletedEvent> {
  constructor(private readonly eventBus: IEventBus) {}

  onModuleInit() {
    this.eventBus.subscribe('BookingCompleted', (e) => this.handle(e));
  }

  async handle(event: BookingCompletedEvent): Promise<void> {
    if (!event.data.customerId) return; // guest booking — skip silently

    for (const line of event.data.lines) {
      await this.loyaltyService.recordEntry({
        tenantId:      event.tenantId,
        customerId:    event.data.customerId,
        bookingLineId: line.id,          // idempotency key
        points:        line.points,
        correlationId: event.correlationId,
      });
      // DB layer: INSERT ... ON CONFLICT (tenant_id, booking_line_id) DO NOTHING
    }
  }
}
```

---

## Invariants (non-negotiable)

- Every query filters by `tenant_id`
- `LoyaltyEntry` has no update or delete — append-only in both entity and repository
- Idempotency via `UNIQUE(tenant_id, booking_line_id)` — never on `booking_id`
- No synchronous call to Booking context — subscribe to `BookingCompleted` event
- Expiry read from `tenants.settings.loyalty.expiry_days` — never hardcoded
- No import from `src/contexts/booking/` or any other context path
- No `any`, no `@ts-ignore`

---

## Self-Check Before Opening PR

```
□ LoyaltyEntry entity has no update() or delete() methods
□ Repository has no update or delete methods
□ Guest booking (no customerId) is silently skipped — no error thrown
□ Idempotency enforced via UNIQUE(tenant_id, booking_line_id) in persistence layer
□ Balance query filters: expires_at > NOW() AND tenant_id = :tenantId
□ Expiry days read from tenants.settings.loyalty.expiry_days
□ Multi-aggregate writes wrapped in ITransactionManager.run()
□ InMemory doubles used in unit tests (not jest.fn() for IEventBus/ITransactionManager)
□ Every query filters by tenant_id
□ Every it() has at least one Jest expect() (SonarCloud S2699)
□ No imports from any other context path
□ Functions ≤ 20 lines, classes ≤ 200 lines
□ No 'any', no @ts-ignore
```

Open PR as **DRAFT**.
Title: `[UC-XXX] <description> (backend-loyalty)`

# M07 — Booking Creation: Implementation Details (Developer)

> Learning doc for the human developer. Explains every concept with rationale and real code examples from this codebase. Enough context to understand NestJS, DDD, and the engineering patterns used here.

---

## What M07 builds

M07 implements the first real business feature of Ikaro: a guest or authenticated customer can submit a booking request. The booking is persisted, a `BookingRequested` event is emitted to Pub/Sub, and two emails are sent: an admin confirmation and a customer acknowledgement.

M07 also adds the customer profile GET/PATCH endpoints (which were needed by the authenticated booking flow and the customer dashboard).

The milestone touches four layers:
1. **Domain** — `Booking` aggregate (state machine, domain events, VO-typed props)
2. **Application** — two booking use cases, two customer profile use cases, cross-context port
3. **Infrastructure** — TypeORM entities/migrations, REST controllers, Pub/Sub event handler
4. **BFF** — public booking endpoint (guest), authenticated booking endpoint, customer profile endpoints

---

## The `Booking` aggregate (DDD deep-dive)

### Why aggregates exist
In DDD, an **aggregate** is a cluster of domain objects that must always be consistent together. `Booking` and its `BookingLine` children are one aggregate — you can never have a `BookingLine` that references a non-existent booking, and you can never approve a booking without also knowing all its lines.

An aggregate has a **root** (the `Booking` itself) that enforces all invariants. Nothing outside the aggregate can call methods on `BookingLine` directly — all mutations go through `Booking`.

### State machine
The booking lifecycle is a finite state machine:
```
PENDING → INFO_REQUESTED | APPROVED | REJECTED | CANCELLED
INFO_REQUESTED → PENDING | APPROVED | REJECTED | CANCELLED
APPROVED → COMPLETED | CANCELLED
COMPLETED (terminal)
REJECTED  (terminal)
CANCELLED (terminal)
```

Each transition is a method on the aggregate (`approve()`, `reject()`, etc.). If you try an invalid transition, the aggregate throws `InvalidBookingTransitionError`. The controller never checks states — it just calls the method and catches domain errors.

### VO-typed props (Option A pattern)
Every field with its own validation is a Value Object, not a primitive:
```ts
export interface BookingProps {
  guestEmail: Email;        // not string
  guestPhone: PhoneNumber;  // not string
  totalPrice: Money;        // not number
  guestAddress: Address | null;
  // ...
}
```

The `create()` factory validates; `reconstitute()` skips validation (for DB reads). This means you can never construct a booking with an invalid email — the `Email.create()` call throws if the string is malformed.

Getters return VOs too:
```ts
get guestEmail(): Email { return this.props.guestEmail; }
```

When you serialize for the DB (`toEntity()`), you call `.address` or `.value` on the VO:
```ts
entity.guestEmail = booking.guestEmail.address;  // Email → string
entity.guestPhone = booking.guestPhone.value;    // PhoneNumber → string
```

### Domain events
Every state transition records what happened. `requestBooking()` calls `this.addDomainEvent(new BookingRequested(...))`. The events accumulate in `this._domainEvents[]` (on `AggregateRoot`). Nobody sees them until the use case calls `booking.clearDomainEvents()`.

Why accumulate instead of publishing immediately? Because the booking isn't saved yet when the domain method runs. If we published the event and then the DB write failed, we'd have an event for something that didn't happen. The flush-after-commit pattern ensures events are only published for committed state.

### The `linesModified` flag
This is an optimization. Booking lines only change when:
1. A new booking is created (all lines are new)
2. A booking is completed (actual prices are set on each line)

For all other transitions (approve, reject, cancel, reschedule), the lines don't change. The repository only runs the expensive delete-then-insert when the flag says it's needed:

```ts
// In requestBooking():
booking._linesModified = true;

// In complete():
this._linesModified = true;

// In TypeOrmBookingRepository.save():
if (booking.linesModified) {
  await manager.delete(BookingLineEntity, { bookingId: booking.id, tenantId: booking.tenantId });
  await manager.save(BookingLineEntity, lineEntities);
}
```

Why delete-then-insert instead of upsert? Simpler to reason about correctness. Lines don't change their content after creation (they're immutable snapshots of the service at booking time), so there's no "update existing row" scenario — only "write all lines fresh."

---

## Post-commit event flush pattern

```ts
// In RequestBookingUseCase.execute():
await this.txManager.run(async () => {
  await this.bookingRepo.save(booking);
});
// ↑ transaction committed

for (const event of booking.clearDomainEvents()) {
  await this.eventBus.publish(event);
}
// ↑ events published after commit
```

**Why outside the transaction?** Pub/Sub publish is not part of the DB transaction. If you put the publish inside `txManager.run()` and the Pub/Sub call fails, the TypeORM transaction would roll back the booking — but Pub/Sub doesn't have a "compensating undo". Putting the publish outside keeps the two systems decoupled. In the rare case where the Pub/Sub publish fails after a successful DB commit, the booking exists but the notification never fires. This is an acceptable MVP trade-off (no outbox, no retry of the publish itself).

**Why `clearDomainEvents()` and not `getDomainEvents()`?** The method both returns and drains the queue. After this line, `booking.domainEvents` is empty. This prevents accidentally publishing the same event twice if someone calls `clearDomainEvents()` again.

---

## Cross-context data access via port + adapter

### The problem
`RequestAuthenticatedBookingUseCase` needs the customer's name, email, and phone (to populate the `guestEmail`, `guestName`, `guestPhone` fields — even for authenticated bookings we call them "guest" fields in the DB because the model is unified). But `Customer` is in the **customer** bounded context. `Booking` must not import `CustomerRepository` directly — that would create a hidden dependency between contexts that breaks schema independence.

### The solution: port + adapter

**Step 1: Define a port (interface) in the booking context**
```ts
// booking/application/ports/customer-profile.port.ts
export const CUSTOMER_PROFILE_PORT = Symbol('ICustomerProfilePort');

export interface ICustomerProfilePort {
  findById(customerId: string, tenantId: string): Promise<CustomerProfileDto | null>;
}
```

The booking use case only knows about this interface. It has no idea how the data is fetched.

**Step 2: Implement the adapter in the booking infrastructure layer**
```ts
// booking/infrastructure/adapters/customer-profile.adapter.ts
@Injectable()
export class CustomerProfileAdapter implements ICustomerProfilePort {
  constructor(private readonly customerQuery: CustomerQueryService) {}

  async findById(customerId: string, tenantId: string): Promise<CustomerProfileDto | null> {
    const customer = await this.customerQuery.findById(customerId, tenantId);
    if (!customer) return null;
    return {
      email: customer.email.address,
      name: customer.name,
      phone: customer.phone?.value ?? null,
      defaultAddress: customer.defaultAddress,
    };
  }
}
```

The adapter is in `booking/infrastructure/` (not `booking/application/`) because it depends on `CustomerQueryService` which is an NestJS injectable (infrastructure concern).

**Step 3: Wire it in the module**
```ts
// BookingModule imports CustomerModule to get CustomerQueryService
imports: [CustomerModule, ...],
providers: [
  { provide: CUSTOMER_PROFILE_PORT, useClass: CustomerProfileAdapter },
  ...
]
```

**Why not import `CUSTOMER_REPOSITORY` directly?**
Because `CustomerRepository` might change its schema, add new methods, or be replaced. The port makes the dependency explicit and narrow — the booking context only needs "give me name/email/phone/address for a customer ID." Everything else about how customers work is invisible to it.

---

## Money VO and NUMERIC storage

### The VO
```ts
// src/shared/value-objects/money.ts
class Money {
  constructor(readonly amount: Decimal, readonly currency: string) {}
  
  static zero(): Money { return new Money(new Decimal(0), 'BRL'); }
  static from(value: string | number, currency: string): Money { ... }
  
  add(other: Money): Money { ... }  // returns new Money (immutable)
}
```

Money is immutable — `add()` returns a new instance. Arithmetic uses `Decimal.js` to avoid floating-point errors with money.

### The storage problem
TypeORM stores `NUMERIC(10,2)` columns as JavaScript `string` (because JavaScript `number` loses precision for large decimals). The entity field is typed as `string`:
```ts
@Column({ name: 'total_price_amount', type: 'numeric', precision: 10, scale: 2 })
totalPriceAmount!: string;  // "123.45", not 123.45
```

In the repository mapper, reconstruct with:
```ts
totalPrice: Money.from(entity.totalPriceAmount, 'BRL')
```

When writing to DB:
```ts
entity.totalPriceAmount = booking.totalPrice.amount.toFixed(2);
// Decimal → "123.45"
```

There is no `currency` column. BRL is the only supported currency in MVP — hardcoded everywhere. When multi-currency is needed, add the column and migrate.

---

## BookingLine: child entity, not aggregate

`BookingLine` is not a separate aggregate — it has no independent lifecycle. You can't create or delete a line except through a `Booking` method. It uses `reconstitute()` for DB reads (no validation) and `create()` for new lines (validates required fields).

```ts
class BookingLine {
  static create(bookingId: string, tenantId: string, input: BookingLineInput): BookingLine
  static reconstitute(props: BookingLineProps): BookingLine
  
  setActualPrice(price: Money): void  // called only by Booking.complete()
}
```

The `lineId` is the entity's primary key (not `id`). This matters in the TypeORM entity:
```ts
@PrimaryColumn({ name: 'line_id', type: 'uuid' })
lineId!: string;
```

---

## `serviceNameAtBooking` — snapshot pattern

When a booking is created, `BookingLine` stores `serviceNameAtBooking` (the service name at that moment). If the admin renames the service later, existing bookings still show the original name. This is the **snapshot pattern** — you capture the state of external data at the time of the transaction.

The same applies to `priceAtBooking`, `durationMinsAtBooking`, and `pointsValueAtBooking`. None of these fields ever update after the booking line is created. When the booking is completed, only `actualPriceCharged` is updated (the actual price charged, which might differ from the quote).

---

## Availability check before booking

Before persisting, both use cases check that the requested slot doesn't overlap with already-approved bookings:
```ts
const existingSlots = await this.availabilityPort.findApprovedByTenantAndDate(tenantId, localDate);
const slotEnd = new Date(scheduledAt.getTime() + totalDurationMins * 60_000);
const hasOverlap = existingSlots.some((slot) => {
  const existingEnd = new Date(slot.scheduledAt.getTime() + slot.totalDurationMins * 60_000);
  return slot.scheduledAt < slotEnd && scheduledAt < existingEnd;
});
if (hasOverlap) throw new BookingSlotUnavailableError();
```

The overlap check is a half-open interval: two slots overlap if `A.start < B.end && B.start < A.end`. The port `IBookingAvailabilityPort` wraps the same `TypeOrmBookingRepository` but exposes only the availability query — keeping the use case decoupled from repository internals.

---

## BFF patterns for booking

### Public (guest) booking: `postForPublic()`
The guest booking endpoint is `@Public()` — no JWT needed. The BFF only knows the tenant from the `X-Tenant-Slug` header. It must:
1. Resolve the tenant: `GET /internal/tenants/by-slug/{slug}` → get `tenantId`
2. Forward the booking request with only the tenant header: `postForPublic('/bookings', body, tenantId)`

`postForPublic()` sends `{ 'X-Tenant-ID': tenantId }` — no `X-Actor-*` headers. The backend runs in guest context (no actor identity).

### Authenticated booking: `post()` with auth headers
The authenticated booking uses the regular `BackendHttpService.post()` which includes `X-Actor-ID`, `X-Actor-Type`, and `X-Actor-Role` headers from the current request. The backend reads the customer's profile using the `X-Actor-ID` (customerId from JWT).

### Phone number validation in BFF
```ts
guestPhone: z.string().refine(
  (v) => { const d = v.replace(/\D/g, ''); return d.length === 10 || d.length === 11; },
  'guestPhone must have 10 or 11 digits'
)
```
This strips non-digits and checks length. Brazilian numbers are 10 digits (landline) or 11 digits (mobile with 9-digit suffix). No `+55` country code required at the BFF layer — the backend `PhoneNumber` VO enforces the same rule and normalizes the value.

---

## `UpdateCustomerProfileUseCase` — partial PATCH pattern

The customer profile PATCH is partial — all fields optional. There are two kinds of optional fields:

**Non-nullable optional** (name): The field can be omitted (keep current) but never explicitly null. Use `??`:
```ts
const name = dto.name ?? customer.name;
// dto.name = undefined → keep current
// dto.name = "New Name" → use new value
```

**Nullable-clearable optional** (phone, defaultAddress): The field can be omitted (keep current) OR explicitly null (clear it). Can't use `??` because `null` is a meaningful value:
```ts
const phone = dto.phone === undefined ? (customer.phone?.value ?? null) : dto.phone;
// dto.phone = undefined → keep current (whatever the VO holds, or null if not set)
// dto.phone = null     → clear
// dto.phone = "31999"  → update
```

For `defaultAddress` which also requires building a VO:
```ts
let defaultAddress: Address | null;
if (dto.defaultAddress === undefined) {
  defaultAddress = customer.defaultAddress;
} else if (dto.defaultAddress === null) {
  defaultAddress = null;
} else {
  defaultAddress = Address.create({ ...dto.defaultAddress, complement: dto.defaultAddress.complement ?? undefined });
}
```

SonarCloud (rule S3923) flags `!== undefined` negated conditions. Always write the positive branch first (`=== undefined`). It also dislikes nested ternaries — use `if/else if/else` chains.

---

## Notification handler for `BookingRequested`

### Handler structure
```ts
@Injectable()
export class BookingRequestedHandler implements OnModuleInit {
  onModuleInit(): void {
    this.eventBus.subscribe<BookingRequested>(
      'BookingRequested',     // event name
      (event) => this.handle(event),
      'notification',         // consumer name → subscription: ikaro-BookingRequested-notification
    );
  }

  async handle(event: BookingRequested): Promise<void> {
    try {
      await this.sendBookingRequestedNotification.execute({ ... });
    } catch (err) {
      this.logger.error('...', err);
      throw err;  // rethrow → Pub/Sub nacks → retried
    }
  }
}
```

Key rules:
- **Thin by law** — the handler only calls one use case. No business logic here.
- **Rethrow errors** — if the use case fails, the handler rethrows. Pub/Sub nacks and will redeliver. Never swallow errors in handlers.
- **`correlationId` from the event** — always pass `event.correlationId` into the use case DTO. Never generate a new one in the handler.

### The use case sends two emails
`SendBookingRequestedNotificationUseCase` sends:
1. **Admin confirmation** — to all MANAGER role staff of the tenant (via `IGetManagerEmailsPort`)
2. **Customer acknowledgement** — to `guestEmail`

Idempotency: the use case checks `NotificationLogRepository.findByEventId(eventId, type)` before dispatching. If a log already exists for this `eventId` + notification type, skip. This handles Pub/Sub's at-least-once delivery guarantee.

---

## Integration test setup

### Why `createBookingIntegrationApp()` exists
Each bounded context needs its own integration app helper that wires only the modules relevant to that context. This keeps integration tests fast and focused. The booking helper includes all entities the booking tests need (including Customer, Platform), but not Notification or Staff entities.

```ts
entities: [
  TenantEntity, HotsiteConfigEntity,
  CustomerEntity,                    // needed for CustomerQueryService / ICustomerProfilePort
  ServiceEntity,
  ScheduleClosureEntity, ScheduleOpeningEntity,
  BookingEntity, BookingLineEntity,
]
```

Pass `overrideEventBus: true` for controller integration specs (no real Pub/Sub needed):
```ts
const { app, ds } = await createBookingIntegrationApp({ overrideEventBus: true });
```

### `PUBSUB_SUBSCRIPTION_SUFFIX` in notification tests
The notification story integration spec uses real Pub/Sub (emulator). Each test run sets a unique suffix:
```ts
process.env['PUBSUB_SUBSCRIPTION_SUFFIX'] = `-si-${Date.now()}`;
```

Without this, two parallel test runs would share the same Pub/Sub subscription, and one run's messages would be consumed by the other — flaky cross-run contamination.

### Scoping dispatcher filters in idempotency tests
`InMemoryNotificationDispatcher.dispatched` is a global list for that app instance. When multiple integration test files run in parallel, other tests might provision tenants which publish `StaffInvited` events → notification handler dispatches `staff-invitation` emails to other addresses. If you count dispatches globally by template key, you'll see false positives.

Always scope filters to `m.to === adminEmail` (the email specific to your test):
```ts
// WRONG:
dispatcher.dispatched.filter((m) => m.templateKey === 'staff-invitation').length

// CORRECT:
dispatcher.dispatched.filter((m) => m.templateKey === 'staff-invitation' && m.to === adminEmail).length
```

### `beforeEach` with `uuidv7()` for entity builders
In `PATCH /customers/me` tests, a new customer is created in `beforeEach`. The `GoogleOAuthId` must be unique. `Date.now()` is millisecond-precision and can collide in parallel fast tests:
```ts
// WRONG:
.withGoogleOAuthId(`google-patch-test-${Date.now()}`)

// CORRECT:
.withGoogleOAuthId(`google-patch-${uuidv7()}`)
```

---

## BFF component spec: error propagation pattern

Component specs test that BFF correctly forwards backend error statuses. The BFF's exception filter re-throws `HttpException` instances with their original status code. Plain objects thrown as rejected values don't have a `getStatus()` method and fall through to 500.

```ts
// WRONG — produces 500 instead of 404:
backendHttpService.get.mockRejectedValue({ response: { data: { status: 404 }, status: 404 } });

// CORRECT — dynamic import avoids circular reference issues in Jest:
const { HttpException: HE } = await import('@nestjs/common');
backendHttpService.get.mockRejectedValue(new HE({ status: 404 }, 404));
```

The dynamic import pattern (`await import('@nestjs/common')` inside the test) is the established pattern in this codebase (see bookings component spec) — it avoids Jest module mock interference.

---

## Migrations added in M07

| File | What it creates |
|---|---|
| `1748000000014-CreateBookingBookings.ts` | `booking.bookings` table: all booking fields, indexes on tenantId/status/customerId/scheduledAt |
| `1748000000015-AddBookingVersion.ts` | Adds `version INTEGER DEFAULT 0` to `booking.bookings` for TypeORM optimistic locking |

Note: `booking.booking_lines` and `booking.services` were created in earlier stories (M07-S02 and M05 respectively). The schema prefix `booking.` separates tables from other contexts' schemas (`staff.`, `platform.`, `customer.`).

---

## Key numbers and constraints

| Fact | Value |
|---|---|
| Booking status values | PENDING, INFO_REQUESTED, APPROVED, COMPLETED, REJECTED, CANCELLED |
| Booking type values | GUEST, CUSTOMER |
| Money precision | NUMERIC(10,2), BRL only, stored as string |
| Phone format | 10 or 11 digits, no country code |
| ZIP code format | 8 digits only (hyphens stripped) |
| Availability check scope | APPROVED bookings only (PENDING does not block the slot) |
| Lines save strategy | DELETE + INSERT when `linesModified = true` |
| Version column default | 0 |

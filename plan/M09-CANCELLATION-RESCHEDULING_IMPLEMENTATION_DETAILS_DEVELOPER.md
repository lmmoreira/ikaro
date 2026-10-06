# M09 — Cancellation & Rescheduling: Implementation Details (Developer)

This document explains every concept, decision, and pattern introduced in M09. It is written so a developer can understand the "why" behind each choice, not just the "what."

---

## 1. Overview

M09 implements two business flows:

1. **Cancellation** — customers cancel their own bookings within a configurable window; admins cancel any booking at any time.
2. **Rescheduling** — admins move an approved booking to a new slot, with conflict checking.

Both flows emit domain events consumed by the Notification context to send bilingual emails to customer and admin.

---

## 2. Cancellation — Two Actors, Same Aggregate Method

### Why two separate use cases?

The business rules differ significantly:
- **Customer cancel**: restricted to own bookings, restricted to within cancellation window for APPROVED bookings, `isBusiness=false`
- **Admin cancel**: any booking, no window restriction, optional reason, `isBusiness=true`

Rather than one use case with conditional branches, two separate use cases keep each one simple and independently testable.

### Why one BFF endpoint for both?

From the API consumer's perspective, "cancel booking" is a single action regardless of who is doing it. The BFF branches on JWT role:

```ts
// apps/bff/src/bookings/bookings.controller.ts
@Patch(':id/cancel')
cancel(@Param('id') id: string, @Body(...) body, @CurrentUser() user) {
  if (user.role === 'CUSTOMER') {
    return this.backendHttp.patch(`/bookings/${id}/cancel-customer`, {});
  }
  return this.backendHttp.patch(`/bookings/${id}/cancel-admin`, body);
}
```

Two backend endpoints (`/cancel-customer`, `/cancel-admin`) keep the backend clean — each controller method injects exactly the use case it needs, with no role checks inside the use case.

### The cancellation window

The window is stored in `tenants.settings.booking.cancellation_window_hours` (default 48h). The aggregate method `isEligibleForCancellation()` does a pure time comparison:

```ts
// booking.aggregate.ts
isEligibleForCancellation(cancellationWindowHours: number): boolean {
  const windowMs = cancellationWindowHours * 60 * 60 * 1000;
  return Date.now() < this.props.scheduledAt.getTime() - windowMs;
}
```

This is a domain method because the rule ("is cancellable?") belongs to the aggregate, not the use case. The use case reads the setting and delegates:

```ts
// cancel-booking-as-customer.use-case.ts
if (booking.status === BookingStatus.APPROVED) {
  const bookingSettings = await this.scheduleTenantSettings.getBookingSettings(tenantId);
  if (!booking.isEligibleForCancellation(bookingSettings.cancellation_window_hours)) {
    throw new CancellationWindowExpiredError();
  }
}
```

Note: the window check only applies to APPROVED bookings. A customer can freely cancel a PENDING or INFO_REQUESTED booking — there's no slot held yet, so no business need to enforce a window.

### What `booking.cancel()` does

```ts
cancel(actor: IdentifiedBookingActor, correlationId: string, reason?: string): void {
  const cancellable = [PENDING, INFO_REQUESTED, APPROVED];
  if (!cancellable.includes(this.props.status)) {
    throw new InvalidBookingTransitionError(this.props.status, CANCELLED);
  }
  this.recordStatusTransition(CANCELLED, actor, correlationId, reason); // M23-S26 audit row
  this.props.status = CANCELLED;
  this.props.cancelledAt = new Date();
  this.props.cancelledBy = actor.id;
  this.props.cancellationReason = reason ?? null;
  this.addDomainEvent(new BookingCancelled(...));
}
```

COMPLETED, REJECTED, and CANCELLED are terminal states — the domain error prevents invalid transitions. `isBusiness` (`actor.type !== 'CUSTOMER'` — derived since M23-S26, no longer a parameter) flows into the event payload so the notification use case can tailor the email copy.

---

## 3. Rescheduling — Staying APPROVED, Changing Slot

Rescheduling is an admin-only operation. Only APPROVED bookings can be rescheduled — PENDING or INFO_REQUESTED haven't been accepted yet so there's nothing to reschedule.

After rescheduling, the booking **stays APPROVED** — the status does not change. Only `scheduledAt` (and optionally `adminNotes`) update.

### Slot conflict check with self-exclusion

The `BookingSlotConflictService` (introduced in M08) checks whether the new slot overlaps any existing booking. During reschedule, we must exclude the booking being rescheduled from the overlap check, otherwise it would conflict with its own current slot:

```ts
await this.slotConflictService.assertSlotFree(
  tenantId,
  newScheduledAt,
  booking.totalDurationMins,
  booking.id,  // <-- exclude self
);
```

### Why validate `newScheduledAt > now` before the conflict check?

The conflict check queries the database. If `newScheduledAt` is in the past, the query is a wasted DB roundtrip. The cheap check comes first:

```ts
if (newScheduledAt <= new Date()) throw new BookingScheduledInPastError();
await this.slotConflictService.assertSlotFree(...);
```

### `BookingRescheduled` carries both slots

The notification email needs to show "your appointment moved from X to Y." The aggregate captures both slots inside `reschedule()` before mutating state:

```ts
reschedule(staffId, newScheduledAt, correlationId, adminNotes?) {
  const previousEndTime = new Date(this.props.scheduledAt.getTime() + this.props.totalDurationMins * 60_000);
  const newEndTime = new Date(newScheduledAt.getTime() + this.props.totalDurationMins * 60_000);

  const previousSlot = {
    startTime: this.props.scheduledAt.toISOString(),  // captured before mutation
    endTime: previousEndTime.toISOString(),
  };

  this.props.scheduledAt = newScheduledAt;  // mutation happens here
  // ...
  this.addDomainEvent(new BookingRescheduled(..., { previousSlot, newSlot: { startTime: newScheduledAt.toISOString(), endTime: newEndTime.toISOString() } }));
}
```

If we captured `previousSlot` after `this.props.scheduledAt = newScheduledAt`, the "previous" slot would be wrong.

---

## 4. Event Payloads — Why Full Snapshots?

Both `BookingCancelled` and `BookingRescheduled` carry `lineSummary[]` + `totalPrice` (not just `bookingId`). This is deliberate:

- The Notification context is a **consumer** — it must not call back into the Booking context to retrieve data.
- Event consumers are at-least-once delivery. If the notification handler is retried hours later, it should process the same data it would have processed immediately — not fetch current booking state (which could have changed).
- This is the **event envelope as a self-contained document** pattern.

Money amounts are serialised as `string` (`amount.toFixed(2)`) rather than `number` to avoid floating-point precision issues across service boundaries.

The `lineSummaryPayload()` / `totalPricePayload()` private helpers on the aggregate were extracted to eliminate copy-paste between `cancel()` and `reschedule()`:

```ts
private lineSummaryPayload() {
  return this.props.lines.map((l) => ({
    serviceId: l.serviceId,
    serviceNameAtBooking: l.serviceNameAtBooking,
    priceAtBooking: {
      amount: l.priceAtBooking.amount.toFixed(2),
      currency: l.priceAtBooking.currency,
    },
  }));
}
```

---

## 5. Notification Context — BaseNotificationUseCase

### The duplication problem

Before M09-S04, every notification use case had identical boilerplate:
1. Call `logRepo.findByEventAndChannel(...)` → early return if exists
2. Build and dispatch email(s)
3. Call `NotificationLog.create(...)` + `txManager.run(() => logRepo.save(log))`

Eight use cases × 3 patterns = significant CPD that SonarCloud flags.

### The solution: abstract base class

```ts
// base-notification.use-case.ts
export abstract class BaseNotificationUseCase {
  constructor(
    protected readonly logRepo: INotificationLogRepository,
    protected readonly dispatcher: INotificationDispatcher,
    protected readonly txManager: ITransactionManager,
  ) {}

  protected async isAlreadySent(tenantId, eventId, notificationType, channel): Promise<boolean> {
    return !!(await this.logRepo.findByEventAndChannel(tenantId, eventId, notificationType, channel));
  }

  protected async saveLog(tenantId, eventId, notificationType, channel): Promise<void> {
    const log = NotificationLog.create({ tenantId, eventId, notificationType, channel });
    await this.txManager.run(async () => { await this.logRepo.save(log); });
  }
}
```

Each concrete use case extends this and calls `super(logRepo, dispatcher, txManager)`. Extra deps (staffPort, tenantPort, config) are declared only in the concrete class.

**Key NestJS constraint:** `@Inject()` decorators belong on the concrete subclass constructor, not the base. The base class has no decorators — it's just a plain abstract class. NestJS reads the metadata off the concrete class at injection time.

### Why the constructor signatures were not changed

All 8 use case specs instantiate the class directly (`new UseCaseClass(logRepo, dispatcher, ...)`). Rather than update all 8 specs, the subclass constructors keep the same parameter order as before — they just call `super(logRepo, dispatcher, txManager)` and stop declaring `private readonly` for those three:

```ts
// before
@Injectable()
export class SendBookingRejectedNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) private readonly logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_DISPATCHER) private readonly dispatcher: INotificationDispatcher,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}
}

// after — same external signature, zero body changes in specs
@Injectable()
export class SendBookingRejectedNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
  ) {
    super(logRepo, dispatcher, txManager);
  }
}
```

The only difference: no `private readonly` modifier on `logRepo`, `dispatcher`, `txManager` (they're now `protected` properties inherited from the base).

### DTO inheritance

```
BaseNotificationDto { tenantId, eventId, correlationId }
  └── BaseGuestNotificationDto { + guestEmail, guestName }
        ├── SendBookingApprovedNotificationDto
        ├── SendBookingCancelledNotificationDto
        ├── SendBookingInfoRequestedNotificationDto
        ├── SendBookingRejectedNotificationDto
        ├── SendBookingRequestedNotificationDto
        └── SendBookingRescheduledNotificationDto
  └── SendBookingInfoSubmittedNotificationDto  (admin-only, no guest fields)
  └── SendStaffInvitationDto                  (staff-specific, adds staffId)
```

TypeScript interface inheritance (`extends`) is structural — existing spec objects that spelled out all fields continue to type-check without changes.

---

## 6. Partial-Idempotency for Dual-Notification Use Cases

Cancelled and Rescheduled send two emails (customer + admin) under separate `notificationType` keys (`BOOKING_CANCELLED_CUSTOMER` / `BOOKING_CANCELLED_ADMIN`). Each gets its own row in `notification_logs`.

This enables **independent retry per email type**:

```ts
const [customerSent, adminSent] = await Promise.all([
  this.isAlreadySent(dto.tenantId, dto.eventId, CUSTOMER_NOTIFICATION_TYPE, CHANNEL),
  this.isAlreadySent(dto.tenantId, dto.eventId, ADMIN_NOTIFICATION_TYPE, CHANNEL),
]);

if (customerSent && adminSent) return { customerEmailSent: false, adminEmailSent: false };

// Only fetch tenant info if at least one email needs sending
const tenantInfo = await this.tenantPort.getTenantInfo(dto.tenantId);
// ...
if (!customerSent) { /* send + saveLog */ }
if (!adminSent)    { /* send + saveLog */ }
```

**Why fetch tenant info after the early-return check?**  
Fetching timezone is a DB query. If both emails are already sent (full-idempotent path), there's no reason to hit the DB for timezone — skip it.

**Scenario this handles:** message delivered twice (Pub/Sub at-least-once), or handler crashed after sending to customer but before saving admin log. On retry, only the missing email is sent.

---

## 7. Error Handling

### Domain errors map to HTTP status codes at the controller boundary

```
CancellationWindowExpiredError  → 422  (customer tried to cancel within window)
BookingScheduledInPastError     → 422  (reschedule to past datetime)
InvalidBookingTransitionError   → 422  (cancel terminal status / reschedule non-APPROVED)
BookingSlotConflictError        → 409  (new slot already taken)
BookingNotFoundError            → 404
BookingForbiddenError           → 403  (customer accessing another customer's booking)
```

All domain errors are thrown from the domain layer or use case; `mapBookingError()` in the infrastructure layer converts them to RFC 9457 `ProblemDetail` responses. Use cases never throw `HttpException` directly.

### Error message language

Domain error messages are **English only** — they are internal, logged, and consumed by the error mapper. The pt-BR copy (`"O prazo para cancelamento expirou"`) belongs in the frontend, not the domain layer.

---

## 8. Testing Patterns Used in M09

### Customer cancellation window test approach

Rather than mock `Date.now()`, integration tests use the booking settings: create a booking scheduled far in the future, set a large window (e.g. 9999h) → should succeed; set window to 0 → should succeed always. To test "window expired" without time travel, create a booking scheduled in 1h with a 48h window → fails.

### Partial-idempotency tests

Tests for the dual-notification use cases pre-seed one of the two logs in the in-memory repo, then run `execute()` and assert that only the missing email is dispatched. See the spec files at `send-booking-cancelled-notification.use-case.spec.ts` and `send-booking-rescheduled-notification.use-case.spec.ts` for the pattern.

### `InMemoryNotificationLogRepository` is the single source of truth for log assertions

Tests access `logRepo.all` (public getter on the in-memory repo) rather than inspecting the dispatcher. The log is the idempotency mechanism — always assert it was written exactly once per notification type.

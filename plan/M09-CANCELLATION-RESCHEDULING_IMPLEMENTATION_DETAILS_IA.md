# M09 — Cancellation & Rescheduling: Implementation Details (IA)

## Artifacts

| Artifact | Path |
|---|---|
| Customer cancel use case | `apps/backend/src/contexts/booking/application/use-cases/cancel-booking-as-customer.use-case.ts` |
| Admin cancel use case | `apps/backend/src/contexts/booking/application/use-cases/cancel-booking-as-admin.use-case.ts` |
| Reschedule use case | `apps/backend/src/contexts/booking/application/use-cases/reschedule-booking.use-case.ts` |
| `Booking.cancel()` method | `apps/backend/src/contexts/booking/domain/booking.aggregate.ts` ~L497 |
| `Booking.reschedule()` method | `apps/backend/src/contexts/booking/domain/booking.aggregate.ts` ~L528 |
| `Booking.isEligibleForCancellation()` | `apps/backend/src/contexts/booking/domain/booking.aggregate.ts` ~L602 |
| BookingCancelled event | `apps/backend/src/contexts/booking/domain/events/booking-cancelled.event.ts` |
| BookingRescheduled event | `apps/backend/src/contexts/booking/domain/events/booking-rescheduled.event.ts` |
| BookingCancelledHandler | `apps/backend/src/contexts/notification/infrastructure/events/booking-cancelled.handler.ts` |
| BookingRescheduledHandler | `apps/backend/src/contexts/notification/infrastructure/events/booking-rescheduled.handler.ts` |
| SendBookingCancelledNotificationUseCase | `apps/backend/src/contexts/notification/application/use-cases/send-booking-cancelled-notification/` |
| SendBookingRescheduledNotificationUseCase | `apps/backend/src/contexts/notification/application/use-cases/send-booking-rescheduled-notification/` |
| BaseNotificationUseCase | `apps/backend/src/contexts/notification/application/use-cases/base-notification.use-case.ts` |
| Base DTOs | `apps/backend/src/contexts/notification/application/dtos/base-notification.dto.ts`, `base-guest-notification.dto.ts` |
| BFF cancel endpoint | `apps/bff/src/bookings/bookings.controller.ts` — `PATCH /v1/bookings/:id/cancel` |
| BFF reschedule endpoint | `apps/bff/src/bookings/bookings.controller.ts` — `PATCH /v1/bookings/:id/reschedule` |
| Error mapper additions | `apps/backend/src/contexts/booking/infrastructure/http/booking-error.mapper.ts` |

---

## Structural Decisions

### Single BFF endpoint for both customer and admin cancel
`PATCH /v1/bookings/:id/cancel` handles both actors. The BFF branches on `user.role`:
- `CUSTOMER` → `PATCH /bookings/:id/cancel-customer` (no body)
- `MANAGER|STAFF` → `PATCH /bookings/:id/cancel-admin` (optional `{ reason?: string }` body)

Two separate backend endpoints (`cancel-customer`, `cancel-admin`) rather than one polymorphic endpoint. Avoids role-conditional logic in the backend controller.

### Customer cancellation window only applies to APPROVED bookings
`isEligibleForCancellation()` is only called when `booking.status === APPROVED`. PENDING and INFO_REQUESTED bookings are freely cancellable by the customer (no window check). Window is read from `tenants.settings.booking.cancellation_window_hours` (default 48, range 0–720).

```ts
isEligibleForCancellation(cancellationWindowHours: number): boolean {
  const windowMs = cancellationWindowHours * 60 * 60 * 1000;
  return Date.now() < this.props.scheduledAt.getTime() - windowMs;
}
```

### Reschedule only valid from APPROVED status
`booking.reschedule()` throws `InvalidBookingTransitionError` if status ≠ APPROVED. After reschedule, status stays APPROVED (no state change — only `scheduledAt` and optionally `adminNotes` update).

### Slot conflict check excludes the booking being rescheduled
`BookingSlotConflictService.assertSlotFree(tenantId, newScheduledAt, totalDurationMins, excludeBookingId)` passes `booking.id` as the exclude arg — prevents the booking from conflicting with its own current slot.

### Event payloads carry full line + price snapshot
Both `BookingCancelled` and `BookingRescheduled` carry `lineSummary[]` + `totalPrice` (amounts as `string` from `amount.toFixed(2)`). Extracted via `lineSummaryPayload()` / `totalPricePayload()` private helpers on the aggregate to eliminate CPD.

### `BookingRescheduled` carries both slots as `{ startTime, endTime }`
`previousSlot` = old `scheduledAt` + old `endTime` (computed from `totalDurationMins`). `newSlot` = new `scheduledAt` + new `endTime`. Both computed inside `booking.reschedule()` before mutating `this.props.scheduledAt`.

### BaseNotificationUseCase introduced in M09-S04
Abstract base class at `use-cases/base-notification.use-case.ts` provides:
- `protected isAlreadySent(tenantId, eventId, notificationType, channel): Promise<boolean>`
- `protected saveLog(tenantId, eventId, notificationType, channel): Promise<void>`

All 8 notification use cases extend it. `notification-log.helper.ts` deleted. No spec changes needed — constructor signatures preserved.

### Notification DTOs use inheritance
- `BaseNotificationDto` — `{ tenantId, eventId, correlationId }` (all 8 DTOs)
- `BaseGuestNotificationDto extends BaseNotificationDto` — adds `{ guestEmail, guestName }` (6 booking→customer DTOs)

### Dual-notification partial-idempotency pattern
For use cases that send both customer + admin emails (cancelled, rescheduled, requested), the idempotency check is per-notification-type:
```ts
const [customerSent, adminSent] = await Promise.all([
  this.isAlreadySent(...CUSTOMER_TYPE...),
  this.isAlreadySent(...ADMIN_TYPE...),
]);
if (customerSent && adminSent) return { customerEmailSent: false, adminEmailSent: false };
// proceed to send only whichever was not already sent
```
Survives partial failure: if customer email sent but admin crashed, retry sends only admin.

---

## Error Mapping (new in M09)

| Domain Error | HTTP Status | When |
|---|---|---|
| `CancellationWindowExpiredError` | 422 | Customer cancels APPROVED booking within window |
| `BookingScheduledInPastError` | 422 | Reschedule `newScheduledAt` ≤ now |
| `InvalidBookingTransitionError` | 422 | Cancelling terminal status / rescheduling non-APPROVED |
| `BookingSlotConflictError` | 409 | New slot overlaps existing booking |

Both `CancellationWindowExpiredError` and `BookingScheduledInPastError` map to 422 via the same branch in `booking-error.mapper.ts`.

---

## Pub/Sub Subscription Names (notification consumers)

| Event | Consumer name | Subscription |
|---|---|---|
| `BookingCancelled` | `notification` | `ikaro-BookingCancelled-notification` |
| `BookingRescheduled` | `notification` | `ikaro-BookingRescheduled-notification` |

---

## Cancellation Window Config

- Field: `tenants.settings.booking.cancellation_window_hours`
- Default: `48`
- Valid range: `0–720` (validated by `TenantSettings` VO)
- Retrieved via `IScheduleTenantSettingsPort.getBookingSettings(tenantId)`
- Window check only for APPROVED bookings; PENDING/INFO_REQUESTED are freely cancellable by customer

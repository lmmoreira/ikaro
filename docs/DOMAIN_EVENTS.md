# Domain Events - Ikaro

> **When to load:** emitting, handling or changing a domain event: the mandatory envelope, each event's `data` payload, publishing and consumption rules and versioning; which context subscribes to what is in `docs/BOUNDED_CONTEXTS.md`, handler rules in `docs/ENGINEERING_RULES_BACKEND.md`.
> **Tags:** backend, events

Domain events represent things that happened in the business. Other bounded contexts subscribe asynchronously through the event bus and react.

---

## Standard Envelope (mandatory on every event)

Every event — Booking, Loyalty, Notification, or any future event — is published with the following envelope. The per-event "Data" blocks below describe **only** the `data` field; the envelope is implicit and always present.

```json
{
  "eventId":       "uuid-v7",
  "tenantId":      "uuid-v7",
  "occurredAt":    "2026-05-11T14:23:45.123Z",
  "correlationId": "uuid-v7",
  "eventName":     "BookingApproved",
  "eventVersion":  1,
  "data":          { /* per-event payload, see below */ }
}
```

| Field | Why | Rules |
|---|---|---|
| `eventId` | Idempotency key for consumers (at-least-once delivery) | UUID v7; unique per publication; time-ordered for DB index performance |
| `tenantId` | Tenant isolation | UUID; consumers MUST filter on this |
| `occurredAt` | Business time the event happened | ISO-8601 UTC, millisecond precision |
| `correlationId` | Trace a chain of events back to one originating request | UUID v7; generated once per HTTP request, inherited by all child events |
| `eventName` | Routing & logging | PascalCase, matches the canonical name in this file |
| `eventVersion` | Schema evolution | Integer; bump on breaking change (see §"Event Versioning") |
| `data` | The payload below | Object; field names in camelCase |
| `traceContext` | Optional OTel trace propagation | `Record<string, string>`; set by `OutboxPublisher.publish()` for distributed tracing — not business payload, omit from any `data` design |

> **Multi-tenancy:** `tenantId` in the envelope is the authoritative tenant scope. The Notification Context running for Tenant A MUST discard any event whose envelope `tenantId` does not match Tenant A. Same rule for every other context.

> **Idempotency:** Consumers MUST persist `eventId` via the shared `shared.inbox` table (`IInboxRepository.hasBeenProcessed`/`markProcessed`, keyed on `(eventId, consumerName)` — TD24-S04) and skip on duplicate.

---

## Event Categories

### **Booking Lifecycle Events** (Booking Context)

#### **BookingRequested**
- **Trigger:** Guest or authenticated customer submits a booking request (1..N services)
- **State change:** new Booking is created with status `PENDING`, parented to 1..N `BookingLine` rows
- **Data (envelope's `data` field):**
  ```
  {
    bookingId:         string
    type:              "GUEST" | "CUSTOMER"
    customerId:        string | null    // null when type=GUEST
    contactEmail:        string
    contactName:         string
    contactPhone:        string
    contactAddress: {                                          // non-null if guest provided general address
      street: string, number: string, complement: string | null,
      neighborhood: string | null, city: string, state: string, zipCode: string
    } | null
    scheduledAt:       ISO8601                                // start of the slot
    totalDurationMins: number                                 // SUM(lines.durationMinsAtBooking)
    totalPrice:        { amount: string, currency: string }   // SUM(lines.priceAtBooking); every Money `amount` in these payloads is a 2-decimal string, e.g. "50.00"
    requiresPickup:    boolean                                // true if any line has requiresPickupAddressAtBooking=true
    pickupAddress: {                                          // non-null when requiresPickup=true
      street: string, number: string, complement: string | null,
      neighborhood: string | null, city: string, state: string, zipCode: string
    } | null
    lines: [                                                   // ≥ 1
      {
        lineId:                          string
        serviceId:                       string
        serviceNameAtBooking:            string               // point-in-time name; may differ from current Service.name
        priceAtBooking:                  { amount: string, currency: string }
        durationMinsAtBooking:           number
        pointsValueAtBooking:            number
        requiresPickupAddressAtBooking:  boolean
      }
    ]
    beforeServicePhotoUrls: string[]                           // 0..n; tenant-prefixed storage paths
  }
  ```
- **Consumers:**
  - **Notification Context** → admin email: subject `"Novo agendamento recebido"`; body includes customer name, date/time (the tenant's date and time format), services, total price formatted for the tenant, and the pickup address when the booking has one
  - **Notification Context** → customer/guest email: subject `"Solicitação de agendamento recebida"`; body includes booking details + "entraremos em contato para confirmar"

> Loyalty Context does NOT consume this event. Loyalty only reacts to `BookingCompleted` — points are awarded after the visit, not on request or approval.

---

#### **BookingApproved**
- **Trigger:** Admin approves a booking that is in `PENDING` or `INFO_REQUESTED`, **or** staff create a booking directly in `APPROVED` on a customer's behalf (UC-108, M23-S39 — the only event that creation raises; `BookingRequested` is not raised)
- **State change:** `PENDING | INFO_REQUESTED` → `APPROVED`, or none for a UC-108 booking (it starts `APPROVED`). After this, the line collection is frozen.
- **Data:**
  ```
  {
    bookingId:           string
    customerId:          string | null
    contactEmail:          string
    contactName:           string
    approvedSlot:        { startTime: ISO8601, endTime: ISO8601 }   // = [scheduledAt, scheduledAt + totalDurationMins)
    totalPrice:          { amount: string, currency: string }
    lineSummary: [                                                   // ≥ 1
      {
        serviceId:            string
        serviceNameAtBooking: string               // point-in-time name for email display
        priceAtBooking:       { amount: string, currency: string }
      }
    ]
    approvedBy:          string    // staff id
  }
  ```
- **Consumers:**
  - **Notification Context** → email to customer/guest: "Your booking is confirmed for [date/time]" (lists every service in the booking + total)

> Loyalty Context does NOT consume this event.

---

#### **BookingRejected**
- **Trigger:** Admin rejects a booking that is in `PENDING` or `INFO_REQUESTED`
- **State change:** `PENDING | INFO_REQUESTED` → `REJECTED`
- **Data:**
  ```
  {
    bookingId:    string
    customerId:   string | null
    contactEmail:   string
    contactName:    string
    reason:       string         // why
    rejectedBy:   string         // staff id
  }
  ```
- **Consumers:**
  - **Notification Context** → email to customer/guest: "Your booking was not approved. Reason: [reason]"
  - **Booking Context** (`availability-alert-matching`, M23-S07) → the freed window is offered to matching availability alerts (see `AvailabilityAlertMatched`)

---

#### **BookingInfoRequested**
- **Trigger:** Admin requests additional information from the customer/guest (e.g., better photos, clarification)
- **State change:** `PENDING` → `INFO_REQUESTED`
- **Data:**
  ```
  {
    bookingId:           string
    customerId:          string | null
    contactEmail:          string
    contactName:           string
    informationNeeded:   string     // free-text instructions for the customer
    requestedBy:         string     // staff id
  }
  ```
- **Consumers:**
  - **Notification Context** → email to customer/guest: "We need more info: [details]. Reply via [link]."

---

#### **BookingInfoSubmitted**
- **Trigger:** Customer / guest replies with the information that was requested
- **State change:** `INFO_REQUESTED` → `PENDING`
- **Data:**
  ```
  {
    bookingId:        string
    customerId:       string | null   // null if guest submitted via the email link
    submittedByEmail: string          // who replied (customer or guest)
    infoPayload:      object          // free-form notes/corrections (text, updated phone, etc.)
    photoUrls:        string[]        // 0..n before-service photos added with the info response;
                                      // appended to booking.beforeServicePhotoUrls
  }
  ```
- **Consumers:**
  - **Notification Context** → email to admin: "[name] replied with the requested info — review [link]"

---

#### **BookingCompleted**
- **Trigger:** Staff marks an APPROVED booking as completed after the visit
- **State change:** `APPROVED` → `COMPLETED`. All lines complete together (no partial completion in MVP).
- **Data:**
  ```
  {
    bookingId:               string
    customerId:              string | null
    contactEmail:              string
    contactName:               string
    completedSlot:           { startTime: ISO8601, endTime: ISO8601 }
    completedBy:             string         // staff id
    afterServicePhotoUrls:   string[]       // 0..n; tenant-prefixed storage paths
    adminNotes:              string | null
    pickupAddress: {                        // non-null if booking had a pickup service
      street: string, number: string, complement: string | null,
      neighborhood: string | null, city: string, state: string, zipCode: string
    } | null
    totalPrice:              { amount: string, currency: string }   // quoted total (sum of priceAtBooking)
    totalActualPrice:        { amount: string, currency: string }   // charged total (sum of actualPriceCharged)
    lines: [                                // ≥ 1 — the full set of completed lines
      {
        lineId:               string
        serviceId:            string
        priceAtBooking:       { amount: string, currency: string }  // quoted price for this line
        actualPriceCharged:   { amount: string, currency: string }  // what was actually charged (may differ)
        pointsValueAtBooking: number        // becomes the resulting LoyaltyEntry.points (unaffected by price)
      }
    ]
    discountByPoints?: {                    // omitted (never null) unless a loyalty discount was applied (UC-009 A6)
      pointsUsed:     number
      amountDeducted: { amount: string, currency: string }
    }
  }
  ```
- **Consumers:**
  - **Notification Context** → no consumer today: a customer with an account receives the `ServicePointsEarned` email (Loyalty); a guest receives nothing. A completion summary email (all services completed, quoted versus actual prices) is not implemented.
  - **Loyalty Context** → if `customerId != null`, iterate `lines`: insert one `LoyaltyEntry` per line using `pointsValueAtBooking` (loyalty is **not** affected by `actualPriceCharged`); increment `LoyaltyBalance.current_points` by the total points across all lines; publish one `ServicePointsEarned` event containing the earned lines summary. If `discountByPoints` is present: also decrement `LoyaltyBalance.current_points` by `pointsUsed` and record a `LoyaltyRedemption` linked to `bookingId`. Earning and redemption commit together in a single transaction, deduplicated via one `shared.inbox` row keyed on `(eventId, consumerName)`.

---

#### **BookingCancelled**
- **Trigger:** Customer cancels (UC-007) or admin cancels (UC-008) a booking that is in `PENDING`, `INFO_REQUESTED`, or `APPROVED`; or the system expires a `PENDING` manual-approval request nobody decided in time (TD51, `Booking.expireApproval()`)
- **State change:** `PENDING | INFO_REQUESTED | APPROVED` → `CANCELLED`
- **Data:**
  ```
  {
    bookingId:        string
    customerId:       string | null
    contactEmail:       string
    contactName:        string
    cancelledBy:      string | null   // customer id, guest email, or staff id; null when the system cancelled an unanswered manual-approval request (TD51)
    isBusiness:       boolean         // true = admin/business cancelled, false = customer cancelled
    reason:           string | null
    scheduledAt:      ISO8601         // the appointment time that was cancelled
    lineSummary: [
      {
        serviceId:            string
        serviceNameAtBooking: string
        priceAtBooking:       { amount: string, currency: string }
      }
    ]
    totalPrice:       { amount: string, currency: string }
    cancelledByScheduleEnd: boolean   // additive (M23-S28), false by default; true only for the occurrences cancelled when a recurring schedule is ended
    cancelledByHoldExpiry: boolean    // additive (TD51), false by default; true only when ExpireBookingHoldsJob cancelled a PENDING manual-approval booking whose hold ran out (then cancelledBy is null, isBusiness true and reason 'APPROVAL_EXPIRED')
  }
  ```
- **Consumers:**
  - **Notification Context** → email to customer: `"Seu agendamento foi cancelado"` — booking details (date/time, services, total), plus the reason when the business cancelled and gave one
  - **Notification Context** → email to admin: `"Agendamento cancelado"` — whether the customer or the business cancelled, the reason when the business gave one (a customer's own cancellation carries none), booking summary
  - **Booking Context** (`availability-alert-matching`, M23-S07) → the freed window is offered to matching availability alerts (see `AvailabilityAlertMatched`)
  - Neither email is sent when `cancelledByHoldExpiry = true` (TD51): the customer gets the dedicated `BOOKING_APPROVAL_EXPIRED_CUSTOMER` email (the request expired unanswered, nothing was booked, they may ask again; no staff name), routed by the same `BookingCancelled` consumer to its own use case, and managers get nothing. The audit-log and availability-alert consumers handle it like any cancellation.
  - Neither email is sent when `cancelledByScheduleEnd = true`: ending a recurring schedule sends the one `RecurringBookingScheduleEnded` email instead of one cancellation email per occurrence (M23-S28). The audit-log consumer still records every occurrence cancel.

> Loyalty Context does NOT consume this event. A booking cannot reach `COMPLETED` and then be cancelled (the state machine forbids it), so no `LoyaltyEntry` rows are ever affected by a cancellation.

---

#### **BookingRescheduled**
- **Trigger:** Admin reschedules a booking (UC-008 alt-flow A1) — `scheduledAt` is updated, status stays `APPROVED`
- **State change:** `booking.scheduledAt` updated. Status remains `APPROVED`.
- **Data:**
  ```
  {
    bookingId:         string
    customerId:        string | null
    contactEmail:        string
    contactName:         string
    newSlot:           { startTime: ISO8601, endTime: ISO8601 }   // new [scheduledAt, scheduledAt + totalDurationMins)
    previousSlot:      { startTime: ISO8601, endTime: ISO8601 }   // old slot (for the email)
    rescheduledBy:     string    // staff id (admin path) or customer id (self-service path, M23 Cluster 3)
    isBusiness:        boolean   // M23 Cluster 3 — true for a staff/manager-initiated reschedule, false for customer self-service; same convention as BookingCancelledData.isBusiness
    adminNotes:        string | null
    lineSummary: [
      {
        serviceId:            string
        serviceNameAtBooking: string
        priceAtBooking:       { amount: string, currency: string }
      }
    ]
    totalPrice:        { amount: string, currency: string }
  }
  ```
- **Consumers:**
  - **Notification Context** → email to customer/guest: `"Seu agendamento foi reagendado"` — old date/time, new date/time, services, total
  - **Notification Context** → email to admin: `"Agendamento reagendado"` — booking summary with old and new slot, and whether the customer or the business rescheduled (`isBusiness`)
  - **Booking Context** (`availability-alert-matching`, M23-S07) → the vacated window is offered to matching availability alerts (see `AvailabilityAlertMatched`)

> Loyalty Context does NOT consume this event — loyalty is unaffected by rescheduling.

> **Extended by M23 Cluster 3 (UC-069):** a customer-initiated reschedule (not just admin, UC-044) now goes through the same event — the trigger widens to include the customer's own "Reagendar" action, resource/bundle/leg re-validation is atomic (the release of the original `resource_occupancy` row(s) and the assignment of the replacement happen inside the same transaction as the rest of the reschedule; a losing race — a concurrent booking wins the replacement resource — throws, rolling back the whole transaction, so the original `resource_occupancy` row(s) are never actually deleted and the booking keeps its original slot), and a `booking_quote_revisions` row is recorded when the reschedule changes the price (e.g. a variable-duration service). No new event type was introduced — this is a scope extension of the existing envelope, not a new candidate event. **Actor split (story-discovery, M23-S03, 2026-09-26):** mirrors `BookingCancelled`'s existing `cancelledBy`/`isBusiness` shape — `RescheduleBookingAsCustomerUseCase` (new) handles the customer path, the existing staff/admin use case handles the other; the BFF's single `PATCH /bookings/:id/reschedule` route dispatches to the backend's `reschedule-customer`/`reschedule-admin` routes by JWT role, exactly like `PATCH /bookings/:id/cancel` already does for `cancel-customer`/`cancel-admin`.

---

#### **BookingReminderDue** *(Command — `booking/domain/commands/booking-reminder-due.command.ts`, published through the outbox like the other cron-emitted messages)*
- **Trigger:** Scheduled cron job (06:00 tenant-local) finds APPROVED bookings whose appointment is **tomorrow**. The cron emits one event per booking; Notification Context sends the email.
- **State change:** none (booking stays APPROVED)
- **Data:**
  ```
  {
    bookingId:        string
    customerId:       string | null
    recipientEmail:   string
    customerName:     string
    scheduledAt:      ISO8601
    appointmentSlot:  { startTime: ISO8601, endTime: ISO8601 }
    lines: [
      { serviceId: string, serviceName: string }
    ]
  }
  ```
- **Consumers:**
  - **Notification Context** → email to customer/guest: "Reminder: your appointment is tomorrow at [time]"

---

#### **BookingReminderDueToday** *(Command — `booking/domain/commands/booking-reminder-due-today.command.ts`, published through the outbox like the other cron-emitted messages)*
- **Trigger:** Scheduled cron job (06:00 tenant-local) finds APPROVED bookings whose appointment is **today**. The cron emits one event per booking; Notification Context sends the email.
- **State change:** none
- **Data:**
  ```
  {
    bookingId:        string
    customerId:       string | null
    recipientEmail:   string
    customerName:     string
    scheduledAt:      ISO8601
    appointmentSlot:  { startTime: ISO8601, endTime: ISO8601 }
    lines: [
      { serviceId: string, serviceName: string }
    ]
  }
  ```
- **Consumers:**
  - **Notification Context** → email to customer/guest: "Reminder: your appointment is today at [time]"

---

#### **RecurringScheduleRenewalDue** *(Command, M23-S21)*
- **Trigger:** Scheduled cron job (`CRON_REMINDERS_TRIGGER`, tenant-local 06:00–06:29 window) finds `ACTIVE` recurring schedules whose `endsOn` equals the tenant-local today plus `settings.booking.recurringRenewalReminderDays` and whose term is longer than that lead time. One Command per schedule; a lead time of `0` disables it. A schedule is skipped when the customer already has a successor (another `ACTIVE` or `PENDING_APPROVAL` schedule for the same service starting on or after this one's `endsOn`).
- **State change:** none (the schedule stays `ACTIVE`)
- **Dedup key:** `RecurringScheduleRenewalDue:{tenantId}:{recurringScheduleId}:{localDate}` — at most one e-mail per schedule, even on a retried or overlapping tick.
- **Data:**
  ```
  {
    recurringScheduleId: string
    customerId:          string
    serviceId:           string
    daysOfWeek:          string[]     // weekday names, as the schedule stores them
    startTime:           HH:mm        // tenant-local
    startsOn:            YYYY-MM-DD
    endsOn:              YYYY-MM-DD
  }
  ```
  Ids and the schedule's pattern only, no e-mail address or name — the notification use case resolves the customer, service and tenant formats itself, like every other recurring-schedule e-mail (M23-S28).
- **Consumers:**
  - **Notification Context** → email to the customer, in the tenant's locale: which reservation ends and when, with a link built from the shared `buildRecurringRenewalUrl` (`@ikaro/types`) that opens `/{slug}/my-account/recurring-schedules/new?renewFrom=<id>`. A customer or service that no longer exists is logged and acknowledged, never retried.
- **Topic:** a Command published through the outbox still needs a Pub/Sub topic: `pubsub-catalog.json` lists `RecurringScheduleRenewalDue` (consumer `notification`) and adds the `recurring-schedule-renewal-reminder` subscription to `cron-reminders`; after merge, dispatch `foundation-deploy.yml` with `apply=true`.

---

#### **AdminDailyScheduleReminder** *(Command — `booking/domain/commands/admin-daily-schedule-reminder.command.ts`, published through the outbox like the other cron-emitted messages)*
- **Trigger:** Scheduled cron job (06:00 tenant-local) builds the day's schedule digest. One event emitted **per tenant** — the Notification handler fans out to all managers via `INotificationStaffPort.getManagerEmails()`.
- **State change:** none
- **Data:**
  ```
  {
    localDate:         string              // YYYY-MM-DD in tenant timezone — used in email subject
    bookingsToday:     [
      {
        bookingId:         string
        customerName:      string
        customerPhone:     string | null   // booking.contactPhone for guests; ICustomerProfilePort.phone for authenticated (null if not set)
        lines: [                           // ≥ 1 — all services in this booking
          { serviceId: string, serviceName: string }
        ]
        appointmentSlot:   { startTime: ISO8601, endTime: ISO8601 }
        adminNotes:        string | null
      }
    ]
    totalBookingsToday: number
  }
  ```
- **Consumers:**
  - **Notification Context** → digest email to all MANAGER-role staff; uses `INotificationStaffPort.getManagerEmails(tenantId)` to resolve recipients

---

> **M23 — Multi-Vertical Scheduling, Cluster 3 (Customer/guest appointment booking + extensions).** The events below are new Booking Context events for `RecurringBookingSchedule`, `AvailabilityAlert`, `FutureCommitmentException`, tenant-preset bootstrap, and appointment no-show.

#### **RecurringBookingScheduleCreated**
- **Trigger:** UC-070 confirms a recurring pattern on an `AUTO_CONFIRM` service, or UC-071 approves a `PENDING_APPROVAL` request on a `MANUAL_APPROVAL` service.
- **State change:** `RecurringBookingSchedule.status → ACTIVE`; every occurrence of the term is materialized as a linked booking in the same transaction (there is no rolling generation).
- **Data:** `{ recurringScheduleId, customerId, serviceId, resourceIds: string[], assignmentPolicy, recurrence, startsOn, endsOn }`
- **Consumers:** audit-log; Notification Context → customer confirmation email (M23-S28: service, weekdays and time, first and last date; sent at creation and at approval alike, to the schedule's customer even when staff created it). The materialized occurrence bookings raise no `BookingRequested`/`BookingApproved` of their own (M23-S05), so one schedule never produces one email per occurrence.

#### **RecurringBookingScheduleApprovalRequested**
- **Trigger:** UC-070 confirms a recurring pattern on a `MANUAL_APPROVAL` service.
- **State change:** `RecurringBookingSchedule` created `PENDING_APPROVAL`, `approvalHoldExpiresAt` set. No occurrences are materialized until staff approve (UC-071).
- **Data:** `{ recurringScheduleId, customerId, serviceId, resourceIds, assignmentPolicy, recurrence, startsOn, endsOn, approvalHoldExpiresAt }`
- **Consumers:** audit-log; Notification Context → email to the tenant's managers (M23-S28, the role `BookingRequested` plays for a manual-approval appointment). The customer gets no email for this event; the outcome reaches them through `Created` or `Rejected`.

#### **RecurringBookingScheduleRejected**
- **Trigger:** UC-071 (staff rejects) or its hold-expiry worker (unresolved past `approvalHoldExpiresAt`).
- **State change:** `RecurringBookingSchedule.status → CANCELLED`, `cancellationReason = APPROVAL_REJECTED | APPROVAL_EXPIRED`.
- **Data:** `{ recurringScheduleId, customerId, serviceId, reason }`
- **Consumers:** audit-log; Notification Context → customer email (M23-S28), with different wording per `reason`: `APPROVAL_REJECTED` (staff decided no) and `APPROVAL_EXPIRED` (nobody decided in time; nothing was booked and the customer may request again).

#### **RecurringBookingScheduleEnded**
- **Trigger:** UC-070 A2 (the customer, or staff on their behalf, ends the schedule entirely).
- **State change:** `status → CANCELLED` (`cancellationReason = CUSTOMER_CANCELLED` or, when staff ended it, `STAFF_CANCELLED`); future materialized occurrences cancelled, releasing their `resource_occupancy` rows. Each of those occurrences raises its own `BookingCancelled` with `cancelledByScheduleEnd = true`, which sends no email.
- **Data:** `{ recurringScheduleId, customerId, serviceId, cancelledBookingIds: string[], endedBy: 'CUSTOMER' | 'STAFF' }` (`endedBy` added by M23-S28, additive, no `eventVersion` bump)
- **Consumers:** audit-log; Notification Context → one customer email in both cases (M23-S28), worded "you ended it" for `CUSTOMER` and "the business ended it" for `STAFF`. No staff name or booking id appears in it.
- **Not emitted for a natural end:** when a schedule's term is over, the M23-S05 job moves it `ACTIVE → ENDED` without an event — nothing was cancelled and no consumer needs one (an event with no consumer must not ship).

#### **AvailabilityAlertCreated**
- **Trigger:** UC-072.
- **State change:** `availability_alerts` row created, `status = ACTIVE`.
- **Data:** `{ alertId, customerId, serviceId, criteriaType, expiresAt }`
- **Consumers:** `audit-log` only (`BookingAuditLogHandler` → `LogDomainEventUseCase`, M23-S36) — no business consumer.

#### **AvailabilityAlertUpdated**
- **Trigger:** UC-076/UC-053 (customer edits criteria or expiry).
- **Data:** `{ alertId, customerId, serviceId }`
- **Consumers:** `audit-log` only (`BookingAuditLogHandler` → `LogDomainEventUseCase`, M23-S36) — no business consumer.

#### **AvailabilityAlertCancelled**
- **Trigger:** UC-072 A2 (withdraws before a match) or UC-076/UC-053 (explicit cancel).
- **State change:** `status → CANCELLED`.
- **Data:** `{ alertId, customerId, serviceId }`
- **Consumers:** `audit-log` only (`BookingAuditLogHandler` → `LogDomainEventUseCase`, M23-S36) — no business consumer.

#### **AvailabilityAlertExpired**
- **Trigger:** System — `expiresAt` passed with no match.
- **State change:** `status → EXPIRED`.
- **Data:** `{ alertId, customerId, serviceId }`
- **Consumers:** `audit-log` only (`BookingAuditLogHandler` → `LogDomainEventUseCase`, M23-S36) — no business consumer.

#### **AvailabilityAlertMatched**
- **Trigger:** UC-072 step 3 — a bookable slot that a customer can actually select starts inside an `ACTIVE` alert's acceptable window. Two producers, one use case (`MatchAvailabilityAlertsUseCase`): the capacity-release handlers (`BookingCancelled`, `BookingRejected`, `BookingRescheduled` — one day re-checked) and the daily sweep on `cron-reminders` (the whole selectable window). See `docs/BUSINESS_LOGIC_REFERENCE.md` § Booking — Availability Alerts.
- **State change:** `status → NOTIFIED`; one `availability_alert_notification_attempts` row (`outcome = PENDING`) inserted for the matching window, in the same transaction as the status change. A `NOTIFIED` alert is never matched again, so the event is raised at most once per alert.
- **Data:** `{ alertId, customerId, serviceId, matchingWindowStart, matchingWindowEnd, resourceId: string | null, durationMinutes: number | null }` — `resourceId` and `durationMinutes` are the alert's own preferred resource and duration (M23-S44, additive: a message published before it lacks `durationMinutes`, so a consumer treats it as optional)
- **Consumers:** audit-log subscriber (`audit-log`, M23-S07), and the Notification Context (`notification`, M23-S38): one deduplicated email to the alert's customer, in the tenant's language, linking to the hotsite booking page on the alert's service and the tenant-local day the slot opened, with the alert's duration and preferred resource when it has them (M23-S44). The consumer then records the attempt's `outcome` (`SENT` or `FAILED`, with `attempt_count` and `last_error`) through a Notification port that calls a Booking use case — no outcome event is published. A failed send is retried by Pub/Sub redelivery and a later success turns `FAILED` into `SENT`. No `IN_APP` consumer exists.

#### **FutureCommitmentExceptionRaised**
- **Trigger:** UC-073 — a resource/hours/template/schedule change affects a future commitment nobody explicitly reviewed per-session (excludes a manager-initiated range cancellation, Cluster 4, whose own step is already the explicit resolution). Wired as of M23-S08 for resource deactivation only, from UC-047 and the UC-048 staff-deactivation cascade, once per affected booking.
- **State change:** `future_commitment_exceptions` row created, `status = OPEN`.
- **Data:** `{ exceptionId, sourceType, sourceId, affectedType, affectedId, ownerStaffId: string | null }`
- **Consumers:** M23-S08 ships an audit-log consumer only. **No Notification consumer, by design** (M23-S23): one `Raised` per affected booking would send a manager one email per booking, so the manager alert hangs on `ResourceDeactivationImpactRaised` below.

#### **ResourceDeactivationImpactRaised**
- **Trigger:** the shared raise step (`RaiseFutureCommitmentExceptionsForResourceService`, UC-047 and the UC-048 cascade) has raised its worklist entries and at least one booking is affected. Published once per deactivation, never when no booking is affected, through `OUTBOX_PUBLISHER` inside the deactivation transaction (a non-aggregate event).
- **State change:** none beyond the entries `FutureCommitmentExceptionRaised` already records.
- **Data:** `{ resourceId, resourceName, affectedCount }` — `affectedCount` is the number of live affected bookings (refreshed entries included).
- **Consumers:** audit-log subscriber, and the Notification Context: one email to every manager, in the tenant's language, naming the resource and the number of bookings that need a decision, linking to the dashboard (`${FRONTEND_URL}/dashboard`).

#### **BookingResourceReassigned**
- **Trigger:** UC-077 REASSIGN — a manager moves a booking to another resource at the same time. Recorded by `Booking.recordResourceReassigned()` and drained through the outbox on the booking's `save()`. The time, price and status do not change, so no `BookingRescheduled` is published.
- **State change:** none on the booking.
- **Data:** `{ bookingId, customerId: string | null, contactEmail, contactName, slot, lineSummary, reassignedBy, newResourceName: string | null }` — `newResourceName` is set only when every affected line's requirement discloses the resource (`CUSTOMER_CHOICE`, `AUTO_ANY`), otherwise `null` (UC-062/063). There is no `reason`: the manager's note is internal.
- **Consumers:** audit-log subscriber, and the Notification Context: one email per moved booking to the booking's own `contactEmail`, in the tenant's language, saying the time is unchanged and, when disclosed, the new resource.

#### **FutureCommitmentExceptionResolved**
- **Trigger:** UC-077 (manager keeps, reassigns, reschedules, or cancels).
- **State change:** `status → RESOLVED`.
- **Data:** `{ exceptionId, resolutionType, resolvedByStaffId, affectedType, affectedId }`
- **Consumers:** M23-S08 ships an audit-log consumer only. The customer-facing detail comes from the resulting booking event (`BookingCancelled`, `BookingRescheduled`); a reassign's customer message comes from `BookingResourceReassigned` (M23-S23). No Notification consumer on `Resolved` itself.

#### **FutureCommitmentExceptionDismissed**
- **Trigger:** UC-077 A2 (manager dismisses a genuinely resolved/non-impacting item), A3 (the source resource is reactivated, reason `RESOURCE_REACTIVATED`) and A4 (M23-S48: the booking was cancelled, rejected or ended with its recurring schedule, reason `BOOKING_NO_LONGER_ACTIVE`; or it was rescheduled or approved onto other resources, reason `RESOURCE_NO_LONGER_USED`).
- **State change:** `status → DISMISSED`.
- **Data:** `{ exceptionId, resolvedByStaffId, resolutionReason }` — `resolvedByStaffId` is `null` when the system closed the entry (A3 records the reactivating staff member; A4 has no actor, a customer may have cancelled).
- **Consumers:** `audit-log` only (`BookingAuditLogHandler` → `LogDomainEventUseCase`, M23-S36) — no business consumer.

#### **TenantSchedulingBootstrapped**
> ⚠️ **Planned, not built:** UC-075 moved to M24-S21; no event class or Pub/Sub topic exists yet.

- **Trigger:** UC-075 (preset bootstrap commits).
- **State change:** Tenant's initial `Resource`/`Service` graph created in one transaction (SESSION-preset templates arrive once Cluster 4 ships).
- **Data:** `{ tenantId, presetId, serviceIds: string[], resourceIds: string[] }`
- **Consumers:** None in MVP.

#### **BookingNoShow**
- **Trigger:** UC-074 — after an appointment's scheduled end time.
- **State change:** `Booking.status → NO_SHOW` (new terminal state).
- **Data:** `{ bookingId, actorId, reason, occurredAt }` (`tenantId`/`correlationId` are envelope fields); M23-S25 adds, without bumping `eventVersion`, the fields the customer email needs, in the same shape as `BookingCancelled`: `customerId: string | null`, `contactEmail`, `contactName`, `scheduledAt` (ISO-8601 UTC), `lineSummary` (`serviceId`, `serviceNameAtBooking`, `priceAtBooking` per line). The event class types them optional because a message published before M23-S25 lacks them, so the Notification consumer skips such a message without sending; `Booking.markNoShow()` always sets all of them
- **Consumers:** the shared booking `audit-log` consumer (M23-S36); the retryable customer email through the Notification Context (M23-S25, consumer `notification`, tenant locale, never shows `reason`). Loyalty does **not** award completion points for this event. A manager's correction of a no-show to `COMPLETED` publishes `BookingCompleted`, not `BookingNoShow` again.

---

> ⚠️ **Planned, not built:** none of the Cluster 4 events below (`ClassSession*`, `WaitlistPromoted`, `InPersonPayment*`) has an event class or a Pub/Sub topic yet.

> **M24 — Multi-Vertical Scheduling, Cluster 4 (Classes/Sessions).** `ClassSession` and `ClassSessionBooking` are full `AggregateRoot`s whose events are drained through the transactional outbox, matching the existing `Booking` pattern — delivery failure never rolls back the committed booking state.

#### **ClassSessionCancelled**
- **Trigger:** UC-084 (single session cancelled with existing bookings) or UC-096 (date-range/from-date template cancellation, once per affected session).
- **State change:** `ClassSession.status → CANCELLED`; every active `ClassSessionBooking` on it → `CANCELLED`.
- **Data:** `{ classSessionId, serviceId, startTime, cancelledBookingIds: string[] }`
- **Consumers:** Notification Context → email to every affected customer/guest.

#### **ClassSessionBookingConfirmed**
- **Trigger:** UC-086/087/088 (capacity check passes and confirms immediately) or UC-091 (waitlist offer accepted).
- **State change:** `ClassSessionBooking.status → CONFIRMED`.
- **Data:** `{ classSessionBookingId, sessionId, serviceId, customerId: string | null, contactEmail, contactName, quantity, priceAtBooking }` (mirrors `BookingRequested`'s self-contained-event shape)
- **Consumers:** Notification Context → confirmation email.

#### **ClassSessionBookingWaitlisted**
- **Trigger:** UC-090.
- **State change:** `ClassSessionBooking.status → WAITLISTED`. Does not consume capacity.
- **Data:** `{ classSessionBookingId, sessionId, customerId, waitlistAccessIntent }`
- **Consumers:** Notification Context → confirmation email with queue position (computed at read time, not stored).

#### **WaitlistPromoted**
- **Trigger:** UC-091 — capacity released, first fitting waitlisted entry offered the seat.
- **State change:** `ClassSessionBooking.status → PROMOTION_PENDING`; `offerOfferedAt`/`offerExpiresAt` set; counts against capacity.
- **Data:** `{ classSessionBookingId, sessionId, customerId, offerExpiresAt }`
- **Consumers:** Notification Context → email + in-app offer with explicit accept/decline actions and deadline.

#### **ClassSessionBookingCancelled**
- **Trigger:** UC-089 (customer/staff cancels a one-off booking), UC-094 (skip one recurring occurrence), UC-098 (staff rejects a guest reservation), UC-100 (system expires an unresolved guest request at session start), UC-102 (original occurrence cancelled as part of a reschedule, `reason: ENROLLMENT_OCCURRENCE_SKIPPED`).
- **State change:** `ClassSessionBooking.status → CANCELLED`; frees `quantity` back to `ClassSession.reservedCount`; triggers `WaitlistPromoted` if a waitlist exists.
- **Data:** `{ classSessionBookingId, sessionId, customerId: string | null, reason, quantity }`
- **Consumers:** Notification Context → cancellation email.

#### **ClassSessionBookingCompleted**
- **Trigger:** UC-101 — session closes with eligible attended contract/pay-per-class customer attendance.
- **State change:** Parent reservation → `CLOSED`; attendee row(s) → `PRESENT`.
- **Data:** `{ classSessionBookingId, customerId, serviceId, pointsValueAtBooking, priceAtBooking }` — mirrors `BookingCompleted`'s consumers.
- **Consumers:** **Loyalty Context** (inserts a `LoyaltyEntry` via `class_session_booking_id`, mutually exclusive with the appointment path) and Notification Context. Not published for a guest attendee (guests earn no loyalty points) or a `NO_SHOW` outcome.

#### **ClassSessionBookingNoShow**
- **Trigger:** UC-101 — staff closes a session and marks an attendee absent.
- **State change:** Attendee's `attendance → NO_SHOW`; the parent session booking remains auditable, no `ClassSessionBookingCompleted` for that attendee.
- **Data:** `{ classSessionBookingId, attendeeId, classSessionId, customerId: string | null }`
- **Consumers:** Notification Context → retryable customer email. Loyalty does **not** award points.

#### **InPersonPaymentRecorded**
- **Trigger:** UC-101 step 2 / UC-107 (staff records a manually reported charge outcome; Ikaro does not process the payment).
- **State change:** `class_session_payments` manual operational record created.
- **Data:** `{ paymentId, classSessionBookingId, amount, currency: "BRL", method, collectedByStaffId }`
- **Consumers:** None in MVP.

#### **InPersonPaymentReversed**
- **Trigger:** UC-107 — a correction/reversal, never an overwrite of the original record.
- **State change:** New `class_session_payments` row inserted with `reversalOfPaymentId` set; the original row is untouched.
- **Data:** `{ paymentId, reversalOfPaymentId, classSessionBookingId, amount, correctionReason }`
- **Consumers:** None in MVP.

---

### **Loyalty Events** (Loyalty Context)

#### **ServicePointsEarned**
- **Event version:** `eventVersion = 2` (booking-scoped payload with `lines`).
- **Trigger:** Loyalty Context inserted a `LoyaltyEntry` after consuming `BookingCompleted`. One event is published **per booking** — a booking with 3 lines inserts 3 entries and produces one `ServicePointsEarned` event listing all 3. **Extended by M24 Cluster 4:** also fires after consuming `ClassSessionBookingCompleted` — exactly one event per class-session completion (no "lines" concept for that family; `loyalty_entries.class_session_booking_id` is set instead of `booking_id`/`booking_line_id`, per `CHK_loyalty_entries_source_exclusive`, `docs/DATABASE_SCHEMA.md`).
- **State change:** new row in `loyalty_entries` + `loyalty_balances.current_points` incremented. Both writes are in one transaction. Idempotent against replay via `shared.inbox` (early-exit) + `UNIQUE(tenant_id, booking_line_id)` (appointment) or `UNIQUE(tenant_id, class_session_booking_id)` (class, M24 Cluster 4) as the hard guard on the entry insert.
- **Data (booking-scoped — one event per booking, not per line):**
  ```
  {
    customerId:         string
    bookingId:          string
    totalPointsEarned:  number       // sum of all lines
    earnedAt:           ISO8601      // timestamp of the booking completion
    lines: [                         // one entry per booking line
      {
        entryId:        string
        serviceId:      string
        pointsEarned:   number
        expiresAt:      ISO8601      // earnedAt + tenants.settings.loyalty.expiryDays
      }
    ]
    currentBalance:     number       // customer's total active points after this increment (snapshot)
  }
  ```
- **Design note:** One `ServicePointsEarned` is published per **booking** (not per line) so the customer receives a single thank-you email summarising all services completed in that booking. The `LoyaltyEntry` rows are still one per line; the event is assembled in `CompleteBookingLoyaltyEffectsUseCase` after all entries are saved.
- **Consumers:**
  - **Notification Context** → sends one thank-you email per booking. Uses `INotificationCustomerPort` to resolve `customerId → email/name` and `INotificationBookingPort.findServicesByIds()` to resolve all service names in a single query.

---

#### **PointsExpiringSoon** *(Command — `loyalty/domain/commands/points-expiring-soon.command.ts`, published through the outbox like the other cron-emitted commands, not a `DomainEvent`)*
- **Trigger:** GCP Cloud Scheduler publishes to the `ikaro-cron-loyalty-expiry-warning` Pub/Sub topic once a week (Mondays 06:00 UTC); the push subscription dispatches to `NotifyExpiringPointsTriggerHandler`, which calls `NotifyExpiringPointsJob.run()` (M17-S03 — local dev: `POST /cron/loyalty-expiry-warning` publishes the same trigger). The job finds all customers across all tenants who have `LoyaltyEntry` rows whose `expires_at` falls within the configured warning window (`settings.loyalty.expiryWarningDays`, default 7).
- **Direction:** Forward-looking — this is a heads-up, not a post-mortem. Once `expires_at` actually passes, the `ikaro-cron-loyalty-expiry` topic (daily, 02:00 UTC) dispatches to `ExpirePointsTriggerHandler`, which decrements `loyalty_balances.current_points` for those entries.
- **Aggregation:** One event per customer per tenant — all expiring entries for a customer are aggregated into a single event.
- **State change:** None — the weekly cron does not write any DB rows. It only computes and publishes.
- **Data:**
  ```
  {
    customerId:           string
    pointsExpiringSoon:   number    // sum of `points` from entries with expires_at in [now, now + expiryWarningDays)
    earliestExpiresAt:    ISO8601   // the soonest expires_at among those entries
  }
  ```
- **Consumers:**
  - **Notification Context** → sends one email per customer: "Você tem [X] pontos prestes a expirar em [earliestExpiresAt]. Realize um agendamento para utilizá-los."

> **No `PointsExpired` event.** When points actually expire, the daily `ikaro-cron-loyalty-expiry` trigger dispatches to `ExpirePointsTriggerHandler`, which decrements `loyalty_balances.current_points` and logs the processed entry IDs in `balance_expiry_log` (idempotent). No domain event is published — the customer was already warned in advance by `PointsExpiringSoon`.

> **No `PointsRedeemed` event.** Redemptions are recorded synchronously via `POST /v1/loyalty/redeem` (admin-only REST endpoint). The `loyalty_redemptions` table is the audit trail. No async event is needed — the balance decrement and redemption row are written atomically in the same HTTP transaction.

---

### **Notification Events** (Notification Context)

> **Not implemented.** `EmailSent`/`EmailFailed` event classes do not exist in code — the section below documents the original design intent, not current behavior. Sent/failed state is currently tracked directly on the `NotificationLog` entity (`notification_logs.status`), not published as domain events. Do not implement against this section until it's confirmed still wanted; if so, promote it out of this warning block first.
>
> ```
> EmailSent   { notificationLogId, templateName, recipient, subject, sentAt }
> EmailFailed { notificationLogId, templateName, recipient, subject, errorMessage, retryCount }
> ```

---

## Event Flow Diagrams

### Happy path: guest books, admin approves, staff completes

```
Guest submits booking (with 1..N service lines)
        │
        ▼
BookingRequested ───► Notification (admin "new request" + guest "pending")

Admin approves
        │
        ▼
BookingApproved  ───► Notification (customer "confirmed" — lists every service + total)

Staff marks complete
        │
        ▼
BookingCompleted ───► Loyalty (if customerId != null:
                                  insert ONE LoyaltyEntry PER LINE
                                  publish ONE ServicePointsEarned PER BOOKING)
                                                  │
                                                  ▼
                                  Notification may batch per booking:
                                  "You earned 5 points across 3 services. Active total: 47."
```

> Loyalty only consumes `BookingCompleted`. `BookingRequested`, `BookingApproved`, `BookingRejected`, `BookingInfoRequested`, `BookingInfoSubmitted`, and `BookingCancelled` have no Loyalty consumer.

---

### Info-request loop

```
PENDING ──► BookingInfoRequested ──► INFO_REQUESTED
                                          │
                                          ▼
                              (customer replies via email link)
                                          │
                                          ▼
PENDING ◄── BookingInfoSubmitted ◄────────┘
   │
   ├──► BookingApproved   (admin acts)
   ├──► BookingRejected
   └──► BookingCancelled
```

---

### Cancellation (48 h window per tenant)

```
Customer clicks "Cancel"
        │
        ▼
  (now + tenants.settings.booking.cancellationWindowHours ≤ appointment ?)
        │           │
       NO         YES
        │           │
        ▼           ▼
   400 error  BookingCancelled
              ├──► Notification (customer "confirmed", admin "cancelled by …")
              (No Loyalty consumer — points are only created on COMPLETED,
               and a booking cannot reach COMPLETED then be cancelled.)
```

---

---

### **Staff Context Events** (Staff Context)

#### **StaffInvited**
- **Trigger:** Two sources:
  1. MANAGER invites a new team member (UC-028)
  2. M04-S06 `TenantProvisionedHandler` creates the first MANAGER staff during tenant provisioning
- **State change:** A new `Staff` row is created with `isActive = true` and `googleOAuthId = null` — `googleOAuthId IS NULL` is what marks the invite as pending the first Google OAuth login (`Staff.invite` / `Staff.inviteFromProvisioning`)
- **Data:**
  ```json
  {
    "staffId": "uuid"
  }
  ```
  (`tenantId`/`correlationId` are envelope fields on every event, not part of `data` — see the Event Envelope in CLAUDE.md §4. `email`, `role`, and `invitedBy` are **not** part of the event payload — a consumer needing them looks up the `Staff` row by `staffId`.)
- **`invitedBy` values (on the `Staff` row, not this event):**
  - Normal invite (UC-028): UUID of the MANAGER who sent the invite
  - Tenant provisioning (UC-024 → M04-S06): `SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'`
- **Consumers:** Notification Context → sends invitation email with login link (email template must handle `invitedBy = SYSTEM_ACTOR_ID` gracefully — omit the "invited by [name]" line or show "Ikaro Platform")

#### **StaffDeactivated**
- **Trigger:** MANAGER-role staff member deactivates a team member (UC-029)
- **State change:** `staff.isActive` set to `false`; active sessions invalidated at next JWT check
- **Data:**
  ```json
  {
    "staffId": "uuid"
  }
  ```
  (`tenantId`/`correlationId` are envelope fields on every event, not part of `data`. `deactivatedBy` is **not** part of the event payload — it's tracked on the `Staff` row itself, same pattern as `StaffInvited`'s `invitedBy`.)
- **Consumers:**
  - **Booking Context** (UC-048, added M21 Cluster 1) → cascades to the wrapping `STAFF`-type `Resource`: `isActive = false` for new scheduling, any active class-schedule-template bundle containing it ends for future generation (planned, M24; not built — `CascadeStaffDeactivationUseCase` touches only the `STAFF` Resource today). First real consumer of this event — sessions themselves still expire naturally via JWT TTL, independent of this.

#### **StaffActivated**
- **Trigger:** MANAGER-role staff member reactivates a previously deactivated team member (UC-031)
- **State change:** `staff.isActive` set to `true`; `staff.deactivatedBy` cleared
- **Data:**
  ```json
  {
    "staffId": "uuid"
  }
  ```
  (`tenantId`/`correlationId` are envelope fields on every event, not part of `data` — see the Event Envelope in CLAUDE.md §4)
- **Consumers:** `audit-log` only (`StaffAuditLogHandler` → `LogDomainEventUseCase`, M23-S36) — no business consumer in MVP

---

### **Platform Context Events**

#### **TenantProvisioned**
- **Trigger:** Platform operator calls `POST /internal/tenants` to onboard a new car-wash company (UC-024)
- **State change:** `Tenant` row + default `HotsiteConfig` row created. First MANAGER staff does NOT exist yet — that is handled by M04-S06 which subscribes to this event.
- **Data:**
  ```json
  {
    "name":        "string",
    "slug":        "string",
    "adminEmail":  "string",
    "timezone":    "America/Sao_Paulo",
    "countryCode": "BR | US",
    "billingHint": {
      "exempt":         "boolean (optional) — free access, never charged (Ikaro's own tenant, partner/test tenants)",
      "features":       "FeatureKey[] (optional) — the default paid-item subset; omitted = every feature",
      "registrationId": "uuid (optional) — the Billing provisioning registration (see below)"
    }
  }
  ```
  (`tenantId` is the envelope's own field — the constructor's first argument — not part of `data`.) `countryCode`, `billingHint` (and therefore `exempt`, `features`, `registrationId`) are **additive** fields **planned** for the Billing release (today the event carries only `name`, `slug`, `adminEmail`, `timezone`, and `ProvisionTenantUseCaseInput` is `name`, `slug`, `adminEmail`, `country_code`, `timezone?`: the use-case input, `POST /internal/tenants` and `scripts/provision-tenant.sh` gain `exempt`, `features` and `registrationId` in that release); `eventVersion` is bumped for documentation only. A payload without `countryCode` (an outbox row written before the Billing release) is *legacy*: the Billing handler skips it and logs, and the self-heal job creates the trial through the narrow read-only tenant-info port (`docs/BOUNDED_CONTEXTS.md` § 7). **Personal data never travels in this event:** the Google `sub`, the BR CPF/CNPJ and the accepted-terms version live in the `billing.signup_registrations` row that Billing creates *before* provisioning (self-signup through BFF orchestration, operator provisioning through `POST /internal/billing/registrations`); the event carries only its `registrationId`, so the generic audit log and Pub/Sub never see them (LGPD).
- **Consumers:**
  - Staff context (M04-S06) → creates first MANAGER `Staff` row (`isActive=true`, `googleOAuthId=null` until first login) + publishes `StaffInvited`
  - Booking context (`booking` consumer, `create-tenant-location-resource`) → creates the tenant's `LOCATION` resource
  - Notification context (`notification-template-seed` consumer) → seeds the tenant's default notification templates
  - Billing context (`create-trial-subscription` consumer) → creates the `TRIALING` `Subscription`, its default paid items and the `BillingAccount` (copying tax id and terms from the registration, then clearing them from it) in one transaction; idempotent on `UNIQUE(tenant_id)`; an `exempt` hint creates an `ACTIVE`, exempt subscription instead
  - `audit-log` (`PlatformAuditLogHandler`)
- **Design note:** `invitedBy` in the downstream `StaffInvited` event is set to `SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'` because no human actor exists yet at provisioning time.

---

#### **LeadFormSubmissionReceived**
- **Trigger:** A visitor (guest or logged-in customer) submits the `LEAD_FORM` hotsite module's public form (`docs/USE_CASES.md` UC-039/UC-040)
- **State change:** `platform.lead_form_submissions` row created
- **Data:**
  ```json
  {
    "submissionId": "uuid-v7",
    "customerId":   "uuid-v7 | null"
  }
  ```
  (`tenantId`/`eventId`/`occurredAt`/`correlationId` are the envelope's own fields, not part of `data`. Deliberately thin — the submitted content itself, e.g. name/email/answers, is never carried in the event payload, matching how other PII-bearing events in this codebase keep bulk content out of the envelope and readable only via the aggregate's own row.)
- **Consumers:** `audit-log` (`PlatformAuditLogHandler` → `LogDomainEventUseCase`, `platform` context) — a placeholder that only logs the envelope fields, added in M20-S16 purely to give the event a real Pub/Sub topic (see Outbox note below) and folded into the shared audit-log consumer by M23-S36. A real notification/webhook consumer to the manager is still the obvious fast-follow, still explicitly deferred — `docs/USE_CASES.md` UC-037–UC-043 Non-Goals.
- **Outbox note:** `LeadFormSubmission`'s repository joins the transactional-outbox pattern (`shared.outbox`, TD24-S02) to deliver this event — it drains `clearDomainEvents()` into the outbox exactly like the other event-emitting aggregates' repositories (see Transactional outbox below).

---

#### **TenantDeactivated** *(slice G — not implemented; today `Tenant.deactivate()` has no production caller)*
- **Trigger:** a tenant is deactivated; the emitter (for example an operator action in the offboarding flow, `plan/M17-CLOUD-DEPLOY.md` M17-S51) is decided at story discovery (UC-142)
- **State change:** `platform.tenants.is_active = false`
- **Data:**
  ```json
  { "reason": "string" }
  ```
- **Consumers:** Billing (`cancel-subscription-on-tenant-deactivation`) → cancels any open charge locally and at the provider, clears `cancelAt`, suspends the subscription as `CANCELED` and starts the clean-up clock; an `exempt` tenant is unchanged; `audit-log` (`PlatformAuditLogHandler`)

---

### **Billing Context Events** (Billing Context)

Ikaro charging its tenants (`docs/DOMAIN_MODEL.md` § Billing Context, `docs/USE_CASES.md` UC-110–UC-145). Ikaro sends **every** billing email itself (the provider's own customer notifications are switched off), so each event below has a Notification consumer. Billing emails are platform-level (`tenant_id IS NULL`) templates, sent *for* the event's tenant, and are exempt from the suspension gate (UC-124); an `exempt` tenant receives none. All events carry the standard envelope; each needs a line in `BillingAuditLogHandler` (`domain-event-audit-coverage`). All are written to the outbox in the same transaction as the state change that produced them.

#### **ChargeIssued**
- **Trigger:** the issue job (UC-113), the recovery issue on suspension, "Reativar assinatura" (UC-134), a plan-change re-issue (UC-136), an annual add-on (UC-145, slice H), or a provider-generated charge mirrored from the webhook (UC-143, slice F2) — **only after** the provider call succeeds (`provider_creation_status = READY`)
- **Data:** `chargeId`, `kind` (`PERIOD` | `RECOVERY` | `ADDON`), `dueDate`, `amountMinor`, `currency`, `paymentUrl`
- **Consumers:** Notification (invoice email); `audit-log`

#### **ChargePaid**
- **Trigger:** the first of the provider's paid signals for a charge (webhook, reconcile or on-demand refresh; UC-114)
- **Data:** `chargeId`, `amountMinor`, `currency`, `method` (`CARD` | `PIX` | `BOLETO`), `paidAt`
- **Consumers:** Notification (receipt); `audit-log`

#### **SubscriptionPastDue**
- **Trigger:** a `PERIOD` charge of an `ACTIVE` subscription went `OVERDUE` (status sweep, UC-115)
- **Data:** `subscriptionId`, `pastDueSince`, `suspendsAt`
- **Consumers:** Notification (dunning); `audit-log`

#### **SubscriptionSuspended**
- **Trigger:** the sweep (`NON_PAYMENT`, `CANCELED`), a full refund/lost chargeback (`PAYMENT_REVERSED`), an immediate cancel, or the operator (`OPERATOR`)
- **Data:** `subscriptionId`, `reason` (`NON_PAYMENT` | `CANCELED` | `PAYMENT_REVERSED` | `OPERATOR`), `suspendedAt`, `purgeAt`
- **Consumers:** Notification; hotsite revalidation (`IFrontendRevalidationPort.revalidate(slug)`); access-cache invalidation (best-effort, on the handling instance); `audit-log`

#### **SubscriptionReactivated**
- **Trigger:** a recovery charge was paid, an `exempt` flag was set on a suspended tenant, or an `OPERATOR` suspension was lifted (`unsuspend`)
- **Data:** `subscriptionId`, `reactivatedAt`
- **Consumers:** Notification; hotsite revalidation; access-cache invalidation; `audit-log`

#### **SubscriptionCancelled**
- **Trigger:** the manager cancels (UC-133), or a deactivated tenant is cancelled (UC-142)
- **Data:** `subscriptionId`, `cancelAt`, `immediate`
- **Consumers:** Notification (to the billing email, else all managers); `audit-log`

#### **PlanChanged**
- **Trigger:** the manager saves a plan (UC-136), switches cycle (UC-144, slice H) or adds an annual add-on (UC-145, slice H)
- **Data:** `subscriptionId`, `effectiveFrom`, `cycle`, `nextCycle?`, `nextCycleFrom?` *(slice H)*, `newTotalMinor` (total in the chosen cycle), `added[]`, `removed[]`
- **Consumers:** Notification (to the billing email); `audit-log`

#### **BillingReminderDue**
- **Trigger:** the daily reminders job (UC-139), once per milestone, deduped by `(subscription, kind, daysOffset, chargeId)`
- **Data:** `kind` (`PLAN_CONFIRMATION` | `TRIAL_ENDING` | `CHARGE_DUE_SOON` | `CHARGE_OVERDUE`), `daysOffset`, `chargeId?`, `paymentUrl?`
- **Consumers:** Notification (dunning email; the handler re-checks the charge is still open and skips otherwise)

#### **SubscriptionPriceChangeAnnounced**
- **Trigger:** the operator schedules a list-price change (UC-112). **One event per affected tenant per adjustment** (the envelope requires a `tenantId`, so a platform-wide change fans out per tenant); a tenant with five changed features gets one email
- **Data:** `changes[]` (`featureKey`, `tier`, `cycle`, `oldAmountMinor`, `newAmountMinor`) limited to the features this tenant actually has, `currency`, `effectiveFrom`, `firstAffectedDueDate`, `newMonthlyTotalMinor` (or the annual total), `batchId?`
- **Consumers:** Notification (to managers); `audit-log`

#### **TenantPurgeWarning**
- **Trigger:** the purge job at 30 and 7 days before the clean-up deadline (UC-132, slice G); deduped by `purge_warning_30_sent_at` / `purge_warning_7_sent_at`, cleared on reactivation
- **Data:** `subscriptionId`, `daysBefore` (30 or 7), `purgeAt`
- **Consumers:** Notification (to the manager; Billing template, exempt from the suspension gate); `audit-log`

#### **TenantPurgeRequested**
- **Trigger:** the clean-up deadline (`SUSPENSION_AGE`), the self-service discard of a never-paid tenant (`SELF_SERVICE_DISCARD`, UC-141) or an operator request (`OPERATOR_REQUEST`); creates a durable `TenantPurgeJob` first (slice G)
- **Data:** `purgeJobId`, `reason` (`tenantId` is the envelope's own field; participants echo `purgeJobId` in `TenantPurgeContextCompleted`)
- **Consumers:** every bounded context as a purge participant (each deletes its own data idempotently), storage cleanup, provider cancellation; `audit-log` (`BillingAuditLogHandler` records purge request/completion events as the purge coordinator)

#### **TenantPurgeContextCompleted**
- **Trigger:** a participant committed its local deletion (published after commit)
- **Data:** `purgeJobId`, `participant` (`BOOKING` | `CUSTOMER` | `STAFF` | `LOYALTY` | `NOTIFICATION` | `PLATFORM` | `BILLING` | `STORAGE` | `PROVIDER`), `completedAt`
- **Consumers:** Billing's purge coordinator, which records the completion; Platform deletes the tenant root only after every required step is recorded; `audit-log` (`BillingAuditLogHandler` records purge request/completion events as the purge coordinator, so a participant context needs no audit line of its own for it)

> **`BillingReminderDue` and the command precedent:** the booking reminders (`BookingReminderDue` …) are `domain/commands/` classes, not events. `BillingReminderDue` follows the same cron-published-trigger shape; whether it is declared as a command or an event class is settled at story discovery against that precedent — its name, payload and Notification consumer are fixed here.

---

## Event Publishing & Consumption

- **Transport:** technology-agnostic `IEventBus` port. Local dev: GCP Pub/Sub Emulator (Docker). Production: GCP Pub/Sub (managed). Swappable to SQS/Kafka via a new adapter — domain code never changes.
- **Delivery semantics:** at-least-once. **All consumers MUST be idempotent** (deduplicate by `eventId`).
- **Every domain event has an `audit-log` consumer (M23-S36).** Each context owns one thin `<Context>AuditLogHandler` (`BookingAuditLogHandler`, `LoyaltyAuditLogHandler`, `StaffAuditLogHandler`, `PlatformAuditLogHandler`, `BillingAuditLogHandler`) (each extends `AuditLogHandlerBase`, which owns the constructor, logger and `handle()`) that subscribes with `<Event>.name` and `LogDomainEventUseCase.CONSUMER_NAME` (`audit-log`) and calls the shared `LogDomainEventUseCase` (`src/shared/application/use-cases/`). It claims the `eventId` in `shared.inbox` and writes one log line with the envelope fields only (`eventId`, `eventName`, `tenantId`, `occurredAt`, `correlationId`) — never `data`, which can carry customer contact details. It is not a persisted audit trail. It is also what gives every event a real Pub/Sub topic, so a new `DomainEvent` class must be added to its context's handler: `architecture-check`'s `domain-event-audit-coverage` detector fails CI otherwise. Commands (`BookingReminderDue` and the other `domain/commands/` classes), `cron-*` triggers and `dead-letter` are not domain events and get no `audit-log` subscription. Other consumers (`notification`, loyalty, `availability-alert-matching`, …) subscribe separately and are unaffected.
- **Operational (non-business) consumers, by `CONSUMER_NAME`** (each is a thin handler that calls one use case or job; all are in the `*-trigger.handler.ts` / `*.handler.ts` files under the owning context's `infrastructure/events/`, found with `grep -rn "CONSUMER_NAME =" apps/backend/src`):
  - **Cron-topic triggers** (a Cloud Scheduler job publishes to a `cron-*` topic, see `infra/terraform/pubsub-catalog.json` and `docs/API_CONTRACTS.md` cron routes): Booking — `booking-reminder`, `booking-admin-schedule-reminder`, `booking-hold-expiry`, `recurring-schedule-approval-expiry`, `recurring-schedule-renewal-reminder`, `resource-occupancy-retention-purge`, `availability-alert-sweep`, `availability-alert-expiry`; Loyalty — `loyalty-expire-points`, `loyalty-notify-expiring-points`; Platform — `chatbot-retention-purge`, `chatbot-balance-poll`, `lead-form-retention-purge`; Billing *(planned)* — `billing-issue-charges`, `billing-status-sweep`, `billing-reminders`, `billing-reconcile`, `billing-self-heal`, `billing-provider-events-purge`, `billing-tenant-purge`; Shared — `outbox-relay`.
  - **Business-event reactions that are not in the per-event consumer lists above:** `cascade-staff-deactivation` (Booking, consumes `StaffDeactivated`), `create-initial-manager` (Staff, reacts to `TenantProvisioned`), `notification-template-seed` (Notification, `TenantProvisioned`), `create-trial-subscription` (Billing *(planned)*, `TenantProvisioned`).
  - **Dead-letter monitor:** `monitor` (`DeadLetterHandler`, Notification) logs every message that reaches a dead-letter topic; the operator procedure is `docs/RUNBOOKS.md` § A message landed in a dead-letter topic.
- **Ordering:** not guaranteed across events. Consumers MUST tolerate out-of-order delivery (e.g. `BookingCompleted` arriving before `BookingApproved` should be rejected with a retry, not crash).
- **Transactional outbox (`shared.outbox` + relay, TD24):** event publication for aggregate-driven events is transactional with the state change that produced it — the 7 event-emitting aggregates' repositories (`Booking`, `RecurringBookingSchedule`, `AvailabilityAlert`, `FutureCommitmentException`, `Staff`, `Tenant`, `LeadFormSubmission`) drain `clearDomainEvents()` into `shared.outbox` inside the same transaction as the business write (TD24-S02). A relay then delivers each row via Pub/Sub — inline immediately after commit on the happy path, with a scheduled sweep (`SKIP LOCKED`, every 5 min) as the durability guarantee if the inline attempt fails or the process crashes between commit and publish. End-to-end guarantee: **at-least-once delivery, exactly-once effect for idempotency-safe consumers** — dedup at both edges (`dedup_key` producer-side via `UNIQUE` + `ON CONFLICT DO NOTHING`, `eventId` consumer-side via `shared.inbox`). One documented exception: notification's multi-recipient dispatch can still resend to already-successful recipients after a partial batch failure (`td/TD08-AUDIT-REMEDIATION-BACKLOG.md` AUD-004 item 3, open). The 5 cron-published `Command` classes (`BookingReminderDue`, `BookingReminderDueToday`, `AdminDailyScheduleReminder`, `PointsExpiringSoon`, `RecurringScheduleRenewalDue`) publish through `OUTBOX_PUBLISHER` too, wrapped in a per-tenant-batch transaction (TD24-S03) — every publish site in the system goes through the same durable path now. See `docs/DATABASE_SCHEMA.md` § Event Publishing for the full design, its `Schema: shared` section for the table shapes, and `docs/ENGINEERING_RULES_BACKEND.md` § Aggregate domain events → outbox (repo auto-flush) for the repository auto-flush rule.

---

## Event Versioning

Add fields freely (consumers ignore unknown fields) — this is the repo practice, e.g. `TenantProvisioned` is planned to gain `countryCode` and `billingHint` for Billing without a new version (not in code yet). A breaking change (a renamed or removed field) bumps `eventVersion` **for documentation only**:

```
BookingRequested.v1 → BookingRequested.v2  (e.g. renamed or removed field)
```

**The bus never reads `eventVersion`.** Routing is by `eventName` alone: `IEventBus.subscribe(eventName, handler, consumerName)` has no version parameter, so there is no per-version subscription and no fan-out to consumer versions. A consumer must therefore tolerate both the old and the new payload shape during a rolling deploy (old and new code run side by side, and in-flight outbox rows keep their stored payload) — e.g. Billing's `TenantProvisioned` handler skips a legacy payload without `countryCode` and lets a self-heal job repair it. A genuinely incompatible change means publishing a differently named event.

# Domain Events - Ikaro

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
      neighborhood: string, city: string, state: string, zipCode: string
    } | null
    scheduledAt:       ISO8601                                // start of the slot
    totalDurationMins: number                                 // SUM(lines.durationMinsAtBooking)
    totalPrice:        { amount: number, currency: string }   // SUM(lines.priceAtBooking)
    requiresPickup:    boolean                                // true if any line has requiresPickupAddressAtBooking=true
    pickupAddress: {                                          // non-null when requiresPickup=true
      street: string, number: string, complement: string | null,
      neighborhood: string, city: string, state: string, zipCode: string
    } | null
    lines: [                                                   // ≥ 1
      {
        lineId:                          string
        serviceId:                       string
        serviceNameAtBooking:            string               // point-in-time name; may differ from current Service.name
        priceAtBooking:                  { amount: number, currency: string }
        durationMinsAtBooking:           number
        pointsValueAtBooking:            number
        requiresPickupAddressAtBooking:  boolean
      }
    ]
    beforeServicePhotoUrls: string[]                           // 0..n; tenant-prefixed storage paths
  }
  ```
- **Consumers:**
  - **Notification Context** → admin email: subject `"Nova solicitação de agendamento — [service names joined by ', ']"`; body includes customer name, date/time, services, total price formatted as `R$ 1.234,56`
  - **Notification Context** → customer/guest email: subject `"Seu agendamento foi recebido"`; body includes booking details + "aguarde aprovação"

> Loyalty Context does NOT consume this event. Loyalty only reacts to `BookingCompleted` — points are awarded after the visit, not on request or approval.

---

#### **BookingApproved**
- **Trigger:** Admin approves a booking that is in `PENDING` or `INFO_REQUESTED`
- **State change:** `PENDING | INFO_REQUESTED` → `APPROVED`. After this, the line collection is frozen.
- **Data:**
  ```
  {
    bookingId:           string
    customerId:          string | null
    contactEmail:          string
    contactName:           string
    approvedSlot:        { startTime: ISO8601, endTime: ISO8601 }   // = [scheduledAt, scheduledAt + totalDurationMins)
    totalPrice:          { amount: number, currency: string }
    lineSummary: [                                                   // ≥ 1
      {
        serviceId:            string
        serviceNameAtBooking: string               // point-in-time name for email display
        priceAtBooking:       { amount: number, currency: string }
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
      neighborhood: string, city: string, state: string, zipCode: string
    } | null
    totalPrice:              { amount: number, currency: string }   // quoted total (sum of priceAtBooking)
    totalActualPrice:        { amount: number, currency: string }   // charged total (sum of actualPriceCharged)
    lines: [                                // ≥ 1 — the full set of completed lines
      {
        lineId:               string
        serviceId:            string
        priceAtBooking:       { amount: number, currency: string }  // quoted price for this line
        actualPriceCharged:   { amount: number, currency: string }  // what was actually charged (may differ)
        pointsValueAtBooking: number        // becomes the resulting LoyaltyEntry.points (unaffected by price)
      }
    ]
    discountByPoints: {                     // present only when a loyalty discount was applied (UC-009 A6)
      pointsUsed:     number
      amountDeducted: { amount: number, currency: string }
    } | null
  }
  ```
- **Consumers:**
  - **Notification Context** → email to customer summarising all services completed, showing both quoted and actual prices where they differ, plus total points earned.
  - **Loyalty Context** → if `customerId != null`, iterate `lines`: insert one `LoyaltyEntry` per line using `pointsValueAtBooking` (loyalty is **not** affected by `actualPriceCharged`); increment `LoyaltyBalance.current_points` by the total points across all lines; publish one `ServicePointsEarned` event containing the earned lines summary. If `discountByPoints` is present: also decrement `LoyaltyBalance.current_points` by `pointsUsed` and record a `LoyaltyRedemption` linked to `bookingId`. Earning and redemption commit together in a single transaction, deduplicated via one `shared.inbox` row keyed on `(eventId, consumerName)`.

---

#### **BookingCancelled**
- **Trigger:** Customer cancels (UC-007) or admin cancels (UC-008) a booking that is in `PENDING`, `INFO_REQUESTED`, or `APPROVED`
- **State change:** `PENDING | INFO_REQUESTED | APPROVED` → `CANCELLED`
- **Data:**
  ```
  {
    bookingId:        string
    customerId:       string | null
    contactEmail:       string
    contactName:        string
    cancelledBy:      string          // customer id, guest email, or staff id
    isBusiness:       boolean         // true = admin/business cancelled, false = customer cancelled
    reason:           string | null
    scheduledAt:      ISO8601         // the appointment time that was cancelled
    lineSummary: [
      {
        serviceId:            string
        serviceNameAtBooking: string
        priceAtBooking:       { amount: number, currency: string }
      }
    ]
    totalPrice:       { amount: number, currency: string }
  }
  ```
- **Consumers:**
  - **Notification Context** → email to customer: `"Seu agendamento foi cancelado"` — booking details (date/time, services, total)
  - **Notification Context** → email to admin: `"Agendamento cancelado"` — who cancelled, reason if provided, booking summary

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
    rescheduledBy:     string    // staff id
    adminNotes:        string | null
    lineSummary: [
      {
        serviceId:            string
        serviceNameAtBooking: string
        priceAtBooking:       { amount: number, currency: string }
      }
    ]
    totalPrice:        { amount: number, currency: string }
  }
  ```
- **Consumers:**
  - **Notification Context** → email to customer/guest: `"Seu agendamento foi reagendado"` — old date/time, new date/time, services, total
  - **Notification Context** → email to admin: `"Agendamento reagendado"` — booking summary with old and new slot

> Loyalty Context does NOT consume this event — loyalty is unaffected by rescheduling.

> **Extended by M21 Cluster 3 (UC-069):** a customer-initiated reschedule (not just admin, UC-044) now goes through the same event — the trigger widens to include the customer's own "Reagendar" action, resource/bundle/leg re-validation is atomic before the original resource is released, and a `booking_quote_revisions` row is recorded when the reschedule changes the price (e.g. a variable-duration service). No new event type was introduced — this is a scope extension of the existing envelope, not a new candidate event.

---

#### **BookingReminderDue**
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

#### **BookingReminderDueToday**
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

#### **AdminDailyScheduleReminder**
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

#### **ResourceReactivated**

> Introduced by M21 — Multi-Vertical Scheduling, Cluster 1 (Foundation).

- **Trigger:** Manager reactivates a previously deactivated `Resource` (UC-049)
- **State change:** `Resource.isActive → true`
- **Data:**
  ```
  {
    resourceId:           string
    resourceType:         "LOCATION" | "STAFF" | "ROOM" | "EQUIPMENT"
    reactivatedByStaffId: string
  }
  ```
- **Consumers:** None in MVP

---

> **M21 — Multi-Vertical Scheduling, Cluster 3 (Customer/guest appointment booking + extensions).** The events below are new Booking Context events for `RecurringBookingSchedule`, `AvailabilityAlert`, `FutureCommitmentException`, tenant-preset bootstrap, and appointment no-show.

#### **RecurringBookingScheduleCreated**
- **Trigger:** UC-070 confirms a recurring pattern on an `AUTO_CONFIRM` service, or UC-071 approves a `PENDING_APPROVAL` request on a `MANUAL_APPROVAL` service.
- **State change:** `RecurringBookingSchedule.status → ACTIVE`; generation begins.
- **Data:** `{ recurringScheduleId, customerId, serviceId, resourceIds: string[], assignmentPolicy, recurrence, startsOn }`
- **Consumers:** Notification Context → confirmation email.

#### **RecurringBookingScheduleApprovalRequested**
- **Trigger:** UC-070 confirms a recurring pattern on a `MANUAL_APPROVAL` service.
- **State change:** `RecurringBookingSchedule` created `PENDING_APPROVAL`, `approvalHoldExpiresAt` set. No occurrences generated.
- **Data:** `{ recurringScheduleId, customerId, serviceId, resourceIds, assignmentPolicy, recurrence, startsOn, approvalHoldExpiresAt }`
- **Consumers:** Notification Context → alerts staff, same role `BookingRequested` plays for a manual-approval appointment.

#### **RecurringBookingScheduleRejected**
- **Trigger:** UC-071 (staff rejects) or its hold-expiry worker (unresolved past `approvalHoldExpiresAt`).
- **State change:** `RecurringBookingSchedule.status → CANCELLED`, `cancellationReason = APPROVAL_REJECTED | APPROVAL_EXPIRED`.
- **Data:** `{ recurringScheduleId, customerId, serviceId, reason }`
- **Consumers:** Notification Context → customer email.

#### **RecurringBookingSchedulePaused**
- **Trigger:** UC-045 A2 (customer pauses).
- **State change:** `status → PAUSED`; no further occurrences generated until resumed.
- **Data:** `{ recurringScheduleId, customerId, serviceId }`
- **Consumers:** None in MVP.

#### **RecurringBookingScheduleEnded**
- **Trigger:** UC-045 A2 (customer ends entirely).
- **State change:** `status → CANCELLED`; future materialized occurrences cancelled, releasing their `resource_occupancy` rows.
- **Data:** `{ recurringScheduleId, customerId, serviceId, cancelledBookingIds: string[] }`
- **Consumers:** Notification Context → customer email.

#### **AvailabilityAlertCreated**
- **Trigger:** UC-072.
- **State change:** `availability_alerts` row created, `status = ACTIVE`.
- **Data:** `{ alertId, customerId, serviceId, criteriaType, expiresAt }`
- **Consumers:** None in MVP.

#### **AvailabilityAlertUpdated**
- **Trigger:** UC-076/UC-053 (customer edits criteria or expiry).
- **Data:** `{ alertId, customerId, serviceId }`
- **Consumers:** None in MVP.

#### **AvailabilityAlertCancelled**
- **Trigger:** UC-072 A2 (withdraws before a match) or UC-076/UC-053 (explicit cancel).
- **State change:** `status → CANCELLED`.
- **Data:** `{ alertId, customerId, serviceId }`
- **Consumers:** None in MVP.

#### **AvailabilityAlertExpired**
- **Trigger:** System — `expiresAt` passed with no match.
- **State change:** `status → EXPIRED`.
- **Data:** `{ alertId, customerId, serviceId }`
- **Consumers:** None in MVP.

#### **AvailabilityAlertMatched**
- **Trigger:** UC-072 step 3 — a released slot matches an `ACTIVE` alert's criteria.
- **State change:** `status → NOTIFIED`; one `availability_alert_notification_attempts` row inserted for the matching window.
- **Data:** `{ alertId, customerId, serviceId, matchingWindowStart, matchingWindowEnd, resourceId: string | null }`
- **Consumers:** Notification Context → deduplicated email/in-app message.

#### **FutureCommitmentExceptionRaised**
- **Trigger:** UC-073 — a resource/hours/template/schedule change affects a future commitment nobody explicitly reviewed per-session (excludes a manager-initiated range cancellation, Cluster 4, whose own step is already the explicit resolution).
- **State change:** `future_commitment_exceptions` row created, `status = OPEN`.
- **Data:** `{ exceptionId, sourceType, sourceId, affectedType, affectedId, ownerStaffId: string | null }`
- **Consumers:** Notification Context → alerts the owning manager.

#### **FutureCommitmentExceptionResolved**
- **Trigger:** UC-077 (manager keeps, reassigns, reschedules, or cancels).
- **State change:** `status → RESOLVED`.
- **Data:** `{ exceptionId, resolutionType, resolvedByStaffId, affectedType, affectedId }`
- **Consumers:** Notification Context → customer email (the resulting booking/session change's own event carries the customer-facing detail; this one is the manager-side audit trail).

#### **FutureCommitmentExceptionDismissed**
- **Trigger:** UC-077 A2 (manager dismisses a genuinely resolved/non-impacting item).
- **State change:** `status → DISMISSED`.
- **Data:** `{ exceptionId, resolvedByStaffId, resolutionReason }`
- **Consumers:** None in MVP.

#### **TenantSchedulingBootstrapped**
- **Trigger:** UC-075 (preset bootstrap commits).
- **State change:** Tenant's initial `Resource`/`Service` graph created in one transaction (SESSION-preset templates arrive once Cluster 4 ships).
- **Data:** `{ tenantId, presetId, serviceIds: string[], resourceIds: string[] }`
- **Consumers:** None in MVP.

#### **BookingNoShow**
- **Trigger:** UC-074 — after an appointment's scheduled end time.
- **State change:** `Booking.status → NO_SHOW` (new terminal state).
- **Data:** `{ bookingId, actorId, reason, occurredAt }` (`tenantId`/`correlationId` are envelope fields)
- **Consumers:** Notification Context → retryable customer email. Loyalty does **not** award completion points for this event.

---

> **M21 — Multi-Vertical Scheduling, Cluster 4 (Classes/Sessions).** `ClassSession` and `ClassSessionBooking` are full `AggregateRoot`s whose events are drained through the transactional outbox, matching the existing `Booking` pattern — delivery failure never rolls back the committed booking state.

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
- **Trigger:** Loyalty Context inserted a `LoyaltyEntry` after consuming `BookingCompleted`. One event is published **per inserted entry** — a booking with 3 lines produces 3 `ServicePointsEarned` events. **Extended by M21 Cluster 4:** also fires after consuming `ClassSessionBookingCompleted` — exactly one event per class-session completion (no "lines" concept for that family; `loyalty_entries.class_session_booking_id` is set instead of `booking_id`/`booking_line_id`, per `CHK_loyalty_entries_source_exclusive`, `docs/13-DATABASE_SCHEMA.md`).
- **State change:** new row in `loyalty_entries` + `loyalty_balances.current_points` incremented. Both writes are in one transaction. Idempotent against replay via `shared.inbox` (early-exit) + `UNIQUE(tenant_id, booking_line_id)` (appointment) or `UNIQUE(tenant_id, class_session_booking_id)` (class, M21 Cluster 4) as the hard guard on the entry insert.
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
- **Design note:** One `ServicePointsEarned` is published per **booking** (not per line) so the customer receives a single thank-you email summarising all services completed in that booking. The `LoyaltyEntry` rows are still one per line; the event is assembled in `RecordLoyaltyEntriesUseCase` after all entries are saved.
- **Consumers:**
  - **Notification Context** → sends one thank-you email per booking. Uses `INotificationCustomerPort` to resolve `customerId → email/name` and `INotificationServicePort.findServicesByIds()` to resolve all service names in a single query.

---

#### **PointsExpiringSoon**
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
BookingCompleted ───► Notification (customer "thanks" — summary of all services)
                 └──► Loyalty (if customerId != null:
                                  insert ONE LoyaltyEntry PER LINE
                                  publish ONE ServicePointsEarned PER LINE)
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
- **State change:** A new `Staff` row is created with `isActive = false` (pending first login via Google OAuth)
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
  - **Booking Context** (UC-048, added M21 Cluster 1) → cascades to the wrapping `STAFF`-type `Resource`: `isActive = false` for new scheduling, any active class-schedule-template bundle containing it ends for future generation. First real consumer of this event — sessions themselves still expire naturally via JWT TTL, independent of this.

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
- **Consumers:** None in MVP

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
    "timezone":    "America/Sao_Paulo"
  }
  ```
  (`tenantId` is the envelope's own field — the constructor's first argument — not part of `data`.)
- **Consumers:**
  - Staff context (M04-S06) → creates first MANAGER `Staff` row (`isActive=false`) + publishes `StaffInvited`
- **Design note:** `invitedBy` in the downstream `StaffInvited` event is set to `SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'` because no human actor exists yet at provisioning time.

---

#### **LeadFormSubmissionReceived**
- **Trigger:** A visitor (guest or logged-in customer) submits the `LEAD_FORM` hotsite module's public form (`docs/04-USE_CASES.md` UC-039/UC-040)
- **State change:** `platform.lead_form_submissions` row created
- **Data:**
  ```json
  {
    "submissionId": "uuid-v7",
    "customerId":   "uuid-v7 | null"
  }
  ```
  (`tenantId`/`eventId`/`occurredAt`/`correlationId` are the envelope's own fields, not part of `data`. Deliberately thin — the submitted content itself, e.g. name/email/answers, is never carried in the event payload, matching how other PII-bearing events in this codebase keep bulk content out of the envelope and readable only via the aggregate's own row.)
- **Consumers:** `audit-log` (`LeadFormSubmissionReceivedHandler` → `LogLeadFormSubmissionReceivedUseCase`, `platform` context) — a placeholder that only logs the fields above, added in M20-S16 purely to give the event a real Pub/Sub topic (see Outbox note below). A real notification/webhook consumer to the manager is still the obvious fast-follow, still explicitly deferred — `docs/discovery/lead-form-module/lead-form-module.md` §9 Non-Goals.
- **Outbox note:** `LeadFormSubmission`'s repository joins the transactional-outbox pattern (`shared.outbox`, TD24-S02) to deliver this event — the 4th aggregate repository (alongside `Booking`/`Staff`/`Tenant`) to drain `clearDomainEvents()` into the outbox, following the exact same pattern.

---

## Event Publishing & Consumption

- **Transport:** technology-agnostic `IEventBus` port. Local dev: GCP Pub/Sub Emulator (Docker). Production: GCP Pub/Sub (managed). Swappable to SQS/Kafka via a new adapter — domain code never changes.
- **Delivery semantics:** at-least-once. **All consumers MUST be idempotent** (deduplicate by `eventId`).
- **Ordering:** not guaranteed across events. Consumers MUST tolerate out-of-order delivery (e.g. `BookingCompleted` arriving before `BookingApproved` should be rejected with a retry, not crash).
- **Transactional outbox (`shared.outbox` + relay, TD24):** event publication for aggregate-driven events is transactional with the state change that produced it — the 4 event-emitting aggregates' repositories (`Booking`, `Staff`, `Tenant`, `LeadFormSubmission`) drain `clearDomainEvents()` into `shared.outbox` inside the same transaction as the business write (TD24-S02). A relay then delivers each row via Pub/Sub — inline immediately after commit on the happy path, with a scheduled sweep (`SKIP LOCKED`, every 5 min) as the durability guarantee if the inline attempt fails or the process crashes between commit and publish. End-to-end guarantee: **at-least-once delivery, exactly-once effect for idempotency-safe consumers** — dedup at both edges (`dedup_key` producer-side via `UNIQUE` + `ON CONFLICT DO NOTHING`, `eventId` consumer-side via `shared.inbox`). One documented exception: notification's multi-recipient dispatch can still resend to already-successful recipients after a partial batch failure (`td/TD08-AUDIT-REMEDIATION-BACKLOG.md` AUD-004 item 3, open). The 4 cron-published `Command` classes (`BookingReminderDue`, `BookingReminderDueToday`, `AdminDailyScheduleReminder`, `PointsExpiringSoon`) publish through `OUTBOX_PUBLISHER` too, wrapped in a per-tenant-batch transaction (TD24-S03) — every publish site in the system goes through the same durable path now. See `td/TD24-OUTBOX-INBOX-PATTERN.md` for the full design and `docs/13-DATABASE_SCHEMA.md`'s `Schema: shared` section for the table shapes.

---

## Event Versioning

Add fields freely (consumers ignore unknown fields). Breaking changes require bumping `eventVersion`:

```
BookingRequested.v1 → BookingRequested.v2  (e.g. renamed or removed field)
```

Consumers subscribe to specific `eventName` + `eventVersion`. Publishers emit the highest version they support; the bus may fan-out to multiple consumer versions if needed during a migration.

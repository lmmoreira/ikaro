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

### **Loyalty Events** (Loyalty Context)

#### **ServicePointsEarned**
- **Trigger:** Loyalty Context inserted a `LoyaltyEntry` after consuming `BookingCompleted`. One event is published **per inserted entry** — a booking with 3 lines produces 3 `ServicePointsEarned` events.
- **State change:** new row in `loyalty_entries` + `loyalty_balances.current_points` incremented. Both writes are in one transaction. Idempotent against replay via `shared.inbox` (early-exit) + `UNIQUE(tenant_id, booking_line_id)` (hard guard on the entry insert).
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

#### **EmailSent**
- **Trigger:** Outbound email successfully accepted by SES/SendGrid
- **State change:** `notification_logs.status = SENT`
- **Data:**
  ```
  {
    notificationLogId: string
    templateName:      string
    recipient:         string
    subject:           string
    sentAt:            ISO8601
  }
  ```
- **Consumers:**
  - Audit / dashboard

---

#### **EmailFailed**
- **Trigger:** Outbound email failed after the configured retries
- **State change:** `notification_logs.status = FAILED`
- **Data:**
  ```
  {
    notificationLogId: string
    templateName:      string
    recipient:         string
    subject:           string
    errorMessage:      string
    retryCount:        number
  }
  ```
- **Consumers:**
  - Retry queue (further attempts, with backoff)
  - Ops alerting (if critical)

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
    "staffId":      "uuid",
    "tenantId":     "uuid",
    "email":        "invited@example.com",
    "role":         "MANAGER | STAFF",
    "invitedBy":    "uuid"
  }
  ```
- **`invitedBy` values:**
  - Normal invite (UC-028): UUID of the MANAGER who sent the invite
  - Tenant provisioning (UC-024 → M04-S06): `SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'`
- **Consumers:** Notification Context → sends invitation email with login link (email template must handle `invitedBy = SYSTEM_ACTOR_ID` gracefully — omit the "invited by [name]" line or show "Ikaro Platform")

#### **StaffDeactivated**
- **Trigger:** MANAGER-role staff member deactivates a team member (UC-029)
- **State change:** `staff.isActive` set to `false`; active sessions invalidated at next JWT check
- **Data:**
  ```json
  {
    "staffId":         "uuid",
    "tenantId":        "uuid",
    "deactivatedBy":   "uuid"
  }
  ```
- **Consumers:** None in MVP (sessions expire naturally via JWT TTL)

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
    "tenantId":    "uuid-v7",
    "name":        "string",
    "slug":        "string",
    "adminEmail":  "string",
    "timezone":    "America/Sao_Paulo"
  }
  ```
- **Consumers:**
  - Staff context (M04-S06) → creates first MANAGER `Staff` row (`isActive=false`) + publishes `StaffInvited`
- **Design note:** `invitedBy` in the downstream `StaffInvited` event is set to `SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'` because no human actor exists yet at provisioning time.

---

## Event Publishing & Consumption

- **Transport:** technology-agnostic `IEventBus` port. Local dev: GCP Pub/Sub Emulator (Docker). Production: GCP Pub/Sub (managed). Swappable to SQS/Kafka via a new adapter — domain code never changes.
- **Delivery semantics:** at-least-once. **All consumers MUST be idempotent** (deduplicate by `eventId`).
- **Ordering:** not guaranteed across events. Consumers MUST tolerate out-of-order delivery (e.g. `BookingCompleted` arriving before `BookingApproved` should be rejected with a retry, not crash).
- **Transactional outbox (`shared.outbox` + relay, TD24):** event publication for aggregate-driven events is transactional with the state change that produced it — the 3 event-emitting aggregates' repositories (`Booking`, `Staff`, `Tenant`) drain `clearDomainEvents()` into `shared.outbox` inside the same transaction as the business write (TD24-S02). A relay then delivers each row via Pub/Sub — inline immediately after commit on the happy path, with a scheduled sweep (`SKIP LOCKED`, every 5 min) as the durability guarantee if the inline attempt fails or the process crashes between commit and publish. End-to-end guarantee: **at-least-once delivery, exactly-once effect** — dedup at both edges (`dedup_key` producer-side via `UNIQUE` + `ON CONFLICT DO NOTHING`, `eventId` consumer-side). The 4 cron-published `Command` classes (`BookingReminderDue`, `BookingReminderDueToday`, `AdminDailyScheduleReminder`, `PointsExpiringSoon`) publish through `OUTBOX_PUBLISHER` too, wrapped in a per-tenant-batch transaction (TD24-S03) — every publish site in the system goes through the same durable path now. See `td/TD24-OUTBOX-INBOX-PATTERN.md` for the full design and `docs/13-DATABASE_SCHEMA.md`'s `Schema: shared` section for the table shapes.

---

## Event Versioning

Add fields freely (consumers ignore unknown fields). Breaking changes require bumping `eventVersion`:

```
BookingRequested.v1 → BookingRequested.v2  (e.g. renamed or removed field)
```

Consumers subscribe to specific `eventName` + `eventVersion`. Publishers emit the highest version they support; the bus may fan-out to multiple consumer versions if needed during a migration.

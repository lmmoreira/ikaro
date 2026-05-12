# Domain Events - BeloAuto

Domain events represent things that happened in the business. Other bounded contexts subscribe asynchronously through the event bus and react.

---

## Standard Envelope (mandatory on every event)

Every event — Booking, Loyalty, Notification, or any future event — is published with the following envelope. The per-event "Data" blocks below describe **only** the `data` field; the envelope is implicit and always present.

```json
{
  "eventId":       "uuid-v4",
  "tenantId":      "uuid-v4",
  "occurredAt":    "2026-05-11T14:23:45.123Z",
  "correlationId": "uuid-v4",
  "eventName":     "BookingApproved",
  "eventVersion":  1,
  "data":          { /* per-event payload, see below */ }
}
```

| Field | Why | Rules |
|---|---|---|
| `eventId` | Idempotency key for consumers (at-least-once delivery) | UUID v4; unique per publication |
| `tenantId` | Tenant isolation | UUID; consumers MUST filter on this |
| `occurredAt` | Business time the event happened | ISO-8601 UTC, millisecond precision |
| `correlationId` | Trace a chain of events back to one originating request | UUID v4; inherited across the chain |
| `eventName` | Routing & logging | PascalCase, matches the canonical name in this file |
| `eventVersion` | Schema evolution | Integer; bump on breaking change (see §"Event Versioning") |
| `data` | The payload below | Object; field names in camelCase |

> **Multi-tenancy:** `tenantId` in the envelope is the authoritative tenant scope. The Notification Context running for Tenant A MUST discard any event whose envelope `tenantId` does not match Tenant A. Same rule for every other context.

> **Idempotency:** Consumers MUST persist `eventId` (e.g. in a `processed_events(eventId, consumerName)` table with `UNIQUE(eventId, consumerName)`) and skip on duplicate.

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
    guestEmail:        string
    guestName:         string
    guestPhone:        string
    scheduledAt:       ISO8601                                // start of the slot
    totalDurationMins: number                                 // SUM(lines.durationMinsAtBooking)
    totalPrice:        { amount: number, currency: string }   // SUM(lines.priceAtBooking)
    lines: [                                                   // ≥ 1
      {
        lineId:                  string
        serviceId:               string
        priceAtBooking:          { amount: number, currency: string }
        durationMinsAtBooking:   number
        pointsValueAtBooking:    number
      }
    ]
    carPhotoUrls:      string[]                                // 0..n; tenant-prefixed storage paths
  }
  ```
- **Consumers:**
  - **Notification Context** → email to admin: "New booking request from [name]"
  - **Notification Context** → email to guest: "Your booking request is pending"

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
    guestEmail:          string
    guestName:           string
    approvedSlot:        { startTime: ISO8601, endTime: ISO8601 }   // = [scheduledAt, scheduledAt + totalDurationMins)
    totalPrice:          { amount: number, currency: string }
    lineSummary: [                                                   // ≥ 1
      { serviceId: string, priceAtBooking: { amount, currency } }
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
    guestEmail:   string
    guestName:    string
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
    guestEmail:          string
    guestName:           string
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
    infoPayload:      object          // free-form, validated server-side; may contain
                                      // notes, additional photoUrls[], updated phone, etc.
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
    guestEmail:              string
    guestName:               string
    completedSlot:           { startTime: ISO8601, endTime: ISO8601 }
    completedBy:             string         // staff id
    afterServicePhotoUrls:   string[]       // 0..n; tenant-prefixed storage paths
    adminNotes:              string | null
    lines: [                                // ≥ 1 — the full set of completed lines
      {
        lineId:               string
        serviceId:            string
        pointsValueAtBooking: number        // becomes the resulting LoyaltyEntry.points
      }
    ]
  }
  ```
- **Consumers:**
  - **Notification Context** → email to customer summarising all services completed and total points earned.
  - **Loyalty Context** → if `customerId != null`, iterate `lines`: insert one `LoyaltyEntry` per line (idempotent on `(tenant_id, booking_line_id)`); publish one `ServicePointsEarned` per inserted line.

---

#### **BookingCancelled**
- **Trigger:** Customer cancels (UC-007) or admin cancels (UC-008) a booking that is in `PENDING`, `INFO_REQUESTED`, or `APPROVED`
- **State change:** `PENDING | INFO_REQUESTED | APPROVED` → `CANCELLED`
- **Data:**
  ```
  {
    bookingId:        string
    customerId:       string | null
    guestEmail:       string
    guestName:        string
    cancelledBy:      string          // customer id, guest email, or staff id
    isBusiness:       boolean         // true = admin/business cancelled, false = customer cancelled
    reason:           string | null
  }
  ```
- **Consumers:**
  - **Notification Context** → email to customer: "Your booking has been cancelled"
  - **Notification Context** → email to admin: "Booking [id] cancelled by [actor]"

> Loyalty Context does NOT consume this event. A booking cannot reach `COMPLETED` and then be cancelled (the state machine forbids it), so no `LoyaltyEntry` rows are ever affected by a cancellation. The previous "audit-only" subscription has been removed.

---

#### **BookingReminderSentCustomer**
- **Trigger:** Scheduled cron job (06:00 tenant-local) finds APPROVED bookings whose appointment is **tomorrow**
- **State change:** none (booking stays APPROVED)
- **Data:**
  ```
  {
    bookingId:        string
    customerId:       string | null
    recipientEmail:   string
    customerName:     string
    serviceId:        string
    appointmentSlot:  { startTime: ISO8601, endTime: ISO8601 }
  }
  ```
- **Consumers:**
  - **Notification Context** → already sent the email; this event is the audit record

---

#### **BookingReminderSentCustomerDay**
- **Trigger:** Scheduled cron job (06:00 tenant-local) finds APPROVED bookings whose appointment is **today**
- **State change:** none
- **Data:**
  ```
  {
    bookingId:        string
    customerId:       string | null
    recipientEmail:   string
    customerName:     string
    serviceId:        string
    appointmentSlot:  { startTime: ISO8601, endTime: ISO8601 }
  }
  ```
- **Consumers:**
  - **Notification Context** → audit record

---

#### **AdminDailyScheduleReminder**
- **Trigger:** Scheduled cron job (06:00 tenant-local) builds the day's schedule digest for each active staff member
- **State change:** none
- **Data:**
  ```
  {
    staffId:           string
    staffEmail:        string
    bookingsToday:     [
      {
        bookingId:         string
        customerName:      string
        customerPhone:     string
        serviceId:         string
        serviceName:       string
        appointmentSlot:   { startTime: ISO8601, endTime: ISO8601 }
        adminNotes:        string | null
      }
    ]
    totalBookingsToday: number
  }
  ```
- **Consumers:**
  - **Notification Context** → digest email to admin

---

### **Loyalty Events** (Loyalty Context)

#### **ServicePointsEarned**
- **Trigger:** Loyalty Context inserted a `LoyaltyEntry` after consuming `BookingCompleted`. One event is published **per inserted entry** — a booking with 3 lines produces 3 `ServicePointsEarned` events.
- **State change:** new row in `loyalty_entries`. Idempotent against replay via `UNIQUE(tenant_id, booking_line_id)`.
- **Data:**
  ```
  {
    entryId:          string
    customerId:       string
    bookingId:        string
    bookingLineId:    string       // which line earned these points
    serviceId:        string
    pointsEarned:     number       // positive
    earnedAt:         ISO8601
    expiresAt:        ISO8601      // earnedAt + tenants.settings.loyalty_expiry_days
    totalActiveAfter: number       // customer's total active balance after this insert
  }
  ```
- **Consumers:**
  - **Notification Context** → may aggregate per-booking before sending (e.g. one email per completed booking summarising all per-line points, rather than N separate emails).

---

#### **PointsExpiringSoon**
- **Trigger:** Weekly cron (Mondays 06:00 tenant-local) finds customers who have one or more `LoyaltyEntry` rows whose `expires_at` falls within the **next 7 days**.
- **Direction:** Forward-looking — this is a heads-up, not a post-mortem. Once `expires_at` actually passes, the entry silently stops contributing to the active balance (no event, no row write — see `loyalty_entries` rules).
- **Aggregation:** One event per `(customer, service)` pair so the notification can group neatly per service.
- **State change:** None — the cron does not write any DB rows. It only computes and publishes.
- **Data:**
  ```
  {
    customerId:           string
    serviceId:            string
    pointsExpiringSoon:   number    // sum of `points` from entries with expires_at in [now, now + 7 days)
    earliestExpiresAt:    ISO8601   // the soonest expires_at among those entries
    activeTotal:          number    // customer's current active total (across all services)
  }
  ```
- **Consumers:**
  - **Notification Context** → may aggregate per customer before sending a single weekly email: "Heads up — [X] points on [service] will expire on [earliestExpiresAt]. Book a wash to keep earning."

> **No `PointsExpired` event.** With balance computed at query time, the moment a point actually expires is silent — it simply stops appearing in `SUM(...) WHERE expires_at > now()`. The customer is given advance notice via `PointsExpiringSoon`; once the day passes, no further notification is sent.

> **No `PointsRedeemed` event.** The MVP loyalty model is earn-only — points can only leave the active balance by expiring. Rewards / gifts are decided by the admin out-of-band and not tracked here.

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
  (now + tenants.settings.cancellation_window_hours ≤ appointment ?)
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

### **Platform Context Events**

#### **StaffInvited**
- **Trigger:** MANAGER-role staff member invites a new team member (UC-025)
- **State change:** A new `Staff` row is created with `isActive = false` (pending first login via Google OAuth)
- **Data:**
  ```json
  {
    "staffId":      "uuid",
    "tenantId":     "uuid",
    "email":        "invited@example.com",
    "firstName":    "string",
    "lastName":     "string",
    "role":         "MANAGER | STAFF",
    "invitedBy":    "uuid"
  }
  ```
- **Consumers:** Notification Context → sends invitation email with login link

#### **StaffDeactivated**
- **Trigger:** MANAGER-role staff member deactivates a team member (UC-028)
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

---

## Event Publishing & Consumption

- **Transport:** technology-agnostic `IEventBus` port. Local dev: GCP Pub/Sub Emulator (Docker). Production: GCP Pub/Sub (managed). Swappable to SQS / Kafka via a new adapter — domain code never changes.
- **Delivery semantics:** at-least-once. **All consumers MUST be idempotent** (deduplicate by `eventId`).
- **Ordering:** not guaranteed across events. Consumers MUST tolerate out-of-order delivery (e.g. `BookingCompleted` arriving before `BookingApproved` should be rejected with a retry, not crash).
- **Transactional outbox:** event publication MUST be transactional with the state change that produced it (e.g. via an outbox pattern). No event without a corresponding committed row; no committed row without its event eventually published.

---

## Event Versioning

Add fields freely (consumers ignore unknown fields). Breaking changes require bumping `eventVersion`:

```
BookingRequested.v1 → BookingRequested.v2  (e.g. renamed or removed field)
```

Consumers subscribe to specific `eventName` + `eventVersion`. Publishers emit the highest version they support; the bus may fan-out to multiple consumer versions if needed during a migration.

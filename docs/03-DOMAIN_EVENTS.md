# Domain Events - BeloAuto

Domain events represent things that happened in the system. Other bounded contexts listen and react to these events.

## Multi-Tenancy Note

All domain events include `tenantId` to ensure tenant isolation. Events are only processed within their tenant context - Notification Context for Tenant A will never see events from Tenant B.

---

## Event Categories

### **Booking Lifecycle Events** (Booking Context)

#### **BookingRequested**
- **Trigger:** Guest or authenticated customer submits a booking request
- **When:** New booking created, status = PENDING
- **Data:**
  ```
  {
    tenantId: string (which company)
    bookingId: string
    type: "GUEST" | "CUSTOMER"
    customerId: string | null (null if guest)
    guestEmail: string
    guestName: string
    guestPhone: string
    serviceId: string
    preferredDate: ISO8601
    preferredTimeSlot: { startTime: ISO8601, endTime: ISO8601 }
    price: { amount: number, currency: string }
    carPhotoUrl: string | null
    timestamp: ISO8601
  }
  ```
- **Consumers:**
  - **Notification Context** → Send email to admin: "New booking request from [name]"
  - **Notification Context** → Send email to guest: "Your booking request is pending"
  - **Loyalty Context** → Record in audit if customer is authenticated

---

#### **BookingApproved**
- **Trigger:** Admin approves a PENDING booking
- **When:** Booking transitions from PENDING → APPROVED
- **Data:**
  ```
  {
    bookingId: string
    customerId: string | null
    guestEmail: string
    guestName: string
    serviceId: string
    approvedDate: ISO8601
    approvedTimeSlot: { startTime: ISO8601, endTime: ISO8601 }
    approvedBy: string (staff email)
    timestamp: ISO8601
  }
  ```
- **Consumers:**
  - **Notification Context** → Send email to customer/guest: "Your booking is confirmed for [date/time]"
  - **Loyalty Context** → Record approval in audit

---

#### **BookingRejected**
- **Trigger:** Admin rejects a PENDING booking
- **When:** Booking transitions from PENDING → REJECTED
- **Data:**
  ```
  {
    bookingId: string
    customerId: string | null
    guestEmail: string
    guestName: string
    reason: string (why rejected)
    rejectedBy: string (staff email)
    timestamp: ISO8601
  }
  ```
- **Consumers:**
  - **Notification Context** → Send email to customer/guest: "Your booking request was not approved. Reason: [reason]"

---

#### **BookingInfoRequested**
- **Trigger:** Admin requests additional information about a booking (e.g., car photos)
- **When:** Booking stays PENDING, admin marks "awaiting info"
- **Data:**
  ```
  {
    bookingId: string
    customerId: string | null
    guestEmail: string
    guestName: string
    informationNeeded: string (e.g., "Car photo required")
    requestedBy: string (staff email)
    timestamp: ISO8601
  }
  ```
- **Consumers:**
  - **Notification Context** → Send email to customer/guest: "We need more info: [details]. Please reply."

---

#### **BookingCompleted**
- **Trigger:** Staff marks booking as COMPLETED after wash is done
- **When:** Booking transitions from APPROVED → COMPLETED
- **Data:**
  ```
  {
    bookingId: string
    customerId: string | null
    guestEmail: string
    guestName: string
    serviceId: string
    completedDate: ISO8601
    completedBy: string (staff email)
    timestamp: ISO8601
  }
  ```
- **Consumers:**
  - **Notification Context** → Send email to customer: "Your wash is complete! Thank you!"
  - **Loyalty Context** → Increment wash count, recalculate loyalty status, publish `WashCompleted`

---

#### **BookingReminderSentCustomer**
- **Trigger:** Scheduled email sent to customer (1 day before appointment, 6 AM)
- **When:** System cron job runs, finds appointments for tomorrow
- **Data:**
  ```
  {
    bookingId: string
    customerId: string | null (customer or guest email)
    email: string
    customerName: string
    serviceId: string
    appointmentDate: ISO8601
    appointmentTimeSlot: { startTime: ISO8601, endTime: ISO8601 }
    timestamp: ISO8601
  }
  ```
- **Consumers:**
  - **Notification Context** → Email already sent (log event for audit)

---

#### **BookingReminderSentCustomerDay**
- **Trigger:** Scheduled email sent to customer (day of appointment, 6 AM)
- **When:** System cron job runs early morning, finds today's appointments
- **Data:**
  ```
  {
    bookingId: string
    customerId: string | null
    email: string
    customerName: string
    serviceId: string
    appointmentTimeSlot: { startTime: ISO8601, endTime: ISO8601 }
    timestamp: ISO8601
  }
  ```
- **Consumers:**
  - **Notification Context** → Email already sent (log event for audit)

---

#### **AdminDailyScheduleReminder**
- **Trigger:** Scheduled email sent to admin (6 AM each day)
- **When:** System cron job runs, gets all APPROVED bookings for today
- **Data:**
  ```
  {
    staffEmail: string
    bookingsToday: [
      {
        bookingId: string
        customerName: string
        serviceId: string
        serviceName: string
        appointmentTimeSlot: { startTime: ISO8601, endTime: ISO8601 }
        customerPhone: string
        notes: string (optional)
      }
    ]
    totalBookingsToday: number
    timestamp: ISO8601
  }
  ```
- **Consumers:**
  - **Notification Context** → Send formatted email to admin

---
- **Trigger:** Customer or admin cancels an APPROVED booking
- **When:** Booking transitions from APPROVED → CANCELLED
- **Data:**
  ```
  {
    bookingId: string
    customerId: string | null
    guestEmail: string
    guestName: string
    cancelledDate: ISO8601
    cancelledBy: string (customer email or staff email)
    reason: string (optional)
    isBusiness: boolean (true = admin cancelled, false = customer cancelled)
    timestamp: ISO8601
  }
  ```
- **Consumers:**
  - **Notification Context** → Send email to customer: "Your booking has been cancelled"
  - **Notification Context** → Send email to admin: "Booking [id] cancelled by [customer]"
  - **Loyalty Context** → Record cancellation, increment cancellation count, publish `CancellationRecorded`

---

### **Loyalty Events** (Loyalty Context)

#### **ServicePointsEarned**
- **Trigger:** BookingCompleted event processed by Loyalty Context
- **When:** Loyalty record is updated after booking completion, points calculated
- **Data:**
  ```
  {
    loyaltyId: string
    customerId: string
    bookingId: string
    serviceId: string
    serviceName: string
    pointsEarned: number (e.g., 2 points for Premium Wash)
    totalServicePoints: number (new total for this service)
    serviceStatus: string (BRONZE | SILVER | GOLD)
    expiresAt: ISO8601 (when these points expire, e.g., +180 days)
    timestamp: ISO8601
  }
  ```
- **Consumers:**
  - **Notification Context** → Send email: "You earned [X] points! Total: [Y] points"
  - **Notification Context** (if status changed) → Send congratulation email

---

#### **PointsExpired**
- **Trigger:** Scheduled job checks for expired points
- **When:** Points past expiration date (e.g., 6 months old)
- **Data:**
  ```
  {
    loyaltyId: string
    customerId: string
    serviceId: string
    serviceName: string
    pointsExpired: number
    remainingPoints: number
    timestamp: ISO8601
  }
  ```
- **Consumers:**
  - **Notification Context** → Send email (optional): "Your [X] points expired"

---

#### **PointsRedeemed**
- **Trigger:** Customer claims reward/gift or admin marks as redeemed
- **When:** Points subtracted from loyalty for reward
- **Data:**
  ```
  {
    loyaltyId: string
    customerId: string
    serviceId: string
    serviceName: string
    pointsRedeemed: number
    reward: string (e.g., "Gift card $10")
    remainingPoints: number
    timestamp: ISO8601
  }
  ```
- **Consumers:**
  - **Notification Context** → Send email: "Reward claimed! [X] points remaining"

---

### **Notification Events** (Notification Context)

#### **EmailSent**
- **Trigger:** Email successfully sent via SendGrid/SES
- **When:** Notification task completes
- **Data:**
  ```
  {
    notificationLogId: string
    templateName: string
    recipient: string
    subject: string
    sentAt: ISO8601
  }
  ```
- **Consumers:**
  - Dashboard (audit trail)

---

#### **EmailFailed**
- **Trigger:** Email delivery failed
- **When:** Notification task fails after retry attempts
- **Data:**
  ```
  {
    notificationLogId: string
    templateName: string
    recipient: string
    subject: string
    errorMessage: string
    retryCount: number
    timestamp: ISO8601
  }
  ```
- **Consumers:**
  - Retry queue (attempt resend later)
  - Admin alerts (if critical)

---

## Event Flow Diagrams

### **Happy Path: Guest Books & Gets Approved**

```
┌─────────────────────────┐
│  Guest submits booking  │
└────────────┬────────────┘
             │
             ▼
    ┌─────────────────────────┐
    │ BookingRequested Event  │
    │ (published)             │
    └────────────┬────────────┘
                 │
        ┌────────┴────────┬──────────────┐
        │                 │              │
        ▼                 ▼              ▼
  Notify Context    Loyalty Context  Staff Dashboard
  - Send email to  (log if auth'd)   (show pending
    admin: "New      customer)        booking)
    request"
  - Send email to
    guest: "Pending"
        │
        ▼
┌─────────────────────────┐
│  Admin reviews, approves│
└────────────┬────────────┘
             │
             ▼
    ┌─────────────────────────┐
    │ BookingApproved Event   │
    │ (published)             │
    └────────────┬────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
  Notify Context      Loyalty Context
  - Send email:       (log if auth'd
    "Confirmed for     customer)
    [date/time]"
        │
        ▼
  ┌──────────────────┐
  │ Booking ready for│
  │ scheduled date   │
  └──────────────────┘
```

---

### **Path: Booking Completion & Loyalty Update**

```
┌─────────────────────────┐
│ Staff completes wash    │
│ (marks COMPLETED)       │
└────────────┬────────────┘
             │
             ▼
    ┌─────────────────────────┐
    │ BookingCompleted Event  │
    │ (published)             │
    └────────────┬────────────┘
                 │
        ┌────────┴────────┬──────────────┐
        │                 │              │
        ▼                 ▼              ▼
  Notify Context    Loyalty Context  Analytics
  - Send "Thank       (if auth'd
    you" email to     customer):
    customer        - Increment
                      wash count
                    - Recalculate
                      loyalty status
                    - Publish
                      WashCompleted
                      │
                      ▼
                  ┌──────────────┐
                  │ WashCompleted│
                  │ Event        │
                  └────────┬─────┘
                           │
                           ▼
                    Notify Context
                    - Send email:
                      "You now have
                       [X] washes!"
                    
                    (If status
                     changed:)
                    - Publish
                      LoyaltyStatus
                      Changed event
                    - Notify sends
                      congrats email
```

---

### **Path: Cancellation with 48h Rule**

```
┌──────────────────────────────┐
│ Customer clicks "Cancel"     │
│ (System validates 48h rule)  │
└────────────┬─────────────────┘
             │
      ┌──────▼─────┐
      │ Is > 48h   │
      │ before?    │
      └──┬────────┬┘
         │        │
       YES       NO
         │        │
         ▼        ▼
    ✓ Cancel  ✗ Reject
         │      (Error:
         │       Too late
         ▼       to cancel)
    ┌──────────────────────────┐
    │ BookingCancelled Event   │
    │ (published)              │
    └────────────┬─────────────┘
                 │
        ┌────────┴────────┬──────────────┐
        │                 │              │
        ▼                 ▼              ▼
  Notify Context    Loyalty Context  Admin Alert
  - Send email to   (if auth'd
    customer:        customer):
    "Cancellation   - Increment
     confirmed"      cancellation
  - Send email to     count
    admin: "[name]  - Record in
     cancelled"      loyalty log
                    - Publish
                      Cancellation
                      Recorded event
                      │
                      ▼
                   Notify Context
                   - Send email
                     (optional):
                     "Cancellation
                      on record"
```

---

## Event Publishing & Consumption Pattern

**Synchronous vs Asynchronous:**
- **Synchronous:** Critical path (e.g., BookingApproved → immediate email)
- **Asynchronous (Recommended):** Use event queue (RabbitMQ, Google Pub/Sub)
  - Decouples contexts
  - Improves resilience
  - Allows retry logic

**For MVP:** Start with synchronous event handling (simple), migrate to async if needed.

---

## Event Versioning

As the system evolves, events may change. Use versioning to avoid breaking consumers:

```
BookingRequested.v1
BookingRequested.v2 (added field: carPhotoUrl)
```

Consumers subscribe to specific versions they support.


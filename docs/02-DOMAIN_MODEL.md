# Domain Model - BeloAuto (DDD)

This document defines the domain model using Domain-Driven Design (DDD) principles: bounded contexts, aggregates, entities, value objects, and domain events.

---

## Bounded Contexts

A bounded context is an autonomous domain with clear boundaries and its own model. **Each context is scoped to a tenant** - no cross-tenant data mixing.

### **Context 1: Booking Context**
**Purpose:** Manage the booking lifecycle from request to completion, **per tenant**. A booking groups **one or more services** ("lines") that the customer wants performed in a single appointment.

**Responsibilities:**
- Accept booking requests (guest & authenticated customers) with one or more service lines, for a specific tenant.
- Snapshot each service's price / duration / points value into the booking at request time (so later edits to `Service` do not retroactively change past bookings).
- Compute the booking's total price and total duration from its lines.
- Validate calendar availability against the total duration.
- Manage the approval / rejection / info / completion / cancellation workflow.
- Track booking state changes.

**Key Aggregates:**
- `Booking` (root) — owns one or more `BookingLine` child entities, tenant-scoped
- `Service` (root) — tenant-scoped
- `ScheduleClosure` (root) — tenant-scoped

---

### **Context 2: Customer Context**
**Purpose:** Manage customer identity and profiles, **per tenant**.

**Responsibilities:**
- Store customer information (authenticated users) for a specific tenant
- Manage customer authentication
- Link Google OAuth to customer account
- Store customer preferences

**Key Aggregates:**
- Customer (root) - scoped to tenant

**Note:** Same person can be a customer in multiple tenants (different email contexts), but each tenant sees their own customer records.

---

### **Context 3: Loyalty Context**
**Purpose:** Track points earned by customers for completed services, **per tenant**, with time-based expiration.

**Model (intentionally simple):**
- One immutable row is inserted each time a booking is completed for an authenticated customer.
- Each row carries its own `expiresAt`.
- "Active balance" is always a query (`SUM(points) WHERE expires_at > now()`). No row is written when points expire.
- Points are **earned only** — there is no redemption, no spending, no manual adjustment in MVP. Rewards / gifts are decided by the admin out-of-band and not modelled here.

**Responsibilities:**
- Append a `LoyaltyEntry` when `BookingCompleted` is consumed and the booking has a `customerId`.
- Compute the customer's active point balance (total + per-service) at query time.
- Emit a notification when previously-active points cross their expiration threshold.

**Key Aggregates:**
- LoyaltyEntry (root, immutable) — scoped to tenant

---

### **Context 4: Notification Context**
**Purpose:** Handle email notifications and communication templates, **per tenant**.

**Responsibilities:**
- Listen to domain events from other contexts (tenant-scoped)
- Compose and send emails (branded per tenant)
- Track notification delivery
- Handle notification failures

**Key Aggregates:**
- NotificationTemplate (root) - scoped to tenant
- NotificationLog (root) - scoped to tenant

---

### **Context 5: Staff Context**
**Purpose:** Manage staff information and permissions, **per tenant**.

**Responsibilities:**
- Store staff member details for a specific tenant
- Link Google OAuth to staff account
- Track staff scheduling (days off, closures)
- Foundation for future: role-based permissions per tenant

**Key Aggregates:**
- Staff (root) - scoped to tenant
- ScheduleClosure (shared with Booking Context) - scoped to tenant

---

## Aggregates, Entities, and Value Objects

### **Booking Context**

#### **Aggregate: Booking** (Root Entity)
A single customer visit. A booking groups **one or more `BookingLine` entities** — each line is one service unit (e.g. one Basic Wash on one car). All lines in a booking share the same status, schedule, and customer.

**Entities within (only accessible through the Booking root):**
- `Booking` (root)
- `BookingLine` (≥ 1 per booking)
- `BookingAuditLogEntry` (immutable log)

**Value Objects:**
- `BookingId`, `BookingLineId` (UUIDs)
- `BookingStatus` (PENDING, INFO_REQUESTED, APPROVED, REJECTED, COMPLETED, CANCELLED)
- `BookingType` (GUEST, CUSTOMER)
- `TimeSlot` (date, startTime, endTime)
- `Money` (price, currency)
- `Duration` (minutes)

**Properties:**
```
Booking {
  bookingId:     BookingId
  tenantId:      TenantId
  status:        BookingStatus
  type:          BookingType
  customerId:    CustomerId   (null if guest)
  guestEmail:    Email
  guestPhone:    Phone
  guestName:     String

  scheduledAt:        DateTime         -- start of the appointment slot
  totalDurationMins:  Duration         -- = SUM(lines.durationMinsAtBooking); derived & cached
  totalPrice:         Money            -- = SUM(lines.priceAtBooking);        derived & cached
  -- Effective slot reserved on the calendar:
  --   [scheduledAt, scheduledAt + totalDurationMins)

  lines:                BookingLine[]   -- ≥ 1 (a booking with zero lines is invalid)
  carPhotoUrls:         String[]        -- before, uploaded by customer/guest (UC-001)
  afterServicePhotoUrls: String[]       -- after, uploaded by staff (UC-009)

  createdAt:        DateTime

  -- Audit & state tracking (UC-003, 004, 005, 007, 008, 009)
  approvedAt:       DateTime | null
  approvedBy:       StaffId  | null
  completedAt:      DateTime | null
  completedBy:      StaffId  | null
  cancelledAt:      DateTime | null
  cancelledBy:      UserId   | null  (Staff or Customer id, or guest email for guest cancel)
  infoRequestedAt:  DateTime | null
  infoRequestedBy:  StaffId  | null
  informationNeeded:String   | null   (UC-005 prompt to customer)
  infoSubmittedAt:  DateTime | null
  infoPayload:      Object   | null   (customer's reply: notes, additional photos, …)

  rejectionReason:    String | null   (UC-004)
  cancellationReason: String | null   (UC-008 — admin) or null when customer-cancelled
  adminNotes:         String | null   (UC-003, UC-009)

  auditLog:        BookingAuditLogEntry[]
}
```

**Booking invariants (enforced by the aggregate, not the DB):**
- `lines.length >= 1`. A booking with zero lines cannot be persisted.
- `totalPrice` and `totalDurationMins` are **derived** — never set directly. The aggregate recalculates them when lines change. The DB stores them denormalised for fast list queries; an integrity check enforces equality with the sum.
- The line collection is mutable **only before** the booking is approved. Once `status = APPROVED`, lines are immutable — admins may not silently add or remove services from a confirmed booking. (Future UC for "amend approved booking" can lift this.)
- The same `serviceId` may appear in multiple lines (e.g. two cars, both Basic Wash → two `BookingLine` rows with the same `serviceId`).

#### **Entity: BookingLine** (child entity inside the Booking aggregate)
One service to be performed during the booking's appointment. Carries **snapshot** fields from the `Service` so the booking is unaffected by later service edits.

**Properties:**
```
BookingLine {
  lineId:                  BookingLineId
  bookingId:               BookingId      -- parent
  tenantId:                TenantId       -- denormalised for FK / tenant isolation
  serviceId:               ServiceId      -- which service was selected

  -- Snapshots, frozen at booking-request time. NEVER updated.
  priceAtBooking:          Money
  durationMinsAtBooking:   int
  pointsValueAtBooking:    int            -- becomes the LoyaltyEntry.points on completion
}
```

**Invariants:**
- All three snapshot fields are immutable from the moment the line is persisted.
- A line cannot exist without a parent `Booking`.
- A line's `tenantId` must equal its parent booking's `tenantId` (composite FK enforces this at the DB).

**Key Methods (on the Booking aggregate root — `BookingLine` itself has no behaviour):**
- `requestBooking(actor, scheduledAt, serviceIds[])`
  - Loads each `Service`, snapshots `price`/`durationMinutes`/`loyaltyPointsValue` into a new `BookingLine`.
  - Computes `totalPrice` and `totalDurationMins`.
  - Validates calendar availability against the total duration.
  - Creates booking in `PENDING`.
  - Publishes `BookingRequested`.
- `approveBooking()` → transitions `PENDING | INFO_REQUESTED → APPROVED`, publishes `BookingApproved` (event carries the line summary).
- `rejectBooking(reason)` → transitions `PENDING | INFO_REQUESTED → REJECTED`, publishes `BookingRejected`.
- `requestMoreInfo(informationNeeded)` → `PENDING → INFO_REQUESTED`, publishes `BookingInfoRequested`.
- `submitInformation(payload)` → `INFO_REQUESTED → PENDING`, publishes `BookingInfoSubmitted`.
- `completeBooking(afterServicePhotoUrls, adminNotes?)` → `APPROVED → COMPLETED`, stores photos, publishes `BookingCompleted` **with the line list** (so Loyalty can insert one `LoyaltyEntry` per line).
- `cancelBooking(actor, reason?)` → validates `tenants.settings.cancellation_window_hours` rule, transitions to `CANCELLED`, publishes `BookingCancelled`.
- `isEligibleForCancellation(now)` → checks the cancellation-window rule.
- `uploadCarPhotos(photoUrls)` → appends to `carPhotoUrls`.
- `uploadAfterServicePhotos(photoUrls)` → appends to `afterServicePhotoUrls`.

---

#### **Aggregate: Service** (Root Entity)
Represents a car wash service type (e.g., Basic Wash, Premium Wash).

**Entities within:**
- `Service` (root)

**Value Objects:**
- `ServiceId` (unique identifier)
- `ServiceName` (string)
- `Money` (price)
- `Duration` (minutes)
- `ServiceStatus` (ACTIVE, INACTIVE)
- `LoyaltyPoints` (points earned per completion, configurable)

**Properties:**
```
Service {
  serviceId: ServiceId
  tenantId: TenantId (which company this service belongs to)
  name: ServiceName
  description: String
  price: Money
  durationMinutes: Duration
  loyaltyPointsValue: LoyaltyPoints (e.g., Basic=1pt, Premium=2pts, Wax=3pts)
  isActive: Boolean (UC-013)
  createdAt: DateTime
  updatedAt: DateTime
}
```

---

#### **Aggregate: ScheduleClosure** (Root Entity)
Represents when staff/admin closes the schedule (days off, maintenance, holidays).

**Entities within:**
- `ScheduleClosure` (root)

**Value Objects:**
- `ScheduleClosureId` (unique identifier)
- `ClosureType` (STAFF_DAY_OFF, MAINTENANCE, HOLIDAY)
- `DateRange` (startDate, endDate)

**Properties:**
```
ScheduleClosure {
  closureId: ScheduleClosureId
  tenantId: TenantId (which company this closure belongs to)
  staffId: StaffId | null (null = system-wide closure, set = staff-specific day off)
  type: ClosureType (STAFF_DAY_OFF, MAINTENANCE, HOLIDAY)
  startDate: Date
  endDate: Date
  reason: String (optional)
  createdAt: DateTime
}
```

**Closure Type Rules:**
- `STAFF_DAY_OFF`: staffId MUST be set (this staff member is unavailable)
- `MAINTENANCE`: staffId MUST be null (system-wide maintenance)
- `HOLIDAY`: staffId MUST be null (system-wide holiday, affects all staff)

**Invariants:**
- If `staffId` is set, `type` must be `STAFF_DAY_OFF`
- If `staffId` is null, `type` must be `MAINTENANCE` or `HOLIDAY`
- A staff member cannot have overlapping STAFF_DAY_OFF closures (UC-010 should validate)

---

### **Customer Context**

#### **Aggregate: Customer** (Root Entity)
Represents an authenticated user with a profile.

**Entities within:**
- `Customer` (root)

**Value Objects:**
- `CustomerId` (unique identifier, from Google OAuth sub)
- `Email`
- `Phone`
- `FullName`

**Properties:**
```
Customer {
  customerId: CustomerId
  tenantId: TenantId (which company this customer is booking with)
  googleOAuthId: String (unique from Google)
  email: Email
  phone: Phone
  firstName: String
  lastName: String
  createdAt: DateTime
  updatedAt: DateTime
}

Note: Same person (Google email) CAN be a customer in multiple tenants.
Each tenant has separate Customer record with:
  - Different customerId
  - Different loyalty record
  - Different booking history
  - Completely isolated

Example:
  maria@email.com in Tenant A: Customer(id=1, tenantId="tenant_a", ...)
  maria@email.com in Tenant B: Customer(id=2, tenantId="tenant_b", ...)
  (Two separate records, no cross-tenant data)
```

---

### **Loyalty Context**

#### **Aggregate: LoyaltyEntry** (Root Entity, immutable)

A single record of points earned by a customer for one completed service. Append-only: rows are inserted on `BookingCompleted` and **never updated or deleted**. Points "expire" implicitly — when the entry's `expiresAt` timestamp passes, the row stops contributing to the balance. No row is written to mark expiration.

**Value Objects:**
- `LoyaltyEntryId` (UUID)
- `LoyaltyPoints` (positive integer)

**Properties:**
```
LoyaltyEntry {
  entryId:        LoyaltyEntryId
  tenantId:       TenantId
  customerId:     CustomerId
  bookingId:      BookingId           (parent booking)
  bookingLineId:  BookingLineId       (specific line — one entry per line, never null)
  serviceId:      ServiceId           (denormalised from BookingLine for fast per-service queries)
  points:         LoyaltyPoints       (positive; = BookingLine.pointsValueAtBooking, frozen)
  earnedAt:       DateTime
  expiresAt:      DateTime            (= earnedAt + tenants.settings.loyalty_expiry_days; never null)
}
```

**One entry per `BookingLine`.** A booking with 3 lines → 3 `LoyaltyEntry` rows on completion. Idempotency is enforced by `UNIQUE(tenantId, bookingLineId)` (see `docs/13-DATABASE_SCHEMA.md`) — replaying `BookingCompleted` is a guaranteed no-op.

LoyaltyEntry is immutable — it carries no business methods. All behaviour lives on the domain service:

**Domain Service: `LoyaltyService`**
- `recordCompletion(booking): LoyaltyEntry[]`
  - Called when `BookingCompleted` is consumed and `booking.customerId` is not null.
  - For each line in `booking.lines`: inserts one `LoyaltyEntry` with `points = line.pointsValueAtBooking`, `expiresAt = now() + tenants.settings.loyalty_expiry_days`.
  - Inserts are idempotent via `UNIQUE(tenantId, bookingLineId)` — a duplicate event is silently ignored at the DB level.
  - Publishes one `ServicePointsEarned` per inserted row.
- `balance(customerId, tenantId): { totalActive, byService: Map<ServiceId, int>, completionsByService: Map<ServiceId, int> }`
  - `totalActive`  = `SUM(points) WHERE expires_at > now()`
  - `byService`    = same query grouped by `service_id`
  - `completionsByService` = `COUNT(*) GROUP BY service_id` (across all entries, including expired — historical activity)
- `notifyExpiringSoon()` — cron, **weekly** (Mondays 06:00 tenant-local)
  - Finds entries whose `expires_at` falls in `[now, now + 7 days)`.
  - Aggregates them per `(customer, service)` pair.
  - Publishes one `PointsExpiringSoon` per pair (forward-looking warning — no DB write).
  - Points that actually expire are NEVER notified separately; they simply stop counting toward the active balance. The weekly warning was the value-add.

**What this model intentionally does NOT support (MVP):**
- Redemption / spending points (gifts are admin-driven, off-system).
- Manual point adjustments (no bonus rows by admin in MVP).
- Tier labels (BRONZE / SILVER / GOLD) — the admin reads raw active-point totals from the dashboard and decides what to offer.

These are all easy to add later as new event types if the business needs them.

---

### **Notification Context**

#### **Aggregate: NotificationTemplate** (Root Entity)
Email template definitions **per tenant**.

**Properties:**
```
NotificationTemplate {
  templateId: TemplateId
  tenantId: TenantId (which company this template belongs to)
  name: String (e.g., "BookingApprovedTemplate")
  subject: String (can include variables like {{customerName}})
  htmlBody: String (template with placeholders)
  variables: String[] (e.g., ["customerName", "bookingDate"])
  createdAt: DateTime
}
```

#### **Aggregate: NotificationLog** (Root Entity)
Record of sent notifications (audit trail) **per tenant**.

**Properties:**
```
NotificationLog {
  logId: NotificationLogId
  tenantId: TenantId (which company this notification belongs to)
  templateName: String
  recipient: Email
  subject: String
  sentAt: DateTime
  status: NotificationStatus (SENT, FAILED, PENDING)
  retryCount: Integer
  errorMessage: String (if failed)
}
```

---

### **Staff Context**

#### **Aggregate: Staff** (Root Entity)
Represents an employee.

**Entities within:**
- `Staff` (root)

**Value Objects:**
- `StaffId` (unique identifier)
- `Email`
- `FullName`
- `StaffRole` (ADMIN, STAFF) [foundation for future role-based access]

**Properties:**
```
Staff {
  staffId: StaffId
  tenantId: TenantId (UNIQUE - staff belongs to exactly ONE tenant)
  googleOAuthId: String (unique from Google)
  email: Email
  firstName: String
  lastName: String
  role: StaffRole
  isActive: Boolean
  createdAt: DateTime
  updatedAt: DateTime
}

Constraint: UNIQUE(googleOAuthId, tenantId)
  This means: Same person can NEVER be staff in multiple tenants
  (But same person CAN be customer in multiple tenants)
```

---

## Domain Events

Domain events represent significant business occurrences that other contexts may need to react to.

### **Booking Context Events**

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `BookingRequested` | New booking submitted (1..N lines) | Notification Context |
| `BookingApproved` | Admin approves booking | Notification Context |
| `BookingRejected` | Admin rejects booking | Notification Context |
| `BookingInfoRequested` | Admin requests more info (PENDING → INFO_REQUESTED) | Notification Context |
| `BookingInfoSubmitted` | Customer / guest responds to an info request (INFO_REQUESTED → PENDING) | Notification Context |
| `BookingCancelled` | Customer/admin cancels booking | Notification Context |
| `BookingCompleted` | Staff marks booking complete | Notification Context, **Loyalty Context** (only Booking event Loyalty cares about) |

### **Loyalty Context Events**

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `ServicePointsEarned` | `BookingCompleted` consumed → one `LoyaltyEntry` inserted per `BookingLine` (one event per line) | Notification Context |
| `PointsExpiringSoon` | Weekly cron (Mondays) finds entries whose `expires_at` falls in the **next 7 days** — forward-looking warning | Notification Context |

### **Notification Context Events**

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `EmailSent` | Email successfully sent | Audit (optional) |
| `EmailFailed` | Email delivery failed | Retry queue |

---

## Value Objects Reference

### **Email**
- Validates RFC 5322 format
- Immutable
- Comparable by value

### **Phone**
- Validates phone number format
- Stores in international format
- Immutable

### **Money**
- Amount (decimal)
- Currency (default: USD)
- Supports operations: add, subtract, multiply
- Immutable

### **TimeSlot**
- startTime: DateTime
- endTime: DateTime
- Validates: endTime > startTime
- Overlaps with other slots: no

### **BookingStatus**
Enum: `PENDING | INFO_REQUESTED | APPROVED | REJECTED | COMPLETED | CANCELLED`

**State machine (authoritative):**
```
PENDING         -> INFO_REQUESTED | APPROVED | REJECTED | CANCELLED
INFO_REQUESTED  -> PENDING (customer / guest responded)
                |  APPROVED | REJECTED | CANCELLED  (admin acted on info offline)
APPROVED        -> COMPLETED | CANCELLED
COMPLETED       -> (terminal)
REJECTED        -> (terminal)
CANCELLED       -> (terminal)
```

> `NO_SHOW` is a future state, not in MVP.

### **BookingType**
Enum: `GUEST | CUSTOMER`

### **Expiration window (`loyalty_expiry_days`)**
Configurable **per tenant** via `tenants.settings.loyalty_expiry_days` (integer, days). Typical values: 180 (6 months) or 365 (1 year). Defaults to 180 if unset.

When a `LoyaltyEntry`'s `expiresAt` passes:
- The entry stops contributing to active balance (query-time filter — nothing is mutated).
- No event is emitted. Customers are warned **in advance** via the weekly `PointsExpiringSoon` cron (see Domain Service `LoyaltyService.notifyExpiringSoon()`).

> The previous `LoyaltyStatus` enum (`BRONZE / SILVER / GOLD`) has been removed. The admin reads raw active-point totals and decides when to offer rewards — there is no automated tier in MVP.

---

## Context Map & Communication

```
┌─────────────────────────────────────────────────────────┐
│                   Booking Context                        │
│  (Request, Approve, Complete, Cancel bookings)          │
│  Events: BookingRequested, BookingApproved,             │
│          BookingCompleted, BookingCancelled             │
└──────────────┬──────────────────────────────────────────┘
               │
         ┌─────┴─────┬──────────────┬──────────────┐
         │            │              │              │
    ┌────▼────┐  ┌───▼───┐  ┌──────▼──┐  ┌──────▼──┐
    │Customer │  │Loyalty│  │ Notify  │  │ Staff  │
    │Context  │  │Context│  │ Context │  │Context │
    └─────────┘  └───────┘  └─────────┘  └────────┘

Booking → Loyalty: "Hey, booking completed, increment wash count"
Booking → Notification: "Hey, new booking request, send email"
Booking → Staff: "Booking awaiting approval in dashboard"
```

---

---

### **Context 6: Platform Context**
**Purpose:** Manage the operational lifecycle of each tenant — onboarding, configuration, hotsite, and staff.

**Responsibilities:**
- Create and configure tenants (name, slug, initial settings)
- Allow tenant admins to edit their operational settings (cancellation window, loyalty rules, business hours, timezone)
- Allow tenant admins to manage and publish their public hotsite (branding, layout, content)
- Allow tenant admins to invite and manage staff members

**Key Aggregates:**
- `Tenant` (root) — the car wash company record; owns the `settings` JSONB blob
- `HotsiteConfig` (root) — tenant-scoped branding and layout for the public hotsite
- Staff lifecycle (create/deactivate) — Platform use cases operate on the `Staff` aggregate owned by the Staff Context

**Notes:**
- There is no super-admin UI in MVP. A new tenant is provisioned by a developer via a CLI command or a seed script.
- All Platform use cases (except super-admin provisioning) are performed by a staff member with `MANAGER` role within their own tenant scope.

**Published Events:**
- `StaffInvited` — consumed by Notification (invitation email)
- `StaffDeactivated` — no consumers in MVP

---

#### **Aggregate: Tenant** (Root Entity)
```
Tenant {
  tenantId:   TenantId
  name:       String           -- display name (e.g. "AutoWash Pro")
  slug:       String           -- URL-safe identifier (e.g. "autowash-pro"), globally unique
  settings:   TenantSettings   -- JSONB — see docs/21-TENANTS_SETTINGS_SCHEMA.md for full schema
  isActive:   Boolean
  createdAt:  DateTime
  updatedAt:  DateTime
}
```

**Key methods:**
- `updateSettings(settings)` → validates and replaces settings blob; publishes no event (settings are read fresh per request).
- `deactivate()` → sets `isActive = false`; all tenant data remains intact.

---

#### **Aggregate: HotsiteConfig** (Root Entity)
```
HotsiteConfig {
  configId:      HotsiteConfigId
  tenantId:      TenantId
  branding:      Branding        -- { primaryColor, logoUrl, font }
  layout:        LayoutModule[]  -- ordered list of UI modules to render
  isPublished:   Boolean         -- false = draft; true = visible at /<slug>
  updatedAt:     DateTime
}
```

**Layout modules (types):** `HERO`, `SERVICE_LIST`, `GALLERY`, `TESTIMONIALS`, `BOOKING_CTA`, `ABOUT`, `CONTACT`.

**Key methods:**
- `updateContent(branding, layout)` → replaces branding and layout; stays in draft until published.
- `publish()` → sets `isPublished = true`; hotsite becomes publicly visible.
- `unpublish()` → reverts to draft.

---

## Anti-Corruption Layer (Future)

When integrating external services (e.g., payment provider, SMS service), create an anti-corruption layer to translate external models to our domain models. Not needed for MVP.


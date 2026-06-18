# Domain Model - Ikaro (DDD)

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
- `ScheduleOpening` (root) — tenant-scoped; opens a normally-closed day as a specific-date exception

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
**Purpose:** Track points earned by customers for completed services, **per tenant**, with time-based expiration, and allow admins to record point redemptions.

**Model:**
- One immutable `LoyaltyEntry` is inserted each time a booking is completed for an authenticated customer. Append-only.
- `LoyaltyBalance` holds the running active point total per `(tenant_id, customer_id)` — O(1) reads, updated atomically on earn/redeem/expiry.
- `LoyaltyRedemption` records each time an admin redeems points for a customer. Append-only audit log.
- A GCP Cloud Scheduler job calls `POST /cron/loyalty-expiry` at 02:00 UTC daily, which decrements `loyalty_balances.current_points` for entries whose `expires_at` has passed (idempotent via `balance_expiry_log`).

**Responsibilities:**
- Append a `LoyaltyEntry` and increment `LoyaltyBalance` when `BookingCompleted` is consumed and the booking has a `customerId`.
- Allow admin to record a redemption — decrement `LoyaltyBalance` atomically with the `LoyaltyRedemption` insert.
- Expose `POST /cron/loyalty-expiry` — triggered by GCP Cloud Scheduler at 02:00 UTC to decrement balances for expired entries.
- Emit a notification when points are about to expire.

**Key Aggregates:**
- LoyaltyEntry (root, immutable) — scoped to tenant
- LoyaltyBalance (root, mutable running total) — scoped to tenant
- LoyaltyRedemption (root, immutable) — scoped to tenant

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
- Foundation for future: role-based permissions per tenant

**Key Aggregates:**
- Staff (root) - scoped to tenant

**Published Events:**
- `StaffInvited` — consumed by Notification Context (invitation email). Published on staff invite (UC-028) and during tenant provisioning (M04-S06 handles `TenantProvisioned` → creates first MANAGER → publishes `StaffInvited`).
- `StaffDeactivated` — no consumers in MVP (sessions expire via JWT TTL).

> `ScheduleClosure` is owned by the **Booking Context** (it directly controls calendar availability). Staff Context reads closures for display but never writes them directly.

---

## Aggregates, Entities, and Value Objects

### **Booking Context**

#### **Aggregate: Booking** (Root Entity)
A single customer visit. A booking groups **one or more `BookingLine` entities** — each line is one service unit (e.g. one Basic Wash on one car). All lines in a booking share the same status, schedule, and customer.

**Entities within (only accessible through the Booking root):**
- `Booking` (root)
- `BookingLine` (≥ 1 per booking)

> Audit/state-tracking fields (`approvedBy`, `rejectedBy`, `completedBy`, etc.) are flat columns
> on `Booking` itself — there is no separate audit-log entity. See the "Audit & state tracking"
> block in `Booking.Properties` below.

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
  contactEmail:    Email
  contactPhone:    Phone
  contactName:     String
  contactAddress:  Address | null   -- optional general address provided by the guest/customer

  scheduledAt:        DateTime         -- start of the appointment slot
  totalDurationMins:  Duration         -- = SUM(lines.durationMinsAtBooking); derived & cached
  totalPrice:         Money            -- = SUM(lines.priceAtBooking);        derived & cached (quoted total)
  totalActualPrice:   Money | null     -- = SUM(lines.actualPriceCharged);    null until COMPLETED, then cached
  -- Effective slot reserved on the calendar:
  --   [scheduledAt, scheduledAt + totalDurationMins)

  lines:                BookingLine[]   -- ≥ 1 (a booking with zero lines is invalid)
  pickupAddress:        Address | null  -- required when any line has requiresPickupAddressAtBooking=true;
                                        -- null for bookings with no pickup service
  beforeServicePhotoUrls:         String[]        -- before, uploaded by customer/guest (UC-001)
  afterServicePhotoUrls: String[]       -- after, uploaded by staff (UC-009)

  createdAt:        DateTime

  -- Audit & state tracking (UC-003, 004, 005, 007, 008, 009)
  approvedAt:           DateTime | null
  approvedBy:           StaffId  | null
  completedAt:          DateTime | null
  completedBy:          StaffId  | null
  cancelledAt:          DateTime | null
  cancelledBy:          UserId   | null  (staff or customer UUID)
  cancellationReason:   String   | null
  rejectedAt:           DateTime | null
  rejectedBy:           StaffId  | null
  rejectionReason:      String   | null  (UC-004)
  infoRequestMessage:   String   | null  (UC-005 admin prompt to customer)
  infoRequestedAt:      DateTime | null
  infoRequestedBy:      StaffId  | null
  infoResponseMessage:  String   | null  (UC-005 customer reply notes)
  infoSubmittedAt:      DateTime | null
  adminNotes:           String   | null  (UC-003, UC-009)
}
```

**Booking invariants (enforced by the aggregate, not the DB):**
- `lines.length >= 1`. A booking with zero lines cannot be persisted.
- `totalPrice` and `totalDurationMins` are **derived** — never set directly. The aggregate recalculates them when lines change. The DB stores them denormalised for fast list queries; an integrity check enforces equality with the sum.
- `totalActualPrice` is `null` until `status = COMPLETED`. At completion, the aggregate sets `actualPriceCharged` on each line (defaulting to `priceAtBooking` if not overridden) and caches `totalActualPrice = SUM(lines.actualPriceCharged)`. Immutable after that.
- **Pickup address invariant:** if `lines.any(l => l.requiresPickupAddressAtBooking)` then `pickupAddress` MUST be non-null. Enforced at `requestBooking()` — a booking with a pickup-type service and no address is rejected.
- The line collection is mutable **only before** the booking is approved. Once `status = APPROVED`, lines are immutable — admins may not silently add or remove services from a confirmed booking. (Future UC for "amend approved booking" can lift this.)
- The same `serviceId` may appear in multiple lines (e.g. two cars, both Basic Wash → two `BookingLine` rows with the same `serviceId`).

#### **Entity: BookingLine** (child entity inside the Booking aggregate)
One service to be performed during the booking's appointment. Carries **snapshot** fields from the `Service` so the booking is unaffected by later service edits, and an **actual price** field recorded at completion time.

**Properties:**
```
BookingLine {
  lineId:                          BookingLineId
  bookingId:                       BookingId      -- parent
  tenantId:                        TenantId       -- denormalised for FK / tenant isolation
  serviceId:                       ServiceId      -- which service was selected

  -- Snapshots, frozen at booking-request time. NEVER updated.
  serviceNameAtBooking:            String         -- snapshot of Service.name
  priceAtBooking:                  Money          -- quoted price
  durationMinsAtBooking:           int
  pointsValueAtBooking:            int            -- becomes the LoyaltyEntry.points on completion
  requiresPickupAddressAtBooking:  boolean        -- snapshot of Service.requiresPickupAddress;
                                                  -- used to enforce the pickup address invariant

  -- Set at completion time (UC-009). Null before COMPLETED.
  actualPriceCharged:              Money | null   -- what was actually charged. Defaults to
                                                  -- priceAtBooking if staff does not override.
                                                  -- Zero = waived. Immutable once COMPLETED.
}
```

**Invariants:**
- All snapshot fields are immutable from the moment the line is persisted.
- `actualPriceCharged` is `null` until the booking reaches `COMPLETED`. Once set, it is immutable.
- `actualPriceCharged >= 0` (zero is valid — waived service; negative is not).
- A line cannot exist without a parent `Booking`.
- A line's `tenantId` must equal its parent booking's `tenantId` (composite FK enforces this at the DB).

**Key Methods (on the Booking aggregate root — `BookingLine` itself has no behaviour):**
- `requestBooking(actor, scheduledAt, serviceIds[], contactAddress?: Address, pickupAddress?: Address)`
  - Loads each `Service`, snapshots `price`/`durationMinutes`/`loyaltyPointsValue`/`requiresPickupAddress` into a new `BookingLine`.
  - Validates pickup invariant: if any line has `requiresPickupAddressAtBooking = true` and `pickupAddress` is absent → reject.
  - `contactAddress` is stored as-is (optional informational field; not subject to the pickup requirement).
  - Computes `totalPrice` and `totalDurationMins`.
  - Validates calendar availability against the total duration.
  - Creates booking in `PENDING`.
  - Publishes `BookingRequested`.
- `approveBooking()` → transitions `PENDING | INFO_REQUESTED → APPROVED`, publishes `BookingApproved` (event carries the line summary).
- `rejectBooking(staffId, reason)` → transitions `PENDING | INFO_REQUESTED → REJECTED`, publishes `BookingRejected`.
- `requestMoreInfo(informationNeeded)` → `PENDING → INFO_REQUESTED`, publishes `BookingInfoRequested`.
- `submitInformation(payload)` → `INFO_REQUESTED → PENDING`, publishes `BookingInfoSubmitted`.
- `completeBooking(afterServicePhotoUrls, adminNotes?, actualPrices?: Map<BookingLineId, Money>)`
  → `APPROVED → COMPLETED`.
  For each line: sets `actualPriceCharged = actualPrices[lineId] ?? priceAtBooking`.
  Computes and caches `totalActualPrice = SUM(lines.actualPriceCharged)`.
  Stores photos. Publishes `BookingCompleted` **with the full line list including `actualPriceCharged`**.
- `cancelBooking(actor, reason?)` → validates `tenants.settings.cancellation_window_hours` rule, transitions to `CANCELLED`, publishes `BookingCancelled`.
- `isEligibleForCancellation(now)` → checks the cancellation-window rule.
- `uploadBeforeServicePhotos(photoUrls)` → appends to `beforeServicePhotoUrls`.
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
  serviceId:              ServiceId
  tenantId:               TenantId
  name:                   ServiceName
  description:            String
  price:                  Money
  durationMinutes:        Duration
  loyaltyPointsValue:     LoyaltyPoints (e.g., Basic=1pt, Premium=2pts, Wax=3pts)
  requiresPickupAddress:  Boolean        -- true = booking form must collect a pickup address
                                         -- (e.g. "Coleta e Entrega"). Default false.
  isActive:               Boolean        (UC-013)
  createdAt:              DateTime
  updatedAt:              DateTime
}
```

---

#### **Aggregate: ScheduleClosure** (Root Entity)
Represents a period when the tenant's schedule is blocked — either a full day or a partial time window within a day (e.g., 2 hours for staff training). Closures are system-wide (they block all new bookings for that tenant during the closed window).

**Entities within:**
- `ScheduleClosure` (root)

**Value Objects:**
- `ScheduleClosureId` (unique identifier)
- `ClosureReason` enum: `STAFF_DAY_OFF | MAINTENANCE | HOLIDAY`

**Properties:**
```
ScheduleClosure {
  id:        ScheduleClosureId
  tenantId:  TenantId
  date:      String (YYYY-MM-DD — calendar date in tenant timezone)
  startTime: String | null  (HH:MM, 24-hour — null = full-day closure)
  endTime:   String | null  (HH:MM, 24-hour — null = full-day closure)
  reason:    ClosureReason
  notes:     String | null  (optional admin notes)
  createdBy: StaffId        (who created this closure)
  createdAt: DateTime
}
```

**Full-day vs Partial-day:**
- `startTime = null AND endTime = null` → full-day closure; the entire date is blocked regardless of business hours
- `startTime = "10:00" AND endTime = "12:00"` → partial closure; only that 2-hour window is blocked; bookings outside it remain available

**Invariants:**
- `date` cannot be in the past (domain guard at creation time)
- `startTime` and `endTime` must both be null OR both be set (no half-specified range)
- When set, `endTime > startTime` (zero-length or negative windows are invalid)
- `startTime` and `endTime` must be valid HH:MM strings (00:00–23:59)
- No two closures for the same `(tenantId, date)` may have overlapping time windows; this is enforced by the use case before persisting (the DB index alone cannot express arbitrary range overlap)
- A full-day closure overlaps with every partial closure on the same date — creating a full-day closure when any partial closure already exists for that date, or vice versa, is a conflict

**Factory:** `ScheduleClosure.close(tenantId, date, reason, createdBy, startTime?, endTime?, notes?)`

---

#### **Aggregate: ScheduleOpening** (Root Entity)
Represents an **exception** that opens the schedule on a day that `business_hours` marks as closed (e.g., a normally-closed Sunday opened for a special event). `ScheduleOpening` is the inverse of `ScheduleClosure`: it overrides a recurring "closed" day with a specific operating window.

`ScheduleOpening` is only meaningful when `business_hours[dayOfWeek] = null`. On a day that is already open in `business_hours`, creating an opening exception is invalid (use the `business_hours` settings to change the regular hours instead).

**Entities within:**
- `ScheduleOpening` (root)

**Properties:**
```
ScheduleOpening {
  id:        ScheduleOpeningId
  tenantId:  TenantId
  date:      String (YYYY-MM-DD — calendar date in tenant timezone)
  startTime: String  (HH:MM, 24-hour — required; opening always has explicit hours)
  endTime:   String  (HH:MM, 24-hour — required)
  notes:     String | null
  createdBy: StaffId
  createdAt: DateTime
}
```

**Invariants:**
- `date` cannot be in the past
- `endTime > startTime`
- `startTime` and `endTime` are valid HH:MM strings
- The day-of-week derived from `date` must be closed in `business_hours` (cannot create an opening for an already-open day)
- Only one `ScheduleOpening` per `(tenantId, date)` is allowed

**Factory:** `ScheduleOpening.open(tenantId, date, startTime, endTime, createdBy, notes?)`

---

#### **Three-Layer Schedule Resolution (Availability Algorithm)**
The availability algorithm resolves the effective operating window for any given date using three layers in priority order:

```
1. ScheduleOpening  (highest priority — specific date override: open a normally-closed day)
2. ScheduleClosure  (block a normally-open day or a time window within it)
3. business_hours   (lowest priority — the recurring weekly pattern)
```

Resolution logic per date:
```
if ScheduleOpening exists for (tenantId, date):
    effective_hours = { open: opening.startTime, close: opening.endTime }
    skip ScheduleClosure and business_hours checks  ← opening takes full priority
elif business_hours[dayOfWeek] = null:
    return []  ← day is closed; no opening exists to override it
elif full-day ScheduleClosure exists for (tenantId, date):
    return []  ← entire day is blocked
else:
    effective_hours = business_hours[dayOfWeek]
    filter out any slots that overlap partial ScheduleClosures for this date
```

**`IBookingAvailabilityPort` (cross-context read port — Booking Context)**

The Booking Context exposes a read-only port for the availability algorithm to consume without a direct dependency on the Booking aggregate:

```typescript
interface IBookingAvailabilityPort {
  // Single-date detail: used by GetAvailabilityUseCase (Phase 2)
  findApprovedByTenantAndDate(tenantId: string, date: string): Promise<BookedSlot[]>;

  // Date-range batch: used by GetAvailabilitySummaryUseCase (Phase 1)
  findApprovedByTenantAndDateRange(tenantId: string, from: string, to: string): Promise<BookedSlot[]>;
}

interface BookedSlot {
  scheduledAt: Date;       // UTC
  totalDurationMins: number;
}
```

The real adapter (`TypeOrmBookingAvailabilityAdapter`) is implemented in M07 when the Booking aggregate exists. A stub returning `[]` is used in M06 — availability shows all slots as open until bookings exist.

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

**Properties:**
```
Customer {
  customerId:     CustomerId
  tenantId:       TenantId
  googleOAuthId:  String (unique from Google)
  email:          Email
  phone:          Phone
  name:           String
  defaultAddress: Address | null   -- optional; pre-fills both contactAddress and pickupAddress on the booking form.
                                   -- The booking always stores its own copy — this is convenience only.
  createdAt:      DateTime
  updatedAt:      DateTime
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

A single record of points earned by a customer for one completed service. Append-only: rows are inserted on `BookingCompleted` and **never updated or deleted**. `expiresAt` marks when the points contributed by this entry stop being valid; the `loyalty_balances` decrement is applied by `POST /cron/loyalty-expiry` (triggered by GCP Cloud Scheduler) when that date passes.

**Properties:**
```
LoyaltyEntry {
  entryId:        LoyaltyEntryId      (UUID)
  tenantId:       TenantId
  customerId:     CustomerId
  bookingId:      BookingId
  bookingLineId:  BookingLineId       (one entry per line — UNIQUE(tenantId, bookingLineId))
  serviceId:      ServiceId
  points:         int                 (positive; = BookingLine.pointsValueAtBooking, frozen)
  earnedAt:       DateTime
  expiresAt:      DateTime            (= earnedAt + tenants.settings.loyalty.expiry_days)
}
```

**One entry per `BookingLine`.** A booking with 3 lines → 3 `LoyaltyEntry` rows on completion. Idempotency is enforced by `UNIQUE(tenantId, bookingLineId)` — replaying `BookingCompleted` is a guaranteed no-op.

---

#### **Aggregate: LoyaltyBalance** (Root Entity, mutable)

Running active point total per `(tenant_id, customer_id)`. Updated atomically whenever points are earned, redeemed, or expire. Provides O(1) balance reads.

**Properties:**
```
LoyaltyBalance {
  tenantId:       TenantId            (composite PK with customerId — no surrogate id)
  customerId:     CustomerId
  currentPoints:  int                 (≥ 0; CHECK constraint at DB level)
  updatedAt:      DateTime
}
```

**Methods:**
- `increment(points: number): void` — called after a `LoyaltyEntry` is persisted.
- `decrement(points: number): void` — called on redemption or point expiry; throws `LoyaltyInsufficientPointsError` if `currentPoints < points`.

**Invariant:** `currentPoints >= 0` always. The DB `CHECK (current_points >= 0)` enforces this at persistence level.

---

#### **Aggregate: LoyaltyRedemption** (Root Entity, immutable)

Append-only audit record of a point redemption performed by an admin. Never updated.

**Properties:**
```
LoyaltyRedemption {
  id:              UUID
  tenantId:        TenantId
  customerId:      CustomerId
  pointsRedeemed:  int                (positive)
  redeemedBy:      StaffId
  notes:           string?            (optional admin note)
  bookingId:       UUID?              (nullable — the booking the points were applied to)
  redeemedAt:      DateTime
}
```

**Rules:** The redemption row and the `LoyaltyBalance` decrement are written in the same transaction. If the customer has insufficient points, `RedeemPointsUseCase` throws `LoyaltyInsufficientPointsError` before touching the DB.

---

**What this model intentionally does NOT support (MVP):**
- Manual point adjustments / bonus rows by admin.
- Tier labels (BRONZE / SILVER / GOLD) — the admin reads raw active-point totals and decides what to offer.

These are easy to add later as new event types if the business needs them.

---

### **Notification Context**

#### **Aggregate: NotificationTemplate** (Root Entity)
Email template definitions **per tenant**.

**Properties:**
```
NotificationTemplate {
  id: TemplateId
  tenantId: TenantId | null (null = platform-wide default template, used when no tenant override exists)
  triggerEvent: NotificationTemplateKey (e.g., "BOOKING_APPROVED" — which domain event/trigger this template renders for)
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP'
  subject: String (can include placeholders like {{customerName}})
  body: String (template with placeholders — plain/HTML depending on channel)
  updatedAt: DateTime
}
```

**Interpolation:** there is no declared `variables` list. `render(variables)` interpolates by
running a `{{key}}` regex directly over `subject`/`body` at send time and substituting from the
supplied `variables` map (unmatched keys resolve to an empty string).

**Methods:**
- `static create(props)` — validates `subject`/`body` are non-empty
- `update(subject, body)` — replaces subject/body, re-validates non-empty
- `render(variables)` — returns `{ subject, body }` with `{{key}}` placeholders interpolated

#### **Aggregate: NotificationLog** (Root Entity)
Audit trail of every notification send attempt **per tenant**. Not used for idempotency — that is handled by `ProcessedEvent` / `notification.processed_events`.

**Properties:**
```
NotificationLog {
  id: UUID v7
  tenantId: string
  eventId: string                    ← source domain event's eventId
  notificationType: string           -- aggregate types this as plain string, not a literal union
  channel: string                    -- aggregate types this as plain string, not a literal union
  recipientEmail: string
  status: 'PENDING' | 'SENT' | 'FAILED'
  retryCount: integer (default 0)
  errorMessage?: string
  sentAt?: DateTime
  createdAt: DateTime
}
```

**Methods:**
- `static create(props)` — creates with `status='PENDING'`, `retryCount=0`
- `markSent()` — transitions to `SENT`, sets `sentAt=now()`
- `markFailed(errorMessage)` — transitions to `FAILED`, increments `retryCount`, stores message

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
- `StaffRole` (MANAGER, STAFF) [foundation for future role-based access]

**Properties:**
```
Staff {
  staffId: StaffId
  tenantId: TenantId (staff belongs to exactly ONE tenant)
  googleOAuthId: String | null (unique from Google; null until first login/activation)
  email: Email
  name: String | null
  role: StaffRole
  isActive: Boolean
  invitedBy: StaffId | null
  deactivatedBy: StaffId | null
  createdAt: DateTime
  updatedAt: DateTime
}

Constraint: global UNIQUE(googleOAuthId) — partial index, WHERE google_oauth_id IS NOT NULL
  (NOT composite with tenantId)
  This means: Same person can NEVER be staff in multiple tenants
  (But same person CAN be customer in multiple tenants)

> Per CLAUDE.md §2 invariant #6: "Staff are single-tenant — global UNIQUE(google_oauth_id) at
> DB level (not composite with tenant_id — the same Google account cannot be staff at two
> different tenants)."
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

### **Staff Context Events**

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `StaffInvited` | New staff member invited (UC-028) or first MANAGER created during tenant provisioning (M04-S06) | Notification Context (invitation email) |
| `StaffDeactivated` | MANAGER deactivates a staff member (UC-029) | None in MVP |

### **Notification Context Events**

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `EmailSent` | Email successfully sent | Audit (optional) |
| `EmailFailed` | Email delivery failed | Retry queue |

---

## Value Objects Reference

> **Shared value objects:** `Money` and `Address` are used by multiple contexts (Booking, Customer, Loyalty). They live in `src/shared/value-objects/` — **not** inside any single context. Contexts import them from shared. All other value objects below (`Email`, `Phone`, `TimeSlot`, etc.) follow the same rule if used across contexts; otherwise they live inside their own context's `domain/value-objects/`.

### **Address**
Brazilian postal address. Lives in `src/shared/value-objects/address.ts`. Used for customer `defaultAddress` and booking `pickupAddress`.
```
Address {
  street:       String          -- logradouro (e.g. "Rua das Flores")
  number:       String          -- número (e.g. "123")
  complement:   String | null   -- complemento (e.g. "Apto 4B", "Bloco C") — optional
  neighborhood: String          -- bairro (e.g. "Centro")
  city:         String          -- cidade (e.g. "Belo Horizonte")
  state:        String          -- UF, 2 chars (e.g. "MG")
  zipCode:      String          -- CEP, 8 digits no hyphen (e.g. "30130010")
}
```
- Immutable (value object — replace, never mutate)
- `zipCode` must match `/^\d{8}$/`
- `state` must be a valid Brazilian UF

### **Email**
- Validates RFC 5322 format
- Immutable
- Comparable by value

### **Phone**
- Validates phone number format (Brazilian mobile/landline)
- Stores in E.164 format (`+55...`)
- Immutable

### **Money**
Lives in `src/shared/value-objects/money.ts`.
- Amount (Decimal — never float)
- Currency (always `'BRL'` — Ikaro is Brazil-only)
- Display format: `R$ 1.234,56` (Brazilian locale)
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

### **Expiration window (`loyalty.expiry_days`)**
Configurable **per tenant** via `tenants.settings.loyalty.expiry_days` (integer, days). Typical values: 180 (6 months) or 365 (1 year). Defaults to 180 if unset.

When a `LoyaltyEntry`'s `expiresAt` passes:
- The entry stops contributing to active balance (query-time filter — nothing is mutated).
- No event is emitted. Customers are warned **in advance** via the weekly `PointsExpiringSoon` cron (see Domain Service `LoyaltyService.notifyExpiringSoon()`).

> The previous `LoyaltyStatus` enum (`BRONZE / SILVER / GOLD`) has been removed. The admin reads raw active-point totals and decides when to offer rewards — there is no automated tier in MVP.

---

## Context Map & Communication

```
┌─────────────────────────────────────────────────────────────┐
│                      Booking Context                         │
│  (Request, Approve, Reject, Complete, Cancel bookings)      │
│  Events: BookingRequested, BookingApproved, BookingRejected,│
│          BookingInfoRequested, BookingInfoSubmitted,         │
│          BookingCompleted, BookingCancelled,                 │
│          BookingRescheduled, BookingReminderDue,             │
│          BookingReminderDueToday, AdminDailyScheduleReminder │
└──────────────┬──────────────────────────────────────────────┘
               │
         ┌─────┴──────┬──────────────┬─────────────┐
         │             │              │             │
    ┌────▼────┐  ┌────▼───┐  ┌──────▼──┐  ┌──────▼──┐
    │Customer │  │Loyalty │  │ Notify  │  │ Staff   │
    │Context  │  │Context │  │ Context │  │Context  │
    └─────────┘  └────────┘  └─────────┘  └─────────┘
                                               │
                              StaffInvited, StaffDeactivated
                              (published by Staff Context)

Booking → Loyalty: BookingCompleted only (inserts LoyaltyEntry per line)
Booking → Notification: all lifecycle events → emails
Staff  → Notification: StaffInvited → invitation email
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
- `TenantProvisioned` — consumed by Staff Context (creates first MANAGER staff row + publishes `StaffInvited`)

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
  seo:           SeoMetadata     -- { title, description } — tenant SEO overrides, both nullable
  isPublished:   Boolean         -- false = draft; true = visible at /<slug>
  updatedAt:     DateTime
}
```

**Layout modules (types):** `HERO`, `SERVICE_LIST`, `GALLERY`, `TESTIMONIALS`, `BOOKING_CTA`, `ABOUT`, `CONTACT`.

**Key methods:**
- `updateContent(branding, layout, seo)` → replaces branding, layout, and seo; stays in draft until published.
- `publish()` → sets `isPublished = true`; hotsite becomes publicly visible.
- `unpublish()` → reverts to draft.

---

## Anti-Corruption Layer (Future)

When integrating external services (e.g., payment provider, SMS service), create an anti-corruption layer to translate external models to our domain models. Not needed for MVP.


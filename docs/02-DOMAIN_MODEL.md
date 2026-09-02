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
- A GCP Cloud Scheduler job publishes to the `ikaro-cron-loyalty-expiry` Pub/Sub topic at 02:00 UTC daily; the push subscription dispatches to `ExpirePointsTriggerHandler`, which decrements `loyalty_balances.current_points` for entries whose `expires_at` has passed (idempotent via `balance_expiry_log`). `POST /cron/loyalty-expiry` publishes the same trigger for local/manual use (M17-S03).

**Responsibilities:**
- Append a `LoyaltyEntry` and increment `LoyaltyBalance` when `BookingCompleted` is consumed and the booking has a `customerId`.
- Allow admin to record a redemption — decrement `LoyaltyBalance` atomically with the `LoyaltyRedemption` insert.
- Run `ExpirePointsJob` daily (triggered by GCP Cloud Scheduler via Pub/Sub, `POST /cron/loyalty-expiry` locally) to decrement balances for expired entries.
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
- `BookingStatus` (PENDING, INFO_REQUESTED, APPROVED, REJECTED, COMPLETED, CANCELLED, NO_SHOW — the last added by M21 Cluster 3, not live until that milestone ships)
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
  discountPointsUsed: number | null    -- loyalty points redeemed against this booking, if any
  discountAmount:     Money | null     -- monetary value of the redeemed points
  notes:              String | null    -- free-text notes distinct from adminNotes below
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
- `cancelBooking(actor, reason?)` → validates `tenants.settings.booking.cancellationWindowHours` rule, transitions to `CANCELLED`, publishes `BookingCancelled`.
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

  -- Added M21 — Multi-Vertical Scheduling, Cluster 2 (Service extensions + availability engine).
  -- Today's car wash is the degenerate case: bookingModel='APPOINTMENT', resourceRequirements=[{type:LOCATION, selectionMode:NONE}] —
  -- no migration pain, existing services default straight into this (backfilled alongside the M21 Cluster 1 LOCATION resource).
  bookingModel:           'APPOINTMENT' | 'SESSION'   -- NOT NULL DEFAULT 'APPOINTMENT'; immutable once the service has bookings (UC-056 A1)

  -- APPOINTMENT only — mutually exclusive with legs (UC-052 A1):
  resourceRequirements:   ResourceRequirement[]        -- flat (non-legged) requirement set; [] on a legged or SESSION service
  bufferAfterMinutes:     int | null                   -- "extra cleanup this service needs, regardless of resource"; null on
                                                        -- legged services (meaningless there — legs use per-leg transition gaps
                                                        -- instead, UC-053 A1). Pre-filled from the tenant's serviceBufferMinutes
                                                        -- default at creation, then a genuine per-service override (UC-053).

  -- APPOINTMENT only — mutually exclusive with resourceRequirements/bufferAfterMinutes (UC-052):
  legs:                   ServiceLeg[] | null           -- ordered sequential stages, each with its own resource requirement(s)

  -- APPOINTMENT only — booking policy (UC-055). Every field null inherits the matching tenant
  -- `settings.booking` default; every booking snapshots the *effective* value at submission time,
  -- so a later policy edit never retroactively changes a submitted booking.
  defaultApprovalMode:            'AUTO_CONFIRM' | 'MANUAL_APPROVAL' | null   -- null inherits tenant `autoApproveEnabled`
  manualHoldMinutes:               int | null                                -- null inherits platform default (30 min)
  cancellationWindowHoursOverride: int | null                                -- null inherits tenant `cancellationWindowHours`
  rescheduleWindowHoursOverride:   int | null                                -- null inherits the same effective value as
                                                                              -- cancellationWindowHoursOverride (no separate
                                                                              -- tenant-level reschedule default exists today)
  minBookingAdvanceHoursOverride:  int | null                                -- null inherits tenant `minBookingAdvanceHours`
  maxBookingAdvanceDaysOverride:   int | null                                -- null inherits tenant `maxBookingAdvanceDays`
  recurrenceEligible:              Boolean                                  -- default false; gates CAND-45 (Cluster 3)
  availabilityAlertEligible:       Boolean                                  -- default false; gates CAND-46 (Cluster 3)

  -- APPOINTMENT only — variable-duration reservation (UC-055 step 4, §6b of the discovery doc).
  -- durationPolicy=FIXED is every existing service, unchanged; the four fields below are meaningless
  -- (null) unless durationPolicy=CUSTOMER_SELECTED.
  durationPolicy:              'FIXED' | 'CUSTOMER_SELECTED'   -- default FIXED
  durationMinMinutes:          int | null                      -- set iff CUSTOMER_SELECTED
  durationMaxMinutes:          int | null                      -- set iff CUSTOMER_SELECTED; >= durationMinMinutes
  durationIncrementMinutes:    int | null                      -- set iff CUSTOMER_SELECTED — booking-selection granularity,
                                                                -- independent of pricingIncrementMinutes below (UC-055 A2 note)
  pricingPolicy:               'FIXED' | 'PER_TIME_INCREMENT'  -- default FIXED; PER_TIME_INCREMENT requires CUSTOMER_SELECTED
  pricingIncrementMinutes:     int | null                      -- set iff PER_TIME_INCREMENT — billing granularity, a genuinely
                                                                -- separate number from durationIncrementMinutes
  pricePerIncrementAmount:     Money | null                    -- set iff PER_TIME_INCREMENT
  minimumChargeAmount:         Money | null                    -- optional floor applied after the per-increment calculation

  -- SESSION only — schema exists from Cluster 2 (populated by UC-056's SESSION branch), consumed by
  -- ClassScheduleTemplate once Cluster 4 ships (CAND-11). Never set alongside resourceRequirements/legs.
  classResourceSlots:     ClassResourceSlot[] | null
}
```

**New value objects (M21 Cluster 2):**

```
ResourceRequirement {
  type:            ResourceType                                    -- LOCATION | STAFF | ROOM | EQUIPMENT
  selectionMode:   'NONE' | 'CUSTOMER_CHOICE' | 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL'
  resourcePoolIds: ResourceId[] | null                              -- optional restriction to a subset of active resources
                                                                     -- of that type; unrestricted (every active resource of
                                                                     -- that type is eligible) when null
  requiredQuantity: int                                             -- default 1; allocate this many distinct eligible
                                                                     -- resources atomically (variable-duration multi-unit case)
}

ServiceLeg {
  legIndex:                     int
  name:                         String
  durationMinutes:              int
  resourceRequirements:         ResourceRequirement[]   -- >= 1; a leg can need more than one resource at once
  transitionGapAfterMinutes:    int                      -- customer transition time before the NEXT leg; not applied
                                                          -- after the last leg. Independent of resource turnover.
}

ClassResourceSlot {
  type:                ResourceType            -- also the key — no slotIndex; no worked example ever needs two slots
                                                 -- of the same type on one service
  eligibleResourceIds: ResourceId[]             -- the pool. Declared once per Service, shared by every
                                                 -- ClassScheduleTemplate of it (Cluster 4) — each template picks exactly
                                                 -- one resourceId per slot from this list, manually, at template-creation time.
}
```

**New invariants (M21 Cluster 2, enforced by the aggregate):**
- `bookingModel` is immutable once the service has any booking history (UC-056 A1).
- `resourceRequirements`/`legs`/`classResourceSlots` are mutually exclusive: a flat APPOINTMENT service sets `resourceRequirements` (`legs = null`); a legged APPOINTMENT service sets `legs` (`resourceRequirements = []`, `bufferAfterMinutes = null`); a SESSION service sets `classResourceSlots` (`resourceRequirements = []`, `legs = null`).
- A bundle (`resourceRequirements.length > 1`) requires every listed resource type to have at least one active `Resource` — UC-051's own precondition (generalizing UC-050 A1's single-type error mechanism to the bundle case), structurally the same check `Resource.create()` doesn't need to make but `Service`'s resource-requirement config does.
- `durationPolicy = CUSTOMER_SELECTED` requires a non-null, non-`FIXED` `pricingPolicy` in the same save (UC-055 A2) — since `pricingPolicy` defaults to `FIXED`, a plain non-null check would never actually reject anything; the service must explicitly declare a real pricing method (`PER_TIME_INCREMENT`) for a variable-duration slot, not silently stay on the default.

---

#### **Aggregate: Resource** (Root Entity)

> Introduced by M21 — Multi-Vertical Scheduling, Cluster 1 (Foundation). See `docs/discovery/multivertical-booking/multivertical-booking.md` §3 for full rationale.

Generic bookable unit — the abstraction that lets availability be scoped to something narrower than "the whole tenant." Owned by the Booking Context (same context that already owns `ScheduleClosure`/`ScheduleOpening`) rather than by Staff Context, so scheduling concerns stay centralized.

**Entities within:**
- `Resource` (root)

**Value Objects:**
- `ResourceId` (UUID)
- `ResourceType` enum: `LOCATION | STAFF | ROOM | EQUIPMENT`

**Properties:**
```
Resource {
  resourceId:      ResourceId
  tenantId:        TenantId
  type:            ResourceType
  refId:           StaffId | null    -- set only when type = STAFF; wraps an existing Staff row by reference
  name:            String            -- denormalized display name, independent of Staff.name
  workingHours:    BusinessHours | null  -- same per-weekday shape as tenants.settings.businessHours,
                                          -- without a timezone key (inherits the tenant's);
                                          -- null = inherits tenant hours
  turnoverMinutes: int               -- default 0; minutes this resource needs before its next booking,
                                      -- regardless of which service ran (wired into availability in Cluster 2)
  maxCapacity:     int | null        -- optional physical ceiling for LOCATION/ROOM and genuinely
                                      -- capacity-bearing EQUIPMENT; never set for STAFF
  isActive:        Boolean
  createdAt:       DateTime
  updatedAt:       DateTime
}
```

**Three different relationships to existing data, by design:**
- **`LOCATION`** — the degenerate default every tenant gets. Replaces today's implicit "whole tenant is the resource" behavior with an explicit row. Every existing tenant receives exactly one active `LOCATION` resource during the M21 backfill migration; there is no legacy `resourceId = null` path on a `Service`'s resource requirements (Cluster 2). `resourceId IS NULL` on a `ScheduleClosure`/`ScheduleOpening` remains its own, separate "close/open the whole business" sentinel — backfilling `LOCATION` does not retire it.
- **`STAFF`** — *wraps* an existing `Staff` aggregate by reference (`refId = staffId`). Staff Context stays pure identity/permissions; scheduling data (working hours, turnover) lives on the `Resource` row, not on `Staff` itself. Mirrors the existing rule that Staff Context reads closures but never writes them.
- **`ROOM` / `EQUIPMENT`** — no other context owns these; the `Resource` row *is* the aggregate.

**Tenant boundary and resource schedule resolution:** the tenant calendar is a hard outer boundary, resolved first using the existing Three-Layer Schedule Resolution below. A resource can be available only inside that resulting tenant window — a resource opening never bypasses a tenant-wide closure or extends beyond a tenant opening/window; every `workingHours` window must be a subset of the tenant's recurring business-hours window. Changing resource hours, adding a resource-scoped closure, or deactivating a resource is a change to future availability only — already-approved appointments and already-materialized sessions (Clusters 3–4) remain explicit commitments even if they now fall outside the new default.

**Invariants (enforced by the aggregate, not just the DB):**
- `(type = 'STAFF') ⟺ (refId IS NOT NULL)` — a staff wrapper must reference a Staff ID; every other resource type must not.
- One `Resource` per `Staff` row — a staff member cannot be wrapped twice.
- Exactly one active `LOCATION` resource per tenant; a `LOCATION` resource's `type` can never change, and no other resource can become `LOCATION` — both creation and correction are backfill-only.
- Every `workingHours` window is a subset of the tenant's recurring business-hours window.
- `maxCapacity`, when set, is `> 0` and never set for `STAFF`; template/session capacity referencing this resource (Cluster 4) cannot exceed it.
- Deactivating a `Resource` never silently cancels or demotes an existing approved appointment or materialized session — it stops future scheduling only and surfaces a resolution worklist (UC-047).

**Key Methods:**
- `Resource.create(tenantId, type, name, workingHours?, refId?, maxCapacity?)` — validates the `STAFF`⟺`refId` invariant and the working-hours subset invariant.
- `update(name, type, refId, workingHours, turnoverMinutes, maxCapacity)` (UC-046) — a manager can correct any field, including `type`/`refId`, without deactivate+recreate; re-runs the same invariants `create()` enforces, plus the `LOCATION`-type-immutability guard.
- `deactivate()` (UC-047) / `reactivate()` (UC-049)

**Cross-context note:** a `STAFF`-type `Resource` has no DB-level FK to `staff.staff` (cross-schema) — Booking validates the referenced staff member (same-tenant, existing, active, schedulable) through a narrow lookup adapter at write time, and consumes the Staff Context's `StaffDeactivated` event to cascade-deactivate the wrapping resource (UC-048). Staff Context remains unaware of Booking.

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
  resourceId: ResourceId | null  (null = tenant-wide, the "close the whole business" sentinel;
                                  set = scoped to one Resource. Added by M21 Cluster 1.)
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
- No two closures for the same `(tenantId, resourceId, date)` may have overlapping time windows; this is enforced by the use case before persisting (the DB index alone cannot express arbitrary range overlap). `resourceId = null` and a set `resourceId` are independent keys — a tenant-wide closure and a resource-scoped closure for the same date do not collide with each other at this layer (the resource-scoped one is simply redundant while the tenant-wide one is active).
- A full-day closure overlaps with every partial closure on the same `(tenantId, resourceId)` and date — creating a full-day closure when any partial closure already exists for that date, or vice versa, is a conflict
- **Resource scope, added M21 Cluster 1:** `resourceId = null` blocks every resource at the tenant (today's exact behavior, unchanged default). `resourceId` set blocks only that resource's calendar; a resource closure removes time from that resource even when a tenant-wide opening exists for the same date.

**Factory:** `ScheduleClosure.close(tenantId, date, reason, createdBy, resourceId?, startTime?, endTime?, notes?)`

---

#### **Aggregate: ScheduleOpening** (Root Entity)
Represents an **exception** that opens the schedule on a day that `businessHours` marks as closed (e.g., a normally-closed Sunday opened for a special event). `ScheduleOpening` is the inverse of `ScheduleClosure`: it overrides a recurring "closed" day with a specific operating window.

`ScheduleOpening` is only meaningful when `businessHours[dayOfWeek] = null`. On a day that is already open in `businessHours`, creating an opening exception is invalid (use the `businessHours` settings to change the regular hours instead).

**Entities within:**
- `ScheduleOpening` (root)

**Properties:**
```
ScheduleOpening {
  id:        ScheduleOpeningId
  tenantId:  TenantId
  resourceId: ResourceId | null  (null = tenant-wide; set = scoped to one Resource. Added by M21 Cluster 1.)
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
- The day-of-week derived from `date` must be closed in `businessHours` (cannot create an opening for an already-open day)
- Only one `ScheduleOpening` per `(tenantId, date)` when `resourceId IS NULL`, and only one per `(tenantId, resourceId, date)` when `resourceId` is set — a tenant-wide opening and a resource-scoped opening for the same date do not collide with each other (M21 Cluster 1; see `docs/13-DATABASE_SCHEMA.md` for the two-partial-unique-index DB fix this required, since a plain `NULL`-inclusive unique index stops enforcing "one per date" once `resourceId` becomes nullable)
- A resource opening can make that resource available on one of its normally-off dates, but never outside the tenant's own effective hours for that date

**Factory:** `ScheduleOpening.open(tenantId, date, startTime, endTime, createdBy, resourceId?, notes?)`

---

#### **Three-Layer Schedule Resolution (Availability Algorithm)**
The availability algorithm resolves the effective operating window for any given date using three layers in priority order:

```
1. ScheduleOpening  (highest priority — specific date override: open a normally-closed day)
2. ScheduleClosure  (block a normally-open day or a time window within it)
3. businessHours   (lowest priority — the recurring weekly pattern)
```

Resolution logic per date:
```
if ScheduleOpening exists for (tenantId, date):
    effective_hours = { open: opening.startTime, close: opening.endTime }
    skip ScheduleClosure and businessHours checks  ← opening takes full priority
elif businessHours[dayOfWeek] = null:
    return []  ← day is closed; no opening exists to override it
elif full-day ScheduleClosure exists for (tenantId, date):
    return []  ← entire day is blocked
else:
    effective_hours = businessHours[dayOfWeek]
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

**Changed by M21 — Multi-Vertical Scheduling, Cluster 2 (Service extensions + availability/exclusivity engine).** Once a `Service.resourceRequirements`/`legs` can reference something other than the implicit whole tenant, `IBookingAvailabilityPort`'s real adapter moves from querying `bookings` directly to querying `booking.resource_occupancy` — the per-resource, per-window projection availability needs, since one booking's `scheduledAt`/`totalDurationMins` can no longer answer "is resource X free" once a booking can span a bundle or leg chain with a different sub-window per resource. `BookedSlot` changes shape accordingly:

```typescript
interface IBookingAvailabilityPort {
  findOccupancyByTenantAndResource(tenantId: string, resourceIds: string[], from: string, to: string): Promise<ResourceOccupiedSlot[]>;
}

interface ResourceOccupiedSlot {
  resourceId: string;
  startsAt: Date;   // UTC
  endsAt: Date;     // UTC — includes the effective service buffer / resource turnover (UC-059)
}
```

`bookings`/`booking_lines` remain the source of truth for the booking itself (status, contact, price); `resource_occupancy` is a short-lived locking projection, safely garbage-collectable once its window elapses (see `docs/13-DATABASE_SCHEMA.md`).

**UC-058 (`System Computes Availability Scoped to a Resource or Bundle`) — algorithm:**
1. For a bundle (`resourceRequirements.length > 1`), a slot is available only if **every** required resource is simultaneously free (intersection).
2. For `AUTO_FUNGIBLE_POOL`, a slot is available if **any** pool member is free (union, not intersection).
3. A `resourceId` not belonging to the querying tenant is excluded by the mandatory `tenantId` scoping — structural guard, not a runtime branch.
4. **Extended in Cluster 3** (once `RecurringBookingSchedule` exists) and **Cluster 4** (once `ClassScheduleTemplate` exists): "free" also excludes any active recurring pattern that would produce an occurrence at the candidate time, evaluated directly against the pattern's own recurrence rule rather than waiting for a materialized row — see UC-058's own entry in `docs/04-USE_CASES.md` for the forward reference. Not reachable in Cluster 2 alone, since neither aggregate exists yet.

**UC-059 (`System Applies Resource Turnover and Leg Transition Gaps`):** effective gap before the next booking on a resource, for a flat (non-legged) service: `max(service.bufferAfterMinutes, resource.turnoverMinutes)`. For a legged service: each leg's resource turnover comes from that resource's own `turnoverMinutes`; `transitionGapAfterMinutes` is independent and additive to the appointment's total span.

**UC-060 (`System Rejects Overlapping Bookings Across a Shared Resource`) — why `resource_occupancy` has to be one shared table, not one per family:** `bookings` today carries the only DB-level guarantee behind CLAUDE.md §2's "cross-row invariant → enforce at the DB layer" rule (`EX_booking_bookings_approved_slot`, `docs/13-DATABASE_SCHEMA.md`). That works today because there's exactly one thing to protect: the whole tenant, one row per booking. Once a booking can lock a *bundle* of resources or a different resource per *leg*, there's no longer one row per booking to key an exclusion constraint on — the granularity has to move to one row per resource-assignment. Postgres exclusion constraints cannot span two tables, so if appointment resource-locks and (once Cluster 4 ships) class-session resource-locks lived in separate tables, cross-family exclusivity (the Camila-Duarte-as-both-hairdresser-and-Pilates-instructor scenario, §3 above) could never be DB-enforced no matter how well either table were built individually. `booking.resource_occupancy` (see `docs/13-DATABASE_SCHEMA.md`) is the fix: one shared GIST exclusion constraint, keyed on `(tenant_id, resource_id, [starts_at, ends_at))`, protects every family that ever writes into it. In Cluster 2, only the `BOOKING_LINE` source type is reachable (`CLASS_SESSION` activates once Cluster 4 ships `ClassSession`) — same-family exclusivity (two APPOINTMENT services sharing a resource) is fully provable now; the cross-family case (model #13, this discovery's central premise) isn't testable until Cluster 4 exists alongside Clusters 2–3.

---

#### **Aggregate: RecurringBookingSchedule** (Root Entity)

> Introduced by M21 — Multi-Vertical Scheduling, Cluster 3 (Customer/guest appointment booking + extensions). Private-appointment recurrence, distinct from `RecurringEnrollment` (session family, Cluster 4).

Customer-only standing commitment: "every Tuesday 10:00–12:00, Sala Aurora." Blocks its future recurrence pattern beyond the materialization horizon and generates ordinary linked `Booking` rows through a rolling horizon (90-day service-configurable default).

**Entities within:**
- `RecurringBookingSchedule` (root)
- `RecurringBookingScheduleResourceAssignment` (child — durable, mandatory for `FIXED_ASSIGNMENT`)
- `RecurringBookingScheduleException` (child — one per skipped/rescheduled occurrence)

**Properties:**
```
RecurringBookingSchedule {
  id:                       RecurringBookingScheduleId
  tenantId:                 TenantId
  customerId:               CustomerId              -- guest bookings are never eligible
  serviceId:                ServiceId
  recurrence:               RecurrenceRule           -- e.g. { frequency: WEEKLY, daysOfWeek: [TUE], startTime: "10:00", durationMinutes: 120 }
  startsOn / endsOn:        Date / Date | null       -- open-ended when endsOn is null
  status:                   'PENDING_APPROVAL' | 'ACTIVE' | 'PAUSED' | 'CANCELLED'
  assignmentPolicy:         'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE'
  approvalHoldExpiresAt:    DateTime | null          -- required iff status = PENDING_APPROVAL
  approvedByStaffId:        StaffId | null
  approvedAt:               DateTime | null
  cancellationReason:       'CUSTOMER_CANCELLED' | 'APPROVAL_REJECTED' | 'APPROVAL_EXPIRED' | null
  createdByStaffId:         StaffId | null           -- set when staff creates it on the customer's behalf
  createdAt / updatedAt:    DateTime
}
```

**Invariants:**
- Guest bookings are never eligible — customer-only, or staff acting on an authenticated customer's behalf.
- Branches on the service's effective approval mode at creation (UC-070): `AUTO_CONFIRM` → created `ACTIVE` directly, generation begins immediately. `MANUAL_APPROVAL` → created `PENDING_APPROVAL` with a snapshotted `approvalHoldExpiresAt`; **no occurrences generate until staff resolves it** (UC-071) — this closes a create-then-cancel loophole that would otherwise let a customer bypass a `MANUAL_APPROVAL` service's review gate by requesting a recurring schedule instead of a one-off booking.
- Once `ACTIVE`, every occurrence it materializes auto-confirms as `APPROVED` regardless of the service's `defaultApprovalMode` — the standing schedule itself was already vetted once, at the point it became `ACTIVE`; re-running a hold-and-review cycle on every generated occurrence would contradict the entire point of a standing commitment. A genuinely one-off booking of the same service is unaffected — `defaultApprovalMode` still governs it normally.
- At most `MAX_ACTIVE_SCHEDULES_PER_RESOURCE = 50` active `FIXED_ASSIGNMENT` schedules per resource; at most `MAX_ACTIVE_RESOLVE_PER_OCCURRENCE_SCHEDULES_PER_SERVICE = 50` active `RESOLVE_PER_OCCURRENCE` schedules per service — app-enforced, generous conservative placeholders, revisable after load testing.
- A future pattern conflict at creation blocks the whole request — no partial schedule ever exists (evaluated via the same advisory-lock protocol `docs/13-DATABASE_SCHEMA.md`'s `resource_occupancy` section describes for not-yet-materialized patterns).
- Generated bookings link back via a nullable `recurringScheduleId` on `Booking`, with a unique `(tenantId, recurringScheduleId, occurrenceStart)` generation key — same idempotency shape `ClassSessionBooking.seriesId` uses for the session family (Cluster 4).

**Key Methods:**
- `RecurringBookingSchedule.request(customerId, serviceId, recurrence, assignmentPolicy, ...)` — resource-conflict-checks, then branches to `ACTIVE` or `PENDING_APPROVAL` per the service's effective approval mode.
- `approve(staffId)` / `reject(staffId, reason)` (UC-071)
- `skipOccurrence(occurrenceStart, actor, reason?)` / `rescheduleOccurrence(occurrenceStart, replacementBookingId, actor)` (UC-045 A2) — only once `ACTIVE`; a `PENDING_APPROVAL` request is withdrawn outright instead, since no standing commitment exists yet.
- `pause()` / `end()`

---

#### **Aggregate: AvailabilityAlert** (Root Entity)

> Introduced by M21 Cluster 3. An expiring intent only — creates no occupancy and never becomes a booking automatically. Authenticated-customer-only (waitlists/alerts are retention features, not anonymous lead capture).

**Entities within:**
- `AvailabilityAlert` (root)
- `AvailabilityAlertNotificationAttempt` (child — notification history, deduplicated per matching window)

**Properties:**
```
AvailabilityAlert {
  id:                    AvailabilityAlertId
  tenantId:              TenantId
  serviceId:             ServiceId
  customerId:            CustomerId              -- authenticated only, no guest email identity column
  preferredResourceId:   ResourceId | null
  criteriaType:          'ONE_TIME_RANGE' | 'WEEKLY_PREFERENCE'
  timezone:              String
  acceptableStartAt / acceptableEndAt: DateTime | null   -- set iff criteriaType = ONE_TIME_RANGE
  weekdays:              Weekday[] | null                -- set iff criteriaType = WEEKLY_PREFERENCE
  localStartTime / localEndTime: Time | null              -- set iff criteriaType = WEEKLY_PREFERENCE
  durationMinutes:       int | null
  participantCount:      int | null
  status:                'ACTIVE' | 'NOTIFIED' | 'CANCELLED' | 'EXPIRED'
  expiresAt:             DateTime
  createdAt:             DateTime
}
```

**Invariants:**
- Exactly one criteria representation: `ONE_TIME_RANGE` sets `acceptableStartAt`/`acceptableEndAt` and nulls the weekly fields, or vice versa for `WEEKLY_PREFERENCE`.
- Never auto-cancelled just because the customer's underlying need was met through a different channel (e.g. a waitlist promotion elsewhere) — an alert is an independent intent, not correlated with other capacity events.
- An alert never reserves a resource and never auto-books; it only notifies (at most one deduplicated attempt per alert/matching-window).
- Unauthenticated visitors are routed to login/account creation before an alert can be created; chosen criteria are preserved through that redirect.

**Key Methods:**
- `AvailabilityAlert.create(customerId, serviceId, criteria, expiresAt)` (UC-072)
- `update(criteria)` / `cancel()` (UC-076/UC-053)
- `recordNotificationAttempt(matchingWindow, channel, outcome)` — deduplicated on `(alertId, matchingWindow, channel)`.

---

#### **Aggregate: FutureCommitmentException** (Root Entity)

> Introduced by M21 Cluster 3. A manager-owned worklist entry — never changes the affected booking/session itself. Covers a change *nobody explicitly reviewed per-session*: a resource deactivation, an hours reduction, or a side effect of an otherwise-unrelated config edit. **Excludes** a template date-range/from-date cancellation the manager explicitly initiated (Cluster 4's session-cancellation flow) — that flow's own step is already the explicit, audited resolution.

**Properties:**
```
FutureCommitmentException {
  id:                    FutureCommitmentExceptionId
  tenantId:              TenantId
  sourceType:            String                  -- e.g. RESOURCE_DEACTIVATION, HOURS_CHANGE, TEMPLATE_EXCEPTION
  sourceId:              UUID
  affectedType:          String                  -- e.g. BOOKING, CLASS_SESSION
  affectedId:            UUID
  status:                'OPEN' | 'RESOLVED' | 'DISMISSED'
  ownerStaffId:          StaffId | null
  resolutionType:        String | null           -- KEEP | REASSIGN | RESCHEDULE | CANCEL
  resolutionReason:      String | null
  resolvedByStaffId:     StaffId | null
  resolvedAt:            DateTime | null
  notificationOutcome:   String | null
}
```

**Invariants:**
- One idempotent entry per affected commitment — a repeated trigger for the same unresolved impact updates the existing open row rather than duplicating manager work (`UNIQUE (tenantId, sourceType, sourceId, affectedType, affectedId) WHERE status = 'OPEN'`).
- A commitment is never silently moved or invalidated — this aggregate only ever records impact/alternatives; UC-077 is the sole resolution flow, and even there, the manager makes an explicit choice.
- No safe alternative existing is a valid terminal state ("no compatible alternative"), not an error — the manager still explicitly keeps, reassigns, reschedules, cancels, or dismisses.

**Key Methods:**
- `FutureCommitmentException.raise(sourceType, sourceId, affectedType, affectedId, alternatives)` (UC-073)
- `resolve(staffId, resolutionType, reason)` / `dismiss(staffId, reason)` (UC-077)

---

#### **Aggregate: ClassScheduleTemplate** (Root Entity)

> Introduced by M21 — Multi-Vertical Scheduling, Cluster 4 (Classes/Sessions). Session-style recurring pattern — the SESSION-family counterpart to `RecurringBookingSchedule`. Depends on `Service.classResourceSlots` (Cluster 2 schema).

**Properties:**
```
ClassScheduleTemplate {
  templateId:  ClassScheduleTemplateId
  tenantId:    TenantId
  serviceId:   ServiceId
  resourceIds: ResourceId[]        -- the bundle this class always uses; each entry is one manual pick from
                                    -- the matching-type entry in Service.classResourceSlots' pool
  recurrence:  RecurrenceRule      -- e.g. weekly on [MON, WED, FRI] at 08:00; duration comes from Service.durationMinutes.
                                    -- daysOfWeek is a plain array with no upper bound below 7 — listing all 7 days is the
                                    -- correct, supported way to express "every day" (no separate DAILY frequency value).
  capacity:    int
  trialSlots:  int                 -- guest/non-member seats that auto-confirm before UC-098 manual approval; default 0
  validFrom / validUntil: Date | null
  isActive:    Boolean
}
```

**Invariants:**
- Each `resourceIds` entry must be a member of `Service.classResourceSlots` for that same `(serviceId, resourceType)` — app-enforced, not a DB constraint.
- A template's occurrence duration is uniform across every day in its own `recurrence` — it always comes from the one `Service.durationMinutes` value, never a per-weekday length. A business whose open hours vary by weekday (e.g. shorter Saturday) and wants each occurrence to span the full day must create one template per distinct-hours weekday group (same "two independent instances, never a fungible pool" pattern already used for two parallel same-time classes) — there is no dynamic "span to that day's closing time" duration mode (see `plan/M24-MULTIVERTICAL-CLASSES-SESSIONS.md` Non-Goals).
- `capacity` cannot exceed the lowest `maxCapacity` ceiling among the template's `ROOM`/capacity-bearing `EQUIPMENT` resources (UC-079 A3).
- At most `MAX_ACTIVE_TEMPLATES_PER_RESOURCE = 50` active templates reference any one resource (UC-079 A4).
- A chosen resource must not already be committed to an overlapping template, an `APPROVED` appointment `Booking`, or an active `RecurringBookingSchedule` matching the new recurrence — evaluated via the same advisory-lock/recurrence-rule-direct-evaluation protocol as `RecurringBookingSchedule` (`docs/13-DATABASE_SCHEMA.md`).
- Editing a template only affects future, not-yet-generated sessions — already-materialized `ClassSession` rows are untouched (snapshotted at generation time). Deactivating stops future generation only.
- A new default `capacity` below any of the template's own already-materialized, not-yet-started sessions' `reservedCount` is blocked (UC-080 A2) — resolve those sessions individually first (UC-083).
- **Two independent instances, never a fungible pool (model #6):** a studio running the same class twice in parallel (e.g. two Pilates rooms at the same hour) is two separate `ClassScheduleTemplate` rows, each with its own capacity/roster — never one template pointing at a `ROOM` pool, which would wrongly merge two independently-running classes into one.

**Key Methods:**
- `ClassScheduleTemplate.create(serviceId, resourceIds, recurrence, capacity, trialSlots)` (UC-079)
- `update(...)` / `deactivate()` (UC-080)
- `cancelRange(from, to?)` — creates a `ClassScheduleTemplateException` (UC-096)

---

#### **Aggregate: ClassSession** (Root Entity, event-emitting)

Materialized occurrence, generated on a rolling horizon by an idempotent worker (UC-081). Capacity/resources overridable per-instance (UC-083).

**Entities within:**
- `ClassSession` (root)
- `ClassSessionResource` (child — per-instance snapshot/override of the template's resolved slots)

**Properties:**
```
ClassSession {
  sessionId:    ClassSessionId
  tenantId:     TenantId
  templateId:   ClassScheduleTemplateId   -- always generated from a template; ad-hoc sessions are out of scope
  serviceId:    ServiceId                 -- denormalized from the template, for service listing/filtering
  startTime / endTime: DateTime
  capacity:     int                       -- snapshot from template; admin can override per-instance
  reservedCount: int                      -- CONFIRMED + capacity-holding PENDING_APPROVAL/PROMOTION_PENDING seats;
                                          -- atomically maintained via a guarded UPDATE, never TypeORM's bare @VersionColumn
  trialSlots:   int                       -- snapshot from template; admin can override per-instance
  reservedNonMemberCount: int             -- verified-guest + contract-less-customer subset of reservedCount;
                                          -- decides the UC-097/UC-087 auto/manual branch, never a second capacity ceiling
  status:       'SCHEDULED' | 'AWAITING_ATTENDANCE' | 'CANCELLED' | 'CLOSED'
  version:      int                       -- optimistic-lock guard for non-capacity concurrent edits (UC-083)
}
```

**Invariants:**
- `reservedCount <= capacity`, enforced by a guarded UPDATE (`WHERE reserved_count + :qty <= capacity`), not application-level read-then-write.
- Generation is idempotent: a `(templateId, startTime)` uniqueness check prevents double-generation on retry.
- A resource closed or outside its hours for a candidate occurrence blocks generation for that occurrence (UC-081 A2); an overlapping approved appointment is rejected by the shared `resource_occupancy` constraint (UC-081 A3).
- Never regenerated once cancelled via a `ClassScheduleTemplateException` range.
- Transitions to `AWAITING_ATTENDANCE` at `endTime`, remaining a visible Turmas task until staff closes it (UC-101) — attendance is never inferred by a timer, and a session cannot be closed twice.

**Key Methods:**
- `generateFromTemplate(template, startTime)` (UC-081, worker-only)
- `overrideCapacityOrResources(capacity?, trialSlots?, resourceIds?)` (UC-083)
- `cancel()` — publishes `ClassSessionCancelled` (UC-084, UC-096)
- `close(attendeeOutcomes)` (UC-101)

---

#### **Aggregate: ClassSessionBooking** (Root Entity, event-emitting)

The session-style equivalent of `Booking`. Reservation/contact and access/charge-intent snapshot; a full `AggregateRoot` with an outbox-aware repository, matching the existing `Booking` pattern.

**Entities within:**
- `ClassSessionBooking` (root)
- `ClassSessionAttendee` (child — one immutable named seat per reservation)

**Properties:**
```
ClassSessionBooking {
  classSessionBookingId: ClassSessionBookingId
  tenantId:     TenantId
  sessionId:    ClassSessionId
  serviceId:    ServiceId              -- denormalized from sessionId
  type:         'GUEST' | 'CUSTOMER'   -- same BookingType enum as Booking
  customerId:   CustomerId | null      -- null iff guest
  createdByStaffId: StaffId | null     -- set when staff creates this on a customer's behalf (UC-104)
  contactEmail / contactName / contactPhone: Email / String / Phone   -- mirrors Booking's contact fields exactly,
                                                                        -- so this event stays self-contained (bounded-contexts Rule 4)
  quantity:     int                    -- number of named attendee rows; contract customers always reserve 1;
                                        -- verified guest/drop-in reservations may reserve a group
  status:       'PENDING_EMAIL_VERIFICATION' | 'PENDING_APPROVAL' | 'CONFIRMED' | 'WAITLISTED' |
                'PROMOTION_PENDING' | 'CANCELLED' | 'CLOSED'
  seriesId:     RecurringEnrollmentId | null
  contractId:   ClassAccessContractId | null
  paymentSource: 'CONTRACT' | 'GUEST_TRIAL' | 'IN_PERSON'
  waitlistAccessIntent: 'CONTRACT' | 'IN_PERSON' | null   -- populated only by a WAITLISTED/PROMOTION_PENDING entry;
                                                            -- revalidated on offer acceptance
  rescheduledFromId: ClassSessionBookingId | null   -- set when this is a "reposição" replacement (UC-102)

  -- Snapshots, frozen at booking-request time. Same principle as BookingLine.
  serviceNameAtBooking: String
  priceAtBooking:       Money
  pointsValueAtBooking: int

  -- Waitlist/offer fields (finalized):
  offerOfferedAt / offerExpiresAt / offerRespondedAt: DateTime | null
  offerResponse: 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | null
  cancellationReason: String | null
}

ClassSessionAttendee {
  attendeeId: ClassSessionAttendeeId
  tenantId:   TenantId
  classSessionBookingId: ClassSessionBookingId
  name:       String
  customerId: CustomerId | null       -- set for the contract holder; guests remain contact-only
  attendance: 'PRESENT' | 'NO_SHOW' | null   -- null until the session is closed out
  removedAt / removedByActorType / removedByActorId / removalReason: DateTime | String | UUID | String | null
}
```

**Invariants:**
- A `CUSTOMER` reservation with `contractId = null` and `paymentSource = IN_PERSON` is valid (UC-087) — the earlier "a CUSTOMER reservation always has a contract" assumption is relaxed.
- `reservedCount`/`reservedNonMemberCount` are maintained by the *same* guarded update that creates/cancels this aggregate — never a separately-timed read-then-write.
- `WAITLISTED`/`PROMOTION_PENDING` requires a non-null `waitlistAccessIntent`.
- `FIRST_FREE_PER_EMAIL` applies only to a solo (`quantity = 1`) verified guest booking, consumed atomically exactly when that reservation reaches `CONFIRMED`.
- Active attendee count must always equal `quantity`, enforced in the same transaction that changes either (UC-105).
- No refund/credit workflow — Ikaro does not process payments; a closed-out session is not subsequently cancelled.

**Key Methods:**
- `requestSessionBooking(...)` (UC-086/087/088) — atomically checks `reservedCount < capacity`, branches CONFIRMED/PENDING_APPROVAL/WAITLISTED per the trialSlots threshold.
- `cancel(actor, reason)` (UC-089) → triggers waitlist promotion.
- `joinWaitlist(...)` (UC-090)
- `promote()` → `PROMOTION_PENDING` with offer deadline (UC-091); `acceptOffer()` / `declineOffer()`.
- `approve(staffId)` / `reject(staffId)` (UC-098)
- `removeAttendees(attendeeIds, actor, reason)` (UC-105) → atomic quantity/quote/capacity adjustment + waitlist promotion.
- `close(attendeeOutcomes)` (UC-101)

---

#### **Aggregate: RecurringEnrollment** (Root Entity)

Customer-only standing link to a `ClassScheduleTemplate` — the SESSION-family counterpart to `RecurringBookingSchedule`. Generates a `ClassSessionBooking` per matching session as new occurrences materialize.

**Properties:**
```
RecurringEnrollment {
  enrollmentId: RecurringEnrollmentId
  tenantId:     TenantId
  customerId:   CustomerId
  templateId:   ClassScheduleTemplateId
  serviceId:    ServiceId              -- denormalized from templateId
  startDate / endDate: Date / Date | null
  status:       'ACTIVE' | 'PAUSED' | 'CANCELLED'
  createdByStaffId: StaffId | null     -- set when staff creates it on the customer's behalf (UC-104)
}
```

**Invariants:**
- Customer-only, never guest; requires an active `ClassAccessContract` covering the template's service, and cannot extend beyond that contract's end date.
- Ends automatically when the qualifying contract ends or is cancelled — a later contract never implicitly revives it; the customer opts in again.
- Each upcoming matching session gets its own `ClassSessionBooking(seriesId = enrollmentId)`, respecting capacity/waitlist per occurrence independently — an enrollment is a *standing intent*, not a capacity guarantee.

**Key Methods:**
- `RecurringEnrollment.enroll(customerId, templateId, startDate)` (UC-093)
- `skipOccurrence(sessionId)` (UC-094) / `reschedule(sessionId, replacementSessionId)` (UC-102)
- `cancel()` (UC-095)

---

#### **Aggregate: ClassAccessContract** (Root Entity)

Minimal, date-bounded eligibility record for selected SESSION services. Grants booking eligibility, not a reserved seat — each booking still claims exactly one real seat.

**Properties:**
```
ClassAccessContract {
  contractId:  ClassAccessContractId
  tenantId:    TenantId
  customerId:  CustomerId
  startsOn / endsOn: Date   -- inclusive, tenant-local dates
  status:      'ACTIVE' | 'CANCELLED' | 'EXPIRED'
  eligibleServiceIds: ServiceId[]   -- one contract may cover several services
}
```

**Invariants:**
- Overlapping active contracts for the same customer are permitted only when their `eligibleServiceIds` do not overlap (UC-099 A2).
- Cancelling a contract early cancels every future booking it funded and ends dependent recurring enrollments, releasing capacity.
- Reaching `endsOn` expires the contract and ends dependent enrollments the same way — never a silent implicit resumption under a later contract.

**Key Methods:**
- `ClassAccessContract.create(customerId, startsOn, endsOn, eligibleServiceIds)` (UC-099)
- `cancelEarly()` (UC-099 step 4)

---

#### **Aggregate: ClassScheduleTemplateException** (Root Entity)

Persistent bounded cancellation range that prevents future generation from recreating cancelled occurrences (UC-096). A repeat trigger overlapping an existing exception extends/merges it rather than creating a fragmented second record (UC-096 A2).

```
ClassScheduleTemplateException {
  id:          ClassScheduleTemplateExceptionId
  tenantId:    TenantId
  templateId:  ClassScheduleTemplateId
  rangeStart / rangeEnd: Date | null   -- null rangeEnd = "from this date forward"
  createdByStaffId: StaffId
}
```

---

**`Booking` — modified (M21 Cluster 3):**
- `+ recurringScheduleId: RecurringBookingScheduleId | null` — set when generated by an active `RecurringBookingSchedule`; unique `(tenantId, recurringScheduleId, occurrenceStart)`.
- `+` terminal status `NO_SHOW` added to the state machine: `APPROVED → COMPLETED | CANCELLED | NO_SHOW` (UC-074). A manager may correct a mistaken no-show with an append-only audit transition; loyalty is awarded only if the corrected resulting state is `COMPLETED`. **This changes CLAUDE.md §5's booking state machine — see that file's own update alongside this promotion.**
- Reschedule (UC-069) now supports bundles/legs atomically, recalculates the quote, and records an append-only `BookingQuoteRevision` (new child-adjacent table, `docs/13-DATABASE_SCHEMA.md`) linking to the prior arrangement — extends the existing `BookingRescheduled` event's scope rather than introducing a new one.

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

A single record of points earned by a customer for one completed service. Append-only: rows are inserted on `BookingCompleted` and **never updated or deleted**. `expiresAt` marks when the points contributed by this entry stop being valid; the `loyalty_balances` decrement is applied by `ExpirePointsJob` (triggered daily by GCP Cloud Scheduler via the `ikaro-cron-loyalty-expiry` Pub/Sub trigger) when that date passes.

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
  expiresAt:      DateTime            (= earnedAt + tenants.settings.loyalty.expiryDays)
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
  pointsPerCurrencyUnit: int          (snapshot of the tenant's loyalty.pointsPerCurrencyUnit setting at redemption time)
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
  locale: string (default 'pt-BR' — TD02-S10)
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
Audit trail of every notification send attempt **per tenant**. Not used for idempotency — that is handled by the shared `shared.inbox` table (TD24-S04).

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
  tenantId: TenantId
  googleOAuthId: String | null (unique from Google per tenant; null until the invite link is used)
  email: Email
  name: String | null
  role: StaffRole
  isActive: Boolean
  invitedBy: StaffId | null
  deactivatedBy: StaffId | null
  createdAt: DateTime
  updatedAt: DateTime
}

Constraint: UNIQUE(tenantId, googleOAuthId) — partial index, WHERE google_oauth_id IS NOT NULL
  (composite with tenantId, changed from a global constraint in M13-S13)
  This means: the same Google account CAN be staff at multiple tenants
  (same multi-tenant model as Customer — see docs/06-TENANT_ISOLATION_STRATEGY.md)

> Per CLAUDE.md §2 invariant #6: "Staff can be multi-tenant — UNIQUE(tenant_id, google_oauth_id),
> same shape as customers." A staff row is always provisioned isActive=true at invite time;
> "pending invite" is signaled by googleOAuthId IS NULL, not isActive.
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

> Booking Context also **consumes** `StaffDeactivated` (published by Staff Context) to cascade-deactivate a `STAFF`-type `Resource` (UC-048) — see `docs/05-BOUNDED_CONTEXTS.md`.

### **Loyalty Context Events**

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `ServicePointsEarned` | `BookingCompleted` consumed → one `LoyaltyEntry` inserted per `BookingLine` (one event per line) | Notification Context |
| `PointsExpiringSoon` | Weekly cron (Mondays) finds entries whose `expires_at` falls in the **next 7 days** — forward-looking warning | Notification Context |

### **Staff Context Events**

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `StaffInvited` | New staff member invited (UC-028) or first MANAGER created during tenant provisioning (M04-S06) | Notification Context (invitation email) |
| `StaffDeactivated` | MANAGER deactivates a staff member (UC-029) | **Booking Context** (UC-048, cascades to the wrapping `STAFF`-type `Resource` — added M21 Cluster 1; first real consumer of this event) |

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
Enum: `PENDING | INFO_REQUESTED | APPROVED | REJECTED | COMPLETED | CANCELLED | NO_SHOW`

**State machine (authoritative):**
```
PENDING         -> INFO_REQUESTED | APPROVED | REJECTED | CANCELLED
INFO_REQUESTED  -> PENDING (customer / guest responded)
                |  APPROVED | REJECTED | CANCELLED  (admin acted on info offline)
APPROVED        -> COMPLETED | CANCELLED | NO_SHOW
COMPLETED       -> (terminal)
REJECTED        -> (terminal)
CANCELLED       -> (terminal)
NO_SHOW         -> (terminal)
```

> `NO_SHOW` is added by M21 — Multi-Vertical Scheduling, Cluster 3 (UC-074) — not live in the MVP until that milestone ships. See `docs/02-DOMAIN_MODEL.md` § Booking Context's own Cluster 3 modification note and `.copilot/context.md` §5 for the same state machine.

### **BookingType**
Enum: `GUEST | CUSTOMER`

### **Expiration window (`loyalty.expiryDays`)**
Configurable **per tenant** via `tenants.settings.loyalty.expiryDays` (integer, days). Typical values: 180 (6 months) or 365 (1 year). Defaults to 180 if unset.

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
- Answer public hotsite visitors' FAQ-style questions via an LLM-backed chatbot widget, scoped to the tenant's own business data (UC-033/UC-034) — informational only, no booking/customer/staff record access (`docs/discovery/CHATBOT/CHATBOT.md`)

**Key Aggregates:**
- `Tenant` (root) — the car wash company record; owns the `settings` JSONB blob
- `HotsiteConfig` (root) — tenant-scoped branding and layout for the public hotsite
- `ChatbotSession` (root) — one chat widget conversation; tracks cap-enforcement state
- `ChatbotMessage` (root) — one turn (visitor question or bot answer) within a `ChatbotSession`
- `ChatbotProviderBalance` (root) — single-row-per-provider prepaid balance, upserted by a periodic poll
- `LeadFormConfig` (root) — one per tenant; owns `audienceMode` and the question catalog (UC-037)
- `LeadFormSubmission` (root) — one per visitor submission to a tenant's lead form (UC-039/UC-040)
- Staff lifecycle (create/deactivate) — Platform use cases operate on the `Staff` aggregate owned by the Staff Context

**Notes:**
- There is no super-admin UI in MVP. A new tenant is provisioned by a developer via a CLI command or a seed script.
- All Platform use cases (except super-admin provisioning) are performed by a staff member with `MANAGER` role within their own tenant scope.

**Published Events:**
- `TenantProvisioned` — consumed by Staff Context (creates first MANAGER staff row + publishes `StaffInvited`)
- `LeadFormSubmissionReceived` — consumed by `audit-log` (a placeholder logging consumer, M20-S16); a real notification/webhook consumer to the manager is still an obvious, explicitly deferred fast-follow

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
  branding:      HotsiteBranding -- ~17 fields: colors (primary/secondary/background/text/button),
                                 -- fonts (heading/body), logoUrl, borderRadius, buttonStyle, spacing,
                                 -- shadowStyle, visual-rhythm + brand-identity overrides — see
                                 -- `apps/backend/src/contexts/platform/domain/hotsite-config.aggregate.ts`
                                 -- for the full `HotsiteBranding` interface, this is a summary not the full shape
  layout:        LayoutModule[]  -- ordered list of UI modules to render
  seo:           SeoMetadata     -- { title, description } — tenant SEO overrides, both nullable
  isPublished:   Boolean         -- false = draft; true = visible at /<slug>
  updatedAt:     DateTime
}
```

**Layout modules (types):** `HERO`, `SERVICE_LIST`, `GALLERY`, `TESTIMONIALS`, `BOOKING_CTA`, `ABOUT`, `CONTACT`, `FOOTER`, `CHATBOT`.

**Key methods:**
- `updateContent(branding, layout, seo)` → replaces branding, layout, and seo; stays in draft until published.
- `publish()` → sets `isPublished = true`; hotsite becomes publicly visible.
- `unpublish()` → reverts to draft.

---

#### **Aggregate: ChatbotSession** (Root Entity)
Tracks one chat widget conversation for cap enforcement (`docs/discovery/CHATBOT/CHATBOT.md` §8) and as the anchor `ChatbotMessage` rows reference for history reassembly. Not a rich DDD aggregate with cross-field invariants — same thin treatment as `NotificationLog`: a plain persistence record with a plain repository, no business rules beyond its own field transitions.

**Properties:**
```
ChatbotSession {
  sessionId:         UUID v7
  tenantId:           TenantId
  clientIp:           String            -- abuse/cost-control signal, distinct from sessionId's job of conversation continuity
  startedAt:          DateTime
  lastMessageAt:      DateTime
  conversationDate:   Date              -- tenant-timezone date bucket, used by the per-day caps
  messageCount:       SmallInt          -- matches platform.chatbot_sessions.message_count's SMALLINT column
  status:             'ACTIVE' | 'CLOSED' | 'CAPPED'
}
```

**Methods:**
- `static create(props)` — creates with `status='ACTIVE'`, `messageCount=0`.
- `recordMessage()` — increments `messageCount`, updates `lastMessageAt`.
- `markCapped()` — transitions to `CAPPED` (a per-conversation limit was reached — `maxMessagesPerConversation`/`maxMessageLengthChars`).
- `close()` — transitions to `CLOSED`.

---

#### **Aggregate: ChatbotMessage** (Root Entity)
One turn (visitor question or bot answer) within a `ChatbotSession`. Stores the real conversation text on both sides — not just metadata — since the LLM is stateless between calls (the BFF must resend prior turns as history) and since this is the source of the per-message token/cost audit trail (`docs/discovery/CHATBOT/CHATBOT.md` §8). Same thin "plain record" treatment as `ChatbotSession`/`NotificationLog`.

**Properties:**
```
ChatbotMessage {
  messageId:      UUID v7
  sessionId:      UUID v7           -- composite FK (tenantId, sessionId) → ChatbotSession
  tenantId:       TenantId
  role:           'USER' | 'ASSISTANT'
  content:        String
  inputTokens:    Integer
  outputTokens:   Integer
  modelId:        String            -- recorded per-message for cost auditing (models/providers can vary per tenant)
  costUsd:        Decimal           -- computed and stored at send-time by whichever adapter produced this
                                     -- message (provider-confirmed for OpenRouter, self-computed for
                                     -- Anthropic/OpenAI) — never reconstructed later from tokens
  createdAt:      DateTime
}
```

**Methods:**
- `static create(props)` — creates a message row; no state transitions (append-only, like `LoyaltyEntry`).

---

#### **Aggregate: ChatbotProviderBalance** (Root Entity)
Single-row-per-provider, platform-wide operational state for an LLM provider — two independent facts, written by two independent mechanisms, read together by UC-034's pre-flight check:
- **Balance** (`remainingUsd`/`checkedAt`) — upserted by S08's periodic poll job (UC-036) against the provider's own account API (e.g. OpenRouter's `GET /api/v1/credits`). Only OpenRouter has a prepaid-balance concept; Anthropic/OpenAI rows never get these fields populated.
- **Health** (`lastSuccessAt`/`lastFailureAt`) — upserted by `SendChatMessageUseCase` (S05/S06) as a side effect of real chat traffic: every real `ILlmProvider.complete()` call outcome stamps one or the other. Not a poll — a passive signal derived from actual usage, never from a cap/volume rejection.

Both facts are a trivial local lookup for UC-034's pre-flight check — never a live external call in that hot path, for either one.

**Properties:**
```
ChatbotProviderBalance {
  provider:       String            -- e.g. 'openrouter'
  remainingUsd:   Decimal | null    -- null until S08's first poll; always null for providers with no prepaid-balance concept
  checkedAt:      DateTime | null
  lastSuccessAt:  DateTime | null   -- most recent real complete() success for this provider, across any tenant
  lastFailureAt:  DateTime | null   -- most recent real complete() failure — never set by a cap/volume rejection, only a genuine provider-call failure
}
```

**Methods:**
- `static upsert(provider, remainingUsd)` — S08's balance write.
- A corresponding health-write method (S06's own call on exact signature) — both persisted via a **partial-column upsert only** (`docs/13-DATABASE_SCHEMA.md`'s "Write discipline" note), never a full-row replace, so the two independent writers can never clobber each other's columns.

**Availability rule (UC-034 condition c):** the provider is unhealthy only if `lastFailureAt` is more recent than `lastSuccessAt` **and** within `CHATBOT_PROVIDER_HEALTH_COOLDOWN_MINUTES` (default `5`) of now — a half-open/circuit-breaker cooldown, not a permanent trip, so a single transient failure can't leave the widget dark forever (`available: false` means the widget never renders at all, so without a cooldown no visitor could ever produce the success that would clear it).

---

#### **Aggregate: LeadFormConfig** (Root Entity)
One per tenant — owns the question catalog and audience gating for the `LEAD_FORM` hotsite module (`docs/04-USE_CASES.md` UC-037, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § LEAD_FORM). Promoted from `docs/discovery/lead-form-module/lead-form-module.md`, kept as the permanent design rationale.

**Properties:**
```
LeadFormConfig {
  tenantId:      TenantId          -- PK, also FK to platform.tenants, UNIQUE (one row per tenant)
  audienceMode:  'GUEST_AND_CUSTOMER' | 'CUSTOMER_ONLY'   -- default 'GUEST_AND_CUSTOMER'
  questions:     LeadFormQuestion[]  -- ≤20 entries, ordered
  updatedAt:     DateTime
}

LeadFormQuestion {
  id:        UUID
  label:     String
  type:      'TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE'
  required:  Boolean
  options?:  String[]   -- 2-10 entries, only for SINGLE_CHOICE/MULTIPLE_CHOICE
  order:     Integer
}
```

**Why JSONB, not a child table:** the question catalog is always read and written as one atomic unit by exactly one actor (the manager editing the form) — never queried or joined per-question. Same justification `hotsite_configs.layout` already uses for its own module array.

**Key methods:**
- `static create(tenantId)` → default `audienceMode: 'GUEST_AND_CUSTOMER'`, empty `questions`.
- `updateQuestions(questions)` → validates the whole array (≤20 entries, each non-empty label, choice-type questions have 2-10 options) and replaces it atomically. Publishes no event (config change, matches how other module config edits behave).
- `updateAudienceMode(mode)` → replaces `audienceMode`.

**Cross-aggregate save, one transaction (UC-037, `docs/14-API_CONTRACTS.md` § Lead Form Admin Config):** the manager's config drill-down screen edits both this aggregate (`audienceMode`/`questions`) and `HotsiteConfig`'s own `layout[]` entry for this module (teaser fields — title/subtitle/ctaLabel/etc., the same shape every other module's teaser data uses) as one user-facing save action. `UpdateHotsiteContentUseCase` writes both aggregates inside a single `txManager.run()` block when `audienceMode`/`questions` are present in the request (folded in at M20-S08 — previously a separate, near-duplicate `UpdateLeadFormModuleUseCase` behind its own endpoint, which this replaced) — a deliberate exception to "one aggregate per transaction," justified because both aggregates live in the same bounded context (Platform) and one real user action requires them to save atomically; this is not a precedent for casually spanning transactions across contexts. The module's `enabled` flag is not part of this cross-aggregate concern — it's just `layout[].enabled`, the same field every other module's `enabled` toggle already goes through on this same use case.

---

#### **Aggregate: LeadFormSubmission** (Root Entity)
One per visitor submission (`docs/04-USE_CASES.md` UC-039/UC-040). Independent aggregate from `LeadFormConfig` — deliberately never transactionally consistent with it (DB-expert-reviewed boundary, see below).

**Properties:**
```
LeadFormSubmission {
  id:           UUID v7           -- bare `id`, matching every other aggregate root's own convention
                                   -- (Booking, ChatbotSession, ChatbotMessage, NotificationLog, ...).
                                   -- `submissionId` is used only as the event-payload/API-response
                                   -- DTO field name (docs/03-DOMAIN_EVENTS.md, docs/14-API_CONTRACTS.md),
                                   -- mapped from this field, not a second internal property.
  tenantId:     TenantId
  customerId:   UUID | null   -- UUID-only cross-context reference to Customer, no FK (per docs/ANTI_PATTERNS.md's
                               -- "cross-schema DB FK between contexts" row). Set whenever the submitter was
                               -- authenticated, in either audience mode.
  name:         String
  email:        Email          -- validated via the existing Email VO
  phone:        PhoneNumber    -- validated via the existing PhoneNumber VO
  answers:      LeadFormAnswer[]  -- full snapshot, see below
  submittedAt:  DateTime
  expiresAt:    DateTime       -- computed once at insert time, see below
  ipAddress:    String         -- abuse-investigation trail, also the rate-limit key
}

LeadFormAnswer {
  questionId:     UUID
  questionLabel:  String    -- snapshotted, not looked up live
  questionType:   'TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE'
  answerValue:    String | String[]
}
```

**Aggregate-boundary note (DB-expert pass, deliberate — not an oversight):** `LeadFormSubmission.answers` snapshots the full `{questionId, questionLabel, questionType, answerValue}` at submission time, not just `{questionId, value}` — the exact same reasoning `BookingLine.priceAtBooking`/`serviceNameAtBooking` already exists for above. Without the snapshot, a manager editing a question's label or deleting it later would silently corrupt how old submissions render. Same reasoning applies to `expiresAt`: computed **once, at insert time**, from whatever `retentionMonths` the tenant had *then* — never recomputed live — matching `docs/21-TENANTS_SETTINGS_SCHEMA.md`'s own "settings changes apply to future only" rule.

**Search index is a repository-level concern, not an aggregate property (added post-promotion, UC-041 search, M20-S12/S13):** `TypeOrmLeadFormSubmissionRepository.save()` derives one `platform.lead_form_answers` row per question from `answers[]` (flattening a `MULTIPLE_CHOICE`'s array into one row per selected option) and writes both tables in the same transaction. `lead_form_answers` is **not** a second aggregate — it has no independent lifecycle, no identity meaningful outside its parent submission, and no domain behavior; it exists purely so UC-041 can filter by a specific question's answer (and AND several such filters together), which the JSONB snapshot alone can't do without ambiguity. See `docs/13-DATABASE_SCHEMA.md` § `platform.lead_form_answers` for the full shape and why a flattened single-text-column search (the originally-drafted design) was replaced with this instead.

**Key methods:**
- `static create(props)` → validates required fields via `Email`/`PhoneNumber` VOs, snapshots `answers`, computes `expiresAt` from the tenant's current `retentionMonths`. Publishes `LeadFormSubmissionReceived`.

---

## Anti-Corruption Layer (Future)

When integrating external services (e.g., payment provider, SMS service), create an anti-corruption layer to translate external models to our domain models. Not needed for MVP.


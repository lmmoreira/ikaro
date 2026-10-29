# Domain Model - Ikaro (DDD)

> **When to load:** implementing or changing an aggregate, entity, value object or bounded-context boundary in the backend, or checking an aggregate's fields and invariants; event payloads are in `docs/DOMAIN_EVENTS.md`, tables and columns in `docs/DATABASE_SCHEMA.md`, flows in `docs/USE_CASES.md`.
> **Tags:** backend, database

This document defines the domain model using Domain-Driven Design (DDD) principles: bounded contexts, aggregates, entities, value objects, and domain events.

---

## Bounded Contexts

A bounded context is an autonomous domain with clear boundaries and its own model. **Each context is scoped to a tenant** - no cross-tenant data mixing.

> **There are seven contexts, not five.** The list below covers Contexts 1–5; **Context 6: Platform** (Tenant, HotsiteConfig, Chatbot*, LeadForm*) is documented further down in this file (search `Context 6: Platform Context`), after the Context Map, because it was added later. Its aggregates, like the other five, are listed in `docs/BOUNDED_CONTEXTS.md` § 6. Platform Context. **Context 7: Billing** (Subscription, BillingAccount, Charge, FeaturePrice — Ikaro charging its tenants) follows Platform at the end of the aggregates part (search `Context 7: Billing Context`); its tables are in `docs/DATABASE_SCHEMA.md` § Schema: `billing` and its contract with the other contexts in `docs/BOUNDED_CONTEXTS.md` § 7.

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
- `Resource` (root) — tenant-scoped; the person/room/equipment a booking occupies (M21)
- `ServiceBookingIntakeSchema` — versioned intake questions for a `Service` (M22/M23-S02)
- `RecurringBookingSchedule` (root) — a fixed-term recurring private reservation (M23, UC-070/071)
- `AvailabilityAlert` (root) — a customer's "tell me when this opens" request (M23, UC-072/076)
- `FutureCommitmentException` (root) — a worklist entry for a booking affected by a resource deactivation (M23, UC-073/077)

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
- `StaffActivated` — consumed by the shared `audit-log` consumer only (UC-031).
- `StaffDeactivated` — consumed by Booking (cascade-deactivates the wrapping `STAFF`-type `Resource`, UC-048) and the shared `audit-log` consumer; active sessions still expire via JWT TTL.

> `ScheduleClosure` is owned by the **Booking Context** (it directly controls calendar availability). The Staff Context does not read or write closures.

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
- `BookingId`, `BookingLineId` (UUID identifiers — plain `string` ids in code, not dedicated value-object classes)
- `BookingStatus` (PENDING, INFO_REQUESTED, APPROVED, REJECTED, COMPLETED, CANCELLED, NO_SHOW — the last added by M23 Cluster 3 / M23-S09, reachable only from APPROVED)
- `BookingType` (GUEST, CUSTOMER)
- `TimeSlot` (concept only — no `TimeSlot` class exists; a slot is a plain `{ startTime, endTime }` pair of strings, plus a date where relevant)
- `Money` (price, currency)
- `Duration` (concept only — no `Duration` class exists; durations are plain integer minutes, e.g. `totalDurationMins`)

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
  createdByStaffId:     StaffId  | null  (UC-108 — set only when staff created the booking on the customer's behalf; null for every self-service booking)
  completedAt:          DateTime | null
  completedBy:          StaffId  | null
  cancelledAt:          DateTime | null
  cancelledBy:          UserId   | null  (staff or customer UUID; null for a system expiry, TD51)
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
- `materializeRecurringOccurrence(...)` (M23-S05) — builds one occurrence of an `ACTIVE` `RecurringBookingSchedule` directly in `APPROVED` (an entry state `requestBooking()` never produces), with `recurringScheduleId` set, the line snapshot taken from the service and the contact snapshot from the customer; `approvedBy` is the approving staff member, or `null` when the schedule auto-confirmed. Raises **no** `BookingRequested` and **no** `BookingApproved` — those drive per-booking customer emails, and one schedule would otherwise send one pair per occurrence.
- `createByStaff(...)` (UC-108, M23-S39) — builds a one-off booking a staff member creates for a customer who phoned or walked in, directly in `APPROVED` (the second entry state `requestBooking()` never produces): `approvedAt = now`, `approvedBy` and `createdByStaffId` = the acting staff member, `type = CUSTOMER` (contact snapshot from the `Customer`) or `GUEST` (the contact staff entered). Raises `BookingApproved` and **no** `BookingRequested` — the customer gets the confirmation email, no manager is asked to decide.
- `static requestBooking(input: RequestBookingInput)` — takes pre-built `lineInputs` (the caller's use case has already loaded each `Service` and captured the snapshot); loads nothing and checks no calendar availability (that is the use case's job, before the aggregate is built)
  - Builds a `BookingLine` per input, carrying the `price`/`durationMinutes`/`loyaltyPointsValue`/`requiresPickupAddress` snapshot.
  - Validates pickup invariant: if any line has `requiresPickupAddressAtBooking = true` and `pickupAddress` is absent → reject.
  - `contactAddress` is stored as-is (optional informational field; not subject to the pickup requirement).
  - Computes `totalPrice` and `totalDurationMins`.
  - Creates booking in `PENDING`.
  - Publishes `BookingRequested`.
- `approve(actor, correlationId, scheduledAt?)` → transitions `PENDING | INFO_REQUESTED → APPROVED`, publishes `BookingApproved` (event carries the line summary).
- `reject(actor, reason, correlationId)` → transitions `PENDING | INFO_REQUESTED → REJECTED`, publishes `BookingRejected`.
- `requestMoreInfo(actor, message, correlationId)` → `PENDING → INFO_REQUESTED`, publishes `BookingInfoRequested`.
- `submitInformation(submittedByEmail, infoPayload, correlationId, actor, photoUrls?)` → `INFO_REQUESTED → PENDING`, publishes `BookingInfoSubmitted`.
- `complete(actor, lineActualPrices: Map<lineId, Money>, afterPhotos, correlationId, adminNotes?, discountByPoints?)`
  → `APPROVED → COMPLETED`.
  For each line: sets `actualPriceCharged = lineActualPrices[lineId] ?? priceAtBooking`.
  Computes and caches `totalActualPrice = SUM(lines.actualPriceCharged)`.
  Stores photos. Publishes `BookingCompleted` **with the full line list including `actualPriceCharged`**.
- `cancel(actor, correlationId, reason?, cancelledByScheduleEnd = false)` → transitions `PENDING | INFO_REQUESTED | APPROVED → CANCELLED`, publishes `BookingCancelled`. The aggregate does not check the cancellation window: the customer use case calls `isEligibleForCancellation()` first; staff cancels have no window.
- `expireApproval(correlationId)` (TD51) → `PENDING → CANCELLED` by the `SYSTEM` actor (`{ type: 'SYSTEM', id: null }`): `cancelledBy` stays null, `cancellationReason = 'APPROVAL_EXPIRED'`, publishes `BookingCancelled` with `cancelledBy: null` and `cancelledByHoldExpiry: true`. Any other status is an `InvalidBookingTransitionError`. `cancelledByHoldExpiry` (getter) is true only for a `CANCELLED` booking with a null `cancelledBy` and that reason: the reason column is free text, so the reason alone never identifies an expiry.
- Every status-changing method above (and `markNoShow` / `correctNoShow`) takes the acting `BookingActor` (`{ type: STAFF | MANAGER | CUSTOMER | GUEST | SYSTEM, id }`) and records the transition — see *`Booking` — modified (M23 Cluster 3)* below. `BookingCancelled.isBusiness` is derived from the actor (`type !== CUSTOMER`), not passed in.
- `isEligibleForCancellation(cancellationWindowHours)` → `now < scheduledAt − window`; `cancellableUntil(hours)` returns that deadline. `isEligibleForReschedule(hours)` and `rescheduleEligibleUntil(hours)` are the customer-reschedule twins (UC-069), with the window resolved by the caller (`Service.rescheduleWindowHoursOverride ?? tenant default`).
- `reschedule(actorId, newScheduledAt, correlationId, isBusiness, adminNotes?, durationChange?)` → `APPROVED` only; publishes `BookingRescheduled`.
- Photos have no mutator methods: `beforeServicePhotoUrls` are set when the booking is requested and the after photos are passed to `complete()`.

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
  durationMinutes:        Duration        -- not authoritative once durationPolicy=CUSTOMER_SELECTED (M23-S02,
                                           -- locked at story-discovery): the customer's own submitted
                                           -- durationMinutes governs that booking; omitting it is a `422`
                                           -- (BOOKING_DURATION_OUT_OF_RANGE), never a silent fallback to this field.
                                           -- For a LEGGED service it IS the legs' span (M23-S11b): see the
                                           -- legs invariant below — never an independently edited value
  loyaltyPointsValue:     LoyaltyPoints (e.g., Basic=1pt, Premium=2pts, Wax=3pts)
  requiresPickupAddress:  Boolean        -- true = booking form must collect a pickup address
                                         -- (e.g. "Coleta e Entrega"). Default false.
  isActive:               Boolean        (UC-013)
  createdAt:              DateTime
  updatedAt:              DateTime

  -- Added M22 — Multi-Vertical Scheduling, Cluster 2 (Service extensions + availability engine).
  -- Today's car wash is the degenerate case: bookingModel='APPOINTMENT', resourceRequirements=[{type:LOCATION, selectionMode:NONE}] —
  -- no migration pain, existing services default straight into this (backfilled alongside the M21 Cluster 1 LOCATION resource).
  bookingModel:           'APPOINTMENT' | 'SESSION'   -- NOT NULL DEFAULT 'APPOINTMENT'; immutable once the service has bookings (UC-056 A1)

  -- APPOINTMENT only — mutually exclusive with legs (UC-052 A1):
  resourceRequirements:   ResourceRequirement[]        -- flat (non-legged) requirement set; [] on a legged or SESSION service
  bufferAfterMinutes:     int | null                   -- "extra cleanup this service needs, regardless of resource"; null on
                                                        -- legged services (meaningless there — legs use per-leg transition gaps
                                                        -- instead, UC-053 A1). On an APPOINTMENT service, null = inherit the tenant's
                                                        -- CURRENT serviceBufferMinutes (new services start null); a number, including 0,
                                                        -- is an explicit per-service override (UC-053; TD51-S00).

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
  minBookingAdvanceHoursOverride:  int | null                                -- null inherits tenant `minBookingAdvanceHours`; a value can only raise it
  maxBookingAdvanceDaysOverride:   int | null                                -- null inherits tenant `maxBookingAdvanceDays`; a value can only lower it
                                                                              -- (effective = clamped to the tenant window on every read, M23-S33)
  recurrenceEligible:              Boolean                                  -- default false; gates CAND-45 (Cluster 3)
  recurringHorizonDays:            int | null                                -- null inherits platform default (90 days); the maximum term of a recurring schedule (M23-S04 creation checks, M23-S05 materialization)
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

  -- Added TD56-S03 — the service's own public page (UC-013 A5 manager side, UC-109 visitor side). All
  -- three are independent of isActive and of the booking model.
  publicPagePublished:    Boolean                       -- default false; the manager's publish switch. The page exists for
                                                        -- visitors only while true AND the service is active.
  publicSlug:             ServicePublicSlug | null      -- generated by the system on the FIRST publish from the service
                                                        -- name (accents stripped, [a-z0-9-], 3–60 chars; a clash with another
                                                        -- service of the tenant appends '-' + the last 6 characters of the
                                                        -- service id). Immutable afterwards: a rename, an unpublish and a
                                                        -- republish all keep it, so a published URL stays stable. Never typed
                                                        -- or shown by the manager. Unique per tenant (partial unique index).
  publicProfile:          ServicePublicProfile | null   -- the page's content, always read and written as one object
}
```

**New value objects (TD56-S03):**

```
ServicePublicSlug {
  value: string        -- /^[a-z0-9]+(-[a-z0-9]+)*$/, 3–60 chars. create() validates, fromName(name, uniqueSuffix?) derives
                       -- (a name with no usable text becomes 'servico'), reconstitute() skips validation.
}
ServicePublicProfile {
  coverImageUrl:      string | null      -- storage path under tenants/<tenantId>/hotsite/service-profile/
  galleryImageUrls:   string[]           -- <= 8
  longDescription:    string | null      -- restricted Markdown, <= 4000 chars; never HTML (the web renders it with react-markdown + rehype-sanitize, no images)
  inclusions:         string[]           -- <= 12 items, each <= 120 chars; blank rows dropped
  preparationNotes:   string | null      -- <= 1000 chars
}
```

Both live in `contexts/booking/domain/` (Booking-only). Setters: `setPublicProfile(profile | null)`, `publishPublicPage(slugForFirstPublish)` (ignores the argument once a slug exists) and `unpublishPublicPage()` — none requires the service to be active, like the booking policy.

**New value objects (M22 Cluster 2):**

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

**Service key methods (M22/M23):** `update(...)`, `setResourceRequirements(requirements, activeResourceIdsByType)`, `setLegs(legs, activeResourceIdsByType)` (returns the new span), `setBufferAfterMinutes(minutes)`, `setBookingPolicy(policy)`, `changeBookingModel(...)`, `activate()` / `deactivate()`.

**New invariants (M22 Cluster 2, enforced by the aggregate):**
- `bookingModel` is immutable once the service has any booking history (UC-056 A1).
- `resourceRequirements`/`legs`/`classResourceSlots` are mutually exclusive: a flat APPOINTMENT service sets `resourceRequirements` (`legs = null`); a legged APPOINTMENT service sets `legs` (`resourceRequirements = []`, `bufferAfterMinutes = null`); a SESSION service sets `classResourceSlots` (`resourceRequirements = []`, `legs = null`).
- A bundle (`resourceRequirements.length > 1`) requires every listed resource type to have at least one active `Resource` — UC-051's own precondition (generalizing UC-050 A1's single-type error mechanism to the bundle case), structurally the same check `Resource.create()` doesn't need to make but `Service`'s resource-requirement config does.
- `durationPolicy = CUSTOMER_SELECTED` requires a non-null, non-`FIXED` `pricingPolicy` in the same save (UC-055 A2) — since `pricingPolicy` defaults to `FIXED`, a plain non-null check would never actually reject anything; the service must explicitly declare a real pricing method (`PER_TIME_INCREMENT`) for a variable-duration slot, not silently stay on the default.
- A service with `legs` cannot have `durationPolicy = CUSTOMER_SELECTED`, and a `CUSTOMER_SELECTED` service cannot be given `legs` — a legged service's length is fixed by its legs (`sum(leg durations) + sum(transition gaps between consecutive legs)` — the last leg's gap never counts — UC-052), so there is no meaningful customer-chosen duration for it. Enforced in both directions by `Service.setLegs()` and `Service.setBookingPolicy()`: `409` `BOOKING_SERVICE_LEGS_CUSTOM_DURATION_CONFLICT` (UC-052 A2, UC-055 A4). The dashboard disables the "Cliente escolhe" option for a legged service.
- **A legged service's persisted `durationMinutes` always equals its legs' span (M23-S11b).** `Service.setLegs()` writes the span (`sum(leg durations) + sum(transition gaps except the last leg's)`) into `durationMinutes`, and `Service.update()` recomputes it from the legs instead of taking the caller's value, so a rename or price edit can never move it. Every booking line copies `durationMinutes` into `durationMinsAtBooking`, and the availability/occupancy cursor advances by it between the lines of one booking (`availability-window-resolution.helpers.ts`, `resource-occupancy.helpers.ts`) — while each leg's own window comes from the legs alone (`computeLegSpans`). If the two ever differed, a line after a journey would overlap or leave a gap, and `totalDurationMins` would disagree with the itinerary. Migration `1748500000024-BackfillLeggedServiceDurationToSpan` corrected every pre-existing legged service; existing bookings keep the duration they were persisted with. The dashboard's Detalhes duration field is read-only for a legged service.

---

#### **Aggregate: ServiceBookingIntakeSchema** (Root Entity, append-only)

> Added M22 — Multi-Vertical Scheduling, Cluster 2 (UC-054). Deliberately **not** a `Service`-owned field or child collection like `resourceRequirements`/`legs` above — `Service`'s own props hold no reference to it. Publishing a new version never edits or deletes the previous one, so it has its own identity, its own repository (`IServiceIntakeSchemaRepository`), and its own `publish()`/`reconstitute()` factory — see `docs/ENGINEERING_RULES_BACKEND.md` § "A versioned, append-only child concept" for the full pattern rationale and its `architecture-check` consequence.

**Properties:**
```
ServiceBookingIntakeSchema {
  id:                        UUID
  tenantId:                  TenantId
  serviceId:                 ServiceId
  version:                   int                          -- monotonically increasing per service, starts at 1
  questions:                 ServiceIntakeQuestion[]       -- ordered, 1-50 entries, fieldKey unique within the array
  consentText:                String
  consentVersion:            int                          -- mirrors `version`; no separate consent-only update flow exists
  requiresNamedAttendees:    Boolean
  participantCountRequired:  Boolean
  isActive:                  Boolean                       -- true on exactly one version per service at a time
  createdAt:                 DateTime
}

ServiceIntakeQuestion {
  fieldKey:  String            -- unique within the schema
  label:     String
  type:      'FREE_TEXT' | 'BOOLEAN'   -- generic input shapes only; no typed marker (M22-S04,
                                         -- 2026-09-19 — removed the redundant PICKUP_ADDRESS/
                                         -- NAMED_ATTENDEES markers, which duplicated the pre-existing
                                         -- Service.requiresPickupAddress toggle and this same
                                         -- schema's own requiresNamedAttendees/participantCountRequired
                                         -- booleans below)
  required:  Boolean
}
```

**Invariants:**
- Publishing sets `version = previousVersion + 1` (or `1` if none exists yet), `isActive = true` on the new row, `isActive = false` on the previous one — the previous version is never edited in place (UC-054).
- A `Booking` freezes `intakeSchemaVersion`/`intakeAnswers` at submission time (immutable snapshot pair) — a later schema republish never retroactively changes an already-submitted booking's answers. A booking **staff create on a customer's behalf** (UC-108, M23-S39) may carry no snapshot at all (the intake is optional for staff), and when it has one the consent pair (`consentAcceptedAt`/`consentVersion`) is `null` unless staff ticked the consent.

**Read path (added M22-S04, 2026-09-18):** `IServiceIntakeSchemaRepository.findActiveByServiceId()`/`findAllByServiceId()` existed at the repository layer with no controller wiring until `/story-discovery M22-S04` folded a `GetServiceIntakeSchemaUseCase` + `GET /services/:id/intake-schema` (backend + BFF) into that story's scope, making one bounded `findLatestByServiceId()` read (active + the 5 most recent previous versions, `SERVICE_INTAKE_HISTORY_LIMIT` in `@ikaro/types`) and partitioning by `isActive` — the schema is append-only, so an uncapped read would grow the edit-page payload with every publish; older versions stay stored but are not listed. See `docs/API_CONTRACTS.md` § Service Extensions — M22 Cluster 2.

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
- **`STAFF`** — *wraps* an existing `Staff` aggregate by reference (`refId = staffId`). Staff Context stays pure identity/permissions; scheduling data (working hours, turnover) lives on the `Resource` row, not on `Staff` itself. Staff Context stays out of scheduling data entirely.
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
- `Resource.create({ tenantId, type, name, tenantBusinessHours, workingHours?, refId?, maxCapacity?, turnoverMinutes? })` — one options object; validates the `STAFF`⟺`refId` invariant and the working-hours subset invariant.
- `update(name, type, refId, workingHours, turnoverMinutes, maxCapacity, tenantBusinessHours)` (UC-046) — a manager can correct any field, including `type`/`refId`, without deactivate+recreate; re-runs the same invariants `create()` enforces, plus the `LOCATION`-type-immutability guard and the `LOCATION`-workingHours-immutability guard (a `LOCATION` resource always inherits the tenant's business hours — `workingHours` must stay `null`).
- `deactivate()` (UC-047) / `reactivate()` (UC-049)

**Cross-context note:** a `STAFF`-type `Resource` has no DB-level FK to `staff.staff` (cross-schema) — Booking validates the referenced staff member (same-tenant, existing, active, schedulable) through a narrow lookup adapter at write time, and consumes the Staff Context's `StaffDeactivated` event to cascade-deactivate the wrapping resource (UC-048). Staff Context remains unaware of Booking. **Race closed via advisory lock (M21-S06):** a staff-active check followed by a create/update/reactivate save is a check-then-act race against a concurrent `StaffDeactivated` cascade — `CreateResourceUseCase`, `UpdateResourceUseCase`, `ReactivateResourceUseCase`, and `CascadeStaffDeactivationUseCase` all acquire the same per-`(tenant_id, staff_id)` `pg_advisory_xact_lock` (`ITenantLockPort.lockTenantStaff`, booking-local — no `shared/` promotion, since every racing call site already lives in Booking) before their respective authoritative check, inside the write transaction. Whichever side wins the lock fully determines what the other sees once it proceeds: a concurrent cascade either sees the not-yet-committed wrap (staff-active re-check fails, `ResourceStaffNotFoundError`) or the wrap sees the already-cascaded deactivation (same error) — never a stale read of both.

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

**Factory:** `ScheduleClosure.close({ tenantId, date, reason, createdBy, resourceId?, startTime?, endTime?, notes? })` — a single input object, not positional args (M21-S03, PR #460 round 1 — SonarCloud S107 too-many-parameters fix, following `Resource.create()`'s existing precedent).

---

#### **Aggregate: ScheduleOpening** (Root Entity)
Represents an **exception** that opens the schedule on a day that is closed in the effective hours source (the tenant's `businessHours` for a tenant-wide opening; for a resource-scoped opening, the resource's own `workingHours` when set, else `businessHours`) — e.g., a normally-closed Sunday opened for a special event. `ScheduleOpening` is the inverse of `ScheduleClosure`: it overrides a recurring "closed" day with a specific operating window.

`ScheduleOpening` is only meaningful when the effective hours source is closed that day. On a day already open in that source, creating an opening exception is invalid (change the regular hours instead). A resource-scoped opening is therefore allowed on a day the tenant itself is open, when that resource is closed that day.

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
- The day-of-week derived from `date` must be closed in the effective hours source (the resource's own `workingHours` when set, else the tenant's `businessHours`; cannot create an opening for an already-open day)
- Only one `ScheduleOpening` per `(tenantId, date)` when `resourceId IS NULL`, and only one per `(tenantId, resourceId, date)` when `resourceId` is set — a tenant-wide opening and a resource-scoped opening for the same date do not collide with each other (M21 Cluster 1; see `docs/DATABASE_SCHEMA.md` for the two-partial-unique-index DB fix this required, since a plain `NULL`-inclusive unique index stops enforcing "one per date" once `resourceId` becomes nullable)
- A resource opening can make that resource available on one of its normally-off dates, but never outside the tenant's own effective hours for that date

**Factory:** `ScheduleOpening.open({ tenantId, date, startTime, endTime, createdBy, resourceId?, notes? })` — a single input object, not positional args (M21-S03, PR #460 round 1 — same SonarCloud S107 fix as `ScheduleClosure.close()` above).

---

#### **Three-Layer Schedule Resolution (Availability Algorithm)**
The availability algorithm resolves the effective operating window for any given date using three layers in priority order:

```
1. ScheduleOpening  (highest priority — specific date override: open a normally-closed day)
2. ScheduleClosure  (block a normally-open day or a time window within it)
3. businessHours   (lowest priority — the recurring weekly pattern)
```

Resolution logic per date, tenant-wide (no `resourceId`):
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

**Resource-scoped resolution (M21 Cluster 1, `AvailabilityService.resolveEffectiveHours`, Codex PR #460 round-9 finding):** when a caller passes a `resourceId`, closures/openings for BOTH `resourceId = null` (tenant-wide) and `resourceId = <that resource>` are fetched and combined — a resource-scoped closure blocks that resource even on a day the tenant itself is open, and vice versa is never true (a resource can't be open when the tenant is closed). Resolution runs the single-scope algorithm above **twice** — once for the tenant, then once for the resource — never letting either scope's opening see the other scope's closures:

```
# Step 1 — tenant scope, using ONLY resourceId = null closures/opening. This is the exact
# single-scope algorithm above, unchanged — a tenant-wide opening still wins over a tenant-wide
# closure unconditionally within this step.
tenantWindow = resolveScopeWindow(businessHours[dayOfWeek], tenantClosures, tenantOpening)
if tenantWindow is null: return []   ← hard outer boundary; nothing below can override this

if no resource requested: return tenantWindow   ← tenant-wide call, done (byte-identical to pre-M21)

# Step 2 — resource scope, using ONLY resourceId = <that resource> closures/opening.
resourceDayHours = resource.workingHours != null
    ? resource.workingHours[dayOfWeek]        ← own hours gate it, not the tenant's; a tenant-wide
                                                  opening can never reach this branch (mirrors
                                                  OpenScheduleUseCase's creation-time bound)
    : tenantWindow's own {open, close}         ← inherits the tenant's already-resolved window
                                                  (including any tenant-wide opening), so no
                                                  separate "?? tenantOpening" fallback is needed
resourceWindow = resolveScopeWindow(resourceDayHours, resourceClosures, resourceOpening)
if resourceWindow is null: return []   ← resource specifically closed (no resource-scoped opening
                                          overrides it)

# Step 3 — intersect: a resource-scoped window can never extend beyond the tenant's own window.
open  = max(tenantWindow.open, resourceWindow.open)
close = min(tenantWindow.close, resourceWindow.close)
if open >= close: return []
return { open, close, partialClosures: tenantWindow.partialClosures + resourceWindow.partialClosures }
```

where `resolveScopeWindow(dayHours, scopedClosures, scopedOpening)` is exactly the single-scope algorithm from the section above: opening wins over a same-scope closure unconditionally, else a full-day closure returns "closed," else the day's hours apply with same-scope partial closures filtered out.

**`IBookingAvailabilityPort` (cross-context read port — Booking Context)**

The Booking Context exposes a read-only port for the availability algorithm to consume without a direct dependency on the Booking aggregate. Through M21, the real adapter (`TypeOrmBookingAvailabilityAdapter`, implemented in M07 when the Booking aggregate exists; a stub returning `[]` is used in M06) queried `bookings` directly and returned a single tenant-wide `BookedSlot[]` — sufficient while a booking's `scheduledAt`/`totalDurationMins` alone always answered "is the tenant free."

**Changed by M22 — Multi-Vertical Scheduling, Cluster 2 (Service extensions + availability/exclusivity engine).** Once a `Service.resourceRequirements`/`legs` can reference something other than the implicit whole tenant, one booking's `scheduledAt`/`totalDurationMins` can no longer answer "is resource X free" — a booking can span a bundle or leg chain with a different sub-window per resource. The real adapter moves from querying `bookings` directly to querying `booking.resource_occupancy`, the per-resource, per-window projection availability needs, and the port's shape changes accordingly to the current, live contract:

```typescript
interface IBookingAvailabilityPort {
  // from/to are tenant-local calendar dates (YYYY-MM-DD); timezone lets the adapter convert them
  // to real UTC instant boundaries against the UTC-stored starts_at/ends_at columns, rather than
  // re-interpreting the date strings as if they were already UTC days.
  findOccupancyByTenantAndResource(tenantId: string, resourceIds: string[], from: string, to: string, timezone: string): Promise<ResourceOccupiedSlot[]>;
}

interface ResourceOccupiedSlot {
  resourceId: string;
  startsAt: Date;   // UTC
  endsAt: Date;     // UTC — includes the effective service buffer / resource turnover (UC-059)
}
// M18-S10: the persisted row also records the gap behind that sum — gapMinutes + gapSource
// ('SERVICE_BUFFER' | 'RESOURCE_TURNOVER', null for none / legacy rows) — and DayGridOccupancyBlock
// exposes it as gap { source, minutes, serviceName }.
```

`bookings`/`booking_lines` remain the source of truth for the booking itself (status, contact, price); `resource_occupancy` is a short-lived locking projection, safely garbage-collectable once its window elapses (see `docs/DATABASE_SCHEMA.md`).

**UC-058 (`System Computes Availability Scoped to a Resource or Bundle`) — algorithm:**
1. For a bundle (`resourceRequirements.length > 1`), a slot is available only if **every** required resource is simultaneously free (intersection).
2. For `AUTO_FUNGIBLE_POOL`, a slot is available if **any** pool member is free (union, not intersection).
3. A `resourceId` not belonging to the querying tenant is excluded by the mandatory `tenantId` scoping — structural guard, not a runtime branch.
4. **Extended in Cluster 3** (once `RecurringBookingSchedule` exists) and **Cluster 4** (once `ClassScheduleTemplate` exists): "free" also excludes any active recurring pattern that would produce an occurrence at the candidate time, evaluated directly against the pattern's own recurrence rule rather than waiting for a materialized row — see UC-058's own entry in `docs/USE_CASES.md` for the forward reference. Not reachable in Cluster 2 alone, since neither aggregate exists yet.

**UC-059 (`System Applies Resource Turnover and Leg Transition Gaps`):** effective gap before the next booking on a resource, for a flat (non-legged) service: `max(service.bufferAfterMinutes, resource.turnoverMinutes)`, with its origin (M18-S10, `resolveGap` via `AvailabilityService.resolveFlatGap`): `SERVICE_BUFFER` when `buffer >= turnover` (a tie goes to the service) and `buffer > 0`, `RESOURCE_TURNOVER` when `turnover > buffer`, none when both are 0 — persisted on `resource_occupancy` at write time (create, reschedule, recurring materialization), never recomputed from current config. Only the last line of a booking carries the service buffer. A resource reassignment recomputes the gap from the target resource. For a legged service: each leg's resource turnover comes from that resource's own `turnoverMinutes`; `transitionGapAfterMinutes` is independent and additive to the appointment's total span.

**UC-060 (`System Rejects Overlapping Bookings Across a Shared Resource`) — why `resource_occupancy` has to be one shared table, not one per family:** before M22-S03, `bookings` carried the only DB-level guarantee behind CLAUDE.md §2's "cross-row invariant → enforce at the DB layer" rule (`EX_booking_bookings_approved_slot`, `docs/DATABASE_SCHEMA.md`, retired by M22-S03). That worked because there was exactly one thing to protect: the whole tenant, one row per booking. Once a booking can lock a *bundle* of resources or a different resource per *leg*, there's no longer one row per booking to key an exclusion constraint on — the granularity has to move to one row per resource-assignment. Postgres exclusion constraints cannot span two tables, so if appointment resource-locks and (once Cluster 4 ships) class-session resource-locks lived in separate tables, cross-family exclusivity (the Camila-Duarte-as-both-hairdresser-and-Pilates-instructor scenario, §3 above) could never be DB-enforced no matter how well either table were built individually. `booking.resource_occupancy` (see `docs/DATABASE_SCHEMA.md`) is the fix: one shared GIST exclusion constraint, keyed on `(tenant_id, resource_id, [starts_at, ends_at))`, protects every family that ever writes into it. In Cluster 2, only the `BOOKING_LINE` source type is reachable (`CLASS_SESSION` activates once Cluster 4 ships `ClassSession`) — same-family exclusivity (two APPOINTMENT services sharing a resource) is fully provable now; the cross-family case (model #13, this discovery's central premise) isn't testable until Cluster 4 exists alongside Clusters 2–3.

---

#### **Aggregate: RecurringBookingSchedule** (Root Entity)

> Introduced by M23 — Multi-Vertical Scheduling, Cluster 3 (Customer/guest appointment booking + extensions). Private-appointment recurrence, distinct from `RecurringEnrollment` (session family, Cluster 4).

Customer-only fixed-term commitment: "every Tuesday 10:00–12:00, Sala Aurora, until 15/12." The term is explicit and capped (90-day service-configurable default maximum); every occurrence of the term is validated when the schedule is created, and materialized as an ordinary linked `Booking` row in the same transaction (`AUTO_CONFIRM`) or at approval (`MANUAL_APPROVAL`). There is no rolling generation: a customer who wants to continue creates a new schedule, so a forgotten schedule can never hold slots indefinitely.

**Entities within:**
- `RecurringBookingSchedule` (root)
- `RecurringBookingScheduleResourceAssignment` (child — durable, mandatory for `FIXED_ASSIGNMENT`)

**Properties:**
```
RecurringBookingSchedule {
  id:                       RecurringBookingScheduleId
  tenantId:                 TenantId
  customerId:               CustomerId              -- guest bookings are never eligible
  serviceId:                ServiceId
  recurrence:               RecurrenceRule           -- WEEKLY-only for MVP: { frequency: 'WEEKLY', daysOfWeek: Weekday[], startTime: 'HH:mm', durationMinutes: int } — one shared time-of-day across every listed weekday, no per-day override, no other frequency value (locked in during M23-S04 story-discovery, 2026-09-27)
  startsOn / endsOn:        Date / Date              -- both required; endsOn <= startsOn + maximum term (Service.bookingPolicy.recurringHorizonDays, 90-day default); a schedule is never open-ended
  status:                   'PENDING_APPROVAL' | 'ACTIVE' | 'CANCELLED' | 'ENDED'   -- ENDED: the term is over (set by the M23-S05 job). There is no PAUSED: a fixed-term schedule materializes every occurrence up front, so pausing would have no effect (removed by M23-S20)
  assignmentPolicy:         'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE'   -- derived from the service, never sent by the caller: FIXED_ASSIGNMENT when any requirement is CUSTOMER_CHOICE (a mixed bundle included), else RESOLVE_PER_OCCURRENCE (TD49 Story 0)
  approvalHoldExpiresAt:    DateTime | null          -- required iff status = PENDING_APPROVAL
  approvedByStaffId:        StaffId | null           -- UC-071: the staff member who approved a PENDING_APPROVAL request; also set at creation when a staff member created a schedule for a MANUAL_APPROVAL service (they are the approver, UC-070, M23-S19). Null for a customer's schedule awaiting a decision and for an AUTO_CONFIRM service, where nobody approved anything
  approvedAt:               DateTime | null          -- set together with approvedByStaffId
  cancellationReason:       'CUSTOMER_CANCELLED' | 'STAFF_CANCELLED' | 'APPROVAL_REJECTED' | 'APPROVAL_EXPIRED' | null
  createdByStaffId:         StaffId | null           -- set when staff creates it on the customer's behalf
  resourceAssignments:      RecurringBookingScheduleResourceAssignment[]   -- the child collection: one entry per CUSTOMER_CHOICE requirement of the service (keyed by resource type), empty when none; automatic requirements are resolved per occurrence and stored nowhere
  version:                  int                      -- optimistic-concurrency counter (docs/DATABASE_SCHEMA.md)
  createdAt / updatedAt:    DateTime
}
```

**Invariants:**
- Guest bookings are never eligible — customer-only, or staff acting on an authenticated customer's behalf.
- Branches on the service's effective approval mode at creation (UC-070): `AUTO_CONFIRM` → created `ACTIVE` directly, every occurrence of the term materialized in the same transaction. `MANUAL_APPROVAL` → created `PENDING_APPROVAL` with a snapshotted `approvalHoldExpiresAt`; **no occurrences materialize until staff resolves it** (UC-071) — this closes a create-then-cancel loophole that would otherwise let a customer bypass a `MANUAL_APPROVAL` service's review gate by requesting a recurring schedule instead of a one-off booking. **A STAFF actor is the exception (M23-S19):** a schedule a staff member creates for a `MANUAL_APPROVAL` service is created `ACTIVE` at once with `approvedByStaffId` = that staff member and `approvedAt` set, no hold, and every occurrence materialized in the same transaction — the staff member is the approver, as in UC-108's one-off booking; it raises `RecurringBookingScheduleCreated`, never `…ApprovalRequested`.
- Once `ACTIVE`, every occurrence it materializes auto-confirms as `APPROVED` regardless of the service's `defaultApprovalMode` — the standing schedule itself was already vetted once, at the point it became `ACTIVE`; re-running a hold-and-review cycle on every generated occurrence would contradict the entire point of a standing commitment. A genuinely one-off booking of the same service is unaffected — `defaultApprovalMode` still governs it normally.
- At most `MAX_ACTIVE_SCHEDULES_PER_RESOURCE = 50` active `FIXED_ASSIGNMENT` schedules per resource (each resource picked for a `CUSTOMER_CHOICE` requirement counts); at most `MAX_ACTIVE_RESOLVE_PER_OCCURRENCE_SCHEDULES_PER_SERVICE = 50` active `RESOLVE_PER_OCCURRENCE` schedules per service — app-enforced, generous conservative placeholders, revisable after load testing.
- An occurrence that cannot be honored at creation — an existing booking or hold (`OCCUPIED`), a closure or normally-closed day (`CLOSED`), or a time outside the business's or resource's working hours (`OUTSIDE_HOURS`) — blocks the whole request, and the refusal lists every affected occurrence with its reason; no partial schedule ever exists (evaluated via the same advisory-lock protocol `docs/DATABASE_SCHEMA.md`'s `resource_occupancy` section describes for not-yet-materialized patterns). Every request locks the service first (`lockService()`), then resolves the resources that decide each requirement (the pick for a `CUSTOMER_CHOICE` one, every eligible resource for an automatic one) and locks all of them in one `lockResources()` call, in canonical order — only then is the cap read, so the lock also covers the cap check above atomically in the same critical section.
- Eligible only for an `APPOINTMENT` service with no `legs` and `requiresPickupAddress = false` (a request carries no pickup address to snapshot onto the occurrences), whose every requirement (none, one, or several — a bundle) has `requiredQuantity = 1` and can be resolved per occurrence: `CUSTOMER_CHOICE`, `AUTO_ANY` or `AUTO_FUNGIBLE_POOL`, or `NONE` on the unrestricted `LOCATION` only (`docs/BUSINESS_LOGIC_REFERENCE.md` service-shape table). A service with no requirement, or the stored unrestricted `{ LOCATION, NONE }` row, is the default "degenerate" shape, held against the tenant's single location. A requirement of quantity above 1, `legs`, or `NONE` on anything but the unrestricted location is refused (`assertServiceEligible()`, UC-070 A7). The check is repeated at approval against the service as it is then (UC-071). The check is in the use case's helpers, not the aggregate. Legged recurrence stays out of scope.
- `endsOn` is required, must not be before `startsOn` (an equal date is allowed), and must not be later than `startsOn` + the service's maximum term (a reversed range is `RecurringBookingScheduleInvalidDateRangeError`, `422`; a date beyond the term is `RecurringBookingScheduleTermExceededError`, `422`, `BOOKING_RECURRING_SCHEDULE_TERM_EXCEEDED`; a missing `endsOn` is rejected as a `400` by the request schema). Once `endsOn` has passed (on the tenant-local calendar date), a scheduled job (M23-S05) moves an `ACTIVE` schedule to `ENDED`, so the caps and the list filter keep using `status = 'ACTIVE'` and an expired schedule never counts against them. The natural end raises no domain event — there is no consumer for one.
- Where a schedule starts is checked once (M23-S35): the first occurrence of a new schedule must lie inside the booking window (customer actors; staff are exempt from the window, never from the past rule), a term with no occurrence is refused (`RecurringBookingScheduleNoOccurrencesError`, `422`, `BOOKING_RECURRING_SCHEDULE_NO_OCCURRENCES`), a renewal (same customer, service, weekdays, start time and duration, starting no later than the day after the previous `endsOn`) skips the window, and occurrences already started are never materialized (dropped for a renewal and at approval; `BookingScheduledInPastError` when none remain). The aggregate stores no link to the schedule it renews. Full rule: `docs/BUSINESS_LOGIC_REFERENCE.md`.
- A customer is reminded once, `settings.booking.recurringRenewalReminderDays` days before an `ACTIVE` schedule's `endsOn` (M23-S21; `0` = off): a cron-published Command, not an event, so the aggregate changes nothing and stores no "reminded" flag. The rule uses the tenant's setting and local date, which the aggregate does not hold, so it lives in the application layer. Full rule: `docs/BUSINESS_LOGIC_REFERENCE.md` § Renewal window and reminder.
- The maximum term is `Service.bookingPolicy.recurringHorizonDays` (null inherits a 90-day platform default). The creation-time checks and the materialization enumerate the term with one window-enumeration function, so nothing checked at creation can diverge from what is materialized. An occurrence that stops passing between the check and a later materialization (approval) refuses the whole approval with the same `409` conflicts list (UC-071 A3) — nothing is created and the schedule stays `PENDING_APPROVAL`, because a UC-073 worklist entry can only point at an existing booking.
- Generated bookings link back via a nullable `recurringScheduleId` on `Booking`, with a unique `(tenantId, recurringScheduleId, scheduledAt)` generation key (there is no `occurrence_start` column on `bookings`) — same idempotency shape `ClassSessionBooking.seriesId` uses for the session family (Cluster 4).

**Key Methods:**
- `RecurringBookingSchedule.request(options)` — takes one options object. The use case has already checked eligibility, the cap and every occurrence's conflicts, and has resolved the status (`ACTIVE` or `PENDING_APPROVAL` per the service's effective approval mode, with `approvalHoldExpiresAt`); the aggregate only validates the term (`assertValidTerm`) and raises the creation event.
- `approve(staffId, correlationId, now?)` / `reject(correlationId)` / `expire(correlationId)` (UC-071, UC-070 A5) — each requires `PENDING_APPROVAL` and clears `approvalHoldExpiresAt`; `approve` sets `ACTIVE`, `approvedByStaffId` and `approvedAt` and raises `RecurringBookingScheduleCreated`; `reject` and `expire` set `CANCELLED` with `cancellationReason` `APPROVAL_REJECTED` / `APPROVAL_EXPIRED` and raise `RecurringBookingScheduleRejected`. `reject` takes no free-text reason: the column holds only the enum.
- `markEnded()` — `ACTIVE → ENDED` once `endsOn` has passed (set by the M23-S05 job; raises no event).
- `reassignResource(fromResourceId, toResourceId)` (M23-S08) — swaps a `FIXED_ASSIGNMENT` schedule's assignment after a manager's reassign moved every remaining occurrence off `fromResourceId`; otherwise the assignment stays as the record of what was requested. There is **no schedule-side skip/reschedule record** (removed by M23-S08): an occurrence is its linked `Booking`, so skipping is that booking's ordinary cancel and rescheduling is its ordinary reschedule (UC-070 A2). A `PENDING_APPROVAL` request cannot be ended by the customer: `end()` refuses it (`BOOKING_RECURRING_SCHEDULE_NOT_ACTIVE`), and it resolves only through a staff decision or expiry, since no standing commitment exists yet.
- `end(correlationId, cancelledBookingIds, endedBy: 'CUSTOMER' | 'STAFF')` — `ACTIVE → CANCELLED` (`cancellationReason` `CUSTOMER_CANCELLED` / `STAFF_CANCELLED`); the use case supplies the ids of the future occurrence bookings it cancelled, and the aggregate raises `RecurringBookingScheduleEnded`.

---

#### **Aggregate: AvailabilityAlert** (Root Entity)

> Introduced by M23 Cluster 3. An expiring intent only — creates no occupancy and never becomes a booking automatically. Authenticated-customer-only (waitlists/alerts are retention features, not anonymous lead capture).

**Entities within:**
- `AvailabilityAlert` (root)
- `AvailabilityAlertNotificationAttempt` (child — notification history, deduplicated per matching window; carries the outcome, `attemptCount` and a redacted `lastError` — columns in `docs/DATABASE_SCHEMA.md`)

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
  version:               int                     -- optimistic-concurrency token (a customer's edit/cancel racing the expiry job)
}
```

**Invariants:**
- Exactly one criteria representation: `ONE_TIME_RANGE` sets `acceptableStartAt`/`acceptableEndAt` and nulls the weekly fields, or vice versa for `WEEKLY_PREFERENCE`.
- Never auto-cancelled just because the customer's underlying need was met through a different channel (e.g. a waitlist promotion elsewhere) — an alert is an independent intent, not correlated with other capacity events.
- An alert never reserves a resource and never auto-books; it only notifies (at most one deduplicated attempt per alert/matching-window).
- Unauthenticated visitors cannot create an alert: the alert page shows a login-required card, and after login/account creation they land on the same prefilled page (UC-072 A1). The booking flow's "Avise-me quando abrir" button links to it with the service, the single resource pick (when there is exactly one) and the duration as query parameters.
- An alert is for exactly one service: a basket of several services has none, because matching evaluates one service's slots (a slot for one line says nothing about the combination). For a legged or bundled service the alert matches when the whole service fits — every leg, bundle member and pool is applied — and its one `preferredResourceId` can only filter that.
- The `participantCount` field exists but the alert page never sends it and matching ignores it.
- An alert's `expiresAt` defaults to 30 days after creation (`ALERT_DEFAULT_EXPIRY_DAYS`), is at most 365 days after it (`ALERT_MAX_EXPIRY_DAYS`, the highest value `maxBookingAdvanceDays` can take), and is clamped to `acceptableEndAt` for a range; a customer may hold at most 10 `ACTIVE` alerts (`ALERT_ACTIVE_CAP_PER_CUSTOMER`) — all three in `availability-alert-criteria.helpers.ts`, the cap enforced by `CreateAvailabilityAlertUseCase`.

**Key Methods:**
- `AvailabilityAlert.create(options: CreateAvailabilityAlertOptions)` (UC-072)
- `update(changes)` / `cancel(correlationId, now?)` (UC-076/UC-053) — `changes` is an `UpdateAvailabilityAlertChanges`: the criteria plus `preferredResourceId`, `durationMinutes`, `participantCount` and `expiresAt`
- `expire(correlationId)` — `ACTIVE → EXPIRED`, called by the alert-expiry job (M23-S06)
- `markPersisted(version)` — the repository's hook after a successful save, advancing the optimistic-concurrency `version`
- `recordNotificationAttempt(matchingWindow, channel, correlationId, now?)` (M23-S07) — for an `ACTIVE`, unexpired alert: queues one `PENDING` attempt for the `[startsAt, endsAt)` slot, moves the alert `ACTIVE → NOTIFIED` and raises `AvailabilityAlertMatched`; returns `false` and does nothing for an alert that is notified, cancelled, expired or past its `expiresAt`, so it never notifies twice. The repository persists the queued attempt (`takePendingAttempt()`) with the status change, deduplicated on `(alertId, matchingWindow, channel)`.

---

#### **Aggregate: FutureCommitmentException** (Root Entity)

> Introduced by M23 Cluster 3. A manager-owned worklist entry — never changes the affected booking/session itself. Covers a change *nobody explicitly reviewed per-session*: a resource deactivation, an hours reduction, or a side effect of an otherwise-unrelated config edit. **Excludes** a template date-range/from-date cancellation the manager explicitly initiated (Cluster 4's session-cancellation flow) — that flow's own step is already the explicit, audited resolution.

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
  alternatives:          { resourceId, resourceName }[]   -- advisory, computed at raise time (the worklist read recomputes it for OPEN entries); always revalidated at resolve time
  createdAt:             DateTime
}
```

**Raised by (M23-S08):** a resource deactivation — from both `DeactivateResourceUseCase` (UC-047) and the `StaffDeactivated` cascade (UC-048) — raises one entry per future booking (`PENDING`, `INFO_REQUESTED` or `APPROVED`) occupying the resource, `sourceType = RESOURCE_DEACTIVATION`, `affectedType = BOOKING`. A recurring schedule gets no entry of its own: each of its occurrences is a booking. The hours-reduction and closure triggers have no wired caller yet. `ownerStaffId` is `null` for a deactivation-raised entry.

**Invariants:**
- One idempotent entry per affected commitment — a repeated trigger for the same unresolved impact updates the existing open row rather than duplicating manager work (`UNIQUE (tenantId, sourceType, sourceId, affectedType, affectedId) WHERE status = 'OPEN'`).
- A commitment is never silently moved or invalidated — this aggregate only ever records impact/alternatives; UC-077 is the sole resolution flow, and even there, the manager makes an explicit choice.
- No safe alternative existing is a valid terminal state ("no compatible alternative"), not an error — the manager still explicitly keeps, reassigns, reschedules, cancels, or dismisses.
- `REASSIGN` moves the booking to another resource at the *same window* (time, price and status untouched); `RESCHEDULE` moves it to a manager-chosen new time and needs an `APPROVED` booking. Both are revalidated at commit; if the alternative is gone the entry stays `OPEN`. REASSIGN, CANCEL, KEEP and dismiss can be applied to many entries at once, each in its own transaction (best-effort); RESCHEDULE is one entry at a time.

**Key Methods:**
- `FutureCommitmentException.raise({ tenantId, sourceType, sourceId, affectedType, affectedId, alternatives, … })` (UC-073) — one options object
- `dismissAutomatically(reason, correlationId)` (M23-S48) — closes an entry with no acting person when the booking no longer needs a decision (the booking ended, or no longer occupies the source resource).
- `refreshAlternatives(alternatives)` — replaces the suggested alternatives of an `OPEN` entry (throws once resolved or dismissed).
- `resolve(staffId, resolutionType, reason, correlationId)` / `dismiss(staffId, reason, correlationId)` (UC-077) — the booking change itself is applied by the resolving use case in the same transaction, never by this aggregate.

---

> ⚠️ **Planned, not built:** the six M24 Cluster 4 aggregates below (`ClassScheduleTemplate`, `ClassSession`, `ClassSessionBooking`, `RecurringEnrollment`, `ClassAccessContract`, `ClassScheduleTemplateException`) have no aggregate class in `apps/backend/src` yet; they are the target design for the M24 plan (`plan/M24-MULTIVERTICAL-CLASSES-SESSIONS.md`). `docs/DOMAIN_EVENTS.md`, `docs/DATABASE_SCHEMA.md` and `docs/TENANTS_SETTINGS_SCHEMA.md` carry the same marker.

#### **Aggregate: ClassScheduleTemplate** (Root Entity)

> Introduced by M24 — Multi-Vertical Scheduling, Cluster 4 (Classes/Sessions). Session-style recurring pattern — the SESSION-family counterpart to `RecurringBookingSchedule`. Depends on `Service.classResourceSlots` (Cluster 2 schema).

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
- A chosen resource must not already be committed to an overlapping template, an `APPROVED` appointment `Booking`, or an active `RecurringBookingSchedule` matching the new recurrence — evaluated via the same advisory-lock/recurrence-rule-direct-evaluation protocol as `RecurringBookingSchedule` (`docs/DATABASE_SCHEMA.md`).
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

**`Booking` — modified (M23 Cluster 3):**
- `+ recurringScheduleId: RecurringBookingScheduleId | null` — set when generated by an active `RecurringBookingSchedule`; unique `(tenantId, recurringScheduleId, scheduledAt)`.
- `+ createdByStaffId: StaffId | null` — set when staff created the booking on a customer's behalf (UC-108, M23-S39).
- `+ participantCount: int | null`, `+ intake: BookingIntakeSnapshot | null` (`intakeSchemaVersion`, `intakeAnswers`, `consentAcceptedAt`, `consentVersion` — an immutable snapshot of what was submitted against the booked schema version) and `+ attendees: BookingAttendee[]` (UC-067/068, M23-S02). `BookingAttendee` is a child entity of the Booking aggregate: `{ id, bookingId, tenantId, name, customerId (always null), isMinor }`, created only when the booked schema has `requiresNamedAttendees`.
- `+ cancelledAt`, `cancelledBy`, `cancellationReason`, `rejectedAt`, `rejectedBy`, `rejectionReason` — the aggregate is authoritative for who ended a booking and why, for every booking (the audit table has no backfill).
- `+` terminal status `NO_SHOW` added to the state machine: `APPROVED → COMPLETED | CANCELLED | NO_SHOW` (UC-074). A manager may correct a mistaken no-show with an append-only audit transition; loyalty is awarded only if the corrected resulting state is `COMPLETED`. **This changes CLAUDE.md §5's booking state machine — see that file's own update alongside this promotion.**
- Every status change of an existing booking (M23-S26) records a pending transition — `from`, `to`, a `BookingActor` (`STAFF | MANAGER | CUSTOMER | GUEST | SYSTEM` plus id), reason where one exists, `correlationId` — beside its domain events; `TypeOrmBookingRepository.save()` persists them into `booking.booking_status_transitions` in the same transaction as the booking. Creation, including a recurring occurrence materialized directly as `APPROVED`, records none. A booking's status changes only through the aggregate's private `transitionTo`, which records the transition and assigns the status in one step, and every status-changing method takes the acting `BookingActor` to pass to it. A `Booking` read never loads the history.
- Reschedule (UC-069) now supports bundles/legs atomically, recalculates the quote, and records an append-only `BookingQuoteRevision` (new child-adjacent table, `docs/DATABASE_SCHEMA.md`) linking to the prior arrangement — extends the existing `BookingRescheduled` event's scope rather than introducing a new one.

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
  phone:          Phone | null   -- nullable: collected later (UC-021 A3); the `phone` column in DATABASE_SCHEMA is NULLABLE
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
  triggerEvent: NotificationTemplateKey (e.g., 'booking-approved-customer' — which domain event/trigger this template renders for)
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
  (same multi-tenant model as Customer — see docs/TENANT_ISOLATION_STRATEGY.md)

> Per CLAUDE.md §2 invariant #6: "Staff can be multi-tenant — UNIQUE(tenant_id, google_oauth_id),
> same shape as customers." A staff row is always provisioned isActive=true at invite time;
> "pending invite" is signaled by googleOAuthId IS NULL, not isActive.
```

---

## Domain Events

Domain events represent significant business occurrences that other contexts may need to react to.

### **Booking Context Events**

Every event below also has an `audit-log` consumer (one thin `<Context>AuditLogHandler` per context, M23-S36) — omitted from the Consumers column for brevity. Payloads and the authoritative consumer list per event: `docs/DOMAIN_EVENTS.md` and `infra/terraform/pubsub-catalog.json`.

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `BookingRequested` | New booking submitted (1..N lines) | Notification Context |
| `BookingApproved` | Admin approves booking, or staff create a booking directly in `APPROVED` on a customer's behalf (UC-108 — no `BookingRequested` is raised) | Notification Context |
| `BookingRejected` | Admin rejects booking | Notification Context; Booking Context (`availability-alert-matching`) |
| `BookingInfoRequested` | Admin requests more info (PENDING → INFO_REQUESTED) | Notification Context |
| `BookingInfoSubmitted` | Customer / guest responds to an info request (INFO_REQUESTED → PENDING) | Notification Context |
| `BookingCancelled` | Customer/admin cancels booking (also each occurrence when a recurring schedule is ended) | Notification Context; Booking Context (`availability-alert-matching`) |
| `BookingRescheduled` | Customer/admin moves a booking to a new slot (UC-069) | Notification Context; Booking Context (`availability-alert-matching`) |
| `BookingCompleted` | Staff marks booking complete, or a manager corrects a `NO_SHOW` to `COMPLETED` (UC-074) | **Loyalty Context** (`complete-booking-loyalty-effects` — the only Booking event Loyalty cares about); no Notification consumer |
| `BookingResourceReassigned` | A manager reassigns a booking to another resource at the same window (UC-077 REASSIGN) | Notification Context (customer email); `audit-log` |
| `ResourceDeactivationImpactRaised` | A resource deactivation raised at least one worklist entry (UC-047) | Notification Context (one manager email); `audit-log` |
| `BookingNoShow` | Staff marks an `APPROVED` booking as a no-show after its end time (UC-074) | Notification Context (customer email) |
| `RecurringBookingScheduleCreated` / `…ApprovalRequested` / `…Rejected` / `…Ended` | Recurring-schedule lifecycle (UC-070, UC-071) | Notification Context |
| `AvailabilityAlertCreated` / `…Updated` / `…Cancelled` / `…Expired` | Availability-alert lifecycle (UC-072, UC-076) | none besides `audit-log` |
| `AvailabilityAlertMatched` | A date becomes selectable for an alert (UC-072 step 3) | Notification Context (customer email) |
| `FutureCommitmentExceptionRaised` / `…Resolved` / `…Dismissed` | Future-commitment worklist (UC-073, UC-077) | `audit-log` only, by design; the manager alert and the customer message hang on `ResourceDeactivationImpactRaised` and `BookingResourceReassigned` (M23-S23) |

> Booking Context also **consumes** `StaffDeactivated` (published by Staff Context) to cascade-deactivate a `STAFF`-type `Resource` (UC-048) and `TenantProvisioned` (published by Platform Context) to create the tenant's location resource — see `docs/BOUNDED_CONTEXTS.md`.

### **Loyalty Context Events**

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `ServicePointsEarned` | `BookingCompleted` consumed → one `LoyaltyEntry` inserted per `BookingLine`, **one event per booking** (`eventVersion = 2`, lists every line) | Notification Context |
| `PointsExpiringSoon` *(a Command published through the outbox, not a `DomainEvent`)* | Weekly cron (Mondays 06:00 UTC) finds entries whose `expires_at` falls within the next `loyalty.expiryWarningDays` (default 7, see `docs/TENANTS_SETTINGS_SCHEMA`) — forward-looking warning | Notification Context |

### **Staff Context Events**

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `StaffInvited` | New staff member invited (UC-028) or first MANAGER created during tenant provisioning (M04-S06) | Notification Context (invitation email) |
| `StaffActivated` | MANAGER reactivates a deactivated staff member (UC-031) | `audit-log` only |
| `StaffDeactivated` | MANAGER deactivates a staff member (UC-029) | **Booking Context** (UC-048, cascades to the wrapping `STAFF`-type `Resource` — added M21 Cluster 1; first real consumer of this event) |

### **Platform Context Events**

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `TenantProvisioned` | A new tenant is provisioned (UC-024) or self-signs up (UC-127) | Staff Context (first MANAGER), Booking Context (location resource), Notification Context (default template seed), **Billing Context** (trial subscription) |
| `LeadFormSubmissionReceived` | A visitor submits a hotsite lead form (M20) | `audit-log` only |
| `TenantDeactivated` *(slice G, not implemented)* | A tenant is deactivated (emitter decided at story discovery, sequenced with M17-S51; UC-142) | **Billing Context** (cancels the subscription), `audit-log` |

### **Billing Context Events**

Payloads and consumers: `docs/DOMAIN_EVENTS.md` § Billing Context Events. Every event also has an `audit-log` consumer (`BillingAuditLogHandler`).

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `ChargeIssued` | A charge exists at the provider with a payment link (issue job, recovery, re-issue) | Notification Context (invoice email) |
| `ChargePaid` | The provider's first paid signal for a charge | Notification Context (receipt) |
| `SubscriptionPastDue` / `SubscriptionSuspended` / `SubscriptionReactivated` | Status ladder transitions (UC-115, UC-134) | Notification Context; hotsite revalidation and access-cache invalidation (suspend / reactivate) |
| `SubscriptionCancelled` / `PlanChanged` | The manager cancels or changes the plan (UC-133, UC-136) | Notification Context (billing email) |
| `BillingReminderDue` | Daily dunning cadence (UC-139) | Notification Context |
| `SubscriptionPriceChangeAnnounced` | The operator schedules a list-price change (UC-112), one per affected tenant | Notification Context |
| `TenantPurgeWarning` / `TenantPurgeRequested` / `TenantPurgeContextCompleted` *(slice G)* | Clean-up of a long-suspended or discarded tenant (UC-132, UC-141) | Notification Context (warning); every context as a purge participant; Billing's purge coordinator |

### **Notification Context Events**

None. `EmailSent` / `EmailFailed` were never implemented as domain events — delivery outcomes are recorded in `NotificationLog` (see `docs/DOMAIN_EVENTS.md`).

---

## Value Objects Reference

> **Shared value objects:** `Money` and `Address` are used by multiple contexts (Booking, Customer, Loyalty). They live in `src/shared/value-objects/` — **not** inside any single context. Contexts import them from shared. All other value objects below (`Email`, `Phone`, `TimeSlot`, etc.) follow the same rule if used across contexts; otherwise they live inside their own context's `domain/value-objects/`.

### **Address**
Postal address. Country-spec driven. Lives in `src/shared/value-objects/address.ts`. Used for customer `defaultAddress` and booking `pickupAddress`.
```
Address {
  street:       String          -- logradouro (e.g. "Rua das Flores")
  number:       String          -- número (e.g. "123")
  complement:   String | null   -- complemento (e.g. "Apto 4B", "Bloco C") — optional
  neighborhood: String          -- bairro (e.g. "Centro")
  city:         String          -- cidade (e.g. "Belo Horizonte")
  state:        String          -- state/UF (e.g. "MG" for Brazil)
  zipCode:      String          -- postal code (e.g. CEP "30130010" for Brazil, 8 digits no hyphen)
}
```
- Immutable (value object — replace, never mutate)
- Validation is driven by the country's `AddressSpec` (`address.ts`): required fields, an optional postal-code regex, an optional state pattern and an optional required neighborhood. For Brazil: `zipCode` matches `/^\d{8}$/` and `state` is a valid UF.

### **Email**
- Validates RFC 5322 format
- Immutable
- Comparable by value

### **Phone**
- Validates generic E.164 format `^\+[1-9]\d{6,14}$` (`packages/validation/src/phone.ts`) — any country code, not Brazil-only
- Stores in E.164 format (e.g. `+55...` for Brazil)
- Immutable

### **Money**
Lives in `src/shared/value-objects/money.ts`.
- Amount (Decimal — never float)
- Currency (any ISO-4217 3-letter code, upper-cased; `'BRL'` is the default — localization is no longer Brazil-only, see `docs/TENANTS_SETTINGS_SCHEMA.md`)
- Display format: locale-driven (e.g. `R$ 1.234,56` for BRL in pt-BR)
- Supports operations: add, subtract, multiply
- Immutable

### **TimeSlot**
Conceptual only — no `TimeSlot` class exists in code; slots are plain `{ startTime, endTime }` strings.
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
NO_SHOW         -> COMPLETED   (manager correction only; otherwise terminal)
```

> A booking materialized from a `RecurringBookingSchedule` (M23-S05) is created directly in `APPROVED` — the schedule was vetted once when it became `ACTIVE`, so each occurrence skips the `PENDING` review; from `APPROVED` it follows the same transitions as any other booking.
>
> `NO_SHOW` is added by M23 — Multi-Vertical Scheduling, Cluster 3 (UC-074): reachable only from `APPROVED`, terminal, and correctable to `COMPLETED` by a manager only. See the note above and `.copilot/context.md` §5 for the same state machine.

### **BookingType**
Enum: `GUEST | CUSTOMER`

### **TaxId** *(Billing context; planned under `src/shared/value-objects/` because Platform's signup reuses it)*
BR business or personal tax identity: **CNPJ** (14 digits) or **CPF** (11 digits), stored digits-only, check digits validated by `create()`; `reconstitute()` skips validation. The types a country accepts come from the `taxId` entry added to `CountrySpec` beside `AddressSpec` (BR: `CNPJ` | `CPF`; US: none — an optional free-text `OTHER`). A validation failure throws a typed domain error (`BILLING_IDENTITY_TAX_ID_INVALID` at the billing page, `SIGNUP_TAX_ID_INVALID` / `SIGNUP_TAX_ID_REQUIRED` at signup) with an `instanceof` branch in every calling `mapXxxError` (`vo-bare-error`). Required for a non-exempt BR tenant from signup because the provider needs `cpfCnpj` to create a customer.

### **FeatureKey / ChatbotTier** *(Billing context; closed enums in `@ikaro/types`)*
`FeatureKey` = `HOTSITE | BOOKING | LOYALTY | CHATBOT | LEAD_FORM` (mirrored per the `closed-enum-registry` detector; recurring reservations and availability alerts are part of `BOOKING`, not separate keys). `ChatbotTier` = `BASIC | PLUS`; every other feature has the single tier `STANDARD`. Every Billing amount is an **integer in minor units plus an ISO currency** (`amount_minor` bigint, never a float). The shared `Money` VO above is Decimal-based, so whether a minor-units money VO reuses it or sits beside it is settled by the implementing story; the stored shape is fixed here.

### **Expiration window (`loyalty.expiryDays`)**
Configurable **per tenant** via `tenants.settings.loyalty.expiryDays` (integer, days). Typical values: 180 (6 months) or 365 (1 year). Defaults to 180 if unset.

When a `LoyaltyEntry`'s `expiresAt` passes:
- The entry stops contributing to active balance. The entry row itself is never mutated (append-only); the daily `ExpirePointsJob` (`contexts/loyalty/application/jobs/expire-points.job.ts`) decrements the `LoyaltyBalance` and records the entry in `loyalty.balance_expiry_log` so it is processed once.
- No event is emitted. Customers are warned **in advance** via the weekly `PointsExpiringSoon` cron (see `NotifyExpiringPointsJob`, `contexts/loyalty/application/jobs/notify-expiring-points.job.ts`).

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
│          BookingReminderDueToday, AdminDailyScheduleReminder,│
│          RecurringScheduleRenewalDue (cron Commands)         │
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

> The diagram above is a partial overview (it omits events such as the resource/alert/recurrence events and the Platform context's); `docs/DOMAIN_EVENTS.md` has the full event list.

Booking → Loyalty: BookingCompleted only (inserts LoyaltyEntry per line)
Booking → Notification: all lifecycle events → emails
Staff  → Notification: StaffInvited → invitation email
```

---

---

### **Context 6: Platform Context**
**Purpose:** Manage the operational lifecycle of each tenant — onboarding, configuration, and hotsite (staff invite/deactivate lifecycle is owned by the Staff Context, not Platform).

**Responsibilities:**
- Create and configure tenants (name, slug, initial settings)
- Allow tenant admins to edit their operational settings (cancellation window, loyalty rules, business hours, timezone)
- Allow tenant admins to manage and publish their public hotsite (branding, layout, content)
- Answer public hotsite visitors' FAQ-style questions via an LLM-backed chatbot widget, scoped to the tenant's own business data (UC-033/UC-034) — informational only, no booking/customer/staff record access (`docs/USE_CASES.md` UC-033–UC-036)

**Key Aggregates:**
- `Tenant` (root) — the car wash company record; owns the `settings` JSONB blob
- `HotsiteConfig` (root) — tenant-scoped branding and layout for the public hotsite
- `ChatbotSession` (root) — one chat widget conversation; tracks cap-enforcement state
- `ChatbotMessage` (root) — one turn (visitor question or bot answer) within a `ChatbotSession`
- `ChatbotProviderBalance` (root) — single-row-per-provider prepaid balance, upserted by a periodic poll
- `LeadFormConfig` (root) — one per tenant; owns `audienceMode` and the question catalog (UC-037)
- `LeadFormSubmission` (root) — one per visitor submission to a tenant's lead form (UC-039/UC-040)

**Notes:**
- There is no super-admin UI in MVP. A new tenant is provisioned by a developer via a CLI command or a seed script.
- All Platform use cases (except super-admin provisioning) are performed by a staff member with `MANAGER` role within their own tenant scope.

**Published Events:**
- `TenantProvisioned` — consumed by Staff Context (creates first MANAGER staff row + publishes `StaffInvited`), Booking Context (location resource), Notification Context (default template seed), Billing Context (the trial `Subscription`) and the shared `audit-log` consumer; carries `countryCode` and a `billingHint` since the Billing release (`docs/DOMAIN_EVENTS.md`)
- `LeadFormSubmissionReceived` — consumed by `audit-log` (a placeholder logging consumer, M20-S16); a real notification/webhook consumer to the manager is still an obvious, explicitly deferred fast-follow

---

#### **Aggregate: Tenant** (Root Entity)
```
Tenant {
  tenantId:   TenantId
  name:       String           -- display name (e.g. "AutoWash Pro")
  slug:       String           -- URL-safe identifier (e.g. "autowash-pro"), globally unique
  settings:   TenantSettings   -- JSONB — see docs/TENANTS_SETTINGS_SCHEMA.md for full schema
  isActive:   Boolean
  createdAt:  DateTime
  updatedAt:  DateTime
}
```

**Key methods:**
- `updateName(name)` → normalizes and replaces the display name (rejects an empty name or an inactive tenant).
- `updateSettings(settings)` → validates and replaces settings blob; publishes no event (settings are read fresh per request).
- `deactivate()` → sets `isActive = false`; all tenant data remains intact.

---

#### **Aggregate: HotsiteConfig** (Root Entity)
```
HotsiteConfig {
  configId:      HotsiteConfigId
  tenantId:      TenantId
  branding:      HotsiteBranding -- ~21 fields: colors (primary/secondary/background/text/button),
                                 -- fonts (heading/body), logoUrl, borderRadius (incl. soft), optional buttonRadius,
                                 -- buttonStyle, spacing, shadowStyle, optional headingWeight/headingTransform,
                                 -- visual-rhythm + brand-identity overrides — see
                                 -- `apps/backend/src/contexts/platform/domain/hotsite-config.aggregate.ts`
                                 -- for the full `HotsiteBranding` interface, this is a summary not the full shape
  layout:        LayoutModule[]  -- ordered list of UI modules to render; each entry is
                                 -- { type, enabled, data, presentation? } — `presentation` is the optional
                                 -- section presentation (TD56), a sibling of `data`
  seo:           SeoMetadata     -- { title, description } — tenant SEO overrides, both nullable
  isPublished:   Boolean         -- false = draft; true = visible at /<slug>
  version:       Integer | undefined -- optimistic-locking column (undefined until first persisted; bumped by markPersisted())
  updatedAt:     DateTime
}
```

**Layout modules (types):** `NAVIGATION`, `HERO`, `SERVICE_LIST`, `GALLERY`, `TESTIMONIALS`, `BOOKING_CTA`, `ABOUT`, `CONTENT_BLOCK`, `CONTACT`, `FOOTER`, `CHATBOT`, `LEAD_FORM` — twelve shipped, each a singleton; a 13th, `TRIAL_SIGNUP_CTA`, is planned with Billing for the platform-owner tenant only (TD56 added `NAVIGATION` and `CONTENT_BLOCK`; their data and the `presentation` object are in `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` §4).

**Layout invariants (enforced by `updateContent()`, each with its own typed error — `hotsite-layout.rules.ts`):**
- at most one entry per module type (`PLATFORM_HOTSITE_MODULE_DUPLICATE`);
- `NAVIGATION`, when present, is the first entry (`PLATFORM_HOTSITE_NAVIGATION_NOT_FIRST`), and while it is enabled every item's target, and a `lead-form` header `cta`, is an enabled module of the same layout (`PLATFORM_HOTSITE_NAVIGATION_TARGET_NOT_ENABLED`);
- `presentation` is only accepted on `HERO`, `SERVICE_LIST`, `GALLERY`, `TESTIMONIALS`, `BOOKING_CTA`, `ABOUT`, `CONTACT`, `LEAD_FORM`, `CONTENT_BLOCK` and `FOOTER` (`FOOTER` only `surface` and `customColor`) (`PLATFORM_HOTSITE_PRESENTATION_NOT_ALLOWED`), and `presentation.background` only on those with no background image of their own — not `HERO`, `BOOKING_CTA`, `LEAD_FORM` (`PLATFORM_HOTSITE_PRESENTATION_BACKGROUND_NOT_ALLOWED`);
- the closed *shape* of each module's `data` and of `presentation` is the request schema's (`@ikaro/validation`; the strict `NAVIGATION`, `CONTENT_BLOCK`, `presentation` and detail-page shapes are defined once in `@ikaro/types` `hotsite-schemas.ts`), not the aggregate's.

**Key methods:**
- `updateContent(branding, layout, seo)` → replaces branding, layout, and seo; stays in draft until published.
- `publish()` → sets `isPublished = true`; hotsite becomes publicly visible.
- `unpublish()` → reverts to draft.

---

#### **Aggregate: ChatbotSession** (Root Entity)
Tracks one chat widget conversation for cap enforcement (`docs/USE_CASES.md` UC-033) and as the anchor `ChatbotMessage` rows reference for history reassembly. Not a rich DDD aggregate with cross-field invariants — same thin treatment as `NotificationLog`: a plain persistence record with a plain repository, no business rules beyond its own field transitions.

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
One turn (visitor question or bot answer) within a `ChatbotSession`. Stores the real conversation text on both sides — not just metadata — since the LLM is stateless between calls (the BFF must resend prior turns as history) and since this is the source of the per-message token/cost audit trail (`docs/USE_CASES.md` UC-033). Same thin "plain record" treatment as `ChatbotSession`/`NotificationLog`.

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
- `isHealthy(cooldownMinutes, now)` — the UC-034 condition (c) availability check below (reads `lastSuccessAt`/`lastFailureAt`; the health timestamps are written by a repository method, not the aggregate) — both writers persist via a **partial-column upsert only** (`docs/DATABASE_SCHEMA.md`'s "Write discipline" note), never a full-row replace, so the two independent writers can never clobber each other's columns.

**Availability rule (UC-034 condition c):** the provider is unhealthy only if `lastFailureAt` is more recent than `lastSuccessAt` **and** within `CHATBOT_PROVIDER_HEALTH_COOLDOWN_MINUTES` (default `5`) of now — a half-open/circuit-breaker cooldown, not a permanent trip, so a single transient failure can't leave the widget dark forever (`available: false` means the widget never renders at all, so without a cooldown no visitor could ever produce the success that would clear it).

---

#### **Aggregate: LeadFormConfig** (Root Entity)
One per tenant — owns the question catalog and audience gating for the `LEAD_FORM` hotsite module (`docs/USE_CASES.md` UC-037, `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` § LEAD_FORM). This canonical model section records the promoted design rationale.

**Properties:**
```
LeadFormConfig {
  tenantId:      TenantId          -- PK, also FK to platform.tenants, UNIQUE (one row per tenant)
  audienceMode:  'GUEST_AND_CUSTOMER' | 'CUSTOMER_ONLY'   -- default 'GUEST_AND_CUSTOMER'
  questions:     LeadFormQuestion[]  -- ≤20 entries, ordered
  version:       Integer | undefined -- optimistic-locking column (undefined until first persisted; bumped by markPersisted())
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

**Cross-aggregate save, one transaction (UC-037, `docs/API_CONTRACTS.md` § Lead Form Admin Config):** the manager's config drill-down screen edits both this aggregate (`audienceMode`/`questions`) and `HotsiteConfig`'s own `layout[]` entry for this module (teaser fields — title/subtitle/ctaLabel/etc., the same shape every other module's teaser data uses) as one user-facing save action. `UpdateHotsiteContentUseCase` writes both aggregates inside a single `txManager.run()` block when `audienceMode`/`questions` are present in the request (folded in at M20-S08 — previously a separate, near-duplicate `UpdateLeadFormModuleUseCase` behind its own endpoint, which this replaced) — a deliberate exception to "one aggregate per transaction," justified because both aggregates live in the same bounded context (Platform) and one real user action requires them to save atomically; this is not a precedent for casually spanning transactions across contexts. The module's `enabled` flag is not part of this cross-aggregate concern — it's just `layout[].enabled`, the same field every other module's `enabled` toggle already goes through on this same use case.

---

#### **Aggregate: LeadFormSubmission** (Root Entity)
One per visitor submission (`docs/USE_CASES.md` UC-039/UC-040). Independent aggregate from `LeadFormConfig` — deliberately never transactionally consistent with it (DB-expert-reviewed boundary, see below).

**Properties:**
```
LeadFormSubmission {
  id:           UUID v7           -- bare `id`, matching every other aggregate root's own convention
                                   -- (Booking, ChatbotSession, ChatbotMessage, NotificationLog, ...).
                                   -- `submissionId` is used only as the event-payload/API-response
                                   -- DTO field name (docs/DOMAIN_EVENTS.md, docs/API_CONTRACTS.md),
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

**Aggregate-boundary note (DB-expert pass, deliberate — not an oversight):** `LeadFormSubmission.answers` snapshots the full `{questionId, questionLabel, questionType, answerValue}` at submission time, not just `{questionId, value}` — the exact same reasoning `BookingLine.priceAtBooking`/`serviceNameAtBooking` already exists for above. Without the snapshot, a manager editing a question's label or deleting it later would silently corrupt how old submissions render. Same reasoning applies to `expiresAt`: computed **once, at insert time**, from whatever `retentionMonths` the tenant had *then* — never recomputed live — matching `docs/TENANTS_SETTINGS_SCHEMA.md`'s own "settings changes apply to future only" rule.

**Search index is a repository-level concern, not an aggregate property (added post-promotion, UC-041 search, M20-S12/S13):** `TypeOrmLeadFormSubmissionRepository.save()` derives one `platform.lead_form_answers` row per question from `answers[]` (flattening a `MULTIPLE_CHOICE`'s array into one row per selected option) and writes both tables in the same transaction. `lead_form_answers` is **not** a second aggregate — it has no independent lifecycle, no identity meaningful outside its parent submission, and no domain behavior; it exists purely so UC-041 can filter by a specific question's answer (and AND several such filters together), which the JSONB snapshot alone can't do without ambiguity. See `docs/DATABASE_SCHEMA.md` § `platform.lead_form_answers` for the full shape and why a flattened single-text-column search (the originally-drafted design) was replaced with this instead.

**Key methods:**
- `static create(props)` → validates required fields via `Email`/`PhoneNumber` VOs, snapshots `answers`, computes `expiresAt` from the tenant's current `retentionMonths`. Publishes `LeadFormSubmissionReceived`.

---

### **Context 7: Billing Context**
**Purpose:** Ikaro charging its tenants. Today the product is free to every tenant; Billing prices each feature by country, sells features separately, switches each one on only while it is paid for, and stops tenants that do not pay without a hard "login blocked" wall. **The payment provider owns the money** (charging, retries, hosted payment pages, receipts, refunds, chargebacks); Billing stores only the status it needs and owns exactly three policies: the **access ladder**, the **entitlement set** and the **clean-up**. Everything else is mirrored from the provider by webhook plus a reconcile job.

**Standing rules that shape the model** (the full set: `docs/discovery/tenant-billing/tenant-billing.md` §2, kept as the permanent *why*):
- **Everything sellable is a feature**, including the hotsite; a plan is a bundle of features, with no always-included base. `HOTSITE` is the root dependency (`BOOKING` requires it, `LOYALTY` requires `BOOKING`, `CHATBOT` and `LEAD_FORM` require `HOTSITE`) and can never be removed.
- **Entitlement gates, preference tunes, and both must pass:** effective availability = entitled AND enabled. Losing an entitlement never deletes or rewrites the manager's preference (hotsite `enabled`, `settings.*`); regaining it resumes exactly as left. Billing never mutates the manager's `isPublished` (effective published = the flag AND the tenant being operational).
- **Price is per feature × country × tier × cycle** from one list, in the country's currency (BR → BRL tax-inclusive, US → USD net of tax); no FX, **no per-tenant prices or negotiation**. A list change is operator-only, dated and announced.
- **Access control reads state, not events** (`TenantAccessPort`); events trigger emails and durable cross-context work only.
- **Providers sit behind a port.** Both Asaas (BRL) and Stripe (USD) are designed; an activation is released only after its real account and sandbox flow is verified.
- **`exempt` is the one switch for "never charge this tenant"** — not a price of zero and not the global kill switch.
- **Operator-free by default:** every situation is owned in order by the provider, the system, the tenant (self-service) and only then the operator; operator work is the mapped edge-case list only.

**Key Aggregates:**
- `Subscription` (root, 1 per tenant) — status ladder, entitlement items, period/anchor, flags
- `BillingAccount` (root, 1 per tenant) — tax identity, billing email, address, provider customer id, accepted terms
- `Charge` (root) — one bill for one period, with `ChargeLine` snapshot children
- `FeaturePrice` (root, platform-wide, no `tenant_id`) — catalog identity with dated `FeaturePriceVersion` amounts

Supporting persistence records (thin, not rich aggregates — same treatment as `NotificationLog`): `provider_events` (webhook idempotency inbox), `signup_registrations` (the provisioning registration), `tenant_purge_jobs` / `tenant_purge_steps` (the erasure coordinator), `provider_health` (platform-wide), `operator_audit`.

**Published Events:** see `### Billing Context Events` above. **Consumed Events:** `TenantProvisioned`, `TenantPurgeContextCompleted`, `TenantDeactivated` (slice G).

---

#### **Aggregate: Subscription** (Root Entity)
```
Subscription {
  subscriptionId:    SubscriptionId
  tenantId:          TenantId          -- exactly one per tenant (UNIQUE)
  status:            'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED'
  suspensionReason:  'NON_PAYMENT' | 'CANCELED' | 'PAYMENT_REVERSED' | 'OPERATOR' | null   -- non-null iff SUSPENDED
  countryCode:       CountryCode       -- fixed at start
  currency:          'BRL' | 'USD'     -- fixed at start (BR -> BRL, US -> USD)
  timezone:          IANA zone         -- snapshot of the tenant timezone, IMMUTABLE; every period boundary is local midnight in it
  merchantProfileKey: String           -- immutable key of the selling entity / provider account (BRL_FAKE, BRL_ASAAS_SANDBOX, live keys in production only)
  cycle:             'MONTHLY'         -- 'ANNUAL' in slice H; applies to the whole subscription
  anchorDay:         1..28             -- day-of-month the renewals land on (29-31 clamped to 28)
  trialEndsAt:       DateTime | null   -- tenant-local midnight closing day 14
  currentPeriodStart / currentPeriodEnd: DateTime | null
  nextDueDate:       Date | null       -- due date of the next period still to be issued
  pastDueSince:      DateTime | null
  graceUntil:        DateTime | null   -- operator override of the 14-day grace
  cancelAt:          DateTime | null   -- end of the last paid period when the manager cancelled
  planConfirmedAt:   DateTime | null   -- the manager confirmed the first paid selection
  suspendedAt:       DateTime | null   -- starts the clean-up clock
  hasEverPaid:       Boolean           -- set on the first confirmed payment
  exempt:            Boolean           -- free access, never charged
  items:             SubscriptionItem[]
  version:           int               -- optimistic lock
}

SubscriptionItem {   -- the SELECTED PLAN: what is paid for, from which period. No price.
  featureKey: FeatureKey,  tier: 'STANDARD' | 'BASIC' | 'PLUS',  startsAt: DateTime,  endsAt: DateTime | null (open-ended)
}
```

**Entitlement is not an aggregate and not a stored fact.** It is computed (the single formula every caller gets through `TenantAccessPort`):
```
entitled = SUSPENDED ? none
         : TRIALING  ? every sellable feature (chatbot at tier BASIC)
         : the items active now  (startsAt <= now AND (endsAt IS NULL OR endsAt > now))
```
Items hold only the *selected plan*. There are **no trial rows** (trial access comes from the status) and **suspension does not end-date items**, so reactivation is a status flip with nothing to restore. `operational = status != SUSPENDED`.

**Status ladder:** `TRIALING → ACTIVE → PAST_DUE (14 days) → SUSPENDED`; a trial whose first invoice is unpaid goes **directly** `TRIALING → SUSPENDED` (`NON_PAYMENT`) at trial end — there is no `PAST_DUE` grace after a trial.

| Status | Access |
|---|---|
| `TRIALING` | Everything, every feature, chatbot `BASIC`; 14 days ending at the tenant-local midnight closing day 14; no card. The Plano tab records the first paid selection but never reduces trial entitlements. **The first paid selection must be confirmed by the manager**; unconfirmed `PLAN_CONFIRM_FALLBACK_DAYS` (3) before the end, the default selection (all trial features) is invoiced with a plain-language email |
| `ACTIVE` | The items active now |
| `PAST_DUE` | **Full access** with a banner for managers; provider retries and Ikaro's dunning reminders; `graceUntil` can extend the 14 days |
| `SUSPENDED` | Nothing entitled. Reasons: `NON_PAYMENT`, `CANCELED`, `PAYMENT_REVERSED` (a full refund / completed chargeback reversal that leaves the current period unpaid), `OPERATOR` (abuse/takedown; payment does not lift it, only the audited `unsuspend`). **No new charges are issued while suspended.** A manager can still log in, but only to the billing page; staff see a suspended notice; customers see an "Empresa inativa" badge with history readable and cancellation of a future booking allowed; the hotsite is effectively unpublished |

**State transitions:**

| Subscription | From → To | Caused by |
|---|---|---|
| `TRIALING` → `ACTIVE` | trial end with the first charge `PAID` | sweep (period starts at trial end; `anchorDay` = trial-end local day clamped to 28) |
| `TRIALING` → `SUSPENDED` (`NON_PAYMENT`) | trial end + settlement margin, first charge unpaid or absent | sweep |
| `ACTIVE` → `PAST_DUE` | a `PERIOD` charge goes `OVERDUE` | sweep |
| `PAST_DUE` → `ACTIVE` | the overdue charge is `PAID` | payment |
| `PAST_DUE` → `SUSPENDED` (`NON_PAYMENT`) | 14 days (or `graceUntil`) elapsed | sweep (not during a suspension freeze) |
| `ACTIVE` / `PAST_DUE` / `TRIALING` → `SUSPENDED` (`CANCELED`) | `cancelAt` reached / immediate cancel | sweep / manager |
| any paid status → `SUSPENDED` (`PAYMENT_REVERSED`) | full refund or lost dispute leaving the period unpaid | webhook |
| any → `SUSPENDED` (`OPERATOR`) | operator suspend | operator |
| `SUSPENDED` → `ACTIVE` | recovery charge `PAID` (not for `OPERATOR`); `exempt` set; `unsuspend` (`OPERATOR` only) | payment / operator |
| `SUSPENDED` → (erased) | purge or self-service discard | purge coordinator (slice G) |

**Settlement margin (trial end):** the sweep waits `PAYMENT_SETTLEMENT_MARGIN_HOURS` (24), or `PAYMENT_PENDING_MARGIN_BUSINESS_DAYS` (3 business days, tenant-local calendar) when the manager already returned from the payment page and the charge is still open, before suspending; the rule and its flow are in `docs/USE_CASES.md` UC-115 step 2, and the constants are below.

**Constants (defined once):** `CHARGE_ISSUE_LEAD_DAYS = 10`, `PRICE_CHANGE_MIN_NOTICE_DAYS = 30`, `RECOVERY_CHARGE_DUE_DAYS = 7`, grace = 14 days, `PROVISIONING_GRACE_MINUTES = 15`, `PAYMENT_SETTLEMENT_MARGIN_HOURS = 24`, `PAYMENT_PENDING_MARGIN_BUSINESS_DAYS = 3`, `PLAN_CONFIRM_FALLBACK_DAYS = 3`, `ANNUAL_CHARGE_ISSUE_LEAD_DAYS = 30` (slice H). An increase needs at least `PRICE_CHANGE_MIN_NOTICE_DAYS + CHARGE_ISSUE_LEAD_DAYS` (40) days of notice.

**Invariants:**
- Items of one feature never overlap in time (DB GIST exclusion); feature dependencies are enforced in the aggregate: adding a feature whose dependency is not active, or removing one another active feature depends on, is rejected; the proposed final selection is validated as one dependency graph; a plan always keeps at least one feature.
- Removing `BOOKING` is rejected while any `PENDING`/`INFO_REQUESTED`/`APPROVED` booking, recurring schedule (`PENDING_APPROVAL` or `ACTIVE`) or `ACTIVE` availability alert extends on or after the removal's effective date (`BILLING_FEATURE_IN_USE`); once a removal is saved, the bookable window is capped at that date (a `bookableUntil` input honoured by every window consumer).
- All plan changes (additions, removals, tier changes) become effective at the **next paid service-period start**; they never change current-period entitlements and need no proration. `PAST_DUE` and `SUSPENDED` plans are read-only. (The one proration, slice H: an annual subscriber adding a feature mid-year pays a co-terminus `ADDON` charge.)
- `exempt` is reversible, except for the tenant whose slug is `PLATFORM_OWNER_TENANT_SLUG`; an exempt subscription is never charged, suspended, purged or emailed about billing. Clearing it starts a fresh 14-day first-selection window (`TRIALING`) and replaces the open-ended items with default paid items.
- `has_ever_paid` alone selects the clean-up delay: **90 days** suspended if the subscription never paid, **180 days** if it paid at least once, regardless of the suspension reason, with warnings at 30 and 7 days (`purge_warning_30/7_sent_at`, cleared on reactivation).
- Cancel: an `ACTIVE` subscription cancels at the end of its last paid period (`cancelAt`); `PAST_DUE` cancels immediately (`SUSPENDED/CANCELED`); `TRIALING` cancels at trial end when its first invoice is already paid, else immediately. Nothing is refunded.
- **Reactivation never edits or re-dates the old open charge:** when the sweep suspends for `NON_PAYMENT`/`PAYMENT_REVERSED` it cancels the stale open charge (locally and at the provider) and issues one **recovery charge** (one month, amount fixed at issue from the versions in force on the issue date, lines = the current items). If the provider refuses to cancel because that charge was just paid, the stale charge is the payment and the recovery charge is cancelled. When the recovery charge is paid the subscription becomes `ACTIVE`, `currentPeriodStart` = the payment moment, `anchorDay` = the payment's tenant-local day clamped to 28; the recovery charge keeps its own period NULL.

**Boundary note:** paying a `Charge` may move the `Subscription` back to `ACTIVE` — two aggregates in one use case, in one transaction, with a row lock on the subscription (`findByIdForUpdate`, `docs/LOCK_CATALOG.md`). Status is recomputable (the reconcile job re-derives it), so the invariant does not depend on the transaction alone.

---

#### **Aggregate: BillingAccount** (Root Entity)
```
BillingAccount {
  tenantId:         TenantId            -- exactly one per tenant (UNIQUE)
  taxId:            TaxId | null        -- BR: required from signup; US: optional
  legalName:        String | null
  billingEmail:     Email | null        -- falls back to the tenant's managers
  address:          Address | null      -- shared Address VO; required before the first paid selection for BR and US; validated by the billing country's AddressSpec
  provider:         'ASAAS' | 'STRIPE' | null
  providerCustomerId: String | null
  autoBilling:      'NONE' | 'PIX_AUTOMATICO' | 'CARD_RECURRING'   -- CARD_RECURRING only in slice F2
  autoBillingStatus: 'INACTIVE' | 'PENDING_AUTHORIZATION' | 'ACTIVE'
  acceptedTerms:    { version, acceptedAt, acceptedBy }
}
```
A separate aggregate from `Subscription` (edited by a different actor for different reasons). Tax identity is financial data: never in `tenants.settings`. R5: **nothing fiscal is required to use the product; the minimum billing identity is required to charge it** (BR = CPF or CNPJ at signup plus the full address before the first paid selection; US = the full address). Ikaro never issues nota fiscal itself; the provider emits NFS-e automatically. The billing email falls back to the managers' emails.

---

#### **Aggregate: Charge** (Root Entity)
```
Charge {
  chargeId:        ChargeId
  tenantId, subscriptionId
  kind:            'PERIOD' | 'RECOVERY' | 'ADDON'     -- ADDON only in slice H
  periodStart / periodEnd: Date | null                 -- NULL forever for RECOVERY (the period lives on the Subscription; paidAt is its start)
  dueDate:         Date                                -- tenant-timezone date
  lines:           ChargeLine[]                        -- { featureKey, tier, unitPriceMinor } price SNAPSHOT
  subtotalMinor / amountMinor: bigint, currency        -- BR tax-inclusive: equal; US (slice E): amount = subtotal + tax
  status:          'PENDING' | 'PAID' | 'OVERDUE' | 'FAILED' | 'CANCELED' | 'REFUNDED' | 'CHARGEBACK'
  method:          'CARD' | 'PIX' | 'BOLETO' | null
  paidAt, provider, providerChargeId, paymentUrl, paymentUrlExpiresAt, receiptUrl
  paymentReturnSeenAt: DateTime | null
  refundedAmountMinor: bigint
  providerCreationStatus: 'PENDING' | 'READY' | 'FAILED'
}
```
**Not a child of `Subscription`** (one per period forever = unbounded); paginated by `(tenant_id, due_date DESC)`.

**Price snapshot, one level:** items carry no price. When a charge is issued, the `FeaturePriceVersion` selected by the charge's **service-period start** (`effective_from <= period_start`) is copied into each line, so an invoice issued early (10 days before the period) uses its future period's price and a later list change never rewrites an issued charge. A recovery charge snapshots the versions in force on its issue date.

**Immutability:** after insert only status and payment fields are ever written (and, in slice E, the provider-finalized tax and amount of a US charge). A plan change cancels the unpaid next charge and issues a new `PERIOD` charge for the same period; the cancelled one stays as history (the uniqueness index ignores cancelled charges).

| Charge | From → To | Caused by |
|---|---|---|
| `PERIOD`/`RECOVERY` | (insert) → `PENDING` | issue job / recovery issue (`providerCreationStatus` `PENDING` → `READY`) |
| | `PENDING` → `OVERDUE` | status sweep, tenant-local due date passed |
| | `PENDING`/`OVERDUE` → `PAID` | the first of the provider's paid signals (webhook, reconcile, on-demand refresh) |
| | `PENDING`/`OVERDUE` → `FAILED` | the provider reports a final non-recoverable failure |
| | `PENDING`/`OVERDUE` → `CANCELED` | plan re-issue, cancel, suspension (stale charge), `exempt` set |
| | `PAID` → `REFUNDED` / `CHARGEBACK` | full refund / lost dispute (a partial refund only raises `refundedAmountMinor`) |

The provider call is always made **outside** the insert transaction: the charge is inserted `PENDING`, the provider is asked, and only then are the id, link and (US) tax written and `ChargeIssued` raised. The paid signal is method-dependent (Pix `RECEIVED` only; boleto `CONFIRMED` then `RECEIVED`; card `CONFIRMED`, `RECEIVED` ~32 days later): whichever arrives first yields the single paid transition and the later one is a no-op.

---

#### **Aggregate: FeaturePrice** (Root Entity, platform-wide)
```
FeaturePrice {            -- NO tenant_id
  featureKey, countryCode, tier, cycle, currency
  selectable:  Boolean    -- false hides it from NEW selection; existing subscribers keep renewing it
  versions:    FeaturePriceVersion[]   -- { amountMinor, effectiveFrom, announcedAt, createdBy, reason, supersededAt, batchId }
}
```
One list for everyone, **no fallback row** (a country needs a spec plus price rows; a missing renewable price is caught at deploy time by a startup/CI check, not at runtime). Versions in effect are immutable history; a not-yet-effective version can be **superseded** by a newer one (the old row is kept). `effectiveFrom` means a **service-period start date**: an invoice snapshots the new amount only when its period starts on or after that date. An increase needs at least 40 days of notice (`BILLING_PRICE_NOTICE_TOO_SHORT`); a decrease needs none but still has an explicit future `effectiveFrom`. The normal change is a **percentage adjustment of every price in force for a country** in one transaction, whole-unit rounding by default, one consolidated `SubscriptionPriceChangeAnnounced` per affected tenant (decision recorded in the discovery as the way operators raise prices); the single exact-price endpoint remains for corrections. Launch BR list (approved, monthly, tax-inclusive): `HOTSITE` R$ 49, `BOOKING` R$ 109, `LOYALTY` R$ 29, `CHATBOT` Básico R$ 39 / Plus R$ 79, `LEAD_FORM` R$ 19; the US list is staging-only until Stripe's real fees are confirmed.

---

#### **Entry point: `TenantAccessPort`** (shared port, `src/shared/ports/`)

The one synchronous contract the rest of the system uses to ask "is this tenant operational, and is feature X entitled?". It returns `{ status, suspensionReason, operational, features: [{ key, tier }] }` for an **explicit `tenantId`** (never read from `RequestContext`). Billing implements it with a `CachingXxx` adapter over `CachePort`: **asymmetric TTLs** (an operational answer 60 s in the shared port and 30 s in the BFF guard; a `SUSPENDED` answer only 10 s in both, so a paying tenant comes back fast), plus best-effort invalidation on the instance that handles `SubscriptionSuspended` / `SubscriptionReactivated` (`CachePort` has no cross-instance broadcast, so other instances rely on the TTL). A **transient lookup error fails open**; a **successfully-read missing subscription** is a provisioning/data-integrity incident and denies access — except for a tenant younger than `PROVISIONING_GRACE_MINUTES`, which is treated as a pending trial (allowed, no alert) until the self-heal job creates the missing trial. `FEATURE_FLAG_BILLING_ENFORCEMENT=false` makes every choke point fail open (emergency switch; rules in the enforcement section linked below). Enforcement is declarative at a few choke points (route decorators and one global guard, an opt-in event-dispatcher gate, one shared tenant-job helper, the single notification send path, one web route-to-feature registry); never ad-hoc `if (tenant.hasChatbot)` code in use cases. Details: `docs/ENGINEERING_RULES_SHARED.md` § Tenant access enforcement — the declarative choke points (planned).

---

#### **Persistence records and operator touchpoints**
- **`ProviderEvent`** `(provider, event_id)` — the webhook idempotency inbox; tenant resolved from the provider customer id before insert; unknown customers are acknowledged and logged, not stored.
- **`SignupRegistration`** — the provisioning registration created *before* the tenant exists; holds the Google `sub`, the BR tax id and the accepted terms so none of it travels in `TenantProvisioned`. Statuses `RESERVED` → `COMPLETED`; a reservation older than one hour is released. Trial rule: a Google account's **first** self-signup tenant gets a free trial; a further one only while every earlier self-signup tenant of that `sub` has `has_ever_paid = true` (`SIGNUP_TRIAL_NOT_AVAILABLE` otherwise).
- **`TenantPurgeJob` / `TenantPurgeStep`** *(slice G)* — the durable cross-context erasure coordinator; an operational process (`REQUESTED` / `IN_PROGRESS` / `FAILED` / `COMPLETED`), **not** a `Subscription` status. What Billing keeps after a purge (subscriptions without personal data; every charge and line, `tenant_id` an opaque id) and deletes (the billing account's personal data, the registration, provider events, audit payloads).
- **`ProviderHealth`** — one row per merchant profile (`last_reconcile_ok_at`, `webhook_status`, `freeze_active`); while `freeze_active` the status sweep suspends nobody, so a provider outage never locks out a paying tenant.
- **Operator touchpoints** (audited in `operator_audit`): `exempt` set/clear, `suspend` / `unsuspend` (reason `OPERATOR`), `grace`, and the price list. There is **no** operator payment override and no operator reactivation of a payment-based suspension (provider-confirmed payment is the only way back, except `exempt` or lifting an `OPERATOR` suspension).

---

## Anti-Corruption Layer (Future)

When integrating external services (e.g., SMS service), create an anti-corruption layer to translate external models to our domain models. The payment providers are the planned application of the same pattern (none is built yet): Billing's `BillingProviderPort` is defined in Ikaro's terms (start payment, give a payment link, cancel, enable auto-billing; normalized inbound events) and each adapter (`AsaasBillingProvider`, `StripeBillingProvider`, the non-production `FakeBillingProvider`) translates one provider's model into it, so no provider type leaks beyond the adapter (`docs/DOMAIN_MODEL.md` § Context 7: Billing Context). Nothing else is needed for MVP.

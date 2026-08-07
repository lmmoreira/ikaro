# Discovery: Multi-Vertical Scheduling

**Status:** Discovery — exploratory. Nothing here is committed to a milestone; no `UC-XXX` numbers are consumed by this document.
**Companion doc:** `MULTI_VERTICAL_SCHEDULING_USECASES.md` — candidate use cases derived from this model, for completeness-checking.
**Companion doc:** `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md` — the physical schema (tables, constraints, migration ordering) this model implies, plus gaps found while translating it into real DDL.
**Companion prototype:** `MULTI_VERTICAL_SCHEDULING/prototype/` (start at its `index.html`) — 34 illustrative screens working through the model concretely on one fictional tenant (Vitta Studio). Several findings from building it fed corrections back into this doc and the use-cases doc — see its `dev-notes.md` for the full list.

---

## 1. Problem Statement

Today's Booking Context models exactly one scheduling shape. `Booking` carries `scheduledAt` + `totalDurationMins`; there is no resource concept anywhere in the domain. Availability is computed **tenant-wide**:

```
1. ScheduleOpening   (highest priority — opens a normally-closed day)
2. ScheduleClosure   (blocks a normally-open day or window)
3. businessHours     (recurring weekly pattern)
minus: any overlapping APPROVED booking, for the whole tenant
plus:  tenants.settings.booking.serviceBufferMinutes, added to every new candidate's own window
```

Capacity is implicit and always `1` — one approved booking blocks the whole tenant for that window. This works for car wash because the resource actually being consumed (a bay, a wash line) *is* the business; there's nothing else running concurrently to protect against.

Four verticals break that assumption in different ways:
- **Hairdresser** — the customer picks a specific staff member and needs *their* calendar, not the tenant's.
- **Pilates** — a class at a fixed time has capacity 4; many customers share one slot.
- **CrossFit** — same shape as pilates, capacity ~20, configurable.
- **Big gym** — Pilates (capacity 4) and CrossFit (capacity 20) run at the same hour, independently.

This document works out what changes in the domain model to support all four, plus the load-bearing cases that fall out once you actually try (bundled resources, sequential multi-stage appointments, waitlists, recurring enrollment, multi-unit bookings, fungible resource pools).

---

## 2. Taxonomy of Scheduling Models

| # | Model | Example vertical | What's actually scheduled | Resource shape | Capacity shape | Family |
|---|---|---|---|---|---|---|
| 1 | Exclusive whole-business | Car wash (today) | The tenant itself | Implicit single `LOCATION` resource | 1 | Appointment |
| 2 | Per-staff exclusive, customer-chosen | Hairdresser | A specific `Staff` resource | 1 per staff, customer picks | 1 | Appointment |
| 3 | Per-staff exclusive, system-assigned | "Any available stylist" | Named staff resource, auto-picked | 1 per staff | 1 | Appointment |
| 4 | Fungible resource pool | Squash/padel courts, generic wash bays | Interchangeable, anonymous resource | 1 per unit, no identity exposed to customer | 1 | Appointment |
| 5 | Group/class capacity | Pilates (4), CrossFit (20) | A class *session*, not a person | Resource(s) attached to the session | N | Session |
| 6 | Multi-service concurrent timetables | Big gym; also a big studio running the *same* class twice (2 Pilates rooms, same hour) | Multiple independent instances of #5 running side by side | Independent per service **or per template** — "independent" doesn't require different services, just different `ClassScheduleTemplate` rows | N per template | Session |
| 7 | Compound/bundled resource requirement | Dentist + chair | Multiple resources, same window, all required | ≥ 2 resources | 1 (or N if the bundle repeats as a session) | Appointment |
| 8 | Sequential/multi-stage | Spa journey (sauna → massage → lounge) | Multiple resources, different sub-windows of one appointment | Ordered resource legs | 1 per leg | Appointment |
| 9 | Buffer / transition gap | All verticals | Not a bookable thing — a modifier on the others | Resource turnover + leg transition | N/A | Cross-cutting |
| 10 | Waitlist over capacity | Pilates class full | A queue attached to a session | N/A | Session capacity + queue | Session |
| 11 | Recurring/series enrollment | Weekly pilates slot | A standing link to a template | N/A | Checked fresh per occurrence | Session |
| 12 | Multi-unit booking quantity | Reserve 2 bikes for 2 people, one checkout | One booking claiming > 1 unit | N/A | Consumes N of the session's capacity | Session |
| 13 | Capacity as (Service × Resource), not Resource alone | A trainer doing both 1:1 and group classes | Same resource, different capacity depending on which service | N/A | Declared per Service | Cross-cutting (modeling principle) |

---

## 3. Core Abstraction — `Resource`

A new aggregate, owned by the **Booking Context** (same context that already owns `ScheduleClosure`/`ScheduleOpening` — scheduling concerns stay centralized there rather than leaking into Staff Context).

```
Resource {
  resourceId:   ResourceId
  tenantId:     TenantId
  type:         ResourceType        -- LOCATION | STAFF | ROOM | EQUIPMENT
  refId:        StaffId | null      -- set only when type = STAFF
  name:         String              -- denormalized display name, independent of Staff.name
  workingHours: BusinessHours | null -- same per-weekday shape as Tenant.settings.businessHours;
                                     -- null = inherits tenant hours. When present, every window must be a
                                     -- subset of the tenant's recurring window; a resource never extends
                                     -- the business's operating time.
  turnoverMinutes: int              -- default 0; see §7
  maxCapacity: int | null           -- optional physical ceiling for LOCATION/ROOM (and only genuinely
                                     -- capacity-bearing EQUIPMENT); never a generic STAFF capacity.
  isActive:     Boolean
}
```

Three different relationships to existing data, by design, not by accident:
- **`LOCATION`** — the degenerate default every tenant gets. Replaces today's implicit "whole tenant is the resource" behavior with an explicit row, so the model is uniform (resolved in §9 item 1 — no legacy `resourceId = null` path).
- **`STAFF`** — *wraps* an existing `Staff` aggregate by reference (`refId = staffId`). Staff Context stays pure identity/permissions; scheduling data (working hours, turnover) lives on the `Resource` row, not on `Staff` itself. Mirrors the existing rule that Staff Context reads closures but never writes them.
- **`ROOM` / `EQUIPMENT`** — no other context owns these; the `Resource` row *is* the aggregate, full stop.

`ScheduleClosure` / `ScheduleOpening` gain a nullable `resourceId`. `null` = tenant-wide (today's exact behavior, unchanged default). Set = scoped to one resource ("Maria is out Tuesday" closes her calendar only, not the whole salon).

### Tenant boundary and resource schedule resolution

The tenant calendar is a hard outer boundary. Resolve it first using today's three-layer rule (tenant opening, tenant closure, recurring tenant business hours). A resource can be available only inside that resulting tenant window:

1. If the tenant is closed, every resource is closed. A resource opening never bypasses a tenant-wide closure or extends beyond a tenant opening/window.
2. Within an open tenant window, a resource uses its own recurring hours (or inherits tenant hours when `workingHours = null`). A resource opening can make that resource available on one of *its* normally-off dates, but only in the tenant window.
3. A resource closure removes time from that resource even when a tenant opening exists. A tenant-wide closure removes time from every resource.
4. A bundled appointment intersects this result for every required resource.

Changing resource hours, adding a closure, deactivating a resource, or changing a template is a change to **future availability/generation**, not a retroactive invalidation. Already-approved appointments and already-materialized sessions remain explicit commitments even if they now fall outside the new default; the manager is warned and can resolve them separately. The generator creates no new occurrence outside current tenant/resource availability.

---

## 4. The Appointment/Session Fork

Trying to fold bundles, sequential legs, capacity, waitlist, recurring enrollment, and multi-unit quantity into one generalized `Booking` aggregate doesn't compose — each requirement is a plausible addition alone, but stacked together they contradict each other's assumptions (a materialized-slot design that a hairdresser's calendar doesn't need; a purely-dynamic design that a waitlist has nothing to attach to). They split into two families instead:

**Appointment-style** (models 1, 2, 3, 4, 7, 8) — one customer, one private window, resource(s) locked exclusively. Extends today's `Booking`/`Service` almost for free: availability stays dynamically computed, just scoped to a resource (or resource set) instead of the whole tenant.

**Session-style** (models 5, 6, 10, 11, 12) — the session is the bookable thing, not a person. Needs something today's model has no equivalent of: a **materialized** row per calendar occurrence, because capacity needs a place to be counted against, a waitlist needs something to queue on, and a recurring enrollment needs a stable ID to attach to.

Forcing session-style bookings to use appointment-style's dynamic computation breaks down immediately — there's no stable thing to hang a waitlist or a recurring enrollment off. Forcing appointment-style bookings to pay for materialized sessions is pure waste — a hairdresser's calendar doesn't need a pre-generated row per possible minute. **Two shapes, one shared `Resource` concept underneath.**

**Agenda vs. Turmas — the same fork, surfaced in the console.** `Agenda` remains the private-appointment approval queue. `Turmas` is the session-family surface: it lists upcoming materialized sessions, holds a roster-level guest approval action where configured, and carries the post-session attendance task. Authenticated contract customers auto-confirm when capacity fits; verified guests are manual-approval or auto-approval according to the SERVICE guest policy. The two nav items are complementary rather than competing.

---

## 5. Appointment-Style Deep Dive

`Service` gains:

```
Service {
  ...                              -- price, loyaltyPointsValue, requiresPickupAddress, isActive: unchanged
  bookingModel:  'APPOINTMENT' | 'SESSION'
  resourceRequirements: ResourceRequirement[]   -- flat (non-legged) APPOINTMENT services only
  legs:          ServiceLeg[] | null            -- mutually exclusive with resourceRequirements + durationMinutes; APPOINTMENT only
  bufferAfterMinutes: int | null                -- see §7; null on legged services (meaningless there); APPOINTMENT only
  classResourceSlots: ClassResourceSlot[] | null -- SESSION services only — see §6; added 2026-08-05
  guestPolicy: SessionGuestPolicy | null         -- SESSION only: disabled/manual/auto guest access plus
                                                  -- optional first-free-per-email policy
}

ResourceRequirement {
  type:           ResourceType                  -- LOCATION | STAFF | ROOM | EQUIPMENT
  selectionMode:  NONE | CUSTOMER_CHOICE | AUTO_ANY | AUTO_FUNGIBLE_POOL
  resourcePoolIds: ResourceId[] | null           -- optional restriction to a subset
}

ClassResourceSlot {
  type:                 ResourceType             -- LOCATION | STAFF | ROOM | EQUIPMENT — also the key;
                                                   -- no slotIndex (removed 2026-08-05, see
                                                   -- MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md §6 item 17) —
                                                   -- no worked example ever needs two slots of the same type
                                                   -- on one service
  eligibleResourceIds:  ResourceId[]              -- the pool. No selectionMode — nothing here resolves per
                                                   -- booking. Declared once per Service, shared by every
                                                   -- ClassScheduleTemplate of it (§6) — each template picks
                                                   -- exactly one resourceId per slot from this list, manually,
                                                   -- once, at template-creation time (CAND-11).
}
```

Today's car wash is the degenerate case: `resourceRequirements = [{ type: LOCATION, selectionMode: NONE }]` — no schema-migration pain, existing services default straight into this.

**Bundles** (model 7) are just `resourceRequirements.length > 1` — every entry must be free for the *same* window; all get locked together. Dentist + chair: `[{ type: STAFF, selectionMode: CUSTOMER_CHOICE }, { type: EQUIPMENT, selectionMode: AUTO_ANY }]`.

**Fungible pools** (model 4) vs. **named-staff auto-assign** (model 3) look similar but differ in what the customer is told: a fungible pool never surfaces which specific court/bay was assigned (interchangeable, no identity); auto-assigned staff still has a name the customer sees on their confirmation, they just didn't pick it up front.

**Sequential legs** (model 8) reuse the existing `BookingLine` snapshot pattern instead of inventing something new:

```
ServiceLeg {
  legIndex:    int
  name:        String
  durationMinutes: int
  resourceRequirements: ResourceRequirement[]   -- ≥ 1; a leg can need more than one resource at once (see the Massage leg below) — corrected 2026-08-05, was a single ResourceRequirement until the prototype's own itinerary exposed the gap (MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md §6 item 13)
  transitionGapAfterMinutes: int          -- customer transition time before the NEXT leg; not applied after the last leg
}
```

Example — a spa journey moving through three resources:

```json
{
  "serviceId": "svc_spa_journey",
  "tenantId": "tenant_zen_spa",
  "name": "Spa Relaxation Journey",
  "bookingModel": "APPOINTMENT",
  "bufferAfterMinutes": null,
  "legs": [
    { "legIndex": 0, "name": "Sauna",             "durationMinutes": 20, "resourceRequirements": [{ "type": "ROOM", "selectionMode": "AUTO_ANY" }],                                                           "transitionGapAfterMinutes": 10 },
    { "legIndex": 1, "name": "Massage",           "durationMinutes": 50, "resourceRequirements": [{ "type": "STAFF", "selectionMode": "CUSTOMER_CHOICE" }, { "type": "ROOM", "selectionMode": "AUTO_ANY" }], "transitionGapAfterMinutes": 5 },
    { "legIndex": 2, "name": "Relaxation Lounge", "durationMinutes": 20, "resourceRequirements": [{ "type": "ROOM", "selectionMode": "AUTO_ANY" }],                                                           "transitionGapAfterMinutes": 0 }
  ]
}
```

The Massage leg needs **two** resources at once — a therapist and a room, the same two resources `Massagem Relaxante`'s own bundle (§5, CAND-07) uses, deliberately, to demonstrate cross-service exclusivity (CAND-31) from the other direction. Total span = `sum(durationMinutes) + sum(transitionGapAfterMinutes)` = 90 + 15 = **105 minutes**, even though only 90 minutes are billable. `BookingLine` snapshots the resolved plan at booking time — one `legAssignments` entry per `(legIndex, resourceId)` pair, so a leg needing two resources gets two entries sharing the same `legIndex`:

```json
{
  "lineId": "line_123",
  "serviceNameAtBooking": "Spa Relaxation Journey",
  "durationMinsAtBooking": 105,
  "legAssignments": [
    { "legIndex": 0, "startsAt": "2026-08-03T13:00:00Z", "endsAt": "2026-08-03T13:20:00Z", "resourceId": "res_sauna_room_1" },
    { "legIndex": 1, "startsAt": "2026-08-03T13:30:00Z", "endsAt": "2026-08-03T14:20:00Z", "resourceId": "res_staff_ana" },
    { "legIndex": 1, "startsAt": "2026-08-03T13:30:00Z", "endsAt": "2026-08-03T14:20:00Z", "resourceId": "res_massage_room_1" },
    { "legIndex": 2, "startsAt": "2026-08-03T14:25:00Z", "endsAt": "2026-08-03T14:45:00Z", "resourceId": "res_lounge_room_2" }
  ]
}
```

Each resource's availability is checked only for its own leg window (plus its own turnover) — the sauna room only needs to be free 13:00–13:20(+turnover), not for all 105 minutes.

`Booking`/`BookingLine`'s status lifecycle (PENDING → APPROVED → COMPLETED, cancellation-window rule, etc.) is **unchanged** for this whole family — car wash, hairdresser, dentist, and spa all still go through the existing approval workflow. Only the availability query changes, from tenant-scoped to resource-scoped.

---

## 6. Session-Style Deep Dive

Four new aggregates, all in the Booking Context:

```
ClassScheduleTemplate {
  templateId, tenantId, serviceId
  resourceIds:  ResourceId[]        -- the bundle this class always uses, e.g. [instructorResource, roomResource].
                                    -- Each entry is one manual pick from the matching-type entry in
                                    -- Service.classResourceSlots' pool — corrected 2026-08-05, was originally
                                    -- going to need its own per-template pool until that turned out to have no
                                    -- CAND populating it and to force re-curating the same list separately per
                                    -- template of one service (MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md §6 item 15).
  recurrence:   RecurrenceRule      -- e.g. weekly on [MON, WED, FRI] at 08:00
  capacity:     int
  validFrom / validUntil: Date | null
  isActive:     Boolean
}

ClassSession {                       -- materialized occurrence
  sessionId, tenantId, templateId    -- always generated from a recurring template; ad-hoc sessions are out of scope
  serviceId
  resourceIds:  ResourceId[]        -- snapshot from template at generation time; can be overridden per-instance
  startTime, endTime
  capacity:     int                 -- snapshot from template; admin can override per-instance (e.g. cap today's class lower)
  reservedCount: int                -- CONFIRMED + PENDING_APPROVAL attendee seats, atomically maintained
  status:       SCHEDULED | AWAITING_ATTENDANCE | CANCELLED | CLOSED
}

ClassSessionBooking {                     -- the session-style equivalent of Booking
  classSessionBookingId, tenantId, sessionId
  type:            GUEST | CUSTOMER  -- same BookingType enum as Booking
  customerId:      CustomerId | null -- null if guest
  contactEmail / contactName / contactPhone   -- mirrors Booking's contact fields exactly — corrected
                                               -- 2026-08-05, was the vague "customerId | guest-contact-fields"
                                               -- placeholder; needed so ClassSessionBookingCompleted's
                                               -- notification stays self-contained (bounded-contexts Rule 4)
  quantity:     int                 -- number of named attendee rows. Contract customers always reserve 1;
                                     -- verified guest/drop-in reservations may reserve a group.
  status:       PENDING_EMAIL_VERIFICATION | PENDING_APPROVAL | CONFIRMED |
                WAITLISTED | CANCELLED | CLOSED
  seriesId:     RecurringEnrollmentId | null
  contractId:   ClassAccessContractId | null
  paymentSource: CONTRACT | GUEST_TRIAL | IN_PERSON

  -- Snapshots, frozen at booking-request time. Same principle as BookingLine (§1) — a
  -- later Service edit must never retroactively change a past booking, and
  -- ClassSessionBookingCompleted needs a points value to hand Loyalty. Added 2026-08-05 —
  -- the original model had none of these at all (MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md
  -- §6 item 1).
  serviceNameAtBooking:  String
  priceAtBooking:        Money
  pointsValueAtBooking:  int
}

ClassSessionAttendee {                 -- one immutable named seat, never just a quantity
  attendeeId, tenantId, classSessionBookingId
  name: String
  customerId: CustomerId | null        -- set for the contract holder; guests remain contact-only
  attendance: PRESENT | NO_SHOW | null -- null until the session is closed out
}

RecurringEnrollment {
  enrollmentId, tenantId, customerId, templateId
  startDate, endDate: Date | null   -- null = ongoing
  status:       ACTIVE | PAUSED | CANCELLED
}

ClassAccessContract {
  contractId, tenantId, customerId
  startsOn, endsOn                    -- inclusive, tenant-local dates
  status: ACTIVE | CANCELLED | EXPIRED
  eligibleServiceIds: ServiceId[]     -- e.g. CrossFit covers every CrossFit time/template
}
```

A rolling-horizon generator (same shape as the existing loyalty-expiry cron) materializes `ClassSession` rows some window ahead of an active template — window size is an open question, §9.

**Model 6 concretely — two independent templates, not a pool.** A bigger studio running Pilates in 2 rooms at the same hour is **two separate `ClassScheduleTemplate` rows**, not one template pointing at a fungible `ROOM` pool (that would be model 4, and only makes sense for "one slot, whichever unit is free" — it would silently merge two full, independently-running classes into one, which is wrong the moment both are meant to run at capacity simultaneously):

```json
[
  { "templateId": "tpl_pilates_estudio1", "serviceId": "svc_pilates", "resourceIds": ["res_staff_camila", "res_room_estudio1"], "recurrence": "MON,WED,FRI@08:00", "capacity": 4 },
  { "templateId": "tpl_pilates_estudio2", "serviceId": "svc_pilates", "resourceIds": ["res_staff_ana",    "res_room_estudio2"], "recurrence": "MON,WED,FRI@08:00", "capacity": 4 }
]
```

Same `serviceId`, same recurrence, two independent `templateId`s — each generates its own `ClassSession` rows (CAND-13), each with its own roster and waitlist. Nothing shares state between them; the only thing they have in common is the service they're both instances of.

**Cross-family resource exclusivity.** A `Resource` shared between an APPOINTMENT-style service and a SESSION-style template — model 13's whole premise, e.g. Camila Duarte as both a hairdressing resource and a Pilates instructor — must present **one unified busy/free view**, regardless of which family is asking. This doesn't fall out for free: `CAND-29` (appointment availability) and `CAND-13` (session generation) are two independently-computed paths that happen to reference the same `Resource`, with nothing making them consult each other by default. Two concrete failure modes if left unaddressed:

- A haircut gets approved for Camila at the exact hour her active Pilates template recurs, because the appointment-side check only looks at other `Booking`s, never at `ClassScheduleTemplate` patterns.
- Even with that check added, `ClassSession` rows only exist once a rolling-horizon job has materialized them (`CAND-13`) — an appointment booked far enough ahead could still slip into a date whose session hasn't been generated yet, with the conflict only surfacing later when generation catches up and collides with the now-`APPROVED` booking.

**Resolution:** the appointment-side availability check evaluates a resource's active `ClassScheduleTemplate` recurrence rules **directly** — does this rule produce an occurrence at this candidate time, honoring `validFrom`/`validUntil` — rather than depending on a `ClassSession` row existing yet. This makes the invariant hold at *any* generation-horizon size: the horizon becomes a pure browsing/UX and storage-cost decision (how far ahead a customer can see and book *into* a class), fully decoupled from correctness, instead of something that has to be kept artificially wide (e.g. matched to `tenants.settings.booking.maxBookingAdvanceDays`, `docs/21-TENANTS_SETTINGS_SCHEMA.md:77`) just to avoid a race. See `CAND-29`, `CAND-11`, `CAND-13`, and `CAND-31` in the use-cases doc for where this lands concretely.

**Capacity** lives on `ClassSession`, seeded from the template but instance-overridable — this is what makes model 13 (capacity as Service × Resource, not Resource alone) work: a personal trainer `Resource` can host a 1:1 `ClassSession` (capacity 1) and a group `ClassSession` (capacity 20) on the same underlying resource, because capacity is a property of the session/template, never the resource itself.

**Capacity, guest approval, and waitlist**: `ClassSession.reservedCount` counts both `CONFIRMED` and capacity-holding `PENDING_APPROVAL` seats. A verified guest request is either `PENDING_APPROVAL` (manual guest-approval mode) or `CONFIRMED` (auto mode), and its named attendee rows are retained either way. Email-verification drafts and waitlist entries do not reserve capacity. Queue order is FIFO by `createdAt`, derived at read time rather than stored. When seats release, the system promotes the earliest entries that fit, repeatedly, without splitting a group: a customer becomes `CONFIRMED`; a manual-approval guest becomes `PENDING_APPROVAL`; an auto-approved guest becomes `CONFIRMED`. A waitlisted entry remaining after `ClassSession.endTime` is mechanically cancelled.

**Guest trials and payment**: only a verified guest may enter the guest path. A SESSION service chooses whether guests are disabled, manually approved, or auto-approved, and may offer one free trial per normalized email across the tenant. The first-free entitlement is atomically consumed when staff approves the reservation (rejection/cancellation before approval does not consume it; an approved no-show does). Every subsequent paid guest drop-in is paid in person and recorded at close-out; online billing is deliberately outside this discovery.

**Contracts**: an authenticated customer can book a SESSION only through one active, non-overlapping `ClassAccessContract` whose eligible service list contains that session's service and whose date range includes the session. A contract grants eligibility, not a standing seat: each booking still claims exactly one real seat. Cancelling a contract early automatically cancels its future contract-funded bookings and releases their seats.

**Cancellation.** Class cancellation has no refund/credit workflow in this discovery: payments are collected only in person at close-out. Cancelling a future reservation frees its quantity and triggers the applicable waitlist transition; a guest asks staff to cancel, while an authenticated customer follows the applicable customer flow. A booking with `seriesId != null` is skipped/ended through its enrollment. A manager can cancel one session, a bounded range of occurrences, or every occurrence from a selected date forward; range cancellations are persistent template exceptions so the generator cannot recreate them. A closed-out session is not subsequently cancelled; financial/audit corrections are a future concern.

**Attendance and close-out — deliberately staff-triggered, not guessed by a job.** At end time a session becomes `AWAITING_ATTENDANCE` and remains a visible Turmas task until staff closes it. The roster pre-marks every named attendee as present; staff flags the exceptions, then closes the session in one action. The parent `ClassSessionBooking` — its own status enum, independent of `Booking.status` (which has no `CLOSED` value) — becomes `CLOSED`; attendee rows hold the actual `PRESENT`/`NO_SHOW` result, so a guest group can have mixed attendance. A customer contract booking has exactly one attendee. Close-out records an in-person guest payment when due and publishes a candidate completion event for eligible customer loyalty/notification consumers.

**Scope note — this puts attendee-level no-show tracking ahead of private appointments.** `UC-009` still treats appointment no-show as future state. Deliberately building it for class attendees: a capacity-constrained class needs an operational attendance record, especially for guest trials and contract usage.

**Recurring enrollment**: a process attaches a `ClassSessionBooking` to each upcoming `ClassSession` matching the enrollment's template, respecting capacity (or waitlisting) fresh each time — an enrollment is a *standing intent*, not a guarantee. It is customer-only and its end date cannot exceed the qualifying contract's end date. When that contract ends or is cancelled, the enrollment ends too; a later contract requires the customer to opt in again rather than silently reviving a past standing request.

**Multi-unit quantity**: `ClassSessionBooking.quantity` consumes N of the session's remaining capacity in one action, rather than requiring N separate bookings.

---

## 7. Buffer & Turnover Model (Cross-Cutting)

**Today:** `tenants.settings.booking.serviceBufferMinutes` (`docs/21-TENANTS_SETTINGS_SCHEMA.md:78`; integer 0–120, default 60) — one tenant-wide number, added to every new candidate's own duration in `AvailabilityService.calculate()` (`apps/backend/src/contexts/booking/domain/services/availability.service.ts:52`), read fresh on every calculation.

**Change:** the authoritative value moves down to where it's actually service/resource-specific — a single tenant-wide number was already a simplification a car wash outgrows (Ceramic Coating needs more cleanup than a Quick Rinse), independent of anything else in this document.

- **`Service.bufferAfterMinutes`** (nullable) — "how much extra cleanup this specific service needs on whatever resource it used." Meaningless (`null`) on legged services.
- **`Resource.turnoverMinutes`** — "this room/chair/bay needs N minutes before *anyone's* next booking, regardless of which service ran."
- **`ServiceLeg.transitionGapAfterMinutes`** — "the *customer* needs N minutes to move to the next leg." Has nothing to do with resource turnover; it's a property of the appointment's own itinerary, not the resource.

Effective gap before the next booking on a resource, for a flat (non-legged) service: `max(service.bufferAfterMinutes, resource.turnoverMinutes)`. For a legged service: each leg's resource turnover comes from that resource's own `turnoverMinutes`; the leg's `transitionGapAfterMinutes` is independent and additive to the appointment's total span.

**Migration:** expand/contract. Add `Service.bufferAfterMinutes` (nullable), backfill every existing service from its tenant's *current* `serviceBufferMinutes` at migration time (nothing silently changes for a live tenant). `tenants.settings.booking.serviceBufferMinutes` stops being read at availability-calc time and becomes a **default template** that pre-fills a new `Service.bufferAfterMinutes` at creation (editable after).

---

## 8. Concrete Entity/Aggregate Deltas

### Modified

| Aggregate | Change |
|---|---|
| `Service` | + `bookingModel`, `resourceRequirements[]`, `legs[] \| null`, `bufferAfterMinutes \| null`, `classResourceSlots[] \| null` (SESSION-model eligibility pool, §6). Everything else unchanged. |
| `BookingLine` | + `resourceAssignments` / `legAssignments` snapshot (which concrete resource(s) got locked), same "freeze at booking time" pattern as existing price/duration snapshots. |
| `Booking` | Appointment-style only. State machine, approval workflow, cancellation-window rule: **unchanged**. Only the effective calendar-blocked window changes from "the whole tenant" to "this resource(s), this window." |
| `ScheduleClosure` / `ScheduleOpening` | + nullable `resourceId`. `null` = tenant-wide (today's behavior, default). Three-Layer Resolution gains a resource-level check under the tenant-level one. |
| `Staff` | **Unchanged.** Stays pure identity/permissions; scheduling data lives on the `Resource` row that references it. |
| `IBookingAvailabilityPort` | Its real adapter moves from querying `bookings` directly to querying `resource_occupancy` — not just an added `resourceId` filter on the same query. `bookings`/`booking_lines` remain the source of truth for the booking itself (status, contact, price); `resource_occupancy` is the per-resource, per-window projection availability needs, since one booking's `scheduledAt`/`totalDurationMins` can no longer answer "is resource X free" once a booking can span a bundle or leg chain with different sub-windows per resource. `BookedSlot` changes shape accordingly, from `{ scheduledAt, totalDurationMins }` to `{ resourceId, startsAt, endsAt }`. See `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md` §5. |

### New (all in Booking Context)

| Aggregate | Purpose |
|---|---|
| `Resource` | Generic bookable unit — `LOCATION`, `STAFF` (wraps `staffId`), `ROOM`, `EQUIPMENT` (owned outright). |
| `ClassScheduleTemplate` | Session-style recurring pattern: service, resource bundle, recurrence, capacity. |
| `ClassSession` | Materialized occurrence, generated on a rolling horizon; capacity/resources overridable per-instance. |
| `ClassSessionBooking` | Reservation/contact and payment snapshot. Guest states include verification/approval; attendee-level results live in child rows. |
| `ClassSessionAttendee` | One named seat per reservation, with individual `PRESENT`/`NO_SHOW` attendance. |
| `RecurringEnrollment` | Customer-only standing link to a template; generates a `ClassSessionBooking` per matching session. |
| `ClassAccessContract` | One non-overlapping customer contract, date-bounded and eligible for selected SESSION services. It grants booking eligibility, not a reserved seat. |
| `ClassScheduleTemplateException` | Persistent bounded cancellation range that prevents future generation from recreating cancelled occurrences. |

---

## 9. Historical questions and final decisions

The numbered notes below preserve the earlier discovery trail and are not an implementation source. The following decisions now supersede the previously open items: LOCATION is backfilled; class bookings use guest verification/approval or customer contracts; capacity cannot be reduced below reserved seats; resource capacity ceilings exist; resource schedule configuration is manager-only; Staff deactivation deactivates its scheduling resource for new work; recurring enrollment is customer-only and ends with its qualifying contract; named-staff auto-assignment is least locked tenant-local-day workload then stable `resourceId`; waitlists are first-fitting; and session aggregates emit transactional-outbox events. The remaining deferred work is explicitly listed in §11.

1. **Resolved — LOCATION is backfilled.** Every tenant receives one active `LOCATION` resource during migration; `resourceId = null` is not a legacy path.
2. **Resolved — guest approval is service-configured.** Verified guests are `PENDING_APPROVAL` or `CONFIRMED` according to the guest policy; contract customers confirm when capacity fits.
3. **Rolling-horizon window size** for `ClassSession` generation — how far ahead does the generator materialize sessions from an active template? **Resolved to a pure UX/cost tradeoff, not a correctness one (2026-08-04):** cross-family resource conflicts (§6) are caught by evaluating a template's recurrence rule directly, not by requiring a `ClassSession` row to exist — so this window no longer needs to match `maxBookingAdvanceDays` or any other correctness-driven size. What's still open is purely: too short risks customers unable to book far enough ahead; too long generates rows nobody will ever fill.
4. **Resolved — capacity cannot drop below `reservedCount`.** Reject the edit; never silently demote or cancel confirmed/pending reservations.
5. **Resolved — cancellation notifies customers.** No refund/credit workflow exists because payment is collected at close-out; a closed session cannot be cancelled.
6. **Multi-location resource ownership** — ties directly to the open decision already logged in `CLAUDE.md` §12 ("Multiple locations per tenant = separate tenants or sub-tenant model?"). The `Resource` model should leave room for a location dimension later, not attempt to resolve §12 here.
7. **SESSION-type services have no formal eligible-resource-pool concept.** Surfaced while prototyping a CrossFit template with three eligible instructors (Bruno/João/Fábio), visible on two resource types, not one: `manager-06-criar-turma.html`'s create-turma screen labels its Instrutor field "elegível para Pilates: Camila, Ana" and its Sala field "elegível para Pilates: Estúdio 1, Estúdio 2" — real UI text implying a pool that nothing in the schema declared at the time. **Resolved (2026-08-05, corrected same day):** first modeled as a pool scoped to each `ClassScheduleTemplate` — that turned out wrong on two counts: no CAND ever populated it, and it would force re-declaring the same "who can teach Pilates" list separately for every template of one service. Corrected to `Service.classResourceSlots` above — declared once per service, shared by every template of it, filled by the same eligibility checklist `CAND-06` already uses for the flat/APPOINTMENT case (`manager-02-service-resource-config.html`, extended to the SESSION branch). See `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md` §6 item 15 for the full correction.
8. **Resolved — physical capacity ceilings exist.** `LOCATION`/`ROOM` and capacity-bearing `EQUIPMENT` may define `maxCapacity`; template/session capacity cannot exceed the lowest applicable ceiling.
9. **Resolved — resource schedules are manager-only.** A staff absence-request workflow is separate future scope.
10. **Resolved — named-staff AUTO_ANY uses least locked workload.** The stable tie-breaker is `resourceId`.
11. **Resolved — Staff deactivation deactivates the wrapping STAFF resource for new scheduling.** Existing materialized sessions and approved appointments remain explicit commitments to resolve.
12. **Resolved — session aggregates use the transactional outbox.** `ClassSession` and `ClassSessionBooking` are event-emitting aggregates with their own outbox-draining repositories.
13. **Resolved — promotion is first-fitting.** The FIFO queue is scanned until an entry whose whole group fits is found; groups are never split.
14. **Resolved — recurring enrollment is customer-only.** It ends with its qualifying contract and never resumes under a later contract without a new opt-in.
15. **Resolved (2026-08-05): no waitlist-promotion response/decline window.** Considered adding one (a promoted customer gets N hours to confirm before the system moves to the next person in queue) — deliberately not adding it. `CAND-25` keeps its plain auto-confirm: this extension already commits to a real amount of new machinery (item 12 above), a response window would add a new state plus an expiry job on top of that, and today's booking flow has no accept-step for a fresh `PENDING` booking either, so auto-confirm is the more consistent default, not a shortcut. Revisit only if real-world waitlist abandonment turns out to be a problem once this ships.

---

## 10. UX Principle — Presets Over Generic Config

The domain model above is necessarily richer than today's, but that richness shouldn't leak into what a non-technical tenant admin sees at onboarding. A generic form exposing `resourceRequirements`, `selectionMode`, `bookingModel`, and `legs` directly would read as a spreadsheet, not a SaaS product.

The fix: a small set of **business-model presets** at onboarding — "Single resource" (car wash), "Staff, customer-chosen" (salon), "Class with capacity" (studio/gym), etc. Each preset pre-wires the underlying `Resource`/`Service`/`ClassScheduleTemplate` configuration; the admin picks the preset closest to their business rather than assembling the general model by hand. Power stays in the domain model; simplicity stays in the wizard on top of it. Any prototype work coming out of this discovery should sketch the *preset picker*, not a raw configuration screen, as the primary onboarding surface.

> **Deliberately no `CAND-XX` for this section** (checked during a pre-promotion audit, 2026-08-07): the preset picker is onboarding-wizard UX layered *on top of* the CANDs already in `MULTI_VERTICAL_SCHEDULING_USECASES.md` (CAND-06 through CAND-10b) — it doesn't introduce a new domain mechanism or write path of its own, it's a guided sequence through the existing ones. Writing a proper use case for it means designing the actual preset list, the wizard's step sequence, and how a preset's pre-wired choices map onto each real config field — real product/UX design work that belongs in the `plan/journey/` prototype stage (per this doc's own instruction above), not fabricated here as a discovery-stage placeholder. Carry this forward explicitly as a milestone story once promoted, rather than letting it silently fall out of scope.

---

## 11. Non-Goals / Explicitly Deferred

- **Time-varying resource/service eligibility** (e.g. a chair reserved for coloring only in the afternoon) — noted as a real pattern, not scoped in detail here.
- **Multi-location resourcing** — deferred until `CLAUDE.md` §12's open decision resolves.
- **Credit-passes** — deferred. Time-bounded class access is no longer deferred: this discovery includes `ClassAccessContract` for one customer's non-overlapping, date-bounded access to selected SESSION services. It is an entitlement record, not an online-billing implementation.

### Extension point: why future credit-passes need no rework here

Checked deliberately (2026-08-05) — "deferred" must not silently mean "whoever builds this discovers a restructuring is needed":

1. **A credit pack is a separate entitlement source.** It can later join a session booking beside `CONTRACT`, `GUEST_TRIAL`, and `IN_PERSON` payment sources without changing the attendee/capacity model.
2. **A credit redemption must remain append-only and separately auditable.** It should not be represented by changing a booking's quoted price or mutating the access contract.
3. **No credit-pack schema is introduced now.** The contract is in scope because it is the required access rule for authenticated customer session bookings; a credit pack is not.

---

## 12. Candidate Use Cases

Full list, in the existing `docs/04-USE_CASES.md` field format (labeled `CAND-XX`, not `UC-XXX`, to avoid colliding with the canonical index): **`MULTI_VERTICAL_SCHEDULING_USECASES.md`**.

45 candidates across seven groups: resource management, service configuration, class/session management, appointment booking, class/session booking, cross-cutting system behavior, and finalized contract/guest lifecycle. The final six add template-range cancellation, guest email verification/approval, class-access contracts, pending-request expiry, and individual-attendee close-out; the earlier discovery questions are now resolved in §9. Two more (CAND-03b, CAND-10b) were added in a pre-promotion coverage-gap pass (2026-08-07): the automatic staff-deactivation→resource cascade, and a manager configuring a SESSION service's guest access policy.

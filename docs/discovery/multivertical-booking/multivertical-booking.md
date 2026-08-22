# Discovery: Multi-Vertical Scheduling

**Status:** Discovery — exploratory. Nothing here is committed to a milestone; no `UC-XXX` numbers are consumed by this document.
**Companion doc:** `multivertical-booking_USECASES.md` — candidate use cases derived from this model, for completeness-checking.
**Companion doc:** `multivertical-booking_DATA_MODEL.md` — the physical schema (tables, constraints, migration ordering) this model implies, plus gaps found while translating it into real DDL.
**Companion doc:** `multivertical-booking_ONBOARDING_PRESETS.md` — the preset-picker onboarding UX this model needs on top (§10 below).
**Companion prototype:** `prototype/` (start at its `index.html`) — illustrative screens working through the model concretely on one fictional tenant (Vitta Studio). Several findings from building it fed corrections back into this doc and the use-cases doc — see its `dev-notes.md` for the full list.

> ✅ **PROMOTION STATUS (resolved 2026-08-22) — this discovery was restructured via `/create-discovery` Mode B into its current canonical shape, `docs/discovery/multivertical-booking/`.** The prior version of this note (2026-08-21) tracked two implementation-grade prototype folders sitting ahead-of-order in `plan/journey/` and four shipped files a collaborator's merge had modified in place. Both were pulled back during restructuring: the wholly-new content (`reservar-aula/` + its journey doc, the `minha-conta` Turmas screens) now lives in this folder's own `prototype/` (renamed to the flat actor-prefixed convention: `customer-reservaraula-*.html`, `customer-minhasturmas-*.html`, plus `reservar-aula-journey.md` and `minha-conta-turmas-journey.md`), and the four modified `plan/journey/` files were reverted to their pristine shipped state — nothing was lost, see §9 item 28. `plan/journey/` now contains only real, shipped content again.

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

**Agenda vs. Turmas — the same fork, surfaced in the console.** `Agenda` remains the private-appointment approval queue. `Turmas` is the session-family surface: it lists upcoming materialized sessions, holds a roster-level guest approval action where configured, and carries the post-session attendance task. Authenticated contract customers auto-confirm when capacity fits; verified guests/non-member customers auto-confirm only within the per-session `trialSlots` threshold and otherwise require approval. The two nav items are complementary rather than competing.

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
  guestPolicy: SessionGuestPolicy | null         -- SESSION only: guestAccessEnabled + guestTrialPolicy.
                                                  -- Corrected 2026-08-21 — this used to also carry a
                                                  -- disabled/manual/auto guestApprovalMode; that field was
                                                  -- removed and replaced by per-template/per-session
                                                  -- trialSlots (see §9 item 16) — this comment was never
                                                  -- updated when that happened, until now.
  classCatalog: ClassCatalogInfo | null          -- SESSION only, added 2026-08-21: color, allowsDropIn,
                                                  -- allowsSeries for the customer-facing class catalog
                                                  -- (reservar-aula's GET /v1/class-types). description
                                                  -- reuses the field every Service already has.
}

ResourceRequirement {
  type:           ResourceType                  -- LOCATION | STAFF | ROOM | EQUIPMENT
  selectionMode:  NONE | CUSTOMER_CHOICE | AUTO_ANY | AUTO_FUNGIBLE_POOL
  resourcePoolIds: ResourceId[] | null           -- optional restriction to a subset
}

ClassResourceSlot {
  type:                 ResourceType             -- LOCATION | STAFF | ROOM | EQUIPMENT — also the key;
                                                   -- no slotIndex (removed 2026-08-05, see
                                                   -- multivertical-booking_DATA_MODEL.md §6 item 17) —
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
  resourceRequirements: ResourceRequirement[]   -- ≥ 1; a leg can need more than one resource at once (see the Massage leg below) — corrected 2026-08-05, was a single ResourceRequirement until the prototype's own itinerary exposed the gap (multivertical-booking_DATA_MODEL.md §6 item 13)
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

**Approval workflow — finalized for promotion.** Appointment approval is a **service-owned policy** with a tenant default. `tenants.settings.booking.autoApproveEnabled` supplies the migration/default value only; it is no longer the runtime decision for every service. A service may override the default with `AUTO_CONFIRM` or `MANUAL_APPROVAL`, and the effective mode plus hold duration are snapshotted when a booking is created. This allows a salon appointment to confirm immediately while a scarce room or high-value consultation remains manually reviewed. It is unrelated to the SESSION family's `trialSlots` policy, which protects member capacity from non-members.

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

`Booking`/`BookingLine`'s status lifecycle (PENDING → APPROVED → COMPLETED, cancellation-window rule, etc.) is **unchanged** for this whole family — car wash, hairdresser, dentist, and spa all still go through the existing approval workflow. A manual-approval request which reaches its hold deadline transitions to the existing terminal `CANCELLED` state with cancellation reason `APPROVAL_EXPIRED`; it does not introduce a new Booking status. Only the availability query changes, from tenant-scoped to resource-scoped.

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
                                    -- template of one service (multivertical-booking_DATA_MODEL.md §6 item 15).
  recurrence:   RecurrenceRule      -- e.g. weekly on [MON, WED, FRI] at 08:00
  capacity:     int
  trialSlots:   int                 -- guest seats that auto-confirm before CAND-34 manual approval kicks in;
                                    -- default 0. Added 2026-08-21, replacing a global per-service
                                    -- guestApprovalMode switch — see §9 item 16.
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
  trialSlots:   int                 -- snapshot from template.trialSlots; admin can override per-instance, same
                                    -- pattern as capacity. Added 2026-08-21, see §9 item 16.
  reservedNonMemberCount: int       -- verified GUEST + contract-less CUSTOMER subset of reservedCount, atomically maintained the same way;
                                    -- decides the trialSlots auto/manual branch, not a second capacity ceiling.
                                    -- Added 2026-08-21.
  status:       SCHEDULED | AWAITING_ATTENDANCE | CANCELLED | CLOSED
}

ClassSessionBooking {                     -- the session-style equivalent of Booking
  classSessionBookingId, tenantId, sessionId
  serviceId:       ServiceId         -- denormalized from sessionId, added 2026-08-21, same rationale
                                     -- as ClassSession.serviceId itself (§9 item 16 area) — CAND-39
  type:            GUEST | CUSTOMER  -- same BookingType enum as Booking
  customerId:      CustomerId | null -- null if guest
  createdByStaffId: StaffId | null   -- set when a manager creates this on a customer's behalf
                                     -- (CAND-40), added 2026-08-21
  contactEmail / contactName / contactPhone   -- mirrors Booking's contact fields exactly — corrected
                                               -- 2026-08-05, was the vague "customerId | guest-contact-fields"
                                               -- placeholder; needed so ClassSessionBookingCompleted's
                                               -- notification stays self-contained (bounded-contexts Rule 4)
  quantity:     int                 -- number of named attendee rows. Contract customers always reserve 1;
                                     -- verified guest/drop-in reservations may reserve a group.
  status:       PENDING_EMAIL_VERIFICATION | PENDING_APPROVAL | CONFIRMED |
                WAITLISTED | PROMOTION_PENDING | CANCELLED | CLOSED
  seriesId:     RecurringEnrollmentId | null
  contractId:   ClassAccessContractId | null
  paymentSource: CONTRACT | GUEST_TRIAL | IN_PERSON
  waitlistAccessIntent: CONTRACT | IN_PERSON | null -- populated only by an authenticated, one-seat
                                                     -- WAITLISTED/PROMOTION_PENDING entry; revalidated on accept
  rescheduledFromId: ClassSessionBookingId | null  -- set when this booking is a "reposição" replacement
                                                    -- (CAND-38) for a skipped RecurringEnrollment occurrence.
                                                    -- Added 2026-08-21, see §9 item 17.

  -- Snapshots, frozen at booking-request time. Same principle as BookingLine (§1) — a
  -- later Service edit must never retroactively change a past booking, and
  -- ClassSessionBookingCompleted needs a points value to hand Loyalty. Added 2026-08-05 —
  -- the original model had none of these at all (multivertical-booking_DATA_MODEL.md
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
  serviceId:    ServiceId           -- denormalized from templateId, added 2026-08-21 — CAND-39's
                                    -- manager list-by-class-type, a service can have >1 template (model #6)
  startDate, endDate: Date | null   -- null = ongoing
  status:       ACTIVE | PAUSED | CANCELLED
  createdByStaffId: StaffId | null  -- set when a manager creates this on a customer's behalf (CAND-40),
                                    -- added 2026-08-21
}

ClassAccessContract {
  contractId, tenantId, customerId
  startsOn, endsOn                    -- inclusive, tenant-local dates
  status: ACTIVE | CANCELLED | EXPIRED
  eligibleServiceIds: ServiceId[]     -- e.g. CrossFit covers every CrossFit time/template
}
```

A rolling-horizon generator materializes `ClassSession` rows through a service-configurable horizon (90 days default). Direct recurrence evaluation preserves correctness beyond this browsing/storage horizon.

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

**Resolution:** the appointment-side availability check evaluates a resource's active `ClassScheduleTemplate` recurrence rules **directly** — does this rule produce an occurrence at this candidate time, honoring `validFrom`/`validUntil` — rather than depending on a `ClassSession` row existing yet. This makes the invariant hold at *any* generation-horizon size: the horizon becomes a pure browsing/UX and storage-cost decision (how far ahead a customer can see and book *into* a class), fully decoupled from correctness, instead of something that has to be kept artificially wide (e.g. matched to `tenants.settings.booking.maxBookingAdvanceDays`, `docs/21-TENANTS_SETTINGS_SCHEMA.md:80`) just to avoid a race. See `CAND-29`, `CAND-11`, `CAND-13`, and `CAND-31` in the use-cases doc for where this lands concretely.

**Capacity** lives on `ClassSession`, seeded from the template but instance-overridable — this is what makes model 13 (capacity as Service × Resource, not Resource alone) work: a personal trainer `Resource` can host a 1:1 `ClassSession` (capacity 1) and a group `ClassSession` (capacity 20) on the same underlying resource, because capacity is a property of the session/template, never the resource itself.

**Capacity, guest approval, and waitlist**: `ClassSession.reservedCount` counts `CONFIRMED`, capacity-holding `PENDING_APPROVAL`, and capacity-holding `PROMOTION_PENDING` seats. `ClassSession.reservedNonMemberCount` is the subset for verified guests and contract-less authenticated customers, atomically maintained with the same guarded update — it is not a second capacity ceiling. A non-member group auto-confirms only when `reservedNonMemberCount + quantity <= trialSlots`; otherwise the whole group becomes `PENDING_APPROVAL`. Email-verification drafts and ordinary waitlist entries do not reserve capacity. Queue order is FIFO by `(createdAt, id)`.

When seats release, the first fitting waitlisted booking is offered the seat rather than silently confirmed: it transitions to `PROMOTION_PENDING`, holds its whole quantity, and receives an email plus in-app offer. The customer must accept before the tenant-configured offer deadline (default 24 hours, never later than session start); acceptance transitions it to `CONFIRMED`, decline/expiry releases the hold and offers the next fitting entry. This is deliberately a real state machine, not a notification-only approximation. A waitlisted or unaccepted offer remaining at session start is mechanically cancelled.

**Guest trials and payment**: only a verified guest may enter the guest path. A SESSION service chooses whether guests are disabled or enabled (`guestAccessEnabled`); when enabled, each `ClassScheduleTemplate` — and each generated `ClassSession`, instance-overridable the same way `capacity` already is — declares `trialSlots`: the number of guest seats that auto-confirm before the manual-approval gate (`CAND-34`) kicks in, per the branch described above. **Changed 2026-08-21 (§9 item 16):** this replaces an earlier global per-service `guestApprovalMode: MANUAL | AUTO` switch — a studio's peak-hour class and its slow Tuesday-afternoon session don't want the same guest policy, and a single service-wide flag couldn't express that. A service may separately offer one free trial per normalized email across the tenant (`guestTrialPolicy`) — untouched by this change, since it answers a different question (has this person ever had a free visit) than `trialSlots` (how many walk-ins does *this occurrence* tolerate before protecting member capacity). The free entitlement applies only to a solo (`quantity = 1`) verified guest booking; a guest group is always payable in person, so one contact email cannot grant free attendance to unnamed additional people. The entitlement is atomically consumed when that solo reservation reaches `CONFIRMED` — whether through the `trialSlots` auto-confirm or later staff approval. Every paid guest drop-in is recorded at close-out; online billing is deliberately outside this discovery.

**Reposição (fixed-slot make-up) — added 2026-08-21, see §9 item 17.** A customer skipping one occurrence of a `RecurringEnrollment` (`CAND-27`) may, when the tenant allows it (`classAllowsReschedule`), pick a replacement `ClassSession` of the same service within a configurable window (`classRescheduleWindowDays`) and optional per-cycle cap (`classMaxReschedulesPerCycle`, unlimited by default) — common practice at Brazilian studios/academias: a customer paying for a fixed weekly slot shouldn't simply lose it when they can't attend. The replacement is a new, one-off `ClassSessionBooking` — `seriesId = null`, since it's a single make-up, not a new standing commitment — linked back to the skipped occurrence via `rescheduledFromId`. This only ever applies to a `RecurringEnrollment` occurrence: a customer cancelling a plain one-off booking (`CAND-23b`) was never holding a fixed slot to begin with, so there's nothing to make up. See `CAND-38`.

**Contracts**: an authenticated customer with an active, non-overlapping `ClassAccessContract` whose eligible service list contains a session's service and whose date range includes it can book that session (`CAND-22`, `CAND-26`). A contract grants eligibility, not a standing seat: each booking still claims exactly one real seat. Cancelling a contract early automatically cancels its future contract-funded bookings and releases their seats. **A contract is not the only way an authenticated customer can book, though — see `CAND-22b` below.**

**Pay-per-class without a contract — added 2026-08-21, see §9 item 19.** A logged-in customer with no active contract for a service is not turned away and is not routed into the guest flow either — those were the two options this discovery initially modeled, and they contradicted each other about what should happen to this customer (`CAND-22` A2 vs. `CAND-33` A2, both corrected). The actual gap: an ordinary, common pattern — a known, identified customer who simply pays per class, no membership — had no representation at all. `CAND-22b` is that path: the same `trialSlots`-gated confirm/pending-approval branch a guest goes through (this customer is still non-member traffic from a capacity-protection standpoint), but no email re-verification (already authenticated) and, unlike a guest, real loyalty points on attendance. `GUEST` stays reserved for genuinely anonymous requests.

**Cancellation.** Class cancellation has no refund/credit workflow in this discovery: payments are collected only in person at close-out. Cancelling a future reservation frees its quantity and triggers the applicable waitlist transition; a guest asks staff to cancel, while an authenticated customer follows the applicable customer flow. A booking with `seriesId != null` is skipped/ended through its enrollment, subject to its own `classSkipWindowHours` minimum-notice check (`CAND-27`, added 2026-08-21 — deliberately separate from the one-off `classCancellationWindowHours`, since a studio's notice requirement for "skip this week" commonly differs from "cancel entirely," see §9 item 18) — and optionally made up via reposição, above. A manager can cancel one session, a bounded range of occurrences, or every occurrence from a selected date forward; range cancellations are persistent template exceptions so the generator cannot recreate them. A closed-out session is not subsequently cancelled; financial/audit corrections are a future concern.

**Attendance and close-out — deliberately staff-triggered, not guessed by a job.** At end time a session becomes `AWAITING_ATTENDANCE` and remains a visible Turmas task until staff closes it. The roster pre-marks every named attendee as present; staff flags the exceptions, then closes the session in one action. The parent `ClassSessionBooking` — its own status enum, independent of `Booking.status` (which has no `CLOSED` value) — becomes `CLOSED`; attendee rows hold the actual `PRESENT`/`NO_SHOW` result, so a guest group can have mixed attendance. A customer contract booking has exactly one attendee. Close-out records an in-person guest payment when due and publishes a candidate completion event for eligible customer loyalty/notification consumers.

**Scope note — this puts attendee-level no-show tracking ahead of private appointments.** `UC-009` still treats appointment no-show as future state. Deliberately building it for class attendees: a capacity-constrained class needs an operational attendance record, especially for guest trials and contract usage.

**Recurring enrollment**: a process attaches a `ClassSessionBooking` to each upcoming `ClassSession` matching the enrollment's template, respecting capacity (or waitlisting) fresh each time — an enrollment is a *standing intent*, not a guarantee. It is customer-only and its end date cannot exceed the qualifying contract's end date. When that contract ends or is cancelled, the enrollment ends too; a later contract requires the customer to opt in again rather than silently reviving a past standing request.

**Multi-unit quantity**: `ClassSessionBooking.quantity` consumes N of the session's remaining capacity in one action, rather than requiring N separate bookings.

## 6b. Product extensions finalized in review

The two scheduling families remain the core model. The following additions extend them without creating separate vertical-specific engines.

### Variable-duration reservations

Coworking rooms, desks, courts, parking spaces and rental equipment are APPOINTMENT services whose duration is chosen by the customer. `Service.durationPolicy` is `FIXED` (today's behaviour) or `CUSTOMER_SELECTED`. The latter defines a minimum, maximum and booking increment; it may span midnight or multiple dates when that maximum permits it, but it is not hotel/accommodation inventory. `Service.pricingPolicy` stays service-owned: fixed-price services are unchanged; variable-duration services use a simple per-increment rate plus optional minimum charge. Peak/off-peak pricing is an extension point, not MVP scope.

The selected interval is protected by the same resource occupancy mechanism as every other appointment. A fungible requirement may declare `requiredQuantity > 1`, allowing one booking to atomically assign (for example) six hot desks or three parking spaces. Customer-built arbitrary carts remain out of scope: multi-service bookings are business-configured bundles or journeys.

### Booking intake, participants and minors

Services may publish a versioned booking-intake schema. A booking freezes the schema version and its answer snapshot. Operational values retain typed projections: `pickupAddress` remains an `Address` value object, participant count remains numeric, and consent acceptance retains its version/timestamp; the intake form is the unified customer UI, not a replacement for meaningful domain data. A service may require only a count, or named `BookingAttendee` rows. The booker/responsible customer is distinct from attendees, enabling a guardian to book for a minor without introducing family-account management.

### Appointment lifecycle, recurrence and alerts

Appointment services define policy at service level (with tenant defaults): approval mode/hold duration, cancellation and reschedule windows, minimum notice, maximum advance, recurring eligibility, participant and intake rules. A `MANUAL_APPROVAL` request holds every required resource immediately and expires after its snapshotted hold duration; expiry is `CANCELLED` with reason `APPROVAL_EXPIRED`. `AUTO_CONFIRM` remains the other mode.

Private appointment no-show is deferred; it does not alter the current Booking state machine in this discovery. Customer reschedule is atomic, supports bundles/journeys, recalculates the quote before confirmation, and preserves an audit link/revision history.

Recurring private appointments/reservations use a dedicated standing schedule, not a flag on bookings. It blocks its future pattern beyond the materialisation horizon, generates ordinary linked bookings within a default 90-day service-configurable horizon, and supports skip-one, reschedule-one, pause and end with persistent exceptions. Only authenticated customers (or audited staff acting for them) can create it; guests remain one-off only.

An `AvailabilityAlert` is a separate expiring intent for a service and optional preferred resource/date/time range. Only authenticated customers can create it: alerts and waitlists are retention features and always attach to a tenant-scoped customer record. A public visitor is asked to log in or create an account before continuing. An alert never reserves a resource and only notifies when a matching slot opens.

---

## 7. Buffer & Turnover Model (Cross-Cutting)

**Today:** `tenants.settings.booking.serviceBufferMinutes` (`docs/21-TENANTS_SETTINGS_SCHEMA.md:81`; integer 0–120, default 60) — one tenant-wide number, added to every new candidate's own duration in `AvailabilityService.calculate()` (`apps/backend/src/contexts/booking/domain/services/availability.service.ts:51`), read fresh on every calculation.

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
| `Booking` | Appointment-style only. State machine and cancellation-window rule remain unchanged. Service-owned approval policy selects `AUTO_CONFIRM` or `MANUAL_APPROVAL`; an unapproved hold expiry is existing `CANCELLED` with reason `APPROVAL_EXPIRED`, never a new status. Only the effective calendar-blocked window changes from "the whole tenant" to "this resource(s), this window." |
| `ScheduleClosure` / `ScheduleOpening` | + nullable `resourceId`. `null` = tenant-wide (today's behavior, default). Three-Layer Resolution gains a resource-level check under the tenant-level one. |
| `Staff` | **Unchanged.** Stays pure identity/permissions; scheduling data lives on the `Resource` row that references it. |
| `IBookingAvailabilityPort` | Its real adapter moves from querying `bookings` directly to querying `resource_occupancy` — not just an added `resourceId` filter on the same query. `bookings`/`booking_lines` remain the source of truth for the booking itself (status, contact, price); `resource_occupancy` is the per-resource, per-window projection availability needs, since one booking's `scheduledAt`/`totalDurationMins` can no longer answer "is resource X free" once a booking can span a bundle or leg chain with different sub-windows per resource. `BookedSlot` changes shape accordingly, from `{ scheduledAt, totalDurationMins }` to `{ resourceId, startsAt, endsAt }`. See `multivertical-booking_DATA_MODEL.md` §5. |

### New (all in Booking Context)

| Aggregate | Purpose |
|---|---|
| `Resource` | Generic bookable unit — `LOCATION`, `STAFF` (wraps `staffId`), `ROOM`, `EQUIPMENT` (owned outright). |
| `ClassScheduleTemplate` | Session-style recurring pattern: service, resource bundle, recurrence, capacity. |
| `ClassSession` | Materialized occurrence, generated on a rolling horizon; capacity/resources overridable per-instance. |
| `ClassSessionBooking` | Reservation/contact and payment snapshot. Guest states include verification/approval; attendee-level results live in child rows. |
| `ClassSessionAttendee` | One named seat per reservation, with individual `PRESENT`/`NO_SHOW` attendance. |
| `RecurringEnrollment` | Customer-only standing link to a template; generates a `ClassSessionBooking` per matching session. |
| `ClassAccessContract` | Minimal, date-bounded eligibility record for selected SESSION services. One contract may cover several services; overlapping active contracts are permitted only when their eligible services do not overlap. It grants booking eligibility, not a reserved seat. |
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
7. **SESSION-type services have no formal eligible-resource-pool concept.** Surfaced while prototyping a CrossFit template with three eligible instructors (Bruno/João/Fábio), visible on two resource types, not one: `manager-06-criar-turma.html`'s create-turma screen labels its Instrutor field "elegível para Pilates: Camila, Ana" and its Sala field "elegível para Pilates: Estúdio 1, Estúdio 2" — real UI text implying a pool that nothing in the schema declared at the time. **Resolved (2026-08-05, corrected same day):** first modeled as a pool scoped to each `ClassScheduleTemplate` — that turned out wrong on two counts: no CAND ever populated it, and it would force re-declaring the same "who can teach Pilates" list separately for every template of one service. Corrected to `Service.classResourceSlots` above — declared once per service, shared by every template of it, filled by the same eligibility checklist `CAND-06` already uses for the flat/APPOINTMENT case (`manager-02-service-resource-config.html`, extended to the SESSION branch). See `multivertical-booking_DATA_MODEL.md` §6 item 15 for the full correction.
8. **Resolved — physical capacity ceilings exist.** `LOCATION`/`ROOM` and capacity-bearing `EQUIPMENT` may define `maxCapacity`; template/session capacity cannot exceed the lowest applicable ceiling.
9. **Resolved — resource schedules are manager-only.** A staff absence-request workflow is separate future scope.
10. **Resolved — named-staff AUTO_ANY uses least locked workload.** The stable tie-breaker is `resourceId`.
11. **Resolved — Staff deactivation deactivates the wrapping STAFF resource for new scheduling.** Existing materialized sessions and approved appointments remain explicit commitments to resolve.
12. **Resolved — session aggregates use the transactional outbox.** `ClassSession` and `ClassSessionBooking` are event-emitting aggregates with their own outbox-draining repositories.
13. **Resolved — promotion is first-fitting.** The FIFO queue is scanned until an entry whose whole group fits is found; groups are never split.
14. **Resolved — recurring enrollment is customer-only.** It ends with its qualifying contract and never resumes under a later contract without a new opt-in.
15. **Superseded (2026-08-21 by item 24): waitlist promotion now requires acceptance.** The earlier auto-confirm decision was replaced after product review: a promoted entry becomes `PROMOTION_PENDING`, holds capacity until its deadline, and becomes `CONFIRMED` only after explicit acceptance. Keep this note only as history; item 24 and §4 are the implementation source.
16. **Resolved (2026-08-21): guest auto/manual approval moves from a global per-service switch to a per-session `trialSlots` threshold.** The original `guestApprovalMode: MANUAL | AUTO` (item 2 above) applied uniformly to every session of a service — but a studio's peak-hour class and a slow-afternoon session don't want the same guest policy, and a single service-wide flag can't express that. `ClassScheduleTemplate.trialSlots` (snapshotted to `ClassSession.trialSlots`, instance-overridable the same way `capacity` already is) replaces it: a verified guest auto-confirms below the threshold, needs staff approval (`CAND-34`) at or above it, regardless of overall session capacity. `guestTrialPolicy` (one free trial per email, tenant-wide) is untouched — it answers a different question (pricing/promo, not per-occurrence capacity protection) and composes with `trialSlots` rather than competing with it. Surfaced during a UX prototyping pass on `public-06-class-access.html`'s confirmation/pending split; formalized here rather than left as prototype-only behavior.
17. **Resolved (2026-08-21): fixed-slot make-up ("reposição") is in scope, tenant-configurable, one-off-only.** A `RecurringEnrollment` occurrence skipped via `CAND-27` may be rescheduled to a same-service replacement session when the tenant enables it (`classAllowsReschedule`, `classRescheduleWindowDays`, optional `classMaxReschedulesPerCycle`) — common practice at Brazilian studios/academias, not speculative scope. The replacement is always a fresh one-off `ClassSessionBooking` (`seriesId = null`), never a change to the standing enrollment itself, and only applies to enrollment occurrences — a one-off booking (`CAND-23b`) was never a fixed slot, so it has nothing to make up. See `CAND-38`, `multivertical-booking_DATA_MODEL.md`'s `rescheduled_from_id`.
18. **Resolved (2026-08-21): skipping a single recurring occurrence (`CAND-27`) gets its own minimum-notice window, separate from `classCancellationWindowHours`.** `CAND-23b`'s one-off cancellation window doesn't fit here — a studio's notice requirement for "skip this week, keep my slot" is commonly shorter (or just different) than for "cancel this booking entirely." New tenant setting `classSkipWindowHours`, checked the same way `classCancellationWindowHours` already is.
19. **Resolved (2026-08-21): a contract-less authenticated customer gets a real pay-per-class path (`CAND-22b`), not routed into the guest flow.** Found via a business-logic review, not a technical audit: `CAND-22` A2 ("directed to the guest path") and `CAND-33` A2 ("blocked for an authenticated customer") directly contradicted each other. The contradiction was a symptom, not the real bug — the real bug was that "logged-in, no membership, pays per visit" (an ordinary pattern, not an edge case) had no path at all. Both alt flows corrected to point at `CAND-22b` consistently.
20. **Superseded by §13 item 1:** the earlier tenant-wide `autoApproveEnabled` runtime rule is replaced by a service-owned approval policy with tenant default and booking snapshot.
21. **Resolved (review): booking policy is service-owned, with tenant defaults.** `AUTO_CONFIRM`/`MANUAL_APPROVAL`, manual-hold duration (30 minutes default), cancellation/reschedule windows, minimum notice and maximum advance are configured per service and snapshotted onto the booking. A pending manual request blocks its resource(s); expiry is the existing `CANCELLED` state with reason `APPROVAL_EXPIRED`.
22. **Resolved (review): variable-duration reservation is an APPOINTMENT policy, not a coworking subsystem.** Fixed-duration car-wash/salon services remain unchanged. Customer-selected duration supports a minimum, maximum, increment and simple service-level per-increment price; full accommodation and dynamic pricing are explicitly deferred.
23. **Resolved (review): private recurrence is a standing commitment.** A dedicated schedule aggregate blocks its future pattern, materializes a rolling 90-day default horizon, and supports skip/reschedule/pause/end. It is authenticated-customer/staff-only and service-gated.
24. **Resolved (review): class waitlist promotion requires acceptance.** The first fitting entry receives a capacity-holding `PROMOTION_PENDING` offer, default 24 hours but never past session start. Auto-confirmation is superseded.
25. **Resolved (review): one tenant represents one physical unit.** Multi-location brands use separate tenants in this phase; cross-unit identity, contracts and reporting are deferred.
26. **Resolved (review): payments, deposits and automatic no-show penalties are deferred.** Bookings snapshot quotes; rescheduling may reprice with an append-only quote revision. Payment collection/reconciliation and financial penalties are separate future discoveries.
27. **Resolved (review): waitlists and availability alerts require authentication.** They are customer-retention capabilities, not anonymous lead forms: both always attach to a tenant-scoped `Customer`, show in the account, and use email plus in-app notification. A public visitor may book an eligible guest trial, but a full session or unavailable appointment presents login/account creation before it creates a waitlist entry or alert.
28. **Mode B restructuring pass (2026-08-22).** This discovery was re-validated end-to-end against the live codebase — zero substantive drift found; only 3 stale line-number citations (§7, this item's own surrounding text) were corrected — and restructured from its original flat `docs/discovery/MULTI_VERTICAL_SCHEDULING*` file set into the canonical `docs/discovery/multivertical-booking/` shape via `/create-discovery` Mode B. The `plan/journey/customer/prototypes/reservar-aula/` and `minha-conta` Turmas content flagged as "ahead of order" in the promotion-status box above was pulled back into this folder's own `prototype/` for consistency (renamed to the flat actor-prefixed convention), and the four `plan/journey/` files it had modified in place were reverted to their pristine shipped state — see `plan/journey/README.md`'s own resolved-exception note. The reversion scope turned out larger than the original 2026-08-21 note tracked: `plan/journey/shared/customer-dashboard.html` had four additional un-tagged Turmas additions (a bottom-nav tab, a stat card, a whole "Próximas Turmas" section, and a desktop nav-bar tab) beyond the two `(GAP)`-tagged "Reservar aula" links the original note listed — all reverted the same way, content preserved in `prototype/minha-conta-turmas-journey.md`. `multivertical-booking_USECASES.md`'s CAND-49 through CAND-54/56 were reformatted from unlabeled prose into the numbered Main Flow / lettered Alt Flows format the rest of that doc already uses — no content change, format only. CAND-40 gained two staff-specific alt flows that were missing. 16 new error/validation prototype screens were added, each grounded in an already-documented CAND alt-flow that previously had no visual representation — see `prototype/index.html` and `prototype/dev-notes.md`.

---

## 10. UX Principle — Presets Over Generic Config

The domain model above is necessarily richer than today's, but that richness shouldn't leak into what a non-technical tenant admin sees at onboarding. A generic form exposing `resourceRequirements`, `selectionMode`, `bookingModel`, and `legs` directly would read as a spreadsheet, not a SaaS product.

The fix: a small set of **business-model presets** at onboarding — "Single resource" (car wash), "Staff, customer-chosen" (salon), "Class with capacity" (studio/gym), etc. Each preset pre-wires the underlying `Resource`/`Service`/`ClassScheduleTemplate` configuration; the admin picks the preset closest to their business rather than assembling the general model by hand. Power stays in the domain model; simplicity stays in the wizard on top of it. Any prototype work coming out of this discovery should sketch the *preset picker*, not a raw configuration screen, as the primary onboarding surface.

> **CAND-51 is the bootstrap use case for this section.** The preset picker is not merely presentation: it is the one recoverable workflow allowed to create an empty tenant's first resource/service graph. The companion preset document defines its questions and configuration mapping; the prototype folder contains its discovery flow. Ordinary CAND-06 through CAND-10b apply only after bootstrap.

---

## 11. Non-Goals / Explicitly Deferred

- **Time-varying resource/service eligibility** (e.g. a chair reserved for coloring only in the afternoon) — noted as a real pattern, not scoped in detail here.
- **Multi-location resourcing** — deferred. One tenant is one physical unit in this phase; a multi-unit brand uses separate tenants.
- **Credit-passes** — deferred. Time-bounded class access is no longer deferred: this discovery includes a minimal `ClassAccessContract` eligibility reference. One contract may cover several SESSION services, and a customer may hold overlapping contracts when their service eligibility does not overlap. It is not an online-billing or contracts-product implementation.
- **Online billing/subscription management** — deferred, same as credit-passes above. Every payment path this discovery models (`CONTRACT`, `GUEST_TRIAL`, `IN_PERSON`) assumes money changes hands outside the app; `class_access_contracts` records eligibility only, never a price or a charge. Not this discovery's scope — it's a scheduling model, not a billing one.

### Extension point: why future credit-passes need no rework here

Checked deliberately (2026-08-05) — "deferred" must not silently mean "whoever builds this discovers a restructuring is needed":

1. **A credit pack is a separate entitlement source.** It can later join a session booking beside `CONTRACT`, `GUEST_TRIAL`, and `IN_PERSON` payment sources without changing the attendee/capacity model.
2. **A credit redemption must remain append-only and separately auditable.** It should not be represented by changing a booking's quoted price or mutating the access contract.
3. **No credit-pack schema is introduced now.** The contract is one eligibility source for authenticated customer session bookings; a service-permitted pay-per-class path is the other. A credit pack is neither.

---

## 12. Candidate Use Cases

Full list, in the existing `docs/04-USE_CASES.md` field format (labeled `CAND-XX`, not `UC-XXX`, to avoid colliding with the canonical index): **`multivertical-booking_USECASES.md`**.

The candidate catalogue covers resource management, service configuration, appointment/reservation booking, class/session booking, recurrence, alerts, exceptions and lifecycle. It is intentionally expanded as this discovery closes real multi-vertical gaps; do not use a prose count as a source of truth — count the `CAND-` headings in the companion file before promotion.

## 13. Promotion-finalization rules

The following are explicit implementation rules, not future ideas.

1. **New-tenant bootstrap:** onboarding is one transaction/workflow: select preset → create the tenant's default `LOCATION` resource, initial services, eligible resources, working hours, policies and, for SESSION presets, templates. It is the only path that may create the initial service/resource graph from an empty tenant; ordinary resource/service CANDs operate after bootstrap.
2. **Waitlist offer:** V1 waitlist entries are one authenticated customer and one seat. `WAITLISTED` snapshots the chosen access intent: a qualifying `contractId` or `IN_PERSON` pay-per-class. Promotion creates a capacity-holding `PROMOTION_PENDING` offer with `offeredAt`, `expiresAt`, response metadata and a deadline of the earlier of the configured duration or session start. On accept, eligibility is rechecked: a still-valid contract confirms; pay-per-class confirms only within the non-member threshold, otherwise becomes `PENDING_APPROVAL`; an invalid/expired offer is cancelled and the next fitting entry is offered. `PROMOTION_PENDING` counts against capacity.
3. **Offer cleanup:** one idempotent worker expires offers at their deadline and always at session start. It releases capacity, records `WAITLIST_OFFER_EXPIRED` or `WAITLIST_OFFER_EXPIRED_AT_START`, notifies the customer, and promotes the next fitting entry where time remains.
4. **Cash collection boundary:** online billing remains deferred. Close-out may record an append-only in-person payment with amount, method, collector, time, and correction/reversal reason for every payable guest or authenticated pay-per-class booking.
5. **Attendee change boundary:** V1 allows an authenticated booking customer to remove named attendees only from their own SESSION booking before the service cutoff. It adjusts quantity, price and capacity atomically, keeps an audit trail, and triggers normal waitlist promotion. Adding/replacing attendees and partial appointment-attendee changes are deferred.
6. **Alerts:** an authenticated customer can create, list, cancel and let expire an alert. A matching released slot triggers at most one notification per alert/window; notification attempts are deduplicated and an alert never reserves or auto-books.
7. **Reactivation and exceptions:** manager reactivation is explicit and affects future availability only. Future-commitment exceptions are owned by a manager worklist with an audit entry, suggested alternatives, an explicit resolution and customer notification after the resolution commits.
8. **Make-up:** a replacement is only available while the qualifying contract is active and within its service/date eligibility; it uses the original entitlement, may waitlist, and a "cycle" is the calendar month containing the skipped occurrence unless the service overrides it.
9. **Recurring private allocation:** a private recurring schedule stores `FIXED_ASSIGNMENT` or `RESOLVE_PER_OCCURRENCE`. A customer/staff-selected professional/resource defaults to fixed; auto/fungible services may resolve distinct eligible resources for each occurrence. Both paths remain standing commitments, not best-effort reminders.
10. **Resource history:** resolved appointment resources are persisted as immutable booking-line assignments for audit and BI. `resource_occupancy` is only the short-lived exclusivity lock and may be garbage-collected after its window ends.
11. **Alert criteria:** alerts support a finite absolute time range and a weekly local-time preference. Both are authenticated-customer intent only; neither holds capacity or auto-creates a booking.
12. **Guest trial boundary:** `FIRST_FREE_PER_EMAIL` applies only to a verified solo guest booking (`quantity = 1`). A guest group remains supported, but is always `IN_PERSON` payable; the contact email cannot confer a free trial on unnamed additional attendees.
13. **Appointment no-show:** deferred from this discovery. Session attendee attendance remains in scope because class close-out requires it; private appointments retain the existing Booking lifecycle until a dedicated no-show/financial-policy discovery is undertaken.

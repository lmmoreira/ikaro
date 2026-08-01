# Discovery: Multi-Vertical Scheduling

**Status:** Discovery — exploratory. Nothing here is committed to a milestone; no `UC-XXX` numbers are consumed by this document.
**Companion doc:** `MULTI_VERTICAL_SCHEDULING_USECASES.md` — candidate use cases derived from this model, for completeness-checking.
**Companion doc:** `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md` — the physical schema (tables, constraints, migration ordering) this model implies, plus gaps found while translating it into real DDL.
**Companion prototype:** `MULTI_VERTICAL_SCHEDULING/prototype/` (start at its `index.html`) — 24 illustrative screens working through the model concretely on one fictional tenant (Vitta Studio). Several findings from building it fed corrections back into this doc and the use-cases doc — see its `dev-notes.md` for the full list.

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
  workingHours: BusinessHours       -- same shape as Tenant.settings.businessHours, scoped to this resource
  turnoverMinutes: int              -- default 0; see §7
  isActive:     Boolean
}
```

Three different relationships to existing data, by design, not by accident:
- **`LOCATION`** — the degenerate default every tenant gets. Replaces today's implicit "whole tenant is the resource" behavior with an explicit row, so the model is uniform (see the backfill question in §9).
- **`STAFF`** — *wraps* an existing `Staff` aggregate by reference (`refId = staffId`). Staff Context stays pure identity/permissions; scheduling data (working hours, turnover) lives on the `Resource` row, not on `Staff` itself. Mirrors the existing rule that Staff Context reads closures but never writes them.
- **`ROOM` / `EQUIPMENT`** — no other context owns these; the `Resource` row *is* the aggregate, full stop.

`ScheduleClosure` / `ScheduleOpening` gain a nullable `resourceId`. `null` = tenant-wide (today's exact behavior, unchanged default). Set = scoped to one resource ("Maria is out Tuesday" closes her calendar only, not the whole salon). The Three-Layer Resolution algorithm gains a resource-level check layered under the existing tenant-level one.

---

## 4. The Appointment/Session Fork

Trying to fold bundles, sequential legs, capacity, waitlist, recurring enrollment, and multi-unit quantity into one generalized `Booking` aggregate doesn't compose — each requirement is a plausible addition alone, but stacked together they contradict each other's assumptions (a materialized-slot design that a hairdresser's calendar doesn't need; a purely-dynamic design that a waitlist has nothing to attach to). They split into two families instead:

**Appointment-style** (models 1, 2, 3, 4, 7, 8) — one customer, one private window, resource(s) locked exclusively. Extends today's `Booking`/`Service` almost for free: availability stays dynamically computed, just scoped to a resource (or resource set) instead of the whole tenant.

**Session-style** (models 5, 6, 10, 11, 12) — the session is the bookable thing, not a person. Needs something today's model has no equivalent of: a **materialized** row per calendar occurrence, because capacity needs a place to be counted against, a waitlist needs something to queue on, and a recurring enrollment needs a stable ID to attach to.

Forcing session-style bookings to use appointment-style's dynamic computation breaks down immediately — there's no stable thing to hang a waitlist or a recurring enrollment off. Forcing appointment-style bookings to pay for materialized sessions is pure waste — a hairdresser's calendar doesn't need a pre-generated row per possible minute. **Two shapes, one shared `Resource` concept underneath.**

**Agenda vs. Turmas — the same fork, surfaced in the console.** The split isn't just a data-modeling concern; it shows up directly in what a staff member or manager sees day to day. `Booking`'s existing approval workflow (PENDING → APPROVED → COMPLETED) needs a queue to work through — that's `Agenda`, unchanged in shape, just resource-scoped now (§8). `SessionBooking` never enters that queue at all: CAND-22 auto-confirms or auto-waitlists purely on capacity, with no human review step — so there is nothing for Agenda to show for the session family. `Turmas` is the equivalent daily-use surface for that family instead: not an approval queue, but a list of upcoming materialized sessions (CAND-13b) and each one's roster (CAND-15). The two nav items aren't redundant or competing for the same job — they're the same appointment/session fork, surfaced as two different screens rather than one screen straining to serve both. A tenant running only session-style services will find Agenda structurally empty; a tenant running only appointment-style services has no use for Turmas. Neither is a bug — it's the direct consequence of keeping the two families apart instead of forcing one queue to model both.

---

## 5. Appointment-Style Deep Dive

`Service` gains:

```
Service {
  ...                              -- price, loyaltyPointsValue, requiresPickupAddress, isActive: unchanged
  bookingModel:  'APPOINTMENT' | 'SESSION'
  resourceRequirements: ResourceRequirement[]   -- flat (non-legged) services only
  legs:          ServiceLeg[] | null            -- mutually exclusive with resourceRequirements + durationMinutes
  bufferAfterMinutes: int | null                -- see §7; null on legged services (meaningless there)
}

ResourceRequirement {
  type:           ResourceType                  -- LOCATION | STAFF | ROOM | EQUIPMENT
  selectionMode:  NONE | CUSTOMER_CHOICE | AUTO_ANY | AUTO_FUNGIBLE_POOL
  resourcePoolIds: ResourceId[] | null           -- optional restriction to a subset
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
  resourceIds:  ResourceId[]        -- the bundle this class always uses, e.g. [instructorResource, roomResource]
  recurrence:   RecurrenceRule      -- e.g. weekly on [MON, WED, FRI] at 08:00
  capacity:     int
  validFrom / validUntil: Date | null
  isActive:     Boolean
}

ClassSession {                       -- materialized occurrence
  sessionId, tenantId, templateId (nullable — null if ad-hoc, not template-generated)
  serviceId
  resourceIds:  ResourceId[]        -- snapshot from template at generation time; can be overridden per-instance
  startTime, endTime
  capacity:     int                 -- snapshot from template; admin can override per-instance (e.g. cap today's class lower)
  bookedCount:  int                 -- derived/maintained
  status:       SCHEDULED | CANCELLED
}

SessionBooking {                     -- the session-style equivalent of Booking
  sessionBookingId, tenantId, sessionId
  type:            GUEST | CUSTOMER  -- same BookingType enum as Booking
  customerId:      CustomerId | null -- null if guest
  contactEmail / contactName / contactPhone   -- mirrors Booking's contact fields exactly — corrected
                                               -- 2026-08-05, was the vague "customerId | guest-contact-fields"
                                               -- placeholder; needed so SessionBookingCompleted's
                                               -- notification stays self-contained (bounded-contexts Rule 4)
  quantity:     int                 -- default 1; multi-unit (model 12)
  status:       CONFIRMED | WAITLISTED | CANCELLED | COMPLETED | NO_SHOW
  seriesId:     RecurringEnrollmentId | null

  -- Snapshots, frozen at booking-request time. Same principle as BookingLine (§1) — a
  -- later Service edit must never retroactively change a past booking, and
  -- SessionBookingCompleted needs a points value to hand Loyalty. Added 2026-08-05 —
  -- the original model had none of these at all (MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md
  -- §6 item 1).
  serviceNameAtBooking:  String
  priceAtBooking:        Money
  pointsValueAtBooking:  int
}

RecurringEnrollment {
  enrollmentId, tenantId, customerId, templateId
  startDate, endDate: Date | null   -- null = ongoing
  status:       ACTIVE | PAUSED | CANCELLED
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

**Waitlist**: once `bookedCount = capacity`, new `SessionBooking`s get `status = WAITLISTED`. Queue position is FIFO by `createdAt`, derived at read time rather than stored and shifted on every promotion/cancellation — corrected 2026-08-05; a persisted `waitlistPosition` column was more bookkeeping than the requirement needs (`MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md` §6 item 8). On a `CONFIRMED` booking's cancellation, the earliest-queued `WAITLISTED` booking promotes automatically. If a `WAITLISTED` booking is never promoted before its `ClassSession.endTime` passes, it's moot — a purely mechanical, no-judgment cleanup (`CAND-25b`) auto-cancels it, the same way `CAND-13`'s generator runs on a schedule with no human in the loop.

**Attendance, completion, and no-show — deliberately staff-triggered, not a job.** `SessionBooking` needs a terminal state for "this actually happened," the same way `Booking` reaches `COMPLETED` (`UC-009`) — but unlike `UC-009`'s one-booking-at-a-time "Mark Complete" click, a session can have up to `capacity` attendees, so requiring N individual clicks doesn't scale. Instead: the roster pre-marks every `CONFIRMED` booking as attended by default: staff flags only the exceptions (no-shows), then closes the session out in one batch action (`CAND-15b`) — everything still `CONFIRMED` becomes `COMPLETED`, flagged ones become `NO_SHOW`. This mirrors `UC-009`'s staff-driven pattern (not a scheduled job — attendance needs a human to observe it, unlike the mechanical waitlist cleanup above) while fitting the N-attendee shape session capacity actually has. `COMPLETED` publishes a candidate `SessionBookingCompleted` event, mirroring `BookingCompleted`'s consumers (Loyalty inserts a `LoyaltyEntry` when `customerId != null`; Notification sends a "thanks for coming" message regardless — `docs/05-BOUNDED_CONTEXTS.md`).

**Scope note — this puts `SessionBooking` ahead of `Booking` on no-show tracking.** `UC-009` alt A1 explicitly marks `NO_SHOW` for `Booking` as *"future state, not in MVP"* — today's real system has no no-show tracking for either family. Deliberately building it for `SessionBooking` here anyway: a no-show against a capacity-constrained class with an active waitlist wastes a spot a waitlisted customer could have used, and attendance/no-show is itself a real operating metric for a studio/gym business — the cost-benefit is different from a private 1:1 appointment's no-show, and this is a knowing scope choice, not an oversight.

**Recurring enrollment**: a process attaches a `SessionBooking` to each upcoming `ClassSession` matching the enrollment's template, respecting capacity (or waitlisting) fresh each time — an enrollment is a *standing intent*, not a guarantee.

**Multi-unit quantity**: `SessionBooking.quantity` consumes N of the session's remaining capacity in one action, rather than requiring N separate bookings.

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
| `Service` | + `bookingModel`, `resourceRequirements[]`, `legs[] \| null`, `bufferAfterMinutes \| null`. Everything else unchanged. |
| `BookingLine` | + `resourceAssignments` / `legAssignments` snapshot (which concrete resource(s) got locked), same "freeze at booking time" pattern as existing price/duration snapshots. |
| `Booking` | Appointment-style only. State machine, approval workflow, cancellation-window rule: **unchanged**. Only the effective calendar-blocked window changes from "the whole tenant" to "this resource(s), this window." |
| `ScheduleClosure` / `ScheduleOpening` | + nullable `resourceId`. `null` = tenant-wide (today's behavior, default). Three-Layer Resolution gains a resource-level check under the tenant-level one. |
| `Staff` | **Unchanged.** Stays pure identity/permissions; scheduling data lives on the `Resource` row that references it. |
| `IBookingAvailabilityPort` | Gains a `resourceId` filter alongside `tenantId`/`date`. |

### New (all in Booking Context)

| Aggregate | Purpose |
|---|---|
| `Resource` | Generic bookable unit — `LOCATION`, `STAFF` (wraps `staffId`), `ROOM`, `EQUIPMENT` (owned outright). |
| `ClassScheduleTemplate` | Session-style recurring pattern: service, resource bundle, recurrence, capacity. |
| `ClassSession` | Materialized occurrence, generated on a rolling horizon; capacity/resources overridable per-instance. |
| `SessionBooking` | Session-style equivalent of `Booking`. `quantity` for multi-unit; `CONFIRMED\|WAITLISTED\|CANCELLED`. |
| `RecurringEnrollment` | Standing link between a customer and a template; generates a `SessionBooking` per upcoming matching session. |

---

## 9. Open Questions / Risks

1. **`LOCATION` resource backfill** — give every existing tenant an explicit `Resource` row at migration time (uniform model), or keep `resourceId = null` as a permanent legacy sentinel? Backfilling is consistent with the "no workarounds" principle but is a real migration decision, not a default to assume.
2. **Does a `SessionBooking` ever need admin approval**, or is it always auto-confirm/waitlist with no human in the loop? Changes the state machine shape (today's appointment `Booking` has PENDING/APPROVED/INFO_REQUESTED; a class booking plausibly doesn't need any of that).
3. **Rolling-horizon window size** for `ClassSession` generation — how far ahead does the generator materialize sessions from an active template? **Resolved to a pure UX/cost tradeoff, not a correctness one (2026-08-04):** cross-family resource conflicts (§6) are caught by evaluating a template's recurrence rule directly, not by requiring a `ClassSession` row to exist — so this window no longer needs to match `maxBookingAdvanceDays` or any other correctness-driven size. What's still open is purely: too short risks customers unable to book far enough ahead; too long generates rows nobody will ever fill.
4. **Lowering a `ClassSession`'s capacity below its current `bookedCount`** (an instance override) — what happens to the customers now over capacity? No clean answer without a business decision (bump to waitlist? grandfather them in?).
5. **Cancelling a `ClassSession` that already has bookings** — refund policy, notification, whether affected customers get auto-offered another session. Same shape of question as #4 but triggered by the manager cancelling the whole session rather than shrinking it.
6. **Multi-location resource ownership** — ties directly to the open decision already logged in `CLAUDE.md` §12 ("Multiple locations per tenant = separate tenants or sub-tenant model?"). The `Resource` model should leave room for a location dimension later, not attempt to resolve §12 here.
7. **SESSION-type services have no formal eligible-resource-pool concept.** Surfaced while prototyping a CrossFit template with three eligible instructors (Bruno/João/Fábio), visible on two resource types, not one: `manager-06-criar-turma.html`'s create-turma screen labels its Instrutor field "elegível para Pilates: Camila, Ana" and its Sala field "elegível para Pilates: Estúdio 1, Estúdio 2" — real UI text implying a per-type pool that nothing in the schema declared at the time. **Resolved (2026-08-05):** see `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md`'s `class_schedule_template_slots` / `class_schedule_template_slot_pool` tables — each template slot now has its own resolved resource plus the eligible pool it was drawn from, mirroring `ResourceRequirement.resourcePoolIds`'s shape one level deeper, generalized to `EQUIPMENT` as well as `STAFF`/`ROOM`.
8. **`Resource` has no `maxCapacity`.** Nothing constrains a `ClassScheduleTemplate.capacity` against the physical size of the resource it uses — a manager could set `capacity: 50` for a class using a room that fits 4, with no validation catching it.
9. **CAND-04's actor scoping.** Group A (Resource Management) is uniformly MANAGER-only, but blocking a `STAFF` resource's *own* calendar (a stylist marking herself unavailable) reads as a natural self-service action — unlike blocking a `ROOM`/`EQUIPMENT` resource, which has no self and stays administrative regardless. Not resolved; CAND-04 still says MANAGER-only.
10. **CAND-17b's tie-breaking rule.** When a service auto-assigns a named staff member (`AUTO_ANY`) and more than one eligible staff member is free for the chosen slot, who gets picked — least-recently-booked, round robin, something else? Not decided.
11. **Does deactivating a `Staff` row (UC-029, Staff Context) cascade to a wrapping `STAFF`-type `Resource` (CAND-03, Booking Context)?** Two independent deactivation entry points exist — one per context — with nothing wiring them together. `StaffDeactivated` currently has zero consumers in the real system; this would be its first. Surfaced while building `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md` §6 item 4. Not resolved.
12. **Do `ClassSession`/`SessionBooking` become full event-emitting aggregates, or stay plain entities published from the use case?** `SessionBookingConfirmed`/`Waitlisted`/`Completed`, `WaitlistPromoted`, and `ClassSessionCancelled` are each triggered by a specific use-case call transitioning state — the same shape as `Booking`'s existing 3-aggregate transactional-outbox pattern (TD24-S02), which would mean `ClassSession`/`SessionBooking` joining that fixed list and getting their own outbox-draining repositories. Surfaced while building `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md` §6 item 11. Not resolved — a real architectural commitment, not a detail.

---

## 10. UX Principle — Presets Over Generic Config

The domain model above is necessarily richer than today's, but that richness shouldn't leak into what a non-technical tenant admin sees at onboarding. A generic form exposing `resourceRequirements`, `selectionMode`, `bookingModel`, and `legs` directly would read as a spreadsheet, not a SaaS product.

The fix: a small set of **business-model presets** at onboarding — "Single resource" (car wash), "Staff, customer-chosen" (salon), "Class with capacity" (studio/gym), etc. Each preset pre-wires the underlying `Resource`/`Service`/`ClassScheduleTemplate` configuration; the admin picks the preset closest to their business rather than assembling the general model by hand. Power stays in the domain model; simplicity stays in the wizard on top of it. Any prototype work coming out of this discovery should sketch the *preset picker*, not a raw configuration screen, as the primary onboarding surface.

---

## 11. Non-Goals / Explicitly Deferred

- **Time-varying resource/service eligibility** (e.g. a chair reserved for coloring only in the afternoon) — noted as a real pattern, not scoped in detail here.
- **Multi-location resourcing** — deferred until `CLAUDE.md` §12's open decision resolves.

---

## 12. Candidate Use Cases

Full list, in the existing `docs/04-USE_CASES.md` field format (labeled `CAND-XX`, not `UC-XXX`, to avoid colliding with the canonical index): **`MULTI_VERTICAL_SCHEDULING_USECASES.md`**.

36 candidates across six groups: resource management, service configuration, class/session management, appointment booking, class/session booking, and cross-cutting system behavior (five added after the original 31 — CAND-13b, CAND-17b, CAND-13c, CAND-15b, and CAND-25b — each an enumeration gap found by cross-checking the prototypes against this list, by a direct question about manager oversight of multiple resources at once, or by working through cross-family resource exclusivity and session attendance/no-show tracking as a domain interview). Several (session cancellation with existing bookings, capacity override below headcount) surfaced real open questions rather than just missing prose — see §9.

# Discovery: Multi-Vertical Scheduling — Candidate Use Cases

**Status:** Discovery — candidate/speculative. Labeled `CAND-XX`, never `UC-XXX`, so this list can never collide with or be mistaken for the canonical index in `docs/04-USE_CASES.md`. Nothing here is committed to a milestone; promote individual candidates into `docs/04-USE_CASES.md` with real UC numbers only if/when a milestone is actually drafted for one of these verticals.

**Companion doc:** `MULTI_VERTICAL_SCHEDULING.md` — the domain model these use cases are derived from.
**Companion prototype:** `MULTI_VERTICAL_SCHEDULING/prototype/` (start at its `index.html`) — several candidates below (CAND-13b, CAND-13c, CAND-17b) were added *because* building the prototype exposed a gap this list hadn't caught; the prototype's own `dev-notes.md` has the full trail.

## Format

Same fields as `docs/04-USE_CASES.md`, applied at discovery-stage depth (main flow + the alt flows that matter, not exhaustive):

```
CAND-XX: [Name]
- Actor / Preconditions / Trigger / Main Flow / Alternative Flows / Postconditions / Events Triggered
```

---

## Group A — Resource Management (Manager)

### **CAND-01: Manager Creates a Resource**

- **Actor:** Staff (MANAGER role)
- **Preconditions:** Tenant has at least one active `Service` using `bookingModel = APPOINTMENT` with a non-`LOCATION` resource requirement (otherwise there's nothing to attach a resource to).
- **Trigger:** Manager clicks "Add Resource" in dashboard settings.
- **Main Flow:**
  1. Manager selects resource type: `STAFF` (picks an existing `Staff` row to wrap), `ROOM`, or `EQUIPMENT`.
  2. For `ROOM`/`EQUIPMENT`, manager enters a display name.
  3. Manager sets initial working hours (defaults to tenant `businessHours` if left blank).
  4. System creates the `Resource` row, `isActive = true`.
- **Alternative Flows:**
  - **A1: Staff member already wrapped by a `STAFF` resource** → System blocks: one `Resource` per `Staff` row.
  - **A2: No working hours set and tenant has no `businessHours` either** → System blocks; a resource must have *some* schedule.
- **Postconditions:** `Resource` exists, available for `Service.resourceRequirements` to reference.
- **Events Triggered:** None (config-only, same as today's `ScheduleClosure`/`ScheduleOpening`).

### **CAND-02: Manager Edits a Resource's Working Hours**

> Clarified on review (2026-07-29), grounded against the real `plan/journey/staff/prototypes/horarios/00-schedule-next.html`: that screen is a booking/closure WEEK TIMELINE, not a weekly-pattern settings form — it has never shown per-weekday open/close editing. This CAND is about a *different*, simpler settings screen (same shape as wherever tenant `businessHours` gets edited today, in Configurações) — not the Horários screen. Don't conflate the two; CAND-04 below is the one that actually extends the real Horários screen.

- **Actor:** Staff (MANAGER)
- **Preconditions:** Resource exists.
- **Trigger:** Manager edits the resource's schedule in dashboard settings.
- **Main Flow:**
  1. Manager opens the resource's schedule editor (same shape as tenant `businessHours` editor).
  2. Manager sets per-weekday open/close windows.
  3. System validates (open < close, valid days) and saves.
- **Alternative Flows:**
  - **A1: Existing approved appointments now fall outside the new hours** → System warns before saving; does not auto-cancel existing bookings.
- **Postconditions:** Future availability queries for this resource use the new hours; existing bookings untouched.
- **Events Triggered:** None.

### **CAND-03: Manager Deactivates a Resource**

- **Actor:** Staff (MANAGER)
- **Preconditions:** Resource exists and is active.
- **Trigger:** Manager clicks "Deactivate" on a resource (e.g. a stylist leaves, equipment is retired).
- **Main Flow:**
  1. System checks for future `APPROVED` bookings/sessions referencing this resource.
  2. If none, sets `isActive = false` immediately.
  3. If some exist, manager is shown the list and must resolve them (reassign or cancel) before deactivation completes.
- **Alternative Flows:**
  - **A1: Resource is part of an active `ClassScheduleTemplate`'s bundle** → System blocks deactivation until the template is edited or deactivated first.
- **Postconditions:** Resource no longer offered for new bookings; existing history intact.
- **Events Triggered:** None.

### **CAND-04: Manager Creates a Resource-Scoped Schedule Closure**

> Grounded on review (2026-07-29) against the real `plan/journey/staff/prototypes/horarios/00-schedule-next.html` — a per-tenant week timeline of bookings, whose FAB "Bloquear período" is exactly where today's tenant-wide `ScheduleClosure` gets created. This candidate is that same screen, resourceId-scoped instead of tenant-wide — see the discovery prototype's `staff-05-horarios-recurso.html` for a concrete extension. Open actor question surfaced by building it: should a STAFF-type resource's *own* calendar be self-service (the staff member blocking their own time) rather than this group's blanket MANAGER-only? A ROOM/EQUIPMENT resource has no self, so blocking those stays administrative either way — not resolved here, flagged rather than silently decided.

- **Actor:** Staff (MANAGER)
- **Preconditions:** Resource exists.
- **Trigger:** Manager creates a closure and picks a specific resource instead of "whole business" (e.g. "Maria — day off").
- **Main Flow:**
  1. Manager selects date (+ optional time window) and reason, same as today's tenant-wide `ScheduleClosure` flow.
  2. Manager selects a specific resource instead of leaving it blank.
  3. System validates no overlapping closure exists for `(tenantId, resourceId, date)` and saves with `resourceId` set.
- **Alternative Flows:**
  - **A1: Resource left unselected** → Falls back to today's tenant-wide behavior, `resourceId = null`.
- **Postconditions:** The resource's calendar shows this window blocked; other resources at the same tenant are unaffected.
- **Events Triggered:** None (mirrors today's `ScheduleClosure`, which also publishes nothing).

### **CAND-05: Manager Creates a Resource-Scoped Schedule Opening**

- **Actor:** Staff (MANAGER)
- **Preconditions:** Resource exists; the target day-of-week is closed in that resource's `workingHours` (or, if the resource has none, in tenant `businessHours`).
- **Trigger:** Manager opens a normally-closed day for one resource only (e.g. a stylist takes an extra Saturday).
- **Main Flow:** Same as today's tenant-wide `ScheduleOpening` (UC-010), with `resourceId` set.
- **Alternative Flows:** Same as UC-010's.
- **Postconditions:** Only that resource's calendar opens for the date; the rest of the tenant is unaffected.
- **Events Triggered:** None.

---

## Group B — Service Configuration (Manager)

### **CAND-06: Manager Configures a Service's Resource Requirement**

- **Actor:** Staff (STAFF or MANAGER — matches today's Service management, `staff/prototypes/servicos/`, not manager-exclusive)
- **Preconditions:** Service exists, `bookingModel = APPOINTMENT`.
- **Trigger:** Manager edits the service's "who/what is needed" setting.
- **Main Flow:**
  1. Manager picks resource type (`LOCATION` default / `STAFF` / `ROOM` / `EQUIPMENT`).
  2. Manager picks selection mode: none (today's default), customer chooses, system auto-assigns (named), or auto-assigns (fungible pool).
  3. If a pool restriction applies, manager picks which specific resources are eligible.
  4. System saves `resourceRequirements[0]`.
- **Alternative Flows:**
  - **A1: No active resources of the chosen type exist** → System blocks save until at least one exists.
- **Postconditions:** New bookings for this service are checked/locked against the configured resource(s).
- **Events Triggered:** None.

### **CAND-07: Manager Configures a Bundled Resource Requirement**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Service exists; at least two distinct resource types have active resources (e.g. staff + equipment for a dentist).
- **Trigger:** Manager adds a second resource requirement to the same service.
- **Main Flow:**
  1. Manager adds a second `ResourceRequirement` entry (e.g. `EQUIPMENT`, `AUTO_ANY`).
  2. System saves `resourceRequirements` as an array of ≥ 2.
- **Alternative Flows:**
  - **A1: Manager tries to combine a bundle with `legs`** → System blocks: a service is either flat-with-bundle or legged, not both (see CAND-08).
- **Postconditions:** Booking this service now requires *all* listed resources free for the same window.
- **Events Triggered:** None.

### **CAND-08: Manager Configures Service Legs (Sequential Multi-Stage)**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Service exists.
- **Trigger:** Manager switches the service from "single resource" to "multi-stage journey."
- **Main Flow:**
  1. Manager adds ordered legs, each with a name, duration, resource requirement, and transition-gap-after.
  2. System computes and displays the total appointment span (`sum(leg durations) + sum(transition gaps)`), distinct from total billable time.
  3. System clears `resourceRequirements`/`bufferAfterMinutes` on the service (mutually exclusive with `legs`, per §5 of the discovery doc).
- **Alternative Flows:**
  - **A1: Fewer than 2 legs** → System blocks: a single leg is just the flat model (CAND-06), not this flow.
- **Postconditions:** Booking this service locks each leg's resource independently for its own sub-window.
- **Events Triggered:** None.

### **CAND-09: Manager Sets a Service's Buffer Override**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Service exists, `bookingModel = APPOINTMENT`, no `legs` set.
- **Trigger:** Manager edits the service's cleanup/prep buffer.
- **Main Flow:**
  1. Field is pre-filled from the tenant's `serviceBufferMinutes` default at service-creation time.
  2. Manager overrides with a service-specific value.
  3. System saves `Service.bufferAfterMinutes`.
- **Alternative Flows:**
  - **A1: Service has `legs`** → Field is disabled; legs use per-leg transition gaps and per-resource turnover instead (§7 of the discovery doc).
- **Postconditions:** Availability calculations for this service use `max(service.bufferAfterMinutes, resource.turnoverMinutes)`.
- **Events Triggered:** None.

### **CAND-10: Manager Chooses a Service's Booking Model at Creation**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** None beyond an active tenant.
- **Trigger:** Manager creates a new service.
- **Main Flow:**
  1. Manager picks `APPOINTMENT` (a private appointment, today's default) or `SESSION` (a class with capacity).
  2. If `APPOINTMENT`: proceeds to CAND-06 (or CAND-08 for legs).
  3. If `SESSION`: no resource requirement is set on the `Service` itself — manager is prompted to create a `ClassScheduleTemplate` next (CAND-11).
- **Alternative Flows:**
  - **A1: Manager tries to change `bookingModel` on a service with existing bookings** → System blocks; booking model is immutable once the service has history.
- **Postconditions:** Service exists with a fixed `bookingModel`.
- **Events Triggered:** None.

---

## Group C — Class/Session Management (Manager)

### **CAND-11: Manager Creates a Recurring Class Schedule Template**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Service exists with `bookingModel = SESSION`.
- **Trigger:** Manager sets up the class's recurring pattern.
- **Main Flow:**
  1. Manager selects the resource bundle this class always uses (e.g. instructor + room).
  2. Manager sets a recurrence rule (days of week, start time — duration comes from `Service.durationMinutes`).
  3. Manager sets `capacity`.
  4. System creates the `ClassScheduleTemplate`, `isActive = true`.
  5. System (async) begins generating `ClassSession` rows on the rolling horizon (CAND-13).
- **Alternative Flows:**
  - **A1: Chosen resources are already committed to an overlapping template** → System blocks: e.g. the same room can't host two recurring classes at the same time.
- **Postconditions:** Template active; sessions begin appearing on the booking calendar.
- **Events Triggered:** None.

### **CAND-12: Manager Edits or Deactivates a Template**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Template exists.
- **Trigger:** Manager changes the recurrence, resources, or default capacity, or turns the template off.
- **Main Flow:**
  1. Manager edits the template.
  2. System applies the change only to **future, not-yet-generated** sessions — already-materialized sessions are untouched (they were snapshotted at generation time, per §6 of the discovery doc).
  3. Deactivating stops future generation; existing future sessions remain bookable unless separately cancelled (CAND-15).
- **Alternative Flows:**
  - **A1: Manager wants existing future sessions to also change** → Out of scope for this flow; manager must edit each `ClassSession` individually (CAND-14) or cancel and recreate.
- **Postconditions:** Template reflects new config; historical/already-generated sessions unaffected.
- **Events Triggered:** None.

### **CAND-13: System Generates Upcoming Class Sessions**

- **Actor:** System (scheduled job — same shape as the existing loyalty-expiry cron)
- **Preconditions:** At least one active `ClassScheduleTemplate` exists.
- **Trigger:** Rolling-horizon generation job runs (frequency/window TBD — open question, discovery doc §9).
- **Main Flow:**
  1. For each active template, system computes the next occurrence(s) within the horizon not yet materialized.
  2. System creates a `ClassSession` per occurrence, snapshotting `resourceIds`/`capacity` from the template at generation time.
  3. Idempotency: a `(templateId, startTime)` uniqueness check prevents double-generation on retry.
- **Alternative Flows:**
  - **A1: A resource in the bundle is closed (resource-scoped `ScheduleClosure`) for that occurrence** → Session is not generated for that date, or generated as `CANCELLED` — needs a decision.
- **Postconditions:** `ClassSession` rows exist far enough ahead for customers to book into.
- **Events Triggered:** None.

### **CAND-13b: Staff or Manager Views a List of Upcoming Class Sessions**

> Added on review (2026-07-29): missing entirely until now. CAND-13 covers the *system* generating sessions and CAND-14/15 cover acting on *one specific* session, but nothing covered the list in between — mirrors `Agenda`'s own real shape (a list first, e.g. `staff/prototypes/agenda/00-agenda.html`, then a detail page per item), which this had skipped straight past.

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** At least one active `ClassScheduleTemplate` has generated future `ClassSession` rows.
- **Trigger:** Staff/manager opens "Turmas."
- **Main Flow:**
  1. System lists upcoming `ClassSession`s grouped by day (today first, then upcoming days), each showing service name, time, resources, and `capacity - bookedCount`.
  2. A filter defaults to "my turmas" for a STAFF viewer (sessions where one of their own `Resource`-wrapped rows is in `resourceIds`) vs. "all turmas" for a MANAGER viewer — same spirit as Agenda's queue scope.
  3. Selecting a session opens its roster (CAND-15's screen).
  4. A secondary link leads to the recurring-template CRUD (CAND-11/12) for setup, since that's a config action, not a daily one.
- **Alternative Flows:**
  - **A1: No upcoming sessions at all** → "Nenhuma turma nos próximos dias" — same empty-state spirit as Agenda's.
- **Postconditions:** None (read-only browse).
- **Events Triggered:** None.

### **CAND-13c: Manager Views a Combined Multi-Resource Day Grid**

> Added on request (2026-07-29): "as a manager, can I see all staff + salas + equipamentos at once, or is everything fragmented per-resource?" Until this candidate, the honest answer was fragmented — `manager-01` is a flat resource list with no calendar, CAND-13b's list and the per-resource Horários (CAND-04) each show one thing at a time. Nothing showed every resource's day side by side, which real booking software (salon/gym schedulers) treats as a baseline manager feature. No new domain concept needed — it's the same per-resource availability query as CAND-29, run across several resources and rendered as columns instead of one at a time.

- **Actor:** Staff (MANAGER — deliberately manager-only, like Equipe/Configurações/Hotsite; broader oversight surface than CAND-13b's toggle or the Agenda mine/all toggle, both of which show bookings, not every resource's raw schedule shape at once)
- **Preconditions:** Tenant has ≥ 2 active resources.
- **Trigger:** Manager opens "Horários" (role-adaptive: a STAFF viewer gets their own resource's timeline — CAND-04's screen — a MANAGER viewer gets this grid instead).
- **Main Flow:**
  1. System shows a grid: columns = active resources (any type), rows = time slots for the selected day.
  2. Each cell shows a booking/session if that resource is occupied then, reusing the same visual block as the single-resource timeline.
  3. Manager clicks any cell to drill into that booking/session's detail.
- **Alternative Flows:**
  - **A1: Too many resources to fit on screen** → horizontal scroll, plus a resource-type filter (Profissionais / Salas / Equipamentos) to narrow the visible columns.
- **Postconditions:** None (read-only).
- **Events Triggered:** None.

### **CAND-14: Manager Overrides a Single Session's Capacity or Resources**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** `ClassSession` exists, `status = SCHEDULED`.
- **Trigger:** Manager needs a one-off change (e.g. instructor injury caps today's class lower, or swaps the room).
- **Main Flow:**
  1. Manager edits the specific session's `capacity` and/or `resourceIds`.
  2. System validates the new resource(s) are free for the window (if changed).
  3. System saves — this instance only; the template is untouched.
- **Alternative Flows:**
  - **A1: New capacity < current `bookedCount`** → **Open question** (discovery doc §9): no clean default — needs a business decision (bump excess to waitlist? grandfather them in?). Flagged, not resolved, in this candidate.
- **Postconditions:** This session reflects the override; future template-generated sessions are unaffected.
- **Events Triggered:** None (unless resolving A1 requires notifying affected customers — see CAND-15's event).

### **CAND-15: Manager Cancels a Class Session With Existing Bookings**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** `ClassSession` exists with ≥ 1 `SessionBooking` in `CONFIRMED` or `WAITLISTED` status.
- **Trigger:** Manager cancels a session (e.g. instructor unavailable, no substitute).
- **Main Flow:**
  1. Manager confirms cancellation.
  2. System sets `ClassSession.status = CANCELLED`.
  3. System transitions every `CONFIRMED`/`WAITLISTED` `SessionBooking` referencing it to `CANCELLED`.
  4. System publishes `ClassSessionCancelled` for Notification Context to inform affected customers.
- **Alternative Flows:**
  - **A1: Refund/credit policy for confirmed bookings** — **Open question** (discovery doc §9): not resolved here; likely tenant-configurable, same spirit as `cancellationWindowHours`.
- **Postconditions:** Session and its bookings cancelled; customers notified.
- **Events Triggered:** `ClassSessionCancelled` (candidate event — not yet in `docs/03-DOMAIN_EVENTS.md`).

---

## Group D — Appointment Booking (Customer/Guest)

### **CAND-16: Customer Books With a Specific Chosen Staff Member**

- **Actor:** Customer or Guest
- **Preconditions:** Service has `resourceRequirements = [{ type: STAFF, selectionMode: CUSTOMER_CHOICE }]`.
- **Trigger:** Customer selects the service and is prompted to choose a staff member.
- **Main Flow:**
  1. Customer sees the list of active `STAFF`-type resources offering this service.
  2. Customer picks one; calendar shows **only that resource's** availability (not the whole tenant's).
  3. Customer picks a slot; remainder of the flow matches today's UC-001/UC-002.
  4. System locks the chosen resource (not the whole tenant) for the booked window.
- **Alternative Flows:**
  - **A1: Chosen staff member has no availability in the visible range** → Customer can pick a different staff member or a later date.
- **Postconditions:** Booking exists with a resolved `resourceAssignments` entry for the chosen staff.
- **Events Triggered:** `BookingRequested` (unchanged envelope, now implies a resource-scoped slot).

### **CAND-17: Customer Books Auto-Assigned From a Fungible Resource Pool**

- **Actor:** Customer or Guest
- **Preconditions:** Service has `resourceRequirements = [{ type: ROOM/EQUIPMENT, selectionMode: AUTO_FUNGIBLE_POOL }]`.
- **Trigger:** Customer selects the service (e.g. "book a court").
- **Main Flow:**
  1. Calendar shows availability aggregated across the whole pool — a slot is open if **any** pool member is free.
  2. Customer picks a slot; system auto-assigns whichever pool resource is free (no identity shown).
  3. Remainder matches today's flow.
- **Alternative Flows:**
  - **A1: All pool members already booked for that window** → Slot doesn't appear as available at all.
- **Postconditions:** Booking locks one specific pool resource, invisibly to the customer.
- **Events Triggered:** `BookingRequested`.

### **CAND-17b: Customer Books a Service Configured for System-Auto-Assigned Named Staff**

> Added on review (2026-07-29): this use case was missing entirely. CAND-06 (manager config) already lists "system auto-assigns (named)" as one of four selection modes to configure, but Group D previously jumped from CAND-16 (customer-chosen) straight to CAND-17 (fungible pool), skipping this middle case — taxonomy model #3 — even though it's distinct from both: unlike CAND-16, the customer never sees a picker; unlike CAND-17, the assigned resource still has a name the customer learns at confirmation.

- **Actor:** Customer or Guest
- **Preconditions:** Service has `resourceRequirements = [{ type: STAFF, selectionMode: AUTO_ANY }]`.
- **Trigger:** Customer selects the service.
- **Main Flow:**
  1. Customer selects the service and goes **directly** to the calendar/slot picker — no staff-selection step is shown at all (unlike CAND-16).
  2. Availability is the union across every active `STAFF` resource offering this service — a slot is open if **any** eligible staff member is free.
  3. Customer picks a slot and submits; system assigns whichever eligible staff member is free for that exact window.
  4. Confirmation reveals the assigned staff member's name (unlike CAND-17, where no identity is ever shown).
- **Alternative Flows:**
  - **A1: More than one staff member is free for the chosen slot** → System needs a tie-breaking rule (least-recently-booked? round robin?) — not resolved here, a genuine open question alongside discovery doc §9.
- **Postconditions:** Booking exists with a resolved `resourceAssignments` entry the customer did not choose.
- **Events Triggered:** `BookingRequested`.

### **CAND-18: Customer Books a Bundled-Resource Appointment**

- **Actor:** Customer or Guest
- **Preconditions:** Service has `resourceRequirements.length ≥ 2` (e.g. dentist + chair).
- **Trigger:** Customer selects the service.
- **Main Flow:**
  1. For each requirement with `CUSTOMER_CHOICE`, customer picks (e.g. which dentist).
  2. Calendar shows slots where **all** required resources are simultaneously free.
  3. Customer books; system locks every resource in the bundle for the same window.
- **Alternative Flows:**
  - **A1: Chosen staff is free but the auto-assigned equipment isn't** → Slot doesn't appear as available (intersection, not union, of resource availability).
- **Postconditions:** Booking's `resourceAssignments` lists every locked resource.
- **Events Triggered:** `BookingRequested`.

### **CAND-19: Customer Books a Multi-Leg Appointment**

- **Actor:** Customer or Guest
- **Preconditions:** Service has `legs.length ≥ 2` (e.g. spa journey).
- **Trigger:** Customer selects the service.
- **Main Flow:**
  1. Customer picks `CUSTOMER_CHOICE` resources per leg where applicable (e.g. which massage therapist).
  2. Calendar shows start times where the **entire chained itinerary** fits — every leg's resource is free at its computed sub-window, honoring transition gaps.
  3. Customer books; confirmation shows the full itinerary (per-leg time + resource), same shape as the `legAssignments` example in the discovery doc §5.
- **Alternative Flows:**
  - **A1: A middle leg's resource becomes unavailable between page load and submit** → System re-validates the whole chain atomically at submit time; rejects with "one part of this journey is no longer available."
- **Postconditions:** One `BookingLine` with a full `legAssignments` snapshot.
- **Events Triggered:** `BookingRequested`.

### **CAND-20: Customer Views a Specific Staff Member's Own Calendar**

- **Actor:** Customer or Guest
- **Preconditions:** Tenant has `STAFF`-type resources with `CUSTOMER_CHOICE` on at least one service.
- **Trigger:** Customer browses a staff directory before booking (e.g. "See Maria's availability").
- **Main Flow:**
  1. Customer picks a staff member from a directory/profile view.
  2. System shows that resource's availability across all services they're eligible for, not scoped to one service yet.
  3. Customer proceeds into CAND-16 once a slot/service is chosen.
- **Alternative Flows:**
  - **A1: Staff member is inactive** → Not shown in the directory.
- **Postconditions:** None (read-only browse).
- **Events Triggered:** None.

---

## Group E — Class/Session Booking (Customer/Guest)

### **CAND-21: Customer Browses Upcoming Sessions With Remaining Capacity**

- **Actor:** Customer or Guest
- **Preconditions:** Service has `bookingModel = SESSION` with an active template generating sessions.
- **Trigger:** Customer selects a class-type service.
- **Main Flow:**
  1. System lists upcoming `ClassSession`s for the service, each showing `capacity - bookedCount` remaining spots.
  2. Sessions at 0 remaining show "Full — join waitlist" instead of a book button.
- **Alternative Flows:**
  - **A1: No upcoming sessions in range** → "No upcoming classes" shown; consistent with today's "no available slots" messaging.
- **Postconditions:** None (read-only browse).
- **Events Triggered:** None.

### **CAND-22: Customer Books Into a Session (Single Unit)**

- **Actor:** Customer or Guest
- **Preconditions:** `ClassSession` exists, `bookedCount < capacity`.
- **Trigger:** Customer clicks "Book" on a session with remaining capacity.
- **Main Flow:**
  1. Customer confirms contact details (same guest/authenticated split as today's UC-001/UC-002).
  2. System atomically checks `bookedCount < capacity` and creates `SessionBooking(quantity=1, status=CONFIRMED)`, incrementing `bookedCount`.
  3. Confirmation shown/sent.
- **Alternative Flows:**
  - **A1: Session fills between page load and submit (race)** → System re-checks capacity at write time; if now full, falls through to CAND-24 (waitlist) instead of failing outright.
- **Postconditions:** `SessionBooking` exists, `CONFIRMED`.
- **Events Triggered:** `SessionBookingConfirmed` (candidate event, mirrors `BookingRequested`'s role for Notification Context).

### **CAND-23: Customer Books Multiple Units in One Action**

- **Actor:** Customer or Guest
- **Preconditions:** Same as CAND-22; `capacity - bookedCount ≥ requested quantity`.
- **Trigger:** Customer requests N spots in one checkout (e.g. "2 bikes, me + a friend").
- **Main Flow:**
  1. Customer sets quantity (bounded by remaining capacity).
  2. System atomically checks remaining ≥ quantity, creates one `SessionBooking(quantity=N)`, increments `bookedCount` by N.
- **Alternative Flows:**
  - **A1: Requested quantity exceeds remaining capacity** → System caps the selectable quantity in the UI to what's left; never offers an invalid N.
- **Postconditions:** One `SessionBooking` row consuming N units — distinct from N separate customer bookings filling the same class.
- **Events Triggered:** `SessionBookingConfirmed`.

### **CAND-24: Customer Joins a Waitlist When a Session Is Full**

- **Actor:** Customer or Guest
- **Preconditions:** `ClassSession.bookedCount = capacity`.
- **Trigger:** Customer clicks "Join waitlist" on a full session.
- **Main Flow:**
  1. System creates `SessionBooking(status=WAITLISTED)`, assigns the next `waitlistPosition`.
  2. Customer is told their position ("You're #3 on the waitlist").
- **Alternative Flows:**
  - **A1: Customer already has a `CONFIRMED` or `WAITLISTED` booking on this session** → Blocked, no duplicate entries.
- **Postconditions:** Waitlisted `SessionBooking` exists.
- **Events Triggered:** `SessionBookingWaitlisted` (candidate event).

### **CAND-25: System Auto-Promotes the Next Waitlisted Customer**

- **Actor:** System
- **Preconditions:** A `CONFIRMED` `SessionBooking` on a session with a non-empty waitlist is cancelled.
- **Trigger:** Cancellation of a confirmed booking (customer- or admin-initiated).
- **Main Flow:**
  1. System frees the vacated capacity unit.
  2. System finds the lowest `waitlistPosition` `WAITLISTED` booking with `quantity ≤` freed capacity.
  3. Promotes it to `CONFIRMED`; shifts remaining waitlist positions down.
  4. Publishes `WaitlistPromoted` for Notification Context.
- **Alternative Flows:**
  - **A1: Freed capacity < next waitlisted entry's `quantity`** → Skip to the next entry that fits, or hold the capacity open if none fit (matches a common "first that fits" queue policy — worth confirming against business expectations before building).
- **Postconditions:** Waitlisted customer becomes `CONFIRMED`; notified.
- **Events Triggered:** `WaitlistPromoted` (candidate event).

### **CAND-26: Customer Enrolls in a Recurring Weekly Session**

- **Actor:** Customer or Guest (likely Customer-only in practice, given the ongoing relationship — worth confirming)
- **Preconditions:** Template exists and is active.
- **Trigger:** Customer opts into "book this every week" instead of a single session.
- **Main Flow:**
  1. Customer confirms enrollment start date.
  2. System creates `RecurringEnrollment(status=ACTIVE)`.
  3. For each upcoming matching `ClassSession` within the current generation horizon, system creates a `SessionBooking(seriesId = enrollmentId)`, respecting capacity/waitlist per occurrence (CAND-22/CAND-24 rules apply per instance).
  4. As new sessions materialize (CAND-13), the enrollment attaches a fresh `SessionBooking` to each.
- **Alternative Flows:**
  - **A1: A given occurrence is full** → That occurrence's `SessionBooking` is `WAITLISTED`, same as a one-off booking; the enrollment itself stays `ACTIVE`.
- **Postconditions:** Standing enrollment exists; bookings appear automatically per occurrence.
- **Events Triggered:** None on the enrollment itself; each generated `SessionBooking` triggers CAND-22/24's events.

### **CAND-27: Customer Cancels a Single Occurrence of a Recurring Enrollment**

- **Actor:** Customer
- **Preconditions:** `RecurringEnrollment` is `ACTIVE`; a `SessionBooking` with matching `seriesId` exists for the target occurrence.
- **Trigger:** Customer cancels just next week's class, keeping the standing enrollment.
- **Main Flow:**
  1. Customer picks the specific occurrence to skip.
  2. System cancels only that `SessionBooking`; `RecurringEnrollment` stays `ACTIVE`.
  3. Freed capacity triggers CAND-25 if a waitlist exists for that occurrence.
- **Postconditions:** One occurrence skipped; series continues.
- **Events Triggered:** Same as a normal `SessionBooking` cancellation.

### **CAND-28: Customer Cancels an Entire Recurring Enrollment**

- **Actor:** Customer
- **Preconditions:** `RecurringEnrollment` is `ACTIVE`.
- **Trigger:** Customer stops the standing enrollment entirely.
- **Main Flow:**
  1. System sets `RecurringEnrollment.status = CANCELLED`.
  2. Future `SessionBooking`s stop being generated for this series; already-existing future ones for already-materialized sessions are cancelled (freeing capacity, triggering CAND-25 per session).
- **Postconditions:** Enrollment and its future bookings cancelled.
- **Events Triggered:** Same per-session cancellation events as CAND-27, fired once per affected future session.

---

## Group F — Cross-Cutting / System

### **CAND-29: System Computes Availability Scoped to a Resource or Bundle**

- **Actor:** System
- **Preconditions:** Service has `resourceRequirements` referencing one or more resources.
- **Trigger:** Any availability query (today's UC-011 equivalent) for a resource-scoped or bundled service.
- **Main Flow:**
  1. `IBookingAvailabilityPort` is queried with `tenantId` + `resourceId(s)` instead of `tenantId` alone.
  2. For a bundle, a slot is available only if **every** required resource is simultaneously free.
  3. For `AUTO_FUNGIBLE_POOL`, a slot is available if **any** pool member is free (union, not intersection).
- **Postconditions:** Extends today's `AvailabilityService` (`availability.service.ts`) rather than replacing it.
- **Events Triggered:** None (read path).

### **CAND-30: System Applies Resource Turnover and Leg Transition Gaps**

- **Actor:** System
- **Preconditions:** Resource has `turnoverMinutes > 0`, and/or the service has legs with `transitionGapAfterMinutes > 0`.
- **Trigger:** Same availability computation as CAND-29.
- **Main Flow:**
  1. For a flat service: effective gap before the next booking on a resource = `max(service.bufferAfterMinutes, resource.turnoverMinutes)`.
  2. For a legged service: each leg's own resource turnover applies at that leg's resource; `transitionGapAfterMinutes` is added between legs regardless of resource turnover.
- **Postconditions:** Candidate slots correctly reflect both cleanup time and customer transition time, without conflating the two (discovery doc §7).
- **Events Triggered:** None.

### **CAND-31: System Rejects Overlapping Bookings Across a Shared Bundled Resource**

- **Actor:** System
- **Preconditions:** Two different services both declare a requirement on the same `EQUIPMENT`/`ROOM` resource (e.g. one X-ray machine used by two different appointment types).
- **Trigger:** A booking attempt for Service B would overlap an already-approved booking for Service A, where both reference the same resource.
- **Main Flow:**
  1. Availability computation for Service B includes existing approved bookings/sessions against the *shared resource*, regardless of which service created them.
  2. Overlapping candidate slots are excluded.
- **Postconditions:** A resource's exclusivity holds across service boundaries, not just within one service's own bookings — the resource, not the service, is the unit of exclusivity.
- **Events Triggered:** None.

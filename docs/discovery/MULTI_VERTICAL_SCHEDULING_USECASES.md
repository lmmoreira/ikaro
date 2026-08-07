# Discovery: Multi-Vertical Scheduling — Candidate Use Cases

**Status:** Discovery — candidate/speculative. Labeled `CAND-XX`, never `UC-XXX`, so this list can never collide with or be mistaken for the canonical index in `docs/04-USE_CASES.md`. Nothing here is committed to a milestone; promote individual candidates into `docs/04-USE_CASES.md` with real UC numbers only if/when a milestone is actually drafted for one of these verticals.

**Companion doc:** `MULTI_VERTICAL_SCHEDULING.md` — the domain model these use cases are derived from.
**Companion doc:** `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md` — the physical schema these use cases' mechanisms (idempotency keys, atomic capacity checks, exclusion constraints) are grounded against.
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
  1. System shows future approved appointments and materialized sessions referencing this resource as explicit commitments.
  2. System sets `isActive = false` immediately for new scheduling and stops future generation using the resource.
  3. Manager receives a resolution worklist for the existing commitments; none is silently cancelled or demoted.
- **Alternative Flows:**
  - **A1: Resource is part of an active `ClassScheduleTemplate`'s bundle** → System ends/deactivates that template for future generation and lists any materialized future sessions for resolution.
- **Postconditions:** Resource no longer offered for new bookings; existing history intact.
- **Events Triggered:** None.

### **CAND-03b: Staff Deactivation Cascades to the Wrapping STAFF Resource**

> Added to close a coverage gap found during a pre-promotion audit (2026-08-07): `MULTI_VERTICAL_SCHEDULING.md` §9 item 11 already decided "Staff deactivation deactivates the wrapping STAFF resource for new scheduling," but no candidate ever covered the *automatic* trigger — CAND-03 only covers a manager directly, manually deactivating a `Resource`. This is the system-side cascade from the existing canonical `UC-029` (Admin deactivates staff member), distinct from CAND-03's manual path the same way CAND-13 (system-generated sessions) is distinct from CAND-11 (manager-authored template).

- **Actor:** System
- **Preconditions:** A `Staff` row is deactivated via `UC-029`, and a `Resource` row exists with `type = STAFF` and `refId` pointing at that staff member.
- **Trigger:** `StaffDeactivated` event (published by `UC-029`) is consumed by the Booking Context.
- **Main Flow:**
  1. System locates the `Resource` row with `refId = staffId` for the deactivated staff member.
  2. System applies the exact same effect as CAND-03's manual deactivation to that `Resource`: `isActive = false` for new scheduling, future generation using it stops, and any active `ClassScheduleTemplate` bundle containing it is ended for future generation (CAND-03's A1).
  3. Existing approved appointments and materialized sessions referencing the resource remain explicit commitments — the manager gets the same resolution worklist CAND-03 produces, not a silent cancellation.
- **Alternative Flows:**
  - **A1: No `Resource` row wraps this staff member** (e.g. a tenant that never adopted the multi-vertical model, or a staff member who was never scheduling-relevant) → No-op; nothing to cascade.
- **Postconditions:** A deactivated staff member's wrapping resource is deactivated for new work in the same transaction-adjacent step as their `Staff` row, never left stale.
- **Events Triggered:** None new — consumes `StaffDeactivated`; produces the same (lack of) events CAND-03 does.

### **CAND-04: Manager Creates a Resource-Scoped Schedule Closure**

> Grounded on review (2026-07-29) against the real `plan/journey/staff/prototypes/horarios/00-schedule-next.html` — a per-tenant week timeline of bookings, whose FAB "Bloquear período" is exactly where today's tenant-wide `ScheduleClosure` gets created. This candidate is that same screen, resourceId-scoped instead of tenant-wide. Resource working hours, openings, and closures remain manager-owned configuration; staff absence self-service is deliberately out of scope until it can be designed as a distinct request/approval workflow.

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
- **Preconditions:** Resource exists; the target day is inside the tenant's recurring business-hours window and is closed only in the resource's own `workingHours`.
- **Trigger:** Manager opens a normally-closed day for one resource only (e.g. a stylist takes an extra Saturday).
- **Main Flow:** Same as today's tenant-wide `ScheduleOpening` (UC-010), with `resourceId` set.
- **Alternative Flows:** Same as UC-010's.
- **Postconditions:** Only that resource's calendar opens for the date, never outside the tenant’s effective hours; the rest of the tenant is unaffected.
- **Events Triggered:** None.

---

## Group B — Service Configuration (Staff or Manager)

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

> **A second bundle example, non-dentist:** the same mechanism covers a gym personal-training session needing both a trainer (`STAFF`, customer-chosen) and a specific machine (`EQUIPMENT`, e.g. a Smith machine, `AUTO_ANY`) — `resourceRequirements = [{ type: STAFF, selectionMode: CUSTOMER_CHOICE }, { type: EQUIPMENT, selectionMode: AUTO_ANY }]`. Included so this candidate doesn't read as dentist-specific; the compound-bundle shape (model #7) applies to any vertical where two *different* resource types must be free for the same window.

### **CAND-08: Manager Configures Service Legs (Sequential Multi-Stage)**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Service exists.
- **Trigger:** Manager switches the service from "single resource" to "multi-stage journey."
- **Main Flow:**
  1. Manager adds ordered legs, each with a name, duration, one or more resource requirements, and transition-gap-after.
  2. System computes and displays the total appointment span (`sum(leg durations) + sum(transition gaps)`), distinct from total billable time.
  3. System clears `resourceRequirements`/`bufferAfterMinutes` on the service (mutually exclusive with `legs`, per §5 of the discovery doc).
- **Alternative Flows:**
  - **A1: Fewer than 2 legs** → System blocks: a single leg is just the flat model (CAND-06), not this flow.
- **Postconditions:** Booking this service locks every leg's resource(s) independently for that leg's own sub-window.
- **Events Triggered:** None.

> **A leg can need more than one resource at once, not just one:** Jornada Spa Vitta's middle leg (Massagem, `manager-02-service-resource-config.html`'s legs panel) needs both a therapist (customer-chosen between Renata Souza and Maria Santos) *and* a room (Sala de Terapia, system-assigned) for the same sub-window — the exact two resources `Massagem Relaxante`'s own bundle (CAND-07) uses, deliberately, to demonstrate CAND-31's cross-service exclusivity from the other direction. Corrected 2026-08-05 — see `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md` §6 item 13.

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
  3. If `SESSION`: manager declares this service's eligible resource pool per slot (e.g. an instructor slot, a room slot, optionally an equipment slot) — same eligibility checklist screen `CAND-06` uses for the flat case, just without a selection mode, since nothing here resolves dynamically per booking. No `resourceRequirements` is set on the `Service` itself; the manager is then prompted to create a `ClassScheduleTemplate` next (CAND-11), which picks exactly one resource per slot from this pool.
- **Alternative Flows:**
  - **A1: Manager tries to change `bookingModel` on a service with existing bookings** → System blocks; booking model is immutable once the service has history.
- **Postconditions:** Service exists with a fixed `bookingModel`; if `SESSION`, its per-slot eligible pool is declared and ready for `CAND-11` to draw from.
- **Events Triggered:** None.

> **Corrected 2026-08-05:** step 3 originally said nothing about a pool at all — resource eligibility for a `SESSION` service was assumed to live on the `ClassScheduleTemplate` instead (CAND-11), which turned out to have no step that ever declared it either. Moving the pool here, to the service level, means Vitta Studio's "Aula de Pilates" declares its eligible instructors (Camila, Ana Beatriz) and rooms (Estúdio 1, Estúdio 2) *once* — both `tpl_pilates_estudio1` and `tpl_pilates_estudio2` (CAND-11) then each pick one name from that same shared list, rather than the pool needing separate re-declaration per template. See `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md` §6 item 15 for the full correction.

### **CAND-10b: Manager Configures a Session Service's Guest Access Policy**

> Added to close a coverage gap found during a pre-promotion audit (2026-08-07): `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md` §3 already defines `services.guest_access_enabled`/`guest_approval_mode`/`guest_trial_policy`, and `CAND-33`/`CAND-34` already *consume* those fields, but no candidate ever showed a manager *setting* them — `CAND-10` stops at declaring the eligible resource pool (step 3) and never touches guest policy.

- **Actor:** Staff (STAFF or MANAGER — same rationale as CAND-06: matches today's Service management, not manager-exclusive)
- **Preconditions:** Service exists, `bookingModel = SESSION`.
- **Trigger:** Manager configures whether and how guests (non-contract customers) can book this SESSION service, either during `CAND-10`'s creation flow or later as an edit.
- **Main Flow:**
  1. Manager toggles `guest_access_enabled` (default off — authenticated customer access via `ClassAccessContract` is the SESSION default per §11 of the discovery doc).
  2. If enabled, manager picks `guest_approval_mode`: `MANUAL` (every guest reservation needs staff approval, `CAND-34`) or `AUTO` (guest reservations self-confirm when capacity fits, no staff step).
  3. Manager picks `guest_trial_policy`: `NONE` or `FIRST_FREE_PER_EMAIL` (one free trial seat per unique email, tenant-wide, enforced by `guest_class_trial_redemptions`' `UNIQUE(tenant_id, normalized_email)`).
  4. System saves the three fields on `Service`.
- **Alternative Flows:**
  - **A1: Manager disables `guest_access_enabled` on a service with `PENDING_APPROVAL`/`PENDING_EMAIL_VERIFICATION` guest reservations already in flight** → Existing in-flight reservations are honored to their natural conclusion (approved/rejected/expired per `CAND-34`/`CAND-36`); only new guest requests are blocked going forward.
- **Postconditions:** `CAND-33`'s guest-verification flow and `CAND-34`'s approval flow have a real, manager-set configuration to read instead of an implicit default.
- **Events Triggered:** None (config-only, same as `CAND-06`).

---

## Group C — Class/Session Management (Staff or Manager)

### **CAND-11: Manager Creates a Recurring Class Schedule Template**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Service exists with `bookingModel = SESSION`.
- **Trigger:** Manager sets up the class's recurring pattern.
- **Main Flow:**
  1. For each slot in this service's already-declared eligible pool (CAND-10 step 3 — e.g. instructor, room, optionally equipment), manager picks exactly one resource. The picker only ever shows that pool's members, never every resource of that type tenant-wide — `resourceIds` ends up an open-ended array, not capped at 2, but each entry is one pick from its own slot's pool.
  2. Manager sets a recurrence rule (days of week, start time — duration comes from `Service.durationMinutes`).
  3. Manager sets `capacity`.
  4. System creates the `ClassScheduleTemplate`, `isActive = true`.
  5. System (async) begins generating `ClassSession` rows on the rolling horizon (CAND-13).
- **Alternative Flows:**
  - **A1: Chosen resources are already committed to an overlapping template** → System blocks: e.g. the same room can't host two recurring classes at the same time.
  - **A2: A chosen resource already has an `APPROVED` appointment-style `Booking` matching the new template's recurrence pattern** (e.g. Camila already has a standing Tuesday 08:00 haircut booked before this template is created) → System blocks creation, listing the conflicting booking(s); manager must resolve (reschedule the booking or pick a different resource/time) before the template can be created. This is a bounded, finite scan — only bookings up to `tenants.settings.booking.maxBookingAdvanceDays` out can exist yet, not an unbounded future.
  - **A3: Requested `capacity` exceeds the lowest `maxCapacity` ceiling among the template's chosen `ROOM`/capacity-bearing `EQUIPMENT` resources** (per `MULTI_VERTICAL_SCHEDULING.md` §9 item 8 — `LOCATION`/`ROOM` and capacity-bearing `EQUIPMENT` may define a physical ceiling) → System blocks creation; manager must lower capacity or pick a higher-ceiling resource. `STAFF` resources never carry a `maxCapacity` (see CAND-04's precondition on `manager-04`), so only room/equipment ceilings are checked.
- **Postconditions:** Template active; sessions begin appearing on the booking calendar.
- **Events Triggered:** None.

> **Concrete example (model #6 — independent instances, not a pool):** a bigger Vitta Studio location runs Pilates in 2 rooms at once — `tpl_pilates_estudio1` (Camila, Estúdio 1) and `tpl_pilates_estudio2` (Ana Beatriz, Estúdio 2), same service, same recurrence, two independent templates each with its own capacity/roster (see `MULTI_VERTICAL_SCHEDULING.md` §6 for the full worked example). Equipment is optional on the bundle: this Pilates example uses none, but a CrossFit template would check it to reserve a shared `Kit Halteres` from `manager-01`'s fungible `EQUIPMENT` pool (CAND-17) alongside its instructor and room.

> **Concrete example (model #13 — capacity as Service×Resource, not Resource alone):** Bruno Alves is a `STAFF` resource who is both a hairdresser (`CAND-16`, `resourceRequirements = [{type: STAFF, selectionMode: CUSTOMER_CHOICE}]`, implicit capacity 1 — appointment-style has no capacity field at all) *and* the CrossFit instructor on `tpl_crossfit` (this candidate, `capacity = 20`). Nothing on `Resource` itself declares "Bruno's capacity" — capacity is never a property of the resource; it's declared per-template (this step) for SESSION services and is implicitly 1 for APPOINTMENT services. The same `resourceId` therefore participates in two completely different capacity shapes depending on which service/template is asking, with `resource_occupancy` (not `Resource.maxCapacity`) as the one shared mechanism that still keeps both families from double-booking him (`CAND-31`).

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
  - **A1: A resource is closed or outside its current hours for that occurrence** → Session is not generated. Existing materialized sessions remain explicit commitments when a later schedule change makes them exceptional.
  - **A2: A resource has an overlapping approved appointment** → Session generation is rejected by the shared occupancy constraint; manager resolves the already-existing commitment rather than creating an impossible session.
- **Postconditions:** `ClassSession` rows exist far enough ahead for customers to book into.
- **Events Triggered:** None.

### **CAND-13b: Staff or Manager Views a List of Upcoming Class Sessions**

> Added on review (2026-07-29): missing entirely until now. CAND-13 covers the *system* generating sessions and CAND-14/15 cover acting on *one specific* session, but nothing covered the list in between — mirrors `Agenda`'s own real shape (a list first, e.g. `staff/prototypes/agenda/00-agenda.html`, then a detail page per item), which this had skipped straight past.

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** At least one active `ClassScheduleTemplate` has generated future `ClassSession` rows.
- **Trigger:** Staff/manager opens "Turmas."
- **Main Flow:**
  1. System lists upcoming `ClassSession`s grouped by day (today first, then upcoming days), each showing service name, time, resources, and `capacity - reservedCount` remaining seats.
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
  - **A1: New capacity < current `reservedCount`** → System rejects the edit. Staff must explicitly resolve reservations before reducing capacity; confirmed/pending guests are never silently demoted or cancelled.
  - **A2: New capacity exceeds the lowest `maxCapacity` ceiling among the session's `resourceIds`** (same rule as `CAND-11` A3, checked again here since a session's resources can differ from its template's after an override) → System rejects the edit.
- **Postconditions:** This session reflects the override; future template-generated sessions are unaffected.
- **Events Triggered:** None (unless resolving A1 requires notifying affected customers — see CAND-15's event).

### **CAND-15: Manager Cancels a Class Session With Existing Bookings**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** `ClassSession` exists with ≥ 1 `ClassSessionBooking` in `CONFIRMED` or `WAITLISTED` status.
- **Trigger:** Manager cancels a session (e.g. instructor unavailable, no substitute).
- **Main Flow:**
  1. Manager confirms cancellation.
  2. System sets `ClassSession.status = CANCELLED`.
  3. System transitions every active (`PENDING_APPROVAL`, `CONFIRMED`, or `WAITLISTED`) `ClassSessionBooking` referencing it to `CANCELLED`.
  4. System publishes `ClassSessionCancelled` for Notification Context to inform affected customers.
- **Alternative Flows:**
  - **A1: Financial treatment** → No refund/credit workflow exists in this discovery: guest payment is in person at close-out, and a closed-out session is not subsequently cancelled.
- **Postconditions:** Session and its bookings cancelled; customers notified.
- **Events Triggered:** `ClassSessionCancelled` (candidate event — not yet in `docs/03-DOMAIN_EVENTS.md`).

> See CAND-32 for cancelling a date range or an entire template forward, rather than one already-materialized session.

### **CAND-15b: Staff Closes Out a Class Session (Marks Attendance)**

> **Superseded by CAND-37.** Retained only for numbering continuity; CAND-37 is the authoritative attendee-level attendance and in-person-payment flow.

> Historical rationale only. The final model is: parent reservations close as `CLOSED`; individual attendee rows carry `PRESENT`/`NO_SHOW`; close-out is staff-triggered and includes due in-person guest payment. See CAND-37.

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** `ClassSession.endTime` has passed; `status = SCHEDULED`.
- **Trigger:** Staff opens the session's roster after it has happened to review attendance.
- **Main Flow:**
  1. Roster shows every named attendee from an active reservation pre-marked as attended by default.
  2. Staff flags individual attendee exceptions; a guest group can have mixed attendance.
  3. Staff clicks a single close-out action (e.g. "Fechar turma").
  4. System records attendee `PRESENT`/`NO_SHOW`, closes each parent reservation, and records any due in-person guest payment atomically.
  5. System publishes `ClassSessionBookingCompleted` only for eligible attended contract customers.
- **Alternative Flows:**
  - **A1: Staff never closes out the session** → Session remains `AWAITING_ATTENDANCE` as a visible Turmas task; the system never guesses attendance.
- **Postconditions:** Every parent reservation reaches `CLOSED`; attendee rows retain the individual outcome.
- **Events Triggered:** `ClassSessionBookingCompleted` (candidate event, per booking — not yet in `docs/03-DOMAIN_EVENTS.md`).

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

> **`EQUIPMENT` example, not just `ROOM`:** the precondition already covers both types, but every worked example above is a room (courts, wash bays). A CrossFit box with 3 identical rowing ergs is the same fungible pool, just typed `EQUIPMENT`: `resourceRequirements = [{ type: EQUIPMENT, selectionMode: AUTO_FUNGIBLE_POOL, resourcePoolIds: [erg1, erg2, erg3] }]`. Calendar shows "Remo — 30min" as open if any of the 3 ergs is free; customer never learns which one. Structurally distinct from CAND-07/18's bundle: one resource *type*, N interchangeable units, no second resource type involved.

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
  - **A1: More than one staff member is free for the chosen slot** → System selects the eligible staff member with the least already-locked workload on that tenant-local day; `resourceId` is the stable tie-breaker.
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
  - **A2: A bundle member becomes unavailable between page load and submit (race)** → System re-validates the whole bundle atomically at submit time, same mechanism as `CAND-19` A1; rejects with "part of this booking is no longer available."
- **Postconditions:** Booking's `resourceAssignments` lists every locked resource.
- **Events Triggered:** `BookingRequested`.

### **CAND-19: Customer Books a Multi-Leg Appointment**

- **Actor:** Customer or Guest
- **Preconditions:** Service has `legs.length ≥ 2` (e.g. spa journey).
- **Trigger:** Customer selects the service.
- **Main Flow:**
  1. Customer picks `CUSTOMER_CHOICE` resources per leg where applicable (e.g. which massage therapist).
  2. Calendar shows start times where the **entire chained itinerary** fits — every leg's resource(s) are free at that leg's computed sub-window, honoring transition gaps.
  3. Customer books; confirmation shows the full itinerary (per-leg time + resource(s)), same shape as the `legAssignments` example in the discovery doc §5.
- **Alternative Flows:**
  - **A1: A middle leg's resource(s) become unavailable between page load and submit** → System re-validates the whole chain atomically at submit time; rejects with "one part of this journey is no longer available."
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
  1. System lists upcoming `ClassSession`s for the service, each showing `capacity - reservedCount` remaining spots.
  2. Sessions at 0 remaining show "Full — join waitlist" instead of a book button.
- **Alternative Flows:**
  - **A1: No upcoming sessions in range** → "No upcoming classes" shown; consistent with today's "no available slots" messaging.
- **Postconditions:** None (read-only browse).
- **Events Triggered:** None.

### **CAND-22: Contract Customer Books Into a Session (Single Unit)**

- **Actor:** Customer
- **Preconditions:** `ClassSession` exists, `reservedCount < capacity`, and Customer has an active ClassAccessContract covering the session's service/date.
- **Trigger:** Customer clicks "Book" on a session with remaining capacity.
- **Main Flow:**
  1. Customer confirms contact details (same guest/authenticated split as today's UC-001/UC-002).
  2. System atomically checks `reservedCount < capacity` and creates the contract customer's one-seat `ClassSessionBooking(status=CONFIRMED)`, incrementing `reservedCount`.
  3. Confirmation shown/sent.
- **Alternative Flows:**
  - **A1: Session fills between page load and submit (race)** → System re-checks capacity at write time; if now full, falls through to CAND-24 (waitlist) instead of failing outright.
  - **A2: Customer has no active `ClassAccessContract` covering this session's service/date** → Booking is blocked (this flow requires the precondition above). Customer is directed to the guest path (`CAND-33`, if `guest_access_enabled` for the service — `CAND-10b`) or told to arrange a contract; mirrors how `CAND-33` A2 blocks the reverse case (an authenticated customer trying to use the guest path to bypass this same check).
- **Postconditions:** `ClassSessionBooking` exists, `CONFIRMED`.
- **Events Triggered:** `ClassSessionBookingConfirmed` (candidate event, mirrors `BookingRequested`'s role for Notification Context).

### **CAND-23: Verified Guest Books Multiple Named Units in One Action**

- **Actor:** Guest
- **Preconditions:** Guest path is enabled; guest has verified email; `capacity - reservedCount ≥ requested quantity`.
- **Trigger:** Customer requests N spots in one checkout (e.g. "2 bikes, me + a friend").
- **Main Flow:**
  1. Guest sets quantity (bounded by remaining capacity) and gives a name for every attendee.
  2. After email verification, system atomically checks remaining ≥ quantity, creates one named-attendee guest reservation, and increments `reservedCount` by N when it enters `PENDING_APPROVAL` or `CONFIRMED`.
- **Alternative Flows:**
  - **A1: Requested quantity exceeds remaining capacity** → System caps the selectable quantity in the UI to what's left; never offers an invalid N.
- **Postconditions:** One `ClassSessionBooking` row consuming N units — distinct from N separate customer bookings filling the same class.
- **Events Triggered:** `ClassSessionBookingConfirmed`.

### **CAND-23b: Customer Cancels a Single (Non-Recurring) Class Session Booking**

> Added 2026-08-05 — this is the direct SESSION-family analog of `UC-007`, and until now the single most basic cancellation flow was entirely absent from this group: nothing let a customer cancel a plain `ClassSessionBooking` made via `CAND-22`/`CAND-23`. `CAND-27` only cancels *one occurrence of a `RecurringEnrollment`* (its precondition requires a `seriesId` to already exist) — Fernanda's booking (`sb_1`, `seriesId = null`, `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md` §2) had no cancellation path at all until this candidate. Introduces a new tenant setting, `tenants.settings.booking.classCancellationWindowHours`, deliberately separate from `Booking`'s own `cancellationWindowHours` — a studio/gym's late-cancel window for a class is commonly different, often shorter, than a private appointment's, and a capacity-constrained class with an active waitlist has a real cost a private 1:1 slot doesn't share the same way (see `MULTI_VERTICAL_SCHEDULING.md` §6 "Cancellation").

- **Actor:** Customer. Guests ask staff to cancel; they never self-cancel from the public/customer surface.
- **Preconditions:** `ClassSessionBooking` exists, `status = CONFIRMED`, `seriesId = null` (a plain one-off booking — cancelling one occurrence of a *recurring* enrollment is `CAND-27`'s job; cancelling the whole enrollment is `CAND-28`'s). Time to `ClassSession.startTime` ≥ `tenants.settings.booking.classCancellationWindowHours`.
- **Trigger:** Customer clicks "Cancelar" on an upcoming class booking (e.g. in "Minha Conta").
- **Main Flow:**
  1. System validates `session.startTime − now() ≥ tenants.settings.booking.classCancellationWindowHours`. If not, returns error (A1).
  2. Customer sees confirmation: "Cancelar esta aula?"
  3. Customer confirms.
  4. System transitions the booking `CONFIRMED → CANCELLED` and frees its `quantity` back to `ClassSession.reservedCount`.
  5. System promotes the earliest-queued `WAITLISTED` booking on the same session, if any (`CAND-25`).
  6. System publishes `ClassSessionBookingCancelled` (candidate event, mirrors `BookingCancelled`).
  7. Customer sees success: "Sua vaga foi cancelada."
- **Alternative Flows:**
  - **A1: Inside the cancellation window** → System shows error: "Cancelamentos devem ser feitos com pelo menos `classCancellationWindowHours` horas de antecedência."
  - **A2: Booking is `WAITLISTED`, not `CONFIRMED`** → No time restriction — a waitlist entry occupies no real capacity, so it can be withdrawn any time before the session starts. Transitions straight to `CANCELLED`; no promotion is triggered (nothing to free).
  - **A3: Booking has `seriesId != null`** → System redirects to `CAND-27` (skip one occurrence) or `CAND-28` (cancel the whole enrollment) — this flow is for one-off bookings only.
  - **A4: Staff/manager cancels on the customer's behalf** (e.g. a phone request) → Same mechanism, no separate use case: `STAFF | MANAGER` can perform this from the session roster (`staff-02-session-roster.html`), bypassing the customer-facing copy but still subject to the same `classCancellationWindowHours` check — mirrors `UC-008`'s admin-initiated pattern for `Booking`.
- **Postconditions:** Booking is `CANCELLED`; freed capacity offered to the waitlist if one exists.
- **Events Triggered:** `ClassSessionBookingCancelled` (candidate event, not yet in `docs/03-DOMAIN_EVENTS.md`).

### **CAND-24: Customer Joins a Waitlist When a Session Is Full**

- **Actor:** Customer or Guest
- **Preconditions:** `ClassSession.reservedCount = capacity`.
- **Trigger:** Customer clicks "Join waitlist" on a full session.
- **Main Flow:**
  1. System creates `ClassSessionBooking(status=WAITLISTED)`.
  2. Customer is told their position ("You're #3 on the waitlist") — computed at read time from queue order (earliest `createdAt` first among `WAITLISTED` rows on this session), not a stored/assigned field (corrected 2026-08-05, see `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md` §6 item 8).
- **Alternative Flows:**
  - **A1: Customer already has a `CONFIRMED` or `WAITLISTED` booking on this session** → Blocked, no duplicate entries.
- **Postconditions:** Waitlisted `ClassSessionBooking` exists.
- **Events Triggered:** `ClassSessionBookingWaitlisted` (candidate event).

### **CAND-25: System Auto-Promotes the Next Waitlisted Customer**

- **Actor:** System
- **Preconditions:** A `CONFIRMED` `ClassSessionBooking` on a session with a non-empty waitlist is cancelled.
- **Trigger:** Cancellation of a confirmed booking (customer- or admin-initiated).
- **Main Flow:**
  1. System frees the vacated capacity unit.
  2. System finds the earliest-queued (lowest `createdAt`) `WAITLISTED` booking with `quantity ≤` freed capacity.
  3. Promotes it to `CONFIRMED` — no position bookkeeping to shift; queue order is derived at read time, never stored (§6 item 8 of the data-model doc).
  4. Publishes `WaitlistPromoted` for Notification Context.
- **Alternative Flows:**
  - **A1: Freed capacity < next waitlisted entry's `quantity`** → Skip it and continue in queue order until a fitting entry is found; never split a group. Continue promoting while another entry fits the remaining capacity.
  - **A2 (considered, deliberately not built): a response/decline window before promotion is final.** Promotion is immediate and unconditional — no "confirm within N hours or we move to the next person" step. Resolved 2026-08-05, `MULTI_VERTICAL_SCHEDULING.md` §9 item 15: keeps this extension's scope contained, and mirrors how today's booking flow also has no accept-step on a fresh booking.
- **Postconditions:** Waitlisted customer becomes `CONFIRMED`; notified.
- **Events Triggered:** `WaitlistPromoted` (candidate event).

### **CAND-25b: System Auto-Cancels Unpromoted Waitlist Entries When a Session Ends**

> Added on request (2026-08-05): a `ClassSessionBooking` still `WAITLISTED` when its `ClassSession` starts (never promoted) had no defined fate — nothing ever cleaned it up. Unlike `CAND-15b`'s attendance marking, this needs zero human judgment (a waitlist entry for a class that already happened is simply moot), so it's the mechanical counterpart: purely automatic, no staff step, same "runs on a schedule with no one in the loop" shape as `CAND-13`'s generator.

- **Actor:** System
- **Preconditions:** `ClassSession.endTime` has passed; ≥ 1 `ClassSessionBooking` on it is still `WAITLISTED`.
- **Trigger:** Same time-based check as `CAND-13`'s generation job (or piggybacked onto it).
- **Main Flow:**
  1. System finds every `ClassSessionBooking` with `status = WAITLISTED` on a session whose `endTime` has passed.
  2. Transitions each to `CANCELLED`.
- **Alternative Flows:**
  - **A1: No `WAITLISTED` entries exist on the ended session** → No-op; nothing to cancel.
- **Postconditions:** No `WAITLISTED` row persists past the session it was waiting on.
- **Events Triggered:** None (routine cleanup, same as `CAND-01`'s config-only postconditions).

### **CAND-26: Customer Enrolls in a Recurring Weekly Session**

- **Actor:** Customer
- **Preconditions:** Customer has an active ClassAccessContract covering the template's SESSION service; template exists and is active. Enrollment cannot extend beyond the contract's inclusive end date.
- **Trigger:** Customer opts into "book this every week" instead of a single session.
- **Main Flow:**
  1. Customer confirms enrollment start date.
  2. System creates `RecurringEnrollment(status=ACTIVE)` ending on or before the contract end date.
  3. For each upcoming matching `ClassSession` within the current generation horizon, system creates a `ClassSessionBooking(seriesId = enrollmentId)`, respecting capacity/waitlist per occurrence (CAND-22/CAND-24 rules apply per instance).
  4. As new sessions materialize (CAND-13), the enrollment attaches a fresh `ClassSessionBooking` to each.
- **Alternative Flows:**
  - **A1: A given occurrence is full** → That occurrence's `ClassSessionBooking` is `WAITLISTED`, same as a one-off booking; the enrollment itself stays `ACTIVE`.
- **Postconditions:** Standing enrollment exists only for the qualifying-contract period; contract expiry/cancellation ends it and its future reservations. A later contract never revives it implicitly.
- **Events Triggered:** None on the enrollment itself; each generated `ClassSessionBooking` triggers CAND-22/24's events.

### **CAND-27: Customer Cancels a Single Occurrence of a Recurring Enrollment**

- **Actor:** Customer
- **Preconditions:** `RecurringEnrollment` is `ACTIVE`; a `ClassSessionBooking` with matching `seriesId` exists for the target occurrence.
- **Trigger:** Customer cancels just next week's class, keeping the standing enrollment.
- **Main Flow:**
  1. Customer picks the specific occurrence to skip.
  2. System cancels only that `ClassSessionBooking`; `RecurringEnrollment` stays `ACTIVE`.
  3. Freed capacity triggers CAND-25 if a waitlist exists for that occurrence.
- **Alternative Flows:**
  - **A1: Target occurrence's `ClassSessionBooking` is already `CANCELLED` or doesn't exist yet** (not-yet-materialized future occurrence) → Nothing to skip; system shows the occurrence as already absent from the customer's upcoming list rather than offering a cancel action on it.
  - **A2: Target occurrence's `ClassSession.startTime` has already passed** → System blocks; a past occurrence cannot be skipped after the fact, only future ones.
- **Postconditions:** One occurrence skipped; series continues.
- **Events Triggered:** Same as a normal `ClassSessionBooking` cancellation.

### **CAND-28: Customer Cancels an Entire Recurring Enrollment**

- **Actor:** Customer
- **Preconditions:** `RecurringEnrollment` is `ACTIVE`.
- **Trigger:** Customer stops the standing enrollment entirely.
- **Main Flow:**
  1. System sets `RecurringEnrollment.status = CANCELLED`.
  2. Future `ClassSessionBooking`s stop being generated for this series; already-existing future ones for already-materialized sessions are cancelled (freeing capacity, triggering CAND-25 per session).
- **Alternative Flows:**
  - **A1: Enrollment is already `CANCELLED`** → No-op; idempotent, not an error.
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
  4. "Free" also excludes any `ClassScheduleTemplate` (discovery §6) for that resource where `isActive = true`, the candidate date falls within `[validFrom, validUntil]` (open-ended if `null`), **and** the recurrence rule produces an occurrence at the candidate time — checked against the template's rule directly, not against materialized `ClassSession` rows, since a not-yet-generated future occurrence is still a real commitment. A candidate date outside `[validFrom, validUntil]`, or against a deactivated template, is never blocked by this step — only its already-materialized `ClassSession` rows (if any) still count via steps 1–3.
- **Alternative Flows:**
  - **A1: No active resource of the required type exists for the service** (e.g. every eligible `STAFF` resource was deactivated) → Query returns zero available slots, same shape as today's "no availability" result; not an error.
  - **A2: A `resourceId` in the query doesn't belong to the querying tenant** → Excluded by the mandatory `tenantId` scoping in step 1; never reaches steps 2–4. Structural guard, not a runtime branch — restated here because `CAND-31` (the highest-risk consumer of this port) depends on it holding.
- **Postconditions:** Extends today's `AvailabilityService` (`availability.service.ts`) rather than replacing it.
- **Events Triggered:** None (read path).

> **Cross-family example:** Camila Duarte is both a hairdressing `STAFF` resource (APPOINTMENT) and the instructor on a Pilates `ClassScheduleTemplate` (SESSION) recurring Mon/Wed/Fri 08:00. A haircut request for her at Monday 08:00 must be rejected even 80 days out, before any `ClassSession` row for that date exists — step 4 evaluates her template's recurrence rule directly against the candidate time, rather than waiting for a materialized session to "claim" it first.

### **CAND-30: System Applies Resource Turnover and Leg Transition Gaps**

- **Actor:** System
- **Preconditions:** Resource has `turnoverMinutes > 0`, and/or the service has legs with `transitionGapAfterMinutes > 0`.
- **Trigger:** Same availability computation as CAND-29.
- **Main Flow:**
  1. For a flat service: effective gap before the next booking on a resource = `max(service.bufferAfterMinutes, resource.turnoverMinutes)`.
  2. For a legged service: each leg's own resource turnover applies at that leg's resource; `transitionGapAfterMinutes` is added between legs regardless of resource turnover.
- **Alternative Flows:**
  - **A1: Resource has `turnoverMinutes = 0` and the service has no legs (or `transitionGapAfterMinutes = 0` on every leg)** → No extra gap applied beyond `service.bufferAfterMinutes`; behaves identically to today's single-number buffer model.
- **Postconditions:** Candidate slots correctly reflect both cleanup time and customer transition time, without conflating the two (discovery doc §7).
- **Events Triggered:** None.

### **CAND-31: System Rejects Overlapping Bookings Across a Shared Resource — Same-Family or Cross-Family**

> Broadened on review (2026-08-04): originally scoped only to two APPOINTMENT-style services sharing a resource (the X-ray-machine case). The same mechanism has to cover a resource shared *across* families too — an APPOINTMENT-style service and a SESSION-style `ClassScheduleTemplate` on the same resource (Camila Duarte: hairdressing + Pilates) is the model-13 flagship scenario this discovery is built around, and it was previously ungoverned by this candidate. See `MULTI_VERTICAL_SCHEDULING.md` §6 "Cross-family resource exclusivity" for the full reasoning.

- **Actor:** System
- **Preconditions:** Two different bookable things share the same resource — either two APPOINTMENT-style services (e.g. one X-ray machine used by two different appointment types), or one APPOINTMENT-style service and one SESSION-style `ClassScheduleTemplate` (e.g. Camila Duarte as both a hairdressing resource and a Pilates instructor).
- **Trigger:** A booking or session-generation attempt would overlap an already-committed window on the shared resource, regardless of which side created that commitment.
- **Main Flow:**
  1. Availability computation for the new request is scoped to `tenantId` + the shared `resourceId`, same as `CAND-29` step 1, and includes existing approved bookings, materialized sessions, **and active template recurrence patterns** against that *shared resource*, regardless of which service or family created the commitment (`CAND-29` step 4, `CAND-11` alt A2, `CAND-13` alt A2).
  2. Overlapping candidate slots/occurrences are excluded or blocked.
- **Alternative Flows:**
  - **A1: The two windows are adjacent, not overlapping** (e.g. one ends exactly when the other starts, ignoring buffer/turnover which `CAND-30` already accounts for separately) → Not a conflict; both are allowed. This candidate rejects genuine overlap, not back-to-back scheduling.
  - **A2: The "conflicting" commitment belongs to the same booking/session being edited** (e.g. re-saving a `ClassSession` override against its own already-locked `resource_occupancy` rows) → Excluded from the conflict check; a commitment never conflicts with itself.
- **Postconditions:** A resource's exclusivity holds across service **and family** boundaries — the resource, not the service or the family, is the unit of exclusivity.
- **Events Triggered:** None.

---

## Group G — Finalized contract, guest, and lifecycle rules

> These candidates supersede the earlier discovery-stage assumptions that every session booking auto-confirms, that a group is only a `quantity`, or that recurring access can be guest-owned. They are the authoritative rules for CAND-21 through CAND-28.

### **CAND-32: Manager Cancels Template Occurrences for a Date Range or From a Date Forward**

> See CAND-15 for cancelling a single already-materialized session with existing bookings, rather than a range or a template going forward.

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Template exists; selected dates are future dates.
- **Trigger:** Manager needs to cancel one holiday range or stop a timetable from a future date.
- **Main Flow:**
  1. Manager chooses a bounded date range or “from this date forward.”
  2. For a range, system creates a persistent `ClassScheduleTemplateException` so generation will not recreate those occurrences.
  3. For “from” scope, system ends/deactivates the template at the preceding date.
  4. System cancels every already-materialized affected future session, every active reservation on it, and its locked resource occupancy; customers are notified.
- **Alternative Flows:**
  - **A1: Selected date range or "from" date is entirely in the past** → System blocks: history cannot be cancelled, only current/future occurrences (matches the precondition above; stated as an explicit guard since this is destructive and bulk).
  - **A2: An existing `ClassScheduleTemplateException` already overlaps part of the requested range** → System extends/merges the existing exception rather than creating a second overlapping one, keeping one persistent record per template instead of a fragmented history.
- **Postconditions:** Earlier/history sessions remain intact; no affected future occurrence can be regenerated.
- **Events Triggered:** `ClassSessionCancelled` per cancelled session, through the transactional outbox.

### **CAND-33: Guest Verifies Email Before Requesting a Class Seat**

- **Actor:** Guest
- **Preconditions:** The SESSION service enables guest access.
- **Trigger:** Guest enters contact details and one or more named attendees for a trial/drop-in.
- **Main Flow:**
  1. System stores a non-capacity-holding `PENDING_EMAIL_VERIFICATION` draft and emails a one-time verification link.
  2. Guest verifies the address before token expiry.
  3. System re-checks capacity. If it fits, the reservation becomes `PENDING_APPROVAL` for `MANUAL` guest policy (`CAND-10b`) or `CONFIRMED` for `AUTO` policy; otherwise it becomes `WAITLISTED`. **Decision (2026-08-07, closing a gap found in pre-promotion audit): under `AUTO` policy, a `FIRST_FREE_PER_EMAIL` entitlement is consumed at this same moment the reservation becomes `CONFIRMED`** — the identical rule `CAND-34` step 3 already applies at manual-approval time, just triggered by auto-confirmation instead of a staff action, since `AUTO` policy has no separate approval step to hang it on. Keeps entitlement-consumption a single rule ("consumed when a reservation reaches `CONFIRMED`, regardless of which policy got it there") instead of two different rules per policy. **Flagged for confirmation, not silently assumed** — the alternative would be consuming it only at close-out/attendance (`CAND-37`), which would let a `CONFIRMED` no-show avoid burning their trial; this decision treats the reservation itself, not attendance, as the qualifying moment, consistent with how capacity is already committed at `CONFIRMED` regardless of policy.
  4. Every requested seat has a named attendee row. The parent reservation is the single staff approval action under `MANUAL` policy.
- **Alternative Flows:**
  - **A1: Verification token expires before the guest confirms** → The `PENDING_EMAIL_VERIFICATION` draft is discarded; guest must restart from step 1. No capacity was ever held, so nothing to release.
  - **A2: An authenticated Customer without a qualifying contract attempts this guest path** → Blocked; contract-only access (`CAND-22`'s precondition) cannot be bypassed via the guest flow, regardless of guest policy.
  - **A3: Capacity fills while the guest is completing verification** → Reservation becomes `WAITLISTED` per step 3 rather than rejected outright — same shape as `CAND-24` for an authenticated customer.
- **Postconditions:** Only verified guest requests can reserve capacity.
- **Events Triggered:** Candidate guest-verification/guest-reservation events through the outbox.

### **CAND-34: Staff Approves or Rejects a Verified Guest Class Reservation**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Reservation is `PENDING_APPROVAL` and its guest policy is MANUAL.
- **Trigger:** A verified guest reservation reaches `PENDING_APPROVAL` (`CAND-33` step 3 under `MANUAL` policy) and appears in the staff session roster's approval queue.
- **Main Flow:**
  1. Staff reviews the reservation and its named attendees in the session roster.
  2. Staff approves or rejects the reservation in one action.
  3. On approval, a `FIRST_FREE_PER_EMAIL` entitlement is atomically consumed if still available; otherwise the reservation remains payable in person. The reservation becomes `CONFIRMED` without changing its already-reserved capacity.
  4. On rejection, reservation becomes `CANCELLED`, releases its capacity, and triggers first-fitting waitlist promotion.
- **Alternative Flows:**
  - **A1: Reservation was already resolved by another staff member before this decision commits (race)** → System shows it as already-resolved; this action becomes a no-op, never a duplicate approval/rejection or a second entitlement consumption.
  - **A2: The session has already started or ended before the decision is made** → `CAND-36` auto-expires the reservation first; this approve/reject action is no longer available once that's happened.
- **Postconditions:** Guests are never silently auto-approved under a MANUAL policy.
- **Events Triggered:** `ClassSessionBookingConfirmed` or `ClassSessionBookingCancelled`.

### **CAND-35: Manager Creates or Cancels a Customer Class-Access Contract**

- **Actor:** Staff (MANAGER)
- **Preconditions:** Customer exists; the customer has no overlapping active contract.
- **Trigger:** Manager sets up a new customer's session-service access (e.g. onboarding a CrossFit member) or ends an existing contract early (e.g. a customer cancels their membership).
- **Main Flow:**
  1. Manager selects customer, inclusive start/end dates, and eligible SESSION services (for example, CrossFit covers every CrossFit timetable).
  2. System creates the contract. It grants booking eligibility but reserves no capacity itself.
  3. An authenticated customer may book exactly one seat in any eligible session whose start date falls in the contract window; capacity then decides confirmation/waitlist normally.
  4. If the manager cancels the contract early, system cancels every future booking funded by it, ends dependent recurring enrollments, and releases capacity.
- **Alternative Flows:**
  - **A1: Contract reaches its end date** → System expires it and ends dependent recurring enrollments. A later contract does not silently resume a previous enrollment; the customer opts in again.
- **Postconditions:** One customer has at most one active contract at a time; service eligibility, not a single class timetable, defines access.
- **Events Triggered:** Candidate contract-created/cancelled events; per-booking cancellation events for affected future reservations.

### **CAND-36: System Expires Unresolved Guest Requests at Session Start**

- **Actor:** System
- **Preconditions:** A session has started and contains `PENDING_APPROVAL` guest reservations.
- **Trigger:** Same time-based check as `CAND-13`'s generation job and `CAND-25b`'s waitlist cleanup (or piggybacked onto either) — runs once a session's `startTime` has passed.
- **Main Flow:** System cancels each unresolved guest reservation and attendee rows. It does not promote a waitlist after the class begins.
- **Alternative Flows:**
  - **A1: No `PENDING_APPROVAL` guest reservations exist on the session** → No-op; nothing to expire.
- **Postconditions:** No unapproved guest seat persists into attendance.
- **Events Triggered:** `ClassSessionBookingCancelled` as applicable.

### **CAND-37: Staff Closes a Session With Individual Attendance and In-Person Payment**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Session has ended and is `AWAITING_ATTENDANCE`.
- **Trigger:** Staff opens the session's roster after `ClassSession.endTime` has passed, to review attendance and record close-out.
- **Main Flow:**
  1. Roster defaults every attendee to PRESENT; staff flags individual NO_SHOW exceptions.
  2. Staff records the actual paid amount for each payable guest reservation; contract and approved-free-trial reservations have no payment due.
  3. System closes attendee rows and parent reservations atomically, then marks the session `CLOSED`.
  4. Eligible customer attendance publishes the candidate completion event for loyalty; notifications use the booking contact snapshot.
- **Alternative Flows:**
  - **A1: Staff attempts to close a session that is already `CLOSED`** → System blocks; a session cannot be closed twice (prevents double-recording payment or double-publishing the completion event).
  - **A2: Staff attempts to close before `endTime` has actually passed** → System blocks; close-out is only available once the session has ended, matching the precondition above.
- **Postconditions:** Attendance is never inferred by a timer. A session that reaches end time stays visibly `AWAITING_ATTENDANCE` until this action occurs.
- **Events Triggered:** `ClassSessionBookingCompleted` for eligible customer attendance.

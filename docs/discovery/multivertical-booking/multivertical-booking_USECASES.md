# Discovery: Multi-Vertical Scheduling — Candidate Use Cases

**Status:** Discovery — candidate/speculative. Labeled `CAND-XX`, never `UC-XXX`, so this list can never collide with or be mistaken for the canonical index in `docs/04-USE_CASES.md`. Nothing here is committed to a milestone; promote individual candidates into `docs/04-USE_CASES.md` with real UC numbers only if/when a milestone is actually drafted for one of these verticals.

**Companion doc:** `multivertical-booking.md` — the domain model these use cases are derived from.
**Companion doc:** `multivertical-booking_DATA_MODEL.md` — the physical schema these use cases' mechanisms (idempotency keys, atomic capacity checks, exclusion constraints) are grounded against.
**Companion prototype:** `prototype/` (start at its `index.html`) — several candidates below (CAND-13b, CAND-13c, CAND-17b) were added *because* building the prototype exposed a gap this list hadn't caught; the prototype's own `dev-notes.md` has the full trail.

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
- **Preconditions:** None beyond an active tenant. **Corrected 2026-08-23** (`multivertical-booking.md` §9 item 32) — this previously required a `Service` already configured with a non-`LOCATION` resource requirement, which is circular: `CAND-06` (configuring that requirement) has its own A1 blocking save until a resource of the chosen type already exists. A manager creates resources proactively, independent of any specific service — `CAND-06` is what later wires a `Service` to reference one. `CAND-51` (preset bootstrap) is the one path that creates both together atomically and never hit this; this fix is what makes the standalone flow work the same way for a tenant adding resources after bootstrap.
- **Trigger:** Manager clicks "Add Resource" in dashboard settings.
- **Main Flow:**
  1. Manager selects resource type: `STAFF` (picks an existing `Staff` row to wrap), `ROOM`, or `EQUIPMENT`.
  2. For `ROOM`/`EQUIPMENT`, manager enters a display name.
  3. Manager sets initial working hours (defaults to tenant `businessHours` if left blank).
  4. System creates the `Resource` row, `isActive = true`.
- **Alternative Flows** (see `manager-04b-criar-recurso-erro.html`):
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

> Added to close a coverage gap found during a pre-promotion audit (2026-08-07): `multivertical-booking.md` §9 item 11 already decided "Staff deactivation deactivates the wrapping STAFF resource for new scheduling," but no candidate ever covered the *automatic* trigger — CAND-03 only covers a manager directly, manually deactivating a `Resource`. This is the system-side cascade from the existing canonical `UC-029` (Admin deactivates staff member), distinct from CAND-03's manual path the same way CAND-13 (system-generated sessions) is distinct from CAND-11 (manager-authored template).

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
- **Alternative Flows** (see `manager-08b-schedule-controls-erro.html` for A2):
  - **A1: Resource left unselected** → Falls back to today's tenant-wide behavior, `resourceId = null`.
  - **A2: An overlapping closure already exists for `(tenantId, resourceId, date)`** → System blocks save, naming the conflicting closure; added 2026-08-22, closing a gap where step 3's validation was described but never given its own alt-flow.
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

> **A leg can need more than one resource at once, not just one:** Jornada Spa Vitta's middle leg (Massagem, `manager-02-service-resource-config.html`'s legs panel) needs both a therapist (customer-chosen between Renata Souza and Maria Santos) *and* a room (Sala de Terapia, system-assigned) for the same sub-window — the exact two resources `Massagem Relaxante`'s own bundle (CAND-07) uses, deliberately, to demonstrate CAND-31's cross-service exclusivity from the other direction. Corrected 2026-08-05 — see `multivertical-booking_DATA_MODEL.md` §6 item 13.

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

### **CAND-09b: Manager Configures a Service's Booking-Intake Schema**

> Added 2026-08-22, closing a coverage gap found during a data-model review: `CAND-43` (customer submits intake answers) and `service_booking_intake_schema` (`multivertical-booking_DATA_MODEL.md` §2) both assume a schema already exists, but nothing ever covered a manager *authoring* one — the same gap `CAND-10b` already exists to close for guest-access policy, recurring here for a different field set.

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Service exists, `bookingModel = APPOINTMENT`.
- **Trigger:** Manager sets up or edits the service's booking-review questions (e.g. a dentist wants a health-history question; a mobile groomer wants a pickup address).
- **Main Flow:**
  1. Manager adds one or more questions (free text, a named-attendees list, or a typed marker such as pickup address) and marks each required or optional.
  2. Manager sets whether the service requires a participant count, named attendees, both, or neither.
  3. Manager writes/updates the consent text customers must accept.
  4. System publishes a new `service_booking_intake_schema` version — `is_active = true` on the new row, `is_active = false` on the previous one. The previous version is never edited in place.
- **Alternative Flows:**
  - **A1: Service already has bookings in flight against the current version** → Existing bookings keep their already-snapshotted `intake_schema_version`/`intake_answers`; only new bookings see the new version (`CAND-43` A1).
  - **A2: Manager adds a `PICKUP_ADDRESS`-typed question** → System also sets `services.requires_pickup_address = true` in the same transaction. The legacy boolean (already live for car wash, `docs/13-DATABASE_SCHEMA.md:207`) stays the single source of truth for whether `bookings.pickup_address` must be populated; the intake schema is the presentation/collection layer on top of it, not a second, independent switch — see `multivertical-booking_DATA_MODEL.md` §6 item 36.
- **Postconditions:** The service has exactly one active intake schema version; `CAND-43` renders it.
- **Events Triggered:** None (config-only, same as `CAND-06`).

### **CAND-09c: Manager Configures an Appointment Service's Booking Policy**

> Added 2026-08-22, closing a coverage gap found during a data-model review: `multivertical-booking_DATA_MODEL.md` §3 declares `default_approval_mode`/`manual_hold_minutes`, cancellation/reschedule windows, minimum notice, maximum advance, recurrence eligibility, availability-alert eligibility, and (for `durationPolicy = CUSTOMER_SELECTED` services) duration/pricing policy — all consumed by several CANDs (`CAND-16`–`19`, `23b`, `42`, `44`, `45`, `46`) — but no candidate ever covered a manager actually setting them, unlike `CAND-06`/`08`/`09`/`10` for resource requirements, legs, buffer, and booking model.

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Service exists, `bookingModel = APPOINTMENT`.
- **Trigger:** Manager edits the service's booking policy.
- **Main Flow:**
  1. Manager sets approval mode (`AUTO_CONFIRM`/`MANUAL_APPROVAL`, inheriting the tenant default when left blank) and, if `MANUAL_APPROVAL`, the hold duration.
  2. Manager sets the cancellation window, minimum notice, and maximum advance (all inheriting tenant defaults when left blank).
  3. Manager toggles whether the service allows recurring private reservations (`CAND-45`) and availability alerts (`CAND-46`). **Interaction to surface to the manager (updated 2026-08-28, `multivertical-booking.md` §9 item 32 — see that item for the prior, superseded behavior):** enabling recurrence on a `MANUAL_APPROVAL` service means the *schedule itself* is reviewed once, at creation (`CAND-45b`) — every occurrence it then generates auto-confirms without further review. A one-off booking of the same service still goes through per-booking `MANUAL_APPROVAL` normally. This is deliberate: recurrence trades ongoing per-occurrence review for one-time review of the whole standing commitment, not for no review at all — the manager should understand this before turning both on for the same service.
  4. If the service has `durationPolicy = CUSTOMER_SELECTED` (`CAND-42`), manager also sets minimum/maximum/increment duration, the per-increment price, and optional minimum charge.
  5. System saves the policy on `Service`; every subsequent booking snapshots the effective values at submission time (unchanged existing principle).
- **Alternative Flows** (see `manager-13b-service-booking-policies-erro.html` for A2):
  - **A1: Manager reduces the cancellation window or approval hold below a value already relied on by an in-flight booking** → No retroactive effect; only bookings created after the change use the new values.
  - **A2: Manager sets `durationPolicy = CUSTOMER_SELECTED` without a `pricingPolicy`** → System blocks save; a variable-duration service must declare how it prices (§6b of the discovery doc: "a simple per-increment rate plus optional minimum charge").
- **Postconditions:** The service has a complete, self-contained booking policy; no field silently falls back to an undocumented default.
- **Events Triggered:** None (config-only, same as `CAND-06`).

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

> **Corrected 2026-08-05:** step 3 originally said nothing about a pool at all — resource eligibility for a `SESSION` service was assumed to live on the `ClassScheduleTemplate` instead (CAND-11), which turned out to have no step that ever declared it either. Moving the pool here, to the service level, means Vitta Studio's "Aula de Pilates" declares its eligible instructors (Camila, Ana Beatriz) and rooms (Estúdio 1, Estúdio 2) *once* — both `tpl_pilates_estudio1` and `tpl_pilates_estudio2` (CAND-11) then each pick one name from that same shared list, rather than the pool needing separate re-declaration per template. See `multivertical-booking_DATA_MODEL.md` §6 item 15 for the full correction.

### **CAND-10b: Manager Configures a Session Service's Guest Access Policy**

> Added to close a coverage gap found during a pre-promotion audit (2026-08-07): `multivertical-booking_DATA_MODEL.md` §3 already defines `services.guest_access_enabled`/`guest_approval_mode`/`guest_trial_policy`, and `CAND-33`/`CAND-34` already *consume* those fields, but no candidate ever showed a manager *setting* them — `CAND-10` stops at declaring the eligible resource pool (step 3) and never touches guest policy.

- **Actor:** Staff (STAFF or MANAGER — same rationale as CAND-06: matches today's Service management, not manager-exclusive)
- **Preconditions:** Service exists, `bookingModel = SESSION`.
- **Trigger:** Manager configures whether and how guests (non-contract customers) can book this SESSION service, either during `CAND-10`'s creation flow or later as an edit.
- **Main Flow:**
  1. Manager toggles `guest_access_enabled` (default off — authenticated customer access via `ClassAccessContract` is the SESSION default per §11 of the discovery doc).
  2. Manager picks `guest_trial_policy`: `NONE` or `FIRST_FREE_PER_EMAIL` (one free trial seat per unique email, tenant-wide, enforced by `guest_class_trial_redemptions`' `UNIQUE(tenant_id, normalized_email)`).
  3. System saves the two fields on `Service`. Per-session guest capacity (`trialSlots` — how many guest seats auto-confirm before `CAND-34` approval is needed) is configured per class-schedule-template instead, in `CAND-11`/`CAND-12` — see the note below.
- **Alternative Flows:**
  - **A1: Manager disables `guest_access_enabled` on a service with `PENDING_APPROVAL`/`PENDING_EMAIL_VERIFICATION` guest reservations already in flight** → Existing in-flight reservations are honored to their natural conclusion (approved/rejected/expired per `CAND-34`/`CAND-36`); only new guest requests are blocked going forward.
- **Postconditions:** `CAND-33`'s guest-verification flow and `CAND-34`'s approval flow have a real, manager-set configuration to read instead of an implicit default.
- **Events Triggered:** None (config-only, same as `CAND-06`).

> **Changed 2026-08-21:** this candidate previously also set a global `guest_approval_mode` (`MANUAL`/`AUTO`) here, applied uniformly to every session of the service. Replaced by per-template/per-session `trialSlots` (`CAND-11` step 3, overridable per `CAND-14`) — a single service-wide switch couldn't express a studio wanting its peak-hour class members-only while a slow-afternoon session takes a couple of walk-ins. See `multivertical-booking_DATA_MODEL.md` §6 item 20.

---

## Group C — Class/Session Management (Staff or Manager)

### **CAND-11: Manager Creates a Recurring Class Schedule Template**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Service exists with `bookingModel = SESSION`.
- **Trigger:** Manager sets up the class's recurring pattern.
- **Main Flow:**
  1. For each slot in this service's already-declared eligible pool (CAND-10 step 3 — e.g. instructor, room, optionally equipment), manager picks exactly one resource. The picker only ever shows that pool's members, never every resource of that type tenant-wide — `resourceIds` ends up an open-ended array, not capped at 2, but each entry is one pick from its own slot's pool.
  2. Manager sets a recurrence rule (days of week, start time — duration comes from `Service.durationMinutes`).
  3. Manager sets `capacity` and, when the service has `guestAccessEnabled`, `trialSlots` (default 0 — no auto-confirmed guest seats; every guest request needs `CAND-34` approval).
  4. System creates the `ClassScheduleTemplate`, `isActive = true`.
  5. System (async) begins generating `ClassSession` rows on the rolling horizon (CAND-13).
- **Alternative Flows:**
  - **A1: Chosen resources are already committed to an overlapping template** → System blocks: e.g. the same room can't host two recurring classes at the same time.
  - **A2: A chosen resource already has an `APPROVED` appointment-style `Booking` matching the new template's recurrence pattern** (e.g. Camila already has a standing Tuesday 08:00 haircut booked before this template is created) → System blocks creation, listing the conflicting booking(s); manager must resolve (reschedule the booking or pick a different resource/time) before the template can be created. This is a bounded, finite scan — only bookings up to `tenants.settings.booking.maxBookingAdvanceDays` out can exist yet, not an unbounded future. **Extended 2026-08-22:** the same check also evaluates every active `RecurringBookingSchedule` (`CAND-45`) on the chosen resource(s) by its recurrence rule directly, the same unbounded way `CAND-29` step 4 already does for `ClassScheduleTemplate` — a standing private reservation is a real future commitment regardless of whether `maxBookingAdvanceDays` has materialized it into an individual `Booking` yet. See `multivertical-booking_DATA_MODEL.md` §6 item 32.
  - **A3: Requested `capacity` exceeds the lowest `maxCapacity` ceiling among the template's chosen `ROOM`/capacity-bearing `EQUIPMENT` resources** (per `multivertical-booking.md` §9 item 8 — `LOCATION`/`ROOM` and capacity-bearing `EQUIPMENT` may define a physical ceiling) → System blocks creation; manager must lower capacity or pick a higher-ceiling resource. `STAFF` resources never carry a `maxCapacity` (see CAND-04's precondition on `manager-04`), so only room/equipment ceilings are checked.
  - **A4: A chosen resource already has `MAX_ACTIVE_TEMPLATES_PER_RESOURCE` (50) active templates referencing it** (added 2026-08-28, `multivertical-booking_DATA_MODEL.md` §6 item 43) → System blocks creation, naming the resource; manager must deactivate an existing template on it first or choose a different resource. Guards the recurrence-recomputation hot path (`CAND-29` step 4) against an unbounded active-template count on one resource.
- **Postconditions:** Template active; sessions begin appearing on the booking calendar.
- **Events Triggered:** None.

> **Concrete example (model #6 — independent instances, not a pool):** a bigger Vitta Studio location runs Pilates in 2 rooms at once — `tpl_pilates_estudio1` (Camila, Estúdio 1) and `tpl_pilates_estudio2` (Ana Beatriz, Estúdio 2), same service, same recurrence, two independent templates each with its own capacity/roster (see `multivertical-booking.md` §6 for the full worked example). Equipment is optional on the bundle: this Pilates example uses none, but a CrossFit template would check it to reserve a shared `Kit Halteres` from `manager-01`'s fungible `EQUIPMENT` pool (CAND-17) alongside its instructor and room.

> **Concrete example (model #13 — capacity as Service×Resource, not Resource alone):** Bruno Alves is a `STAFF` resource who is both a hairdresser (`CAND-16`, `resourceRequirements = [{type: STAFF, selectionMode: CUSTOMER_CHOICE}]`, implicit capacity 1 — appointment-style has no capacity field at all) *and* the CrossFit instructor on `tpl_crossfit` (this candidate, `capacity = 20`). Nothing on `Resource` itself declares "Bruno's capacity" — capacity is never a property of the resource; it's declared per-template (this step) for SESSION services and is implicitly 1 for APPOINTMENT services. The same `resourceId` therefore participates in two completely different capacity shapes depending on which service/template is asking, with `resource_occupancy` (not `Resource.maxCapacity`) as the one shared mechanism that still keeps both families from double-booking him (`CAND-31`).

### **CAND-12: Manager Edits or Deactivates a Template**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Template exists.
- **Trigger:** Manager changes the recurrence, resources, default capacity, or `trialSlots`, or turns the template off.
- **Main Flow:**
  1. Manager edits the template.
  2. System applies the change only to **future, not-yet-generated** sessions — already-materialized sessions are untouched (they were snapshotted at generation time, per §6 of the discovery doc).
  3. Deactivating stops future generation; existing future sessions remain bookable unless separately cancelled (CAND-15).
- **Alternative Flows** (see `manager-11b-edit-template-erro.html` for A2):
  - **A1: Manager wants existing future sessions to also change** → Out of scope for this flow; manager must edit each `ClassSession` individually (CAND-14) or cancel and recreate.
  - **A2: New default capacity is below the reservedCount of one of the template's own already-materialized, not-yet-started sessions** (added 2026-08-22) → System blocks the template-level edit and directs the manager to resolve those sessions individually via `CAND-14` first — a guardrail against setting a default the manager can plainly see is already inconsistent with sessions currently in flight, even though this edit itself never touches already-generated sessions.
- **Postconditions:** Template reflects new config; historical/already-generated sessions unaffected.
- **Events Triggered:** None.

### **CAND-13: System Generates Upcoming Class Sessions**

- **Actor:** System (scheduled job — same shape as the existing loyalty-expiry cron)
- **Preconditions:** At least one active `ClassScheduleTemplate` exists.
- **Trigger:** An idempotent rolling-horizon generation job runs every 15 minutes. The platform default horizon is 90 days; a service may configure a shorter horizon.
- **Main Flow:**
  1. For each active template, system computes the next occurrence(s) within the horizon not yet materialized.
  2. System creates a `ClassSession` per occurrence, snapshotting `resourceIds`/`capacity`/`trialSlots` from the template at generation time.
  3. Idempotency: a `(templateId, startTime)` uniqueness check prevents double-generation on retry.
- **Alternative Flows:**
  - **A1: The worker fails or misses a run** → The next run recomputes the complete target horizon, skips already-materialized `(templateId, startTime)` keys, retries safely and records an operational failure/metric. No duplicate session is created.
  - **A2: A resource is closed or outside its current hours for that occurrence** → Session is not generated. Existing materialized sessions remain explicit commitments when a later schedule change makes them exceptional.
  - **A3: A resource has an overlapping approved appointment** → Session generation is rejected by the shared occupancy constraint; manager resolves the already-existing commitment rather than creating an impossible session.
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
  3. Selecting a session opens its roster and the applicable operational actions (CAND-14, CAND-15, CAND-34, CAND-37); CAND-15 is cancellation, not the roster itself.
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
  1. Manager edits the specific session's `capacity`, `trialSlots`, and/or `resourceIds`.
  2. System validates the new resource(s) are free for the window (if changed).
  3. System saves — this instance only; the template is untouched.
- **Alternative Flows** (see `staff-03b-session-capacity-override-erro.html`):
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
  - **A1: Financial treatment** → No refund/credit workflow exists in this discovery: Ikaro does not process payments, and a closed-out session is not subsequently cancelled. Any manually reported charge is handled outside this discovery.
- **Postconditions:** Session and its bookings cancelled; customers notified.
- **Events Triggered:** `ClassSessionCancelled` (candidate event — not yet in `docs/03-DOMAIN_EVENTS.md`).

> See CAND-32 for cancelling a date range or an entire template forward, rather than one already-materialized session.

### **CAND-15b: Staff Closes Out a Class Session (Marks Attendance)**

> **Superseded by CAND-37.** Retained only for numbering continuity; CAND-37 is the authoritative attendee-level attendance and in-person-payment flow.

> Historical rationale only. The final model is: parent reservations close as `CLOSED`; individual attendee rows carry `PRESENT`/`NO_SHOW`; close-out is staff-triggered and records a manual charge outcome when the attendee is payable. See CAND-37.

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** `ClassSession.endTime` has passed; `status = SCHEDULED`.
- **Trigger:** Staff opens the session's roster after it has happened to review attendance.
- **Main Flow:**
  1. Roster shows every named attendee from an active reservation pre-marked as attended by default.
  2. Staff flags individual attendee exceptions; a guest group can have mixed attendance.
  3. Staff clicks a single close-out action (e.g. "Fechar turma").
  4. System records attendee `PRESENT`/`NO_SHOW`, closes each parent reservation, and records the required manual charge outcome for any payable attendee atomically.
  5. System publishes `ClassSessionBookingCompleted` only for eligible attended contract customers.
- **Alternative Flows:**
  - **A1: Staff never closes out the session** → Session remains `AWAITING_ATTENDANCE` as a visible Turmas task; the system never guesses attendance.
- **Postconditions:** Every parent reservation reaches `CLOSED`; attendee rows retain the individual outcome.
- **Events Triggered:** `ClassSessionBookingCompleted` (candidate event, per booking — not yet in `docs/03-DOMAIN_EVENTS.md`).

---

## Group D — Appointment Booking (Customer/Guest)

> **Approval, finalized:** every CAND below uses the service's effective approval policy, inheriting the tenant default only when the service has no override. `AUTO_CONFIRM` creates `APPROVED`; `MANUAL_APPROVAL` creates capacity-holding `PENDING` with the snapshotted hold duration. `autoApproveEnabled` is the legacy/default source, not the global runtime switch.

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
- **Alternative Flows** (see `public-04b-bundle-booking-erro.html` for A2):
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
- **Alternative Flows** (see `public-05b-multi-leg-itinerary-erro.html`):
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
  - **A2: Customer has no active `ClassAccessContract` covering this session's service/date** → Booking is blocked *on this flow specifically* — CAND-22 is contract-only by definition. **Corrected 2026-08-21** (was previously self-contradictory with `CAND-33` A2 — see that entry): the customer is **not** directed to the guest path; the guest flow is contract-bypass-proof by design (`CAND-33` A2), regardless of whether the requester happens to be logged in. Instead, the customer is directed to `CAND-22b` (pay-per-class, no contract required) if the service allows it, or told to arrange a contract otherwise.
- **Postconditions:** `ClassSessionBooking` exists, `CONFIRMED`.
- **Events Triggered:** `ClassSessionBookingConfirmed` (candidate event, mirrors `BookingRequested`'s role for Notification Context).

### **CAND-22b: Authenticated Customer Without a Contract Books a Session Pay-Per-Class**

> Added 2026-08-21, closing a real product gap found in a business-logic review: the model previously had exactly two doors — `ClassAccessContract` (membership) or `GUEST` (anonymous, email-verified, trial-limited) — with nothing for an authenticated, logged-in customer who simply pays per class with no membership. That's a common, ordinary pattern at Brazilian studios/gyms ("cliente avulso cadastrado"), and the two existing flows actively contradicted each other about what should happen to it (`CAND-22` A2 said "send them to the guest path"; `CAND-33` A2 said that exact path is blocked for a logged-in customer). This CAND is the actual third door, not a patch to either of the other two.

- **Actor:** Customer (authenticated, no active `ClassAccessContract` for this service)
- **Preconditions:** Service has `bookingModel = SESSION` and `guest_access_enabled = true` (the same flag that gates the guest path — a service that disallows non-member traffic entirely disallows it for both anonymous guests and contract-less logged-in customers alike).
- **Trigger:** Customer selects a session on a service they have no contract for, and the service allows non-member bookings.
- **Main Flow:**
  1. Customer confirms — no email verification step, unlike `CAND-33`: they're already an authenticated session, their contact details are already on file.
  2. System applies the identical `trialSlots`/`reservedNonMemberCount` check `CAND-33` uses (§6 "Guest trials and payment" of the domain doc) — a contract-less customer counts as non-member traffic for capacity-protection purposes, same as a guest. Below the threshold → `CONFIRMED`; at/above it → `PENDING_APPROVAL` (`CAND-34`).
  3. `ClassSessionBooking` is created with `type = CUSTOMER`, `contractId = null`, `paymentSource = IN_PERSON` — relaxes the previously-absolute "a CUSTOMER reservation always has a contract" invariant (`multivertical-booking_DATA_MODEL.md` §2, `class_session_bookings`, see that doc's §6 item 23 for the exact constraint change).
  4. No payment is processed by Ikaro. If the customer is payable, staff records the externally reported outcome (`PAID`, `UNPAID` or `WAIVED`) at close-out, with amount/method when known.
- **Alternative Flows:**
  - **A1: `guest_access_enabled = false`** → Not offered; customer is told to arrange a contract. A service that wants members-only stays members-only for everyone, not just anonymous visitors.
  - **A2: Session fills / trial-slots threshold reached** → Same branches as `CAND-22` A1 / `CAND-33` step 3 respectively.
- **Postconditions:** `ClassSessionBooking` exists, owned by the real `customerId`, no contract required.
- **Events Triggered:** `ClassSessionBookingConfirmed` or none yet (`PENDING_APPROVAL`, same as `CAND-33`).
- **Loyalty distinction from `CAND-33`:** unlike a guest, this customer *is* known and earns loyalty points on attendance (`points_value_per_unit_at_booking` set normally, not zeroed) — being logged in without a membership is still being a real, identified customer.

### **CAND-23: Verified Guest Books Multiple Named Units in One Action**

- **Actor:** Guest
- **Preconditions:** Guest path is enabled; guest has verified email; `capacity - reservedCount ≥ requested quantity`.
- **Trigger:** Customer requests N spots in one checkout (e.g. "2 bikes, me + a friend").
- **Main Flow:**
  1. Guest sets quantity (bounded by remaining capacity) and gives a name for every attendee.
  2. After email verification, system atomically checks remaining ≥ quantity, creates one named-attendee guest reservation, and increments `reservedCount` by N when it enters `PENDING_APPROVAL` or `CONFIRMED`.
  3. A group reservation is always `paymentSource = IN_PERSON` to indicate external/manual settlement intent. `FIRST_FREE_PER_EMAIL` is deliberately a solo-guest benefit only; one contact email cannot grant a free class to unnamed additional attendees.
- **Alternative Flows:**
  - **A1: Requested quantity exceeds remaining capacity** → System caps the selectable quantity in the UI to what's left; never offers an invalid N.
  - **A2: Guest selects one attendee and has an unused first-free entitlement** → The resulting solo reservation uses `GUEST_TRIAL`; otherwise it is payable in person.
- **Postconditions:** One `ClassSessionBooking` row consuming N units — distinct from N separate customer bookings filling the same class.
- **Events Triggered:** `ClassSessionBookingConfirmed` when confirmed; none until a `PENDING_APPROVAL` group is decided.

### **CAND-23b: Customer Cancels a Single (Non-Recurring) Class Session Booking**

> Added 2026-08-05 — this is the direct SESSION-family analog of `UC-007`, and until now the single most basic cancellation flow was entirely absent from this group: nothing let a customer cancel a plain `ClassSessionBooking` made via `CAND-22`/`CAND-23`. `CAND-27` only cancels *one occurrence of a `RecurringEnrollment`* (its precondition requires a `seriesId` to already exist) — Fernanda's booking (`sb_1`, `seriesId = null`, `multivertical-booking_DATA_MODEL.md` §2) had no cancellation path at all until this candidate. Introduces a new tenant setting, `tenants.settings.booking.classCancellationWindowHours`, deliberately separate from `Booking`'s own `cancellationWindowHours` — a studio/gym's late-cancel window for a class is commonly different, often shorter, than a private appointment's, and a capacity-constrained class with an active waitlist has a real cost a private 1:1 slot doesn't share the same way (see `multivertical-booking.md` §6 "Cancellation").

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

### **CAND-24: Authenticated Customer Joins a Waitlist When a Session Is Full**

- **Actor:** Authenticated customer
- **Preconditions:** `ClassSession.reservedCount = capacity`; the customer has selected either a qualifying current contract or the service-permitted pay-per-class path.
- **Trigger:** Customer clicks "Join waitlist" on a full session.
- **Main Flow:**
  1. System shows one clear V1 choice: use the qualifying contract, when one exists, or reserve as pay-per-class when the service permits it. A waitlist entry is one authenticated customer and one seat; guest groups never join a waitlist.
  2. System creates `ClassSessionBooking(status=WAITLISTED, quantity=1)` and snapshots its `waitlistAccessIntent` (`CONTRACT` with `contractId`, or `IN_PERSON`). It does not consume capacity.
  3. Customer is told their position ("You're #3 on the waitlist") — computed at read time from queue order (earliest `createdAt` first among `WAITLISTED` rows on this session), not a stored/assigned field (corrected 2026-08-05, see `multivertical-booking_DATA_MODEL.md` §6 item 8).
- **Alternative Flows** (see `public-10b-waitlist-erro.html` for A1):
  - **A1: Customer already has a capacity-holding, `WAITLISTED`, or `PROMOTION_PENDING` booking on this session** → Blocked, no duplicate entries.
  - **A2: No qualifying contract and pay-per-class is disabled** → Waitlist is unavailable; customer is told to arrange a contract.
  - **A3: Visitor is not authenticated** → System explains that waitlist notifications are available to registered customers and routes to login/account creation. No waitlist row is created before authentication.
- **Postconditions:** Waitlisted `ClassSessionBooking` exists.
- **Events Triggered:** `ClassSessionBookingWaitlisted` (candidate event).

### **CAND-25: System Auto-Promotes the Next Waitlisted Customer**

- **Actor:** System
- **Preconditions:** Capacity is released on a future session with a non-empty waitlist.
- **Trigger:** Any capacity-releasing change: cancellation/rejection, attendee removal, an expired offer, or a safe capacity increase.
- **Main Flow:**
  1. System calculates the newly available capacity after the committed release.
  2. System finds the earliest-queued (lowest `createdAt`) `WAITLISTED` booking with `quantity ≤` freed capacity.
  3. Atomically reserves its one seat and promotes it to `PROMOTION_PENDING` — no position bookkeeping to shift; queue order is derived at read time, never stored.
  4. Sends an in-app and email offer to the authenticated customer with a tenant-configured acceptance deadline (default 24 hours, never later than session start).
- **Alternative Flows:**
  - **A1: Multiple seats were released** → Continue offering entries in FIFO order while capacity remains. V1 entries are always one seat, so no group-splitting rule is needed.
  - **A2: Customer declines or offer expires** → Release its capacity, cancel the offer, and repeat this flow for the next fitting entry.
- **Postconditions:** Waitlisted customer holds a time-bounded offer; acceptance becomes `CONFIRMED`.
- **Events Triggered:** `WaitlistPromoted` (offer created), then `ClassSessionBookingConfirmed` when accepted.

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

> **Changed 2026-08-21:** gained a minimum-notice window (A3) and an optional reschedule path (`CAND-38`) — previously this was the only class-family cancellation flow with no notice check at all, unlike `CAND-23b`.

- **Actor:** Customer
- **Preconditions:** `RecurringEnrollment` is `ACTIVE`; a `ClassSessionBooking` with matching `seriesId` exists for the target occurrence; time to `ClassSession.startTime` ≥ `tenants.settings.booking.classSkipWindowHours`.
- **Trigger:** Customer cancels just next week's class, keeping the standing enrollment.
- **Main Flow:**
  1. Customer picks the specific occurrence to skip.
  2. System cancels only that `ClassSessionBooking`; `RecurringEnrollment` stays `ACTIVE`.
  3. Freed capacity triggers CAND-25 if a waitlist exists for that occurrence.
  4. Customer may instead choose to reschedule to a same-modality replacement session (`CAND-38`, "reposição") rather than a plain skip, when the tenant allows it (`classAllowsReschedule`).
- **Alternative Flows:**
  - **A1: Target occurrence's `ClassSessionBooking` is already `CANCELLED` or doesn't exist yet** (not-yet-materialized future occurrence) → Nothing to skip; system shows the occurrence as already absent from the customer's upcoming list rather than offering a cancel action on it.
  - **A2: Target occurrence's `ClassSession.startTime` has already passed** → System blocks; a past occurrence cannot be skipped after the fact, only future ones.
  - **A3: Inside the skip window** (added 2026-08-21, mirrors `CAND-23b` A1) → System shows error: "Cancelamentos/pulos devem ser feitos com pelo menos `classSkipWindowHours` horas de antecedência."
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
  5. **Added 2026-08-22, closing a gap found during a data-model review:** "Free" also excludes any active `RecurringBookingSchedule` (`CAND-45`) on that resource whose recurrence rule produces an occurrence at the candidate time — evaluated directly against the schedule's own rule, exactly like step 4 does for `ClassScheduleTemplate`. Without this step, a standing private reservation (e.g. Ana Costa's weekly Tuesday 10:00 Sala Aurora booking, `multivertical-booking_DATA_MODEL.md` §2) would be invisible to this port for any not-yet-materialized future occurrence — the exact race this port was built to close for the class-template case, left open for the newer private-recurrence case. See `multivertical-booking_DATA_MODEL.md` §6 item 32.
- **Alternative Flows:**
  - **A1: No active resource of the required type exists for the service** (e.g. every eligible `STAFF` resource was deactivated) → Query returns zero available slots, same shape as today's "no availability" result; not an error.
  - **A2: A `resourceId` in the query doesn't belong to the querying tenant** → Excluded by the mandatory `tenantId` scoping in step 1; never reaches steps 2–5. Structural guard, not a runtime branch — restated here because `CAND-31` (the highest-risk consumer of this port) depends on it holding.
- **Postconditions:** Extends today's `AvailabilityService` (`availability.service.ts`) rather than replacing it.
- **Events Triggered:** None (read path).

> **Cross-family example:** Camila Duarte is both a hairdressing `STAFF` resource (APPOINTMENT) and the instructor on a Pilates `ClassScheduleTemplate` (SESSION) recurring Mon/Wed/Fri 08:00. A haircut request for her at Monday 08:00 must be rejected even 80 days out, before any `ClassSession` row for that date exists — step 4 evaluates her template's recurrence rule directly against the candidate time, rather than waiting for a materialized session to "claim" it first.
>
> **Cross-family example, private recurrence (added 2026-08-22):** Ana Costa holds a standing Tuesday 10:00–12:00 Sala Aurora reservation (`RecurringBookingSchedule`, `FIXED_ASSIGNMENT`). A different customer requesting Sala Aurora for a Tuesday 10 weeks out — long before that occurrence would ever be materialized — must see it as unavailable. Step 5 is what makes that hold, the same way step 4 does for Camila's Pilates template.

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

> Broadened on review (2026-08-04): originally scoped only to two APPOINTMENT-style services sharing a resource (the X-ray-machine case). The same mechanism has to cover a resource shared *across* families too — an APPOINTMENT-style service and a SESSION-style `ClassScheduleTemplate` on the same resource (Camila Duarte: hairdressing + Pilates) is the model-13 flagship scenario this discovery is built around, and it was previously ungoverned by this candidate. See `multivertical-booking.md` §6 "Cross-family resource exclusivity" for the full reasoning.

- **Actor:** System
- **Preconditions:** Two different bookable things share the same resource — either two APPOINTMENT-style services (e.g. one X-ray machine used by two different appointment types), one APPOINTMENT-style service and one SESSION-style `ClassScheduleTemplate` (e.g. Camila Duarte as both a hairdressing resource and a Pilates instructor), **or one APPOINTMENT-style service and an active `RecurringBookingSchedule`** (e.g. Ana Costa's standing Tuesday Sala Aurora reservation blocking a new one-off request for the same window — added 2026-08-22, see `multivertical-booking_DATA_MODEL.md` §6 item 32).
- **Trigger:** A booking, session-generation, or recurring-schedule-creation attempt would overlap an already-committed window on the shared resource, regardless of which side created that commitment.
- **Main Flow:**
  1. Availability computation for the new request is scoped to `tenantId` + the shared `resourceId`, same as `CAND-29` step 1, and includes existing approved bookings, materialized sessions, **and active template and recurring-schedule recurrence patterns** against that *shared resource*, regardless of which service or family created the commitment (`CAND-29` steps 4–5, `CAND-11` alt A2, `CAND-13` alt A2).
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

> **Resolved 2026-08-22 — this candidate's step 4 does NOT also raise a `CAND-47` future-commitment-exception worklist entry, and that's deliberate, not an oversight.** A prior review pass flagged step 4's automatic cancellation as apparently contradicting `CAND-47`/`CAND-56`'s "no future commitment is silently moved or invalidated" philosophy — both describe the same underlying scenario (a template change affecting an already-materialized future session). The two are reconciled, not merged: a manager choosing "cancel this date range" *is itself* the explicit, audited resolution `CAND-56` requires — it's just a bulk one instead of one worklist item per session, and it's recorded via `ClassSessionCancelled` + customer notification, not silently. `CAND-47`'s worklist exists for the other case — a change *nobody explicitly reviewed per-session* (a resource deactivation, an hours reduction, a side effect of an unrelated config edit) — see `CAND-47`'s precondition, updated in the same pass to state this exclusion explicitly. Forcing this flow's manager to additionally resolve N individual worklist items after already choosing a bulk cancellation would be pure duplicate work, not additional safety.

### **CAND-33: Guest Verifies Email Before Requesting a Class Seat**

- **Actor:** Guest
- **Preconditions:** The SESSION service enables guest access.
- **Trigger:** Guest enters contact details and one or more named attendees for a trial/drop-in.
- **Main Flow:**
  1. System stores a non-capacity-holding `PENDING_EMAIL_VERIFICATION` draft and emails a one-time verification link.
  2. Guest verifies the address before token expiry.
  3. System re-checks capacity and the non-member threshold atomically. If `reservedNonMemberCount + quantity <= trialSlots`, the reservation becomes `CONFIRMED`; if overall capacity fits but that threshold would be exceeded, it becomes `PENDING_APPROVAL`; otherwise no guest booking is created and the visitor is offered login/account creation to join the waitlist as an authenticated customer.
  4. A `FIRST_FREE_PER_EMAIL` entitlement is consumed exactly when a **solo** reservation reaches `CONFIRMED`. Every requested seat has a named attendee row; staff approves/rejects the parent reservation once for the whole group. A group booking is payable in person regardless of the contact email's trial history.
- **Alternative Flows:**
  - **A1: Verification token expires before the guest confirms** → The `PENDING_EMAIL_VERIFICATION` draft is discarded; guest must restart from step 1. No capacity was ever held, so nothing to release.
  - **A2: An authenticated Customer without a qualifying contract attempts this guest path** → Blocked — always, unconditionally, regardless of guest policy. **This flow is anonymous-only by construction; it is not the door for a logged-in customer without a membership.** That customer has its own real flow, `CAND-22b`, which skips email verification (they're already authenticated) and applies the identical `trialSlots` capacity-protection check this flow does. **Corrected 2026-08-21** — `CAND-22` A2 previously (incorrectly) said this exact scenario should route here; that contradiction is resolved, `CAND-22b` is the actual destination.
  - **A3: Capacity fills while the guest is completing verification** → The verified guest request cannot become `WAITLISTED`. System shows the class is now full and offers login/account creation; after authentication, the person may use `CAND-24` to join the waitlist.
- **Postconditions:** Only verified guest requests can reserve capacity.
- **Events Triggered:** Candidate guest-verification/guest-reservation events through the outbox.

### **CAND-34: Staff Approves or Rejects a Verified Guest Class Reservation**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Reservation is `PENDING_APPROVAL` because its non-member group exceeded that session's `trialSlots` threshold while overall capacity still fit.
- **Trigger:** A verified guest reservation reaches `PENDING_APPROVAL` through CAND-33 and appears in the staff session roster's approval queue.
- **Main Flow:**
  1. Staff reviews the reservation and its named attendees in the session roster.
  2. Staff approves or rejects the reservation in one action.
  3. On approval, a `FIRST_FREE_PER_EMAIL` entitlement is atomically consumed only when the reservation is solo and the entitlement remains available; otherwise the reservation remains payable in person. The reservation becomes `CONFIRMED` without changing its already-reserved capacity.
  4. On rejection, reservation becomes `CANCELLED`, releases its capacity, and triggers first-fitting waitlist promotion.
- **Alternative Flows** (see `staff-06b-guest-approval-erro.html` for A1):
  - **A1: Reservation was already resolved by another staff member before this decision commits (race)** → System shows it as already-resolved; this action becomes a no-op, never a duplicate approval/rejection or a second entitlement consumption.
  - **A2: The session has already started or ended before the decision is made** → `CAND-36` auto-expires the reservation first; this approve/reject action is no longer available once that's happened.
- **Postconditions:** A group above the session threshold is never silently approved.
- **Events Triggered:** `ClassSessionBookingConfirmed` or `ClassSessionBookingCancelled`.

### **CAND-35: Manager Creates or Cancels a Customer Class-Access Contract**

- **Actor:** Staff (MANAGER)
- **Preconditions:** Customer exists; the selected services do not overlap an active eligibility period already granted to that customer.
- **Trigger:** Manager sets up a new customer's session-service access (e.g. onboarding a CrossFit member) or ends an existing contract early (e.g. a customer cancels their membership).
- **Main Flow:**
  1. Manager selects customer, inclusive start/end dates, and eligible SESSION services (for example, CrossFit covers every CrossFit timetable).
  2. System creates the contract. It grants booking eligibility but reserves no capacity itself.
  3. An authenticated customer may book exactly one seat in any eligible session whose start date falls in the contract window; capacity then decides confirmation/waitlist normally.
  4. If the manager cancels the contract early, system cancels every future booking funded by it, ends dependent recurring enrollments, and releases capacity.
- **Alternative Flows** (see `manager-07b-class-contract-erro.html` for A2):
  - **A1: Contract reaches its end date** → System expires it and ends dependent recurring enrollments. A later contract does not silently resume a previous enrollment; the customer opts in again.
  - **A2: One or more selected services already has an active, overlapping eligibility period from an existing contract for this customer** (added 2026-08-22) → System blocks save, naming the conflicting service(s) and the existing contract's date range.
- **Postconditions:** One contract may cover several services. A customer may hold overlapping contracts only where their service eligibility does not overlap; service eligibility, not a single class timetable, defines access.
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

### **CAND-37: Staff Closes a Session With Individual Attendance and Optional Manual Charge Record**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Session has ended and is `AWAITING_ATTENDANCE`.
- **Trigger:** Staff opens the session's roster after `ClassSession.endTime` has passed, to review attendance and record close-out.
- **Main Flow:**
  1. Roster defaults every attendee to PRESENT; staff flags individual NO_SHOW exceptions.
  2. For a payable reservation, staff records an append-only manual charge record with amount, method and outcome (`PAID`, `UNPAID` or `WAIVED`). Ikaro does not process the charge. Contract and approved-free-trial reservations do not require a charge record.
  3. System closes attendee rows and parent reservations atomically, then marks the session `CLOSED`.
  4. Eligible customer attendance publishes the candidate completion event for loyalty; a no-show attendee publishes the no-show event instead and earns no points. Notifications use the booking contact snapshot.
- **Alternative Flows:**
  - **A1: Staff attempts to close a session that is already `CLOSED`** → System blocks; a session cannot be closed twice (prevents double-recording payment or double-publishing the completion event).
  - **A2: Staff attempts to close before `endTime` has actually passed** → System blocks; close-out is only available once the session has ended, matching the precondition above.
- **Postconditions:** Attendance is never inferred by a timer. A session that reaches end time stays visibly `AWAITING_ATTENDANCE` until this action occurs.
- **Events Triggered:** `ClassSessionBookingCompleted` for eligible customer attendance; attendee-level `ClassSessionBookingNoShow` for no-show outcomes.

### **CAND-38: Customer Reschedules a Skipped Fixed-Class Occurrence to a Replacement Slot**

> Added 2026-08-21, alongside `CAND-27`'s new skip-window check — "reposição," common practice at Brazilian studios/academias for a fixed weekly enrollment: skipping a class the customer is implicitly paying for shouldn't just mean losing it. See `ux-handoff-notes/RECORRENCIA_HANDOFF.md` for the originating UX work and `customer-04d-reagendada.html` (`prototype/`) for the already-built prototype screen.

- **Actor:** Customer
- **Preconditions:** `RecurringEnrollment` is `ACTIVE`; tenant has `classAllowsReschedule = true`; the skipped occurrence's `ClassSession.startTime` is within `classRescheduleWindowDays` of now; if `classMaxReschedulesPerCycle` is set, the customer hasn't already used it for the current cycle.
- **Trigger:** Immediately after skipping an occurrence (`CAND-27`), customer chooses "Reagendar" instead of a plain skip.
- **Main Flow:**
  1. System lists available `ClassSession`s of the *same service* (same modality) within the reschedule window, grouped by day, showing remaining capacity.
  2. Customer picks a replacement session.
  3. System atomically checks capacity on the replacement (same mechanism as `CAND-22`) and creates a new one-off `ClassSessionBooking` — `seriesId = null`, `rescheduledFromId` = the skipped occurrence's booking ID.
  4. The original occurrence's booking is cancelled (`CAND-27` step 2) in the same transaction.
- **Alternative Flows:**
  - **A1: Replacement session fills between page load and submit (race)** → Same re-check-at-write-time pattern as `CAND-22` A1; falls through to waitlist on the replacement instead of failing outright — the original occurrence's booking is still cancelled either way (the customer's slot is already given up).
  - **A2: `classMaxReschedulesPerCycle` already reached** → Reschedule option is not offered; customer can still plain-skip (`CAND-27`) without a replacement.
  - **A3: Customer lets the reschedule window lapse without picking a replacement** → No system-initiated cancellation of anything further; the original occurrence stays skipped/cancelled from `CAND-27`, simply without a make-up.
- **Postconditions:** Original occurrence cancelled; one new one-off booking exists for the replacement session, linked via `rescheduledFromId`.
- **Events Triggered:** `ClassSessionBookingCancelled` (original, `reason: ENROLLMENT_OCCURRENCE_SKIPPED`) and `ClassSessionBookingConfirmed` or `ClassSessionBookingWaitlisted` (replacement) — no new event type.

### **CAND-39: Manager Views Enrollments for a Class Type**

> Added 2026-08-21, closing a gap found after building the customer-side enrollment flow (`CAND-26`, `plan/journey/customer/prototypes/reservar-aula/`): nothing showed staff/manager who holds an ongoing enrollment across sessions — `staff-02-session-roster.html`/`CAND-13b` show one session at a time, never the standing relationship. See `manager-09-matriculas.html` (`prototype/`).

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Service has `bookingModel = SESSION`.
- **Trigger:** Staff opens "Matrículas" for a class type.
- **Main Flow:**
  1. System lists `RecurringEnrollment`s and one-off `ClassSessionBooking`s for the class type, grouped into tabs: active series, one-off/drop-in, waitlist, history.
  2. Staff can cancel an enrollment or a booking inline (same mechanism as `CAND-23b` A4/`CAND-28`), or manually promote a waitlisted entry (`CAND-25`'s mechanism, staff-triggered instead of system-triggered).
- **Alternative Flows:**
  - **A1: No enrollments exist for this class type yet** → Empty state per tab.
- **Postconditions:** None for the list itself; inline actions trigger their underlying CAND's postconditions/events.
- **Events Triggered:** None directly (read path); inline actions trigger their underlying CAND's events.

### **CAND-40: Manager Manually Creates an Enrollment on a Customer's Behalf**

> Added 2026-08-21, alongside `CAND-39`. Covers a customer who calls or asks in person rather than using the account self-service flow (`CAND-22`/`CAND-26`). See `manager-09b-nova-matricula.html` (`prototype/`).

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** Customer exists and is eligible through a qualifying active `ClassAccessContract` for contract-backed access, or through the service's permitted pay-per-class policy (`CAND-22b`). Staff cannot bypass the same eligibility/capacity checks applied to self-service.
- **Trigger:** Staff creates a booking or enrollment on behalf of a customer (e.g. a phone request).
- **Main Flow:**
  1. Staff selects the customer, the class type, and either a specific session (one-off, `CAND-22`/`CAND-22b` mechanism) or a recurring pattern (standing enrollment, `CAND-26`, contract-only).
  2. System creates the booking/enrollment exactly as the customer-initiated path would, tagged `createdByStaff = true` for audit.
- **Alternative Flows:** Same as `CAND-22`/`CAND-26` (capacity fills → waitlist, etc.). Two staff-specific failure modes, added 2026-08-22 during Mode B restructuring (see `manager-09c-nova-matricula-erro.html`):
  - **A1: Staff selects a customer with no qualifying active contract, and the service does not permit pay-per-class** → Blocked — staff cannot bypass the same eligibility check a self-service customer would hit (mirrors `CAND-22` A2); staff is directed to arrange a contract or enable pay-per-class on the service first.
  - **A2: The customer's own self-service action creates a competing booking/enrollment for the same session concurrently (race)** → Same atomic capacity re-check as `CAND-22` A1 resolves it; whichever commits first wins the seat, the other falls through to waitlist — no duplicate reservation is created.
- **Postconditions:** Same as `CAND-22`/`CAND-26`.
- **Events Triggered:** Same as `CAND-22`/`CAND-26`.

### **CAND-41: Manager Views the Resource List**

> Added 2026-08-21, closing a coverage gap found during a business-logic review: Group A (`CAND-01`–`05`) covers creating, editing, deactivating, and scoping closures/openings for a `Resource` — every *mutation* — but nothing ever covers the manager just looking at the list, the same gap `CAND-13b` closed for sessions ("CAND-13 covers the system generating sessions and CAND-14/15 cover acting on one specific session, but nothing covered the list in between"). See `manager-01-resources-list.html`.

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** None beyond an active tenant.
- **Trigger:** Manager opens "Recursos" in dashboard settings.
- **Main Flow:**
  1. System lists every `Resource`, grouped or filterable by `type` (`LOCATION`/`STAFF`/`ROOM`/`EQUIPMENT`), showing name, working hours summary, and active/inactive state.
  2. Selecting a resource opens its edit screen (`CAND-02`) or deactivation action (`CAND-03`).
  3. "Add Resource" leads to `CAND-01`.
- **Alternative Flows:**
  - **A1: No resources exist yet** → Empty state, CTA to `CAND-01`.
- **Postconditions:** None (read-only browse).
- **Events Triggered:** None.

## Group H — Multi-vertical appointment/reservation extensions

### **CAND-42: Customer Books a Variable-Duration Resource Reservation**

- **Actor:** Customer or Guest.
- **Preconditions:** APPOINTMENT service has `durationPolicy = CUSTOMER_SELECTED` and a resource/bundle requirement.
- **Trigger:** Customer selects an eligible room, court, bay, desk or equipment service.
- **Main Flow:** Customer chooses a start and duration within the service's minimum, maximum and increment rules. System validates the whole interval, required quantity and participant limit, quotes the service-level per-increment price, resolves every required resource atomically, then creates the normal booking under its snapshotted approval policy.
- **Alternative Flows** (see `public-11b-reserva-por-tempo-erro.html` for A1):
  - **A1: Another booking takes any required resource before submission** → Availability is rechecked at write time; customer keeps their chosen criteria and selects another compatible interval.
  - **A2: Interval crosses midnight** → Allowed only when the full span is within the configured maximum and every required resource is open for its own occupied window. Hotel/accommodation stays out of scope.
  - **A3: Fungible requirement has `requiredQuantity > 1`** → System assigns that many distinct eligible units in the same transaction or offers no slot; it never partially creates a reservation.
- **Postconditions:** The selected span is protected by normal occupancy; fixed-duration services remain unchanged.
- **Events Triggered:** Existing appointment booking events, according to its resulting `PENDING` or `APPROVED` state.

### **CAND-43: Customer Submits Versioned Booking Intake and Attendees**

- **Actor:** Customer or Guest.
- **Preconditions:** Service declares intake fields, participant/count rules, or both.
- **Trigger:** Customer reaches booking review for a service with intake or attendee requirements.
- **Main Flow:** Customer completes the service's current intake schema. System validates required answers, projects operational values such as pickup address and participant count into typed booking fields, and snapshots schema version, answers, consents and optional named attendees with the submitted booking.
- **Alternative Flows** (see `public-12b-intake-e-confirmacao-erro.html` for A3):
  - **A1: The service form changes while the customer is completing it** → Submission is validated against the displayed schema version; a removed/changed field never silently rewrites the already-completed answers.
  - **A2: A minor attends** → A responsible authenticated adult may be the booker; no family-account hierarchy is implied.
  - **A3: A required intake question or the consent checkbox is left unanswered** → System blocks submission with an inline validation error naming the missing field(s).
- **Postconditions:** Historical bookings remain readable under the form version used at submission.
- **Events Triggered:** None beyond the resulting booking-request event.

### **CAND-44: Customer Reschedules an Appointment or Reservation**

- **Actor:** Customer or audited staff acting for the customer.
- **Preconditions:** Booking is eligible under its snapshotted per-service reschedule policy.
- **Trigger:** Customer chooses “Reagendar” on an eligible future appointment/reservation.
- **Main Flow:** System validates and locks the replacement resource/span before releasing the original one, recalculates and displays the new quote, records an append-only quote revision and a link to the prior arrangement, then notifies the customer after commit.
- **Alternative Flows:**
  - **A1: Replacement is no longer available** → Original remains intact; customer selects another option.
  - **A2: Bundle/journey** → Every resource/leg is revalidated as one atomic change; no partial move is possible.
  - **A3: Staff policy override** → Staff records reason and actor, but never bypasses capacity, verification or resource exclusivity.
- **Postconditions:** Customer never loses the original slot merely because a replacement submit races.
- **Events Triggered:** Candidate appointment-rescheduled event after the replacement commits.

### **CAND-45: System Manages a Recurring Private Reservation Schedule**

- **Actor:** Authenticated customer, or Staff acting on their behalf.
- **Preconditions:** Service enables recurrence; guest bookings are not eligible.
- **Trigger:** Customer or staff confirms a supported weekly/private recurrence pattern.
- **Main Flow:** System resource-conflict-checks the proposed schedule (A1 below) with `FIXED_ASSIGNMENT` when customer/staff selected a resource, or `RESOLVE_PER_OCCURRENCE` for an eligible automatic/fungible service. **Branches on the service's effective approval mode (updated 2026-08-28, `multivertical-booking_DATA_MODEL.md` §6 item 42 — see that item for why):**
  - `AUTO_CONFIRM`: `RecurringBookingSchedule` is created `ACTIVE` directly. It blocks the future recurrence pattern and materializes normal linked bookings through the service's rolling horizon (90-day default) immediately.
  - `MANUAL_APPROVAL`: `RecurringBookingSchedule` is created `PENDING_APPROVAL` with a snapshotted `approval_hold_expires_at`. **No occurrences are generated yet.** Staff resolves it once via `CAND-45b`; only on approval does the schedule become `ACTIVE` and generation begin.

  **Resolved 2026-08-22, still applies once `ACTIVE`:** every occurrence a now-`ACTIVE` schedule materializes auto-confirms as `APPROVED`, regardless of the service's own `default_approval_mode` — the standing schedule itself was already vetted for conflicts (and, under `MANUAL_APPROVAL`, for staff review) once, at the point it became `ACTIVE`; re-running a hold-and-review cycle on every single generated occurrence would contradict the entire point of a "standing commitment" and doesn't match `customer-09-reserva-recorrente.html`'s own prototype, which shows every generated occurrence as already "Confirmada." `MANUAL_APPROVAL` still governs a genuinely one-off booking of the same service (`CAND-16`–`19`) — only occurrences generated by an already-`ACTIVE` schedule bypass per-occurrence review. See `multivertical-booking_DATA_MODEL.md` §6 item 33.
- **Alternative Flows** (see `customer-09b-reserva-recorrente-erro.html` for A1):
  - **A1: A future pattern conflicts at creation** → Creation is blocked; no partial schedule exists (checked before either branch above).
  - **A2: Customer skips/reschedules one occurrence, pauses, or ends** → A persistent exception preserves history and prevents unwanted regeneration. Only applies once `ACTIVE`; a `PENDING_APPROVAL` request is withdrawn outright instead (no standing commitment exists yet to skip/pause).
  - **A3: A later resource/configuration change makes a commitment invalid** → CAND-47 queues a manager exception; the system never silently double-books or moves the customer.
  - **A4: The resource(s) are already at `MAX_ACTIVE_SCHEDULES_PER_RESOURCE`/`MAX_ACTIVE_RESOLVE_PER_OCCURRENCE_SCHEDULES_PER_SERVICE` (50 each — added 2026-08-28, `multivertical-booking_DATA_MODEL.md` §6 item 43)** → Creation is blocked with the same "try a different resource/time, or contact the business" messaging as A1; guards the recurrence-recomputation hot path the same way `CAND-11` A4 does for class templates.
  - **A5: `PENDING_APPROVAL` request reaches `approval_hold_expires_at` with no staff decision** → System auto-cancels it, `cancellation_reason = APPROVAL_EXPIRED`, same mechanic as an expired manual-approval appointment hold. Customer is notified and may request again.
- **Postconditions:** Recurrence is a standing commitment, not a best-effort reminder, once `ACTIVE`. A `PENDING_APPROVAL` request is not yet a commitment and blocks no one else's booking beyond the resource-conflict check already performed at request time.
- **Events Triggered:** `RecurringBookingScheduleCreated` (`AUTO_CONFIRM`) or `RecurringBookingScheduleApprovalRequested` (`MANUAL_APPROVAL`) at creation; `RecurringBookingSchedulePaused`/`Ended`; ordinary booking events for each materialized occurrence. See `multivertical-booking_DATA_MODEL.md` §8.

### **CAND-45b: Staff Approves or Rejects a Recurring Schedule Request**

> Added 2026-08-28, closing the `CAND-45` approval-bypass loophole found on grill-review: without this candidate, a `MANUAL_APPROVAL` service's review gate could be bypassed entirely by requesting a recurring schedule instead of a one-off booking (create, let one occurrence generate, cancel — repeatable at will). Mirrors `CAND-34`'s shape (staff approves/rejects once, in one action), scoped to the schedule itself rather than one class reservation. See `multivertical-booking.md` §9 item 32 and `multivertical-booking_DATA_MODEL.md` §6 item 42.

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** `RecurringBookingSchedule` exists, `status = PENDING_APPROVAL`.
- **Trigger:** A recurring-schedule request reaches `PENDING_APPROVAL` through `CAND-45` and appears in staff's approval queue (same surface as `CAND-34`'s guest-reservation queue, or the existing manual-approval-appointment queue).
- **Main Flow:**
  1. Staff reviews the request: customer, service, recurrence pattern, and resolved/eligible resource(s).
  2. Staff approves or rejects in one action.
  3. On approval, system transitions the schedule to `ACTIVE`, sets `approved_by_staff_id`/`approved_at`, and begins normal rolling-horizon generation (`CAND-45`'s `AUTO_CONFIRM` branch, from this point forward).
  4. On rejection, system transitions the schedule to `CANCELLED`, `cancellation_reason = APPROVAL_REJECTED`. No occurrences were ever generated, so nothing to release.
- **Alternative Flows:**
  - **A1: Request was already resolved by another staff member before this decision commits (race)** → System shows it as already-resolved; this action becomes a no-op, mirrors `CAND-34` A1.
  - **A2: `approval_hold_expires_at` passes before staff decides** → `CAND-45` A5's expiry worker resolves it first; this action is no longer available once that has happened.
- **Postconditions:** A recurring-schedule request is never left in `PENDING_APPROVAL` past its hold deadline, and never becomes a standing commitment without an explicit staff decision (or expiry).
- **Events Triggered:** `RecurringBookingScheduleCreated` (approval) or `RecurringBookingScheduleRejected` (rejection/expiry).

### **CAND-46: Authenticated Customer Creates an Availability Alert**

- **Actor:** Authenticated customer.
- **Preconditions:** Service permits alerts and has availability criteria the customer can express.
- **Trigger:** Customer sees no suitable appointment/reservation availability.
- **Main Flow:** Customer selects service, optional preferred resource, duration/participant criteria, and either a finite absolute range or a weekly local-time preference. System stores an expiring alert attached to that customer without reserving anything. When a released slot matches, it records one deduplicated email/in-app notification attempt for that alert/window.
- **Alternative Flows:**
  - **A1: Unauthenticated visitor** → Directed to login/account creation before an alert can be saved; chosen criteria return with them after authentication.
  - **A2: Alert expires, is cancelled, or was already notified for the matching window** → No new notification is sent and no capacity is held.
- **Postconditions:** Alert is an intent only; customer still books normally after notification.
- **Events Triggered:** Candidate availability-alert-created/cancelled/expired/notified events.

### **CAND-47: System Identifies and Queues a Future Commitment Exception**

- **Actor:** System.
- **Preconditions:** A future materialized booking/session or standing recurrence is affected by a committed resource, hours, closure, template, or schedule change — **excluding** a template date-range/from-date cancellation the manager explicitly initiated via `CAND-32`, whose own step 4 is already that change's explicit, audited resolution (clarified 2026-08-22, see `CAND-32`'s note). This candidate covers a change *nobody explicitly reviewed per-session*: a resource deactivation, an hours reduction, or a side effect of an otherwise-unrelated config edit.
- **Trigger:** A resource is deactivated, closed/maintained, its hours shrink, or a template/schedule change (other than a `CAND-32` range cancellation) affects a future commitment.
- **Main Flow:** System creates one idempotent manager-owned worklist entry per affected commitment, records the impact/deadline, and calculates eligible resource/time alternatives. It never changes the booking itself.
- **Alternative Flows:**
  - **A1: The same unresolved impact already has an open worklist entry** → Update/reuse that entry; never create duplicate manager work.
  - **A2: No safe alternative exists** → The item remains open with an explicit “no compatible alternative” result; manager still chooses keep, contact/reschedule, or cancel in CAND-56.
- **Postconditions:** Existing commitments are never silently invalidated or automatically moved; CAND-56 is the only resolution flow.
- **Events Triggered:** Candidate future-commitment-exception-raised event.

### **CAND-48: Staff or Manager Marks an Appointment as No-Show**

- **Actor:** Staff (STAFF or MANAGER)
- **Preconditions:** The appointment's scheduled end time has passed; the booking is not already terminal.
- **Trigger:** Staff or manager closes the appointment outcome and confirms that the customer did not attend.
- **Main Flow:**
  1. System transitions the appointment to terminal `NO_SHOW` and appends an auditable status transition.
  2. System publishes `BookingNoShow` through the transactional outbox.
  3. Notification Context sends an email using the booking contact snapshot and retries delivery independently if needed.
- **Alternative Flows:**
  - **A1: Appointment has not ended** → System blocks the action.
  - **A2: Booking is already terminal** → System rejects the change as stale; a manager correction follows the correction flow instead.
  - **A3: Manager corrects a mistaken no-show** → System appends a correction transition with actor, reason and timestamp, then emits the appropriate resulting event. Loyalty is awarded only if the resulting state is `COMPLETED`.
- **Postconditions:** No loyalty points are awarded for `NO_SHOW`; no completion event is emitted for the no-show outcome.
- **Events Triggered:** `BookingNoShow`, or the correction/resulting completion event.

### **CAND-49: Customer Edits a Group Reservation's Attendees**

- **Actor:** Authenticated booking customer.
- **Preconditions:** The customer's own SESSION booking has named attendees, is before its service cutoff and has at least one attendee remaining after the requested removal.
- **Trigger:** Customer opens their eligible group class reservation and selects “Editar participantes.”
- **Main Flow:**
  1. Customer selects one or more named attendees to remove.
  2. System records the removal actor, time, and reason.
  3. System atomically reduces `quantity` and the quoted total, releasing the freed seats.
  4. System starts normal waitlist-offer promotion (`CAND-25`) for the released seats.
- **Alternative Flows** (see `customer-10b-editar-grupo-erro.html`):
  - **A1: Adding/replacing attendees, changing an anonymous guest group, or partially changing APPOINTMENT attendees** → Deferred; not supported by this flow.
  - **A2: Removal would leave zero attendees** → Blocked; the customer cancels the whole reservation instead of emptying it via removal.
  - **A3: Inside the service cutoff** → Customer must contact staff; staff may resolve it through the audited exception path instead of self-service.
- **Postconditions:** Remaining attendees retain their reservation without risking the whole group.
- **Events Triggered:** Candidate attendee-removed event, then normal waitlist-offer event when capacity is released.

### **CAND-50: System Expires a Waitlist Offer**

- **Actor:** System.
- **Preconditions:** A `ClassSessionBooking` is `PROMOTION_PENDING` and its `offerExpiresAt` has passed, or the session has started.
- **Main Flow:**
  1. System detects a `PROMOTION_PENDING` booking whose `offerExpiresAt` has passed, or whose session has started.
  2. System atomically transitions the booking to `CANCELLED`, recording an offer-expiry reason.
  3. System releases the whole held quantity.
  4. System notifies the customer.
  5. If the session has not started, system invokes `CAND-25` for the next fitting waitlist entry.
- **Alternative Flows:**
  - **A1: A concurrent customer acceptance races this expiry** → The acceptance wins only if it commits before the expiry transition; the loser receives the already-expired state. The worker is idempotent — safe to retry.
- **Postconditions:** No unaccepted offer holds capacity at or after session start.
- **Events Triggered:** `WaitlistOfferExpired`, then `WaitlistPromoted` when applicable.

### **CAND-51: System Bootstraps a New Tenant From a Preset**

- **Actor:** Manager during tenant onboarding.
- **Preconditions:** Tenant has no published scheduling configuration and the manager has supplied every minimum answer for a supported preset.
- **Trigger:** Manager confirms a business preset and its minimum answers.
- **Main Flow:**
  1. System creates the tenant's default `LOCATION` resource.
  2. System creates services, resources/pools, and working hours in dependency order.
  3. System creates service policies.
  4. For SESSION presets, system also creates the first `ClassScheduleTemplate`(s).
  5. System shows the generated configuration as an editable review.
- **Alternative Flows** (see `manager-14b-onboarding-preset-erro.html` for A3):
  - **A1: A mixed preset (e.g. Preset F)** → May create more than one service family in the same bootstrap.
  - **A2: Invalid minimum answers** → Returns to the relevant wizard step.
  - **A3: Bootstrap failure at any point** → Rolls back the whole configuration; no partially configured tenant is ever published.
- **Postconditions:** Tenant has at least one valid bookable-service configuration without requiring a circular resource/service setup.
- **Events Triggered:** Candidate tenant-scheduling-bootstrapped event after the complete configuration commits.

### **CAND-52: Manager Reactivates a Resource**

- **Actor:** Manager.
- **Preconditions:** Resource is inactive.
- **Trigger:** Manager elects to make a previously unavailable resource usable again.
- **Main Flow:**
  1. Manager reactivates the resource.
  2. Manager confirms its future working hours/eligibility.
  3. System makes it available only for future availability calculations — it does not recreate cancelled sessions or silently alter existing commitments.
- **Alternative Flows:**
  - **A1: Working hours/eligible-service setup is incomplete** → Manager must complete it before the resource can be selected for new work.
- **Postconditions:** Future bookings may use the resource according to its current configuration.
- **Events Triggered:** Candidate resource-reactivated event.

### **CAND-53: Customer Manages an Availability Alert**

- **Actor:** Authenticated customer.
- **Preconditions:** Customer owns an active availability alert for the tenant.
- **Trigger:** Customer opens “Meus avisos.”
- **Main Flow:**
  1. Customer opens "Meus avisos" and views their active alerts.
  2. Customer edits matching criteria or expiry, or cancels an alert.
  3. System expires alerts automatically and sends at most one deduplicated notification per matching availability window.
- **Alternative Flows:**
  - **A1: Alert already notified or expired** → Remains visible as history but cannot be edited/reactivated; customer creates a new alert instead.
- **Postconditions:** Alerts remain non-reserving customer intent; every notification attempt is auditable.
- **Events Triggered:** `AvailabilityAlertUpdated`/`AvailabilityAlertCancelled`/`AvailabilityAlertExpired` (`multivertical-booking_DATA_MODEL.md` §8).

> **Deliberate non-goal, confirmed 2026-08-22:** an alert is never auto-cancelled just because the customer's underlying need happened to be met through a different channel (e.g. a waitlist promotion for one specific session, while the customer's alert covers a broader weekly preference). The two are independent intents by design — a promoted customer may still want to hear about other matching openings — and correlating them would require guessing whether a specific promotion actually satisfies a customer's broader alert criteria, which is exactly the kind of speculative machinery this discovery avoids elsewhere. The customer cancels manually via this candidate when an alert is no longer wanted.

### **CAND-54: Staff Records a Manually Reported Charge at Session Close-Out**

> **Relationship to `CAND-37` clarified 2026-08-24:** this is not payment processing. It elaborates the manual operational record inside `CAND-37`: staff records the reported amount, method, outcome and any correction/reversal reason. Ikaro does not charge the customer, integrate a gateway, settle funds, issue refunds or reconcile accounts.

- **Actor:** Staff (STAFF or MANAGER).
- **Preconditions:** A payable guest or pay-per-class customer attended the session; any charge happened outside Ikaro.
- **Trigger:** Staff closes the class roster and sees a payable attendee reservation.
- **Main Flow:**
  1. Staff records the externally reported amount, method, outcome (`PAID`, `UNPAID` or `WAIVED`), collector and time for a payable attendee.
  2. If a correction is needed, staff never overwrites the original record — system creates an audited reversal/correction entry instead.
- **Alternative Flows:**
  - **A1: A contract or solo free-trial reservation** → No payment-due action; nothing to record.
  - **A2: A duplicate collection attempt** → Blocked by the booking/method policy, unless it is an explicit reversal/correction.
- **Postconditions:** Attendance and the minimal operational charge record are independently auditable. Payment processing, invoicing and reconciliation remain out of scope.
- **Events Triggered:** Candidate in-person-payment-recorded/reversed event.

### **CAND-55: Reserved — Superseded by CAND-38**

> **Resolved 2026-08-22.** This candidate and `CAND-38` ("Customer Reschedules a Skipped Fixed-Class Occurrence to a Replacement Slot") describe the identical feature — "reposição"/make-up for a skipped recurring-enrollment occurrence — drafted twice under two numbers, at two different detail levels, with a direct contradiction between them: this entry claimed a new `MakeUpReservationCreated` event was needed, while `CAND-38` explicitly states "no new event type — reuses the existing `ClassSessionBookingCancelled`/`ClassSessionBookingConfirmed`/`Waitlisted`." `CAND-38` is the authoritative version — it's schema-grounded (`rescheduled_from_id`, `classAllowsReschedule`/`classRescheduleWindowDays`/`classMaxReschedulesPerCycle`), ties to a real prototype screen (`customer-04d-reagendada.html`), and its "no new event" answer is correct: the replacement booking's confirmation/waitlisting already publishes its own normal event, and the original's cancellation already publishes `ClassSessionBookingCancelled` with `reason: ENROLLMENT_OCCURRENCE_SKIPPED`. Retained here only for numbering continuity, same pattern as `CAND-15b` → `CAND-37`. Do not implement from this entry.

### **CAND-56: Manager Resolves a Future Commitment Exception**

- **Actor:** Manager.
- **Preconditions:** An open CAND-47 worklist item exists and the manager can view the affected commitment.
- **Trigger:** A resource/template/hours change affects a future booking or session.
- **Main Flow:**
  1. Manager reviews the impact and any safe alternatives on an open `CAND-47` worklist item.
  2. Manager explicitly chooses: keep, reassign, reschedule, or cancel.
  3. System records the decision, actor, reason, and notification outcome after the chosen change commits.
- **Alternative Flows:**
  - **A1: A proposed reassignment/reschedule becomes unavailable at commit (race)** → Revalidated at commit time; if now unavailable, the worklist stays open and the original commitment remains intact.
  - **A2: Item is genuinely resolved or non-impacting** → Manager may dismiss it with a reason, instead of choosing one of the four actions above.
- **Postconditions:** No future commitment is silently moved or invalidated.
- **Events Triggered:** Candidate future-commitment-exception-resolved/dismissed event and any resulting booking/session event.

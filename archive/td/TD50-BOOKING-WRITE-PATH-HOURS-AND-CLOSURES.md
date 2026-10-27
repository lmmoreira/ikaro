# TD50 — Booking write path ignores working hours, closures and openings

## Status
- **Type**: Technical Debt / Correctness (Booking — scheduling rules)
- **Priority**: Medium (the public booking page and the staff booking screen only offer open slots, so a normal user never hits it; the exposure is a direct API call, a page left open while a closure is created, and any future client that does not read availability first)
- **Context**: apps/backend — booking context; apps/bff — booking feature (error pass-through only); apps/web — public booking flow and staff booking flow (error routing); packages/types, packages/i18n
- **Created**: 2026-10-10
- **Discovered**: reviewing M23-S39 (staff books on a customer's behalf, PR #586): a staff booking on a closed day returned 201, and probing showed a guest booking does too
- **Decision status**: Complete. Story 0 done (#683), Story 1 done (#684), Story 2 done (discovered 2026-10-27). Archived.
- **Related**: M23-S18 (the recurring-schedule check this reuses), M23-S39, M23-S33 (the booking-window check this sits beside), M23-S08 (the future-commitment worklist reschedule), UC-001, UC-002, UC-004, UC-069, UC-108, `docs/BUSINESS_LOGIC_REFERENCE.md` § Creation-time checks — hours and closures, occupancy

## Problem

When a one-off booking is created, rescheduled or approved with a new time, the backend checks only that no other booking occupies the same resource at that time (`persistRequestedBooking` → `assertSlotFree` → `findConflictingResourceIds`). It never asks whether the tenant, or the resource, is **open** then. Working hours, full-day and partial closures, resource-scoped closures and schedule openings are applied only by the availability **read** (`AvailabilityService.windowHoursVerdict`, used by `GET /schedule/availability`), which is what the booking page uses to decide which slots to show.

Reproduced on 2026-10-10 against a real database (default tenant hours Mon–Fri 09:00–18:00, Sat 09:00–17:00, Sun closed; timezone America/Sao_Paulo). Each row is a guest `POST /bookings` for a 30-minute service; the availability read for the same day does not list the slot in any row but the control:

| Case (tenant-local) | `GET /schedule/availability` lists the slot | `POST /bookings` |
|---|---|---|
| Monday 10:00 (control) | yes | 201 |
| Sunday 10:00 (normally closed) | no | **201** |
| Tuesday 06:00 and 20:00 (outside 09–18) | no | **201** |
| Wednesday 10:00, full-day closure | no | **201** |
| Thursday 10:30, inside a 10:00–12:00 partial closure | no | **201** |
| Thursday 14:00, same day, outside the closure | yes | 201 |
| Friday 10:00, only the ROOM resource closed that day | no | **201** |
| Sunday 15:00 with an opening 09:00–12:00 (outside it) | no | **201** |

The staff route (`POST /bookings/staff`) returned 201 on a closed day as well, with status `APPROVED`. Reschedule (customer and admin) and approve-with-a-new-time go through the same occupancy-only step; no hours or closure reference exists in `reschedule-booking-in-transaction.helpers.ts`, `reschedule-booking-as-customer.use-case.ts`, `reschedule-booking.use-case.ts` or `approve-booking.use-case.ts`. The web submit hook (`useBookingSubmission.ts`) sends the slot chosen earlier and re-fetches only the resource options after an error, so nothing between the page and the database re-checks the schedule.

The rule already exists and is already enforced for one flow: a **recurring schedule** checks working hours and closures when it is requested and again when it is approved (M23-S18, `recurring-booking-schedule-hours.helpers.ts`: `loadHoursScheduleData` + `evaluateHours`, whose verdict per window is `AvailabilityService.windowHoursVerdict` — "the same rule availability applies"). `docs/BUSINESS_LOGIC_REFERENCE.md` documents it as "Creation-time checks — hours and closures, occupancy". One-off bookings have only the occupancy half.

### Why this matters
The booking page hides closed slots, so the promise "the business is closed then" is kept only by the client. A page open while a manager adds a closure, a hand-built request, or any second client (the staff screen, an integration) can create a booking the business has said it cannot serve. A `PENDING` booking is then in a manager's queue for a time that is closed; a staff booking is `APPROVED` straight away.

## Chosen approach (drafted 2026-10-10; revised by Story 0's discovery, 2026-10-26)

- Reuse the recurring rule; do not write a second one. The rule is `AvailabilityService.windowHoursVerdict`. Move `loadHoursScheduleData`, `evaluateHours` and their types out of the `recurring-` file into a neutral `schedule-hours.helpers.ts` (the recurring code imports it from there) and expose the per-window verdict they are built on. A one-off booking is **not** "a call with one occurrence": a basket has one window per line and a legged service one per leg, each with its own resource, so the one-off check is a verdict **per resource candidate** over that candidate's own `[startsAt, endsAt)`, which is exactly what availability judges (`enoughCandidatesFree` → `isWindowFree`).
- Hours must also steer resource **selection**, not only audit it: `AUTO_ANY` and `AUTO_FUNGIBLE_POOL` pick by occupancy and workload alone, so a check after the pick would refuse a slot availability offers whenever the lowest-workload resource is closed (its own working hours, or a resource-scoped closure) and another is open. Closed or out-of-hours resources are excluded in `preferFreeResources` exactly like busy ones, then every chosen candidate is verified.
- Run it inside the booking transaction, after the resource locks, before the occupancy check. No new lock: booking creation takes only the service and resource locks, and a closure that commits while a booking is in flight is indistinguishable from the booking having been made first (closing a day never looks at existing bookings).
- Existing bookings are never re-checked; a closure added later does not cancel anything (that is M23-S08's worklist).
- Refusals are new, typed domain errors with their own codes in `@ikaro/types` and both locale files (one for a closed day or closure, one for outside working hours), mapped in `booking-error.mapper.ts`.

## Non-goals
- Retroactively cancelling or flagging bookings already inside a newly created closure (M23-S08).
- Changing the availability read.
- Changing recurring schedules (they already enforce this).
- A manager override that books outside hours: not decided; see the first open question for Story 0.

## Stories

### Story 0 — Enforce hours, closures and openings when a one-off booking is created ✅ Done

**Agent:** backend-ts + bff-ts (BFF: `.http` only)
**Complexity:** L (the check is small; the selection change and the test migration are not)
**Docs to load:** `docs/USE_CASES.md` UC-001, UC-002, UC-108, UC-010 (closures and openings), UC-070 A1; `docs/BUSINESS_LOGIC_REFERENCE.md` § Creation-time checks — hours and closures, occupancy and § Booking Window; `docs/TENANTS_SETTINGS_SCHEMA.md` § Business Hours; `docs/ENGINEERING_RULES_BACKEND.md` § Transactions, § Choosing a race-condition primitive; `docs/ENGINEERING_RULES_SHARED.md` § Adding a new error — checklist; `docs/ENGINEERING_RULES_TESTING.md` § Shared test-builder date defaults, § An E2E test that computes "today"; `docs/API_CONTRACTS.md` § Booking Requests; `docs/ERROR_CATALOG.md` § Code Origins; `docs/LOCK_CATALOG.md` § 3 (A1, A3) and § 5; `docs/ANTI_PATTERNS.md`
**Dependencies:** none (the recurring check from M23-S18 is already merged)
**Pattern:** plain composition — one per-window verdict primitive (`windowHoursVerdict`) shared by availability, the recurring check and the one-off check; an optional hours input on the resource-resolution context so selection and verification use the same verdict. No new named pattern.

**Discovered:** 2026-10-10, reviewing M23-S39; reproduced against a real database (table in the Problem).
**Root cause:** `persistRequestedBooking` (`booking-request.helpers.ts`) resolves candidate resources and calls `assertSlotFree`, which asks `findConflictingResourceIds` about other bookings only; nothing calls `AvailabilityService.windowHoursVerdict` or loads closures/openings on this path.

**Description:**
Make `POST /bookings`, `POST /bookings/authenticated` and `POST /bookings/staff` refuse a start that availability would not offer, and make resource selection prefer a resource that is open.

1. **Shared module.** Create `schedule-hours.helpers.ts` holding the loader and its types (`loadHoursScheduleData`), the day lookup, and one exported per-window verdict function (a resource, its window, the day lookup, the tenant business hours → `FREE | CLOSED | OUTSIDE_HOURS`). `evaluateHours` and `findHoursConflicts` stay in the recurring file, rebuilt on that verdict: their input and output types (`RecurrenceOccurrence`, `RecurringScheduleOccurrenceConflict`) are recurrence-specific, and moving them would only have put those types in a neutral file.
2. **Hours input to resolution.** `resolveBookingLinesResourceCandidates` takes an optional `hoursSource` (the two repositories and the tenant business hours). When present, after the lock step it loads closures and openings once (the four existing reads: tenant-wide and resource-scoped, for the resource ids already cached by the lock step) for every tenant-local date any candidate window can touch, and builds the day lookup onto the resolution context. When absent (approve, reschedule, reassign, the worklist today) behavior is byte-identical to today.
3. **Selection.** In `preferFreeResources`, a resource whose window verdict is not `FREE` is treated like a busy one (the same fallback: if fewer than `requiredQuantity` remain, return the full list so the verification below refuses with the right reason, never a misleading "type unavailable"). Applies to `AUTO_ANY` and `AUTO_FUNGIBLE_POOL`. `CUSTOMER_CHOICE` and `NONE` are not narrowed (a pick is the customer's; the MVP has one `LOCATION`); they are verified.
4. **Verification.** In `resolveAndCheckCandidates`, after resolution and before `assertSlotFree`, every candidate is judged over its own `[startsAt, endsAt)` (which already carries the line's buffer and the resource's turnover) on its own tenant-local start date. The first refusing candidate, in candidate order, names the reason. Hours are checked before occupancy, so a closed day reports "closed" rather than "taken".
5. **Same rule as availability, by construction.** Per requirement, `requiredQuantity` candidates must be open and free; every requirement of every line and leg must be satisfied, so a bundle needs all its requirements open and an `AUTO_*` requirement needs one open unit.

**Decisions locked at discovery (2026-10-26):**
1. **No staff or manager exemption.** UC-108 step 3 already promises closures apply; recurring schedules created by staff are not exempt either. (The only staff exemption in the booking path is the minimum notice, M23-S33.) A walk-in outside published hours would be its own story and permission.
2. **`409`, two codes:** `BOOKING_SLOT_CLOSED` (closed day, full or partial closure, resource closure) and `BOOKING_OUTSIDE_BUSINESS_HOURS` (day open, window outside its hours). They mirror the recurring `CLOSED` / `OUTSIDE_HOURS` reasons and sit beside `BOOKING_SLOT_UNAVAILABLE`, so the booking page treats them as "pick another slot" (Story 2).
3. **Resource-scoped closures and bundles:** as item 5 above; no separate rule.
4. **Business hours come from `RequestContext` (`settings.businessHours`), passed by the controller,** exactly as the availability controllers do, so both sides read the same value (including the same cache lag after a settings change). They are not read through the platform port the recurring path uses.
5. **No new lock.** Booking creation does not take the tenant-day lock (A1), and `docs/DATABASE_SCHEMA.md` still claims it does (stale since M22-S03; fixed here). A closure committing during a booking transaction is equivalent to the booking having been made first, because closing a day never scans existing bookings. `docs/LOCK_CATALOG.md` records this under § Known hazards, and says that any later story that makes a closure act on existing bookings must take A1 in booking creation.
6. **Existing tests are migrated, not hidden.** A shared helper returns the next open weekday slot in tenant time; integration specs stop booking at fixed UTC times and `futureDate(n)` days (06:00 and 07:00 local, or a Sunday, are now refused). Seeding integration tenants with 24/7 hours was rejected as a workaround that hides the check in every other spec.

**Known limit, accepted:** `NONE` with several eligible resources keeps its first-eligible pick (not reachable in the MVP). A window that runs into the next local day is refused as outside the hours (fixed in `windowHoursVerdict`, so the availability read applies it too).

**Backend use case steps:** the three creation use cases gain `businessHours` on their input and the two schedule repositories on their `persistRequestedBooking` deps; `persistRequestedBooking` builds the `hoursSource`; resolution and verification as above.
**Backend HTTP surface:** reuses `POST /bookings`, `POST /bookings/authenticated`, `POST /bookings/staff`; each gains the two refusals in its error list in `docs/API_CONTRACTS.md`.
**BFF endpoint spec:** none — the BFF forwards the backend problem response unchanged; add the new error blocks to the BFF `.http` file.
**New migration / i18n keys / env vars / feature flags:** no migration; two new error codes in `packages/types/src/error-codes.ts` with entries in **both** `packages/i18n/locales/pt-BR/errors.json` and `packages/i18n/locales/en/errors.json` (the web exhaustiveness test fails otherwise); no env var, no flag.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/use-cases/schedule-hours.helpers.ts` (+ `.spec.ts`) (new — the loader, the day lookup and the per-window verdict, moved out of the recurring file)
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-hours.helpers.ts` and `.spec.ts` (modify — keeps `evaluateHours` / `findHoursConflicts`, now built on the shared verdict)
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.ts`, `approve-recurring-booking-schedule.use-case.ts` (modify — imports)
- `apps/backend/src/contexts/booking/application/use-cases/resource-occupancy.helpers.ts`, `resource-resolution-context.helpers.ts`, `resource-requirement-resolution.helpers.ts` (+ specs) (modify — optional `hoursSource`, the lookup on the context, the hours-aware `preferFreeResources`)
- `apps/backend/src/contexts/booking/application/use-cases/booking-request.helpers.ts` (+ `.spec.ts`) (modify — the verification step in `resolveAndCheckCandidates`; deps gain the closure and opening repositories; params gain `businessHours`)
- `apps/backend/src/contexts/booking/application/use-cases/request-booking.use-case.ts`, `request-authenticated-booking.use-case.ts`, `create-booking-by-staff.use-case.ts` (+ specs) (modify — inject the repositories, take `businessHours`)
- `apps/backend/src/contexts/booking/infrastructure/controllers/booking.controller.ts` (+ spec) (modify — pass `settings.businessHours`)
- `apps/backend/src/contexts/booking/domain/errors/booking-schedule.error.ts` (modify — the two typed errors, with `Object.setPrototypeOf`) and `booking-domain.error.spec.ts`
- `apps/backend/src/contexts/booking/infrastructure/http/booking-error.mapper.ts` (+ spec) (modify — one spread of `split-error-groups.ts`, which composes the availability-alert, recurring-schedule and new `booking-hours-error-groups.ts` status groups; the mapper was at its file-length limit)
- `packages/types/src/error-codes.ts`, `packages/i18n/locales/pt-BR/errors.json`, `packages/i18n/locales/en/errors.json` (modify)
- `apps/backend/src/test/utils/date-helpers.ts` (+ spec) (modify — the next-open-slot helper, derived from the test tenant's hours and timezone, never a hardcoded date)
- Every integration spec that creates a booking through `POST /bookings*` or seeds one with a fixed `scheduledAt` (find them with `grep -rln "scheduledAt" apps/backend/src --include=*.integration.spec.ts`: the booking, loyalty, attachments, fungible-pool and recurring specs among them), and the unit specs of the three use cases and `persistRequestedBooking` (modify — valid open slots; in-memory closure and opening repositories, not `jest.fn()`)
- `apps/backend/src/contexts/booking/infrastructure/controllers/booking-by-staff.controller.integration.spec.ts`, `booking.controller.integration.spec.ts` (modify — the closed-day, off-hours, partial-closure, resource-closure scenarios)
- `apps/web/e2e/**` (check — any helper that seeds a booking through the API at a fixed time; the browser flows pick slots from availability and should be unaffected)
- `apps/backend/http/booking/bookings.http`, `apps/bff/http/bookings/bookings.http` (modify)
- `docs/USE_CASES.md` (UC-001, UC-002, UC-108: the new alternative flow), `docs/API_CONTRACTS.md`, `docs/ERROR_CATALOG.md`, `docs/BUSINESS_LOGIC_REFERENCE.md` (one-off subsection beside the recurring one, with the selection rule), `docs/LOCK_CATALOG.md` (§ 5 note), `docs/DATABASE_SCHEMA.md` (line 403: remove the stale "shared with the slot-conflict check" claim) (modify)
- Stale sweep: grep `docs/`, `plan/*_IMPLEMENTATION_DETAILS_*.md`, `.claude/**` and `scripts/**` for `recurring-booking-schedule-hours.helpers` and fix any reference the move leaves behind

**Acceptance criteria — product:**
- [ ] A guest, a customer and a staff member cannot create a booking for a time the business is closed (day of week, full-day closure, partial closure) or outside its working hours; the response says which of the two it is.
- [ ] A resource-scoped closure refuses a booking that needs that resource, and does not refuse one that can use another open resource.
- [ ] When several resources could serve an automatic requirement, a closed one is never chosen while an open one is free.
- [ ] A schedule opening on a normally-closed day makes bookings inside the opening possible and refuses those outside it.
- [ ] A booking inside open hours and outside every closure is created exactly as before.
- [ ] Bookings that already exist are not touched.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `schedule-hours.helpers.spec.ts`: the moved cases, plus the per-window verdict for each of FREE, CLOSED, OUTSIDE_HOURS
  - [ ] **Parity:** for a table of dates, times, closures, openings and resource hours, the one-off verdict equals `AvailabilityService.windowHoursVerdict`, and a slot availability lists is accepted while one it omits is refused
  - [ ] **Selection:** `AUTO_ANY` with the lowest-workload resource closed (its own hours, and separately a resource-scoped closure) and a second resource open and free picks the second; `AUTO_FUNGIBLE_POOL` likewise; with no open resource left the full list is returned and the refusal names the hours reason, not "type unavailable"
  - [ ] `persistRequestedBooking`: closed, outside hours, opening extends hours, resource-scoped closure, a bundle where one requirement's resource is closed, a two-line basket whose second line ends after closing, a legged service whose last leg runs past closing, hours refused before occupancy when both apply
  - [ ] Without `hoursSource`, `resolveBookingLinesResourceCandidates` returns exactly what it returns today (approve and reschedule specs pass unmodified)
  - [ ] The three entry points each refuse a closed day (one use-case test each), and the staff entry point is not exempt
  - [ ] **Negative guarantee, own test:** an existing booking inside a closure created later is not changed or re-validated by any read or write path
  - [ ] **Fixed cost:** the hours reads are four, whatever the number of lines or resources (repository call counts asserted)
  - [ ] Recurring-schedule specs pass unmodified apart from their imports
- Integration:
  - [ ] `POST /bookings`, `POST /bookings/authenticated`, `POST /bookings/staff` each return the new refusals for the closed-day, off-hours, partial-closure and resource-closure cases against a real database, and 201 for the control
  - [ ] A closure committed before the POST is honored by it (the check reads inside the booking transaction, after the locks)
  - [x] The migrated existing specs pass whatever today's weekday is. Method, changed at implementation: the integration suites run against a real database and its timers, so the system clock is not faked. The date helpers derive every start from today's date and the tenant's hours, and are unit-tested under a fixed clock on a Friday, a Saturday and a Sunday (`date-helpers.spec.ts`); the booking, loyalty, notification and outbox integration suites were also run with the helpers' day base shifted by 2, 5 and 6 days (today then looks like a Wednesday, a Saturday and a Sunday). The only failures were the three window tests whose limits are measured from the real clock, which the shift itself invalidates.
- Tenant isolation:
  - [ ] Tenant B's closure does not refuse Tenant A's booking on the same date
- E2E: none — server-side; Story 2 owns the browser scenario. The e2e API-seeding helpers are checked (files list) and fixed if they book at a fixed time.
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

### Story 1 — Enforce the same rule when a booking is rescheduled or approved at a new time ✅ Done

**Agent:** backend-ts + bff-ts
**Complexity:** M
**Docs to load:** `docs/USE_CASES.md` UC-003 (approve), UC-069 (reschedule), UC-073, UC-077 (worklist RESCHEDULE); `docs/BUSINESS_LOGIC_REFERENCE.md` § Creation-time checks — hours and closures, occupancy, § Booking Window and the future-commitment worklist section; `docs/ENGINEERING_RULES_BACKEND.md` § Transactions; `docs/ENGINEERING_RULES_SHARED.md` § Adding a new error — checklist; `docs/API_CONTRACTS.md` § Booking lifecycle; `docs/LOCK_CATALOG.md` § 3, § 5, H6; `docs/ANTI_PATTERNS.md`
**Dependencies:** TD50 Story 0 (the shared check and its errors; ✅ Done, #683)
**Pattern:** plain composition — the same `schedule-hours.helpers.ts` call from the shared reschedule transaction helper and from the approval step; no new pattern.

**Discovered:** 2026-10-10, same probe as Story 0; the reschedule and approve use cases were read and contain no hours or closure reference.
**Root cause:** `reschedule-booking-in-transaction.helpers.ts` re-resolves candidates and calls `assertSlotFree` only; `approve-booking.use-case.ts` does the same when approval carries a new `scheduledAt`.

**Description:**
Apply Story 0's check wherever a booking is about to become (or stay) a commitment at a time: the customer reschedule (`PATCH /bookings/:id/reschedule-customer`), the admin reschedule, the worklist's RESCHEDULE, and every approval (with or without a new `scheduledAt`). A reschedule or approval for a closed or off-hours time is refused with Story 0's errors and leaves the booking unchanged. The window is judged exactly as at creation (the service span plus buffer and turnover, each candidate's own hours, closures, openings; an `AUTO_*` requirement steers to an open resource, a `CUSTOMER_CHOICE` pick is never swapped).

**Decisions locked at discovery (2026-10-27):**
1. **No staff or manager exemption** on the admin reschedule or approve-with-new-time (same as Story 0 decision 1; UC-069 A3 already says staff never bypass capacity or exclusivity).
2. **No worklist exemption.** The worklist RESCHEDULE goes through the same transaction helper, so a closed or off-hours target leaves that entry `STILL_OPEN` with `errorCode` `BOOKING_SLOT_CLOSED` / `BOOKING_OUTSIDE_BUSINESS_HOURS` (the existing per-entry failure path); the booking and the entry are unchanged. The worklist's REASSIGN does not change the time and is **not** gated.
3. **Approval always checks the hours, also at the booking's original time.** Otherwise a request made before a closure could be approved into it, which a direct staff booking (UC-108) cannot do; this mirrors the recurring schedule's re-check at approval. A booking refused this way stays `PENDING`/`INFO_REQUESTED`; staff approve with a new open time or reject. This is a creation-time rule only: a booking that is already `APPROVED` is never re-checked by a closure created later, and complete, cancel, no-show, reject, request-info and the worklist's REASSIGN are not gated.
4. **Business hours come from `RequestContext` (`settings.businessHours`)**, passed by each controller, as in Story 0. `hoursSource` becomes mandatory in `RescheduleBookingInTransactionDeps`, so no caller can forget it.
5. **No new lock.** The hours reads follow the resource locks, as in creation (`docs/LOCK_CATALOG.md` H6 covers these three paths too).
6. **Existing specs are migrated** onto Story 0's next-open-slot helper, not hidden behind 24/7 hours.

**Backend use case steps:** `RescheduleBookingAsCustomerUseCase`, `RescheduleBookingUseCase` and the worklist reschedule call the shared transactional helper, which builds the `hoursSource` and passes it to the candidate resolution (hours checked before occupancy); `ApproveBookingUseCase` passes it on every approval.
**Backend HTTP surface:** reuses `PATCH /bookings/:id/approve`, `PATCH /bookings/:id/reschedule-customer`, `PATCH /bookings/:id/reschedule-admin` and `POST /scheduling-exceptions/resolve`; add the two refusals to their documented errors.
**BFF endpoint spec:** none — pass-through; add blocks to the BFF `.http`.
**New migration / i18n keys / env vars / feature flags:** none (the error codes and translations come from Story 0).

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/use-cases/reschedule-booking-in-transaction.helpers.ts` (+ spec) (modify — deps gain the closure and opening repositories, params gain `businessHours`; builds the `hoursSource`)
- `apps/backend/src/contexts/booking/application/use-cases/reschedule-quote.helpers.ts` (+ spec) (modify — `ResolveRescheduleCandidatesParams` and `toCandidatesParams` carry `hoursSource`)
- `apps/backend/src/contexts/booking/application/use-cases/reschedule-booking-as-customer.use-case.ts`, `reschedule-booking.use-case.ts`, `approve-booking.use-case.ts` (+ specs) (modify — inject the repositories, take `businessHours`)
- `apps/backend/src/contexts/booking/application/use-cases/future-commitment-reschedule.helpers.ts`, `resolve-future-commitment-exceptions.use-case.ts` (+ specs) (modify — the worklist deps and `businessHours` on its input)
- `apps/backend/src/contexts/booking/infrastructure/controllers/booking-completion.controller.ts` (reschedule routes), `booking-lifecycle.controller.ts` (approve), `scheduling-exception.controller.ts` (worklist resolve) (+ specs) (modify — pass `settings.businessHours`)
- `apps/backend/src/contexts/booking/infrastructure/controllers/booking.controller.integration.spec.ts` and the reschedule, approve and worklist integration specs (modify — hours scenarios; existing fixed-time specs migrated onto the next-open-slot helper; find them with `grep -rln "reschedule\|approve\|scheduling-exceptions" apps/backend/src --include=*.integration.spec.ts`)
- `apps/backend/http/booking/bookings.http`, `apps/bff/http/bookings/bookings.http`, and the scheduling-exceptions `.http` files in both apps (modify)
- `docs/USE_CASES.md` (UC-003 and UC-069 alternative flows, UC-077 RESCHEDULE), `docs/API_CONTRACTS.md` (approve, both reschedule routes, resolve), `docs/BUSINESS_LOGIC_REFERENCE.md` (replace the "Not covered here" line in the recurring section with the one-off reschedule and approve rule; worklist RESCHEDULE note), `docs/LOCK_CATALOG.md` (§ 3, § 5 and H6 cover reschedule, approve and the worklist reschedule) (modify)

**Acceptance criteria — product:**
- [ ] A customer or staff member cannot reschedule a booking to a closed or off-hours time; the booking keeps its old time.
- [ ] Approving a booking whose time (new or original) is closed or off-hours is refused and the booking stays pending (or info-requested); staff can approve with a new open time or reject.
- [ ] The worklist's reschedule to a closed or off-hours time leaves its entry open with the refusal's code.
- [ ] Rescheduling or approving at an open time still works, including the existing minimum-notice and cancellation-window rules.
- [ ] A booking that is already approved is not changed by a closure created later.

**Acceptance criteria — technical:**
- Unit:
  - [ ] The shared reschedule helper refuses closed, outside-hours and resource-closed targets and leaves the aggregate and occupancy unchanged; hours are refused before occupancy when both apply
  - [x] Selection on reschedule: carried by Story 0's resolution specs (`preferFreeResources` is the same code on every path, `hoursSource` now reaches it); this story pins the wiring with the closed-day, off-hours, partial-closure and resource-closure cases on the reschedule helper
  - [ ] Approve refuses a closed target both with a new `scheduledAt` and at the original time, and an open one succeeds
  - [ ] Staff and manager are not exempt on admin reschedule or approve (one test each)
  - [ ] Worklist RESCHEDULE to a closed target returns `STILL_OPEN` with the error code, the entry unchanged
  - [ ] **Negative guarantee, own test:** the worklist's REASSIGN of a booking that sits inside a closure is not blocked
  - [x] **Negative guarantee, own test:** cancel and reject of a booking inside a closure are not blocked (integration, `booking-reschedule-approve-hours.controller.integration.spec.ts`); those use cases take no hours dependency at all, so complete and no-show hold by construction
  - [ ] **Fixed cost:** the hours reads stay four, whatever the number of lines or resources
- Integration:
  - [ ] Customer reschedule, admin reschedule, approve (new and original time) and the worklist reschedule each refuse a closed day against a real database and succeed for an open one
  - [ ] A closure created after a booking was approved leaves that booking unchanged
- Tenant isolation:
  - [ ] Tenant B's closure does not refuse Tenant A's reschedule or approval
- E2E: none — covered by Story 2 for the customer reschedule screen
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

### Story 2 — The booking, reschedule and staff screens route the new refusals correctly ✅ Done

**Agent:** web-ts
**Complexity:** M (the routing is small; the staff screens, the specs and two E2E scenarios are not)
**Docs to load:** `docs/DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/ENGINEERING_RULES_SHARED.md` § Authoring new i18n UI copy keys, `docs/TESTING_STRATEGY.md` § apps/web Testing Infrastructure, `journeys/guest/book-a-service.md`, `journeys/customer/book-a-service.md`
**Dependencies:** TD50 Story 0 (✅ Done, #683); TD50 Story 1 (✅ Done, #684)
**Pattern:** plain composition — two entries in the existing submit-error routing table (`CODE_TARGETS` in `booking-steps.ts`), one new failure kind in the existing reschedule classifier, and a code-aware body on the existing `SlotConflictAlert`; no new pattern.

**Description:**
The public booking flow already sends a slot conflict (`BOOKING_SLOT_UNAVAILABLE`) back to the date step with everything else kept. `BOOKING_SLOT_CLOSED` and `BOOKING_OUTSIDE_BUSINESS_HOURS` (409, TD50 Story 0/1) take the same route so a stale page recovers instead of showing a generic error. The same holds on the customer reschedule screen (M23-S30), and the staff booking screen (M23-S40) inherits it through the shared step engine. The staff approve and admin reschedule screens treat any 409 as "slot taken" and would say "foi ocupado" for a closed day; they get the right wording.

**Decisions locked at discovery (2026-10-27):**
1. **Booking page and staff booking screen:** both codes map to `availability` in `CODE_TARGETS`, beside `SLOT_UNAVAILABLE`, which stays unchanged. The message is the catalogue text already in both `errors.json` files ("O negócio está fechado no horário solicitado." / "O horário solicitado está fora do horário de funcionamento."); no new keys.
2. **Customer reschedule:** `classifyRescheduleFailure` gains a `slotClosed` kind for both codes. It shows the catalogue message with `conflictHint` and `shouldReloadSlots` is true for it, exactly like `slotTaken`. `generic` and `windowExpired` handling is unchanged.
3. **Staff approve and admin reschedule:** `SlotConflictAlert` takes the error code; for the two new codes its body shows the catalogue message (title stays "Horário não disponível"), for `SLOT_UNAVAILABLE` the existing "foi ocupado" body. Alternative slots are offered as today. No new `web.json` keys.
4. **Worklist reschedule:** `assertEntryRescheduled` maps the two codes to 409 (with `SLOT_UNAVAILABLE`), so the reschedule page gets alternatives instead of plain text.
5. **A refusal drops the refused slot (added during the PR review, 2026-10-27).** On the public and staff booking pages the customer returns to the date step with the slot cleared and the slot list reloaded, so the refused time cannot be resubmitted by pressing Next. The page already did this for `BOOKING_BUNDLE_PARTIALLY_UNAVAILABLE` and `BOOKING_LEG_UNAVAILABLE` (`CLEARS_SLOT` in `useBookingFormCore.ts`); `BOOKING_SLOT_UNAVAILABLE`, `BOOKING_SLOT_CLOSED` and `BOOKING_OUTSIDE_BUSINESS_HOURS` join that set. Everything else the customer chose is kept.
6. **E2E isolation:** a resource-scoped closure on a freshly seeded ROOM (the `seedSingleRoomService` pattern in `booking-submit-routing.spec.ts`), never a tenant-wide closure on the shared test tenant.

**Prototype references:** `journeys/guest/prototypes/book-a-service/02e-slot-conflict.html` is the pattern for the date-step error; the customer journey already records "no screen here". No prototype change.
**New migration / i18n keys / env vars / feature flags:** none.
**UI reuse:** no new control; `SlotConflictAlert`, `ErrorAlert` and the existing step error states are reused.

**Files to create/modify:**
- `apps/web/features/booking/model/booking-steps.ts` (+ `booking-steps.spec.ts`) (modify — both codes in `CODE_TARGETS`)
- `apps/web/features/booking/hooks/useBookingFormCore.ts` (modify — the slot-taken and the two new codes clear the selected slot) (+ the `BookingForm.spec.tsx` cases)
- `apps/web/features/booking/model/reschedule-failure.ts` (+ spec) (modify — `slotClosed` kind, reload on it)
- `apps/web/features/customer/components/my-account/CustomerReschedulePage.tsx` (+ spec) (modify only if `describeFailure` needs the new kind's hint)
- `apps/web/features/booking/model/scheduling-exception-reschedule.ts` (+ spec) (modify — 409 for the two codes)
- `apps/web/features/booking/components/dashboard/bookings/SlotConflictAlert.tsx` (+ spec) (modify — code-aware body)
- `apps/web/features/booking/model/booking-approve-action.ts`, `RescheduleBookingPage.tsx`, `BookingDetailPage.tsx`, `BookingQueuePage.tsx` (+ specs) (modify — pass the code to the alert)
- `apps/web/features/booking/components/public/BookingForm.tsx` (+ spec) (check — only the new-code component cases)
- `apps/web/app/dashboard/bookings/[id]/page.tsx` (modify — passes the queue shortcut's `?reason=` code to `BookingDetailPage`; added at implementation, the queue sends the approver to the detail page and the code would otherwise be lost)
- `apps/web/features/booking/hooks/useInitialSlotSuggestions.ts` (+ spec) (new — `BookingDetailPage`'s initial alternatives fetch moved out of the component, which was at its file-length limit)
- `apps/web/e2e/booking-submit-routing.spec.ts`, `apps/web/e2e/my-account-reschedule.spec.ts` (modify — the two scenarios), `apps/web/e2e/helpers/booking-form/seeds.ts` (modify — `seedSingleRoomService` moved here from the routing spec so both specs share it)
- `journeys/guest/book-a-service.md` (lines 32, 82), `journeys/customer/book-a-service.md` (line 45), both `book-a-service` `dev-notes.md` (the routing table and error-handling paragraph), `journeys/customer/prototypes/minha-conta/dev-notes.md` (§ Reagendar) (modify — record the new routes)

**Acceptance criteria — product:**
- [ ] If the chosen time closes while the booking page is open, submitting returns the customer to the date step with their other choices kept and a message that the business is closed or the time is outside business hours.
- [ ] The same holds on the customer reschedule screen: the message shows, the slot list reloads, and the booking keeps its original time.
- [ ] Staff approving a booking, or rescheduling one, to a closed or off-hours time see a message saying so (not "foi ocupado") and are offered alternative slots.
- [ ] The worklist reschedule to a closed or off-hours time shows the message and alternatives.
- [ ] After any of these refusals on the booking page the refused time is no longer selected, "Próximo" is disabled until another time is chosen, and the list is reloaded.
- [ ] A slot taken by another booking returns to the date step as before, and now also drops the selected time.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `resolveBookingSubmitErrorRoute` maps both codes to `availability` and keeps the `SLOT_UNAVAILABLE` mapping unchanged
  - [ ] `classifyRescheduleFailure` returns `slotClosed` for both codes; `shouldReloadSlots` is true for it; `generic` and `windowExpired` unchanged
  - [ ] `assertEntryRescheduled` throws a 409 `ApiError` for both codes and keeps 422 for other codes
  - [ ] `SlotConflictAlert`: the closed and off-hours codes show the catalogue message, `SLOT_UNAVAILABLE` keeps the "foi ocupado" body
- Component:
  - [ ] `BookingForm`: a submit failing with each of the three codes shows the availability step and the catalogue message, keeps the other selections, drops the refused slot (`aria-pressed="false"`, Próximo disabled) and reloads the availability list
  - [ ] `CustomerReschedulePage`: each code shows the message with `conflictHint` and reloads the slots
  - [ ] `RescheduleBookingPage` and the approve action: each code renders the alert with the closed or off-hours body
- E2E:
  - [ ] Playwright, booking page: seed a ROOM service, open the booking page, add a resource-scoped closure through the API for the chosen day, submit, land on the date step with the message and the other choices kept
  - [ ] Playwright, customer reschedule: same setup on `my-account-reschedule.spec.ts`; the message shows and the slot list reloads
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

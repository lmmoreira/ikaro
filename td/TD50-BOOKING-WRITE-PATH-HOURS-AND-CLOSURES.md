# TD50 — Booking write path ignores working hours, closures and openings

## Status
- **Type**: Technical Debt / Correctness (Booking — scheduling rules)
- **Priority**: Medium (the public booking page and the staff booking screen only offer open slots, so a normal user never hits it; the exposure is a direct API call, a page left open while a closure is created, and any future client that does not read availability first)
- **Context**: apps/backend — booking context; apps/bff — booking feature (error pass-through only); apps/web — public booking flow and staff booking flow (error routing); packages/types, packages/i18n
- **Created**: 2026-10-10
- **Discovered**: reviewing M23-S39 (staff books on a customer's behalf, PR #586): a staff booking on a closed day returned 201, and probing showed a guest booking does too
- **Decision status**: Ready for discovery. Story 0 first; Story 1 depends on it; Story 2 depends on Story 0. Each story still begins with `/story-discovery`.
- **Related**: M23-S18 (the recurring-schedule check this reuses), M23-S39, M23-S33 (the booking-window check this sits beside), M23-S08 (the future-commitment worklist reschedule), UC-001, UC-002, UC-004, UC-069, UC-108, `docs/27-BUSINESS_LOGIC_REFERENCE.md` § Creation-time checks — hours and closures, occupancy

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

The rule already exists and is already enforced for one flow: a **recurring schedule** checks working hours and closures when it is requested and again when it is approved (M23-S18, `recurring-booking-schedule-hours.helpers.ts`: `loadHoursScheduleData` + `evaluateHours`, whose verdict per window is `AvailabilityService.windowHoursVerdict` — "the same rule availability applies"). `docs/27-BUSINESS_LOGIC_REFERENCE.md` documents it as "Creation-time checks — hours and closures, occupancy". One-off bookings have only the occupancy half.

### Why this matters
The booking page hides closed slots, so the promise "the business is closed then" is kept only by the client. A page open while a manager adds a closure, a hand-built request, or any second client (the staff screen, an integration) can create a booking the business has said it cannot serve. A `PENDING` booking is then in a manager's queue for a time that is closed; a staff booking is `APPROVED` straight away.

## Chosen approach (decided in the drafting session, 2026-10-10 — story-discovery has not yet run)

- Reuse the recurring check; do not write a second rule. `evaluateHours` already takes a list of occurrences, so a one-off booking is a call with one occurrence. Move `loadHoursScheduleData` / `evaluateHours` and their types out of the `recurring-` file into a neutral `schedule-hours.helpers.ts` (the recurring code imports it from there), so create, reschedule, approve and recurrence share one implementation and cannot disagree with availability.
- Run it inside the same transaction as the occupancy check, after the resources are resolved and locked, so a closure added concurrently is seen under the same lock discipline the recurring path uses.
- Existing bookings are never re-checked; a closure added later does not cancel anything (that is M23-S08's worklist).
- Refusals are new, typed domain errors with their own codes in `@ikaro/types` and both locale files (one for a closed day or closure, one for outside working hours), mapped in `booking-error.mapper.ts`.

## Non-goals
- Retroactively cancelling or flagging bookings already inside a newly created closure (M23-S08).
- Changing the availability read.
- Changing recurring schedules (they already enforce this).
- A manager override that books outside hours: not decided; see the first open question for Story 0.

## Story 0 — Enforce hours, closures and openings when a one-off booking is created

**Agent:** backend-ts + bff-ts
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` UC-001, UC-002, UC-108, UC-010 (closures and openings), UC-070 A1; `docs/27-BUSINESS_LOGIC_REFERENCE.md` § Creation-time checks — hours and closures, occupancy and § Booking Window; `docs/21-TENANTS_SETTINGS_SCHEMA.md` § Business Hours; `docs/ENGINEERING_RULES_BACKEND.md` § Transactions, § Choosing a race-condition primitive; `docs/ENGINEERING_RULES_SHARED.md` § Adding a new error — checklist; `docs/14-API_CONTRACTS.md` § Booking Requests; `docs/ANTI_PATTERNS.md`
**Dependencies:** none (the recurring check from M23-S18 is already merged)
**Pattern:** plain composition — one shared pure check (`evaluateHours`) called from the existing `persistRequestedBooking` step, so guest, authenticated and staff creation get it from one place; no new named pattern.

**Discovered:** 2026-10-10, reviewing M23-S39; reproduced against a real database (table in the Problem).
**Root cause:** `persistRequestedBooking` (`booking-request.helpers.ts`) resolves candidate resources and calls `assertSlotFree`, which asks `findConflictingResourceIds` about other bookings only; nothing calls `AvailabilityService.windowHoursVerdict` or loads closures/openings on this path.

**Description:**
Make `POST /bookings`, `POST /bookings/authenticated` and `POST /bookings/staff` refuse a start that availability would not offer. After the resources are resolved and locked, load the closures and openings for the booking's date (tenant-wide and for the resolved resources) with `loadHoursScheduleData`, evaluate the window `[start, start + duration + effective trailing gap)` with `evaluateHours` using the same any-open-resource-suffices rule recurrence uses per selection mode, and refuse with a typed error when the window is closed or outside working hours. The window checked is the occupancy window, as for recurrence, so a slot whose buffer or turnover runs past closing is refused as availability would refuse it. The check is in the shared step, so it needs one call site and the three entry points cannot drift.

**Open for `/story-discovery`:**
1. **Staff override.** UC-108 says staff bookings are checked "as for a customer", but a business may want to take a walk-in or phone booking outside its published hours. Decide whether staff and managers are exempt (and from what: hours only, closures too), and whether an exemption is a parameter or a separate rule. Default if undecided: no exemption, matching customers.
2. **HTTP status and codes.** `409` (conflict with the schedule) or `422`; and one code or two (`BOOKING_SLOT_CLOSED`, `BOOKING_OUTSIDE_BUSINESS_HOURS`). The recurring path already distinguishes `CLOSED` and `OUTSIDE_HOURS`.
3. **Resource-scoped closures** for a service whose requirements span several resources (a bundle): all considered resources must be open for a bundle, one is enough for `AUTO_ANY` — confirm the recurring per-mode rule applies unchanged.

**Backend use case steps:** the three creation use cases are unchanged; `persistRequestedBooking` gains the hours step between "resolve candidates / lock" and "assert slot free", throwing the new typed errors.
**Backend HTTP surface:** reuses `POST /bookings`, `POST /bookings/authenticated`, `POST /bookings/staff`; each gains the new refusal in its error list in `docs/14-API_CONTRACTS.md`.
**BFF endpoint spec:** none — the BFF forwards the backend problem response unchanged; add the new error blocks to the BFF `.http` file.
**New migration / i18n keys / env vars / feature flags:** no migration; new error codes in `packages/types/src/error-codes.ts` with entries in **both** `packages/i18n/locales/pt-BR/errors.json` and `packages/i18n/locales/en/errors.json` (the web exhaustiveness test fails otherwise); no env var, no flag.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/use-cases/schedule-hours.helpers.ts` (+ `.spec.ts`) (new — `loadHoursScheduleData`, `evaluateHours`, `findHoursConflicts` and their types, moved from the recurring file)
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-hours.helpers.ts` and `.spec.ts` (modify or delete — the recurring code imports from the new file; keep only what is recurrence-specific)
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.ts`, `approve-recurring-booking-schedule.use-case.ts` (modify — imports)
- `apps/backend/src/contexts/booking/application/use-cases/booking-request.helpers.ts` (+ `.spec.ts`) (modify — the hours step in `persistRequestedBooking`; its deps gain the closure and opening repositories and the tenant business hours)
- `apps/backend/src/contexts/booking/application/use-cases/request-booking.use-case.ts`, `request-authenticated-booking.use-case.ts`, `create-booking-by-staff.use-case.ts` (+ specs) (modify — pass the new deps and the tenant business hours)
- `apps/backend/src/contexts/booking/infrastructure/controllers/booking.controller.ts` (+ spec) (modify — pass the tenant business hours from `RequestContext` settings)
- `apps/backend/src/contexts/booking/domain/errors/booking-schedule.error.ts` or `booking-lifecycle.error.ts` (modify — the typed errors, with `Object.setPrototypeOf`)
- `apps/backend/src/contexts/booking/infrastructure/http/booking-error.mapper.ts` (+ spec) (modify)
- `packages/types/src/error-codes.ts`, `packages/i18n/locales/pt-BR/errors.json`, `packages/i18n/locales/en/errors.json` (modify)
- `apps/backend/src/contexts/booking/infrastructure/controllers/booking-by-staff.controller.integration.spec.ts`, `booking.controller.integration.spec.ts` (modify — the closed-day and off-hours scenarios)
- `apps/backend/http/booking/bookings.http`, `apps/bff/http/bookings/bookings.http` (modify)
- `docs/04-USE_CASES.md`, `docs/14-API_CONTRACTS.md`, `docs/27-BUSINESS_LOGIC_REFERENCE.md` (modify)

**Acceptance criteria — product:**
- [ ] A guest, a customer and a staff member cannot create a booking for a time the business is closed (day of week, full-day closure, partial closure) or outside its working hours; the response says why.
- [ ] A resource-scoped closure refuses a booking that needs that resource, and does not refuse one that can use another open resource.
- [ ] A schedule opening on a normally-closed day makes bookings inside the opening possible and refuses those outside it.
- [ ] A booking inside open hours and outside every closure is created exactly as before.
- [ ] Bookings that already exist are not touched.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `schedule-hours.helpers.spec.ts`: the moved cases, plus a one-occurrence call for each verdict (FREE, CLOSED, OUTSIDE_HOURS)
  - [ ] **Parity:** for a table of dates, times, closures and openings, the one-off verdict equals `AvailabilityService.windowHoursVerdict` (the read) — a slot the read lists is accepted and a slot it omits is refused
  - [ ] `persistRequestedBooking`: closed, outside hours, opening-extends-hours, resource-scoped closure, and a bundle where one resource is closed
  - [ ] The three entry points each refuse a closed day (one use-case test each)
  - [ ] **Negative guarantee, own test:** an existing booking inside a closure created later is not changed or re-validated by any read or write path
  - [ ] Recurring-schedule specs pass unmodified apart from their imports
- Integration:
  - [ ] `POST /bookings`, `POST /bookings/authenticated`, `POST /bookings/staff` each return the new refusal for the closed-day, off-hours, partial-closure and resource-closure cases against a real database, and 201 for the control
  - [ ] The refusal happens in the same transaction as the occupancy check: a closure committed between the availability read and the POST is honored
- Tenant isolation:
  - [ ] Tenant B's closure does not refuse Tenant A's booking on the same date
- E2E: none — server-side; Story 2 owns the browser scenario
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

## Story 1 — Enforce the same rule when a booking is rescheduled or approved at a new time

**Agent:** backend-ts + bff-ts
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` UC-004, UC-069 (reschedule), UC-073; `docs/27-BUSINESS_LOGIC_REFERENCE.md` § Creation-time checks — hours and closures, occupancy, § Booking Window and the future-commitment worklist section; `docs/ENGINEERING_RULES_BACKEND.md` § Transactions; `docs/ENGINEERING_RULES_SHARED.md` § Adding a new error — checklist; `docs/14-API_CONTRACTS.md` § Booking lifecycle; `docs/ANTI_PATTERNS.md`
**Dependencies:** TD50 Story 0 (the shared check and its errors)
**Pattern:** plain composition — the same `schedule-hours.helpers.ts` call from the shared reschedule transaction helper and from the approval step; no new pattern.

**Discovered:** 2026-10-10, same probe as Story 0; the reschedule and approve use cases were read and contain no hours or closure reference.
**Root cause:** `reschedule-booking-in-transaction.helpers.ts` re-resolves candidates and calls `assertSlotFree` only; `approve-booking.use-case.ts` does the same when approval carries a new `scheduledAt`.

**Description:**
Apply Story 0's check wherever a booking's start changes after creation: the customer reschedule (`PATCH /bookings/:id/reschedule-customer`), the admin reschedule, and an approval that overrides `scheduledAt`. A reschedule to a closed or off-hours time is refused with Story 0's errors and leaves the booking unchanged. Decide at discovery how the M23-S08 worklist's bulk reassign and reschedule behave (they move a booking to resolve a conflict and may reasonably need an exemption, or may need to fail into the worklist like any other unavailable target).

**Open for `/story-discovery`:** the staff/manager exemption (same decision as Story 0, applied to reschedule); the worklist's behavior when the proposed new time is closed.

**Backend use case steps:** `RescheduleBookingAsCustomerUseCase` and `RescheduleBookingUseCase` call the shared transactional helper, which gains the hours step before the occupancy check; `ApproveBookingUseCase` gains it only when `scheduledAt` is overridden.
**Backend HTTP surface:** reuses the existing reschedule and approve routes; add the new refusal to their documented errors.
**BFF endpoint spec:** none — pass-through; add blocks to the BFF `.http`.
**New migration / i18n keys / env vars / feature flags:** none (the error codes and translations come from Story 0).

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/use-cases/reschedule-booking-in-transaction.helpers.ts` (+ spec) (modify)
- `apps/backend/src/contexts/booking/application/use-cases/reschedule-booking-as-customer.use-case.ts`, `reschedule-booking.use-case.ts`, `approve-booking.use-case.ts` (+ specs) (modify — deps and tenant business hours)
- `apps/backend/src/contexts/booking/application/use-cases/resolve-future-commitment-exceptions.use-case.ts` (modify only if discovery picks a worklist behavior that needs it)
- `apps/backend/src/contexts/booking/infrastructure/controllers/booking-completion.controller.ts` (+ spec) (modify — owns the reschedule routes; pass the tenant business hours)
- `apps/backend/src/contexts/booking/infrastructure/controllers/booking.controller.integration.spec.ts` (modify — reschedule and approve scenarios)
- `apps/backend/http/booking/bookings.http`, `apps/bff/http/bookings/bookings.http` (modify)
- `docs/04-USE_CASES.md`, `docs/14-API_CONTRACTS.md`, `docs/27-BUSINESS_LOGIC_REFERENCE.md` (modify)

**Acceptance criteria — product:**
- [ ] A customer or staff member cannot reschedule a booking to a closed or off-hours time; the booking keeps its old time.
- [ ] Approving with a new time that is closed is refused and the booking stays pending.
- [ ] Rescheduling to an open time still works, including the existing minimum-notice and cancellation-window rules.

**Acceptance criteria — technical:**
- Unit:
  - [ ] The shared reschedule helper refuses closed, outside-hours and resource-closed targets and leaves the aggregate and occupancy unchanged
  - [ ] Approve with `scheduledAt` refuses a closed target; approve without `scheduledAt` does not run the check
  - [ ] **Negative guarantee, own test:** an approval with no new time is not blocked by a closure that exists on the booking's original day
- Integration:
  - [ ] Customer reschedule, admin reschedule and approve-with-new-time each refuse a closed day against a real database and succeed for an open one
- Tenant isolation:
  - [ ] Tenant B's closure does not refuse Tenant A's reschedule
- E2E: none — covered by Story 2 for the customer reschedule screen
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

## Story 2 — The booking and reschedule screens route the new refusals to the date step

**Agent:** web-ts
**Complexity:** S
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/ENGINEERING_RULES_SHARED.md` § Authoring new i18n UI copy keys, `docs/08-TESTING_STRATEGY.md` § apps/web Testing Infrastructure, `plan/journey/guest/book-a-service.md`, `plan/journey/customer/book-a-service.md`
**Dependencies:** TD50 Story 0; TD50 Story 1 for the reschedule screen
**Pattern:** plain composition — extends the existing submit-error routing table (`resolveBookingSubmitErrorRoute` in `booking-steps.ts`); no new pattern.

**Description:**
The public booking flow already sends a slot conflict (`BOOKING_SLOT_UNAVAILABLE`) back to the date step with everything else kept. The two new codes must take the same route, with copy that says the time is no longer open, so a stale page recovers instead of showing a generic error. The same mapping applies to the customer reschedule screen (M23-S30) and is what the staff booking screen (M23-S40) inherits through the shared step engine. No new screen: the existing slot-conflict error state is reused, with new copy keys.

**Prototype references:** `plan/journey/guest/prototypes/book-a-service/` and `plan/journey/customer/prototypes/book-a-service/` (the existing slot-conflict error screens); confirm at discovery that no prototype change is needed.
**New migration / i18n keys / env vars / feature flags:** none beyond Story 0's `errors.json` entries; any screen-level copy goes in `packages/i18n/locales/{pt-BR,en}/web.json` in the same commit.

**Files to create/modify:**
- `apps/web/features/booking/model/booking-steps.ts` (+ `booking-steps.spec.ts`) (modify — `resolveBookingSubmitErrorRoute` routes both codes to the date step)
- `apps/web/features/booking/components/public/BookingForm.tsx` (+ spec) (modify only if the error state needs new copy)
- `apps/web/features/customer/components/my-account/CustomerReschedulePage.tsx` (+ spec) (modify — same mapping on the reschedule screen from M23-S30)
- `plan/journey/guest/book-a-service.md`, `plan/journey/customer/book-a-service.md`, both `dev-notes.md` (modify — record the new error route)

**Acceptance criteria — product:**
- [ ] If the chosen time closes while the page is open, submitting returns the customer to the date step with their other choices kept and a message that the time is no longer open.
- [ ] The same holds on the reschedule screen.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `resolveBookingSubmitErrorRoute` maps both new codes to the date step and keeps the slot-conflict mapping unchanged
  - [ ] Component test: a submit failing with each new code shows the date step and the new message
- E2E:
  - [ ] Playwright: create a full-day closure through the API after loading the booking page, submit, and land on the date step with the message
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

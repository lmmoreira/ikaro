# TD49 — Recurring Schedules for Bundled (Multi-Requirement) and Default-Location Services

## Status
- **Type**: Technical Debt / Product Scope (Booking — recurrence)
- **Priority**: High (raised 2026-10-10 — see the Addendum: with M23-S17 shipped, a recurring reservation can be requested only for a service with exactly one explicit, non-`NONE` resource requirement, which excludes the platform's default service shape as well as bundles)
- **Context**: apps/backend — booking context (`RecurringBookingSchedule`); apps/bff — booking feature; apps/web — customer "Minha Conta" and the staff approval queue; packages/validation
- **Created**: 2026-09-29
- **Discovered**: a question raised while implementing TD45-S0 (PR #532) — "what if a service has a staff and a room?" — traced to M23-S04's explicit single-resource-only scope cut
- **Decision status**: **Re-opened 2026-10-10 and widened to the whole recurrence-eligibility flow** (the owner asked for one TD covering every service shape that cannot recur today). The original "not to be started until every M23 story is ✅ Done" sequencing is superseded: M23-S17 shipped on 2026-10-10 and exposed that the limit blocks real use, not only bundles. Story 3 (the default-location case) and Story 0 (bundles) share one open design question, the policy model, so their `/story-discovery` should decide it once. Every story still begins with `/story-discovery`.
- **Related**: M23-S04 (`plan/M23-MULTIVERTICAL-APPOINTMENT-BOOKING.md`, scope bullet + its "Request rejects a bundle/multi-leg service" acceptance criterion), M23-S05, M23-S12, M23-S13, M23-S17, M23-S18, TD45-S0, UC-070 / UC-071 / UC-073, `docs/27-BUSINESS_LOGIC_REFERENCE.md` § Two-layer creation-time conflict check

## Problem

Only a flat service with exactly one explicit resource requirement can have a recurring schedule today. `assertServiceEligible()` in `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.ts` rejects with `RecurringBookingScheduleIneligibleServiceError` (`RECURRING_SCHEDULE_INELIGIBLE_SERVICE`) a service that is not an `APPOINTMENT` (`not-appointment`), has recurrence off (`recurrence-not-enabled`), requires a pickup address (`requires-pickup-address`), has `legs`, any number of requirements other than one (so **zero** too) or a requirement with `requiredQuantity !== 1` (all `legged-or-bundled`), or whose single requirement's `selectionMode` does not match the requested `assignmentPolicy` (`selection-mode-mismatch`; `NONE` matches neither policy). The request schema mirrors it: `packages/validation/src/booking.ts` declares `resourceIds: z.array(z.uuid()).length(1)`, and the request's single `assignmentPolicy` is tied 1:1 to the service's one requirement `selectionMode` (`CUSTOMER_CHOICE` ↔ `FIXED_ASSIGNMENT`, `AUTO_ANY`/`AUTO_FUNGIBLE_POOL` ↔ `RESOLVE_PER_OCCURRENCE`).

This was a scope cut, not a technical limit: M23-S04's story text says "Bundle/leg recurrence is out of scope for this story." No rationale is recorded there. UC-070 did not state the limit when this TD was written; it does now (its Preconditions say "a flat, single-resource-requirement `APPOINTMENT` service (no `legs`, no multi-resource bundle)" and A7 lists the ineligible shapes), but it still gives no reason, and it does not mention that the default service shape (no requirements) is excluded too. Whichever story lifts the limit must rewrite those two places.

The consequence is a real product gap for verticals whose standard service is a bundle ("stylist + chair", "instructor + studio"): a one-off booking of that service resolves every requirement and requires all of them free (`BookingBundlePartiallyUnavailableError` otherwise), but the same customer cannot standing-book it weekly.

The groundwork for lifting the limit already exists: `recurring_booking_schedule_resource_assignments` carries `requirement_id`, `resource_type` and `required_quantity_position` with a per-resource primary key, and the creation-time conflict check (after TD45-S0) resolves its deciding resources once, locks them once and checks every (resource × occurrence) window in one overlap query — a shape that extends naturally to several requirements.

## Addendum 2026-10-10 — the limit is wider than bundles (found verifying M23-S17)

While checking M23-S17 against a real tenant's data, "which services can a customer actually recur?" turned out to have a much narrower answer than this TD's original "single-resource services are unaffected":

1. **The default service shape cannot recur.** `docs/27-BUSINESS_LOGIC_REFERENCE.md` (§ the service-shape table, "Degenerate") defines the default as `resourceRequirements: []` ("no service starts with one configured"), or exactly one unrestricted `{ LOCATION, NONE }` requirement, with no legs; such a service is booked against the tenant's single `LOCATION` resource (`isDegenerateService()`, and the `DEGENERATE_LOCATION_REQUIREMENT` fallback in `availability-window-resolution.helpers.ts`). Every tenant is guaranteed that resource (`CreateTenantLocationResourceUseCase` for new tenants, the `…8-BackfillLocationResources` migration for existing ones; its own comment states "every tenant always has exactly one active LOCATION resource"). `assertServiceEligible()` rejects the degenerate shape twice over: `[]` fails `resourceRequirements.length !== 1` (`legged-or-bundled`), and a stored `NONE` location row fails the mode check (`selection-mode-mismatch`, because only `CUSTOMER_CHOICE` or `AUTO_*` are accepted). A one-person car wash, whose every service is degenerate, therefore cannot use recurrence at all. The original car-wash vertical is the case recurrence most obviously serves.
2. **Services created before M22 carry a redundant stored row.** The M22 backfill wrote an explicit `{ LOCATION, NONE }` requirement for every existing appointment service (`docs/13-DATABASE_SCHEMA.md`, expand-and-backfill step 2); services created afterwards have no rows. The engine treats the two shapes identically, so the difference is cosmetic everywhere except recurrence. Do not "fix" it by rewriting data: the eligibility rule has to accept both shapes.
3. **A bundle in practice is staff + room (+ equipment), and an older service is location + staff.** The same rule excludes both. A service with only an explicit staff requirement does not involve the location when booked (the fallback applies only when the requirement list is empty), so it stays a single-requirement case and is already eligible.
4. **The M23-S17 web filter does not mirror the backend rule.** `isRecurrenceEligibleService()` (`apps/web/features/booking/model/recurring-schedule-form.ts`) omits two checks `assertServiceEligible()` makes: the single requirement's `selectionMode` must be `CUSTOMER_CHOICE`/`AUTO_ANY`/`AUTO_FUNGIBLE_POOL` (a `NONE` service is offered, then refused as `INELIGIBLE_SERVICE`), and `requiresPickupAddress` must be false. M23-S17's decisions 4 and C say the filter mirrors the backend, so this is a defect in that story's shipped filter.
5. **Nothing tells a manager or a customer why a service is missing.** The form's empty state reads "Nenhum serviço permite reserva recorrente no momento" whether the service is not enabled, is a bundle, or is a default-shape service, and the service editor lets a manager enable "Permitir recorrência" on a service that can never recur (verified: `update-service-booking-policy.use-case.ts` validates nothing about the service's requirements or legs).
6. **M23-S17's mobile E2E covers the empty Agendamentos tab only.** Its acceptance criterion says "with and without bookings"; the with-bookings case is covered by the `BookingsList` unit spec, not by Playwright.
7. **The eligibility rule has more consumers than the customer form.** M23-S19 (staff creates on a customer's behalf) imports the same filter, body builder and validation from `features/booking/model/` (its decision 4), M23-S22 (renewal) opens the same form through `initialDraft`, M23-S40 hosts the staff "+ Novo" menu, and M23-S13 shows the schedule in the approval queue. Each of them inherits whatever the filter allows, so widening it must be checked against all of them, and a renewal of a schedule whose service has since become ineligible needs a defined behavior.
8. **A stored `NONE` location row inside a bundle.** An older "location + staff" service is a two-requirement service whose first requirement is a plain location (`NONE`), and a one-off booking holds both resources. Story 0 must say how a `NONE` requirement behaves per requirement (the booking engine keeps "the original first-eligible pick" for it, `docs/27` § write path); the mixed-mode discussion below names only `CUSTOMER_CHOICE` and `AUTO_ANY`.
9. **A schedule can outlive an edit of its service.** Materialization at approval reads the service's *current* `resourceRequirements[0]` (`materialize-recurring-schedule-occurrences.helpers.ts:142`), not a snapshot taken at request time, so a manager changing a service's requirements between a request and its approval can change what is resolved, or fail it. UC-070 A3 covers configuration changes after `ACTIVE`, not this window. Confirm at discovery whether the schedule should snapshot the requirement it was checked against.

What this review established about the default-location case (read from code, not yet run, so confirm at discovery): the request schema already makes `resourceIds` optional and requires exactly one only for `FIXED_ASSIGNMENT` (`packages/validation/src/booking.ts`), so a `RESOLVE_PER_OCCURRENCE` request for a service with no requirements needs no contract change; `buildResourceAssignments()` returns no rows for `RESOLVE_PER_OCCURRENCE`, so no assignment row (and no migration) is needed; the cap for that policy is already per service (`MAX_ACTIVE_RESOLVE_PER_OCCURRENCE_SCHEDULES_PER_SERVICE = 50`); `resolveEligibleResources()` and `planOccurrenceResources()` already work for a `LOCATION` requirement with a single resource. What breaks is `service.resourceRequirements[0]` being `undefined`, read at `recurring-booking-schedule-request.helpers.ts:97` and `:142` and `materialize-recurring-schedule-occurrences.helpers.ts:142`, and `assertServiceEligible()` refusing `[]` and `NONE`.

Still not verified: whether the service editor can save a service with exactly one non-location requirement in every tenant configuration (a profession-only service was observed to save as a single `AUTO_ANY` row); and the lock behavior for the tenant `LOCATION` under concurrent one-off bookings of the same location.

## Sequencing note — why this originally waited for the whole of M23

Superseded by the Addendum above (re-opened 2026-10-10); kept for the rework it explains. This TD was scheduled after M23 completes, by decision. The cost of that ordering was a rework: M23-S05 shipped its approval and one-shot occurrence materialization step for single-resource schedules (there is no rolling generation — a schedule has a fixed, validated term; `approve-recurring-booking-schedule.use-case.ts` and `materialize-recurring-schedule-occurrences.helpers.ts`), and the bundle work extends it. Read before reusing: that step plans each occurrence's resource through `planOccurrenceResources()` (`recurring-occurrence-resource-plan.helpers.ts`) from a single requirement (`resourceRequirements[0]`), not through `resolveBookingLinesResourceCandidates()` with `resourceSelections` from stored assignment rows, so the bundle work generalizes that planner rather than only calling the one-off resolver.

## Chosen approach (decided in the drafting session, 2026-09-29 — story-discovery has not yet run)

Decided:
- **All-or-nothing at creation.** A bundled schedule is accepted only if every requirement is satisfiable in every occurrence of the term; if any requirement is not (a required resource is busy), the whole request is rejected with the existing `409` conflict. No partial acceptance of some requirements or some occurrences — the same atomic rule UC-070 A1 already applies to single-resource schedules and a one-off bundle booking applies via `assertSlotFree`.
- **Flat services only.** A multi-requirement service without `legs`. Legged (sequential itinerary) recurrence stays out of scope — a separate problem with its own windowing.
- **Extend, don't fork, the batched conflict check** introduced by TD45-S0: per requirement, decide which resources matter (chosen pick for `CUSTOMER_CHOICE`; any-free-one for `AUTO_ANY`; the first eligible one for `AUTO_FUNGIBLE_POOL`), union their windows into the same single overlap query, lock the union once, and reject an occurrence when any requirement is unsatisfied.
- **Reuse the one-off bundle resolver for generation** (`resolveBookingLinesResourceCandidates()` already resolves multi-requirement services) rather than a recurrence-specific resolver.
- **No new table:** persist fixed picks in `recurring_booking_schedule_resource_assignments` using its existing `requirement_id` / `resource_type` / `required_quantity_position` columns.

Left open for Story 0's `/story-discovery` (each needs a user decision, not a code-reading answer):
1. **Policy model for mixed bundles.** `assignmentPolicy` is one schedule-level value that today also decides whether assignments are stored, whether the 50-schedule cap counts per resource or per service, and whether the lock is per resource or per service. A bundle can mix modes (staff `CUSTOMER_CHOICE` + room `AUTO_ANY`). Options: (a) a third schedule-level value for mixed bundles (needs a migration widening the `CHECK`, using `NOT VALID` + `VALIDATE`); (b) keep the two values and derive per-requirement behavior from each requirement's `selectionMode` plus the stored assignment rows; (c) drop the schedule-level policy in favor of per-requirement data. Each also has to say what "the cap" means for a hybrid.
2. **`requiredQuantity > 1`** on a single requirement (a multi-unit pool): in scope here or not — the assignment table already has `required_quantity_position`.
3. **Two requirements of the same resource type** picking the same physical resource — how one-off resolution treats it today must be checked before reusing it.
4. **A `NONE` requirement inside a bundle** (an older "location + staff" service) — whether it is checked, locked and occupied like any other requirement, as a one-off booking does, or ignored as the implicit default. The cap and policy model have to say the same thing for it (see Addendum item 8).
5. **Snapshotting the checked requirement** on the schedule, so an edit of the service between request and approval cannot change what was agreed (Addendum item 9).

## Non-goals
- Legged / itinerary recurrence.
- Any change to one-off booking behavior.
- Partial acceptance (accepting the schedule minus the conflicting requirements or occurrences).
- Multiple locations per tenant (CLAUDE.md §12 open decision 1). The default-location case relies on the invariant that a tenant has exactly one active `LOCATION` resource; a future multi-location model would revisit it.
- Rewriting stored service data (for example removing the M22 backfill's `NONE` location rows). The eligibility rule accepts both shapes instead.

## E2E coverage plan (one view; each scenario is owned and written by the story named, never by a trailing test-only story)

Playwright cannot be run for cluster states that need a server fault or a seeded cap; those stay at the unit tier, as in M23-S17. Everything below needs a real seeded tenant and goes through the real BFF and backend. The seeding helper `seedRecurrenceEligibleService()` (`apps/web/e2e/helpers/recurring-schedule.ts`) creates one `ROOM`/`AUTO_FUNGIBLE_POOL` requirement today and must gain a parameter for the other service shapes.

| Service shape | Scenario | Owner |
|---|---|---|
| One explicit requirement (`AUTO_*` or `CUSTOMER_CHOICE`) | create, conflict, closed day, pending approval, entry points | M23-S17 (shipped) |
| Default shape: no requirements | a customer of a tenant with no staff resources creates a schedule and finds it on the list | Story 3 |
| Default shape: stored `NONE` location row (older service) | same scenario on a service seeded with the backfill's row | Story 3 |
| Default shape | the form's empty state names the reason when no service qualifies; a service enabled but not recurrable is absent | Story 3 |
| Service editor | enabling recurrence on a service that cannot recur shows the hint | Story 3 |
| Mobile viewport | the in-page "+ Novo ▾" menu is present with bookings as well as without | Story 3 |
| Bundle (staff `CUSTOMER_CHOICE` + room `AUTO_ANY`) | create with one pick per requirement, then find it on the list with both resources | Story 2 |
| Bundle | a conflict on only one requirement lists the colliding occurrence and creates nothing | Story 2 |
| Bundle, `MANUAL_APPROVAL` | a manager approves the pending schedule from the queue and the occurrences appear holding both resources; a refused approval leaves it pending | Story 2 (queue row owned by M23-S13) |
| Mixed tenant: one default-shape and one bundle service | the form offers both and each is created through its own path | Story 2 |
| Legged service | never offered in the form | covered by the unit filter table (Story 3); no E2E |
| Staff creation, renewal, Agenda menu | re-run the eligibility scenarios above against the staff form, `initialDraft` and the menu | M23-S19, S22, S40, each in its own E2E |

## Story 0 — Bundled-recurrence domain and contract model

**Agent:** backend-ts + bff-ts
**Complexity:** L
**Docs to load:** `docs/04-USE_CASES.md` UC-070, `docs/02-DOMAIN_MODEL.md` § RecurringBookingSchedule, `docs/13-DATABASE_SCHEMA.md` § recurring_booking_schedules (and its assignments table), `docs/14-API_CONTRACTS.md` § Recurring Private Reservation Schedules, `docs/27-BUSINESS_LOGIC_REFERENCE.md` § Two-layer creation-time conflict check, `docs/ENGINEERING_RULES_BACKEND.md` § Transactions and § Choosing a race-condition primitive
**Dependencies:** TD45-S0 (the batched conflict check this story extends); M23-S04, S05, S12, S17 and S18 ✅ Done. The remaining M23 stories no longer gate it (see the Addendum), but S13, S19, S22 and S40 consume its eligibility rule, so confirm their status at discovery. Decide the policy model together with Story 3's discovery.
**Pattern:** plain composition — generalizes the resolve-once / one-query / decide-in-memory function from TD45-S0 from one requirement to several; no new named pattern. The mixed-bundle policy model is decided in discovery (see Chosen approach).

**Description:**
Let a flat multi-requirement service be requested as a recurring schedule, rejecting the whole request when any requirement cannot be satisfied in any occurrence. (1) Relax `assertServiceEligible()` so a multi-requirement service without `legs` is eligible; keep `legs` rejected; update the `RecurringBookingScheduleIneligibleServiceError('legged-or-bundled')` message to say only legged services are excluded. (2) Replace the request's single `resourceIds: length(1)` with per-requirement selections keyed like a one-off booking's `resourceSelections` (service + requirement type), in the shared Zod schema, the BFF schema and any `@ikaro/types` shape — a deliberate contract change, grep both layers for duplicate schemas. (3) Resolve the policy model per the open question in Chosen approach. (4) Generalize `assertPatternConflictFree()` (in `materialize-recurring-schedule-occurrences.helpers.ts`, called by both the request and the approve use cases) and `planOccurrenceResources()` (`recurring-occurrence-resource-plan.helpers.ts`, which takes one `selectionMode` today) to several requirements, including how a `NONE` location requirement behaves (open question 4): union every requirement's deciding resources, lock the union once via `ITenantLockPort.lockResources()`, run one `IResourceOccupancyRepository.findConflictingWindows()` query over all (resource × occurrence) windows, and reject an occurrence when any requirement is unsatisfied. (5) Persist each fixed pick as an assignment row with its `requirement_id`, `resource_type` and `required_quantity_position`. (6) Update UC-070 to state which services can recur, and update the docs listed below.

**Backend use case steps:** `RequestRecurringBookingScheduleUseCase` — the same order as today (lock → prepare/eligibility → cap → pattern conflict → build → save → materialize; the active-schedule overlap step was removed by M23-S05); only eligibility, the selections input, the conflict check and the assignment building change.
**Backend HTTP surface:** reuses `POST /recurring-booking-schedules` — request body shape changes (per-requirement selections); update its request blocks in `apps/backend/http/booking/recurring-booking-schedules.http`.
**BFF endpoint spec:** reuses `POST /recurring-booking-schedules` as a thin proxy — schema and types change to match; add the BFF request block under `apps/bff/http/booking/` (none exists for this route today).
**New migration / i18n keys / env vars / feature flags:** migration only if discovery picks option (a) — expand/contract, widening the `assignment_policy` `CHECK` via `ADD CONSTRAINT ... NOT VALID` then a separate `VALIDATE CONSTRAINT`, with `docs/13-DATABASE_SCHEMA.md` updated in the same commit; i18n keys: none in this story (error copy is backend-English and web copy lives in Story 2); env vars / flags: none.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.ts` (modify — `assertServiceEligible`, `buildResourceAssignments`, `resolveConsideredResources`, the `resourceRequirements[0]` reads)
- `apps/backend/src/contexts/booking/application/use-cases/materialize-recurring-schedule-occurrences.helpers.ts`, `recurring-occurrence-resource-plan.helpers.ts`, `recurring-occurrence-occupancy.helpers.ts`, `recurring-booking-schedule-hours.helpers.ts` and `recurring-booking-schedule-cap.helpers.ts` (+ specs) (modify — the conflict check, the per-occurrence plan, the hours-and-closures pass and the cap for several requirements)
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.spec.ts` (modify — bundle scenarios and an extended parity test against the one-off bundle resolution)
- `apps/backend/src/contexts/booking/application/use-cases/request-recurring-booking-schedule.use-case.ts` (+ spec) (modify — selections input, lock and cap wiring)
- `apps/backend/src/contexts/booking/domain/recurring-booking-schedule.aggregate.ts` and `recurring-booking-schedule.types.ts` (modify — assignment inputs / policy model)
- `apps/backend/src/contexts/booking/domain/errors/recurring-booking-schedule.error.ts` (modify — ineligible-service message)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-recurring-booking-schedule.mapper.ts` (modify — persist and rehydrate the multi-row assignments)
- `apps/backend/src/contexts/booking/infrastructure/controllers/recurring-booking-schedule.controller.ts` (+ spec, + `.integration.spec.ts`) (modify)
- `packages/validation/src/booking.ts` (modify — the request schema, and its comment that "bundle/multi-leg recurrence is out of scope")
- `apps/bff/src/features/booking/recurring-booking-schedules.controller.ts`, `.schemas.ts`, `.types.ts` (+ specs) (modify)
- `apps/backend/http/booking/recurring-booking-schedules.http` (modify) and `apps/bff/http/booking/recurring-booking-schedules.http` (new)
- `docs/04-USE_CASES.md`, `docs/02-DOMAIN_MODEL.md`, `docs/14-API_CONTRACTS.md`, `docs/27-BUSINESS_LOGIC_REFERENCE.md` (modify); `docs/13-DATABASE_SCHEMA.md` (modify only if a migration lands)

**Acceptance criteria — product:**
- [ ] A customer (or staff on their behalf) can request a recurring schedule for a service that needs, for example, a staff member and a room.
- [ ] The request is rejected with a `409` and nothing is persisted if any required resource is busy in any occurrence of the term.
- [ ] A service with legs is still rejected as ineligible, with a message that says only legged services are excluded.

**Acceptance criteria — technical:**
- Unit:
  - [ ] A two-requirement service is eligible; a legged service is still rejected
  - [ ] Conflict on only one requirement (staff busy, room free) in a later occurrence rejects the whole schedule with one lock call and one overlap query
  - [ ] Both requirements free in every occurrence is accepted
  - [ ] Mixed modes (`CUSTOMER_CHOICE` + `AUTO_ANY`) are decided per requirement, and a `NONE` location requirement in a bundle is handled as decided at discovery
  - [ ] Parity: the batched bundle verdict equals the one-off bundle resolution for the same seeded occupancy
  - [ ] Assignment rows carry `requirement_id`, `resource_type` and `required_quantity_position`
- Integration:
  - [ ] `POST /recurring-booking-schedules` for a staff + room service returns 201 and persists both assignment rows; a real occupancy row on only one requirement's resource in the 5th occurrence returns 409 with nothing persisted
- Tenant isolation:
  - [ ] Another tenant's occupancy never blocks the request
- E2E: none — covered by Story 2
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

## Story 1 — Materialization, approval and management for bundle schedules

> Re-scoped 2026-10-10. The first draft assumed a later generation job that raises UC-073 exceptions. That does not exist: M23-S05 materializes the whole term once (at creation for `AUTO_CONFIRM`, at approval otherwise) and a failure refuses the whole request or approval (UC-070 A1, UC-071 A3); M23-S08 made an occurrence an ordinary linked booking and removed the schedule-side exception path. Confirm the remaining scope at discovery; it may shrink further.

**Agent:** backend-ts
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` UC-070 (step 2, A1–A3), UC-071 and UC-073, `docs/27-BUSINESS_LOGIC_REFERENCE.md` § Two-layer creation-time conflict check and § Approval, expiry and end of term, `docs/ENGINEERING_RULES_BACKEND.md` § Transactions
**Dependencies:** Story 0; M23-S05 and M23-S08 ✅ Done (the materialization and approval path and the occurrence-as-booking model this story extends)
**Pattern:** plain composition — the materialization and approval path plans every requirement's resource through the generalized `planOccurrenceResources()` from Story 0, and the existing booking cancel / release code is reused for end, skip and reschedule; no new named pattern.

**Description:**
Make the steps that run after a schedule is accepted bundle-aware. Materialization (`materialize-recurring-schedule-occurrences.helpers.ts`, called by `request-recurring-booking-schedule.use-case.ts` and `approve-recurring-booking-schedule.use-case.ts`) must create each occurrence as one linked booking that holds **every** requirement's resource, using the schedule's stored fixed picks for `CUSTOMER_CHOICE` requirements and the per-requirement plan for `AUTO_*` ones, all in the same transaction. The approval re-check (UC-071) repeats Story 0's all-requirements conflict and hours check, and an occurrence that no longer passes refuses the whole approval as it does for a single resource. Ending a schedule cancels each future linked booking and releases its occupancy generically today (`end-recurring-booking-schedule.use-case.ts` via `releaseBookingOccupancy`), and skip and reschedule are the booking's own operations since M23-S08; this story proves, with tests, that a bundle booking is released and moved in full, and changes code only where that proof fails. The list and detail reads must return every assignment with its requirement.

**Backend use case steps:** materialization — for the whole term: plan every requirement's resource per occurrence → insert the bookings and every occupancy row in bulk; approval — re-run the all-requirements check, refuse the whole approval on any failure, otherwise materialize; end / skip / reschedule — the existing booking operations on a bundle booking.
**Backend HTTP surface:** none new — reuses `POST /recurring-booking-schedules`, its approve / reject routes and the end route.
**BFF endpoint spec:** none — no BFF change.
**New migration / i18n keys / env vars / feature flags:** none.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/use-cases/materialize-recurring-schedule-occurrences.helpers.ts`, `approve-recurring-booking-schedule.use-case.ts` and `recurring-occurrence-occupancy.helpers.ts` (+ specs) (modify)
- `apps/backend/src/contexts/booking/application/use-cases/end-recurring-booking-schedule.use-case.ts` (+ spec) (modify only if the bundle proof fails)
- `apps/backend/src/contexts/booking/application/use-cases/list-recurring-booking-schedules.use-case.ts` and `get-recurring-booking-schedule.use-case.ts` (+ specs) (modify — return every assignment with its requirement)
- `docs/27-BUSINESS_LOGIC_REFERENCE.md`, `docs/04-USE_CASES.md` (modify)

**Acceptance criteria — product:**
- [ ] Occurrences of an approved or auto-confirmed bundle schedule appear as normal bookings holding every required resource.
- [ ] If a required resource stops being available between a request and its approval, the approval is refused as a whole and the schedule stays pending, exactly as for a single resource.
- [ ] Skipping, rescheduling or ending a bundle occurrence releases every resource it held.

**Acceptance criteria — technical:**
- Unit:
  - [ ] Materialization resolves fixed picks and auto requirements together and creates all resource assignments and occupancy rows for every occurrence
  - [ ] The approval re-check fails the whole approval when any requirement is unsatisfied in any occurrence, and creates nothing
  - [ ] End / skip / reschedule release or move every resource of the occurrence's booking
- Integration:
  - [ ] A real staff + room schedule generates bookings with both `resource_occupancy` rows per occurrence; an approval where the staff member became busy is refused with no partial occupancy
- Tenant isolation:
  - [ ] Generation and management never touch another tenant's schedules or occupancy
- E2E: none — covered by Story 2
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

## Story 2 — Bundle-aware recurring-schedule screens

**Agent:** frontend-ts
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer, `docs/14-API_CONTRACTS.md` § Recurring Private Reservation Schedules, `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/ENGINEERING_RULES_SHARED.md` § Authoring new i18n UI copy keys
**Dependencies:** Stories 0 and 1; M23-S17's creation flow and M23-S12's Minha Conta screens ✅ Done; M23-S13's approval queue (not done at the 2026-10-10 review) is what this story extends on the staff side, and M23-S19, S22 and S40 consume the same filter (Addendum item 7)
**Pattern:** plain composition — reuses the one-off booking flow's per-requirement resource picker rather than building a second one.
**Prototype references:** `plan/journey/customer/minha-conta.md` and `plan/journey/customer/prototypes/minha-conta/13-nova-recorrencia.html`, `13b-nova-recorrencia-revisar.html`, `06-reserva-recorrente.html`, `06b-reserva-recorrente-erro.html`, `06c-recorrente-em-analise.html`, `14-recorrentes-lista.html`, `dev-notes.md` — none of these depicts a bundle (the pattern builder `13` deliberately shows a single resource field), so a prototype extension (via the `plan/journey/` workflow in `CLAUDE.md` §15, starting with `/docs-audit`) is a prerequisite decision at discovery. Files to extend: in `plan/journey/customer/prototypes/minha-conta/`, `13` (one picker per requirement), `13b` (review shows each resource), `13c` (success), `06b` (conflict names the requirement that collided), `06c` (pending), `14` and `06` (list and detail show each requirement's resource), `index.html` and `dev-notes.md` (screen inventory and file map); `plan/journey/customer/minha-conta.md` (flow diagram and checklist); and the staff approval-queue row in the staff agenda prototype (`plan/journey/staff/prototypes/agenda/`), which M23-S13 owns, so confirm its state when this story is discovered.

**Description:**
Give a customer (or staff on their behalf) a way to choose a resource per requirement when creating a recurring schedule for a bundle, show each requirement's resource in the customer's schedule list and the staff approval queue, and surface the all-or-nothing conflict as the existing "conflict" error state. The creation flow this story extends is M23-S17 (the pattern builder `NewRecurringScheduleForm`, its review step and the outcome screens); when this TD was written no M23 story built it, and M23-S17 was added on 2026-09-29 to close that gap. It draws a single resource field on purpose, so this story turns that into one selection per requirement. M23-S18's hours-and-closures check must be extended to a bundle's requirements at the same time (a closed day or a closed room fails the whole occurrence). The service filter `isRecurrenceEligibleService()` must follow the backend rule again here: Story 3 aligns it with the default-location case, and this story widens it to a multi-requirement service without legs.

**Files to create/modify:**
- `apps/web/features/customer/components/my-account/NewRecurringScheduleForm.tsx`, `NewRecurringScheduleServiceFields.tsx` (the resource field), `NewRecurringScheduleReview.tsx`, `NewRecurringScheduleResult.tsx` and `NewRecurringSchedulePage.tsx` with their specs, plus `apps/web/features/booking/model/recurring-schedule-form.ts` (the filter, body builder and validation shared with M23-S19) — all shipped by M23-S17
- `apps/web/features/customer/components/my-account/RecurringScheduleList.tsx` and its spec (shipped by M23-S12)
- The M23-S13 approval-queue row component (path per what M23-S13 ships — confirm at discovery)
- `packages/i18n/locales/{pt-BR,en}/web.json` (modify — both locales, same change)

**Acceptance criteria — product:**
- [ ] A customer can pick a resource for each requirement of a bundled service when requesting a recurring schedule.
- [ ] The schedule list and the staff approval queue show which resource fills each requirement.
- [ ] A conflict on any requirement shows the standard conflict message and creates nothing.

**Acceptance criteria — technical:**
- Unit:
  - [ ] The per-requirement picker renders one selector per requirement and blocks submit until every `CUSTOMER_CHOICE` requirement has a pick
  - [ ] The list and the approval-queue row render every assignment
- E2E:
  - [ ] Create a recurring schedule for a bundled service → appears in "Minha Conta" with both resources; a conflicting request shows the conflict state (a scenario for each route this story adds, per `/story-discovery` 4f)
  - [ ] A conflict on only one requirement lists the colliding occurrence and creates nothing
  - [ ] A `MANUAL_APPROVAL` bundle schedule is approved from the staff queue and its occurrences appear holding both resources; a refused approval leaves it pending
  - [ ] A tenant with both a default-shape and a bundle service sees both offered in the form (the full matrix is in "E2E coverage plan")
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

## Story 3 — Default-location (degenerate) services can recur, and the eligibility filter mirrors the backend

**Agent:** backend-ts + frontend-ts
**Complexity:** M (raise to L if discovery finds the tenant `LOCATION` cannot be represented without a migration or a contract change, which the code reading in the Addendum suggests it can)
**Docs to load:** `docs/04-USE_CASES.md` UC-070 and UC-055 (the editor's recurrence toggle), `docs/27-BUSINESS_LOGIC_REFERENCE.md` (the service-shape table, § Two-layer creation-time conflict check, § Pinned selections), `docs/02-DOMAIN_MODEL.md` § RecurringBookingSchedule, `docs/13-DATABASE_SCHEMA.md` § recurring_booking_schedules and its assignments table, `docs/ENGINEERING_RULES_BACKEND.md` § Transactions and § Choosing a race-condition primitive, `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/ENGINEERING_RULES_SHARED.md` § Authoring new i18n UI copy keys
**Dependencies:** M23-S17 ✅ Done (its form, `recurring-schedule-form.ts` and E2E helpers are what this story extends). It can ship before Stories 0 to 2, but its `/story-discovery` must settle the policy model with Story 0 so the two do not pick incompatible shapes.
**Pattern:** plain composition — extends `assertServiceEligible()` and the assignment building with one more service shape, resolving the tenant's `LOCATION` through the same path a one-off degenerate booking uses; no new named pattern.
**Prototype references:** `plan/journey/customer/prototypes/minha-conta/13-nova-recorrencia.html` and `dev-notes.md`, and the service editor `plan/journey/staff/prototypes/servicos/03-service-edit.html` (plus `03d-service-edit-policy-error.html` and `servicos/dev-notes.md`). The empty-state reasons and the editor hint are not drawn in any prototype: the editor draws only the checkbox "Permitir recorrência para clientes autenticados" and its "Duração máxima" field (`03-service-edit.html:819-820`), with no hint or disabled state. The `plan/journey/` workflow of `CLAUDE.md` §15 applies (`/docs-audit` baseline first, then `plan/journey/customer/minha-conta.md`, `plan/journey/staff/` servicos journey and both prototype folders updated before the code) and is a prerequisite decision at discovery.
**Consumers to check:** M23-S19 (staff creation) imports the same filter and body builder, M23-S22 (renewal) reopens the form with `initialDraft`, M23-S40 hosts the staff menu. A renewal of a schedule whose service has become ineligible needs a defined behavior (Addendum item 7).

**Description:**
Make a degenerate service (`resourceRequirements: []`, or exactly one unrestricted `{ LOCATION, NONE }` requirement, no legs) eligible for a recurring schedule, with the tenant's single `LOCATION` resource as the resource the schedule's occurrences are checked and held against, exactly as a one-off booking of that service does. This is the platform's default service shape and the original car-wash vertical (see the Addendum). In the same story, bring the web service filter back in line with the backend rule and make the "no service" state explain itself. Staff-plus-room bundles stay Stories 0 to 2.

**Backend use case steps:** `RequestRecurringBookingScheduleUseCase` — same order as today; only eligibility and the requirement the later steps read change. Introduce one "effective requirement" for the service (its explicit single requirement, or the `{ LOCATION, NONE }` default when there are none, mirroring `availability-window-resolution.helpers.ts`) and use it at the three `resourceRequirements[0]` reads (`recurring-booking-schedule-request.helpers.ts:97` and `:142`, `materialize-recurring-schedule-occurrences.helpers.ts:142`); let `assertServiceEligible()` accept `NONE` for `RESOLVE_PER_OCCURRENCE` when the requirement is the unrestricted location. Approval and materialization (M23-S05) resolve the same location. The Addendum records what was read from code: no assignment rows (`buildResourceAssignments` returns none for `RESOLVE_PER_OCCURRENCE`), the existing per-service cap, and `resolveEligibleResources()` working for `LOCATION`; confirm by running it at discovery.
**Backend HTTP surface:** reuses `POST /recurring-booking-schedules`. Expected unchanged: `resourceIds` is already optional unless the policy is `FIXED_ASSIGNMENT`, so a `RESOLVE_PER_OCCURRENCE` request for a default-shape service needs no contract change. If discovery finds otherwise, change `packages/validation/src/booking.ts`, the BFF schema and `@ikaro/types` together.
**BFF endpoint spec:** thin proxy, expected unchanged.
**New migration / i18n keys / env vars / feature flags:** expected none for the data model (no assignment row is written for this case); i18n: the empty-state reasons and the editor hint in both locales; no env vars or flags.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.ts` (+ spec) (modify — `assertServiceEligible`, assignment building, conflict-check resource plan)
- `apps/backend/src/contexts/booking/application/use-cases/request-recurring-booking-schedule.use-case.ts` (+ spec), the M23-S05 approval and materialization path, and the controller, schemas and `.http` blocks in both layers (modify as the contract requires)
- `apps/web/features/booking/model/recurring-schedule-form.ts` (+ spec) (modify — `isRecurrenceEligibleService` mirrors `assertServiceEligible` exactly: selection mode and `requiresPickupAddress` included, plus the degenerate shapes; the body builder sends no resource for them)
- `apps/web/features/customer/components/my-account/NewRecurringScheduleForm.tsx` and `NewRecurringSchedulePage.tsx` (+ specs) (modify — the empty state names why: recurrence not enabled, or the service needs a single resource, with the wording agreed at discovery)
- The service editor's recurrence control (path confirmed at discovery) (modify — a manager enabling recurrence on a service that cannot recur sees why)
- `apps/web/e2e/my-account-recurring-schedule-create.spec.ts` and `apps/web/e2e/helpers/recurring-schedule.ts` (modify — a degenerate-service scenario, and the mobile "+ Novo ▾" scenario also run with bookings present, closing M23-S17's partial E2E criterion)
- `docs/04-USE_CASES.md` (UC-070: rewrite the Preconditions and A7 to say which services can recur; UC-055 for the editor hint), `docs/02-DOMAIN_MODEL.md` § RecurringBookingSchedule (the precondition points there), `docs/27-BUSINESS_LOGIC_REFERENCE.md`, `docs/14-API_CONTRACTS.md` (modify)
- `packages/validation/src/booking.ts` (modify only the comment that says bundle recurrence is out of scope, if Story 0 has not already)
- `packages/i18n/locales/{pt-BR,en}/web.json` (modify — same change)

**Acceptance criteria — product:**
- [ ] A customer can request a recurring reservation for a service with no resource requirements, and for one whose only requirement is the default location, in a tenant that has no staff, room or equipment resources.
- [ ] Its occurrences conflict with other bookings, closures and working hours on the tenant's location exactly as a one-off booking of that service does; a collision lists the colliding occurrences and creates nothing.
- [ ] A service the customer cannot recur never appears in the form, and when none qualifies the page says why.
- [ ] A manager who enables recurrence on a service that cannot recur is told why.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `assertServiceEligible` accepts `[]` and a single unrestricted `NONE` location, still rejects legs, a pickup-address service and (until Stories 0 to 2) more than one real requirement
  - [ ] The web filter and the backend rule agree on a table of shapes (the same table drives both specs), including `NONE` mode and `requiresPickupAddress`
  - [ ] The request for a degenerate service holds and checks the tenant `LOCATION`; the cap and lock behave as decided at discovery
  - [ ] The empty state renders each reason in both locales
- Integration:
  - [ ] `POST /recurring-booking-schedules` for a no-requirement service returns 201 and persists the schedule with its location assignment; an existing occupancy row on the location in a later occurrence returns 409 with nothing persisted; approval materializes the occurrences on the location
- Tenant isolation:
  - [ ] Another tenant's location occupancy never blocks the request
- E2E:
  - [ ] Playwright: a customer of a tenant with no staff resources creates a recurring schedule for a degenerate service and finds it on the list
  - [ ] Playwright: the same on an older service seeded with the backfill's stored `NONE` location row
  - [ ] Playwright: when no service qualifies the form's empty state names the reason, and a service that has recurrence enabled but cannot recur is absent from the form
  - [ ] Playwright, service editor: enabling recurrence on a service that cannot recur shows the hint
  - [ ] Playwright, mobile viewport: the in-page "+ Novo ▾" menu is present with bookings as well as without
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

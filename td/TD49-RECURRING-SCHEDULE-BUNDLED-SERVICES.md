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

Only a flat, single-resource-requirement service can have a recurring schedule today. `assertServiceEligible()` in `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.ts` rejects with `RecurringBookingScheduleIneligibleServiceError('legged-or-bundled')` (`RECURRING_SCHEDULE_INELIGIBLE_SERVICE`) any service with `legs`, more than one `resourceRequirements` entry, or a requirement with `requiredQuantity !== 1`. The request schema mirrors it: `packages/validation/src/booking.ts` declares `resourceIds: z.array(z.uuid()).length(1)`, and the request's single `assignmentPolicy` is tied 1:1 to the service's one requirement `selectionMode` (`CUSTOMER_CHOICE` ↔ `FIXED_ASSIGNMENT`, `AUTO_ANY`/`AUTO_FUNGIBLE_POOL` ↔ `RESOLVE_PER_OCCURRENCE`).

This was a scope cut, not a technical limit: M23-S04's story text says "Bundle/leg recurrence is out of scope for this story." No rationale is recorded there, and **UC-070 itself never states the limit** — it speaks only of "a supported weekly/private recurrence pattern" and describes `FIXED_ASSIGNMENT` / `RESOLVE_PER_OCCURRENCE` without excluding bundles, so a reader of the use case would reasonably assume a staff-plus-room service can recur.

The consequence is a real product gap for verticals whose standard service is a bundle ("stylist + chair", "instructor + studio"): a one-off booking of that service resolves every requirement and requires all of them free (`BookingBundlePartiallyUnavailableError` otherwise), but the same customer cannot standing-book it weekly.

The groundwork for lifting the limit already exists: `recurring_booking_schedule_resource_assignments` carries `requirement_id`, `resource_type` and `required_quantity_position` with a per-resource primary key, and the creation-time conflict check (after TD45-S0) resolves its deciding resources once, locks them once and checks every (resource × occurrence) window in one overlap query — a shape that extends naturally to several requirements.

## Addendum 2026-10-10 — the limit is wider than bundles (found verifying M23-S17)

While checking M23-S17 against a real tenant's data, "which services can a customer actually recur?" turned out to have a much narrower answer than this TD's original "single-resource services are unaffected":

1. **The default service shape cannot recur.** `docs/27-BUSINESS_LOGIC_REFERENCE.md` (§ the service-shape table, "Degenerate") defines the default as `resourceRequirements: []` ("no service starts with one configured"), or exactly one unrestricted `{ LOCATION, NONE }` requirement, with no legs; such a service is booked against the tenant's single `LOCATION` resource (`isDegenerateService()`, and the `DEGENERATE_LOCATION_REQUIREMENT` fallback in `availability-window-resolution.helpers.ts`). Every tenant is guaranteed that resource (`CreateTenantLocationResourceUseCase` for new tenants, the `…8-BackfillLocationResources` migration for existing ones; its own comment states "every tenant always has exactly one active LOCATION resource"). `assertServiceEligible()` rejects the degenerate shape twice over: `[]` fails `resourceRequirements.length !== 1` (`legged-or-bundled`), and a stored `NONE` location row fails the mode check (`selection-mode-mismatch`, because only `CUSTOMER_CHOICE` or `AUTO_*` are accepted). A one-person car wash, whose every service is degenerate, therefore cannot use recurrence at all. The original car-wash vertical is the case recurrence most obviously serves.
2. **Services created before M22 carry a redundant stored row.** The M22 backfill wrote an explicit `{ LOCATION, NONE }` requirement for every existing appointment service (`docs/13-DATABASE_SCHEMA.md`, expand-and-backfill step 2); services created afterwards have no rows. The engine treats the two shapes identically, so the difference is cosmetic everywhere except recurrence. Do not "fix" it by rewriting data: the eligibility rule has to accept both shapes.
3. **A bundle in practice is staff + room (+ equipment), and an older service is location + staff.** The same rule excludes both. A service with only an explicit staff requirement does not involve the location when booked (the fallback applies only when the requirement list is empty), so it stays a single-requirement case and is already eligible.
4. **The M23-S17 web filter does not mirror the backend rule.** `isRecurrenceEligibleService()` (`apps/web/features/booking/model/recurring-schedule-form.ts`) omits two checks `assertServiceEligible()` makes: the single requirement's `selectionMode` must be `CUSTOMER_CHOICE`/`AUTO_ANY`/`AUTO_FUNGIBLE_POOL` (a `NONE` service is offered, then refused as `INELIGIBLE_SERVICE`), and `requiresPickupAddress` must be false. M23-S17's decisions 4 and C say the filter mirrors the backend, so this is a defect in that story's shipped filter.
5. **Nothing tells a manager or a customer why a service is missing.** The form's empty state reads "Nenhum serviço permite reserva recorrente no momento" whether the service is not enabled, is a bundle, or is a default-shape service, and the service editor lets a manager enable "Permitir recorrência" on a service that can never recur.
6. **M23-S17's mobile E2E covers the empty Agendamentos tab only.** Its acceptance criterion says "with and without bookings"; the with-bookings case is covered by the `BookingsList` unit spec, not by Playwright.

Not verified (confirm at discovery, do not assume): how the schedule's assignment rows, the 50-schedule cap and the locks should represent the tenant's `LOCATION` as the schedule's resource when the request names none; whether the request schema can stay `resourceIds: length(1)` for that case or must accept an empty selection; and whether the service editor can save a service with exactly one non-location requirement in every tenant configuration (a profession-only service was observed to save as a single `AUTO_ANY` row).

## Sequencing note — why this originally waited for the whole of M23

Superseded by the Addendum above (re-opened 2026-10-10); kept for the rework it explains. This TD was scheduled after M23 completes, by decision. The cost of that ordering is a rework: M23-S05 will ship its approval and one-shot occurrence materialization step for single-resource schedules (there is no rolling generation — a schedule has a fixed, validated term), and Story 1 below then extends it. To keep that rework small, M23-S05's discovery should keep each occurrence's resolution going through `resolveBookingLinesResourceCandidates()` with `resourceSelections` derived from the stored assignment rows — the same shape a bundle needs — instead of hard-wiring "one resource id per schedule".

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

## Non-goals
- Legged / itinerary recurrence.
- Any change to one-off booking behavior.
- Partial acceptance (accepting the schedule minus the conflicting requirements or occurrences).

## Story 0 — Bundled-recurrence domain and contract model

**Agent:** backend-ts + bff-ts
**Complexity:** L
**Docs to load:** `docs/04-USE_CASES.md` UC-070, `docs/02-DOMAIN_MODEL.md` § RecurringBookingSchedule, `docs/13-DATABASE_SCHEMA.md` § recurring_booking_schedules (and its assignments table), `docs/14-API_CONTRACTS.md` § Recurring Private Reservation Schedules, `docs/27-BUSINESS_LOGIC_REFERENCE.md` § Two-layer creation-time conflict check, `docs/ENGINEERING_RULES_BACKEND.md` § Transactions and § Choosing a race-condition primitive
**Dependencies:** every M23 story ✅ Done; TD45-S0 (the batched conflict check this story extends)
**Pattern:** plain composition — generalizes the resolve-once / one-query / decide-in-memory function from TD45-S0 from one requirement to several; no new named pattern. The mixed-bundle policy model is decided in discovery (see Chosen approach).

**Description:**
Let a flat multi-requirement service be requested as a recurring schedule, rejecting the whole request when any requirement cannot be satisfied in any occurrence. (1) Relax `assertServiceEligible()` so a multi-requirement service without `legs` is eligible; keep `legs` rejected; update the `RecurringBookingScheduleIneligibleServiceError('legged-or-bundled')` message to say only legged services are excluded. (2) Replace the request's single `resourceIds: length(1)` with per-requirement selections keyed like a one-off booking's `resourceSelections` (service + requirement type), in the shared Zod schema, the BFF schema and any `@ikaro/types` shape — a deliberate contract change, grep both layers for duplicate schemas. (3) Resolve the policy model per the open question in Chosen approach. (4) Generalize `assertPatternConflictFree()` to several requirements: union every requirement's deciding resources, lock the union once via `ITenantLockPort.lockResources()`, run one `IResourceOccupancyRepository.findConflictingWindows()` query over all (resource × occurrence) windows, and reject an occurrence when any requirement is unsatisfied. (5) Persist each fixed pick as an assignment row with its `requirement_id`, `resource_type` and `required_quantity_position`. (6) Update UC-070 to state which services can recur, and update the docs listed below.

**Backend use case steps:** `RequestRecurringBookingScheduleUseCase` — the same order as today (lock → prepare/eligibility → cap → pattern conflict → build → save → materialize; the active-schedule overlap step was removed by M23-S05); only eligibility, the selections input, the conflict check and the assignment building change.
**Backend HTTP surface:** reuses `POST /recurring-booking-schedules` — request body shape changes (per-requirement selections); update its request blocks in `apps/backend/http/booking/recurring-booking-schedules.http`.
**BFF endpoint spec:** reuses `POST /recurring-booking-schedules` as a thin proxy — schema and types change to match; add the BFF request block under `apps/bff/http/booking/` (none exists for this route today).
**New migration / i18n keys / env vars / feature flags:** migration only if discovery picks option (a) — expand/contract, widening the `assignment_policy` `CHECK` via `ADD CONSTRAINT ... NOT VALID` then a separate `VALIDATE CONSTRAINT`, with `docs/13-DATABASE_SCHEMA.md` updated in the same commit; i18n keys: none in this story (error copy is backend-English and web copy lives in Story 2); env vars / flags: none.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.ts` (modify — `assertServiceEligible`, `buildResourceAssignments`, `assertPatternConflictFree`)
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.spec.ts` (modify — bundle scenarios and an extended parity test against the one-off bundle resolution)
- `apps/backend/src/contexts/booking/application/use-cases/request-recurring-booking-schedule.use-case.ts` (+ spec) (modify — selections input, lock and cap wiring)
- `apps/backend/src/contexts/booking/domain/recurring-booking-schedule.aggregate.ts` and `recurring-booking-schedule.types.ts` (modify — assignment inputs / policy model)
- `apps/backend/src/contexts/booking/domain/errors/recurring-booking-schedule.error.ts` (modify — ineligible-service message)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-recurring-booking-schedule.mapper.ts` (modify — persist and rehydrate the multi-row assignments)
- `apps/backend/src/contexts/booking/infrastructure/controllers/recurring-booking-schedule.controller.ts` (+ spec, + `.integration.spec.ts`) (modify)
- `packages/validation/src/booking.ts` (modify — the request schema)
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
  - [ ] Mixed modes (`CUSTOMER_CHOICE` + `AUTO_ANY`) are decided per requirement
  - [ ] Parity: the batched bundle verdict equals the one-off bundle resolution for the same seeded occupancy
  - [ ] Assignment rows carry `requirement_id`, `resource_type` and `required_quantity_position`
- Integration:
  - [ ] `POST /recurring-booking-schedules` for a staff + room service returns 201 and persists both assignment rows; a real occupancy row on only one requirement's resource in the 5th occurrence returns 409 with nothing persisted
- Tenant isolation:
  - [ ] Another tenant's occupancy never blocks the request
- E2E: none — covered by Story 2
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

## Story 1 — Generation and management for bundle schedules

**Agent:** backend-ts
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` UC-070 (step 2, A2, A3), UC-071 and UC-073, `docs/27-BUSINESS_LOGIC_REFERENCE.md` § Two-layer creation-time conflict check, `docs/ENGINEERING_RULES_BACKEND.md` § Transactions
**Dependencies:** Story 0; every M23 story ✅ Done (in particular M23-S05's materialization step, which this story extends)
**Pattern:** plain composition — the materialization step and the skip / reschedule / end use cases call the same one-off bundle resolver (`resolveBookingLinesResourceCandidates()`) with `resourceSelections` built from the stored assignment rows; no new named pattern.

**Description:**
Make everything that acts on a schedule after creation bundle-aware. M23-S05's materialization step (run at creation for `AUTO_CONFIRM`, at approval otherwise) materializes each occurrence as a normal linked booking; for a bundle it must resolve every requirement, using the schedule's stored fixed picks for `CUSTOMER_CHOICE` requirements and fresh resolution for `AUTO_*` ones, and create the whole occurrence atomically or not at all. If a requirement cannot be satisfied for a future occurrence at generation time (a chosen staff member is no longer available), the occurrence is not partially created — it goes to the UC-073 future-commitment exception queue, exactly as a single-resource occurrence does today. `EndRecurringBookingScheduleUseCase` must cancel the whole linked bundle booking of every future occurrence and release every resource it holds (skipping or rescheduling one occurrence is the ordinary cancel or reschedule of its linked booking since M23-S08, which already handles a bundle). The exact file paths for the worker and its handlers come from what M23-S05 ships and are confirmed at this story's discovery.

**Backend use case steps:** materialization step — per occurrence of the term: resolve all requirements → check every window → assign every resource → create the booking, or raise a UC-073 exception; skip / reschedule / end — operate on the whole bundle booking.
**Backend HTTP surface:** none new — reuses M23-S04's `PATCH /recurring-booking-schedules/:id` (skip / reschedule / end) and M23-S05's approve / reject routes.
**BFF endpoint spec:** none — no BFF change.
**New migration / i18n keys / env vars / feature flags:** none.

**Files to create/modify:**
- The M23-S05 materialization step, approval use case and their handler (paths per what M23-S05 ships — to be confirmed at discovery, not stated from memory)
- `apps/backend/src/contexts/booking/application/use-cases/end-recurring-booking-schedule.use-case.ts` (+ spec) (modify)
- `apps/backend/src/contexts/booking/application/use-cases/list-recurring-booking-schedules.use-case.ts` (+ spec) (modify — return every assignment with its requirement)
- `docs/27-BUSINESS_LOGIC_REFERENCE.md`, `docs/04-USE_CASES.md` (modify)

**Acceptance criteria — product:**
- [ ] Occurrences of an approved or auto-confirmed bundle schedule appear as normal bookings holding every required resource.
- [ ] When one required resource is no longer available for a future occurrence, that occurrence is not created partially; a manager exception is raised instead.
- [ ] Skipping, rescheduling or ending a bundle occurrence releases every resource it held.

**Acceptance criteria — technical:**
- Unit:
  - [ ] Generation resolves fixed picks and auto requirements together and creates all resource assignments for the occurrence
  - [ ] A requirement that cannot be satisfied creates nothing for that occurrence and raises the UC-073 exception
  - [ ] Skip / reschedule / end release every resource of the occurrence's booking
- Integration:
  - [ ] A real staff + room schedule generates a booking with both `resource_occupancy` rows; an occurrence where the staff member is busy raises the exception and creates no partial occupancy
- Tenant isolation:
  - [ ] Generation and management never touch another tenant's schedules or occupancy
- E2E: none — covered by Story 2
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

## Story 2 — Bundle-aware recurring-schedule screens

**Agent:** frontend-ts
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer, `docs/14-API_CONTRACTS.md` § Recurring Private Reservation Schedules, `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/ENGINEERING_RULES_SHARED.md` § Authoring new i18n UI copy keys
**Dependencies:** Stories 0 and 1; every M23 story ✅ Done (M23-S17's creation flow, M23-S12's Minha Conta screens and M23-S13's approval queue are what this story extends)
**Pattern:** plain composition — reuses the one-off booking flow's per-requirement resource picker rather than building a second one.
**Prototype references:** `plan/journey/customer/minha-conta.md` and `plan/journey/customer/prototypes/minha-conta/13-nova-recorrencia.html`, `13b-nova-recorrencia-revisar.html`, `06-reserva-recorrente.html`, `06b-reserva-recorrente-erro.html`, `06c-recorrente-em-analise.html`, `14-recorrentes-lista.html`, `dev-notes.md` — none of these depicts a bundle (the pattern builder `13` deliberately shows a single resource field), so a prototype extension (via the `plan/journey/` workflow in `CLAUDE.md` §15, starting with `/docs-audit`) is a prerequisite decision at discovery.

**Description:**
Give a customer (or staff on their behalf) a way to choose a resource per requirement when creating a recurring schedule for a bundle, show each requirement's resource in the customer's schedule list and the staff approval queue, and surface the all-or-nothing conflict as the existing "conflict" error state. The creation flow this story extends is M23-S17 (the pattern builder `NewRecurringScheduleForm`, its review step and the outcome screens); when this TD was written no M23 story built it, and M23-S17 was added on 2026-09-29 to close that gap. It draws a single resource field on purpose, so this story turns that into one selection per requirement. M23-S18's hours-and-closures check must be extended to a bundle's requirements at the same time (a closed day or a closed room fails the whole occurrence). The service filter `isRecurrenceEligibleService()` must follow the backend rule again here: Story 3 aligns it with the default-location case, and this story widens it to a multi-requirement service without legs.

**Files to create/modify:**
- `apps/web/features/customer/components/my-account/NewRecurringScheduleForm.tsx`, `NewRecurringScheduleReview.tsx` and `NewRecurringScheduleResult.tsx` with their specs (planned by M23-S17; exist once that ships — confirm the shipped paths at discovery)
- `apps/web/features/customer/components/my-account/RecurringScheduleList.tsx` and its spec (planned by M23-S12; exists once that ships — confirm the shipped path at discovery)
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
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

## Story 3 — Default-location (degenerate) services can recur, and the eligibility filter mirrors the backend

**Agent:** backend-ts + frontend-ts
**Complexity:** M (raise to L if discovery finds the assignment rows, cap or locks cannot represent the tenant `LOCATION` without a migration)
**Docs to load:** `docs/04-USE_CASES.md` UC-070, `docs/27-BUSINESS_LOGIC_REFERENCE.md` (the service-shape table, § Two-layer creation-time conflict check, § Pinned selections), `docs/02-DOMAIN_MODEL.md` § RecurringBookingSchedule, `docs/13-DATABASE_SCHEMA.md` § recurring_booking_schedules and its assignments table, `docs/ENGINEERING_RULES_BACKEND.md` § Transactions and § Choosing a race-condition primitive, `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/ENGINEERING_RULES_SHARED.md` § Authoring new i18n UI copy keys
**Dependencies:** M23-S17 ✅ Done (its form, `recurring-schedule-form.ts` and E2E helpers are what this story extends). It can ship before Stories 0 to 2, but its `/story-discovery` must settle the policy model with Story 0 so the two do not pick incompatible shapes.
**Pattern:** plain composition — extends `assertServiceEligible()` and the assignment building with one more service shape, resolving the tenant's `LOCATION` through the same path a one-off degenerate booking uses; no new named pattern.

**Description:**
Make a degenerate service (`resourceRequirements: []`, or exactly one unrestricted `{ LOCATION, NONE }` requirement, no legs) eligible for a recurring schedule, with the tenant's single `LOCATION` resource as the resource the schedule's occurrences are checked and held against, exactly as a one-off booking of that service does. This is the platform's default service shape and the original car-wash vertical (see the Addendum). In the same story, bring the web service filter back in line with the backend rule and make the "no service" state explain itself. Staff-plus-room bundles stay Stories 0 to 2.

**Backend use case steps:** `RequestRecurringBookingScheduleUseCase` — same order as today; only eligibility (accept the degenerate shapes), the resource plan (the tenant `LOCATION` when the request names no resource) and the assignment building change. Approval and materialization (M23-S05) must resolve the same location. Exact rows, cap and lock semantics are decided at discovery (see the Addendum's "Not verified").
**Backend HTTP surface:** reuses `POST /recurring-booking-schedules`; the request may need to accept an empty `resourceIds` for this shape (a contract change if so, in `packages/validation/src/booking.ts`, the BFF schema and `@ikaro/types`).
**BFF endpoint spec:** thin proxy, schema and types follow the backend.
**New migration / i18n keys / env vars / feature flags:** migration only if discovery finds the assignment table or its `CHECK` cannot hold the location case; i18n: the empty-state reasons in both locales; no env vars or flags.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.ts` (+ spec) (modify — `assertServiceEligible`, assignment building, conflict-check resource plan)
- `apps/backend/src/contexts/booking/application/use-cases/request-recurring-booking-schedule.use-case.ts` (+ spec), the M23-S05 approval and materialization path, and the controller, schemas and `.http` blocks in both layers (modify as the contract requires)
- `apps/web/features/booking/model/recurring-schedule-form.ts` (+ spec) (modify — `isRecurrenceEligibleService` mirrors `assertServiceEligible` exactly: selection mode and `requiresPickupAddress` included, plus the degenerate shapes; the body builder sends no resource for them)
- `apps/web/features/customer/components/my-account/NewRecurringScheduleForm.tsx` and `NewRecurringSchedulePage.tsx` (+ specs) (modify — the empty state names why: recurrence not enabled, or the service needs a single resource, with the wording agreed at discovery)
- The service editor's recurrence control (path confirmed at discovery) (modify — a manager enabling recurrence on a service that cannot recur sees why)
- `apps/web/e2e/my-account-recurring-schedule-create.spec.ts` and `apps/web/e2e/helpers/recurring-schedule.ts` (modify — a degenerate-service scenario, and the mobile "+ Novo ▾" scenario also run with bookings present, closing M23-S17's partial E2E criterion)
- `docs/04-USE_CASES.md` (UC-070: state which services can recur), `docs/27-BUSINESS_LOGIC_REFERENCE.md`, `docs/14-API_CONTRACTS.md` (modify)
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
  - [ ] Playwright, mobile viewport: the in-page "+ Novo ▾" menu is present with bookings as well as without
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

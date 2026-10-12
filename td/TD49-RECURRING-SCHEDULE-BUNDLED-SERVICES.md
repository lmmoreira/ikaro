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
7. **The eligibility rule has more consumers than the customer form.** M23-S19 (staff creates on a customer's behalf) imports the same filter, body builder and validation from `features/booking/model/` (its decision 4), M23-S22 (renewal) opens the same form through `initialDraft`, M23-S40 hosts the staff "+ Novo" menu, and M23-S13 shows the schedule in the approval queue. Each of them inherits whatever the filter allows, so widening it must be checked against all of them, and a renewal of a schedule whose service has since become ineligible needs a defined behavior (decided in Story 3: the blank form with the not-found notice, or the empty state when nothing qualifies).
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

Story 0's `/story-discovery` (2026-10-11) decided all five items below; the decisions are in Story 0's "Decisions locked at discovery" block. Original questions, kept for the reasoning:
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
| Default shape: no requirements | a customer creates a schedule and finds it on the list (on the shared E2E tenant, which always has other resources: the default-shape path never reads them, and the backend integration spec covers the LOCATION-only resolution) | Story 3 |
| Default shape: stored `NONE` location row (older service) | same scenario on a service seeded with the backfill's row | Story 3 |
| Default shape | the form's empty state shows the matching variant when no service qualifies; a service enabled but not recurrable is absent | Story 3 |
| Service editor | a service that cannot recur shows the advisory hint under the toggle, and saving still works | Story 3 |
| Mobile viewport | the in-page "+ Novo ▾" menu is present with bookings as well as without | Story 3 |
| Bundle (staff `CUSTOMER_CHOICE` + room `AUTO_ANY`) | create with one pick per requirement, then find it on the list with both resources | Story 2 |
| Bundle | a conflict on only one requirement lists the colliding occurrence and creates nothing | Story 2 |
| Bundle, `MANUAL_APPROVAL` | the customer sees it pending, and after approval through the API the list shows it active | Story 2 |
| Bundle, `MANUAL_APPROVAL`, staff queue | a manager approves a seeded bundle request from the queue and the occurrences appear holding both resources; a refused approval leaves it pending | M23-S13 (its text carries the bundle details, 2026-10-12) |
| Mixed tenant: one default-shape and one bundle service | the form offers both and each is created through its own path | Story 2 |
| Mixed catalog: `CUSTOMER_CHOICE`, `AUTO_ANY` and `AUTO_FUNGIBLE_POOL` services beside a pickup-address one, a recurrence-off one and a legged one | the form offers exactly the eligible ones and none of the others (Story 3 pinned the default shape and the bundle only) | Story 2 |
| Legged service | never offered in the form | covered by the unit filter table (Story 3); no E2E |
| Staff creation, renewal, Agenda menu | re-run the eligibility scenarios above against the staff form, `initialDraft` and the menu | M23-S19, S22, S40, each in its own E2E |

## Story 0 — Bundled-recurrence domain and contract model ✅ Done

**Agent:** backend-ts + bff-ts
**Complexity:** L
**Docs to load:** `docs/04-USE_CASES.md` UC-070, `docs/02-DOMAIN_MODEL.md` § RecurringBookingSchedule, `docs/13-DATABASE_SCHEMA.md` § recurring_booking_schedules (and its assignments table), `docs/14-API_CONTRACTS.md` § Recurring Private Reservation Schedules, `docs/27-BUSINESS_LOGIC_REFERENCE.md` § Two-layer creation-time conflict check, `docs/ENGINEERING_RULES_BACKEND.md` § Transactions and § Choosing a race-condition primitive
**Dependencies:** TD45-S0 (the batched conflict check this story extends); M23-S04, S05, S12, S17 and S18 ✅ Done. The remaining M23 stories no longer gate it (see the Addendum), but S13, S19, S22 and S40 consume its eligibility rule, so confirm their status at discovery. Decide the policy model together with Story 3's discovery.
**Pattern:** plain composition — generalizes the resolve-once / one-query / decide-in-memory function from TD45-S0 from one requirement to several; no new named pattern. The mixed-bundle policy model is decided in discovery (see Chosen approach).
**Decisions locked at discovery (2026-10-11):**
1. **Policy model — server-derived, no migration.** The two existing `assignmentPolicy` values stay. The server derives it from the service: `FIXED_ASSIGNMENT` when any requirement is `CUSTOMER_CHOICE` (a mixed bundle counts as `FIXED_ASSIGNMENT`, with assignment rows only for the picked resources), otherwise `RESOLVE_PER_OCCURRENCE`. `assignmentPolicy` leaves the request body. The cap is per picked resource for `FIXED_ASSIGNMENT` and per service for `RESOLVE_PER_OCCURRENCE`. The lock is the service first, then the picks, in a fixed order (the same order on the request and approval paths).
2. **Contract — replace `resourceIds` in one step.** The request carries `resourceSelections: [{ resourceType, resourceId }]`, the same shape and the same key (service, type) as a one-off booking, consumed in requirement order when two requirements share a type. No compatibility window: the web form is the only client and deploys with the backend. Change the shared Zod schema, the BFF schema, `@ikaro/types` and the `.http` files together.
3. **`requiredQuantity > 1` stays rejected**, with the existing `legged-or-bundled` code.
4. **`NONE` in a bundle:** accepted only when it is the unrestricted `LOCATION`, as in Story 3; it is then checked, locked and occupied like any other requirement (a one-off booking does the same). A `NONE` on any other type stays refused.
5. **No snapshot column.** Approval re-runs `assertServiceEligible()` against the current service (`approve-recurring-booking-schedule.use-case.ts` does not call it today) and refuses the approval when the service no longer qualifies.
6. **Assignment rows:** written only for `CUSTOMER_CHOICE` picks. `requirement_id` and `required_quantity_position` stay `null`. **Correction to the Chosen approach above:** `requirement_id` cannot be populated, because `TypeOrmServiceRepository.save` deletes and re-inserts a service's requirement rows on every save (`typeorm-service.repository.ts:154-165`) and the `ResourceRequirement` value object has no id, so the FK would break any later service edit. A requirement is identified by `resource_type`. The reassign sync (`future-commitment-schedule-sync.helpers.ts`) is Story 1's (see its description).

**Description:**
Let a flat multi-requirement service be requested as a recurring schedule, rejecting the whole request when any requirement cannot be satisfied in any occurrence. (1) Relax `assertServiceEligible()` so a multi-requirement service without `legs` is eligible; keep `legs` rejected; update the `RecurringBookingScheduleIneligibleServiceError('legged-or-bundled')` message to say only legged services are excluded. (2) Replace the request's single `resourceIds: length(1)` with per-requirement selections keyed like a one-off booking's `resourceSelections` (service + requirement type), in the shared Zod schema, the BFF schema and any `@ikaro/types` shape — a deliberate contract change, grep both layers for duplicate schemas. (3) Resolve the policy model per the open question in Chosen approach. (4) Generalize `assertPatternConflictFree()` (in `materialize-recurring-schedule-occurrences.helpers.ts`, called by both the request and the approve use cases) and `planOccurrenceResources()` (`recurring-occurrence-resource-plan.helpers.ts`, which takes one `selectionMode` today) to several requirements, including how a `NONE` location requirement behaves (open question 4): union every requirement's deciding resources, lock the union once via `ITenantLockPort.lockResources()`, run one `IResourceOccupancyRepository.findConflictingWindows()` query over all (resource × occurrence) windows, and reject an occurrence when any requirement is unsatisfied. (5) Persist each `CUSTOMER_CHOICE` pick as an assignment row identified by its `resource_type` (`requirement_id` and `required_quantity_position` stay `null`, decision 6). (6) Update UC-070 to state which services can recur, and update the docs listed below.

**Backend use case steps:** `RequestRecurringBookingScheduleUseCase` — the same order as today (lock → prepare/eligibility → cap → pattern conflict → build → save → materialize; the active-schedule overlap step was removed by M23-S05); only eligibility, the selections input, the conflict check and the assignment building change.
**Backend HTTP surface:** reuses `POST /recurring-booking-schedules` — request body shape changes (per-requirement selections); update its request blocks in `apps/backend/http/booking/recurring-booking-schedules.http`.
**BFF endpoint spec:** reuses `POST /recurring-booking-schedules` as a thin proxy — schema and types change to match; add the BFF request block under `apps/bff/http/booking/` (none exists for this route today).
**New migration / i18n keys / env vars / feature flags:** migration only if discovery picks option (a) — expand/contract, widening the `assignment_policy` `CHECK` via `ADD CONSTRAINT ... NOT VALID` then a separate `VALIDATE CONSTRAINT`, with `docs/13-DATABASE_SCHEMA.md` updated in the same commit; i18n keys: none in this story (error copy is backend-English and web copy lives in Story 2); env vars / flags: none.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.ts` (modify — `assertServiceEligible`, `buildResourceAssignments`, `resolveConsideredResources`, the `resourceRequirements[0]` reads)
- `apps/backend/src/contexts/booking/application/use-cases/materialize-recurring-schedule-occurrences.helpers.ts`, `recurring-occurrence-resource-plan.helpers.ts`, `recurring-occurrence-occupancy.helpers.ts`, `recurring-booking-schedule-hours.helpers.ts` and `recurring-booking-schedule-cap.helpers.ts` (+ specs) (modify — the conflict check, the per-occurrence plan, the hours-and-closures pass and the cap for several requirements)
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.spec.ts` (modify — bundle scenarios and an extended parity test against the one-off bundle resolution)
- `apps/backend/src/contexts/booking/application/use-cases/request-recurring-booking-schedule.use-case.ts` (+ spec) (modify — selections input, derived policy, lock and cap wiring)
- `apps/backend/src/contexts/booking/application/use-cases/approve-recurring-booking-schedule.use-case.ts` (+ spec) (modify — re-run `assertServiceEligible()`, lock and conflict-check wiring for several requirements; decision 5)
- `apps/backend/src/contexts/booking/domain/recurring-booking-schedule.aggregate.ts` and `recurring-booking-schedule.types.ts` (modify — assignment inputs / policy model)
- `apps/backend/src/contexts/booking/domain/errors/recurring-booking-schedule.error.ts` (modify — ineligible-service message)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-recurring-booking-schedule.mapper.ts` (modify — persist and rehydrate the multi-row assignments)
- `apps/backend/src/contexts/booking/infrastructure/controllers/recurring-booking-schedule.controller.ts` (+ spec, + `.integration.spec.ts`) (modify)
- `packages/validation/src/booking.ts` (modify — the request schema, and its comment that "bundle/multi-leg recurrence is out of scope")
- `apps/bff/src/features/booking/recurring-booking-schedules.controller.ts`, `.schemas.ts`, `.types.ts` (+ specs) (modify)
- `apps/backend/http/booking/recurring-booking-schedules.http` (modify) and `apps/bff/http/booking/recurring-booking-schedules.http` (new)
- `docs/04-USE_CASES.md`, `docs/02-DOMAIN_MODEL.md`, `docs/14-API_CONTRACTS.md`, `docs/27-BUSINESS_LOGIC_REFERENCE.md` (modify); `docs/13-DATABASE_SCHEMA.md` (one-line wording fix only: the assignments table's `requirement_id` / `required_quantity_position` note says this TD starts populating them; they stay `null`, decision 6)

**Acceptance criteria — product:**
- [ ] A customer (or staff on their behalf) can request a recurring schedule for a service that needs, for example, a staff member and a room.
- [ ] The request is rejected with a `409` and nothing is persisted if any required resource is busy in any occurrence of the term.
- [ ] A service with legs, or with a requirement of quantity above 1, is still rejected as ineligible, with a message that names exactly those two exclusions and does not call a bundle ineligible.

**Acceptance criteria — technical:**
- Unit:
  - [ ] A two-requirement service is eligible; a legged service and a quantity-above-1 requirement are still rejected
  - [ ] Conflict on only one requirement (staff busy, room free) in a later occurrence rejects the whole schedule with one lock call and one overlap query
  - [ ] Both requirements free in every occurrence is accepted
  - [ ] Mixed modes (`CUSTOMER_CHOICE` + `AUTO_ANY`) are decided per requirement, and a `NONE` location requirement in a bundle is handled as decided at discovery
  - [ ] Parity: the batched bundle verdict equals the one-off bundle resolution for the same seeded occupancy
  - [ ] Assignment rows exist only for `CUSTOMER_CHOICE` picks and carry `resource_type`; `requirement_id` and `required_quantity_position` stay `null` (decision 6)
- Integration:
  - [ ] `POST /recurring-booking-schedules` for a staff + room service returns 201, persists the `CUSTOMER_CHOICE` pick's assignment row (decision 6) and holds both resources; a real occupancy row on only one requirement's resource in the 5th occurrence returns 409 with nothing persisted
- Tenant isolation:
  - [ ] Another tenant's occupancy never blocks the request
- E2E: none — covered by Story 2
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

## Story 1 — Materialization, approval and management for bundle schedules ✅ Done

> Re-scoped 2026-10-10. The first draft assumed a later generation job that raises UC-073 exceptions. That does not exist: M23-S05 materializes the whole term once (at creation for `AUTO_CONFIRM`, at approval otherwise) and a failure refuses the whole request or approval (UC-070 A1, UC-071 A3); M23-S08 made an occurrence an ordinary linked booking and removed the schedule-side exception path.

**Decisions locked at discovery (2026-10-12):**
1. **Story 0 already delivered most of the code.** On `main` (#589): multi-resource materialization (`buildCandidates` holds one resource per requirement, with `isBundleMember`), the approval re-check (`assertServiceEligible`, derived-policy check, lock, whole-term conflict check) and the creation-time bundle integration test. This story is therefore: the reassign sync fix, the read-shape change, the bundle approval / end / skip / reschedule proofs (a code fix only where a proof fails) and the docs.
2. **Read shape:** `resourceIds` stays. Add `resourceAssignments?: { resourceType, resourceId }[]` to `RecurringBookingScheduleListItem` with the stored `CUSTOMER_CHOICE` picks only. `AUTO_*` requirements have no schedule-level resource (it varies per occurrence); Story 2 reads those from the occurrence bookings. Additive in `@ikaro/types`; the BFF is a pass-through (types only, no endpoint change).
3. **Reassign sync rule:** the schedule's pick follows a reassign once every future occurrence's line holds an assignment on `toResourceId`. Other resources in a bundle booking are ignored.

**Agent:** backend-ts
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` UC-070 (step 2, A1–A3), UC-071 and UC-073, `docs/27-BUSINESS_LOGIC_REFERENCE.md` § Two-layer creation-time conflict check and § Approval, expiry and end of term, `docs/ENGINEERING_RULES_BACKEND.md` § Transactions
**Dependencies:** Story 0; M23-S05 and M23-S08 ✅ Done (the materialization and approval path and the occurrence-as-booking model this story extends)
**Pattern:** plain composition — the materialization and approval path plans every requirement's resource through the generalized `planOccurrenceResources()` from Story 0, and the existing booking cancel / release code is reused for end, skip and reschedule; no new named pattern.

**Description:**
Make the steps that run after a schedule is accepted bundle-aware. Materialization (`materialize-recurring-schedule-occurrences.helpers.ts`, called by `request-recurring-booking-schedule.use-case.ts` and `approve-recurring-booking-schedule.use-case.ts`) must create each occurrence as one linked booking that holds **every** requirement's resource, using the schedule's stored fixed picks for `CUSTOMER_CHOICE` requirements and the per-requirement plan for `AUTO_*` ones, all in the same transaction. The approval re-check (UC-071) repeats Story 0's all-requirements conflict and hours check, and an occurrence that no longer passes refuses the whole approval as it does for a single resource. Ending a schedule cancels each future linked booking and releases its occupancy generically today (`end-recurring-booking-schedule.use-case.ts` via `releaseBookingOccupancy`), and skip and reschedule are the booking's own operations since M23-S08; this story proves, with tests, that a bundle booking is released and moved in full, and changes code only where that proof fails. The list and detail reads must return every assignment with its requirement. **The reassign sync is part of this story** (decided at Story 0's discovery, 2026-10-11): `syncOne` in `future-commitment-schedule-sync.helpers.ts` returns early when any assignment on the remaining bookings is not on `toResourceId`, and a bundle booking always holds a second resource, so the schedule's assignment row would never follow a bulk reassign. Make it compare only the schedule's own resources, and add `future-commitment-schedule-sync.helpers.ts` (+ spec) to the files below.

**Backend use case steps:** materialization — for the whole term: plan every requirement's resource per occurrence → insert the bookings and every occupancy row in bulk; approval — re-run the all-requirements check, refuse the whole approval on any failure, otherwise materialize; end / skip / reschedule — the existing booking operations on a bundle booking.
**Backend HTTP surface:** none new — reuses `POST /recurring-booking-schedules`, its approve / reject routes and the end route.
**BFF endpoint spec:** none — types only (`resourceAssignments` passes through), no endpoint change.
**New migration / i18n keys / env vars / feature flags:** none.

**Files to create/modify:**
- `packages/types/src/recurring-booking-schedule.dto.ts` and `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-result.helpers.ts` (+ spec) (modify — `resourceAssignments`, decision 2)
- `apps/backend/http/booking/recurring-booking-schedules.http` (modify — response notes), `docs/14-API_CONTRACTS.md` (modify)
- `apps/backend/src/contexts/booking/infrastructure/controllers/recurring-booking-schedule-approval.controller.integration.spec.ts` (modify — the bundle integration scenarios below, the read check included)
- `apps/backend/src/contexts/booking/application/use-cases/materialize-recurring-schedule-occurrences.helpers.ts`, `approve-recurring-booking-schedule.use-case.ts` and `recurring-occurrence-occupancy.helpers.ts` (+ specs) (modify only where a proof fails; Story 0 already generalized them)
- `apps/backend/src/contexts/booking/application/use-cases/end-recurring-booking-schedule.use-case.ts` (+ spec) (modify only if the bundle proof fails)
- `apps/backend/src/contexts/booking/application/use-cases/future-commitment-schedule-sync.helpers.ts` (+ spec) (modify — the reassign sync compares only the schedule's own resources)
- `docs/27-BUSINESS_LOGIC_REFERENCE.md`, `docs/04-USE_CASES.md` (modify — UC-070/071 state that a bundle is supported end to end)

**Acceptance criteria — product:**
- [ ] Occurrences of an approved or auto-confirmed bundle schedule appear as normal bookings holding every required resource.
- [ ] If a required resource stops being available between a request and its approval, the approval is refused as a whole and the schedule stays pending, exactly as for a single resource.
- [ ] Skipping, rescheduling or ending a bundle occurrence releases every resource it held.
- [ ] The schedule read exposes the stored picks by resource type (`resourceAssignments`).

**Acceptance criteria — technical:**
- Unit:
  - [ ] Materialization resolves fixed picks and auto requirements together and creates all resource assignments and occupancy rows for every occurrence
  - [ ] The approval re-check fails the whole approval when only the room is busy in an occurrence, and creates nothing; both-free approval materializes both resources
  - [ ] Reassign sync: swaps the pick when the booking also holds an unrelated second resource; leaves it alone when an occurrence is scattered onto a third resource
  - [ ] `toRecurringBookingScheduleResult` returns `resourceAssignments` with the resource type of each stored pick
- Integration:
  - [ ] Approve a `MANUAL_APPROVAL` staff + room schedule: both `resource_occupancy` rows per occurrence
  - [ ] Approval after the staff member became busy: 409, schedule still pending, no partial occupancy
  - [ ] Ending the schedule releases both rows of every future occurrence
  - [ ] Cancelling one occurrence releases its two rows and leaves the others
  - [ ] Rescheduling one occurrence keeps the pinned staff pick and moves both rows
  - [ ] A bundle reassign through the exceptions flow updates the schedule's assignment
- Tenant isolation:
  - [ ] Generation, approval, end and sync never touch another tenant's schedules or occupancy
- E2E: none — covered by Story 2
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

## Story 2 — Bundle-aware customer recurring-schedule form ✅ Done

> Re-scoped at `/story-discovery` (2026-10-12). The first draft also covered the staff approval queue and customer-side resource lines. The queue belongs to M23-S13 (not built; its bundle details are now written into that story), and customers never see a schedule's resources, so the customer list and detail do not change.

**Agent:** frontend-ts
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer, `docs/14-API_CONTRACTS.md` § Recurring Private Reservation Schedules, `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/ENGINEERING_RULES_SHARED.md` § Authoring new i18n UI copy keys, `docs/08-TESTING_STRATEGY.md` § apps/web Testing Infrastructure
**Dependencies:** Stories 0, 1 and 3, M23-S17 (the form) and M23-S22 (renewal) ✅ Done. M23-S13 (the staff queue) is **not** a dependency any more; M23-S19 and S40 consume the model this story changes.
**Pattern:** plain composition — one `PillSelect` group per `CUSTOMER_CHOICE` requirement, built like the existing `ResourceField`; the customer shell has its own design system, so the hotsite `ResourcePicker` (which paints with `--ba-*`) is not reused.
**Prototype references:** `plan/journey/customer/minha-conta.md`, `plan/journey/customer/prototypes/minha-conta/13h-nova-recorrencia-pacote.html` (new, drawn at discovery: every composition the backend accepts — A/A2 choice plus automatic or all chosen, B two of one type numbered, C a pick missing, D all automatic, E a unit pool, F older location + staff, G three requirements, H loading / error / no options; the service-shape table is in its header comment), `13b-nova-recorrencia-revisar.html#pacote` (one row per resource), `13-nova-recorrencia.html`, `dev-notes.md`, `index.html`. When this story ships, flip the `❓ Gap (TD49-S02)` status of `13h` and of `13b`'s bundle variant to ✅ in `minha-conta.md`, `index.html` and `dev-notes.md`. `13`, `13c`, `06`, `06b`, `06c` and `14` are unchanged on purpose.

**Decisions locked at discovery (2026-10-12):**
1. **Customer side only.** The staff approval-queue row, the approval detail and the manager-approves-a-bundle E2E move to M23-S13 (its text now carries the bundle details). Staff creation (M23-S19) inherits this story's form model.
2. **Customer list and detail do not change.** A customer never sees a schedule's resources (staff-only `assignedResources`; the list shows the service name). The picks are shown on the review step (`13b#pacote`).
3. **A conflict keeps the standard message and the dates list.** The 409 payload carries `{ occurrenceStart, reason }` only, so the collided requirement is not named; no backend change.
4. **Form model:** the draft holds one pick per `CUSTOMER_CHOICE` requirement (not a single `resourceId`); validation requires every pick (`RESOURCE_REQUIRED` per requirement); the body sends one `resourceSelections` entry per pick, keyed by that requirement's type, in the service's requirement order (the backend matches same-type requirements in that order, Story 0 decision 2). Two requirements of the same type are shown numbered ("Profissional 1", "Profissional 2"), otherwise the title is the type's `booking.resourcePicker.sectionTitle.*` string.
5. **Eligibility:** `recurrence-shape.ts` drops the `several-requirements` blocker and checks quantity and selection mode on **every** requirement, as `assertServiceEligible()` does (quantity 1; `CUSTOMER_CHOICE` / `AUTO_ANY` / `AUTO_FUNGIBLE_POOL`, or `NONE` only on the unrestricted `LOCATION`). The service editor's hint loses the `several-requirements` reason: delete `politicasRecurrenceReasonSeveralRequirements` from both locales, the branch in `PolicyWhoHowCard.tsx` and its specs, and update `03f` / `staff/servicos.md` / `servicos/dev-notes.md` wording.
6. **Renewal:** `buildRenewalDraft()` pre-fills each pick from `schedule.resourceAssignments` by resource type, in requirement order (falling back to `resourceIds[0]` only for a single-requirement service when `resourceAssignments` is absent in a rolling deploy); a pick that is no longer offered falls back to the first option, as today.
7. **Options source:** `GET /public/services/:id/resource-options` already returns one entry per `CUSTOMER_CHOICE` requirement; `useRecurringResourceOptions` stops selecting only `requirements[0]`.

**Description:**
Let a customer request a recurring schedule for a service with several resource requirements. The form shows one pick group per `CUSTOMER_CHOICE` requirement and an info line for each automatic one, the review step lists every resource, and the request carries one `resourceSelections` entry per pick. The service filter follows the backend rule for every requirement (decision 5), which also removes the editor hint's bundle reason. M23-S18's hours-and-closures check and Story 0's conflict check already cover a bundle, so a conflict on any requirement arrives as the standard 409 and is shown by the existing conflict screen. Renewal pre-fills the picks (decision 6).

**Files to create/modify:**
- `apps/web/features/booking/model/recurrence-shape.ts` (+ `recurrence-shape.spec.ts`) (modify — per-requirement checks, drop `several-requirements`; the table that drives the web and backend specs gains the bundle rows)
- `apps/web/features/booking/model/recurring-schedule-form.ts` (+ spec) (modify — the draft holds picks per requirement, `requiresResourceChoice` becomes the list of `CUSTOMER_CHOICE` requirements, `validateDraft`, `buildCreateRequest`)
- `apps/web/features/booking/model/recurring-schedule-renewal.ts` (+ spec) (modify — pre-fill by type)
- `apps/web/features/booking/model/recurring-service-eligibility.ts` (+ spec) (modify — comment and any bundle-specific case)
- `apps/web/features/customer/hooks/useRecurringResourceOptions.ts` (+ spec if present) (modify — all requirements)
- `apps/web/features/customer/components/my-account/NewRecurringScheduleServiceFields.tsx`, `NewRecurringScheduleForm.tsx`, `NewRecurringSchedulePage.tsx`, `NewRecurringScheduleReview.tsx` (+ their specs) (modify — a group per requirement, the info line, numbered titles, the review rows)
- `apps/web/features/booking/components/dashboard/services/PolicyWhoHowCard.tsx` (+ spec) (modify — drop the bundle reason)
- `packages/i18n/locales/{pt-BR,en}/web.json` (modify — new customer keys under `customer.recurringSchedules.new` for the per-requirement title with an index, the automatic-requirement line, the per-requirement required error and the review row labels; remove `politicasRecurrenceReasonSeveralRequirements`; both locales in the same change)
- `apps/web/e2e/my-account-recurring-schedule-create.spec.ts` and `apps/web/e2e/helpers/recurring-schedule.ts` (modify — the bundle scenarios below; the bundle seeding helper exists)
- `apps/backend/src/contexts/booking/infrastructure/controllers/recurring-booking-schedule.controller.integration.spec.ts` (modify — the carried-over ineligible-service cases)
- `plan/journey/customer/**` and `plan/journey/staff/prototypes/servicos/**` (the drawn prototypes and the wording updates listed above), `docs/04-USE_CASES.md` UC-070 (the Preconditions sentence "The customer form still offers only shapes (1) and (2)")

**Acceptance criteria — product:**
- [ ] A customer can request a recurring schedule for a service that needs, for example, a staff member and a room, choosing the staff member and seeing that the room is chosen automatically.
- [ ] The review step lists every resource of the bundle before confirming.
- [ ] A conflict on any requirement shows the standard conflict message and the colliding dates, and creates nothing.
- [ ] A service with legs, a pickup address, a requirement of quantity above 1 or recurrence off is still never offered; the service editor no longer tells a manager that "more than one resource" blocks recurrence.
- [ ] Renewing a bundle schedule pre-fills the staff pick.

**Acceptance criteria — technical:**
- Unit:
  - [ ] The shape table (one table drives the web filter and the backend rule specs) includes bundles: two valid requirements are eligible; a quantity-2 requirement, a bad `NONE` and legs are refused
  - [ ] The form renders one group per `CUSTOMER_CHOICE` requirement, none for the automatic one (an info line instead), numbers same-type groups, preselects the first option of each, and blocks Revisar until every group has a pick
  - [ ] Each composition of the `13h` table renders as drawn: two chosen (A2), all automatic with no options fetched and no `resourceSelections` sent (D), a unit pool as an info line (E), a stored `NONE` location with neither group nor line (F), three requirements (G)
  - [ ] A group that is loading, failed or has no options blocks Revisar without hiding the other groups (H)
  - [ ] `buildCreateRequest` sends one `resourceSelections` entry per pick in requirement order, keyed by that requirement's type, and none for a service without a `CUSTOMER_CHOICE` requirement
  - [ ] The review step lists every resource and says "escolhida automaticamente" for the automatic ones
  - [ ] `buildRenewalDraft` pre-fills the picks by type and falls back to the first option when a pick is gone
  - [ ] Negative guarantees, each its own test: legs, a pickup address and a quantity-above-1 requirement are still refused when a bundle is accepted; a single-requirement service still sends exactly one entry
  - [ ] The editor hint no longer lists the bundle reason and still lists the others
- Integration (backend; carried over from Story 3):
  - [ ] `POST /recurring-booking-schedules` returns 422 and persists nothing for a pickup-address service, a service with recurrence off and a legged service
- Tenant isolation:
  - [ ] n/a for the web changes; the backend integration case above runs against a second tenant's service id as well and is refused
- E2E (Playwright, customer; scenarios on `/recurring-schedules/new` and the list, no new route):
  - [ ] Create a recurring schedule for a staff + room bundle (pick the staff member) and find it on the list
  - [ ] A conflict on only one requirement (the room is busy on one date) lists the colliding date and creates nothing
  - [ ] A `MANUAL_APPROVAL` bundle shows the pending state; after approval through the API helper the list shows it active
  - [ ] A tenant with both a default-shape and a bundle service sees both offered, and each is created through its own path
  - [ ] A mixed catalog (`CUSTOMER_CHOICE`, `AUTO_ANY` and `AUTO_FUNGIBLE_POOL` services beside a pickup-address, a recurrence-off and a legged one) offers exactly the eligible ones
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

## Story 3 — Default-location (degenerate) services can recur, and the eligibility filter mirrors the backend ✅ Done

**Agent:** backend-ts + frontend-ts
**Complexity:** L (discovery confirmed no migration and no contract change, but the story also carries the journey/prototype work, the editor hint and five E2E scenarios)
**Docs to load:** `docs/04-USE_CASES.md` UC-070 and UC-055 (the editor's recurrence toggle), `docs/27-BUSINESS_LOGIC_REFERENCE.md` (the service-shape table, § Two-layer creation-time conflict check, § Pinned selections), `docs/02-DOMAIN_MODEL.md` § RecurringBookingSchedule, `docs/13-DATABASE_SCHEMA.md` § recurring_booking_schedules and its assignments table, `docs/ENGINEERING_RULES_BACKEND.md` § Transactions and § Choosing a race-condition primitive, `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/ENGINEERING_RULES_SHARED.md` § Authoring new i18n UI copy keys
**Dependencies:** M23-S17 ✅ Done (its form, `recurring-schedule-form.ts` and E2E helpers are what this story extends) and M23-S22 ✅ Done (renewal). M23-S13, S19 and S40 are not done: they are consumers, not dependencies; S19 inherits the filter and body builder.
**Decisions locked at discovery (2026-10-11):** (1) the policy model: this story uses the existing `RESOLVE_PER_OCCURRENCE`, with no new policy value, no migration and no assignment row; Story 0 later generalizes the single "effective requirement" to a list and decides the mixed-bundle model. (2) The cap stays the existing per-service 50 for `RESOLVE_PER_OCCURRENCE`. (3) The ineligibility reason is **not** carried in `params`: the code stays one, its `errors.json` message is reworded to be true for every reason, and the per-service reasons live only in the service editor's hint, computed client-side from the service shape (`code` is the only thing message selection may branch on, `docs/ENGINEERING_RULES_SHARED.md` § Exception handling). (4) `durationPolicy = CUSTOMER_SELECTED` stays a web-only exclusion (the duration is read-only in the form), listed as an explicit row in the shape table that drives both specs, and in the editor hint. (5) The customer empty state has two variants (`13g`: no service has recurrence on / recurrence on but none qualifies), and never names a technical reason; the manager sees reasons in the editor. (6) The editor hint is advisory, built from the last-saved service, and never blocks saving. (7) Renewal of a schedule whose service no longer qualifies returns the blank form with the not-found notice (`buildRenewalDraft()` already returns null), or `13g` when nothing qualifies: defined, no new code.
**Pattern:** plain composition — extends `assertServiceEligible()` and the assignment building with one more service shape, resolving the tenant's `LOCATION` through the same path a one-off degenerate booking uses; no new named pattern.
**Prototype references:** `plan/journey/customer/prototypes/minha-conta/13-nova-recorrencia.html` and `dev-notes.md`, and the service editor `plan/journey/staff/prototypes/servicos/03-service-edit.html` (plus `03d-service-edit-policy-error.html` and `servicos/dev-notes.md`). The empty-state reasons and the editor hint are not drawn in any prototype: the editor draws only the checkbox "Permitir recorrência para clientes autenticados" and its "Duração máxima" field (`03-service-edit.html:819-820`), with no hint or disabled state. Drawn at discovery (2026-10-11, after a clean `/docs-audit` baseline): `customer/prototypes/minha-conta/13g-nova-recorrencia-sem-servicos.html` (the two empty-state variants) and `staff/prototypes/servicos/03f-service-edit-recurrence-hint.html` (the advisory hint), with `13`, both `dev-notes.md` and both `index.html` updated, plus `customer/minha-conta.md`, `staff/servicos.md` and both `use-cases.md` files. When this story ships, flip the `❓ Gap (TD49-S03)` status of `13g` and `03f` to ✅ in `minha-conta.md`, `servicos.md`, both `index.html` and both `dev-notes.md`.
**Consumers to check:** M23-S19 (staff creation) imports the same filter and body builder, M23-S22 (renewal) reopens the form with `initialDraft`, M23-S40 hosts the staff menu. Renewal of a schedule whose service has become ineligible: decision 7 above (Addendum item 7).

**Description:**
Make a degenerate service (`resourceRequirements: []`, or exactly one unrestricted `{ LOCATION, NONE }` requirement, no legs) eligible for a recurring schedule, with the tenant's single `LOCATION` resource as the resource the schedule's occurrences are checked and held against, exactly as a one-off booking of that service does. This is the platform's default service shape and the original car-wash vertical (see the Addendum). In the same story, bring the web service filter back in line with the backend rule and make the "no service" state explain itself. Staff-plus-room bundles stay Stories 0 to 2.

**Backend use case steps:** `RequestRecurringBookingScheduleUseCase` — same order as today; only eligibility and the requirement the later steps read change. Introduce one "effective requirement" for the service (its explicit single requirement, or the `{ LOCATION, NONE }` default when there are none, mirroring `availability-window-resolution.helpers.ts`) and use it at the three `resourceRequirements[0]` reads (`recurring-booking-schedule-request.helpers.ts:97` and `:142`, `materialize-recurring-schedule-occurrences.helpers.ts:142`); let `assertServiceEligible()` accept `NONE` for `RESOLVE_PER_OCCURRENCE` when the requirement is the unrestricted location. Approval and materialization (M23-S05) resolve the same location. The Addendum records what was read from code: no assignment rows (`buildResourceAssignments` returns none for `RESOLVE_PER_OCCURRENCE`), the existing per-service cap, and `resolveEligibleResources()` working for `LOCATION`; confirm by running it at discovery.
**Ineligibility message (decided at discovery, replaces the 2026-10-10 audit's `params.reason` proposal):** `BOOKING_RECURRING_SCHEDULE_INELIGIBLE_SERVICE` stays one code with no `params`. Both locales of `errors.json` currently say "not enabled for recurring reservations", which is wrong for four of the five reasons; reword them to "This service can't be booked as a recurring reservation." / "Este serviço não pode ser reservado de forma recorrente." (a locale file, shipped with the code). The reasons are shown only by the editor hint, which reads the same shape rule as the form filter: the web helper returns the list of unmet reasons (legs, several requirements, quantity above 1, pickup address, customer-chosen duration, `NONE` on a non-location), so the filter, the empty state and the hint read one function.
**Backend HTTP surface:** reuses `POST /recurring-booking-schedules`. Expected unchanged: `resourceIds` is already optional unless the policy is `FIXED_ASSIGNMENT`, so a `RESOLVE_PER_OCCURRENCE` request for a default-shape service needs no contract change. If discovery finds otherwise, change `packages/validation/src/booking.ts`, the BFF schema and `@ikaro/types` together.
**BFF endpoint spec:** thin proxy, expected unchanged.
**New migration / i18n keys / env vars / feature flags:** expected none for the data model (no assignment row is written for this case); i18n: the empty-state reasons and the editor hint in both locales; no env vars or flags.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/use-cases/recurring-booking-schedule-request.helpers.ts` (+ spec) (modify — `assertServiceEligible`, assignment building, conflict-check resource plan; add one `effectiveRequirement(service)` helper reusing the exported `DEGENERATE_LOCATION_REQUIREMENT` from `resource-occupancy-candidate-builders.helpers.ts`, optionally replacing the private duplicate in `availability-window-resolution.helpers.ts`)
- `apps/backend/src/contexts/booking/application/use-cases/materialize-recurring-schedule-occurrences.helpers.ts` (+ spec) (modify — the `resourceRequirements[0]` read at line 142)
- `apps/backend/src/contexts/booking/application/use-cases/request-recurring-booking-schedule.use-case.ts` (+ spec), the M23-S05 approval and materialization path, and the controller, schemas and `.http` blocks in both layers (modify as the contract requires)
- `apps/web/features/booking/model/recurring-schedule-form.ts` (+ spec) (modify — `isRecurrenceEligibleService` mirrors `assertServiceEligible` exactly: selection mode and `requiresPickupAddress` included, plus the degenerate shapes; the body builder sends no resource for them)
- `apps/web/features/customer/components/my-account/NewRecurringScheduleForm.tsx` and `NewRecurringSchedulePage.tsx` (+ specs) (modify — the empty state names why: recurrence not enabled, or the service needs a single resource, with the wording agreed at discovery)
- `apps/web/features/booking/components/dashboard/services/PolicyConfirmationAndWindowCards.tsx`, `ServiceBookingPolicyPanel.tsx`, `ServiceEditConfigTabPanels.tsx` (+ their specs) (modify — `PolicyWhoHowCard` renders the advisory hint under the toggle; the panel receives the saved `resourceRequirements`, `legs` and `requiresPickupAddress` from the tab panels, which today pass only `hasLegs`)
- `plan/journey/customer/prototypes/minha-conta/` (`13`, `13g`, `dev-notes.md`, `index.html`), `plan/journey/staff/prototypes/servicos/` (`03f`, `dev-notes.md`, `index.html`), `plan/journey/customer/minha-conta.md`, `plan/journey/staff/servicos.md`, both `use-cases.md` (drawn at discovery; status flips when the story ships)
- `packages/i18n/locales/{pt-BR,en}/errors.json` (modify — the reworded ineligibility message)
- `apps/web/e2e/my-account-recurring-schedule-create.spec.ts` and `apps/web/e2e/helpers/recurring-schedule.ts` (modify — a degenerate-service scenario, and the mobile "+ Novo ▾" scenario also run with bookings present, closing M23-S17's partial E2E criterion)
- `docs/04-USE_CASES.md` (UC-070: rewrite the Preconditions and A7 to say which services can recur; UC-055 for the editor hint), `docs/02-DOMAIN_MODEL.md` § RecurringBookingSchedule (the precondition points there), `docs/27-BUSINESS_LOGIC_REFERENCE.md`, `docs/14-API_CONTRACTS.md` (modify; the discovery-time wording of UC-070, UC-055, docs/27, docs/02 and docs/14 is already written — re-read before editing)
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
  - [ ] Negative guarantees, each pinned by its own test: legs, a pickup-address service and two or more requirements are still refused when the degenerate shapes are accepted; `NONE` on a non-`LOCATION` or pool-restricted requirement is still refused; `FIXED_ASSIGNMENT` for a degenerate service is refused
  - [ ] Parity: the verdict for the tenant `LOCATION` (hours, closures, occupancy) equals what the one-off degenerate availability returns for the same seeded data, with the tenant's `LOCATION`, whose working hours are always inherited (a `LOCATION` can never carry its own: `resource.aggregate.ts` locks `workingHours` to null), so no own-hours case exists to pin
  - [ ] `planOccurrenceResources` with mode `NONE` and a single resource assigns that resource to every occurrence (and its multi-`LOCATION` behavior is pinned as out of scope)
  - [ ] The empty state renders both variants in both locales; the editor hint renders each reason and is absent for a qualifying service; saving stays enabled with the hint shown
  - [ ] `buildRenewalDraft()` returns null for a schedule whose service no longer qualifies (decision 7)
- Integration:
  - [ ] `POST /recurring-booking-schedules` for a no-requirement service returns 201 and persists the schedule with its location assignment; an existing occupancy row on the location in a later occurrence returns 409 with nothing persisted; approval materializes the occurrences on the location
- Tenant isolation:
  - [ ] Another tenant's location occupancy never blocks the request
- E2E:
  - [ ] Playwright: a customer creates a recurring schedule for a degenerate service and finds it on the list (shared E2E tenant — it cannot be given a resource-free tenant, and the default-shape path never reads its other resources)
  - [ ] Playwright: the same on an older service seeded with the backfill's stored `NONE` location row
  - [ ] Playwright: when no service qualifies the form shows the empty-state variant that matches (no service enabled / enabled but none qualifies), and a service that has recurrence enabled but cannot recur is absent from the form
  - [ ] Playwright, service editor: a service that cannot recur shows the hint under the toggle, and saving still works
  - [ ] Playwright, mobile viewport: the in-page "+ Novo ▾" menu is present with bookings as well as without
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

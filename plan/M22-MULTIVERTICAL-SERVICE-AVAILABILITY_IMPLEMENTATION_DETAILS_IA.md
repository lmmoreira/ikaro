# M22 — Multi-Vertical Scheduling: Service Extensions & Availability Engine — Implementation Details (IA)

## Artifacts

### Backend — domain

| Artifact | Path |
|---|---|
| `ResourceRequirement` VO (`type`, `selectionMode`: `NONE`/`CUSTOMER_CHOICE`/`AUTO_ANY`/`AUTO_FUNGIBLE_POOL`, `resourcePoolIds`, `requiredQuantity`) | `apps/backend/src/contexts/booking/domain/resource-requirement.ts` |
| `ServiceLeg` VO (`legIndex`, `name`, `durationMinutes`, `resourceRequirements[]`, `transitionGapAfterMinutes`) | `apps/backend/src/contexts/booking/domain/service-leg.ts` |
| `ClassResourceSlot` VO (`type`, `eligibleResourceIds[]`) — inert until M24's `ClassScheduleTemplate` | `apps/backend/src/contexts/booking/domain/class-resource-slot.ts` |
| `resource-requirement-availability.ts` — free functions extracted from `service.aggregate.ts` (`assertClassResourceSlotsMatchBookingModel`, `assertResourceRequirementsAvailable`, `assertClassResourceSlotsAvailable`) | `apps/backend/src/contexts/booking/domain/resource-requirement-availability.ts` |
| `service-leg-span.ts` — `computeLegsTotalSpanMinutes(legs)`, pure/standalone so S03's availability engine can reuse it without depending on `Service` | `apps/backend/src/contexts/booking/domain/service-leg-span.ts` |
| `ServiceBookingIntakeSchema` — new **aggregate root**, versioned append-only (`publish()`, `reconstitute()`, no `update()`) | `apps/backend/src/contexts/booking/domain/service-booking-intake-schema.ts` |
| `Service.aggregate.ts` — extended: `bookingModel` (`APPOINTMENT`\|`SESSION`), `bufferAfterMinutes`, `setResourceRequirements()`/`setLegs()`/`setClassResourceSlots()` (mutually exclusive), `changeBookingModel()`, `setBookingPolicy()` | `apps/backend/src/contexts/booking/domain/service.aggregate.ts` |
| `ResourceOccupiedSlot`, `DayGridOccupancyBlock`, `resource-occupancy-lock-state.ts` (`REQUESTED`/`HOLD`/`COMMITTED`) | `apps/backend/src/contexts/booking/domain/{resource-occupied-slot,day-grid-occupancy-block,resource-occupancy-lock-state}.ts` |
| `BookingSlotUnavailableError` | `apps/backend/src/contexts/booking/domain/errors/booking-domain.error.ts` |

### Backend — infrastructure entities

`service-resource-requirement.entity.ts`, `service-leg.entity.ts`, `service-class-resource-pool.entity.ts`, `service-booking-intake-schema.entity.ts`, `booking-attendee.entity.ts`, `resource-occupancy.entity.ts` (implied by migration), `booking-line-resource-assignment.entity.ts` — all in `apps/backend/src/contexts/booking/infrastructure/entities/`, all registered in `integration-global-setup.ts`, all with matching builders in `apps/backend/src/test/builders/booking/`.

### Backend — application

| Artifact | Path |
|---|---|
| `update-service-resource-requirements.use-case.ts`, `update-service-legs.use-case.ts` (S01) | `application/use-cases/` |
| `update-service-booking-policy.use-case.ts`, `publish-service-intake-schema.use-case.ts`, `get-service-intake-schema.use-case.ts` (S02/S04) | `application/use-cases/` |
| `get-schedule-day-grid.use-case.ts` (S05) | `application/use-cases/get-schedule-day-grid.use-case.ts` |
| `IServiceIntakeSchemaRepository` port | `application/ports/service-intake-schema-repository.port.ts` |
| `IResourceOccupancyRepository` (booking-context-local write path) | `application/ports/resource-occupancy-repository.port.ts` |
| `IBookingAvailabilityPort` — extended: `findOccupancyByTenantAndResource` (HOLD/COMMITTED, availability) + `findDayGridOccupancy` (S05 — also REQUESTED, resolves `refId`); deliberately two methods, not one with a flag | `application/ports/booking-availability.port.ts` |
| `ITenantLockPort.lockResources()` — one advisory lock per resourceId, sorted ascending | `application/ports/tenant-lock.port.ts` |
| `BookingSlotConflictService` — rewritten resource-scoped (38 lines): takes pre-resolved `ResourceOccupancyWindow[]` candidates, locks + checks only; no longer knows services/dates | `application/services/booking-slot-conflict.service.ts` |
| `resource-occupancy.helpers.ts` (`resolveFlatLineCandidates`) | `application/use-cases/resource-occupancy.helpers.ts` |

### Backend — controllers

`service.controller.ts` — `PATCH :id/resource-requirements`, `PUT :id/legs` (S01); `PATCH :id/booking-policy`, `POST :id/intake-schema`, `GET :id/intake-schema` (S02/S04) — all `@UseGuards(StaffOrManagerRoleGuard)`, except `@Get()` list (unguarded, branches on `actorRole`).
`schedule-day-grid.controller.ts` (S05) — `@Controller('schedule/day-grid')`, `@UseGuards(ManagerRoleGuard)` class-level.

### BFF

`services.controller.ts`/`.public.controller.ts`/`.mapper.ts`/`.schemas.ts`/`.types.ts` — flat shape, mirrored endpoints with `@Roles('MANAGER','STAFF')`.
`schedule-day-grid.controller.ts` — `@Roles('MANAGER')` class-level, proxy via `BackendHttpService`.
Shared Zod schemas (`PublishServiceIntakeSchemaSchema`, `ScheduleDayGridQuerySchema`) in `packages/validation/src/booking.ts` — imported by both backend DTO and BFF schema, not hand-duplicated (TD42 precedent).

### Web — `Serviços` resource-config editor (S04)

| Artifact | Path |
|---|---|
| `ServiceEditPage.tsx` — orchestrator; tab bar + Detalhes/Recursos/Políticas/Formulário; lifted `dirty: Record<TabKey,boolean>` drives tab-dot + `useServiceEditLeaveGuard`; panels stay mounted-but-`hidden` on tab switch (draft state survives) | `apps/web/features/booking/components/dashboard/services/` |
| `ServiceEditTabBar.tsx`, `ServiceEditConfigTabPanels.tsx`, `ServiceEditDetailsTab.tsx` | same dir |
| Recursos: `ServiceResourceRequirementsPanel.tsx`, `ServiceLegsPanel.tsx`, `ServiceResourceTypeFields.tsx` (`deriveAutoSelectionMode()`: qty 1 → `AUTO_ANY`, qty >1 → `AUTO_FUNGIBLE_POOL`), `ServiceResourceModePicker.tsx`, `EligiblePoolPicker.tsx`, `ServiceBufferAfterMinutesField.tsx` | same dir |
| `resource-requirement-quantity.ts` — client-side "unsatisfiable requirement" guard (`hasStaleEligiblePool`, `countQuantityCandidates`, `isQuantityUnsatisfiable`), mirrors backend's `assertRequirementAvailable`, blocks save before a round-trip 422 | `apps/web/features/booking/schedule/resource-requirement-quantity.ts` |
| Políticas: `ServiceBookingPolicyPanel.tsx`, `PolicyDurationPricingCard.tsx`, `PolicyConfirmationAndWindowCards.tsx` | same dir |
| Formulário: `ServiceIntakeSchemaPanel.tsx`, `IntakeQuestionsCard.tsx`, `IntakeQuestionCard.tsx`, `IntakeParticipantsAndConsentCards.tsx`, `IntakeVersionHistoryCard.tsx`, `IntakeVersionModal.tsx` (read-only version preview) | same dir |
| `ServiceCreatePage.tsx` — booking-model picker (Agendamento/Turma), redirects to edit page on 201 | same dir |
| `ServiceListPage.tsx`/`ServiceCard.tsx` — "Turma" badge for `bookingModel === 'SESSION'` | same dir |

### Web — `Horários` bounded multi-resource columns board (S06)

| Artifact | Path |
|---|---|
| `getScheduleDayGrid(date)` | `apps/web/features/booking/api/schedule.ts` |
| `useScheduleDayGrid(date, resourceIds)` | `apps/web/features/booking/schedule/useSchedule.ts` |
| `schedule-resource-columns.ts` — `buildResourceColumns()`; resolves against full unfiltered `bookingsItems` + `selectedStatusSet`, distinguishing "filtered out by status" (excluded) from "no match anywhere" ("Ocupado" placeholder) | `apps/web/features/booking/schedule/schedule-resource-columns.ts` |
| `ScheduleResourceColumnsBoard.tsx` — thin wrapper, one unmodified `ScheduleTimelineBoard` per checked resource; error state reuses `data-testid="day-grid-fetch-error"` red banner (matches `schedule-fetch-error` pattern) | `apps/web/features/booking/components/dashboard/schedule/ScheduleResourceColumnsBoard.tsx` |
| `ScheduleMainView.tsx` — extracted 3-way Week/Columns/Single branch (SonarCloud S3358, nested ternary) | `apps/web/features/booking/components/dashboard/schedule/ScheduleMainView.tsx` |
| `SchedulePage.tsx` — computes `showResourceColumns`, delegates to `ScheduleMainView` | same dir |
| `schedule-page-core-data.ts`/`schedule-page-controller-result.ts` — extended to surface `bookingsItems` (raw, unfiltered), `visibleClosures`, `visibleOpenings` | `apps/web/features/booking/schedule/` |

### Shared types / validation

| Artifact | Path |
|---|---|
| `DayGridBlock`/`DayGridColumn`/`DayGridResponse` | `packages/types/src/schedule.dto.ts` |
| `SERVICE_INTAKE_HISTORY_LIMIT` (= 5) | `packages/types/src/*` (shared constant, not per-layer-duplicated) |
| Error codes — 15 `BOOKING_SERVICE_*` (see Error Mapping) + `BOOKING_SLOT_UNAVAILABLE` | `packages/types/src/error-codes.ts` |
| `dayGridFetchError`, `dayGridEmptyColumn`, `dayGridPlaceholderBooking` i18n keys | `packages/i18n/locales/{pt-BR,en}/web.json` |

### Test infrastructure

| Double / spec | Path |
|---|---|
| `ResourceOccupancyEntityBuilder`, `BookingLineResourceAssignmentEntityBuilder`, `ServiceBookingIntakeSchemaEntityBuilder`, plus new entity builders for legs/requirements/pool | `apps/backend/src/test/builders/booking/` |
| `backfill-service-resource-requirements-and-buffer.integration.spec.ts` | `apps/backend/src/contexts/booking/infrastructure/` |
| `apps/web/e2e/services-resource-config.spec.ts` — Recursos/Políticas/Formulário flows, unsaved-changes guard | `apps/web/e2e/` |
| `apps/web/e2e/services-create.spec.ts` — booking-model picker + redirect | `apps/web/e2e/` |
| `apps/web/e2e/schedule-resource-columns.spec.ts` — 4 scenarios (isolated columns via closures, real booking via `AUTO_FUNGIBLE_POOL` fixture, uncheck reverts + Week view unaffected, STAFF never sees filter/board) | `apps/web/e2e/` |

---

## DB Schema (`booking` schema)

Migrations, in order:

```
1748500000010-AddServiceResourceRequirementsAndLegs   (S01)
1748500000011-AddServiceBookingPolicyAndIntakeSchema   (S02)
1748500000012-CreateResourceOccupancy                  (S03, expand)
1748500000013-BackfillResourceOccupancy                (S03, backfill)
1748500000014-DropTenantWideExclusion                  (S03, contract)
1748500000015-AddEndsAtIndexToResourceOccupancy         (TD40-S2, cross-tenant retention job)
```
S04/S05/S06 shipped **no new migrations** — pure consumers of S01–S03's schema.

### `booking.services` — modified (S01/S02)
```sql
booking_model              VARCHAR(20) DEFAULT 'APPOINTMENT'  -- CHECK APPOINTMENT/SESSION
buffer_after_minutes       INTEGER
-- ~15 booking-policy columns (S02): default_approval_mode, manual_hold_minutes,
-- 4 window overrides, recurrence_eligible, availability_alert_eligible,
-- duration_policy/min/max/increment, pricing_policy/increment/
-- price_per_increment_amount/minimum_charge_amount
INDEX (tenant_id, booking_model)
```
Backfill: every existing service got one `{LOCATION, NONE, qty 1}` requirement row; `buffer_after_minutes` backfilled from `tenant.settings.booking.serviceBufferMinutes` (fallback 60).

### New tables (S01)
`service_resource_requirements` (+ `_pool` junction), `service_legs` (+ `service_leg_resource_requirements` + `_pool`), `service_class_resource_pool`. Tenant-scoped composite PK/FK; `UNIQUE(tenant_id, service_id, resource_type)` at flat and leg level.

### New tables (S02)
`service_booking_intake_schema` — `UQ(tenant_id, service_id, version)` + partial unique index (at most one active version per service). `booking_attendees`. `bookings` gains `intake_schema_version`/`intake_answers`/`participant_count`/`consent_accepted_at`/`consent_version` (unused until M23). `booking.booking_lines` gains `+ UNIQUE(tenant_id, line_id)` (required for S03's composite FKs). First use of `ADD CONSTRAINT ... NOT VALID` + separate `VALIDATE CONSTRAINT` in this codebase (`CHK_booking_bookings_intake_schema_pair`, since `bookings` already carries production rows).

### `booking.booking_line_resource_assignments` (new, S03)
Immutable audit: one row per (line, resource, leg, quantity). Composite FK to `booking_lines(tenant_id, line_id)` and to `resources(tenant_id, id, type)`. Null-safe uniqueness via `COALESCE`d unique index (plain `UNIQUE` silently fails to dedupe the flat/non-legged case — `NULL ≠ NULL`).

### `booking.resource_occupancy` (new, S03) — the exclusivity engine
```sql
lock_state    VARCHAR(20) NOT NULL  -- REQUESTED / HOLD / COMMITTED
source_type   VARCHAR(20) NOT NULL  -- BOOKING_LINE / CLASS_SESSION, mutually exclusive CHECK
starts_at, ends_at   TIMESTAMPTZ    -- window CHECK
EXCLUDE USING gist (tenant_id WITH =, resource_id WITH =,
                     tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (lock_state IN ('HOLD','COMMITTED'))
```
`REQUESTED` rows sit **outside** the exclusion WHERE clause — they exist for S05's day-grid, not exclusivity (day-grid's own query includes REQUESTED alongside HOLD/COMMITTED; `findOccupancyByTenantAndResource` excludes it).

**Migration ordering (5-phase, compressed to 3 files), executed by PR #483 (merged 2026-09-17):** Expand (`012`, GIST constraint live immediately, no pre-existing data violates it) → Backfill (`013`, idempotent `NOT EXISTS`-guarded; multi-line bookings get sequential non-overlapping sub-windows reconstructed via `ORDER BY line_id` window functions, buffer only after the last line) → Contract (`014`, drops legacy `EX_booking_bookings_approved_slot`; fails closed via a `DO $$` block that raises if any APPROVED line still lacks a COMMITTED `resource_occupancy` row, rather than trusting a "no tenants yet" assumption).

### `EX_booking_bookings_approved_slot` — retired (S03)
The pre-M22 tenant-wide GIST exclusion on `bookings` itself. Dropped by `1748500000014`. Superseded because a booking can now lock a *bundle* of resources or a different resource per *leg* — no longer one row per booking to key an exclusion constraint on. See `docs/ENGINEERING_RULES_BACKEND.md` § race-condition primitives for the general "one shared table, not one per family" rule this established.

---

## Structural Decisions

### S01 — Concurrency (PR #479, 4 rounds)
- Round 2 Critical: `bookingModel`/booking-history TOCTOU race → new `IServiceRepository.findByIdForUpdate()` row lock, adopted by every Service-mutating use case.
- Round 3 Important: lock acquired but result discarded (stale snapshot still compared) → compare locked-state `bookingModel` against pre-transaction snapshot, new `BookingServiceConcurrentModificationError` (409); multi-service lock-ordering deadlock fixed by sorting service IDs before acquiring.
- Round 4 Critical: activate/deactivate read-then-save happened **outside** the transaction, could silently clobber a concurrent resource-requirements/legs update (since `save()` wholesale-replaces child rows) → `findByIdForUpdate()`.
- Duplicate `ClassResourceSlot.type` now rejected in `Service.create()` (was silently merged on GET). `ServiceLeg.create()` now validates its own VO fields directly (was relying on Zod only).

### S02 — `autoApproveEnabled` inheritance reversal (PR #481, 4 rounds)
Round 1 Critical, **declined then reversed at round 3**: `defaultApprovalMode` wasn't consuming `settings.booking.autoApproveEnabled`. Initial decline argued this belongs to M23's booking flow; round 3 re-checked the story's own resolved discovery decision and found the plan file said the opposite verbatim ("`autoApproveEnabled` is activated as a real, consumed setting by this story") — added `IBookingPlatformPort.getAutoApproveEnabled(tenantId)`, resolved live (not persisted) on every read path. Documented as a process lesson: a repeat finding at *constant* severity across rounds deserves the same re-verification as escalating severity — grep the literal plan text, don't paraphrase memory of it.
Round 1 Important: `findActiveByServiceId`/`findAllByServiceId` now honor the active `ITransactionManager`. `Service.setBookingPolicy()` validates the fully-resolved policy. Round 3: stale `minimumChargeAmount` cleared on revert to `FIXED` pricing.

### S03 — Resource-scoped exclusivity engine (PR #483, merged 2026-09-17)
`BookingSlotConflictService` rewritten resource-scoped: callers resolve concrete resources first (`resource-occupancy.helpers.ts`), the service only locks (`lockResources()`, canonical sorted order) + checks. The GIST exclusion constraint remains the authoritative backstop regardless — the advisory lock only narrows the race window. Full write-path lifecycle (create, approve, reschedule, reject, both cancel use cases) all route through the same assign/release contract — locked in as an expanded scope at story-discovery, not just create/approve.
Followed by **TD40**: Story 1 (write batching, PR #487), Story 2 (retention purge job + standalone `ends_at` index + IAM grant, PR #488/#489).

### S04 — Tabbed editor, two gotchas found only via live review
`LOCATION`-equivalent immutability doesn't apply here (that's an S01-owned `Resource` concern) — S04's own gotcha: the 200-line function / 250-line file caps forced 4 mid-change component extractions, each costing a re-lint/re-test cycle (`docs/CODE_STANDARDS.md` now calls this out explicitly as a plan-ahead trigger). `PICKUP_ADDRESS`/`NAMED_ATTENDEES` typed intake-question markers were removed during story-discovery (2026-09-19) as redundant with existing Details-tab/Participantes toggles — generic `FREE_TEXT`/`BOOLEAN` only.

### S05 — Day-grid as a `resourceId → booking-id` lookup, not a rendering source
`IBookingAvailabilityPort.findDayGridOccupancy` kept deliberately separate from `findOccupancyByTenantAndResource` (different semantics: REQUESTED-inclusion, `refId` resolution) rather than one method with a flag. Near-verbatim match to the plan's prescribed method signature/JOIN path/lock-state filter — quiet review history relative to S01–S03.

### S06 — Bounded columns board, not an unbounded grid (see dedicated section below)
Full redesign history, review-round fixes, and the two follow-up TDs: § "M22-S06 in detail" below.

---

## Error Mapping

| Group | HTTP | Codes |
|---|---|---|
| CONFLICT (409) | `BOOKING_SERVICE_HAS_LEGS`, `BOOKING_SERVICE_BOOKING_MODEL_IMMUTABLE`, `BOOKING_SERVICE_BOOKING_MODEL_MISMATCH`, `BOOKING_SERVICE_CONCURRENT_MODIFICATION`, `BOOKING_SERVICE_SESSION_NOT_BOOKABLE`, `BOOKING_SERVICE_BOOKING_CONFIG_MODEL_MISMATCH`, `BOOKING_SLOT_UNAVAILABLE` |
| UNPROCESSABLE_ENTITY (422) | `BOOKING_SERVICE_LEGS_TOO_FEW`, `BOOKING_SERVICE_RESOURCE_TYPE_UNAVAILABLE`, `BOOKING_SERVICE_RESOURCE_REQUIREMENT_INVALID`, `BOOKING_SERVICE_LEG_INVALID`, `BOOKING_SERVICE_CLASS_RESOURCE_SLOT_DUPLICATE_TYPE`, `..._EMPTY_POOL`, `..._RESOURCE_NOT_ACTIVE`, `..._BOOKING_MODEL_MISMATCH`, `BOOKING_SERVICE_DURATION_POLICY_REQUIRES_PRICING`, `BOOKING_SERVICE_BOOKING_POLICY_INVALID` |

`BOOKING_SERVICE_CONCURRENT_MODIFICATION`, `BOOKING_SERVICE_BOOKING_POLICY_INVALID`, and `BOOKING_SLOT_UNAVAILABLE` were **not named in the original plan** — added during PR review (S01/S02) and as S03's `BookingSlotConflictService`/persistence-error translation respectively. `BOOKING_SLOT_UNAVAILABLE` is raised both from `BookingSlotConflictService.assertSlotFree()` (pre-check) and `typeorm-resource-occupancy.persistence-errors.ts` (translates a genuine GIST exclusion-constraint DB violation on the real race case).

S04's intake-schema validation (duplicate `fieldKey`, question-count bounds, text-length caps) is Zod-level only (`PublishServiceIntakeSchemaSchema`), surfaced as a plain 422 via `ZodValidationPipe` — no dedicated domain error class. S05 is a pure read endpoint — only guard-level 403 and Zod 400 apply.

---

## Auth Model

| Surface | Guard |
|---|---|
| `service.controller.ts` — resource-requirements/legs/booking-policy/intake-schema (POST/GET), update, activate | `StaffOrManagerRoleGuard` |
| `service.controller.ts` — `@Get()` list | Unguarded — branches internally on `actorRole` (`ANY` vs `ACTIVE`), allows guest/customer reads of active services |
| `schedule-day-grid.controller.ts` (backend + BFF) | `ManagerRoleGuard`/`@Roles('MANAGER')`, class-level — matches UC-057 |
| `ResourceFilterMenu` / columns board (frontend, S06) | Rendered only for `role === 'MANAGER'` (hidden, not disabled); STAFF path fully unaffected |

No new actor/role concepts introduced this milestone — every port method still takes `tenantId` explicitly, except the deliberately cross-tenant TD40 retention-purge job.

---

## Pub/Sub Topics

No new domain events published by any M22 story. `booking.resource_occupancy` is written synchronously inside the same transaction as the `Booking`/`BookingLine` write — no eventual-consistency step, no new consumer.

---

## Test Infrastructure

See Artifacts table above. All new S01–S03 entities have matching `*-entity.builder.ts` in `apps/backend/src/test/builders/booking/`; all migrations and entities registered in `integration-global-setup.ts` (verified, not assumed). S04/S05/S06 add no new entities — their tests reuse S01–S03's builders. `packages/validation/src/booking.ts` is the now-established shared-Zod-schema location for a request shape identical across backend DTO and BFF schema (TD42 precedent, reinforced by S04's `PublishServiceIntakeSchemaSchema` and S05's `ScheduleDayGridQuerySchema`) — check there before hand-writing a duplicate.

---

## M22-S06 in detail — Manager "Horários" bounded multi-resource column view

**PR #511**, 5 review rounds, merged 2026-09-24.

### Design history
Original prototype (`08-visao-geral-manager.html`, 2026-07-29, CAND-13c) mocked an unbounded grid rendering **every** active resource as its own column — dropped as unscalable (a 60-resource tenant can't fit that many columns). Redesigned during pre-implementation discussion (2026-09-24) to a **bounded** columns board: one column per resource the manager has *checked* in the already-shipped `ResourceFilterMenu` (M21-S05), reusing the already-shipped `GET /schedule/day-grid` (M22-S05) purely as a `resourceId → booking-id` lookup — not a second rendering engine. Applies to **Day view only**; Week view is untouched (its own per-day mini cards already reflect the resource filter via the same closures/openings data).

### Review-round fixes (all real, all resolved)
- Round 1 Critical: day-grid error state used the wrong visual pattern (dashed-gray `ColumnsFeedback` instead of the established red inline banner) → added `data-testid="day-grid-fetch-error"` banner matching `schedule-fetch-error`.
- Round 1 Important: placeholder fallback defeated the status filter — day-grid includes `REQUESTED` occupancy for PENDING bookings regardless of the FE status filter, so a PENDING booking hidden by the default filter was incorrectly rendered as a fake "Ocupado" placeholder → resolve against the full unfiltered `bookingsItems` list + `selectedStatusSet`, distinguishing "filtered out" (excluded) from "no match anywhere" (placeholder).
- Round 1: E2E strict-mode violation — `BookingActionSheetShell` renders 2 "Cancelar" buttons (header+footer) → `.last()` targets the footer button.
- Round 2 Critical: stale docs still described UC-057 as unbuilt → full stale-reference sweep across 4 files.
- Round 2: SonarCloud S3358 (3-way nested ternary in `SchedulePage.tsx`) → extracted standalone `ScheduleMainView.tsx` (a local closure function pushed the caller over the 40-line cap).
- Round 3 Critical: E2E suite only used closures, never a real booking → added an isolated fixture (new resource + service via `AUTO_FUNGIBLE_POOL`+`resourcePoolIds`, deterministic unlike `AUTO_ANY`) asserting click-through navigation.
- Round 4: a factually incorrect bot claim about E2E selector conventions was declined with evidence (grepped the testing-strategy doc's actual rule + the identical selector already in `schedule.spec.ts`).

### Follow-ups tracked, not silently dropped
- **TD43** (`td/TD43-COLUMNS-BOARD-DAY-GRID-INTERVAL-FIDELITY.md`): the columns board discards day-grid's own `startsAt`/`endsAt` (which include buffer/turnover) in favor of the matched booking's own `scheduledAt`/`totalDurationMins` — a booking whose buffer pushes past midnight can silently disappear from a column. Edge case (large buffer + cross-midnight), not mainline.
- **TD44** (`td/TD44-RESOURCE-COLUMNS-BOARD-SELECTION-CAP.md`): Story 0 — no cap on simultaneously-checked resource columns. Story 1 — Week view's booking badges don't respect the resource filter the way Day view's columns do; resolved design (post user discussion) is real per-day filtering (a booking shows only if ≥1 assigned resource is checked, reusing the same day-grid-as-lookup technique across the 7 visible days) plus plural `resourceNames` badges (a booking bundled to 2 checked resources renders once, both names).

i18n: `dayGridFetchError`, `dayGridEmptyColumn`, `dayGridPlaceholderBooking` (both locales). `dayGridColumnsSummary` was planned but dropped — never implemented, not referenced anywhere live.

# TD42 — Semantic Calendar-Date Validation (`DATE_ONLY_PATTERN` accepts impossible dates)

## Status
- **Type**: Technical Debt / Correctness
- **Priority**: Low — no observed production incident; a malformed-but-shape-valid date silently produces an empty/wrong result rather than crashing, so the blast radius is a confusing empty response, not a 5xx
- **Context**: `packages/validation` (fix lands here) — consumed by `apps/backend/src/contexts/booking/application/dtos/**` and `apps/bff/src/features/booking/*.schemas.ts`
- **Created**: 2026-09-23
- **Discovered**: CodeRabbit review on PR #506 (M22-S05, `GET /schedule/day-grid`) flagged the new `date` param's validation as shape-only; verified during triage that the same gap is systemic, not specific to that one field
- **State**: Implemented on `feat/td42-s1-calendar-date-vo` (PR #510) — `/story-discovery` READY 2026-09-23 (approach revised twice — final scope: full `CalendarDate` VO chain, see Chosen approach); this doc reflects what was actually built, not the pre-implementation plan
- **Related**: none

---

## Problem

`packages/validation/src/date.ts` exports `DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/` — a pure shape check. It has no semantic counterpart (unlike `isValidTimeOfDay()` in the same file, which does validate real HH:MM ranges). Every backend DTO and BFF schema that accepts a calendar date reuses this same regex directly via `z.string().regex(DATE_ONLY_PATTERN, ...)`, so a value like `2026-02-30` or `2026-13-01` passes validation everywhere in the codebase — confirmed via grep, this exact pattern is repeated in 11 files, ~19 field occurrences:

- `apps/backend/src/contexts/booking/application/dtos/open-schedule.dto.ts` (`date`, `from`, `to`)
- `apps/backend/src/contexts/booking/application/dtos/get-schedule-day-grid.dto.ts` (`date`)
- `apps/backend/src/contexts/booking/application/dtos/get-availability.dto.ts` (`date`)
- `apps/backend/src/contexts/booking/application/dtos/close-schedule.dto.ts` (`date`, `from`, `to`)
- `apps/backend/src/contexts/booking/application/dtos/get-availability-summary.dto.ts` (`from`, `to`)
- `apps/bff/src/features/booking/schedule.schemas.ts` (`date`, `from`, `to`)
- `apps/bff/src/features/booking/schedule-opening.schemas.ts` (`date`, `from`, `to`)
- `apps/bff/src/features/booking/schedule-availability.schemas.ts` (`date`)
- `apps/bff/src/features/booking/schedule-availability-summary.schemas.ts` (`from`, `to`)
- `apps/bff/src/features/booking/bookings.schemas.ts` (`date`, `from`, `to`)
- `apps/bff/src/features/booking/schedule-day-grid.schemas.ts` (`date`)

Downstream, a shape-valid-but-calendar-impossible date reaches `localDateRangeBoundsUTC()` (`apps/backend/src/shared/utils/calendar-date.ts`), which parses it with Luxon's `DateTime.fromISO()`. Luxon marks an impossible date invalid and the resulting `Date` object is `Invalid Date` (`NaN` time) — the downstream TypeORM query's `WHERE starts_at < :isoEnd AND ends_at > :isoStart` comparisons against a `NaN`-backed timestamp evaluate to false for every row, so the request silently returns an empty/zero result instead of a `400`. No endpoint currently returns a clear validation error for this input class.

## Why this matters

- A caller (BFF, a future direct API consumer, or a malformed date built from bad frontend arithmetic) gets a confusing "no data" response instead of an actionable `400`, making the real bug (bad date construction upstream) harder to spot.
- The gap is systemic — fixing it only on the newest endpoint (`GET /schedule/day-grid`, M22-S05) would leave 10 other already-shipped fields with the same hole, which is why this was scoped out of that PR into its own TD rather than patched piecemeal.

## Chosen approach (final — decided during `/story-discovery`, 2026-09-23)

Two findings during discovery widened the original PR #506 triage proposal (a bespoke `isValidCalendarDate()` + `z.string().refine(...)` schema used only at the request boundary):

1. **The semantic check is a library primitive.** Zod 4's built-in `z.iso.date()` already performs full calendar validation — verified against the installed Zod 4.6.2: rejects `2026-02-30`, `2026-13-01`, `2026-04-31`, day `00`, `2026-02-29`, `1900-02-29`; accepts `2028-02-29`, `2000-02-29`. The repo already uses it (`packages/validation/src/lead-form-submission.ts`). Hand-rolling the UTC round-trip would duplicate it (CLAUDE.md §7 "Never improvise").
2. **The gap is also in the domain, not just at the boundary.** `ScheduleClosure` and `ScheduleOpening` type `startTime`/`endTime` as `TimeOfDay` VOs but `date` as a raw `string` — a violation of `docs/ENGINEERING_RULES_SHARED.md` § Option A (aggregate props typed as VOs, mandatory). Nothing in either aggregate validates that `date` is a real calendar date; `assertValid()` only does a lexicographic `date < todayUTC()` comparison.

Decided: mirror the existing **`TimeOfDay` chain** end to end — shared predicate → backend VO with a typed error code → aggregates typed with the VO → DTO/BFF refinements reusing the VO's code (`docs/ENGINEERING_RULES_SHARED.md` § Single source of truth for a validation rule's code: a VO-backed rule's code is the VO's code, never a `GenericErrorCode`).

| Layer | Change |
|---|---|
| `@ikaro/types` | New `CalendarDateErrorCode = { FORMAT_INVALID: 'CALENDAR_DATE_FORMAT_INVALID' }`, added to the catalogued `ErrorCode` union (same shape/placement as `TimeOfDayErrorCode`) |
| `@ikaro/i18n` | `CALENDAR_DATE_FORMAT_INVALID` in both `pt-BR/errors.json` and `en/errors.json` |
| `@ikaro/validation` | `isValidCalendarDate(value)` in `date.ts`, implemented as `z.iso.date().safeParse(value).success` (Zod owns the logic); **delete `DATE_ONLY_PATTERN`** (no consumer remains). No `calendarDateField()` wrapper — every call site uses plain `z.iso.date()` directly; see the `@ikaro/types` row for how it still gets the right error code with zero per-site `.refine()` |
| `@ikaro/types` | `deriveViolation()` (`zod-violation.ts`) gets a `formatViolationCode()` helper: a Zod `invalid_format` issue with `format: 'date'` maps to `CalendarDateErrorCode.FORMAT_INVALID` — the same special-case pattern the function already has for `format: 'email'` → `EmailErrorCode`. This is what lets every backend DTO / BFF schema use bare `z.iso.date()` and still get the VO's own code, with no `.refine()` boilerplate at any of the 19 call sites |
| Backend VO | `apps/backend/src/shared/value-objects/calendar-date.vo.ts`: `CalendarDate` with `isValid()` (delegates to `isValidCalendarDate`), `create()` throwing `CalendarDateValidationError implements DomainErrorShape` with `CalendarDateErrorCode.FORMAT_INVALID`, `reconstitute()`, `today()` (UTC), `.value` getter, `isBefore(other)` comparison (replaces the aggregates' raw string compare) |
| Aggregates | `ScheduleClosure`/`ScheduleOpening` props + getters typed `date: CalendarDate`; `create()` builds it via `CalendarDate.create()`; `reconstitute()` path via `CalendarDate.reconstitute()`; past-date guard uses `CalendarDate.isBefore()` |
| Persistence | `TypeOrmScheduleClosureRepository`/`TypeOrmScheduleOpeningRepository` mappers convert `entity.date` ⇄ `CalendarDate` (column unchanged — **no migration**) |
| Consumers | Every aggregate `.date` read → `.date.value` (~20 call sites: `availability-summary.helpers.ts`, `close-schedule`/`open-schedule`/`list-closures`/`list-openings`/`remove-schedule-opening` use cases, the two TypeORM repos, the two in-memory repos) |
| Error mapping | The **shared** `mapSharedVoError()` (`apps/backend/src/shared/http/vo-validation-error.mapper.ts` — the common branch every context mapper already calls for the other 9 plain VOs) gets an `instanceof CalendarDateValidationError` arm → `400` with its code, rather than a context-specific branch in `booking-error.mapper.ts` (CLAUDE.md §8, `vo-bare-error`) |
| Backend DTOs | All `date`/`from`/`to` fields across the 5 DTO files use bare `z.iso.date({ error: '<field> must be a valid YYYY-MM-DD calendar date' })` — no `.refine()`, no `CalendarDate` import; `deriveViolation` supplies the code |
| BFF schemas | All 6 schema files use bare `z.iso.date()` the same way (`.optional()` for the 3 optional fields in `bookings.schemas.ts`). Two of these — the day-grid `{date}` query and the closures-range `{from,to,resourceId}` query — turned out to be field-for-field identical between the backend DTO and the BFF schema (bad-smell BFF-5, caught in `/pre-pr`'s audit step); both now import `ScheduleDayGridQuerySchema`/`ScheduleClosuresRangeQuerySchema` from a new `packages/validation/src/booking.ts` (+ `booking.spec.ts`) instead of hand-writing two copies |
| Web | `apps/web/features/booking/schedule/date-utils.ts` `isValidDateKey()` body → `z.iso.date().safeParse(dateKey).success` (web already depends on `zod`; `@ikaro/validation` deliberately **not** added as a web dependency — no `package.json` change for one boolean) |
| Architecture policy | `packages/architecture-check/architecture-policy.json`'s `aggregateValueObjectRegistry` gets a `CalendarDate` entry (`exactNames: ["date"]`) — so the `aggregate-primitive-vo` detector now blocks a future aggregate from reintroducing a plain-string `date` prop the same way it already blocks `TimeOfDay`/`Timezone`/etc. Verified by temporarily reverting `ScheduleClosure.date` to `string` and confirming the detector flags it, then restoring |
| Docs | `docs/VALUE_OBJECTS_REFERENCE.md` — add `CalendarDate` row to the VO table and to the `.value` getter list (`docs/02-DOMAIN_MODEL.md` needs no change — it lists conceptual types, e.g. `startTime: String` even though the aggregate already uses `TimeOfDay`) |

Out of scope: `availability.service.ts` / `resource-scoped-availability.helpers.ts` / `availability-window-resolution.helpers.ts` keep taking `date: string` — these are request-context strings already validated at the DTO boundary, not aggregate props; typing them as `CalendarDate` would be a separate refactor with no correctness gain. `localDateRangeBoundsUTC()` needs no change.

---

### Story 1 — `CalendarDate` VO chain: shared predicate, VO, aggregates, DTOs, BFF, web

**Agent:** backend-ts
**Complexity:** M
**Docs to load:** `docs/CODE_STANDARDS.md`, `docs/ENGINEERING_RULES_SHARED.md` (§ Option A, § VO validation errors must be mapped with a typed `code`, § Single source of truth for a validation rule's code), `docs/ENGINEERING_RULES_BACKEND.md`, `docs/VALUE_OBJECTS_REFERENCE.md`, `docs/ENGINEERING_RULES_SHARED.md` § Adding a new error — checklist
**Dependencies:** none
**Pattern:** Value Object (Option A), mirroring `TimeOfDay` exactly — `@ikaro/validation` predicate → `shared/value-objects` VO with `DomainErrorShape` error → aggregate props typed as the VO → Zod refinements reusing the VO's code. Semantic check delegated to Zod's `z.iso.date()`.

**Description:** Implement every row of the Chosen-approach table above in one PR.

**Files created:**
- `apps/backend/src/shared/value-objects/calendar-date.vo.ts`
- `apps/backend/src/shared/value-objects/calendar-date.vo.spec.ts`
- `packages/validation/src/booking.spec.ts` (new — the pre-existing `booking.ts` had none)

**Files modified:**
- `packages/types/src/error-codes.ts`, `packages/types/src/zod-violation.ts` (+ its spec)
- `packages/i18n/locales/pt-BR/errors.json`, `packages/i18n/locales/en/errors.json`
- `packages/validation/src/date.ts`, `packages/validation/src/date.spec.ts`
- `packages/validation/src/booking.ts` (adds `ScheduleDayGridQuerySchema`, `ScheduleClosuresRangeQuerySchema` — the BFF-5 dedup)
- `apps/backend/src/contexts/booking/domain/schedule-closure.aggregate.ts`, `schedule-opening.aggregate.ts` (+ their specs)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-schedule-closure.repository.ts`, `typeorm-schedule-opening.repository.ts` (+ their specs)
- `apps/backend/src/shared/http/vo-validation-error.mapper.ts` (+ its spec) — not `booking-error.mapper.ts`
- `apps/backend/src/contexts/booking/application/use-cases/{availability-summary.helpers,close-schedule.use-case,list-closures.use-case,list-openings.use-case,open-schedule.use-case,remove-schedule-opening.use-case}.ts` (+ `close-schedule.use-case.spec.ts`)
- `apps/backend/src/test/repositories/booking/in-memory-schedule-closure.repository.ts`, `in-memory-schedule-opening.repository.ts`
- `apps/backend/src/contexts/booking/application/dtos/{open-schedule,get-schedule-day-grid,get-availability,close-schedule,get-availability-summary}.dto.ts`
- `apps/backend/src/contexts/booking/infrastructure/controllers/schedule-day-grid.controller.integration.spec.ts`
- `apps/bff/src/features/booking/{schedule,schedule-opening,schedule-availability,schedule-availability-summary,bookings,schedule-day-grid}.schemas.ts` (+ `schedule-day-grid.controller.component.spec.ts`)
- `apps/web/features/booking/schedule/date-utils.ts`
- `apps/web/shared/lib/i18n/error-codes-exhaustiveness.spec.ts` (register the `CalendarDateErrorCode` catalog)
- `docs/VALUE_OBJECTS_REFERENCE.md`
- `packages/architecture-check/architecture-policy.json` (`aggregateValueObjectRegistry` — `CalendarDate` entry)

Not touched, and not needed: `schedule-closure.builder.ts`/`schedule-opening.builder.ts` — their `withDate(string)` fluent setters already build the aggregate through `.close()`/`.open()`, which internally calls `CalendarDate.create()`; no builder change was required.

**New migration / env vars / feature flags:** none. **New error code + i18n:** yes — `CALENDAR_DATE_FORMAT_INVALID` in both locales, same commit (CI exhaustiveness test, both backend catalog and `apps/web`'s own).

**Acceptance criteria — product:**
- [ ] Any endpoint accepting a `date`/`from`/`to` query or body field returns `400` with code `CALENDAR_DATE_FORMAT_INVALID` for a calendar-impossible date (e.g. `2026-02-30`) instead of silently returning an empty result.
- [ ] A valid calendar date works identically to today on every affected endpoint.

**Acceptance criteria — technical:**
- Unit:
  - [x] `isValidCalendarDate()`: accepts `2026-08-03`, `2026-12-31`, `2028-02-29`, `2000-02-29`; rejects `2026-02-30`, `2026-02-29`, `1900-02-29`, `2026-04-31`, `2026-13-01`, `2026-00-10`, `2026-01-00`, `2026-8-3`, `2026/08/03`, `2026-08-03T00:00:00.000Z`, `'not-a-date'`, `''`
  - [x] `deriveViolation()`: a Zod `invalid_format`/`date` issue maps to `CalendarDateErrorCode.FORMAT_INVALID` (mirrors the existing `format: 'email'` test)
  - [x] `CalendarDate`: `create()` valid → `.value`; invalid → `CalendarDateValidationError` with code `FORMAT_INVALID`; `reconstitute()` skips validation; `today()` returns `todayUTC()`; `isBefore()` orders across month/year boundaries
  - [x] `ScheduleClosure.create()` / `ScheduleOpening.create()` with a calendar-impossible date → `CalendarDateValidationError`; existing past-date tests still pass via the VO
  - [x] `mapSharedVoError` maps `CalendarDateValidationError` → 400 problem details with its code
  - [x] `ScheduleDayGridQuerySchema` / `ScheduleClosuresRangeQuerySchema` (shared schemas): accept a valid range, reject an impossible bound, reject a non-uuid `resourceId`
  - [x] Web `date-utils.spec.ts`'s existing `isValidDateKey` cases (incl. `2026-02-30`) still pass unchanged
  - [x] Web error-code exhaustiveness spec passes with `CalendarDateErrorCode` registered
  - [x] `DATE_ONLY_PATTERN` has zero remaining references in `apps/` and `packages/`
- Integration:
  - [x] Backend: `GET /schedule/day-grid?date=2026-02-30` → `400`, code `CALENDAR_DATE_FORMAT_INVALID` (schedule-day-grid controller integration spec)
  - [x] Existing schedule closure/opening/availability integration suites still pass (56 tests — entity ⇄ VO mapping round-trips)
  - [x] BFF: `GET /v1/schedule/day-grid?date=2026-02-30` → `400`, code `CALENDAR_DATE_FORMAT_INVALID`, and the backend is never called (component spec)
- Tenant isolation: n/a — validation/typing change, no new query paths
- E2E: none — covered by unit/integration
- [x] Coverage: backend 354 unit suites / 3217 tests + 68 integration suites / 645 tests; BFF 81 suites / 1081 tests, all green
- [x] `tsc --noEmit` clean (backend, BFF, web, packages), lint clean, `pnpm architecture-check` clean — including the new `aggregate-primitive-vo` registry entry, verified to actually fire by temporarily reverting `ScheduleClosure.date` to `string`

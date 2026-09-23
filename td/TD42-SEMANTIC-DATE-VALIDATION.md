# TD42 — Semantic Calendar-Date Validation (`DATE_ONLY_PATTERN` accepts impossible dates)

## Status
- **Type**: Technical Debt / Correctness
- **Priority**: Low — no observed production incident; a malformed-but-shape-valid date silently produces an empty/wrong result rather than crashing, so the blast radius is a confusing empty response, not a 5xx
- **Context**: `packages/validation` (fix lands here) — consumed by `apps/backend/src/contexts/booking/application/dtos/**` and `apps/bff/src/features/booking/*.schemas.ts`
- **Created**: 2026-09-23
- **Discovered**: CodeRabbit review on PR #506 (M22-S05, `GET /schedule/day-grid`) flagged the new `date` param's validation as shape-only; verified during triage that the same gap is systemic, not specific to that one field
- **State**: Open — single-scope; `/story-discovery` READY 2026-09-23 (approach revised, see Chosen approach)
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

## Chosen approach (revised during `/story-discovery`, 2026-09-23)

The original PR #506 triage proposed a bespoke `isValidCalendarDate()` (UTC round-trip check) plus a `z.string().refine(...)` schema. Discovery found that Zod 4's built-in **`z.iso.date()`** already performs full calendar validation — verified against the installed Zod 4.6.2: rejects `2026-02-30`, `2026-13-01`, `2026-04-31`, day `00`, `2026-02-29`, `1900-02-29`; accepts `2028-02-29`, `2000-02-29` — and the repo already uses it (`packages/validation/src/lead-form-submission.ts`, `submittedFrom`/`submittedTo`). Hand-rolling the same logic would be an improvised duplicate of a library primitive (CLAUDE.md §7 "Never improvise").

Decided:

1. **One shared schema, library-backed.** Add to `packages/validation/src/date.ts`:
   ```ts
   export const CalendarDateSchema = z.iso.date({
     error: 'must be a valid YYYY-MM-DD calendar date',
     params: { code: GenericErrorCode.VALUE_INVALID },
   });
   ```
   Mirrors the `timeOfDayField()` direct-reuse precedent in `packages/validation/src/booking.ts` (one schema shared verbatim by backend DTOs and BFF schemas, carrying an explicit error `code` per `docs/ENGINEERING_RULES_SHARED.md` § Single source of truth for a validation rule's code). `GenericErrorCode.VALUE_INVALID` is already translated in both locales — no new error code, no i18n change. The field name is carried by the Zod issue `path`, so one generic message serves `date`/`from`/`to`.
2. **Swap all 19 call sites** in the 11 files listed in Problem to `CalendarDateSchema` (or `CalendarDateSchema.optional()` for the 3 optional fields in `bookings.schemas.ts`).
3. **Delete `DATE_ONLY_PATTERN`** (and its `describe` block in `date.spec.ts`) — nothing consumes it after the swap; a dead shape-only export invites the same bug to be reintroduced.
4. **Consolidate the web duplicate.** `apps/web/features/booking/schedule/date-utils.ts`'s `isValidDateKey()` hand-rolls the same UTC round-trip check; replace its body with `z.iso.date().safeParse(dateKey).success` (`apps/web` already depends on `zod`). `@ikaro/validation` is deliberately **not** added as a web dependency — a `package.json` change for one boolean check isn't warranted when the underlying source of truth (Zod) is already shared. `parseDateKey()` is unchanged.

`localDateRangeBoundsUTC()` needs no change; it already produces a well-formed range once its inputs are guaranteed valid.

---

### Story 1 — Adopt a shared `CalendarDateSchema` (`z.iso.date()`) across all date fields

**Agent:** backend-ts
**Complexity:** S
**Docs to load:** `docs/CODE_STANDARDS.md`, `docs/ENGINEERING_RULES_SHARED.md`, `docs/VALUE_OBJECTS_REFERENCE.md`
**Dependencies:** none
**Pattern:** plain composition — shared direct-reuse Zod schema in `packages/validation`, same shape as `timeOfDayField()` in `packages/validation/src/booking.ts`; the semantic check is delegated to Zod's built-in `z.iso.date()`, not hand-rolled.

**Description:**
Add `CalendarDateSchema` (see Chosen approach §1) to `packages/validation/src/date.ts`, replace every `z.string().regex(DATE_ONLY_PATTERN, ...)` call site (19 fields, 11 files) with it, delete `DATE_ONLY_PATTERN`, and replace the hand-rolled body of web's `isValidDateKey()` with `z.iso.date().safeParse(dateKey).success`.

**Files to create/modify:**
- `packages/validation/src/date.ts` (modify — add `CalendarDateSchema`, remove `DATE_ONLY_PATTERN`)
- `packages/validation/src/date.spec.ts` (modify — replace the `DATE_ONLY_PATTERN` block with `CalendarDateSchema` tests)
- `apps/backend/src/contexts/booking/application/dtos/open-schedule.dto.ts` (modify)
- `apps/backend/src/contexts/booking/application/dtos/get-schedule-day-grid.dto.ts` (modify)
- `apps/backend/src/contexts/booking/application/dtos/get-availability.dto.ts` (modify)
- `apps/backend/src/contexts/booking/application/dtos/close-schedule.dto.ts` (modify)
- `apps/backend/src/contexts/booking/application/dtos/get-availability-summary.dto.ts` (modify)
- `apps/backend/src/contexts/booking/infrastructure/controllers/schedule-day-grid.controller.integration.spec.ts` (modify — add impossible-date → 400 case)
- `apps/bff/src/features/booking/schedule.schemas.ts` (modify)
- `apps/bff/src/features/booking/schedule-opening.schemas.ts` (modify)
- `apps/bff/src/features/booking/schedule-availability.schemas.ts` (modify)
- `apps/bff/src/features/booking/schedule-availability-summary.schemas.ts` (modify)
- `apps/bff/src/features/booking/bookings.schemas.ts` (modify)
- `apps/bff/src/features/booking/schedule-day-grid.schemas.ts` (modify)
- one existing BFF schedule controller spec (modify — impossible-date → 400 case; pick the representative spec at implementation time)
- `apps/web/features/booking/schedule/date-utils.ts` (modify — `isValidDateKey()` delegates to `z.iso.date()`)

**New migration / i18n keys / env vars / feature flags:** none — validation-only change; reuses the already-translated `GenericErrorCode.VALUE_INVALID`.

**Acceptance criteria — product:**
- [ ] Any endpoint accepting a `date`/`from`/`to` query or body field returns `400` for a calendar-impossible date (e.g. `2026-02-30`) instead of silently returning an empty result.
- [ ] A valid calendar date continues to work identically to today on every affected endpoint (no happy-path behavior change).

**Acceptance criteria — technical:**
- Unit:
  - [ ] `CalendarDateSchema`: accepts `2026-08-03`, `2028-02-29`, `2000-02-29`; rejects `2026-02-30`, `2026-02-29`, `1900-02-29`, `2026-13-01`, `2026-01-00`, `2026-8-3`, `2026-08-03T00:00:00.000Z`, `''`; a failure issue carries `params.code === GenericErrorCode.VALUE_INVALID`
  - [ ] Web `date-utils.spec.ts`'s existing `isValidDateKey` cases (incl. `2026-02-30`) still pass unchanged
  - [ ] `DATE_ONLY_PATTERN` has zero remaining references in `apps/` and `packages/`
- Integration:
  - [ ] Backend: `GET /schedule/day-grid?date=2026-02-30` → `400` (RFC 9457 problem details)
  - [ ] BFF: one representative schedule endpoint → `400` for an impossible date
- Tenant isolation: n/a — pure request validation, no tenant-scoped data involved
- E2E: none — covered by unit/integration
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

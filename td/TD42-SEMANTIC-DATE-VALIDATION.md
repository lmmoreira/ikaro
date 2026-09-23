# TD42 — Semantic Calendar-Date Validation (`DATE_ONLY_PATTERN` accepts impossible dates)

## Status
- **Type**: Technical Debt / Correctness
- **Priority**: Low — no observed production incident; a malformed-but-shape-valid date silently produces an empty/wrong result rather than crashing, so the blast radius is a confusing empty response, not a 5xx
- **Context**: `packages/validation` (fix lands here) — consumed by `apps/backend/src/contexts/booking/application/dtos/**` and `apps/bff/src/features/booking/*.schemas.ts`
- **Created**: 2026-09-23
- **Discovered**: CodeRabbit review on PR #506 (M22-S05, `GET /schedule/day-grid`) flagged the new `date` param's validation as shape-only; verified during triage that the same gap is systemic, not specific to that one field
- **State**: Open — single-scope, ready for `/story-discovery`
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

## Chosen approach (decided during PR #506 triage, 2026-09-23)

Add a semantic validator alongside the existing shape check, in the same file and same style as `isValidTimeOfDay()`:

```ts
// packages/validation/src/date.ts
export function isValidCalendarDate(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
```

Then add one shared Zod schema piece built on it (e.g. `export const CalendarDateSchema = z.string().refine(isValidCalendarDate, { error: 'must be a valid YYYY-MM-DD calendar date' })` in the same file) and swap every `z.string().regex(DATE_ONLY_PATTERN, ...)` call site listed above to use `CalendarDateSchema` instead — no per-app deviation expected, this is a pure tightening of an existing check, not a new field. `localDateRangeBoundsUTC()` itself needs no change; it already produces a well-formed range once its inputs are guaranteed valid.

---

### Story 1 — Add `isValidCalendarDate()` and adopt it across all existing date fields

**Agent:** backend-ts
**Complexity:** S
**Docs to load:** `docs/CODE_STANDARDS.md`, `docs/VALUE_OBJECTS_REFERENCE.md`
**Dependencies:** none
**Pattern:** plain composition — mirrors the existing `isValidTimeOfDay()` semantic-validator-alongside-shape-pattern convention already in `packages/validation/src/date.ts`; no new pattern.

**Description:**
`packages/validation/src/date.ts` currently exports only `DATE_ONLY_PATTERN` (shape) for calendar dates, unlike its own `isValidTimeOfDay()` (semantic). Add `isValidCalendarDate(value: string): boolean` (rejects `2026-02-30`, `2026-13-01`, etc., using the UTC round-trip check in the Chosen-approach snippet above) and a shared `CalendarDateSchema = z.string().refine(isValidCalendarDate, { error: 'must be a valid YYYY-MM-DD calendar date' })`. Replace every `z.string().regex(DATE_ONLY_PATTERN, '<field> must be YYYY-MM-DD')` call site across the 11 files listed in this TD's Problem section with `CalendarDateSchema` (or a field-specific wrapper only if a call site's error-message text must stay field-specific — check each site; most already use a generic enough message that direct reuse is fine). Keep `DATE_ONLY_PATTERN` exported as-is — `isValidCalendarDate()` uses it internally and nothing forces removing the shape-only regex for callers that only need cheap shape prevalidation.

**Files to create/modify:**
- `packages/validation/src/date.ts` (modify — add `isValidCalendarDate()` + `CalendarDateSchema`)
- `packages/validation/src/date.spec.ts` (modify — unit tests for `isValidCalendarDate()`: valid date, Feb 30, month 13, day 0, non-numeric, wrong shape)
- `apps/backend/src/contexts/booking/application/dtos/open-schedule.dto.ts` (modify)
- `apps/backend/src/contexts/booking/application/dtos/get-schedule-day-grid.dto.ts` (modify)
- `apps/backend/src/contexts/booking/application/dtos/get-availability.dto.ts` (modify)
- `apps/backend/src/contexts/booking/application/dtos/close-schedule.dto.ts` (modify)
- `apps/backend/src/contexts/booking/application/dtos/get-availability-summary.dto.ts` (modify)
- `apps/bff/src/features/booking/schedule.schemas.ts` (modify)
- `apps/bff/src/features/booking/schedule-opening.schemas.ts` (modify)
- `apps/bff/src/features/booking/schedule-availability.schemas.ts` (modify)
- `apps/bff/src/features/booking/schedule-availability-summary.schemas.ts` (modify)
- `apps/bff/src/features/booking/bookings.schemas.ts` (modify)
- `apps/bff/src/features/booking/schedule-day-grid.schemas.ts` (modify)

**New migration / i18n keys / env vars / feature flags:** none — validation-only change, no schema/DB impact.

**Acceptance criteria — product:**
- [ ] Any endpoint accepting a `date`/`from`/`to` query or body field returns `400` for a calendar-impossible date (e.g. `2026-02-30`) instead of silently returning an empty result.
- [ ] A valid calendar date continues to work identically to today on every affected endpoint (no behavior change for the happy path).

**Acceptance criteria — technical:**
- Unit:
  - [ ] `isValidCalendarDate()`: accepts a real date; rejects Feb 30, month 13, day 0, a non-numeric string, and a string that fails `DATE_ONLY_PATTERN`'s shape first
  - [ ] Each modified DTO/schema file's existing "malformed date" test (if present) still passes; add one "calendar-impossible date → validation error" case per file that doesn't already have one
- Integration:
  - [ ] At least one representative backend endpoint (e.g. `GET /schedule/day-grid`) returns `400` for `date=2026-02-30`
- Tenant isolation: n/a — pure request validation, no tenant-scoped data involved
- E2E: none — covered by unit/integration
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

# TD46 — Columns Board Week-Boundary Booking Fetch Gap

## Status
- **Type**: Technical Debt / Correctness
- **Priority**: Low — edge case within an edge case (requires TD43's buffer-crosses-midnight scenario AND the spilling booking's own day being the last day of a displayed week); no observed production incident
- **Context**: `apps/web/features/booking/schedule/schedule-resource-columns.ts`, `schedule-page-query-data.ts` (`useWeekBookings` fetch range), `date-utils.ts`, `app/dashboard/schedule/page.tsx` (server prefetch of the same range)
- **Created**: 2026-09-28
- **Discovered**: CodeRabbit review of PR #522 (TD43 Story 0, columns-board spillover-indicator fix)
- **State**: Open — `/story-discovery` done 2026-09-28 (design locked in Story 0 below); not yet implemented
- **Numbering**: created as TD45 and renumbered to TD46 during discovery — an unrelated TD45 (`TD45-RECURRING-SCHEDULE-SCALE-HARDENING.md`, from PR #521) already held that number, making `td/TD45-*.md` ambiguous
- **Related**: TD43 (`docs/archive/td/TD43-COLUMNS-BOARD-DAY-GRID-INTERVAL-FIDELITY.md`) — this TD's fix builds directly on TD43's spillover-bucket mechanism; PR #522

---

## Problem

`useWeekBookings(weekStartKey, weekEndKey)` (`schedule-page-query-data.ts:123-127`) fetches bookings by `scheduledAt` strictly within the currently displayed week. `findDayGridOccupancy` (`typeorm-booking-availability.adapter.ts:93-94`) is a pure interval-overlap query (`ro.startsAt < isoEnd AND ro.endsAt > isoStart`) with no week boundary at all. A booking scheduled on the last day of week N, whose buffer/turnover pushes real occupancy into the first day of week N+1, is correctly present in day-grid's response when the manager views week N+1 — but its `bookingId` is absent from `bookingById` (built from week N+1's own `bookings` prop), since that booking's `scheduledAt` falls in week N. `resolveResourceBookings` (TD43's own new split) therefore falls to the unmatched-`buildPlaceholderBooking` path instead of the spillover-bucket path — and that placeholder's own synthetic `scheduledAt` (raw `block.startsAt`, still dated in week N) fails the exact same `getBookingDateKey` filter inside `buildTimelineDayData` that TD43 exists to fix for the matched-booking case. Net effect: the booking silently disappears from week N+1's column again, one layer beneath where TD43's fix reaches.

---

## Story 0 — Make a week-boundary-spanning booking visible to the columns board's spillover detection

**Agent:** `frontend-ts`
**Complexity:** S
**Docs to load:** `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/08-TESTING_STRATEGY.md`
**Dependencies:** TD43 Story 0 (builds directly on its same-day/spillover bucket split) — ✅ merged, PR #522
**Pattern:** plain composition — no new named pattern (locked in `/story-discovery`, 2026-09-28)

**Discovered:** 2026-09-28, CodeRabbit review of PR #522 (`schedule-resource-columns.ts:131-135`)
**Root cause:** traced live — see Problem above; `useWeekBookings`'s week-scoped fetch vs. day-grid's unbounded overlap query.

**Description (design locked in `/story-discovery`, 2026-09-28):**
Start the week's bookings fetch one day early — `from` = the day before `weekStartKey`, `to` unchanged (`weekEndKey`) — so a booking scheduled on the previous week's last day is present in `bookingById` when the columns board is viewed on a week's first day. `resolveResourceBookings` then matches it and routes it to the spillover bucket exactly as TD43 already does within a week. No change to `schedule-resource-columns.ts` or the board.

- Add `getWeekBookingsFetchStartKey(weekStartKey)` to `apps/web/features/booking/schedule/date-utils.ts` — one shared helper, used by both `useScopedFetches` (`schedule-page-query-data.ts`) and the server prefetch in `apps/web/app/dashboard/schedule/page.tsx`. Both must use it: the initial week's `initialData` has to cover the same range as the client query, or the initial week keeps the gap. A comment on the helper states why (buffer/turnover spillover from the previous week's last day).

**Why this option, and what was rejected:**
- (B) Resolve an unmatched `refId` by ID — makes the pure, synchronous `buildResourceColumns` async and costs N detail requests. Rejected.
- (C) A dedicated previous-day fetch inside `ScheduleResourceColumnsBoard` (the BFF list endpoint accepts `date`) — correct, but adds a hook, an enable gate and loading/error states. More machinery than an edge case warrants. Rejected.
- **Verified inert (2026-09-28):** every consumer of the week's bookings filters by date key first — `buildTimelineDayData` (`selectedDateKey`), the closure-conflict counter (`body.date`), the day's booking count (derived from the selected day's timeline events). `activeDates` only gains a date key outside the displayed week and is only checked by membership.

**Explicitly not changed:** `buildPlaceholderBooking` keeps its current behavior — it stays reserved for a genuine data gap (a day-grid `bookingId` with no booking anywhere). A placeholder for an unmatched block that starts on a previous local date is still dropped by the day filter; accepted, no special case added.
**Accepted, not worked around:** the extra day shares the BFF's 100-row cap (`limit` max is 100, and this fetch is already unpaginated). Truncation on a very busy week already pre-exists; pagination would be its own TD if it ever matters.

**New migration / i18n keys / env vars / feature flags:** none

**Files to create/modify:**
- `apps/web/features/booking/schedule/date-utils.ts` (modify — add `getWeekBookingsFetchStartKey`) + `date-utils.spec.ts` (modify)
- `apps/web/features/booking/schedule/schedule-page-query-data.ts` (modify — `useScopedFetches` passes the helper's result as `from`) + `schedule-page-query-data.spec.tsx` (modify)
- `apps/web/app/dashboard/schedule/page.tsx` (modify — server prefetch uses the same helper; thin page, covered by the helper's unit test)
- `apps/web/features/booking/schedule/schedule-page-timeline-derived.spec.tsx` (modify — inertness case)
- `apps/web/features/booking/schedule/schedule-resource-columns.spec.ts` (modify — week-boundary spillover case)

**Acceptance criteria — product:**
- [ ] A booking whose buffer-extended occupancy spills into the first day of the next displayed week still shows as a spillover indicator with the real contact name — not a generic placeholder, not silently missing.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `date-utils.spec.ts`: `getWeekBookingsFetchStartKey` returns the previous day, including across a month boundary, a year boundary (`2026-01-01` → `2025-12-31`) and a leap day (`2028-03-01` → `2028-02-29`)
  - [ ] `schedule-page-query-data.spec.tsx`: the week bookings fetch is issued with `from` one day before the week start and `to` at the week end; the initial-week `initialData` fallback still applies
  - [ ] `schedule-page-timeline-derived.spec.tsx`: the 7 week cards and the selected-day timeline ignore a booking dated the day before the week (the inertness this design depends on)
  - [ ] `schedule-resource-columns.spec.ts`: a day-grid block on a week's first day, matched to a booking scheduled on the previous week's last day, produces a `spilloverOccupancy` entry with the real contact name (not a placeholder)
  - [ ] Existing within-week spillover and same-day cases (TD43) render identically to before this change (non-regression)
- Integration: n/a — no `.integration.spec.ts` tier for `apps/web`
- Tenant isolation: n/a — client-side; server-side isolation already covered by M22-S05
- E2E: none — covered by unit tests; the underlying scenario isn't practical to reproduce end-to-end
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

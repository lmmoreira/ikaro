# TD45 — Columns Board Week-Boundary Booking Fetch Gap

## Status
- **Type**: Technical Debt / Correctness
- **Priority**: Low — edge case within an edge case (requires TD43's buffer-crosses-midnight scenario AND the spilling booking's own day being the last day of a displayed week); no observed production incident
- **Context**: `apps/web/features/booking/schedule/schedule-resource-columns.ts`, `schedule-page-query-data.ts` (`useWeekBookings` fetch range), `useSchedule.ts`
- **Created**: 2026-09-28
- **Discovered**: CodeRabbit review of PR #522 (TD43 Story 0, columns-board spillover-indicator fix)
- **State**: Open — not yet started; `/story-discovery` not yet run
- **Related**: TD43 (`td/TD43-COLUMNS-BOARD-DAY-GRID-INTERVAL-FIDELITY.md`) — this TD's fix builds directly on TD43's spillover-bucket mechanism; PR #522

---

## Problem

`useWeekBookings(weekStartKey, weekEndKey)` (`schedule-page-query-data.ts:123-127`) fetches bookings by `scheduledAt` strictly within the currently displayed week. `findDayGridOccupancy` (`typeorm-booking-availability.adapter.ts:93-94`) is a pure interval-overlap query (`ro.startsAt < isoEnd AND ro.endsAt > isoStart`) with no week boundary at all. A booking scheduled on the last day of week N, whose buffer/turnover pushes real occupancy into the first day of week N+1, is correctly present in day-grid's response when the manager views week N+1 — but its `bookingId` is absent from `bookingById` (built from week N+1's own `bookings` prop), since that booking's `scheduledAt` falls in week N. `resolveResourceBookings` (TD43's own new split) therefore falls to the unmatched-`buildPlaceholderBooking` path instead of the spillover-bucket path — and that placeholder's own synthetic `scheduledAt` (raw `block.startsAt`, still dated in week N) fails the exact same `getBookingDateKey` filter inside `buildTimelineDayData` that TD43 exists to fix for the matched-booking case. Net effect: the booking silently disappears from week N+1's column again, one layer beneath where TD43's fix reaches.

---

## Story 0 — Make a week-boundary-spanning booking visible to the columns board's spillover detection

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/08-TESTING_STRATEGY.md`
**Dependencies:** TD43 Story 0 (builds directly on its same-day/spillover bucket split — must be merged first)
**Pattern:** plain composition — no new named pattern; concrete approach is a story-discovery decision (two candidates below)

**Discovered:** 2026-09-28, CodeRabbit review of PR #522 (`schedule-resource-columns.ts:131-135`)
**Root cause:** traced live — see Problem above; `useWeekBookings`'s week-scoped fetch vs. day-grid's unbounded overlap query.

**Description:**
Two candidate fixes, deliberately left open for `/story-discovery` to lock in (mirrors TD43 Story 0's own precedent of flagging candidates rather than guessing):
- **(A) Widen `useWeekBookings`'s fetch range by one day at the window's start** (`from: weekStartKey - 1 day`). Lowest-code-change option, but it's a page-wide data-loading change shared by the single merged timeline, week view, and the columns board — needs verification that this doesn't perturb `buildActiveDates`'s week-nav-dot derivation, the query's `limit: 100`, or the `['bookings', tenantId, 'week', from, to]` cache key in any visible way. (Initial read suggests low risk — every other consumer already filters by `getBookingDateKey === specific day`, so an extra day's data sitting unused should be inert — but this needs a full pass, not an assumption.)
- **(B) Resolve an unmatched day-grid `refId` directly** before falling back to the placeholder (e.g. a targeted by-ID booking fetch for just the unmatched refs). Avoids widening a shared fetch, but turns `buildResourceColumns`'s currently pure, synchronous computation into something needing an async resolution step — larger architectural change than (A).

Whichever is chosen, the placeholder fallback (`buildPlaceholderBooking`) must remain reserved for a genuine data gap (day-grid referencing a `bookingId` with no booking anywhere, not just outside the current week) — the whole point of this story is narrowing when that fallback fires, not changing its own behavior.

**New migration / i18n keys / env vars / feature flags:** none

**Files to create/modify:**
- If (A): `apps/web/features/booking/schedule/schedule-page-query-data.ts` (modify), `apps/web/features/booking/schedule/useSchedule.ts` (modify), `apps/web/features/booking/schedule/schedule-page-query-data.spec.tsx` (modify)
- If (B): `apps/web/features/booking/schedule/schedule-resource-columns.ts` (modify), `apps/web/features/booking/components/dashboard/schedule/ScheduleResourceColumnsBoard.tsx` (modify — async resolution)
- Either way: `apps/web/features/booking/schedule/schedule-resource-columns.spec.ts` (modify — add a week-boundary spillover case: booking on week N's last day, viewed from week N+1)

**Acceptance criteria — product:**
- [ ] A booking whose buffer-extended occupancy spills into the first day of the next displayed week still shows as a spillover indicator with the real contact name — not a generic placeholder, not silently missing.

**Acceptance criteria — technical:**
- Unit:
  - [ ] A day-grid block on week N+1's first day, matched to a booking scheduled on week N's last day, produces a `spilloverOccupancy` entry (not a placeholder)
  - [ ] Existing within-week spillover and same-day cases (TD43) render identically to before this change (non-regression)
- Integration: n/a — no `.integration.spec.ts` tier for `apps/web`
- Tenant isolation: n/a — client-side; server-side isolation already covered by M22-S05
- E2E: none — covered by unit tests; the underlying scenario isn't practical to reproduce end-to-end
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

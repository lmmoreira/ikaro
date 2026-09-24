# TD43 — Columns Board Discards the Day-Grid Occupancy Interval

## Status
- **Type**: Technical Debt / Correctness
- **Priority**: Low — edge case (requires a service buffer large enough to push occupancy past a day boundary), not a mainline bug; no observed production incident
- **Context**: `apps/web/features/booking/schedule/schedule-resource-columns.ts`, `schedule-timeline.ts` (booking-date filter), consumed by `ScheduleResourceColumnsBoard.tsx` (M22-S06)
- **Created**: 2026-09-24
- **Discovered**: Codex round-4 review of PR #511 (M22-S06, manager bounded multi-resource column view)
- **State**: Open — not yet started; `/story-discovery` not yet run
- **Related**: M22-S06 (`plan/M22-MULTIVERTICAL-SERVICE-AVAILABILITY.md`), M22-S05 (day-grid endpoint)

---

## Problem

`ScheduleResourceColumnsBoard`'s per-column data (`schedule-resource-columns.ts`) uses the day-grid response purely as a `resourceId → booking-id` lookup: it resolves each `BOOKING` block's `refId` to a full booking object from the already-fetched week-bookings list, then discards the block's own `startsAt`/`endsAt` entirely. The resolved booking is fed into the existing `buildTimelineDayData`, which re-derives each event's position from `booking.scheduledAt` + `booking.totalDurationMins`, and filters which bookings appear on the selected day via `getBookingDateKey(booking, timezone) === selectedDateKey` (`schedule-timeline-events.ts:55-57`, consumed by `schedule-timeline.ts`'s `buildAllTimelineEvents`).

This diverges from what the day-grid endpoint actually reports occupied: `DayGridOccupancyBlock.endsAt` "includes the effective service buffer / resource turnover" (`day-grid-occupancy-block.ts:9`), a window the booking's own `scheduledAt`/`totalDurationMins` doesn't capture. Two consequences:

1. A rendered block's visual span excludes buffer/turnover time — a pre-existing simplification the single merged timeline already has (not a regression introduced here).
2. A booking whose buffer-extended occupancy crosses midnight can silently disappear from a resource's column: day-grid correctly reports the resource occupied on the selected day, but `getBookingDateKey` keys off `scheduledAt` alone, which may resolve to a different calendar day than the one the manager is viewing.

Not reachable today for the M22 milestone's own scope (legged services, whose day-grid interval could also diverge from `scheduledAt` for a non-first leg, are inert until M23), but real for any tenant with a buffer configured large enough to push a late-day booking's occupancy past midnight.

---

## Story 0 — Build columns-board timeline events from the day-grid interval directly, not the booking's own scheduledAt/duration

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/08-TESTING_STRATEGY.md`
**Dependencies:** none
**Pattern:** plain composition — extends `schedule-resource-columns.ts`'s existing booking-resolution step; no new named pattern.

**Description:**
Change `resolveResourceBookings`/`buildResourceColumns` to construct each booking's timeline event directly from the matched day-grid block's own `startsAt`/`endsAt` (the authoritative occupancy interval), using the matched `StaffBookingCardResponse` only for display fields (`contactName`, `serviceNames`, `status`) — not for timing or date-membership. This likely means bypassing `buildTimelineDayData`'s booking-list input for the booking layer specifically inside the columns board (closures/openings keep using it unchanged, since those aren't affected by this gap), or extending `buildTimelineEvents`'s booking→event construction to accept an optional explicit interval override. Concrete shape is a `/story-discovery` decision — flag the two candidate approaches (bypass vs. extend) as the open pattern question for that session.

**Files to create/modify:**
- `apps/web/features/booking/schedule/schedule-resource-columns.ts` (modify)
- `apps/web/features/booking/schedule/schedule-resource-columns.spec.ts` (modify — add a cross-midnight-buffer case)
- `apps/web/features/booking/schedule/schedule-timeline.ts` and/or `schedule-timeline-events.ts` (modify, if the extend-not-bypass approach is chosen)

**Acceptance criteria — product:**
- [ ] A booking whose resource occupancy (per day-grid) crosses midnight due to buffer/turnover still appears in the correct resource's column on every day its occupancy interval overlaps.

**Acceptance criteria — technical:**
- Unit:
  - [ ] A day-grid block whose `startsAt`/`endsAt` cross a day boundary produces a visible event without relying on the matched booking's own `scheduledAt` for date membership
  - [ ] Existing same-day cases (no boundary crossing) render identically to before this change (non-regression)
- Integration: n/a — no `.integration.spec.ts` tier for `apps/web`
- Tenant isolation: n/a — client-side; server-side isolation already covered by M22-S05
- E2E: none — covered by unit tests; the underlying scenario (buffer crossing midnight) isn't practical to reproduce end-to-end
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

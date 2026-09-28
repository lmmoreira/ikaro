# TD43 — Columns Board Discards the Day-Grid Occupancy Interval

## Status
- **Type**: Technical Debt / Correctness
- **Priority**: Low — edge case (requires a service buffer large enough to push occupancy past a day boundary), not a mainline bug; no observed production incident
- **Context**: `apps/web/features/booking/schedule/schedule-resource-columns.ts`, `schedule-timeline.ts` (booking-date filter), consumed by `ScheduleResourceColumnsBoard.tsx` (M22-S06)
- **Created**: 2026-09-24
- **Discovered**: Codex round-4 review of PR #511 (M22-S06, manager bounded multi-resource column view)
- **State**: ✅ Done — shipped 2026-09-28 (PR #522). Week-boundary follow-up tracked in TD46.
- **Related**: M22-S06 (`plan/M22-MULTIVERTICAL-SERVICE-AVAILABILITY.md`), M22-S05 (day-grid endpoint)

---

## Problem

`ScheduleResourceColumnsBoard`'s per-column data (`schedule-resource-columns.ts`) uses the day-grid response purely as a `resourceId → booking-id` lookup: it resolves each `BOOKING` block's `refId` to a full booking object from the already-fetched week-bookings list, then discards the block's own `startsAt`/`endsAt` entirely. The resolved booking is fed into the existing `buildTimelineDayData`, which re-derives each event's position from `booking.scheduledAt` + `booking.totalDurationMins`, and filters which bookings appear on the selected day via `getBookingDateKey(booking, timezone) === selectedDateKey` (`schedule-timeline-events.ts:55-57`, consumed by `schedule-timeline.ts`'s `buildAllTimelineEvents`).

This diverges from what the day-grid endpoint actually reports occupied: `DayGridOccupancyBlock.endsAt` "includes the effective service buffer / resource turnover" (`day-grid-occupancy-block.ts:9`), a window the booking's own `scheduledAt`/`totalDurationMins` doesn't capture. Two consequences:

1. A rendered block's visual span excludes buffer/turnover time — a pre-existing simplification the single merged timeline already has (not a regression introduced here).
2. A booking whose buffer-extended occupancy crosses midnight can silently disappear from a resource's column: day-grid correctly reports the resource occupied on the selected day, but `getBookingDateKey` keys off `scheduledAt` alone, which may resolve to a different calendar day than the one the manager is viewing.

Not reachable today for the M22 milestone's own scope (legged services, whose day-grid interval could also diverge from `scheduledAt` for a non-first leg, are inert until M23), but real for any tenant with a buffer configured large enough to push a late-day booking's occupancy past midnight.

---

## Story 0 — Surface buffer-extended occupancy as a fixed spillover indicator, not a discarded booking

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/08-TESTING_STRATEGY.md`
**Dependencies:** none
**Pattern:** plain composition — extends `schedule-resource-columns.ts`'s existing booking-resolution step; no new named pattern.

**Description (locked in by `/story-discovery`, 2026-09-27):**

Two approaches were considered and rejected before landing on this design — recorded here so a future reader doesn't re-propose them:
- **Rejected — reposition the event using the day-grid block's own interval.** The grid's vertical range per day is bounded by business hours (`resolveActiveTimelineHours`, `schedule-timeline-window.ts:82-101`), not a fixed 00:00–24:00 window. A spillover block (e.g. 00:00–00:40) falls before the next day's grid even starts for any tenant that doesn't open at midnight — so a correctly-dated, correctly-positioned block would still render invisible/off-grid. Making it visible would mean widening the active window computation, which TD44 Stories 3/4 already wired into cross-column shared-axis logic (`resolveSharedTimelineWindow`/`applySharedTimelineWindow`) — real, non-trivial scope creep, rejected as more machinery than this edge case warrants.
- **Rejected — thread an interval-override parameter through the shared timeline pipeline** (`buildTimelineDayData` → `buildTimelineEvents` → `buildAllTimelineEvents` → `buildFilteredBookingEvents` → `buildBookingTimelineEvent`, 4-6 layers across `schedule-timeline.ts`/`schedule-timeline-event-list.ts`/`schedule-timeline-events.ts`). That pipeline is also used by the single merged timeline (`schedule-page-timeline-derived.ts`), which has no day-grid signal at all and doesn't need this override — threading it through for one caller only is unnecessary shared-code risk.

**Chosen design:** don't try to render the spillover portion inside the grid at all. In `resolveResourceBookings`, split matched day-grid blocks into two buckets:
- **Same-day** (the matched booking's own `getBookingDateKey(match, timezone) === selectedDateKey`) — unchanged, fed into `buildTimelineDayData`'s bookings list exactly as today. This is the whole non-regression guarantee: the normal path is untouched.
- **Spillover** (day-grid matched the block for this day, but the booking's own day resolves earlier — buffer pushed real occupancy across midnight) — excluded from the grid's bookings list entirely (no positioning math, no grid-range changes) and instead collected into a new per-column field.

`ScheduleResourceColumn` gains:
```ts
interface SpilloverOccupancyIndicator {
  readonly bookingId: string;
  readonly contactName: string;
  readonly endsAtLocalTime: string; // "HH:MM" in tenant timezone, from the block's own endsAt
}
// ScheduleResourceColumn:
readonly spilloverOccupancy: readonly SpilloverOccupancyIndicator[];
```

`ScheduleResourceColumnsBoard.tsx` renders each entry as a small fixed banner at the top of that resource's column (not a grid row, no vertical positioning) — copy: pt-BR `"Ocupado até {time} — {name}"`, en `"Occupied until {time} — {name}"` (proposed; no UX prototype covers this edge case since it's a TD, not a milestone story with a validated prototype — open to a different wording). The banner links to `/dashboard/bookings/${bookingId}?returnTo=...`, same href pattern as a normal timeline block. The existing `selectedStatusSet` filter still applies to a spillover match the same way it does to a same-day match — a spillover booking whose status isn't checked produces no indicator.

Explicitly out of scope (confirmed during discovery): the visual span still excluding buffer time on the booking's own home day (pre-existing simplification, not a regression); the single merged timeline (`schedule-page-timeline-derived.ts`/`schedule-page-derived.ts`) — it has no day-grid signal at all and was never attempting to represent buffer/turnover occupancy on any day, so it has no analogous disappearance bug to fix.

**Files to create/modify:**
- `apps/web/features/booking/schedule/schedule-resource-columns.ts` (modify — split matched blocks into same-day/spillover buckets; add `SpilloverOccupancyIndicator` type and `spilloverOccupancy` field)
- `apps/web/features/booking/schedule/schedule-resource-columns.spec.ts` (modify — add cross-midnight-buffer spillover cases, incl. one filtered out by status)
- `apps/web/features/booking/components/dashboard/schedule/ScheduleResourceColumnsBoard.tsx` (modify — render the fixed spillover banner per column)
- `apps/web/features/booking/components/dashboard/schedule/ScheduleResourceColumnsBoard.spec.tsx` (modify — spillover banner rendering + link)
- `packages/i18n/locales/pt-BR/web.json` (modify — new spillover-occupancy label key)
- `packages/i18n/locales/en/web.json` (modify — same key, English copy)

**Acceptance criteria — product:**
- [ ] A booking whose resource occupancy (per day-grid) crosses midnight due to buffer/turnover no longer silently disappears from the resource's column on the spillover day — it shows as a fixed "Ocupado até {time} — {name}" indicator linking to the real booking.

**Acceptance criteria — technical:**
- Unit:
  - [ ] A day-grid block matched to a booking whose own day differs from the column's `selectedDateKey` produces a `spilloverOccupancy` entry (bookingId, contactName, local end time), not a discarded/invisible booking
  - [ ] That spillover entry is excluded from the column's grid `timeline.events` (no positioned block created for it)
  - [ ] A spillover match whose status isn't in `selectedStatusSet` produces no indicator (same filtering behavior as a same-day match)
  - [ ] Existing same-day cases (no boundary crossing) render identically to before this change (non-regression) — same bucket, same `buildTimelineDayData` path, untouched
  - [ ] `ScheduleResourceColumnsBoard` renders the spillover banner at the top of the correct resource's column with the correct link
- Integration: n/a — no `.integration.spec.ts` tier for `apps/web`
- Tenant isolation: n/a — client-side; server-side isolation already covered by M22-S05
- E2E: none — covered by unit tests; the underlying scenario (buffer crossing midnight) isn't practical to reproduce end-to-end
- [ ] Both `packages/i18n/locales/pt-BR/web.json` and `en/web.json` updated in the same commit with the new spillover-label key
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

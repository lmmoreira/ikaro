# TD44 — No Upper Bound on Simultaneously-Rendered Resource Columns

## Status
- **Type**: Technical Debt / Performance & UX
- **Priority**: Low — requires a manager to deliberately check many resources at once; no observed production incident, but nothing today prevents it
- **Context**: `apps/web/features/booking/components/dashboard/schedule/ResourceFilterMenu.tsx`, `ScheduleResourceColumnsBoard.tsx` (M22-S06)
- **Created**: 2026-09-24
- **Discovered**: Codex round-4 review of PR #511 (M22-S06, manager bounded multi-resource column view)
- **State**: Open — not yet started; `/story-discovery` not yet run (the exact cap/UX treatment is deliberately left open below, not pre-decided)
- **Related**: M22-S06 (`plan/M22-MULTIVERTICAL-SERVICE-AVAILABILITY.md`), M21-S05 (`ResourceFilterMenu`)

---

## Problem

M22-S06's own design (`plan/M22-MULTIVERTICAL-SERVICE-AVAILABILITY.md`, resolved via `/story-discovery` 2026-09-24) deliberately replaced an earlier "one column per every active resource" grid with a bounded design: the manager curates which resources get a column by checking them in the existing `ResourceFilterMenu` (M21-S05). The premise was that a small, human-curated subset scales where an unbounded "show everyone" grid doesn't.

Nothing in the implementation enforces that the subset stays small. `ResourceFilterMenu` lets a manager check every active resource in the tenant with no limit, and `ScheduleResourceColumnsBoard` renders one full, unmodified `ScheduleTimelineBoard` per checked resource — a complete time-axis DOM tree, plus its own closure/opening/booking scan — for every one of them. UC-057 A1 ("many checked resources") is only handled via horizontal scroll (`ScheduleResourceColumnsBoard.tsx`'s `overflow-x-auto`), not by limiting how many columns render at once. A manager who checks, say, 20+ resources gets 20+ full timeline boards rendered simultaneously, with no warning and no degradation strategy.

## Why this matters

The whole scalability argument for the bounded-columns design rests on the subset staying small by convention, not by enforcement. A tenant with many resources (the same "60-resource gym" scenario that motivated dropping the unbounded grid in the first place) could still hit the same class of problem through this side door, just requiring a few extra clicks to get there instead of loading the page.

---

## Story 0 — Decide and implement a practical bound on simultaneously-rendered resource columns

**Agent:** `frontend-ts`
**Complexity:** S–M (depends on the chosen treatment)
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/08-TESTING_STRATEGY.md`
**Dependencies:** none
**Pattern:** not pre-decided — this is the story's own open question (see below).

**Description:**
This story's scope is deliberately not pre-decided beyond "the current unbounded state is wrong" — the concrete shape is a genuine product/UX decision for `/story-discovery` (or the user directly) to resolve, not something to presuppose here. Candidate treatments, not mutually exclusive:

- A soft cap with a warning (e.g. "showing the first N of M checked resources — uncheck some for a clearer view") rather than a hard block.
- A hard cap on how many checkboxes can be checked at once in `ResourceFilterMenu` itself, disabling further checks past the limit.
- Deferred/virtualized rendering so columns past the visible viewport don't mount a full `ScheduleTimelineBoard` until scrolled into view, removing the need for any hard cap at all.

Whichever is chosen, the acceptance criteria below assume *some* bound exists and is visible to the manager — fill in the exact number and UX once decided.

**Files likely to create/modify (exact set depends on chosen treatment):**
- `apps/web/features/booking/components/dashboard/schedule/ResourceFilterMenu.tsx`
- `apps/web/features/booking/components/dashboard/schedule/ScheduleResourceColumnsBoard.tsx`
- `packages/i18n/locales/{pt-BR,en}/web.json` (if a warning/cap message is added)

**Acceptance criteria — product:**
- [ ] A manager who checks an unreasonably large number of resources at once gets a bounded, comprehensible result (via cap, warning, or deferred rendering) rather than an unbounded number of full timeline boards rendering simultaneously with no feedback.

**Acceptance criteria — technical:**
- Unit:
  - [ ] The chosen bound/deferred-rendering behavior is covered by a unit test exercising a selection count above the threshold
  - [ ] Below-threshold behavior is unchanged (non-regression)
- Integration: n/a — no `.integration.spec.ts` tier for `apps/web`
- Tenant isolation: n/a — client-side only
- E2E: at least one Playwright scenario exercising the bound with a realistic number of checked resources
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

---

## Story 1 — Week view resource-name badges on booking blocks

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/08-TESTING_STRATEGY.md`
**Discovered:** User request during M22-S06 (PR #511) review — not a bug, a follow-up feature idea surfaced once the day-grid plumbing existed to make it cheap.
**Dependencies:** none (builds on M22-S06's already-shipped day-grid consumption, not a blocking dependency on Story 0 above)
**Pattern:** plain composition — extends the existing closure/opening `resourceName` pattern (`ResourceNameBadge`, `ScheduleTimelineEventRenderer.tsx`) to booking blocks, using a new per-day day-grid fan-out hook shaped like the existing per-resource fan-out (`useScheduleClosures`/`useScheduleOpenings`'s `useQueries` pattern) — just fanned by day instead of by resource.

**Description:**
Week view (`ScheduleWeekView`'s 7 day-cards) is unaffected by M22-S06 — checking a resource there still merges that resource's bookings into the shared mini-timeline with no visual indication of which resource a booking belongs to (`BookingTimelineEvent` carries no `resourceName` field today, unlike `ClosureTimelineEvent`/`OpeningTimelineEvent`, which already do). A full columns-per-day-card layout was considered and ruled impractical (7 days × N resource-columns is too cramped). Instead: reuse the already-shipped `ResourceNameBadge` component and the day-grid `resourceId → booking-id` lookup (M22-S06) to label each booking block with its resource, the same way closure/opening blocks already are.

Requires:
1. A new week-range day-grid fetch — `useScheduleDayGrid` takes a single date; Week view needs one call per visible day. New hook (e.g. `useScheduleWeekDayGrid`), fanned out via `useQueries` across the 7 dates, gated on `resourceIds.length > 0` (same gating `useScheduleDayGrid` already has).
2. `BookingTimelineEvent` gains a `resourceName: string | null` field; `buildBookingTimelineEvent` accepts a `resourceNameById`-style lookup (booking id → resource name, built from the new week-range day-grid data) the same way `buildClosureTimelineEvent`/`buildOpeningTimelineEvent` already resolve theirs.
3. `renderBookingTimelineEvent` renders `<ResourceNameBadge resourceName={event.resourceName} />` as trailing content, matching the closure/opening renderers exactly.
4. A height/spacing pass on the compact week-card block styling so the badge doesn't break the 7-cards-on-one-screen layout at typical viewport widths.

Day view and the resource-columns board (M22-S06, this same TD's Story 0) are completely unaffected — this story only touches Week view's rendering path.

**Files to create/modify:**
- `apps/web/features/booking/schedule/useSchedule.ts` (modify — new week-range day-grid fan-out hook)
- `apps/web/features/booking/schedule/schedule-timeline-events.ts` (modify — `resourceName` on `BookingTimelineEvent`, extend `buildBookingTimelineEvent`)
- `apps/web/features/booking/schedule/schedule-timeline.ts` (modify — thread the booking-id→resourceName lookup through `buildAllTimelineEvents`)
- `apps/web/features/booking/components/dashboard/schedule/ScheduleTimelineEventRenderer.tsx` (modify — badge on booking blocks)
- `apps/web/features/booking/schedule/schedule-page-core-data.ts` / `schedule-page-timeline-derived.ts` (modify — wire the new week-range day-grid data into `weekTimelineCards`)
- `apps/web/features/booking/components/dashboard/schedule/ScheduleWeekView.tsx` (modify — spacing/height for the badge)

**Acceptance criteria — product:**
- [ ] Manager viewing Week view with 1+ resources checked sees a resource-name badge on each booking block belonging to a checked resource — same visual pattern already used for closure/opening blocks.
- [ ] Manager viewing Week view with zero resources checked sees no change (non-regression).
- [ ] Day view and the resource-columns board are unaffected.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `buildBookingTimelineEvent` resolves `resourceName` from the lookup the same way closure/opening events already do
  - [ ] A booking whose day-grid block has no resource match renders `resourceName: null` (unchanged default)
  - [ ] The week-range fan-out hook issues one query per visible day, gated on `resourceIds.length > 0`
- Integration: n/a — no `.integration.spec.ts` tier for `apps/web`
- Tenant isolation: n/a — client-side only
- E2E: manager checks a resource, switches to Semana, sees the resource-name badge on that resource's booking block in the corresponding day-card
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

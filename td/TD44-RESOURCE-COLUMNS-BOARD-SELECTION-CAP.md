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

## Story 0 — Decide and implement a practical bound on simultaneously-rendered resource columns ✅ Done

**Agent:** `frontend-ts`
**Complexity:** S
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/08-TESTING_STRATEGY.md`
**Dependencies:** none
**Pattern:** plain composition — a guard added to the existing `handleToggleResource` handler plus a `disabled` state on the existing checkbox list; no new component, no new pattern.

**Resolved design (locked in via `/story-discovery`, 2026-09-24):** a **hard cap of 6** simultaneously-checked resources, enforced at the source (the toggle handler), not downstream in the columns board — this was chosen over a soft-cap-with-warning or deferred/virtualized rendering specifically because it's the only option where the checked-set and the rendered-set can never diverge: no slicing logic, no second source of truth, no new rendering machinery in `ScheduleResourceColumnsBoard.tsx` at all (per CLAUDE.md §7's "mounting complexity" principle — the other two candidates each needed extra machinery this one doesn't).

- `handleToggleResource` (`apps/web/features/booking/schedule/schedule-page-interaction-handlers.ts`) gains a guard: attempting to **add** a 7th resource while 6 are already checked is a no-op (the set is returned unchanged). Unchecking (removing) an already-checked resource is always allowed, even while at the cap. Export the cap as a named constant (`RESOURCE_FILTER_MAX_SELECTED = 6`) from this file for `ResourceFilterMenu` to import directly — no prop-threading, consistent with how `SCHEDULE_BOOKING_STATUS_DEFAULT` is imported directly by its consumers elsewhere in this feature slice.
- `ResourceFilterMenu.tsx` imports `RESOURCE_FILTER_MAX_SELECTED` and: (a) disables the checkbox `<input>` for any not-yet-checked resource once `selectedResourceIdSet.size >= RESOURCE_FILTER_MAX_SELECTED` (checked resources stay enabled so they can still be unchecked), and (b) renders an inline message below the options list, visible only while at the cap, using the new `resourceFilterMaxReached` i18n key (interpolated with the cap number).
- No changes needed to `ScheduleResourceColumnsBoard.tsx` — since the checked set can never exceed 6, it never has more than 6 columns to render.

**New i18n keys (`packages/i18n/locales/{pt-BR,en}/web.json`, under `dashboard.schedule`, both locales in the same commit):** `resourceFilterMaxReached` — pt-BR: `"Limite de {max} recursos atingido. Desmarque um para adicionar outro."`; en: `"Limit of {max} resources reached. Uncheck one to add another."` Follows the existing `resourceFilter<Suffix>` naming convention already used in this same namespace.

**Files to create/modify:**
- `apps/web/features/booking/schedule/schedule-page-interaction-handlers.ts` (+ `.spec.ts`, already exists) (modify — cap guard in `handleToggleResource`, export `RESOURCE_FILTER_MAX_SELECTED`)
- `apps/web/features/booking/components/dashboard/schedule/ResourceFilterMenu.tsx` (+ `.spec.tsx`, already exists) (modify — disabled-checkbox state + cap message)
- `packages/i18n/locales/pt-BR/web.json` + `.../en/web.json` (modify — `resourceFilterMaxReached`)
- `apps/web/e2e/schedule-resource-columns.spec.ts` (modify — new scenario)

**Acceptance criteria — product:**
- [ ] A manager who has 6 resources checked cannot check a 7th — the remaining checkboxes are visibly disabled once the cap is reached.
- [ ] A manager at the cap sees an inline message explaining the limit (6) and that unchecking one frees up a slot.
- [ ] A manager at the cap can still uncheck any of the 6 currently-checked resources, and can then check a different one again (cap is a live ceiling, not a one-time lock).
- [ ] A manager with fewer than 6 checked sees no change from today (non-regression) — no message, no disabled checkboxes.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `handleToggleResource` is a no-op when attempting to add a 7th resource while 6 are already selected
  - [ ] `handleToggleResource` still allows removing a resource while at the cap
  - [ ] `handleToggleResource` behavior below the cap is unchanged (non-regression)
  - [ ] `ResourceFilterMenu` disables every unchecked checkbox once `selectedResourceIdSet.size === 6`, and renders the `resourceFilterMaxReached` message
  - [ ] `ResourceFilterMenu` renders no message and no disabled checkboxes when `selectedResourceIdSet.size < 6`
- Integration: n/a — no `.integration.spec.ts` tier for `apps/web`
- Tenant isolation: n/a — client-side only
- E2E: manager checks 6 resources, confirms a 7th checkbox is disabled and the cap message is visible, unchecks one, confirms a different resource can then be checked
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

---

## Story 1 — Week view: filter bookings to checked resources, with per-resource badges

**Agent:** `frontend-ts`
**Complexity:** M–L
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/08-TESTING_STRATEGY.md`
**Discovered:** Live observation during M22-S06 (PR #511) review/testing — Week view doesn't respect "Filtrar recurso" for bookings at all (only closures/openings do), unlike Day view's columns board, which both narrows to checked resources *and* makes resource identity visible. Refined through conversation from an initial badge-only idea (labels without filtering, rejected as insufficient) to this filtering-plus-badge design.
**Dependencies:** none blocking (M22-S06 already shipped); reuses M22-S06's existing day-grid-as-lookup and booking-id resolution technique (`schedule-resource-columns.ts`) rather than reinventing it.
**Pattern:** plain composition — reuses M22-S06's existing "day-grid as a `resourceId → booking-id` lookup" technique, applied across the 7 visible days instead of one; extends the existing closure/opening `resourceName` badge pattern (`ResourceNameBadge`) to bookings, generalized to a list (a bundled booking can be assigned to more than one resource); new week-range day-grid fan-out hook shaped like the existing per-resource fan-out (`useScheduleClosures`/`useScheduleOpenings`'s `useQueries` pattern), just fanned by day instead of by resource.
**New migration / i18n keys / env vars / feature flags:** none — confirmed via `/story-discovery` (2026-09-24) that `ResourceNameBadge` renders the raw resource name with no wrapping copy, so no new i18n key is needed.
**Prototype references:** none — no dedicated mock exists for this exact filtered+badge Week-view UI; the layout choice (merged timeline + badges, not columns or a resource×day grid) was resolved through direct conversation, cross-checked during `/story-discovery` against `dev-notes.md`'s "rejected intermediate idea" note from `M22-S06` (see the Description note below on why that rejection doesn't apply here).

**Description:**
Week view (`ScheduleWeekView`'s 7 day-cards) is unaffected by M22-S06: checking a resource in "Filtrar recurso" has zero effect on which bookings show — every booking for the week renders regardless, merged together, with no resource identity at all (`BookingTimelineEvent` carries no resource field today, unlike `ClosureTimelineEvent`/`OpeningTimelineEvent`, which already do). This is inconsistent with Day view, where checking a resource actually narrows what's shown (via columns) to that resource's own bookings.

A full columns-per-day-card layout was considered and ruled impractical (7 days × N resource-columns is too cramped) — and a resource-by-day grid (rows = resources, columns = days) was also considered and ruled unnecessary: the agreed resolution keeps Week view's existing merged day-card shape, and makes it behave consistently with Day view through **filtering + labeling** instead of a new layout:

- **Zero resources checked** → unchanged, today's exact behavior (non-regression) — every booking shows, merged, no badges. This is the same default as Day view: no resources checked means no filtering and no badges anywhere in the schedule.
- **One or more resources checked** → a booking shows in Week view **only if at least one of its assigned resources is checked** (the same narrowing rule Day view's columns already apply — just kept merged instead of split into separate columns, since Week view has no room for columns). Each shown booking gets a resource-name badge for **every one of its assigned resources that's checked** — plural, not singular: a bundled booking (`resourceRequirements.length > 1`, e.g. STAFF + EQUIPMENT both required, UC-051) assigned to two checked resources renders **once**, not duplicated, carrying both resource names.
- **Resolved via `/story-discovery` (2026-09-24):** for a bundled booking where only *some* of its assigned resources are checked (e.g. it needs Camila + a room, only Camila is checked), the badge shows **only the checked resource(s)** it's assigned to — never the unchecked one(s), consistent with "respect the filter."
- **Design precedent check, resolved via `/story-discovery` (2026-09-24):** `dev-notes.md`'s M22-S06 discovery record notes a *rejected* intermediate idea — badging bookings in the merged timeline instead of building a columns board — rejected because it needed new backend plumbing (`StaffBookingCardResponse` had no resource field). This story's badge mechanism is materially different: it derives resource identity purely client-side from the already-shipped `GET /schedule/day-grid` response (no backend/DTO change at all), which is exactly the gap that killed the earlier idea. Confirmed with the user as a deliberately distinct case, not a re-litigation of that rejection. `dev-notes.md` and `plan/journey/staff/horarios.md` are updated in this same discovery session to record both the earlier rejection's scope (Day view, pre-day-grid) and this story's different resolution.
- **Related caveat, not this story's own scope to fix:** the per-day booking membership test uses the day-grid response the same way TD43 describes — a booking whose buffer-extended occupancy crosses midnight could be membership-tested against the wrong day for the same reason TD43 documents. Don't silently re-fix TD43's scope inside this story; note the shared root cause if it comes up during implementation.

**Files to create/modify:**
- `apps/web/features/booking/schedule/useSchedule.ts` (modify — new week-range day-grid fan-out hook)
- `apps/web/features/booking/schedule/schedule-timeline-events.ts` (modify — `resourceNames: readonly string[]` on `BookingTimelineEvent`; `buildBookingTimelineEvent` accepts a booking-id → resource-names lookup)
- `apps/web/features/booking/schedule/schedule-timeline.ts` (modify — filter which bookings reach `buildAllTimelineEvents` per day based on checked-resource membership, thread the booking-id→resourceNames lookup through; export `buildAllTimelineEvents` if the new filtering needs to call it directly rather than only through the existing pipeline)
- `apps/web/features/booking/components/dashboard/schedule/ScheduleTimelineEventRenderer.tsx` (modify — render one `<ResourceNameBadge>` per name in `event.resourceNames` on booking blocks)
- `apps/web/features/booking/schedule/schedule-page-core-data.ts` / `schedule-page-timeline-derived.ts` / `schedule-page-query-data.ts` (modify — wire the new week-range day-grid fetch + filtering/badging into `weekTimelineCards`)
- `apps/web/features/booking/schedule/useSchedule.ts` (modify — new `useScheduleWeekDayGrid` fan-out hook)
- `apps/web/features/booking/schedule/schedule-week-resource-bookings.ts` (new — `buildWeekBookingResourceIds`/`isBookingVisibleForResourceFilter`, the week-range day-grid-as-lookup + filtering-rule module)
- `apps/web/features/booking/schedule/schedule-timeline-formatting.ts` (new — `getClosureReasonLabel`/`normalizeScheduleStatuses`/`buildScheduleReturnTo`, split out of `schedule-timeline.ts` purely to stay under the 250-line file cap once this story's resource-filter fields landed there; re-exported from `schedule-timeline.ts` so no consumer import changes)
- **Correction, found during implementation (2026-09-24):** `ScheduleMainView.tsx`/`ScheduleWeekView.tsx` need **no changes** — filtering and badging happen entirely in the data layer (`schedule-page-timeline-derived.ts`, before `weekTimelineCards` is even computed), so the pre-filtered/badged events simply flow through the existing `weekTimelineCards` prop unchanged, the same way closure/opening badges already do today. The story-discovery finding that `ScheduleMainView.tsx` needed a wiring-gap fix was based on an incorrect assumption (that Week view would need the raw `selectedResourceIdSet`/`resourceNameById` props the way the Day-view columns board does) — it doesn't, since it never builds its own columns.
- `apps/web/e2e/schedule-resource-columns.spec.ts` (modify — add the new Week-view scenarios below; fix the existing comment/assertion stating "Week view stays completely untouched by this feature," which becomes false once this story ships)

**Acceptance criteria — product:**
- [ ] Manager viewing Week view with zero resources checked sees no change from today (non-regression) — same default as Day view.
- [ ] Manager viewing Week view with 1+ resources checked sees only bookings assigned to at least one checked resource — bookings with no checked resource assigned no longer appear.
- [ ] Each shown booking is labeled with a resource-name badge for each of its checked resources — same visual pattern already used for closure/opening blocks, extended to support more than one name per block.
- [ ] A booking assigned to two checked resources (bundle), both checked, renders once, with both names, not duplicated.
- [ ] A booking assigned to two resources where only one is checked renders with a badge for the checked resource only — the unchecked one's name never appears.
- [ ] Unchecking the last checked resource reverts Week view to today's exact unfiltered, unbadged behavior.
- [ ] Day view and the resource-columns board (Story 0) are unaffected.

**Acceptance criteria — technical:**
- Unit:
  - [ ] A booking with no checked-resource assignment is excluded from the built week timeline events when 1+ resources are checked
  - [ ] A booking assigned to exactly one checked resource renders with one badge
  - [ ] A booking assigned to two checked resources renders once, with two badge names, not two events
  - [ ] A booking assigned to two resources where only one is checked renders with exactly one badge (the checked one)
  - [ ] Zero checked resources → filtering is a no-op, identical output to today
  - [ ] The week-range fan-out hook issues one query per visible day, gated on `resourceIds.length > 0`
  - [ ] `ScheduleMainView` forwards `weekTimelineCards` to `ScheduleWeekView` unchanged, verifying the filtering/badging happened upstream rather than requiring any new prop on either component
- Integration: n/a — no `.integration.spec.ts` tier for `apps/web`
- Tenant isolation: n/a — client-side only
- E2E (extends `apps/web/e2e/schedule-resource-columns.spec.ts`, all in Week view unless noted):
  - [ ] Zero resources checked → Week view renders exactly as today (non-regression baseline)
  - [ ] Manager checks one resource → a booking belonging to a different (unchecked) resource disappears; the checked resource's own booking shows with its badge
  - [ ] Manager checks both resources a bundled booking is assigned to → the booking renders once, with both resource-name badges, not twice
  - [ ] Manager checks only one of a bundled booking's two assigned resources → the booking still shows (≥1 assigned resource checked) but with a badge for only the checked resource
  - [ ] Manager unchecks the checked resource(s) → Week view reverts to the unfiltered, unbadged baseline; a previously-hidden booking reappears
  - [ ] Day view's columns board (Story 0) and STAFF's unfiltered view are unaffected by any of the above (non-regression)
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

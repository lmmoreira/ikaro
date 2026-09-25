# TD44 — No Upper Bound on Simultaneously-Rendered Resource Columns

## Status
- **Type**: Technical Debt / Performance & UX
- **Priority**: Low — requires a manager to deliberately check many resources at once; no observed production incident, but nothing today prevents it
- **Context**: `apps/web/features/booking/components/dashboard/schedule/ResourceFilterMenu.tsx`, `ScheduleResourceColumnsBoard.tsx` (M22-S06)
- **Created**: 2026-09-24
- **Discovered**: Codex round-4 review of PR #511 (M22-S06, manager bounded multi-resource column view)
- **State**: In progress — Story 0/Story 1 ✅ Done; Story 2 (compact resource-badge row) `/story-discovery` complete 2026-09-25, READY for implementation; Story 3 (shared hour axis) drafted 2026-09-25, `/story-discovery` not yet run
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

## Story 1 — Week view: filter bookings to checked resources, with per-resource badges ✅ Done

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

---

## Story 2 — Week view: compact resource-badge row (STAFF>ROOM>EQUIPMENT priority, +N overflow)

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/08-TESTING_STRATEGY.md`
**Discovered:** User conversation following TD44-S1's merge (2026-09-25) — TD44-S1 itself flagged a real, unverified risk in its own implementation notes: Week view's compact day-cards position booking blocks with a fixed height computed from duration, not content, so a short booking carrying 2+ resource badges (rendered via `flex-wrap` in the trailing row) could wrap past the block's height and clip under `overflow-hidden`.
**Dependencies:** TD44-S1 (done) — this story only reshapes how `BookingTimelineEvent.resourceNames` is *ordered* and *rendered*, not the filtering logic itself.
**Pattern:** plain composition — extends the existing sort step in `buildBookingResourceNamesById` (schedule-page-timeline-derived.ts) with a type-priority comparator; the new divider+resource line is composed entirely inside `renderBookingTimelineEvent`'s own `footer` value (`ScheduleTimelineEventRenderer.tsx`) — no shared-component API change, since `TimelineBlockShell`'s `footer` slot is only consumed by booking blocks today (closures/openings use `subtitle` for their own time text, not `footer`).

**Description:**
Today, a booking matching 2+ checked resources renders one `<ResourceNameBadge>` per matched resource, wrapped inline next to the status badge in the trailing row — unbounded height growth as match count grows. This story replaces that with a fixed-shape addition: the block's existing content (title = contact name, subtitle = services, status badge in the trailing row) stays exactly as it renders today; a new line is added right after it, separated by a subtle divider, showing:
- **Zero matched resources** (today's default, or filter inactive) → no divider, no new line — identical to today.
- **Exactly one matched resource** → divider + that resource's name, no count suffix.
- **Two or more matched resources** → divider + **one** resource's name, chosen by type priority **STAFF > ROOM > EQUIPMENT** (alphabetical tiebreak within the same type — unchanged from today's sort, just type-prioritized first), followed by a `+N` suffix where `N` is the count of *remaining* matched resources not shown (e.g. 3 total → "Camila +2"). LOCATION-type resources never reach this code path — `useSelectableResources` already excludes them from the resource filter entirely.

This guarantees the block's height grows by exactly one fixed line regardless of how many resources matched, closing TD44-S1's own flagged overflow risk by design rather than by (already-verified-sufficient, but visually untested) `flex-wrap`.

**Resolved via `/story-discovery` (2026-09-25) — final vertical layout, both views:**
```
[icon] Contact name              [Status badge]
       Services subtitle
       - - - - - - - - - - - - -
       Camila +2
       14:00 - 14:30
```
Order top to bottom: title/subtitle + status badge (unchanged today's row) → divider → resource-summary line → time-range line (the existing `footer` content, today the only thing in `footer`, now pushed below the new line rather than staying first). The user's own words resolving this: "I am proposing to have after that a --- and then the resource line" — placed directly after the title/subtitle/status content, with the time range moved to the very bottom. Implementation-wise, `renderBookingTimelineEvent`'s `footer` value becomes a small `flex-col` wrapping (in order) the divider+resource-summary block and the existing time-range `<div>`, not a change to `TimelineBlockShell` itself.

**Test id and accessibility (resolved via `/story-discovery`, 2026-09-25):** the resource-summary line renders as plain text (same visual weight as the time-range line, not a `Badge`/pill — `ResourceNameBadge` is not reused here), with `data-testid="timeline-block-resource-summary"` on its container (`timeline-block-resource-name` stays reserved for openings/closures, untouched by this story). The container also carries an `aria-label` listing **every** matched resource name (not just the visible primary one) joined together — e.g. `aria-label="Camila, Sala 2, Secador"` for a 3-match case rendering "Camila +2" — so assistive tech gets the full set even though only one name + count is visible. This needs a translated join separator or connector word; if the visible text itself needs no i18n key (per Story 1's precedent — raw names, no wrapping copy), the `aria-label`'s join is still just a plain-comma join with no wrapping copy either, so still no new i18n key.

**Type-priority plumbing (new):** `resourceNames` currently carries only display names (`readonly string[]`), sorted alphabetically in `buildBookingResourceNamesById`. Resource *type* isn't threaded anywhere in this pipeline today — `useReconciledSelectedResourceIds` (`schedule-page-core-data.ts`) already has the full `ResourceResponse` list (`type` field included) when it builds `resourceNameById`; add a sibling `resourceTypeById: ReadonlyMap<string, ResourceType>` built from the same `resources` array, thread it through `useScheduleTimelineDerived`'s input the same way `resourceNameById` already flows.

**File-cap risk (flagged during `/story-discovery`, 2026-09-25):** `schedule-page-timeline-derived.ts` is 236/250 lines and `schedule-page-core-data.ts` is 229/250 lines **before** this story's additions — both already near the CLAUDE.md §7 250-line file cap, the same class of pressure that forced TD44-S1's `schedule-timeline-formatting.ts` extraction. Don't thread the type-rank comparator logic inline into `buildBookingResourceNamesById` in `schedule-page-timeline-derived.ts` — extract it into a new small pure module, e.g. `schedule-resource-priority.ts` (`resourceTypeRank(type: ResourceType): number` returning `STAFF → 0, ROOM → 1, EQUIPMENT → 2`, and/or a full comparator function taking `resourceTypeById`), imported by `buildBookingResourceNamesById` instead of defined there. `resourceNames` itself stays `readonly string[]` — priority is baked into its order, so the renderer only ever needs `resourceNames[0]` and `resourceNames.length`.

**Journey-doc sync (added during `/story-discovery`, 2026-09-25):** `plan/journey/staff/horarios.md` (the "TD44 addition" section) and `plan/journey/staff/prototypes/horarios/dev-notes.md` (the same section) both currently describe the per-resource `ResourceNameBadge` visual TD44-S1 shipped and this story replaces. Update both to describe the new primary-name+`+N` line instead, in the same commit as the code change — a factual sync of an already-existing journey entry, so per CLAUDE.md §15 this needs only the normal doc-gate yes, not a `/docs-audit` baseline.

**Files to create/modify:**
- `apps/web/features/booking/schedule/schedule-page-core-data.ts` (+ `.spec.tsx`) (modify — new `resourceTypeById` lookup, sibling to the existing `resourceNameById`)
- `apps/web/features/booking/schedule/schedule-resource-priority.ts` (+ `.spec.ts`) (new — type-rank comparator, extracted up front to keep `schedule-page-timeline-derived.ts` under the file cap)
- `apps/web/features/booking/schedule/schedule-page-timeline-derived.ts` (+ `.spec.tsx`) (modify — thread `resourceTypeById` through; `buildBookingResourceNamesById` imports and uses the new comparator)
- `apps/web/features/booking/components/dashboard/schedule/ScheduleTimelineEventRenderer.tsx` (+ `.spec.tsx`) (modify — replace the `resourceNames.map(...)` multi-badge trailing row with a single primary-name + `+N` line inside `footer`, above the existing time-range line, below a subtle divider; `data-testid="timeline-block-resource-summary"` + `aria-label` listing all matched names)
- `apps/web/e2e/schedule-resource-columns.spec.ts` (modify — **rewrite**, not just extend, the two existing "Week view resource filter/badges" bundled-booking scenarios from TD44-S1, since they currently assert 2 separate named badges; they must assert the new primary+"+N" shape instead, via `timeline-block-resource-summary`)
- `plan/journey/staff/horarios.md` (modify — factual sync, TD44 addition section)
- `plan/journey/staff/prototypes/horarios/dev-notes.md` (modify — factual sync, TD44 addition section)

**Acceptance criteria — product (superseded by Round 3's "always show" — see below for the current, correct text):**
- [ ] A booking with 0 assigned resources renders identically to today — no divider, no new line.
- [ ] A booking with exactly 1 assigned resource shows a divider + that resource's name, no `+N`, **regardless of `ResourceFilterMenu` check state** (Round 3 — the summary line is sourced from `booking.assignedResources`, not from which resources happen to be checked).
- [ ] A booking with 2+ assigned resources shows a divider + the type-prioritized name (STAFF over ROOM over EQUIPMENT) + `+N` (N = remaining count, not total), **regardless of check state**.
- [ ] Two same-type assigned resources tiebreak alphabetically (unchanged behavior, now type-scoped).
- [ ] A booking block's total height never varies with assigned-resource count — always exactly one additional line when 1+ resources are assigned.
- [ ] The resource-summary line renders directly below the title/subtitle/status row, and the time-range line renders below the resource-summary line (not above it) — final order: title/subtitle+status → divider → resource line → time range.
- [ ] A screen reader announces every assigned resource name via the enclosing booking block's own accessible name (composed into the block `Link`'s `ariaLabel`, Round 3 take 3 — not an `aria-label` on the inner summary line itself, which is plain `aria-hidden="true"` presentational text), not just the visible primary name.
- [ ] Whether a booking is *visible at all* in Week view still depends on checked-resource state, unchanged from Story 1 (`isBookingVisibleForResourceFilter`) — only the summary line's content stopped being filter-dependent. Day view (merged timeline + resource-columns board) always showed every visible booking regardless of check state already, so this line applies to Week view specifically.

**Acceptance criteria — technical (superseded by Round 3 — `resourceTypeById`/`bookingResourceNamesById`-as-name-lookup were removed as dead code; kept for history, see Round 3 note below for the current shape):**
- Unit:
  - [ ] `compareResourceAssignmentsByTypePriority` (in `schedule-resource-priority.ts`) orders STAFF before ROOM before EQUIPMENT, alphabetical within the same type, operating on `{resourceType, resourceName}` pairs directly (no `resourceTypeById` map — removed in Round 3)
  - [ ] `resourceNames.length === 0` → renderer adds no divider/line (non-regression)
  - [ ] `resourceNames.length === 1` → renderer shows the name with no `+N`
  - [ ] `resourceNames.length === 3` → renderer shows `resourceNames[0]` + `+2`, and the enclosing `Link`'s `ariaLabel` lists all 3 names plus the contact name
  - [ ] `buildBookingTimelineEvent` derives `resourceNames` from `booking.assignedResources` (type-prioritized), independent of any checked-resource state, and defaults to `[]` when `assignedResources` is absent (BFF/backend rollback safety)
- Integration: n/a for the frontend tier — no `.integration.spec.ts` tier for `apps/web`; backend integration coverage for `findResourceAssignmentsByBookingId` lives in the standard backend integration suite (Round 3)
- Tenant isolation: Round 3's backend query filters `blra.tenantId = :tenantId` — verified alongside the existing `findAllByTenantPaginated` tenant-isolation coverage
- E2E: rewrite TD44-S1's two bundled-booking Week-view scenarios (both-checked, partial-checked) to assert the new primary+`+N` shape via `timeline-block-resource-summary`, always visible regardless of check state, instead of per-resource badges; add one scenario for 3 matched resources asserting `+2`; add a Day-view scenario confirming the summary line renders there too (Round 3)
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

**Round 2 scope expansion (bot review + live manual testing, 2026-09-25):** Codex/CodeRabbit round 2 found 2 Critical findings on the initial implementation:
1. `aria-label` was set on a plain `<div>` (implicit ARIA role `generic`, naming-prohibited per WAI-ARIA) — the full matched-resource list was never actually exposed to assistive tech despite the attribute being present. Fixed with `role="group"` on `BookingResourceSummaryLine`'s container; tests updated to assert the computed accessible name (`toHaveAccessibleName`) instead of the raw attribute.
2. The new footer content (divider + resource-summary line + time-range) could be clipped under `TimelineBlockShell`'s `overflow-hidden` for short bookings — confirmed live by the user testing a real 30-minute booking in Week view, where the line rendered with correct content/aria-label but was invisible due to the block's fixed, duration-only height.

Live testing also surfaced that this wasn't Week-view-specific or Story-2-specific: Day view's blocks (single timeline and resource-columns board) were already tight for their existing 3-line content (title/subtitle/time-range) before this story, at the same bare `18`px `getSlotHeight` floor. **Resolved with the user directly (not `/story-discovery` — a live design call during bot-review triage):** rather than a narrow fix scoped only to blocks showing a resource line, establish one shared content-driven minimum block height as a pattern across every board — Day view's single timeline, Day view's resource-columns board, and Week view's day-cards all now pass an explicit `minSlotHeightPx` into `getSlotHeight` (new 3rd param, still defaults to the old bare `18` for any caller that omits it) instead of relying on the old blanket floor. Two named constants in `schedule-timeline-formatting.ts`, sized for the worst case (4 content lines with headroom, not just the common 3-line case) so a board's row height stays uniform regardless of which bookings happen to have a resource match: `DESKTOP_MIN_BLOCK_HEIGHT_PX = 108` (Day view, both boards) and `COMPACT_MIN_BLOCK_HEIGHT_PX = 96` (Week view). Files: `schedule-timeline-formatting.ts` (+spec via `schedule-timeline.spec.ts`), `schedule-timeline.ts` (new `minSlotHeightPx` field on `TimelineLayoutInput`), `schedule-page-timeline-derived.ts` (+spec), `schedule-resource-columns.ts` (+spec).

**Round 3 scope expansion — "always show," a resolved sr-only + role="group" combo tripped SonarCloud S6819, and the resulting backend feature (user conversation + Codex round 2, 2026-09-25):**

1. **Accessibility, take 3.** Round 2's `role="group"` + `aria-label` fix (above) passed WAI-ARIA correctness and its own tests, but a fresh SonarCloud scan on the pushed commit flagged S6819 ("use `<details>`/`<fieldset>`/`<optgroup>`/`<address>` instead of `role=group`") — none of which fit a plain summary line. An intermediate sr-only-text-node attempt (no ARIA role at all) was tried next and also failed: a plain `<div>`'s implicit `generic` role structurally prohibits any computed accessible name regardless of content, so the sr-only text was real, reachable DOM content but never became *this element's own* accessible name — moot anyway once traced further: the whole booking block is a single `<Link>` whose own `ariaLabel={contactName}` already overrides every nested element's name for a screen reader tabbing through the page, so a static inner div's own "name" was never reachable through normal navigation in the first place. **Final fix:** `BookingResourceSummaryLine` reverts to a plain, fully presentational `aria-hidden="true"` div (no role, no sr-only span); `renderBookingTimelineEvent` (`ScheduleTimelineEventRenderer.tsx`) composes the full matched-resource list straight into the link's own `ariaLabel` (`"${contactName}, ${resourceNames.join(', ')}"` when 1+ resources matched, else just `contactName`) — the correct place per WAI-ARIA (the link is the actual focusable/announced unit) and it needs no special role at all, so SonarCloud has nothing to flag.

2. **"Always show it, not just when a resource is checked" (live user testing, 2026-09-25).** The user asked for resource identity to show on every booking with an assignment, in **both** Day and Week view, regardless of `ResourceFilterMenu` check state — a real behavior change beyond this story's original "reshape how checked-resource badges render" scope. Investigated and resolved directly with the user (not a formal `/story-discovery` — this ran inside the same live PR-review conversation): the *filtering* mechanism (`isBookingVisibleForResourceFilter`, checked-resource-only, Week-view-only) was deliberately left untouched, but *badge naming* needed a real architectural change, because the old day-grid-based lookup (`bookingResourceIdsById`) only ever fetched names for **checked** resources — there was no client-side way to always know a booking's full resource assignment without a backend change. Considered and rejected: fetching `GET /schedule/day-grid` for every active resource regardless of check state (defeats TD44 Story 0's whole reason for existing — capping simultaneous resource fetches to avoid an unbounded per-resource fetch storm on a large tenant).
   - **Backend:** `StaffBookingCardResponse` (and the backend's own `ListBookingsUseCase`/`BookingListItem`) gains `assignedResources: { resourceId, resourceType, resourceName }[]`, sourced from `booking_line_resource_assignments` (the immutable per-line audit record, not the short-lived `resource_occupancy` locking table) joined through `booking_lines`, batched once per page (`TypeOrmBookingRepository.findResourceAssignmentsByBookingId`, mirroring the existing `findLinesByBookingId` batching pattern — never one query per booking). New files: `typeorm-booking-resource-assignments.helpers.ts` (+spec) for the row-grouping/dedup logic, extracted to stay under the file/function-length caps.
   - **BFF:** `bookings.types.ts`/`bookings.mapper.ts` thread the new field straight through (`toStaffBookingCard`).
   - **Frontend:** `BookingTimelineEvent.resourceNames` now derives directly from `booking.assignedResources` (type-prioritized) *inside* `buildBookingTimelineEvent`, independent of any checked-resource state — this makes the badge appear in Day view's merged timeline and resource-columns board for free (both boards already funnel through the same function). This also **retires** the round-1/round-2 `bookingResourceNamesById`-as-name-lookup machinery entirely: `buildBookingResourceNamesById`/`useBookingResourceNamesById`/`resourceTypeById` (added earlier in this same story) are removed from `schedule-page-core-data.ts`/`schedule-page-timeline-derived.ts` as dead code now that naming doesn't need a resourceId→name conversion step at all. `compareResourceIdsByTypePriority` is replaced by `compareResourceAssignmentsByTypePriority`, which sorts `{resourceType, resourceName}` objects directly (no resourceId-keyed map needed, since each assignment already carries its own name+type). The `bookingResourceIdsById`/`bookingResourceNamesById` map itself survives, narrowed to exactly what it's actually used for now: `isBookingVisibleForResourceFilter`'s `.has(bookingId)` presence check — its value type stays `readonly string[]` for minimal diff, but the values are raw resourceIds again, not converted names.

---

## Story 3 — Shared hour axis across resource columns and week day-cards, opt-out for exceptional openings

**Agent:** `frontend-ts`
**Complexity:** L
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/08-TESTING_STRATEGY.md`
**Discovered:** User conversation following TD44-S1's merge (2026-09-25) — both `ScheduleResourceColumnsBoard` (Day view, one column per checked resource) and `ScheduleWeekView` (7 day-cards) render a full, independent hour-axis ruler per column/card via `ScheduleTimelineBoard`'s `slotLabels`/`compactLabelIndexes`, repeating the same visual information across every column/card and consuming horizontal space that scales with however many are checked/visible.
**Dependencies:** none blocking (TD44-S0/S1 done); touches the same `ScheduleTimelineBoard`/`ScheduleResourceColumnsBoard`/`ScheduleWeekView` files Story 0/1/TD43 already modified — verify no conflicting in-flight change before starting.
**Pattern:** plain composition, but a structurally larger change than Story 1/2 — a new "resolve shared timeline window across visible members" step runs once at the board level (`ScheduleResourceColumnsBoard.tsx` for Day view, the Week-view derivation in `schedule-page-timeline-derived.ts`), before per-column/per-card rendering; `ScheduleTimelineBoard` gains a way to render with an externally-supplied axis range instead of always deriving its own.

**Description:**
**Corrected understanding vs. the original conversation:** `Resource.workingHours` exists as a field and is consumed by the *backend's* availability computation (`availability.service.ts`), but is **not** currently wired into the frontend's Day-view columns timeline at all — every column in `ScheduleResourceColumnsBoard` is rendered for the same single selected date with the same tenant-wide `businessHours`, so today the *only* thing that can make one Day-view column's active window differ from another's is a resource-scoped `ScheduleOpening` (an exceptional opening) for that specific resource on that date. For Week view, the primary source of legitimate per-day-card variation is **per-weekday regular business hours** (`TenantBusinessHours` can differ per day of week, e.g. Saturday closes earlier) — not an exception, just normal variation — plus the same resource/tenant-wide exceptional-opening case layered on top for a given day.

**Resolved design (from conversation, including the "manager opens an exceptional 2am slot" edge case):**
- Compute a **shared hour axis** as the union (widest start-to-end) across every currently-visible column's (Day view) or day-card's (Week view) *regular-hours-driven* window only.
- A column/day-card whose active window is currently **overridden by an exceptional opening** (tenant-wide or resource-scoped) **opts out** of the shared axis entirely and keeps rendering exactly as it does today — its own full independent ruler, own coordinate space. No new UI for this case; it's simply excluded from the union and from label-sharing.
- Every column/day-card that *does* join the shared group renders its blocks positioned against the **shared** range (not its own individually-resolved one), so a shared 09:00 gridline means the same thing in every shared member.
- The hour-label column itself renders **once** for the shared group (its first member); every other shared member renders only its grid-lines, no repeated labels. Opt-out members keep their own full label column, wherever they sit in the layout.
- This naturally handles the 2am-exceptional-opening case: that one column/day-card is excluded from the union (so it doesn't force every other column/card to stretch to cover 02:00–18:00+), and keeps its own separate, correctly-scaled ruler.

**New field:** `ActiveTimelineHours` (`schedule-timeline-window.ts`) gains `readonly isOverriddenByOpening: boolean` — true when `resolveActiveWindow` picked its window from `dayOpenings` (tenant-wide or resource-scoped), false when it fell back to `regularHours`. This is the exact signal the opt-out check needs; no new business logic to derive it; `resolveActiveWindow` already knows which branch it took.

**New "resolve shared window" step:** a pure function, e.g. `resolveSharedTimelineWindow(members: readonly ActiveTimelineHours[])`, partitioning into shared/opt-out groups and returning `{ sharedStartMinutes, sharedEndMinutes, sharedMemberIndexes }` (or equivalent) — called once by `ScheduleResourceColumnsBoard.tsx` (over its checked resources' resolved hours) and once by the Week-view derivation in `schedule-page-timeline-derived.ts` (over its 7 days). Feed the resolved shared range into `buildTimelineEvents`/`buildBlockStyle` for shared members in place of their own `timelineStartMinutes`/`timelineEndMinutes` — their own events/closures/openings are unaffected, only the coordinate space they're positioned against changes.

**Flag for `/story-discovery`, not resolved here — this is a genuinely large change, evaluate before committing:** this touches the core positioning math (`buildBlockStyle`, `TimelineCompactBoard`, `TimelineDesktopBoard`) shared by every existing timeline rendering path in this codebase (Day view single-timeline, Day view columns, Week view). Before implementing, re-validate this is worth the added machinery relative to a simpler alternative that achieves most of the same space saving with far less risk — e.g. just narrowing the repeated hour-label column's width (or hiding it on columns/cards past the first without touching any positioning math) rather than actually unifying coordinate spaces. Per CLAUDE.md §7's "mounting complexity" principle: if the simpler option gets most of the visual win with none of this story's cross-column-alignment risk, it may be the better call. Bring both options to the user explicitly rather than assuming the union approach is final.

**Files likely touched (confirm exact list during `/story-discovery`):**
- `apps/web/features/booking/schedule/schedule-timeline-window.ts` (+ `.spec.ts`) (modify — `isOverriddenByOpening` field)
- `apps/web/features/booking/schedule/schedule-timeline.ts` (+ `.spec.ts`) (modify — accept an optional externally-supplied shared range)
- New pure module, e.g. `schedule-shared-timeline-window.ts` (+ `.spec.ts`) (new — `resolveSharedTimelineWindow`)
- `apps/web/features/booking/schedule/schedule-resource-columns.ts` (+ `.spec.ts`) (modify — resolve + apply the shared window across checked resources)
- `apps/web/features/booking/components/dashboard/schedule/ScheduleResourceColumnsBoard.tsx` (+ `.spec.tsx`) (modify — render one shared label column instead of one per resource)
- `apps/web/features/booking/schedule/schedule-page-timeline-derived.ts` (+ `.spec.tsx`) (modify — resolve + apply the shared window across the 7 visible days)
- `apps/web/features/booking/components/dashboard/schedule/ScheduleWeekView.tsx` (+ `.spec.tsx`) (modify — render one shared label column instead of one per day-card)
- `apps/web/features/booking/components/dashboard/schedule/ScheduleTimelineBoard.tsx` (+ `.spec.tsx`) (modify — support rendering against an externally-supplied range, with/without its own label column)
- `apps/web/e2e/schedule-resource-columns.spec.ts` / `schedule.spec.ts` (modify — assert single shared ruler in the common case, independent ruler retained for the exceptional-opening case)

**Acceptance criteria — product:**
- [ ] Day view, 2+ checked resources, all on regular hours → one shared hour ruler, not one per column.
- [ ] Week view, a normal week (no exceptional openings) → one shared hour ruler, not one per day-card.
- [ ] A resource/day with an exceptional opening (including a wildly-outside-normal-hours one, e.g. 2am) keeps its own independent ruler and doesn't force the shared ruler to stretch to cover it.
- [ ] Every block's vertical position still correctly reflects its real time, in both the shared-axis members and the opt-out member(s).
- [ ] Non-regression: a single checked resource (Day view) or a week with only one day having any events renders sensibly (shared-group-of-one collapses to today's exact single-ruler look).

**Acceptance criteria — technical:**
- Unit:
  - [ ] `resolveActiveWindow` sets `isOverriddenByOpening: true` when driven by a tenant-wide or resource-scoped opening, `false` when driven by regular hours
  - [ ] `resolveSharedTimelineWindow` unions only the non-overridden members' ranges, excluding overridden ones entirely from the union
  - [ ] A member with `isOverriddenByOpening: true` renders positioned against its own range, unaffected by the shared range
  - [ ] A shared-group member's blocks position correctly against the shared (not its own individual) range
- Integration: n/a — no `.integration.spec.ts` tier for `apps/web`
- Tenant isolation: n/a — client-side only
- E2E: Day view with 2 resources on regular hours shows one ruler; add a resource with an exceptional opening and confirm it keeps its own separate ruler while the other two still share one
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

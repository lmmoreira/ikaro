# Dev Notes — STAFF: Horários (Schedule & Closure Management)

## Overview

Dashboard section for managing the weekly schedule of approved bookings and controlling schedule closures/openings. Fully shipped (`M13-S21`, ✅ Done). Updated 2026-07-31 — this file previously described the journey as unbuilt and cited pre-domain-slice paths (`apps/web/components/schedule/**`); the real components live under the domain-slice tree.

## File map (all ✅ shipped)

| File | Status |
|---|---|
| `apps/web/app/dashboard/schedule/page.tsx` | ✅ Exists |
| `apps/web/features/booking/components/dashboard/schedule/SchedulePage.tsx` | ✅ Exists |
| `apps/web/features/booking/components/dashboard/schedule/ClosureFormSheet.tsx` | ✅ Exists |
| `apps/web/features/booking/components/dashboard/schedule/RemoveClosureDialog.tsx` | ✅ Exists |
| `apps/web/features/booking/components/dashboard/schedule/OpeningFormSheet.tsx` | ✅ Exists |
| `apps/web/features/booking/components/dashboard/schedule/RemoveOpeningDialog.tsx` | ✅ Exists |
| `apps/web/features/booking/components/dashboard/schedule/ScheduleDateTimeRangeSheet.tsx` | ✅ Exists — shared date/time-range sub-form, not mentioned in the original draft |
| `apps/web/features/booking/components/dashboard/schedule/ScheduleRemovalDialog.tsx` + `ScheduleRemovalSummary.tsx` | ✅ Exists — shared removal-confirmation building blocks used by both `RemoveClosureDialog` and `RemoveOpeningDialog`, not mentioned in the original draft |
| `apps/bff/http/schedule/*.http` | ✅ Exists |

## BFF calls (all verified — endpoints implemented)

```
GET /v1/schedule/closures?from=YYYY-MM-DD&to=YYYY-MM-DD
  Header: Authorization: Bearer {jwt}
  Response: { closures: ScheduleClosure[] }

POST /v1/schedule/closures
  Header: Authorization: Bearer {jwt}
  Body: { date: string, reason: 'STAFF_DAY_OFF'|'MAINTENANCE'|'HOLIDAY', startTime?: string, endTime?: string, notes?: string }
  Response 201: ScheduleClosure
  Response 409: { type: 'ClosureConflict', message: string }
  Response 422: { type: 'PastDateError', message: string }

DELETE /v1/schedule/closures/:id → 204

GET /v1/schedule/openings?from=YYYY-MM-DD&to=YYYY-MM-DD
  Header: Authorization: Bearer {jwt}
  Response: { openings: ScheduleOpening[] }

POST /v1/schedule/openings
  Header: Authorization: Bearer {jwt}
  Body: { date: string, startTime: string, endTime: string, notes?: string }
  Response 201: ScheduleOpening
  Response 409: { type: 'OpeningConflict' }
  Response 422: { type: 'PastDateError' | 'DayAlreadyOpenError' }

DELETE /v1/schedule/openings/:id → 204

GET /v1/bookings?status=APPROVED&from=YYYY-MM-DD&to=YYYY-MM-DD
  Header: Authorization: Bearer {jwt}
  Response: paginated BookingListItem[]
```

## Screen: SchedulePage (`/dashboard/schedule`)

**File:** `apps/web/app/dashboard/schedule/page.tsx` + `apps/web/features/booking/components/dashboard/schedule/SchedulePage.tsx` (✅ Exists)

**Type:** Server page — prefetches the current week's closures, openings, and approved bookings; passes to the client component.

**Week range:** Monday–Sunday of the currently selected week (default: current week).

## Component: SchedulePage (client)

**File:** `apps/web/features/booking/components/dashboard/schedule/SchedulePage.tsx` (✅ Exists — real component name; an earlier draft called this `ScheduleView`)

**Client component** (`'use client'`) — handles selected day state and sheet open/close.

**Props:**
```ts
interface ScheduleViewProps {
  readonly initialClosures: ScheduleClosure[];
  readonly initialOpenings: ScheduleOpening[];
  readonly initialBookings: BookingListItem[];
  readonly businessHours: BusinessHours;   // from tenants.settings.business_hours
  readonly tenantSlug: string;
}
```

**State:**
```ts
type ScheduleState = {
  startOfWeek: Date;                         // Mon of selected week; defaults to current week
  selectedDate: Date;                        // day selected within the strip; defaults to today
  closureSheet: 'closed' | 'open' | 'submitting' | 'conflict' | 'warning';
  openingSheet: 'closed' | 'open' | 'submitting' | 'conflict';
  removeClosureTarget: ScheduleClosure | null;
  removeOpeningTarget: ScheduleOpening | null;
}
```

**Week navigation:** `startOfWeek` drives the `from`/`to` query params on all BFF calls and the `WeekNav` component (prev/next arrows). Advancing a week = `startOfWeek + 7 days`. The time grid re-fetches when `startOfWeek` changes.

**Time grid:**
- Show slots from `businessHours[dayOfWeek].open` to `businessHours[dayOfWeek].close`
- For normally-closed days (`business_hours[dayOfWeek] = null`): show empty state + "Abrir dia especial" CTA
- For days with a `ScheduleOpening`: show green opening window rows; rows outside the opening = grey
- Slot height: fixed `3rem` per 30-min slot (`slot_granularity_minutes`)
- Booking blocks: blue left border + `--ba-secondary` background; link to `/dashboard/bookings/[id]`
- Closure blocks: grey hatch (`repeating-linear-gradient 135deg`) + grey left border; onclick opens `RemoveClosureDialog`
- If a booking falls inside a closure window: orange tint + warning icon (UC-010a A4)

**Week strip dots:** green (`#16a34a`) dot per day that has ≥1 approved booking OR a ScheduleOpening; no dot if empty; closed days rendered with 40% opacity

**FAB:** only shown on open days (not on closed days — use "Abrir dia especial" CTA instead)

## Component: ClosureFormSheet (UC-010a)

**File:** `apps/web/features/booking/components/dashboard/schedule/ClosureFormSheet.tsx` (✅ Exists)

**shadcn/ui:** `<Sheet side="bottom">` on mobile; `<Sheet side="right">` at ≥1024px

**Form fields:**

| Field | Component | Validation |
|---|---|---|
| `date` | `<Input type="date">` | required; not in the past |
| `reason` | `<Select>` | required; one of `STAFF_DAY_OFF`, `MAINTENANCE`, `HOLIDAY` |
| `startTime` | `<Input type="time">` | optional; if provided, `endTime` must also be provided |
| `endTime` | `<Input type="time">` | optional; must be > `startTime` |
| `notes` | `<Textarea>` | optional; max 200 chars |

**Labels (pt-BR):**
- `STAFF_DAY_OFF` → "Folga da equipe"
- `MAINTENANCE` → "Manutenção"
- `HOLIDAY` → "Feriado"
- Empty start/end = full-day closure (show hint: "Vazio = bloqueio do dia inteiro")

**Error messages (pt-BR):**
- 409 overlap: "Já existe um bloqueio nesse período."
- 409 full-day vs partial: "Conflito com bloqueio parcial existente na mesma data."
- 422 past date: "Não é possível bloquear datas passadas."
- Warning (201 + bookings exist, UC-010a A4): non-blocking inline banner — "X agendamento(s) aprovado(s) existe(m) nesse período. Reagende ou cancele manualmente."

**On success:** close sheet; optimistically update `ScheduleView` state; show warning banner if returned (do NOT block on warning — closure was created)

## Component: RemoveClosureDialog (UC-010b)

**File:** `apps/web/features/booking/components/dashboard/schedule/RemoveClosureDialog.tsx` (✅ Exists, built on the shared `ScheduleRemovalDialog`/`ScheduleRemovalSummary`)

**shadcn/ui:** `<Sheet side="bottom">` — confirmation only, compact

Shows: reason label + formatted date + time range. "Remover bloqueio" button = destructive red. On success: 204, close sheet, remove from local state.

## Component: OpeningFormSheet (UC-010c)

**File:** `apps/web/features/booking/components/dashboard/schedule/OpeningFormSheet.tsx` (✅ Exists)

**Form fields:**

| Field | Component | Validation |
|---|---|---|
| `date` | `<Input type="date" readOnly>` | pre-filled from selected closed day; not editable |
| `startTime` | `<Input type="time">` | required |
| `endTime` | `<Input type="time">` | required; must be > `startTime` |
| `notes` | `<Textarea>` | optional; max 200 chars |

**Error messages (pt-BR):**
- 409 already exists: "Já existe uma abertura para esta data."
- 422 past date: "Não é possível abrir datas passadas."
- 422 day already open: "Esse dia já está aberto nas configurações regulares. Ajuste os horários de funcionamento."

## Component: RemoveOpeningDialog (UC-010d)

Same pattern as `RemoveClosureDialog`. Shows date + window. "Remover abertura" = destructive. On 204: revert day to closed state in local view.

## BottomNav visibility

`SchedulePage` is a top-level dashboard route — BottomNav should be visible (unlike drill-down detail pages). No suppression needed.

## Route registration

Add `apps/web/app/dashboard/schedule/page.tsx` to the dashboard sidebar nav under the clock icon ("Horários"). The sidebar link already exists in all prototype files — just needs the real route to resolve.

## shadcn/ui component map

| Prototype pattern | shadcn/ui |
|---|---|
| FAB button | `<Button size="lg">` with `className="fixed bottom-6 right-6 rounded-full"` |
| Bottom sheet (form) | `<Sheet side="bottom">` wrapping `<SheetContent>` |
| Confirmation sheet | `<Sheet side="bottom">` with small `<SheetContent>` |
| Booking time block | `<Card>` with coloured left border via `className` |
| Closure block (hatch) | plain `<div>` — CSS `repeating-linear-gradient` not in shadcn |
| Warning inline banner | `<Alert variant="warning">` |
| Success inline banner | `<Alert variant="default">` with green icon |

## Resolved decisions (all shipped in `M13-S21`)

1. **Calendar granularity** — week strip (Mon–Sun day buttons) + a time grid for the selected day, as prototyped.
2. **Booking block interaction** — clicking an approved booking navigates to `/dashboard/bookings/[id]`.
3. **Warning banner** — UC-010a A4 is non-blocking: closure is created, then a warning banner shows if approved bookings exist in the window.
4. **BFF `.http` coverage** — `apps/bff/http/schedule/*.http` exists for all closure/opening/availability endpoints.

---

## ✅ Resource-scoped extension (UC-010e, UC-010f — M21 Cluster 1, shipped `M21-S05`)

> Added by the `/discovery-to-milestone` promotion of `docs/discovery/multivertical-booking/`, shipped by `M21-S05`. Everything above this line is shipped (`M13-S21`) and untouched. `07-horarios-recurso.html` (relocated from the discovery folder's `staff-05-horarios-recurso.html`) is discovery-only illustrative material, not a validated `plan/journey/` prototype — it grounded the resource-scoped-calendar *mechanism*, but the shipped UI followed this section's own description instead of that file's separate-page illustration (confirmed during `M21-S05` story discovery, 2026-09-04).

**What shipped:** `resourceId` is now an optional field on both `POST /schedule/closures` and `POST /schedule/openings` (existing endpoints — no new routes), plus a `resourceId` query filter on both `GET` list endpoints, all on the same `/dashboard/schedule` route (no new route). The UI is **two separate controls, not one picker** — revised mid-implementation after live testing surfaced a real manager need ("show me everyone's schedule at once") a single-select picker structurally couldn't answer, plus a second, independent need to choose which resource a *new* block/opening applies to:
- **`ResourceFilterMenu`** — a floating, multi-select checkbox filter (mirrors the existing `ScheduleStatusFilterMenu`'s trigger+popover shape) controlling what the *calendar view* shows. Zero resources checked = today's exact tenant-wide behavior, byte-identical to before this story (non-regression requirement). One or more checked = an **explicit separate tenant-wide fetch plus one fetch per checked resource** (`N+1` requests, not `N`) — the backend's `resourceId` filter is an exact match (`resourceId = :id OR IS NULL`, never both in the same response), so the tenant-wide items that always apply to every resource have to be fetched on their own request rather than assumed to ride along inside a resource-scoped response; all results are merged and de-duplicated client-side. Persisted the same way the existing status filter already is (`schedule-preferences.ts`, `localStorage`-backed) — except the resource-id set is additionally **scoped by `tenantId`** in that storage (unlike the status filter, which is a fixed tenant-agnostic enum), so a multi-tenant staff user switching tenants never carries a stale resource id from one tenant into another. A selected resource id that later disappears from the active resource list (deactivated after being checked) is automatically dropped from both the live query and the persisted preference. A failed fetch surfaces as an inline error banner on the page instead of silently rendering an empty schedule.
- **`ResourceSelectField`** — a single-select `<select>` embedded inside `ClosureFormSheet`/`OpeningFormSheet`, deciding which *one* resource the block/opening being created applies to. Deliberately **decoupled** from `ResourceFilterMenu`'s selection: `resourceId` is a single nullable field on the aggregate, not a list, so "I'm viewing 3 resources' calendars merged" has no single answer for "which resource does this new block belong to" — the field always resets to "Todo o negócio" fresh each time a sheet opens, never inheriting the view filter's checked state.

Both controls are MANAGER-only (rendered only for `role === 'MANAGER'`, sourced via the dashboard-wide `TenantProvider`) and both exclude the tenant's own `LOCATION` resource from their options — `resourceId = null` ("Todo o negócio") already represents that scope. See `docs/02-DOMAIN_MODEL.md` § Booking Context (`Resource` aggregate) and `docs/14-API_CONTRACTS.md` § Schedule Closures/Openings for the full backend/BFF contract (unchanged by this UI revision).

**Auth exception:** a request body with `resourceId` set requires `MANAGER` specifically (not `STAFF`) — the tenant-wide case (`resourceId` omitted) is unchanged, still `MANAGER|STAFF`. Neither `ResourceFilterMenu` nor `ResourceSelectField` render at all for STAFF (hidden, not disabled) — both gated on `role === 'MANAGER'`, sourced via the dashboard-wide `TenantProvider` (extended by `M21-S05` to carry `role`, since no client component in this feature previously needed it). See `docs/14-API_CONTRACTS.md`.

**File map:**

| File | Status |
|---|---|
| `apps/web/features/booking/schedule/useSelectableResources.ts` | ✅ Done — shared hook (active, non-`LOCATION` resources) behind both controls below |
| `apps/web/features/booking/components/dashboard/schedule/ResourceFilterMenu.tsx` | ✅ Done — multi-select checkbox filter, MANAGER-only, mirrors `ScheduleStatusFilterMenu` |
| `apps/web/features/booking/components/dashboard/schedule/ResourceSelectField.tsx` | ✅ Done — single-select `<select>`, MANAGER-only, embedded in the create sheets |
| `SchedulePage.tsx` | ✅ Extended — renders `ResourceFilterMenu`, threads the checked-resource-id set through the existing `useSchedulePageController`/`schedule-page-ui-state` composition |
| `ClosureFormSheet.tsx` / `OpeningFormSheet.tsx` | ✅ Extended — render `ResourceSelectField`, pass its own locally-selected `resourceId` (if any) into the create request body |
| `schedule-preferences.ts` | ✅ Extended — persists the checked resource-id set the same way `selectedStatuses` already is, but keyed by `tenantId` (resource ids are tenant-specific, unlike the fixed `BookingStatus` enum) |
| `useSchedule.ts` | ✅ Extended — `useScheduleClosures`/`useScheduleOpenings` now accept a `resourceIds: readonly string[]` array; when non-empty, fan out the tenant-wide scope plus one request per id via `useQueries`, merge+de-duplicate the results client-side, and surface `isError`/`error` if any scoped request fails |
| `schedule-page-core-data.ts` | ✅ Extended — reconciles the persisted selected-resource-id set against the tenant's live active-resource list every render (MANAGER only), dropping any id no longer active |
| `apps/web/providers/tenant-provider.tsx` | ✅ Extended — `TenantState`/`TenantProvider` now also carry the actor's `role` (optional — the customer shell never sets it) |
| `packages/types/src/schedule.dto.ts` | ✅ Extended — `resourceId` added to `ScheduleClosure`/`ScheduleOpening`/`CreateClosureRequest`/`CreateOpeningRequest` |

**BFF calls (extended existing endpoints, no new routes):**

```text
GET /v1/schedule/closures?from=...&to=...&resourceId=       // resourceId optional; ResourceFilterMenu issues one call per checked resource PLUS one explicit tenant-wide call (resourceId omitted) whenever any resource is checked
GET /v1/schedule/openings?from=...&to=...&resourceId=       // resourceId optional; same fan-out
POST /v1/schedule/closures   { ..., resourceId?: string }   // 404 if resourceId set and not found/cross-tenant
POST /v1/schedule/openings   { ..., resourceId?: string }   // 404 if resourceId set and not found/cross-tenant
GET /v1/resources?type=&isActive=                            // UC-044 — feeds both ResourceFilterMenu and ResourceSelectField
```

**Known limitation, found during the original promotion — still not resolved, and moot for the shipped design:** `07-horarios-recurso.html`'s own sidebar/bottom-nav still has "Horários" pointing at a Cluster-2/4 screen (`manager-05-visao-geral.html`, the combined multi-resource day grid) rather than back at this file, and "Serviços"/"Turmas" point at Cluster 2/4 screens (`manager-02-service-resource-config.html`, `staff-04-turmas-proximas.html`) not yet promoted. Since the shipped implementation never navigates to that illustrative screen at all (both controls live in-page on the existing route, not a drill-down page), this stops applying to the real product — left as-is in the illustrative file until those clusters are promoted.

**Resolved decisions (`M21-S05`):**
- [x] `ResourceFilterMenu` defaults to nothing checked — "Todo o negócio" (tenant-wide) — on first load. `LOCATION` is excluded from both controls' options entirely (functionally redundant with the tenant-wide default).
- [x] `ResourceFilterMenu`'s view-time selection (view filter) and `ResourceSelectField`'s write-time selection (which resource a *new* block/opening applies to) are independent, non-syncing state — see "What shipped" above for why.
- [x] A single-select picker was tried first and replaced with the multi-select filter after live testing showed "view every resource's schedule merged together" is a real, common manager need the single-select shape couldn't express at all.
- [x] `ResourceFilterMenu` shows a localized empty-state message ("Nenhum recurso ainda") instead of a blank bordered area when the tenant has no selectable (active, non-`LOCATION`) resources yet.

---

## ✅ Backend/BFF done, frontend redesigned — M22 Cluster 2: Manager multi-resource column view (UC-057)

**Backend + BFF:** `GET /v1/schedule/day-grid` — ✅ Done, shipped in `M22-S05` (merged, PR #506). Read-only, no migration.

```
GET /v1/schedule/day-grid?date=YYYY-MM-DD
  Header: Authorization: Bearer {jwt}   (MANAGER)
  Response: { date, columns: [{ resourceId, name, type, blocks: [{ startsAt, endsAt, kind: 'BOOKING'|'CLASS_SESSION', refId }] }] }
```

Returns **every** active resource's column unconditionally — no `resourceIds` filter param. `blocks` only ever carries `BOOKING`/`CLASS_SESSION` occupancy; it does **not** include closures/openings.

**Frontend — redesigned during discussion 2026-09-24, before `M22-S06` implementation started.** `08-visao-geral-manager.html` originally mocked (2026-07-29, CAND-13c) a standalone grid rendering **every** active resource as its own column. That was dropped: a column-per-resource layout doesn't scale (a 60-resource tenant — many instructors/rooms/equipment — can't fit that many columns regardless of UC-057 A1's type-tab narrowing, which only gets down to sub-groups still too large to render side by side). No layout can show every resource "at a glance" past a handful; the only workable shape is a manager curating a small subset.

That curation tool already exists and shipped in `M21-S05`: the floating **`ResourceFilterMenu`** checkbox filter (see the "Resource-scoped extension" section above). The resolved design reuses it instead of building a new unbounded grid:

- **Zero resources checked** (today's default) → unchanged single merged timeline — no regression.
- **One or more resources checked** → render those checked resources as real side-by-side columns for the selected day, built from **two already-existing sources, no new backend work**:
  - *Bookings* → `GET /schedule/day-grid` (M22-S05), filtered **client-side** to the checked `resourceId`s (the endpoint already resolves `refId` per resource; the frontend just discards the unchecked columns from the response — an optional `resourceIds` query param would trim payload size later, but isn't required to ship this).
  - *Closures/openings* → the existing `resourceId`-scoped fetch (`M21-S05`, unchanged) — already fans out one call per checked resource + one tenant-wide call, merged client-side. **Confirmed 2026-09-24: a manager who checks a resource with a closure already sees that closure today** — this mechanism doesn't need to change, only get rendered per-column instead of merged into one board.

A rejected intermediate idea (worth recording so it isn't re-proposed): labeling each block in the *existing single merged timeline* with a resource-name badge (reusing the `ResourceNameBadge` pattern already used for closures/openings) instead of building columns at all. Rejected because it needed new backend plumbing (`StaffBookingCardResponse` has no resource field — bookings aren't resource-scoped in the DTO) for a *weaker* result (reading labels on shared overlap lanes) than just rendering the day-grid endpoint's already-resolved columns for the checked subset.

**This rejection is scoped to Day view specifically, not badges in general.** `TD44` Story 1 (`/story-discovery`, 2026-09-24) later applies a materially different version of this same badge idea to **Week view**, where columns genuinely aren't viable (7 day-cards × N resource-columns doesn't fit, unlike Day view's single day). It sidesteps the objection above entirely: rather than needing a new resource field on the booking DTO, it derives resource identity client-side from the already-shipped `GET /schedule/day-grid` response (`M22-S05`) — the same lookup technique `schedule-resource-columns.ts` already uses for Day view's columns, just fanned across the 7 visible days instead of one. See the "TD44 addition" entry below.

**File map:**

| File | Status |
|---|---|
| `apps/backend/.../schedule-day-grid.controller.ts` + `get-schedule-day-grid.use-case.ts` | ✅ Done (`M22-S05`) |
| `apps/bff/src/features/booking/schedule-day-grid.controller.ts` | ✅ Done (`M22-S05`) |
| `apps/web/features/booking/components/dashboard/schedule/ScheduleMainView.tsx` | ✅ Done — `M22-S06`. Extracted from `SchedulePage.tsx` (avoids a 3-way nested ternary, SonarCloud S3358); picks week view / bounded columns board / single-day timeline. |
| `apps/web/features/booking/components/dashboard/schedule/ScheduleResourceColumnsBoard.tsx` | ✅ Done — `M22-S06`. A thin layout wrapper rendering one *unmodified* `ScheduleTimelineBoard` per checked resource — day-grid is used only as a `resourceId → booking-id` lookup, filtering the existing unscoped week-bookings list per column (respecting the status filter — a matched booking whose status is unchecked is excluded, not shown as a placeholder) and feeding it straight into the existing `buildTimelineDayData`, not a new rendering engine. Inline in `SchedulePage.tsx`'s Day view, not a separate page/route. |
| `apps/web/features/booking/schedule/schedule-resource-columns.ts` | ✅ Done — `M22-S06`. The booking-id-set join + tenant-wide-closure/opening merge, pure and unit-tested. |

**Open questions — both resolved during `M22-S06`'s own `/story-discovery` (2026-09-24):**
- [x] `docs/04-USE_CASES.md` UC-057's Main Flow/A1 — reworded to match the bounded/checked-subset behavior (done, same date).
- [x] Route-level relationship to `SchedulePage` — inline in the existing route's Day view only; Week view was untouched **by M22-S06 itself** (its own per-day mini cards already reflected the resource filter for closures/openings, unchanged). See `plan/M22-MULTIVERTICAL-SERVICE-AVAILABILITY.md`'s `M22-S06` entry for the full resolved design, including the tenant-wide-closure-in-every-column rule and the "Ocupado" fallback for an unmatched booking id. **`TD44` Story 1 (2026-09-24) later changes Week view's own behavior for bookings** — see the entry immediately below.

**`TD44` addition — Week view resource-filtered bookings + compact resource-summary line (✅ Done — `TD44` Story 1, Story 2):**

- Gap: Week view's booking rendering never respected "Filtrar recurso" at all (only closures/openings did) — inconsistent with Day view's columns board, which both narrows and labels bookings by resource.
- Story 1 shipped design: a booking shows in Week view only if ≥1 of its assigned resources is checked. Zero checked = unchanged default.
- Mechanism: `useScheduleWeekDayGrid` in `useSchedule.ts` (`useQueries`, one `GET /schedule/day-grid` call per visible day, gated on `resourceIds.length > 0`) — same shape as the existing per-resource `useScheduleClosures`/`useScheduleOpenings` fan-out, just fanned by day instead of by resource. No backend/BFF change. `schedule-week-resource-bookings.ts` turns the fetched responses into a `bookingId -> resourceId[]` lookup (`buildWeekBookingResourceIds`) and the filtering rule itself (`isBookingVisibleForResourceFilter`) — the same day-grid-as-lookup technique `schedule-resource-columns.ts` already uses for Day view, reused rather than reinvented.
- Filtering happens entirely in the data layer, before `weekTimelineCards` is computed (`schedule-page-timeline-derived.ts`) — **`ScheduleMainView.tsx`/`ScheduleWeekView.tsx` needed no changes at all**, since the pre-filtered events just flow through the existing `weekTimelineCards` prop, the same way closure/opening badges already did. (This corrects an incorrect story-discovery assumption that Week view would need the raw `selectedResourceIdSet`/`resourceNameById` props the way the Day-view columns board does — it doesn't, since it never builds its own columns.)
- Story 1 files: `useSchedule.ts`, `schedule-week-resource-bookings.ts` (new), `schedule-timeline-events.ts` (`BookingTimelineEvent.resourceNames: readonly string[]`), `schedule-timeline.ts`, `schedule-timeline-formatting.ts` (new — 3 unrelated helpers split out purely to stay under the 250-line file cap, re-exported from `schedule-timeline.ts`), `ScheduleTimelineEventRenderer.tsx`, `schedule-page-core-data.ts`/`schedule-page-timeline-derived.ts`/`schedule-page-query-data.ts`.
- Inherits `TD43`'s cross-midnight day-grid membership gap (not re-fixed here). Full scope: `td/TD44-RESOURCE-COLUMNS-BOARD-SELECTION-CAP.md` Story 1.
- **Story 2 (`/story-discovery` 2026-09-25) — replaced the per-resource `ResourceNameBadge` row with a compact summary line:** Story 1's original render gave each matched booking one `ResourceNameBadge` per matched resource, wrapped inline next to the status badge — unbounded height growth as match count grew, a risk Story 1's own implementation notes flagged as unverified (short bookings + `flex-wrap` could clip under `overflow-hidden`). Story 2 replaces it with a fixed-shape single line instead: the title/subtitle/status row is unchanged; a new line is added directly below it, separated by a divider (the existing time-range text moves below this new line). Zero assigned resources → no divider, no line (non-regression). Exactly one → the name, no count. Two or more → the type-prioritized name (**STAFF > ROOM > EQUIPMENT**, alphabetical tiebreak within the same type — priority is baked into `resourceNames`' own sort order, not re-derived by the renderer) + a `+N` suffix for the rest (e.g. 3 assigned → "Camila +2"). `data-testid="timeline-block-resource-summary"` — distinct from `timeline-block-resource-name`, which stays reserved for openings/closures (untouched by this story).
  - **Round 2 (bot review + live testing):** a `role="group"` + `aria-label` fix for the line's accessible name; a shared content-driven minimum block height (`getSlotHeight`'s new `minSlotHeightPx` param) applied to Day view's single timeline, Day view's resource-columns board, and Week view's day-cards alike, closing an overflow/clipping risk found via live testing of a real 30-minute booking. **Superseded by `TD44` Story 4 below** — `minSlotHeightPx` conflated the grid's own coordinate unit with each block's content-fit floor, which also inflated the whole day's scroll height; Story 4 decouples the two.
  - **Round 3 — accessibility take 3 + "always show it" (live user testing + Codex, 2026-09-25):** `role="group"` passed WAI-ARIA correctness but tripped SonarCloud S6819. A `<div>`'s implicit `generic` role structurally can't carry its own accessible name regardless of role/sr-only attempts, and the booking block is a single `<Link>` whose own `ariaLabel` is the actually-focusable/announced unit anyway — so `BookingResourceSummaryLine` reverted to a plain, fully presentational `aria-hidden="true"` div with no role, and `renderBookingTimelineEvent` composes the full assigned-resource list straight into the link's own `ariaLabel` instead (`"<contactName>, <resourceNames joined>"`). Separately, the user asked for resource identity to show on **every** booking with an assignment, in both Day and Week view, **regardless of `ResourceFilterMenu` check state** — Story 1's day-grid-lookup mechanism only ever knew names for *checked* resources, so this needed a real backend change: `StaffBookingCardResponse`/`ListBookingsUseCase` gained `assignedResources: { resourceId, resourceType, resourceName }[]`, sourced from `booking_line_resource_assignments` and batched per page (`TypeOrmBookingRepository.findResourceAssignmentsByBookingId`, new `typeorm-booking-resource-assignments.helpers.ts` for the row-grouping). The frontend now derives `resourceNames` directly from `booking.assignedResources` inside `buildBookingTimelineEvent`, independent of filter state — this also makes the line appear in Day view's merged timeline and resource-columns board for free, since both already funnel through the same function. **Week view's own booking-visibility filter (`isBookingVisibleForResourceFilter`) is unchanged and still checked-resource-gated** — only the summary line's content stopped depending on check state. This retired the round-1/round-2 `resourceTypeById`/`bookingResourceNamesById`-as-name-lookup machinery as dead code (`compareResourceIdsByTypePriority` → `compareResourceAssignmentsByTypePriority`, operating on `{resourceType, resourceName}` pairs directly instead of a resourceId-keyed map). Full detail: `td/TD44-RESOURCE-COLUMNS-BOARD-SELECTION-CAP.md` Story 2 round 3.
  - Files (final, all rounds): `schedule-resource-priority.ts` (`compareResourceAssignmentsByTypePriority`), `BookingResourceSummaryLine.tsx` (new — the rendered line, `aria-hidden="true"`, no role), `ScheduleTimelineEventRenderer.tsx` (composes the `Link`'s `ariaLabel` from contact name + resource names; footer is a `flex-col` of the summary line then the time range), `schedule-timeline-events.ts` (`buildBookingTimelineEvent` derives `resourceNames` from `booking.assignedResources`), `schedule-timeline-formatting.ts` (`DESKTOP_MIN_BLOCK_HEIGHT_PX`/`COMPACT_MIN_BLOCK_HEIGHT_PX`), plus backend (`typeorm-booking.repository.ts`, `typeorm-booking-resource-assignments.helpers.ts`, `list-bookings.use-case.ts`) and BFF (`bookings.types.ts`, `bookings.mapper.ts`) changes threading `assignedResources` through.

- **`TD44` Story 4 (`/story-discovery` 2026-09-25) — decoupled slot/block height, minimum-granularity content variant, scroll-to-now, and removed redundant status/count labels:** four related information-density fixes from live-testing feedback after Story 2 shipped.
  1. **Grid coordinate unit decoupled from the per-block content-fit floor.** `getSlotHeight(slotGranularityMinutes, scale)` lost its `minHeightPx` param — it's now purely the grid's pixels-per-slot unit (48px/30-min slot at scale 1, the same value the formula already produced pre-Story-2, since the old bare 18px floor never won). `DESKTOP_MIN_BLOCK_HEIGHT_PX`/`COMPACT_MIN_BLOCK_HEIGHT_PX` (values unchanged) are applied per block instead, via a new `getBlockMinHeightPx(compact)` helper, as a CSS `minHeight` on each block's own `TimelineBlockShell` style — a short block can render visually taller than its own slot without inflating the whole day's scroll height, the same way Google Calendar renders short events. Fixes the ~1944px-tall business day Story 2's shared floor produced; a 9-hour day is back to ~864px.
  2. **Minimum-granularity content variant.** A booking whose duration equals the tenant's `slotGranularityMinutes` drops only its time-range line (redundant with its own vertical position in the now-readable grid) — the resource-summary line from Story 2 still renders when assigned. A booking longer than minimum granularity is unchanged.
  3. **Scroll-to-now.** Loading Day view (single timeline and the resource-columns board) or Week view for a range that includes today auto-scrolls once, landing with ~1h of lookback above "now," instead of always starting at the active window's opening time — new `schedule-scroll-to-now.ts` (`resolveNowMarkerTopPx` + `useScrollToNowOnce`), keyed off `selectedDateKey`/the visible week's start so a refetch never re-triggers it. The resource-columns board anchors to only its first rendered column, since each column can have its own independently-resolved active window until `TD44` Story 3 (shared hour axis) ships.
  4. **Removed redundant status/count labels.** `ScheduleTimelineBoard.tsx`'s compact board (Week view's day-cards) no longer renders its own status badge or "N agendamento(s) neste dia" count — both were exact duplicates of information already shown elsewhere (the day-card's own separate header badge, `ScheduleWeekView.tsx`, is untouched and still shows status once). Day view's equivalent elements were removed too, for consistency: `ScheduleMainView.tsx`'s status badge and `ScheduleDayHeader.tsx`'s count badge, along with the now-dead `resolveTimelineTitle`/`timelineTitle`/`bookingEventCount`/`hasBookingInSelectedDay` plumbing through `schedule-page-derived.ts`/`schedule-page-controller-result.ts`/`SchedulePage.tsx`.
  - Files: `schedule-timeline-formatting.ts`, `schedule-timeline.ts`, `schedule-scroll-to-now.ts` (new), `ScheduleTimelineEventRenderer.tsx` (new `data-testid="timeline-block-time-range"`), `ScheduleTimelineBoard.tsx` (new scroll-to-now marker, shared by both boards), `ScheduleMainView.tsx`, `ScheduleResourceColumnsBoard.tsx`, `ScheduleWeekView.tsx` (new `data-testid="schedule-week-day-badge"` on its own header badge), `ScheduleDayHeader.tsx`, `schedule-page-derived.ts`, `schedule-page-controller-result.ts`, `SchedulePage.tsx`. Full detail: `td/TD44-RESOURCE-COLUMNS-BOARD-SELECTION-CAP.md` Story 4.

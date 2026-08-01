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

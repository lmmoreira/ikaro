# Dev Notes — STAFF: Agenda (Booking Queue Management + Lifecycle)

> **Status:** ✅ Done. `M125-S01`–`S05` (triage: UC-003/004/005) and `M13-S19`/`M13-S20` (lifecycle: UC-008/UC-009) have all shipped. Updated 2026-07-31 — this file previously described the whole journey as unbuilt and cited pre-domain-slice paths (`apps/web/components/**`, `apps/web/lib/api/**`); real files live under the domain-slice tree below.
>
> **Prototype:** `plan/journey/staff/prototypes/agenda/`
> **Production:** `apps/web/features/booking/components/dashboard/bookings/**` — Next.js 16 + React 19 + shadcn/ui + Tailwind
>
> Validation note (2026-06-29): `apps/web/e2e/staff-booking-lifecycle.spec.ts` covers queue detail, quick approve, reject, request info, complete success, reschedule success, and cancel success.

---

## File map (all ✅ shipped)

| Production file | Notes |
|---|---|
| `apps/web/proxy.ts` | Protects `/dashboard/**` |
| `apps/web/shells/dashboard/components/Sidebar.tsx`, `Topbar.tsx`, `BottomNav.tsx`, `WeekNav.tsx` | Shared dashboard shell — `WeekNav` is shared with the horarios `SchedulePage` as originally planned |
| `apps/web/app/dashboard/bookings/page.tsx` + `apps/web/features/booking/components/dashboard/bookings/BookingQueuePage.tsx` | Queue list |
| `apps/web/app/dashboard/bookings/[id]/page.tsx` + `apps/web/features/booking/components/dashboard/bookings/BookingDetailPage.tsx` | Detail + triage actions |
| `apps/web/features/booking/components/dashboard/bookings/BookingActionPanel.tsx`, `RejectBookingSheet.tsx`, `RequestInfoSheet.tsx`, `SlotConflictAlert.tsx` | Triage sub-components (same folder) |
| `apps/web/features/booking/components/dashboard/bookings/AdminCancelBookingSheet.tsx` | UC-008 cancel |
| `apps/web/app/dashboard/bookings/[id]/reschedule/page.tsx` + `apps/web/features/booking/components/dashboard/bookings/RescheduleBookingPage.tsx` | UC-008 A1 — dedicated page, not a modal over `[id]` |
| `apps/web/app/dashboard/bookings/[id]/complete/page.tsx` + `apps/web/features/booking/components/dashboard/bookings/MarkCompleteBookingPage.tsx` | UC-009 — dedicated page, not a sheet |
| `BookingCompletionSummary.tsx`, `AfterServicePhotoUpload.tsx`, `BookingOutcomeActionRail.tsx`, `BookingDetailMain.tsx`, `BookingActionSheetShell.tsx`, `BookingClientCard.tsx`, `BookingCard.tsx` | Additional supporting sub-components not anticipated in the original draft |
| `apps/web/features/booking/api/booking.ts` (+ `booking.server.ts`) | BFF fetchers (`listBookings`, `getBooking`, `approveBooking`, `rejectBooking`, ...) |

The real composition doesn't have a single `BookingLifecyclePanel` component as originally planned — the APPROVED-state actions are composed across `BookingDetailMain`/`BookingOutcomeActionRail` instead. Verify the exact split by reading `BookingDetailPage.tsx` directly before extending it further; this file doesn't attempt to fully re-document that internal composition.

---

## shadcn/ui equivalents

The prototype uses plain HTML + `tokens.css`. Production uses shadcn/ui components + Tailwind.

| Prototype pattern | shadcn/ui component | Notes |
|---|---|---|
| Bottom sheet (rejeitar / pedir info) | `Sheet` with `side="bottom"` | Use `side="right"` on desktop (`md:` breakpoint) |
| Status badge (`.status-badge.status-approved`) | `Badge` with custom `variant` | Map: `PENDING` → yellow, `APPROVED` → green, `REJECTED` → red, `INFO_REQUESTED` → blue, `CANCELLED` → gray |
| Card sections (`.card`) | `Card`, `CardContent` | |
| Primary/secondary buttons (`.btn-primary`, `.btn-secondary`) | `Button variant="default"` / `variant="outline"` | |
| Sidebar nav items (`.sidebar-nav-item`) | custom — no direct shadcn equivalent | Use `cn()` for active state |
| Avatar initials (`.auth-avatar`) | `Avatar`, `AvatarFallback` | |
| Inline alert banners (green/red/blue) | `Alert`, `AlertDescription` with `variant` | |
| Slot conflict error | custom `Alert` + slot picker pills | shadcn `Alert variant="destructive"` + `Button variant="outline"` pills |
| Reschedule date strip + slot grid | `AvailabilityCarousel` + `SlotPicker` (the UC-011 booking flow's components) with `variant="dashboard"` — no new shadcn mapping needed; the prototype draws them with `shared/reschedule-picker.css`, not the hotsite `.day-pill`/`.slot-btn` | Already shipped in `RescheduleBookingPage` (duration frozen at `totalDurationMins`) |
| Per-line price editor (`.price-line` / `.price-input`) | shadcn `Input type="number"` per row, pre-filled with `priceAtBooking` | Client-side recompute of the displayed total on every keystroke (no BFF round-trip) |

---

## `actionState` machine — `BookingDetailPage`

```ts
type ActionState =
  | 'idle'              // default — action panel with 3 buttons (PENDING/INFO_REQUESTED) or 3 buttons (APPROVED)
  | 'submitting'        // any action in-flight — buttons disabled
  | 'approved'          // UC-003 success — green banner, no action buttons
  | 'rejected'          // UC-004 success — red banner, no action buttons (terminal)
  | 'info-requested'    // UC-005 success — blue banner, Approve+Reject still visible
  | 'slot-conflict'     // UC-003 → 409 — SlotConflictAlert shown, retry available
  | 'cancelled'         // UC-008 success — red banner, no action buttons (terminal)
  | 'completed'         // UC-009 success — green banner, no action buttons (terminal)
  | 'rescheduled'       // UC-008 A1 success — green banner, status stays APPROVED, action buttons return
  | 'reschedule-conflict' // UC-008 A1 → 409 — RescheduleConflictAlert shown, retry available
```

`BookingDetailPage` derives its **initial** action set from `booking.status`: `PENDING | INFO_REQUESTED` renders `BookingActionPanel` (Aprovar/Rejeitar/Pedir info); `APPROVED` renders `BookingLifecyclePanel` (Marcar concluído/Reagendar/Cancelar). Both panels write into the same `actionState` machine.

### Transition rules — triage (PENDING / INFO_REQUESTED)

| From | Event | To | UI change |
|---|---|---|---|
| `idle` | Click "Aprovar" | `submitting` | All buttons disabled |
| `submitting` | `PATCH .../approve` → 200 | `approved` | Green banner replaces action panel; "Pedir info" hidden; "Voltar à agenda" shown |
| `submitting` | `PATCH .../approve` → 409 | `slot-conflict` | `SlotConflictAlert` shown with adjacent slot suggestions |
| `slot-conflict` | Admin picks alternate slot + retries | `submitting` → `approved` | Same as approve happy path |
| `idle` | Click "Rejeitar" | — | Opens `RejectBookingSheet` (no state change yet) |
| `RejectBookingSheet` confirm | `PATCH .../reject` → 200 | `rejected` | Red banner replaces action panel; no further actions (terminal) |
| `idle` | Click "Pedir info" | — | Opens `RequestInfoSheet` (no state change yet) |
| `RequestInfoSheet` confirm | `PATCH .../request-info` → 200 | `info-requested` | Blue banner shown; **Approve + Reject remain visible** (UC-005 A3); "Pedir info" hidden |
| `info-requested` | Click "Aprovar" | `submitting` → `approved` | Normal approve flow from INFO_REQUESTED state |
| `info-requested` | Click "Rejeitar" | → `rejected` | Normal reject flow from INFO_REQUESTED state |

### Button visibility per `actionState` — triage panel

| Button | `idle` | `submitting` | `approved` | `rejected` | `info-requested` | `slot-conflict` |
|---|---|---|---|---|---|---|
| Aprovar | ✅ | disabled | hidden | hidden | ✅ | hidden |
| Rejeitar | ✅ | disabled | hidden | hidden | ✅ | hidden |
| Pedir info | ✅ | disabled | hidden | hidden | hidden | hidden |

### Transition rules — lifecycle (APPROVED) — UC-008, UC-009

| From | Event | To | UI change |
|---|---|---|---|
| `idle` | Click "Marcar concluído" | — | Navigates to `MarkCompleteSheet` (full screen/route — too much content for a bottom sheet) |
| `MarkCompleteSheet` confirm | `PATCH .../complete` → 200 | `completed` | Green banner with cotado-vs-cobrado summary; no further actions (terminal) |
| `idle` | Click "Reagendar" | — | Navigates to `RescheduleBookingPage` (full screen/route) |
| `RescheduleBookingPage` confirm | `PATCH .../reschedule` → 200 | `rescheduled` | Green banner with old/new slot; **status stays APPROVED — action buttons return** (not terminal, unlike approve/reject/complete/cancel) |
| `RescheduleBookingPage` confirm | `PATCH .../reschedule` → 409 | `reschedule-conflict` | Inline error + adjacent slot suggestions, same pattern as `slot-conflict` |
| `idle` | Click "Cancelar" | — | Opens `AdminCancelBookingSheet` (no state change yet) |
| `AdminCancelBookingSheet` confirm | `PATCH /v1/bookings/:id/cancel` → 200 | `cancelled` | Red banner; no further actions (terminal) |

### Button visibility per `actionState` — lifecycle panel

| Button | `idle` | `submitting` | `completed` | `cancelled` | `rescheduled` | `reschedule-conflict` |
|---|---|---|---|---|---|---|
| Marcar concluído | ✅ | disabled | hidden | hidden | ✅ | ✅ |
| Reagendar | ✅ | disabled | hidden | hidden | ✅ | ✅ |
| Cancelar | ✅ | disabled | hidden | hidden | ✅ | ✅ |

---

## BFF calls

The real fetchers live in `apps/web/features/booking/api/booking.ts` (`apps/web/lib/api/bookings-staff.ts` never existed). All calls require `Authorization: Bearer <jwt>` (handled by the BFF session layer).

### Queue list (M125-S02)

Three calls, one per urgency section (resolved 2026-06-16 — see `agenda.md` "Queue scope"). All use the same `StaffBookingListResponse` shape; only the query params differ. Every `YYYY-MM-DD` value below is a **tenant-local** calendar day (TD48) — the backend converts it with the tenant's `businessHours.timezone`, so "today" is the tenant's today, never the UTC date.

```
# "Precisa de ação" — no date filter, ALL pending/info-requested regardless of day
GET /v1/bookings?status=PENDING,INFO_REQUESTED&page=1&limit=20
Header: X-Tenant-ID: {tenantId}

# "Hoje" — today's approved only
GET /v1/bookings?status=APPROVED&date=YYYY-MM-DD&page=1&limit=20
Header: X-Tenant-ID: {tenantId}

# "Próximos dias" — approved, future
GET /v1/bookings?status=APPROVED&from=YYYY-MM-DD&page=1&limit=20
Header: X-Tenant-ID: {tenantId}

Response: StaffBookingListResponse  (@ikaro/types — add in M125-S02)
{
  items: StaffBookingCardResponse[]
  total: number
  page: number
  limit: number
}
```

Sort order: "Precisa de ação" by `scheduledAt ASC` (oldest request first, regardless of date — a 3-day-old pending request should outrank a fresh one). "Hoje" and "Próximos dias" likewise by `scheduledAt ASC`.

### Booking detail (M125-S04)
```
GET /v1/bookings/:id
Header: X-Tenant-ID: {tenantId}

Response: StaffBookingDetailResponse  (@ikaro/types — packages/types/src/booking.dto.ts)
The shape is flat (no nested `customer` object) and has grown well past the original M125-S04 draft.
Core fields:
{
  bookingId, status, scheduledAt, type: 'GUEST' | 'CUSTOMER',
  contactName, contactEmail, contactPhone,
  customerId: string | null,
  loyaltyBalance: number | null,   // from Loyalty context via BFF orchestration
  lines: StaffBookingLineResponse[],
  infoRequestMessage: string | null,     // UC-005 field name (not informationNeeded)
  infoResponseMessage: string | null,    // UC-005 customer reply
  rejectionReason: string | null,
  approvedAt, approvedBy, completedAt, createdAt,
  statusHistory: BookingStatusHistoryEntry[]   // replaces the per-transition rejectedAt/infoRequestedAt/infoSubmittedAt timestamps
  // ... plus totals, photos, notes/adminNotes, resources, itinerary, attendees — see the DTO for the full list
}
```

### Approve (M125-S05)
```
PATCH /v1/bookings/:id/approve
Header: X-Tenant-ID: {tenantId}

→ 200: { id, status: 'APPROVED', approvedAt }
→ 409: SlotConflictError { message, suggestions: { startsAt, endsAt }[] }
```

### Reject (M125-S05)
```
PATCH /v1/bookings/:id/reject
Header: X-Tenant-ID: {tenantId}
Body: { reason: string }   // max 200 chars

→ 200: { id, status: 'REJECTED', rejectedAt }
```

### Request more info (M125-S05)
```
PATCH /v1/bookings/:id/request-info
Header: X-Tenant-ID: {tenantId}
Body: { message: string }   // max 200 chars

→ 200: { id, status: 'INFO_REQUESTED', infoRequestedAt }
```

### Cancel — admin (UC-008, ✅ shipped)
```
PATCH /v1/bookings/:id/cancel        ← unified BFF route, not a literal .../cancel-admin path
Header: X-Tenant-ID: {tenantId}
Body: { reason?: string }   // OPTIONAL — no minimum length (unlike Reject's 10-char rule)

→ 200: { id, status: 'CANCELLED', cancelledAt }
```
The BFF's `PATCH /v1/bookings/:id/cancel` (`apps/bff/src/features/booking/bookings.controller.ts`) internally dispatches to the backend's `cancel-admin` or `cancel-customer` use case based on `user.role` — there is no separate `.../cancel-admin` BFF endpoint (an earlier draft of this file assumed one). `CancelBookingAsAdminBody.reason` has no validation beyond being a string.

### Reschedule (UC-008 A1, ✅ shipped)
```
PATCH /v1/bookings/:id/reschedule
Header: X-Tenant-ID: {tenantId}
Body: { scheduledAt: string /* ISO8601 */, adminNotes?: string }

→ 200: { id, status: 'APPROVED', scheduledAt }
→ 409: SlotConflictError { message, suggestions: { startsAt, endsAt }[] }   // same shape as approve's 409
```
Booking status does **not** change — stays `APPROVED`. `adminNotes` is freeform (not auto-generated — see `docs/04-USE_CASES.md` UC-008 A1, fixed in the 2026-06-16 UC audit).

### Mark complete (UC-009, ✅ shipped)
```
PATCH /v1/bookings/:id/complete
Header: X-Tenant-ID: {tenantId}
Body: {
  lines: [{ lineId: string /* uuid */, actualPriceCharged: number }],  // required, >= 1 entry
  afterServicePhotoUrls?: string[],
  adminNotes?: string
}

→ 200: { id, status: 'COMPLETED', completedAt, totalActualPrice: number }
```
Every line in the booking must have an entry in `lines[]` (backend requires it, even if `actualPriceCharged === priceAtBooking` unchanged). Pre-fill each input with `priceAtBooking` so staff only edits when discounting/waiving (UC-009 step 4). Loyalty points are computed server-side from `pointsValueAtBooking` — **never send a points value from the client**.

---

## Server vs client component split

```
app/dashboard/bookings/page.tsx          ← Server component
  └── calls getStaffBookings(tenantId, date)
  └── renders <BookingQueuePage initialData={...} />   ← 'use client'

app/dashboard/bookings/[id]/page.tsx     ← Server component
  └── calls getStaffBookingById(tenantId, id)
  └── renders <BookingDetailPage booking={...} />      ← 'use client'
        └── <BookingActionPanel />                     ← receives actionState + callbacks
        └── <RejectBookingSheet />                     ← Sheet, unmounts when closed
        └── <RequestInfoSheet />                       ← Sheet, unmounts when closed
        └── <SlotConflictAlert />                      ← renders only when actionState === 'slot-conflict'
```

`page.tsx` files are **not unit-tested** (Next.js runtime deps — Playwright E2E only, per CLAUDE.md §7).  
`BookingDetailPage`, `BookingActionPanel`, `RejectBookingSheet`, `RequestInfoSheet` are `'use client'` components — testable with Vitest + `@testing-library/react`.

---

## Field constraints

| Field | Rule | Source |
|---|---|---|
| Reject reason | max 200 chars (client-side: web sheet `maxLength={200}`); BFF enforces `.trim().min(10)` | UC-004 |
| Info request message | max 200 chars (client-side: web sheet `maxLength={200}`); BFF enforces `.trim().min(20)` | UC-005 |
| Reject reason minimum | none in MVP | User confirmed — no minimum in the product spec; note the BFF schema (`RejectBookingBodySchema`) currently rejects anything under 10 trimmed characters |
| Admin cancel reason | optional; BFF `reason: z.string().min(1).optional()` (web sheet `maxLength={200}`) | UC-008 (confirmed against `CancelBookingAsAdminBody` in the 2026-06-16 UC audit) |
| Reschedule `adminNotes` | optional; BFF `.trim().min(1).max(500)` | UC-008 A1 |
| Complete `lines[].actualPriceCharged` | required per line, `>= 0` (BFF: `z.number().nonnegative()`, `lines` min 1) | UC-009 |
| Complete `afterServicePhotoUrls` | optional (BFF default `[]`); each item is a `tmp/<...>` staging path, not a URL | UC-009 A3 — completion must work with zero photos |
| Complete `adminNotes` | optional; BFF `.trim().min(1).max(500)` | UC-009 |

Bounds above are from `apps/bff/src/features/booking/bookings.schemas.ts`; the 200-char caps are client-side only. Validate client-side in the Sheet before calling the BFF and show a char counter (`{chars}/200`) below each textarea.

---

## Inline state rule (no auto-navigation)

After any successful action, **the admin stays on the detail page**. Do not call `router.push('/dashboard/bookings')` on success. The state change is:

- Approve → green banner replaces action panel inline
- Reject → red banner replaces action panel inline (terminal — no further actions)
- Info request → blue banner shown inline (Approve + Reject remain — UC-005 A3)
- Cancel (UC-008) → red banner replaces lifecycle panel inline (terminal — no further actions)
- Mark complete (UC-009) → green banner with cotado-vs-cobrado summary (terminal — no further actions)
- Reschedule (UC-008 A1) → green banner with old/new slot; **NOT terminal** — lifecycle panel buttons return, since the booking stays APPROVED and can still be cancelled/completed/rescheduled again

"Voltar à agenda" is a manual link back, not auto-triggered.

---

## Queue screens redrawn to match the shipped page (2026-10-14)

`00-agenda.html` and `00-agenda-next.html` had drifted from `BookingQueuePage` (avatar on the card, one status badge, price inside the service line, a "Ver detalhes" button, a strip that was not a real `WeekNav`, a sidebar without "Recursos", a two-item "+ Novo" menu, and the unbuilt M23-S13 parts mixed in). They now mirror the code, and **they must stay an exact copy of what is deployed**:

- **Card** = `BookingCard.tsx`: name + two pills (Cliente/Visitante, then the status), service line, date/time left and `price · duration` right, one small button, the whole card links to the detail (`z-20` buttons above the link). Variants: `action-needed` (Aprovar; `INFO_REQUESTED` has a blue left border), `today` (time only, Marcar concluído), `upcoming` (dimmed, no button). The prototype CSS (`.qcard`, `.qbadge`, `.qbtn`) mirrors the component's Tailwind classes; `tokens.css`' `.booking-card` is the older shape and is not used on these screens.
- **`WeekNav`**: period label + chevrons (the label covers every visible date: "Agosto 2026", "Outubro – Novembro 2026" across a month, "Dezembro 2026 – Janeiro 2027" across a year; `00b-agenda-month-boundary.html`, M18-S11), a strip of `welcomeStaffScreenDays` days (default 14, scrolls on mobile); today = filled blue, a picked day = near-black with a ring, a dot = the day has a booking. Picking a day filters "Próximos dias" (title "Próximos dias — dd/mm", cards emphasized); picking it again clears it. The ‹ chevron of the first window and the › of the second are not drawn (only two windows exist).
- **Shell**: sidebar and "Mais" sheet list Recursos, Equipe, Configurações, Hotsite under "Somente Gerente"; "Leads" appears only when the LEAD_FORM module is on, so it is not drawn for this tenant.
- **M23-S13 folded in (2026-10-15):** `00-agenda.html` now also draws the recurrence card and the "Filtrar agenda" balloon (the former `00c-agenda-s13.html`, deleted). The second "+ Novo" item, "Recorrência" (M23-S19), is not drawn until S19 ships: it reads "Recorrência — Uma reserva que se repete toda semana, em nome de um cliente" and leads to `09-escolher-cliente.html?tipo=recorrencia#recentes`. `00-agenda-next.html` and `00d-agenda-precisa-decisao.html` omit the S13 parts.
- **Not yet re-checked against the code:** the other screens in this folder (`01`–`10b`) — a separate pass; `01-booking-detail.html` and `03-…` may carry the same kind of drift.

---

## WeekNav — shared week navigation row

**File:** `apps/web/shells/dashboard/components/WeekNav.tsx` (✅ Exists — shared with horarios `SchedulePage`, as originally planned)

---

## BottomNav — hide on detail pages

The `BottomNav` component must not render on `/dashboard/bookings/[id]`. Two approaches:

1. `DashboardShell` accepts a `hideBottomNav?: boolean` prop — `[id]/page.tsx` passes it
2. `usePathname()` in `BottomNav` — hide when pathname matches `/dashboard/bookings/[id pattern]`

Option 1 is preferred (explicit, no regex in component).

---

## Prototype CSS → Tailwind mapping

These `tokens.css` classes do not exist in production — map them as follows:

| Prototype class | Tailwind equivalent |
|---|---|
| `.dashboard-topbar` | `flex h-14 items-center border-b bg-white px-4` |
| `.sidebar` | `hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:bg-white` |
| `.main-content` | `flex-1 overflow-auto` |
| `.dashboard-body` | `mx-auto max-w-5xl p-6` |
| `.card` | shadcn `<Card><CardContent className="p-4">` |
| `.btn-primary` | shadcn `<Button>` |
| `.btn-secondary` | shadcn `<Button variant="outline">` |
| `.auth-avatar` | shadcn `<Avatar><AvatarFallback>` |
| `.status-badge.status-pending` | shadcn `<Badge className="bg-yellow-100 text-yellow-800">` |
| `.status-badge.status-info` | shadcn `<Badge className="bg-blue-100 text-blue-800">` |
| `.status-badge.status-approved` | shadcn `<Badge className="bg-green-100 text-green-800">` |
| `.status-badge.status-rejected` | shadcn `<Badge className="bg-red-100 text-red-800">` |
| `.status-badge.status-cancelled` | shadcn `<Badge className="bg-red-100 text-red-800">` |
| `.status-badge.status-completed` | shadcn `<Badge className="bg-slate-100 text-slate-600">` |
| `.role-badge-manager` | shadcn `<Badge variant="secondary">` |

> **Note:** `status-info` is the single class for `INFO_REQUESTED` everywhere (queue cards, detail badge, success banners). An earlier draft of `01d-info-success.html` used a one-off `status-info-requested` class that was never defined in `tokens.css` — fixed to reuse `status-info`. Likewise `status-completed` replaces three ad-hoc inline-style instances of the same colors in `customer-dashboard.html` and `minha-conta/*.html`.

---

## @ikaro/types additions (M125-S02 + S04)

Add these types to `packages/types/src/index.ts` in the same commit as the BFF endpoints that produce them:

```ts
// M125-S02
export interface StaffBookingCardResponse {
  id: string;
  status: 'PENDING' | 'INFO_REQUESTED';
  scheduledAt: string;
  customerName: string;
  serviceNames: string[];
  totalPrice: number;
}
export interface StaffBookingListResponse {
  items: StaffBookingCardResponse[];
  total: number;
  page: number;
  limit: number;
}

// M125-S04
export interface StaffBookingDetailResponse {
  id: string;
  status: string;
  scheduledAt: string;
  durationMinutes: number;
  customer: { id: string; name: string; email: string; phone: string };
  loyaltyBalance: number | null;
  lines: { serviceId: string; serviceName: string; price: number; durationMinutes: number; points: number }[];
  infoRequestMessage: string | null;
  infoResponseMessage: string | null;
  rejectionReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  infoRequestedAt: string | null;
  infoSubmittedAt: string | null;
}

// M125-S05 — re-add types dropped in M12-S07
export interface ApproveBookingRequest { bookingId: string; }
export interface ApproveBookingResponse { id: string; status: 'APPROVED'; approvedAt: string; }
export interface RejectBookingRequest { bookingId: string; reason: string; }
export interface RequestMoreInfoRequest { bookingId: string; message: string; }
export interface SlotConflictSuggestion { startsAt: string; endsAt: string; }
export interface SlotConflictError { message: string; suggestions: SlotConflictSuggestion[]; }

// UC-008/UC-009 — not yet scoped to a story; add when this work is picked up
export interface CancelBookingAsAdminRequest { bookingId: string; reason?: string; }
export interface CancelBookingAsAdminResponse { id: string; status: 'CANCELLED'; cancelledAt: string; }
export interface RescheduleBookingRequest { bookingId: string; scheduledAt: string; adminNotes?: string; }
export interface RescheduleBookingResponse { id: string; status: 'APPROVED'; scheduledAt: string; }
export interface CompleteBookingLineInput { lineId: string; actualPriceCharged: number; }
export interface CompleteBookingRequest {
  bookingId: string;
  lines: CompleteBookingLineInput[];
  afterServicePhotoUrls?: string[];
  adminNotes?: string;
}
export interface CompleteBookingResponse {
  id: string; status: 'COMPLETED'; completedAt: string; totalActualPrice: number;
}
```

---

## Resolved decisions (all shipped)

- Triage endpoints (`GET /v1/bookings`, `GET /v1/bookings/:id`, `PATCH .../approve|reject|request-info`) — all implemented, `M125-S02`/`S04`/`S05`.
- Lifecycle endpoints (`cancel`, `reschedule`, `complete`) — all implemented, `M13-S19`/`S20`, with `.http` coverage.
- `MarkCompleteBookingPage` and `RescheduleBookingPage` are dedicated nested routes (`/dashboard/bookings/[id]/complete`, `/dashboard/bookings/[id]/reschedule`), not modals/sheets over `[id]`.
- The reschedule flow reuses the UC-011 `AvailabilityCarousel` + `SlotPicker` (`variant="dashboard"`) with duration frozen at the existing booking's `totalDurationMins` (no basket/duration recompute).

---

## M23 Cluster 3 extension (UC-071 approval ✅ shipped by M23-S13; UC-074 no-show ✅ shipped by M23-S27; UC-070 staff variant ✅ shipped by M23-S19)

> Everything above this line is shipped, as are the UC-071 approval screens below (M23-S13) and the UC-074 section (M23-S27). The staff creation of a recurring schedule (M23-S19) shipped too. See `docs/02-DOMAIN_MODEL.md` § `RecurringBookingSchedule`, `docs/14-API_CONTRACTS.md` § Recurring Private Reservation Schedules.

**Prototype screens (revised 2026-10-08):**
- `00-agenda.html` (built in M23-S13; the former `00c` was folded in) — the recurrence-request card in "Precisa de ação" and the floating **"Filtrar agenda"** balloon. Card: teal `Recorrência` badge, teal left border, pattern as title, "Decidir até HH:mm", one **"Ver pedido"** button (no quick approve — one decision creates the whole term). Balloon: checkboxes grouped *Precisa de ação* (Agendamentos, Recorrências) and *Confirmados* (Hoje, Próximos dias); default all on; "Padrão" resets; a count badge on the trigger shows how many are hidden; empty state "Limpar filtro". The header count is computed from what is visible.
- `08-recurring-schedule-approval.html` — rebuilt on `01-booking-detail.html`'s `detail-layout` (details centred, action panel right on desktop, fixed action bar on mobile, bottom nav hidden). Approve and reject each open a confirmation sheet. Reject has **no reason field** — `POST …/reject` takes no body. The request card ends with a **"Solicitado em"** row (`createdAt`, tenant timezone, same wording as `01`'s Origem card): the schedule read gains `createdAt` in M23-S13 (decided 2026-10-15), hidden when the field is absent.
- `08b-recurring-approval-result.html` — the detail page in its decided/failed states (`#aprovada`, `#recusada`, `#conflito`, `#expirada`, `#telefone`, `#falha`) — result banner on top of the centre column, the request data kept visible, the right-hand action panel (mobile bar) swapped to "Voltar à agenda" or, when the request is still pending, to retry/reject. Same convention as `01c`/`04b`/`05c`. `09` and `09b` follow the create-form convention of `servicos/02` (form in the centre, action panel on the right, fixed action bar on mobile), and `09c` follows the inline-state convention too: the staff-creation outcomes are banners over a recap of the pattern with an action panel, not a separate result page.
- **Expired hold, not drawn (added 2026-10-15 after manual testing):** a request still `PENDING_APPROVAL` whose 30-minute hold has passed (the expiry job has not cancelled it yet — in local development it never does). The Agenda card reads "Prazo encerrado" in red instead of "Decidir até HH:mm"; `08` shows a red banner "O prazo para decidir terminou às HH:mm. Não é mais possível aprovar este pedido. Recuse-o para tirá-lo da fila; se ninguém o fizer, o sistema o cancela sozinho." in place of the amber deadline banner, hides the approve button and the approve paragraph of "O que acontece", and keeps **Recusar**. A `409 NOT_PENDING_APPROVAL` on such a request (still pending after the re-read) is shown the same way, not as `#expirada`.

**"+ Novo" menu (added 2026-10-08):** one button above the queue opening a menu — *Agendamento* (UC-108, M23-S39/S40, live: in `00-agenda.html`) and *Recorrência* (UC-070, M23-S19, planned: not drawn in `00-agenda.html` until S19 ships). Both start at the shared customer chooser `09-escolher-cliente.html?tipo=agendamento|recorrencia`.

### Staff creates a booking on a customer's behalf — `09`, `10`, `10b` (UC-108, M23-S39 backend/BFF + M23-S40 frontend)

| File | Screen | Route (proposed) |
|---|---|---|
| `09-escolher-cliente.html` | Who is it for: *Cliente cadastrado* (search) or *Novo contato* (guest) — shared with the recurrence flow | `/dashboard/bookings/new?tipo=…` |
| `10-novo-agendamento.html` | The booking steps in the dashboard skin; summary + actions in the right pane | `/dashboard/bookings/new/booking` |
| `10b-novo-agendamento-resultado.html` | Inline outcomes (`#criado`, `#ocupado`, `#janela`, `#telefone`, `#cliente`, `#falha`) | same route, result states |

**BFF calls:** `GET /customers?search=&limit=` (name, e-mail or **phone**, ≥5 characters; result items carry `phone`), then the same public reads the customer flow uses (services, resource options, duration quote, availability), then `POST /bookings/staff` with either `customerId` or `contactName`+`contactPhone`+`contactEmail` (never both).

**Rules the screen shows:** the booking is created `APPROVED` (no waiting state, no manager alert, the customer or guest gets the confirmation e-mail); slots inside the tenant's minimum notice are offered (marked with a dot) because the backend skips that one rule for staff, while past dates and dates beyond the maximum advance stay blocked; the guest option is disabled for a recurrence because a recurrence needs an account.

**Reuse and the styling boundary (revised 2026-10-13, M23-S40 discovery):** the staff shell has its own design system and takes no tenant branding. **Share logic, never markup**: the model, the flow/selection/form-data/quote hooks and an extracted controller core are the public flow's own; every step view is the dashboard's, built on `shared/components/ui/`. `variant="dashboard"` stays only on `ErrorAlert`, `SlotPicker` and `AvailabilityCarousel` (the staff-reschedule precedent); no new variant is added. Wrapping the staff page to define `--ba-*` is rejected. The full per-component table is in `plan/M23-MULTIVERTICAL-APPOINTMENT-BOOKING.md` § M23-S40.

**The steps are not fixed at three.** `resolveStaffBookingSteps()` is the public `resolveBookingSteps()` minus the `personal` step: services (with the pickup address when a service needs it), then one resource-picker step per requirement that needs a choice (one per leg for a legged service), a duration step for a customer-selected duration, date and time, intake (skippable for staff), and the confirmation (a legged service lists its itinerary). `10` draws the simplest basket; the other steps are the dashboard skin of the public prototypes' states (`customer/prototypes/book-a-service/`) and are not drawn here. A pickup address for a new contact is typed on the Services step; for a registered customer it is pre-filled from `GET /v1/customers/:id` (`defaultAddress`) and editable.

**Chooser details:** the initial list is the first page of `GET /customers` (alphabetical — the backend has no recency order), so it is headed "Clientes", not "Clientes recentes" as drawn in `09`; the 5-character minimum applies only once a term is typed. A registered customer travels as `?customerId=` in the URL; a guest contact stays in memory only. The date step always uses the carousel, with `minBookingAdvanceHours = 0` (the existing components apply the notice client-side) and the dot on slots inside the notice. "Recorrência" is not in the menu until M23-S19 ships.

**Synced component:** the balloon reuses the shape of `ScheduleStatusFilterMenu.tsx` / `ResourceFilterMenu.tsx` (`apps/web/features/booking/components/dashboard/schedule/`). The balloon is built on the shared `FloatingFilterMenu` (extracted in M23-S13), not a third copy.

**Error → screen map (`POST /recurring-booking-schedules/:id/approve|reject`):** `409 BOOKING_RECURRING_SCHEDULE_CONFLICT` (approve) → `#conflito`, with the same `conflicts[{ occurrenceStart, reason }]` list creation returns; `409 BOOKING_RECURRING_SCHEDULE_NOT_PENDING_APPROVAL` → `#expirada`; `422 BOOKING_CUSTOMER_PHONE_NOT_SET` (approve) → `#telefone`; network/5xx → `#falha`.

**File map (❓ none exist yet):**

| File | Status |
|---|---|
| `apps/web/features/booking/components/dashboard/bookings/` — `NewMenu`, `CustomerChooserStep`, `NewBookingForStaffPage`, `NewBookingSummaryCard`, `NewBookingOutcome` and the `new-booking/` step views; routes `apps/web/app/dashboard/bookings/new/page.tsx` and `new/booking/page.tsx`; `useStaffBookingFormController` over an extracted `useBookingFormCore`; the `booking-route.ts` exclusion of `new` | ✅ Created — M23-S40 |


| File | Status |
|---|---|
| `apps/web/features/booking/components/dashboard/bookings/` — recurrence card in `BookingQueuePage.tsx`, a `RecurringScheduleCard`, a `RecurringScheduleApprovalDetail` page, the "Filtrar agenda" balloon, and `apps/web/app/dashboard/bookings/recurring/[id]/page.tsx` | ✅ Created — M23-S13: `RecurringScheduleCard`, `RecurringScheduleApprovalDetail` (+ `RecurringScheduleRequestSummary`, `RecurringApprovalBanner`, `RecurringApprovalActions`, `RecurringDecisionSheet`), `BookingQueueActionNeeded` and `AgendaFilterMenu` in `dashboard/bookings/`; the shared `FloatingFilterMenu` + `FilterCheckboxOption` in `dashboard/` (Horários' two filters were rebuilt on it); `agenda-preferences.ts` (the per-tenant filter memory); the staff hooks in `useRecurringSchedules.ts` and `useStaffCustomer.ts`; the route `app/dashboard/bookings/recurring/[id]/page.tsx` with its `recurring-schedule-route.ts` matcher, topbar title and `BottomNav` entry. The backend only gained `createdAt` on the schedule read |
| `03-booking-detail-approved.html`'s no-show action (+ `03c`–`03g`) | ✅ Created — M23-S27: `NoShowSheet`, `CorrectNoShowSheet`, `BookingStatusHistory`, `BookingNoShowBanner`, the `BookingActionPanel` / `BookingDetailAsideCard` branches, and `useNoShowAvailability`; no new route. The backend/BFF came with M23-S09 |
| `apps/web/app/dashboard/bookings/recurring/new/page.tsx` | ✅ Created — M23-S19 (server route: the chosen `?customerId=`, the eligible services and the empty-state reason) |
| `apps/web/features/booking/components/dashboard/bookings/NewRecurringScheduleForStaff.tsx`, `NewRecurringScheduleForStaffResult.tsx`, `NewRecurringScheduleForStaffNoServices.tsx` (the customer step is **not** built here: S40's `CustomerChooserStep` is reused with `kind="recorrencia"`, and `NewBookingChooserPage` reads `?tipo=` and routes a recurrence to `recurring/new?customerId=`) | ✅ Created — M23-S19. The pattern fields are the shared `features/booking/components/recurring/RecurringScheduleFields` (extracted from the customer form, which wraps it in its own title, pane and review); the staff shell adds the customer chip, the direct "Criar recorrência" and the six outcome panels |

**BFF calls:**
```
GET  /recurring-booking-schedules?status=PENDING_APPROVAL   -- UC-071 queue
POST /recurring-booking-schedules/:id/approve|reject          -- UC-071
GET  /customers?search=&limit=                                 -- UC-070 staff variant: customer picker (STAFF|MANAGER; existing endpoint)
POST /recurring-booking-schedules   (body carries customerId)  -- UC-070 staff variant
POST /bookings/:id/no-show                                    -- UC-074   (STAFF|MANAGER; body { reason? } max 500)
POST /bookings/:id/no-show/correct                             -- UC-074 A3 (MANAGER only; body { correctedStatus: 'COMPLETED', reason } reason required)
```

**Open questions / gaps:**
- [x] Stories exist: `M23-S13` (approval queue, UC-071), `M23-S09` (no-show backend/BFF, UC-074 — the button and correction UI are M23-S27), `M23-S19` (staff creating on a customer's behalf) — each still begins with `/story-discovery`.
- [x] **Queue placement — decided 2026-10-08:** recurrence requests fold into "Precisa de ação" (badge + filter balloon), not a tab. Decided at `M23-S13`'s discovery (2026-10-15): the filter is remembered per tenant, the recurrence cards are pinned above the bookings by decision deadline (every page is read), and a day pick does nothing visible while "Próximos dias" is hidden — see `../../agenda.md`.

### Staff creating a recurring schedule on a customer's behalf — `09`, `09b`, `09c` (M23-S19)

Added 2026-09-29 as a deliberately small first pass in the same staff dashboard shell as `08`; **redrawn 2026-10-15 after TD49** (every service shape the server accepts, the empty states, the pattern refusals and the customer-without-phone outcome); every choice is still a default to recheck at `M23-S19`'s story-discovery. The flow diagram is in `../../agenda.md`. UC-070 allows staff to create on a customer's behalf and `POST /recurring-booking-schedules` already accepts it (`@Roles('CUSTOMER','MANAGER','STAFF')`, body `customerId`), so this is a frontend story.

| File | Screen | Route |
|---|---|---|
| `09-escolher-cliente.html` | Step 1 — pick the customer (the shared chooser, `?tipo=recorrencia`; shipped by M23-S40) | `/dashboard/bookings/new?tipo=recorrencia` |
| `09b-nova-recorrencia-padrao.html` | Step 2 — the pattern, for the chosen customer; variants in the hash (see the header comment of the file) | `/dashboard/bookings/recurring/new?customerId=` (proposed — two segments after `/dashboard/bookings/`) |
| `09c-nova-recorrencia-resultado.html` | Outcomes of an accepted pattern (one panel each; `?forma=` switches the recap between the service shapes) | same route, result states |

**Customer picker:** there is none of this story's own. `CustomerChooserStep` (S40) already searches (`GET /customers`, name / e-mail / phone, 5-character minimum once a term is typed, alphabetical first page — see "Chooser details" above) and already disables the guest option for `kind="recorrencia"`; the registered customer travels as `?customerId=`. S19 only makes `NewBookingChooserPage` read `?tipo=` (it hard-codes `agendamento` today) and send a recurrence to the pattern route. A guest can never have a recurrence.

**Pattern form (`NewRecurringScheduleForStaff`):** the same fields and rules as the customer flow (`customer/prototypes/minha-conta/13-nova-recorrencia.html`, which owns the service filter, the resource field, the duration rule and the validation table) plus the chosen customer's chip with "Trocar cliente". The service list has no server-side recurrence filter, so the client filters with the shared `recurrence-shape.ts` / `recurring-service-eligibility.ts` (one code for the customer and the staff form, mirroring `assertServiceEligible`): `recurrenceEligible`, `APPOINTMENT`, no `legs`, no pickup address, every requirement of quantity 1 with mode `CUSTOMER_CHOICE` / `AUTO_ANY` / `AUTO_FUNGIBLE_POOL` (or `NONE` only on the default location), and a duration the customer does not choose. That makes three shapes eligible — **no requirement** (`09b #padrao`, no resource field), **one requirement** (`#simples`) and a **bundle** (`#pacote`, `#pacote-duas`). The form model is `apps/web/features/booking/model/recurring-schedule-form.ts` + `recurring-requirements.ts`: one pick per `CUSTOMER_CHOICE` requirement keyed by its resource type, all picks or none sent, every group required (`RESOURCE_REQUIRED`), the first option preselected. A group whose options are loading, failed or empty blocks submit without hiding the other groups (`#opcoes`). **Staff are exempt from the minimum notice and the maximum days ahead** (UC-070 A10), so the customer's first-occurrence pre-check (`checkFirstOccurrence()`: `TOO_SOON` / `TOO_FAR_AHEAD`) must not run here; only "in the past" and "no occurrence" do. The form components and `useRecurringResourceOptions` live in `features/customer/` today — S19 extracts or re-implements them for the dashboard (decision D of the story).

**BFF call:**
```
POST /recurring-booking-schedules
  Body: { customerId, serviceId, recurrence: { frequency: "WEEKLY", daysOfWeek, startTime, durationMinutes },
          resourceSelections?: [{ resourceType, resourceId }], startsOn, endsOn }   // the server derives the assignment policy (TD49 Story 0)
  Response 201: { id, status: "ACTIVE" | "PENDING_APPROVAL", approvalHoldExpiresAt }
```
`endsOn` is **required** and at most `startsOn` + the service's maximum term (`recurringHorizonDays`, 90 days by default) — a `422` `BOOKING_RECURRING_SCHEDULE_INVALID_DATE_RANGE` otherwise. The schedule is fixed-term: every occurrence of the term is checked and created once (immediately, or when staff approve in `08`); there is no rolling generation and no Pause. `customerId` is required for a staff actor: the backend returns `404` `BOOKING_CUSTOMER_NOT_FOUND` when it is missing, unknown, or the actor is not an active staff member.

**Outcome → panel (`09c`):**
| Outcome | Panel |
|---|---|
| `201` `ACTIVE` | `#criada` |
| `201` `PENDING_APPROVAL` | `#aguardando` |
| `409` `BOOKING_RECURRING_SCHEDULE_CONFLICT` | `#conflito` |
| `409` `BOOKING_RECURRING_SCHEDULE_CAP_REACHED` | `#limite` — no resource named: the cap is per picked resource or per service |
| `422` `BOOKING_CUSTOMER_PHONE_NOT_SET` (UC-070 A12) | `#telefone` |
| `404` `BOOKING_CUSTOMER_NOT_FOUND` | `#cliente` |
| network / `5xx`, and the codes the form should make unreachable (`BOOKING_RECURRING_SCHEDULE_INELIGIBLE_SERVICE`, `BOOKING_RESOURCE_SELECTION_REQUIRED`) | `#falha` — the typed pattern is preserved |

**Pattern refusals go back to `09b`, not to `09c`** (the customer's `13e` convention; the pattern is kept): `422` `…INVALID_DATE_RANGE`, `…TERM_EXCEEDED` and a `400` missing `endsOn` → `09b #erros`; `422` `BOOKING_SCHEDULED_IN_PAST` → `#recusa`; `422` `…NO_OCCURRENCES` → `#sem-ocorrencia`. `BOOKING_TOO_SOON` / `BOOKING_TOO_FAR_AHEAD` never occur for staff.

**Empty states (`09b #sem-servicos` / `#sem-elegivel`)** mirror the customer's `13g`: no service has recurrence enabled / some have it enabled but none qualifies. Staff are sent to Serviços (the editor's advisory hint names the reason) or to a one-off booking; the form is not rendered.

All the `BOOKING_RECURRING_SCHEDULE_*`, `BOOKING_CUSTOMER_NOT_FOUND`, `BOOKING_CUSTOMER_PHONE_NOT_SET`, `BOOKING_RESOURCE_SELECTION_REQUIRED` and window codes are already translated in both `errors.json` files.

**Known limitations of this prototype (gap variants, not silently dropped):**
- ✅ **Approval on a staff-created schedule — decided and shipped (M23-S19, 2026-10-16): staff skip it.** A schedule a staff member creates for a manual-approval service is created `ACTIVE` at once, with `approvedByStaffId` = that staff member and every occurrence materialized in the same transaction (the staff member is the approver, as in UC-108); the customer path is unchanged. `09c #aguardando` is therefore not reachable for staff and stays in the prototype only as history; the real result screen has six panels.
- ✅ **The customer is notified (M23-S28, shipped; this bullet used to say nobody is).** The customer is e-mailed when the schedule becomes `ACTIVE` (including a staff-created one), when it is rejected or expires, and when it ends; managers are alerted about a waiting request. `09b` ("Como funciona") and `09c #criada` say so.
- ✅ **The conflict list in `#conflito`** is the `conflicts` field of the `409` (`[{ occurrenceStart, reason }]`, reasons `OCCUPIED` / `CLOSED` / `OUTSIDE_HOURS`, occupancy and hours merged into one list), shipped by `M23-S18`. The panel draws a mixed list ("Já reservado" and "Fechado"). For a bundle the payload does not say which requirement collided, so the sentence above the list names no resource.
- ⚠ **Fixed term (2026-09-29):** `09b` has a required end-date field capped at the service's maximum term, `09c #criada` says all the term's reservations exist at once, and `08` shows the requested term and says approving creates every occurrence at once (after the checks re-run; an occurrence that no longer passes goes to the exception worklist instead of being created).
- ✅ **Entry point and route — shipped (M23-S19).** The entry is the "Recorrência" item of the Agenda's single "+ Novo" menu; the chooser reads `?tipo=recorrencia`; the pattern route is `/dashboard/bookings/recurring/new?customerId=` (two segments after `/dashboard/bookings/`), registered in the topbar title resolver (before the `/dashboard/bookings` prefix entry) and the `BottomNav` drill-down matcher. `matchRecurringScheduleRoute` excludes `new`, so it is never read as the approval screen of a schedule with id `new`.
- ⚠ **Out of scope, as in the customer flow:** variable-duration services, services with `legs`, a pickup address or a requirement of quantity above 1.
- ✅ **Bundles are drawn for the staff screens (redraw of 2026-10-15).** `09b` follows the customer prototype `customer/prototypes/minha-conta/13h-nova-recorrencia-pacote.html`: one pick group per `CUSTOMER_CHOICE` requirement, the automatic requirement as a read-only line, titles by resource type; `09c`'s recap lists one row per requirement (`?forma=pacote`). `08` was redrawn the same day: the "Recurso" row is one row per requirement, labelled by resource type — the picked resource by name (the real page resolves names from `resourceAssignments`, which carries ids only) and "Resolvido a cada ocorrência" for an automatic requirement. Shapes switch by hash: `#simples` (no resource row), `#um` (default), `#pacote`. See the "Bundles" bullet of `M23-S13` in `plan/M23-MULTIVERTICAL-APPOINTMENT-BOOKING.md`.
- ⚠ **Prototype palette.** `09b`/`09c` use the `--ba-*` tokens like every prototype in this folder; the implementation is Tailwind + shadcn in the dashboard shell and must never read `--ba-*` (CLAUDE.md §8).
- ⚠ **`08`'s sidebar and bottom-nav links** pointed at the wrong prototypes (and one missing file) when it was relocated from discovery; corrected on 2026-09-29.

### UC-074 — Não comparecimento (no-show) and its correction — `03`, `03c`–`03g` (M23-S09 backend/BFF; UI = M23-S27)

Added 2026-09-30, after the M23-S09 `/story-discovery`. Same route and component as the approved-booking detail (`/dashboard/bookings/:id`, `BookingDetailPage` + `BookingActionPanel`); only new `actionState` values and one new branch of the action panel. The flow diagram is in `../../agenda.md`.

| File | Screen | `actionState` / branch |
|---|---|---|
| `03-booking-detail-approved.html` | APPROVED detail + "Marcar não compareceu" + bottom sheet (optional reason) | `idle` → sheet → `no-show` |
| `03c-no-show-not-yet-ended.html` | Action **disabled** with hint; `#rejeitado` = the 422 banner | `idle` (disabled) · `no-show-not-ended` |
| `03d-no-show-success.html` | Inline success, badge "Não compareceu" | `no-show` |
| `03e-no-show-error.html` | `#terminal` 409 · `#falha` network/5xx | `no-show-terminal` · `no-show-error` |
| `03f-booking-detail-no-show.html` | NO_SHOW detail + status history; `#gerente` shows "Corrigir para concluído", `#equipe` hides it | NO_SHOW branch |
| `03g-correct-no-show.html` | Correction sheet (required reason) · `#sucesso` · `#falha` · `#permissao` | `correcting` → `corrected` · `correct-error` · `correct-forbidden` |

**Button visibility:**
| Booking | STAFF | MANAGER |
|---|---|---|
| `APPROVED`, end time passed | "Marcar não compareceu" enabled | same |
| `APPROVED`, end time not passed | "Marcar não compareceu" **disabled** + hint "Disponível após o término do atendimento (HH:mm)" (HH:mm = `scheduledAt + totalDurationMins`, tenant timezone) | same |
| `NO_SHOW` | no action; the panel says so (the correction button is **hidden**, not disabled) | "Corrigir para concluído" |
| any other terminal status | no no-show action | same |

**BFF calls:**
```
POST /bookings/:id/no-show           body { reason?: string (<= 500) }                 -- STAFF|MANAGER
POST /bookings/:id/no-show/correct   body { correctedStatus: 'COMPLETED', reason }     -- MANAGER only
```
| Outcome | Panel |
|---|---|
| no-show `200` | `03d` |
| `409` `BOOKING_ALREADY_TERMINAL` | `03e #terminal` |
| `422` `BOOKING_NOT_YET_ENDED` | `03c #rejeitado` |
| `422` `BOOKING_INVALID_TRANSITION` (still `PENDING`/`INFO_REQUESTED`) | not reachable from the UI — the action only renders on `APPROVED` |
| network / `5xx` | `03e #falha` |
| correct `200` | `03g #sucesso` (loyalty points awarded by the resulting `BookingCompleted`) |
| correct `403` | `03g #permissao` |
| correct network / `5xx` | `03g #falha` |

**Field constraints:** no-show `reason` optional, max 500, an **internal** note (never shown to the customer, in the email or on `customer/prototypes/minha-conta/02f`). Correction `reason` required, trimmed, 10–500 characters — locked at M23-S27's discovery (2026-10-10; same minimum as Reject). The correction completes every line at its booked price: no photos, notes or points-discount fields in `03g`.

**Status history (`03d`, `03f`, `03g`):** read from `booking_status_transitions` (created by M23-S09; complete for all transitions from M23-S26). It is part of the staff `GET /bookings/:id` (`statusHistory`, oldest first); the backend resolves the actor names (the BFF's `/staff` list is manager-only), and the UI falls back to the role label when `actorName` is `null` (guest, system, or an unresolvable staff member).

**`.status-no-show`** (violet) was added to `plan/journey/shared/tokens.css`; the customer list and detail use it too (`customer/prototypes/minha-conta/01`, `02f`).

**Known limitations of this prototype (gap variants, not silently dropped):**
- ✅ **The customer email** ("foi avisado por email" in `03`, `03d`) shipped with `M23-S25`.
- ✅ **The history card** in `03d`/`03f`/`03g` is read from the staff `GET /bookings/:id` (see above).
- ⚠ **Role switch in `03f`** is a hash toggle for the prototype; in production the role comes from the JWT.
- ⚠ **The `NO_SHOW` web status display** (label, colour, icon in `booking-status.ts`, `BookingStatusIcon.tsx`, `schedule-page-controller-result.ts`) shipped with `M23-S09`, not with the UI story.
- ⚠ **Deviations from the drawn screens (M23-S27):** the sheets' dismiss button reads "Cancelar" (the existing sheets' key) instead of "Voltar"; the history timestamp reads "{date} às {time}" instead of "hoje às HH:mm"; the `correcting` state of `dev-notes` is the open sheet (`sheetState = 'correct-no-show'`), not an `actionState`.

## Full booking detail — what the page must show (audit of 2026-10-15)

The shipped staff detail (`BookingDetailMain.tsx`) renders customer, info exchange, date and time, a services table, photos and the status history — nothing about the new scheduling fields. `01`, `03` and `03f` were redrawn with **shape variants** (`?forma=simples|recurso|pacote|trajeto|formulario|retirada|recorrente|equipe|completo`, default `completo` — every card; the real page shows only the cards that have data) and two read-only states were added: `03h` (COMPLETED, with the charge summary) and `03i` (CANCELLED, with who/when/why). The same cards appear in all of them.

| Card (screen) | Fields | Where the data is today |
|---|---|---|
| Recursos reservados (`?forma=recurso\|pacote`) | One row per requirement, labelled by resource type; name when there is a resource (tag "escolhido pelo cliente" / "atribuído pelo sistema"), "Do conjunto" for a fungible pool | **Needs backend + BFF.** The list card already has `assignedResources`; the detail response has none. Source for every status, a cancelled or rejected booking included: the latest `booking_line_resource_assignments` row per slot (the audit table a cancel does not delete), through a new query beside `LATEST_RESOURCE_ASSIGNMENTS_SQL` that also returns line, leg and quantity position (M23-S47 decision 2) |
| Trajeto (`?forma=trajeto`) | Per leg: resource, start–end | **Needs backend + BFF.** `BookingResponse` (the create response) has `itinerary`; the staff detail does not. Leg order and resource come from the assignments; the leg times come from `resource_occupancy` and exist only while those rows do (never after a cancel or reject, and not after the 90-day purge): such a leg is drawn without a time (`03i`) |
| Participantes (`?forma=formulario`) | `participantCount`, `attendees` (name, minor) | **Needs backend + BFF** — on the aggregate, not in the detail response |
| Formulário de entrada (`?forma=formulario\|equipe`) | Answers by question, schema version, consent date; "não coletado" for a staff-created booking | **Needs backend + BFF** (`intake`, `consentAcceptedAt`) |
| Observações do cliente | `notes` | Backend detail has it; **the BFF staff mapper drops it** |
| Endereços (`?forma=retirada\|completo`) | `pickupAddress`, `contactAddress` | In `StaffBookingDetailResponse` already; **the page never renders them** |
| Origem | "Solicitado em" (`createdAt`), recurrence link (`recurringScheduleId`), "Criado por" (`createdByStaffId`) | `createdAt` in backend detail, dropped by the BFF mapper; `recurringScheduleId` and `createdByStaffId` **need backend + BFF** (M23-S40 decision 14 deferred "Criado por") |
| Notas internas (`03h`: one card, shown whenever `adminNotes` is set; `?forma=completo` elsewhere) | `adminNotes` | Backend detail has it; **dropped by the BFF mapper**. Staff only |
| Cobrança (`03h`) | **Not S47 work** — the completed banner already shows quoted, discount, charged and points earned (`BookingCompletionSummary`); the separate card drawn on 2026-10-15 was removed on 2026-10-16 | Already built |
| Cancelamento / Rejeição (`03i`) | Who, when, reason (a customer's own cancel has no reason) | `rejectionReason` is in the DTO; `cancelledAt/By`, `cancellationReason`, `rejectedAt/By` are on the aggregate and **need backend + BFF** |
| Duração escolhida (service line note) | **Dropped from M23-S47 (2026-10-16):** the line already shows the duration; saying it was chosen would need the service's current duration mode, which may have changed | — |

Built by M23-S47 (the "Cobrança" and "Duração escolhida" rows excluded, see their rows); the screens were the reference for a "full staff booking detail" story (backend + BFF fields, then the web cards). The customer detail has the matching cards in `customer/prototypes/minha-conta/02*`.

- ⚠ **Prototype mechanics:** `?forma=` is a query parameter (not a hash) because `03f` already uses the hash for its role switch. The service name on the line changes per shape for illustration only.
- ⚠ **Photos label** in `01`/`03` is now "Fotos enviadas pelo cliente" (was "do veículo", a car-wash leftover).
- ⚠ **`08` data sources:** customer name from `GET /customers/:customerId`; resource names resolved from the tenant resource list using `resourceAssignments` (ids only); which rows to draw from the service's `resourceRequirements`; "Até N" computed from the pattern; the real count comes from the approve response's `occurrenceCount` (`08b #aprovada-parcial`).

### UC-073 / UC-077 — A booking that needs a decision is marked — `00d`, `03j`, `03k` (M23-S46)

**Built by `M23-S46` (2026-10-15).** Added 2026-10-15, after the M23-S14 live test ("a booking in Reservas a resolver should not look like any other"). **Decided: the booking stays in the queue and is marked — never hidden** (it is still a real commitment, STAFF cannot open the manager-only worklist, and the queue and the Agenda share `GET /bookings`). No new route and no new component family: one badge in the existing queue card and one banner on the existing detail page.

| File | Screen | Notes |
|---|---|---|
| `00d-agenda-precisa-decisao.html` | The queue with the pill on three cards, one per section | The pill sits after the status badge; the card and its stretched link are unchanged, but the quick actions ("Aprovar", "Marcar concluído") are **not shown** on a marked card. The manager sidebar also shows "Reservas a resolver" below "Agenda" (shipped in M23-S14; the older screens do not draw it) |
| `03j-booking-detail-precisa-decisao.html` | Approved detail with the banner and the decision panel (MANAGER) | Banner above "Cliente" with no link; the **decision panel** (desktop right column, mobile bottom bar; orange border, title "Decisão") replaces the normal action panel: **Reatribuir** (primary) · **Reagendar** (approved only) · **Cancelar agendamento**. No Marcar concluído / Marcar não compareceu / no-show sheet. The buttons link to the worklist prototypes (`manager/prototypes/scheduling-exceptions/01c`, `01e`, `01f`); in production Reatribuir and Cancelar open the shipped `ReassignSheet` / `CancelSheet` over this page and Reagendar goes to the shipped reschedule route. Redrawn 2026-10-15 (the earlier "Abrir Reservas a resolver" button was removed: it sent the manager to a list to find the booking again) |
| `03k-booking-detail-precisa-decisao-staff.html` | The same banner for STAFF | No link and no decision panel: the worklist is manager-only (`proxy.ts`) |

**No normal actions while the decision is pending (decided 2026-10-15):** a booking that needs a decision shows none of its normal action buttons, neither the queue card's quick actions nor the detail's panel (Marcar concluído, Marcar não compareceu, Reagendar, Cancelar, and Aprovar / Rejeitar for a pending one). Why: nothing closes a worklist entry when a booking is cancelled, rescheduled or completed through the normal booking actions, so doing it from the detail would leave the entry open on a booking that no longer needs it; and "Marcar não compareceu" is refused by the backend until the appointment has ended anyway. The only actions are the decision ones (Reatribuir, Reagendar, Cancelar), taken from the MANAGER's decision panel on the detail or from "Reservas a resolver"; both close the entry in the same step. STAFF has no action. This only hides buttons: the backend endpoints still accept the calls, and a guard or an auto-close on those use cases is a separate decision.

**Data:** `hasOpenException: boolean` on `StaffBookingCardResponse` (queue) and `StaffBookingDetailResponse` (detail); `true` when the booking has an `OPEN` worklist entry. Customer responses never carry it.

**Copy (pt-BR first, `en` twin in the same commit):** pill "Precisa de decisão"; banner title "Esta reserva precisa de uma decisão"; body "O recurso desta reserva foi desativado. Escolha como resolver: reatribuir a outro recurso, reagendar ou cancelar." (MANAGER, no link; the decision panel below carries the actions) or "O recurso desta reserva foi desativado e um gerente precisa decidir. Peça a um gerente para resolver." (STAFF); panel title "Decisão".

**Known limitations of this prototype:**
- ⚠ **Colour:** the pill is orange (`#ffedd5` / `#9a3412` → Tailwind `bg-orange-100 text-orange-800`) so it is not confused with the yellow "Pendente" or the amber "Visitante"; the banner is the same family (`#fff7ed` border `#fdba74`, icon `#ea580c`, text `#c2410c`).
- ⚠ **The shipped `BookingStatusBannerIcon` has only `success`, `danger` and `info`:** the implementation adds a `warning` variant (orange circle, alert-triangle icon) — this is in the story's file list.
- ⚠ **The pill is a plain badge, not a link** (the card is one stretched link to the detail); nothing on the booking links to the worklist: the manager resolves from the decision panel.
- ⚠ **Decision panel data:** the panel matches the open worklist entries (`useOpenSchedulingExceptions()`) by `affectedId`; the entries carry the `alternatives` that disable Reatribuir when there is none. No new field on the booking response.
- ⚠ **Role switch:** `03j` vs `03k` is two files for the prototype; in production the role comes from the JWT. `03k` inherits the base screen's sidebar, which still lists the manager-only section; the real STAFF sidebar does not.
- ⚠ **The base screens were not redrawn by this change:** `00d` is derived from `00-agenda.html`, and `03j` / `03k` from `03-booking-detail-approved.html` as redrawn by M23-S47's prototype work (the resources card and the `?forma=` shapes come from there). If that screen changes again, regenerate `03j` / `03k`.
- ⚠ **Pending booking:** the banner and panel are drawn on an approved booking (`03j`). A `PENDING` or `INFO_REQUESTED` detail gets the same banner and the same panel **without Reagendar** (the resolve contract allows `RESCHEDULE` only for `APPROVED`) and without Aprovar / Rejeitar while the decision is open.

## ✅ Done — M23-S50: the floating filter can be dragged to a corner (`11-filtro-flutuante.html`)

Drawn 2026-10-16. Frontend only (no BFF, no migration). Behavior and decisions: `../../agenda.md` § "M23-S50 addition". Horários' two-pill variant: `../horarios/10-filtros-flutuantes.html`.

- **Variants:** `#cantos-tl|tr|bl|br` (pill parked in each corner), `#posicao` (popover open on the "Posição" row), `#mobile` (the same page in a 390px frame, so the media queries apply: bottom corners clear the bottom nav). The drag is live in the prototype and snaps to the nearest corner; nothing persists.
- **Components (as built, `apps/web/features/booking/`):** `components/dashboard/FloatingFilterDock.tsx` (the fixed container, owns the corner and stacks the page's filters) with `floating-filter-dock-context.ts` (its hook throws outside a dock), `FloatingFilterMenu.tsx` (orientation from the dock's corner, "Posição" row, `positionClassName` dropped), `hooks/useDraggableCorner.ts` (Pointer Events + capture, 6px threshold, `touch-none` on the pill only), `model/floating-filter-corner.ts` (pure geometry and the per-corner classes), `schedule/floating-filter-preferences.ts` (corner per tenant + page). Reuse `Button` from `shared/components/ui/`; no drag library.
- **Prototype CSS → Tailwind:** `.filter-dock.c-br` = `bottom-24 right-4 lg:bottom-6 lg:right-6`; `.c-bl` = `bottom-24 left-4 lg:bottom-6 lg:left-[calc(15rem+1.5rem)]`; `.c-tr` = `top-[4.75rem] right-4 lg:right-6`; `.c-tl` = `top-[4.75rem] left-4 lg:left-[calc(15rem+1.5rem)]`. The top offset (4.75rem) is a prototype value; the real one is pinned by an E2E bounding-box assertion at implementation.
- **A click is still a click:** a drag release must not toggle the popover (the prototype suppresses the click that follows a drag).
- ⚠ A pill in a top or left corner can cover page content — accepted (decided 2026-10-16); the user chose the corner and "Posição" returns it to the default.


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
| `apps/web/app/dashboard/bookings/page.tsx` + `.../BookingQueuePage.tsx` | Queue list |
| `apps/web/app/dashboard/bookings/[id]/page.tsx` + `.../BookingDetailPage.tsx` | Detail + triage actions |
| `.../BookingActionPanel.tsx`, `RejectBookingSheet.tsx`, `RequestInfoSheet.tsx`, `SlotConflictAlert.tsx` | Triage sub-components |
| `.../AdminCancelBookingSheet.tsx` | UC-008 cancel |
| `apps/web/app/dashboard/bookings/[id]/reschedule/page.tsx` + `.../RescheduleBookingPage.tsx` | UC-008 A1 — dedicated page, not a modal over `[id]` |
| `apps/web/app/dashboard/bookings/[id]/complete/page.tsx` + `.../MarkCompleteBookingPage.tsx` | UC-009 — dedicated page, not a sheet |
| `.../BookingCompletionSummary.tsx`, `AfterServicePhotoUpload.tsx`, `BookingOutcomeActionRail.tsx`, `BookingDetailMain.tsx`, `BookingActionSheetShell.tsx`, `BookingClientCard.tsx`, `BookingCard.tsx` | Additional supporting sub-components not anticipated in the original draft |
| `apps/web/features/booking/api/**` | BFF fetchers |

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
| Reschedule calendar (`.day-pill` / `.slot-btn`) | Same `AvailabilityCalendar` component as the UC-011 booking flow — no new shadcn mapping needed | Confirm the component accepts a `mode: 'booking' \| 'reschedule'` prop, or extract its pure rendering from the basket-aware wrapper |
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
| `idle` | Click "Reagendar" | — | Navigates to `RescheduleBookingCalendar` (full screen/route) |
| `RescheduleBookingCalendar` confirm | `PATCH .../reschedule` → 200 | `rescheduled` | Green banner with old/new slot; **status stays APPROVED — action buttons return** (not terminal, unlike approve/reject/complete/cancel) |
| `RescheduleBookingCalendar` confirm | `PATCH .../reschedule` → 409 | `reschedule-conflict` | Inline error + adjacent slot suggestions, same pattern as `slot-conflict` |
| `idle` | Click "Cancelar" | — | Opens `AdminCancelBookingSheet` (no state change yet) |
| `AdminCancelBookingSheet` confirm | `PATCH .../cancel-admin` → 200 | `cancelled` | Red banner; no further actions (terminal) |

### Button visibility per `actionState` — lifecycle panel

| Button | `idle` | `submitting` | `completed` | `cancelled` | `rescheduled` | `reschedule-conflict` |
|---|---|---|---|---|---|---|
| Marcar concluído | ✅ | disabled | hidden | hidden | ✅ | ✅ |
| Reagendar | ✅ | disabled | hidden | hidden | ✅ | ✅ |
| Cancelar | ✅ | disabled | hidden | hidden | ✅ | ✅ |

---

## BFF calls

Wire these via `apps/web/lib/api/bookings-staff.ts`. All calls require `Authorization: Bearer <jwt>` (handled by the BFF session layer).

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

Response: StaffBookingDetailResponse  (@ikaro/types — add in M125-S04)
{
  id, status, scheduledAt, durationMinutes,
  customer: { id, name, email, phone },
  loyaltyBalance: number | null,   // from Loyalty context via BFF orchestration
  lines: { serviceId, serviceName, price, durationMinutes, points }[],
  infoRequestMessage: string | null,     // UC-005 field name (not informationNeeded)
  infoResponseMessage: string | null,    // UC-005 customer reply
  rejectionReason: string | null,
  createdAt, approvedAt, rejectedAt, infoRequestedAt, infoSubmittedAt
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
| Reject reason | max 200 chars | UC-004 |
| Info request message | max 200 chars | UC-005 |
| Reject reason minimum | none in MVP | User confirmed — no minimum enforced |
| Admin cancel reason | optional, no minimum length | UC-008 (confirmed against `CancelBookingAsAdminBody` in the 2026-06-16 UC audit) |
| Reschedule `adminNotes` | optional, freeform | UC-008 A1 |
| Complete `lines[].actualPriceCharged` | required per line, `>= 0` | UC-009 |
| Complete `afterServicePhotoUrls` | optional | UC-009 A3 — completion must work with zero photos |
| Complete `adminNotes` | optional | UC-009 |

Validate client-side in the Sheet before calling the BFF. Show a char counter (`{chars}/200`) below each textarea.

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
- The reschedule flow reuses the UC-011 `AvailabilityCalendar` with duration frozen at the existing booking's `totalDurationMins` (no basket/duration recompute).

---

## ❓ GAP — M23 Cluster 3 extension (UC-070 staff variant, UC-071, UC-074, not yet built)

> Everything above this line is shipped. Everything below is new, unimplemented scope. See `docs/02-DOMAIN_MODEL.md` § `RecurringBookingSchedule`, `docs/14-API_CONTRACTS.md` § Recurring Private Reservation Schedules.

**New prototype screen:** `08-recurring-schedule-approval.html` (relocated from `staff-07-recurring-schedule-approval.html`) — mirrors `01-booking-detail.html`'s approve/reject shape, scoped to the whole standing schedule request rather than one booking.

**File map (❓ none exist yet):**

| File | Status |
|---|---|
| `apps/web/features/booking/components/dashboard/agenda/RecurringScheduleApprovalQueue.tsx` | ❓ Gap — M23-S13 |
| `03-booking-detail-approved.html`'s no-show action | ❓ Gap — extend existing `BookingDetailApproved` component, no new screen (M23-S09) |
| `apps/web/app/dashboard/bookings/recurring/new/page.tsx` | ❓ Gap — M23-S19 (route proposed; see the route question below) |
| `apps/web/features/booking/components/dashboard/bookings/NewRecurringScheduleCustomerStep.tsx`, `NewRecurringScheduleForStaff.tsx`, `NewRecurringScheduleForStaffResult.tsx` | ❓ Gap — M23-S19 (the Agenda page's real folder is `dashboard/bookings/`, next to `BookingQueuePage.tsx`; `M23-S13`'s plan cites an `agenda/` folder that does not exist) |

**BFF calls:**
```
GET  /recurring-booking-schedules?status=PENDING_APPROVAL   -- UC-071 queue
POST /recurring-booking-schedules/:id/approve|reject          -- UC-071
GET  /customers?search=&limit=                                 -- UC-070 staff variant: customer picker (STAFF|MANAGER; existing endpoint)
POST /recurring-booking-schedules   (body carries customerId)  -- UC-070 staff variant
POST /bookings/:id/no-show                                    -- UC-074
POST /bookings/:id/no-show/correct                             -- UC-074 A3
```

**Open questions / gaps:**
- [x] Stories exist: `M23-S13` (approval queue, UC-071), `M23-S09` (no-show, UC-074), `M23-S19` (staff creating on a customer's behalf) — each still begins with `/story-discovery`.
- [ ] Whether the recurring-schedule approval queue is a separate list or folds into `00-agenda.html`'s existing queue is a UI decision for `M23-S13` (its plan says a tab inside the Agenda page).

### Staff creating a recurring schedule on a customer's behalf — `09`, `09b`, `09c` (M23-S19)

Added 2026-09-29 as a deliberately small first pass in the same staff dashboard shell as `08`; every choice is a default to recheck at `M23-S19`'s story-discovery. The flow diagram is in `../../agenda.md`. UC-070 allows staff to create on a customer's behalf and `POST /recurring-booking-schedules` already accepts it (`@Roles('CUSTOMER','MANAGER','STAFF')`, body `customerId`), so this is a frontend story.

| File | Screen | Route (proposed) |
|---|---|---|
| `09-nova-recorrencia-cliente.html` | Step 1 — pick the customer | `/dashboard/bookings/recurring/new` |
| `09b-nova-recorrencia-padrao.html` | Step 2 — the pattern, for the chosen customer | same route, step 2 |
| `09c-nova-recorrencia-resultado.html` | Outcomes (one panel each) | same route, result states |

**Customer picker (`NewRecurringScheduleCustomerStep`):** reuses the existing staff customer search — `GET /customers?search=&limit=` (`STAFF|MANAGER`), debounced like `LoyaltySearchPage`, through the existing `searchCustomers()` fetcher in `@/features/customer/api`. With no term it returns the recent customers. Each result carries `customerId`, `name`, `email` (and `currentPoints`, which is not shown). Only customers with an account in the tenant exist in the search, and a guest can never have a recurrence.

**Pattern form (`NewRecurringScheduleForStaff`):** the same fields and rules as the customer flow (`customer/prototypes/minha-conta/13-nova-recorrencia.html`, which owns the service filter, the resource field, the duration rule and the validation table) plus the chosen customer's chip with "Trocar cliente". The service list has no server-side recurrence filter, so the client filters on `recurrenceEligible`, `APPOINTMENT`, no `legs` and exactly one requirement, replicating `assertServiceEligible`.

**BFF call:**
```
POST /recurring-booking-schedules
  Body: { customerId, serviceId, recurrence: { frequency: "WEEKLY", daysOfWeek, startTime, durationMinutes },
          assignmentPolicy: "FIXED_ASSIGNMENT" | "RESOLVE_PER_OCCURRENCE", resourceIds?: [uuid], startsOn, endsOn }
  Response 201: { id, status: "ACTIVE" | "PENDING_APPROVAL", approvalHoldExpiresAt }
```
`endsOn` is **required** and at most `startsOn` + the service's maximum term (`recurringHorizonDays`, 90 days by default) — a `422` `BOOKING_RECURRING_SCHEDULE_INVALID_DATE_RANGE` otherwise. The schedule is fixed-term: every occurrence of the term is checked and created once (immediately, or when staff approve in `08`); there is no rolling generation and no Pause. `customerId` is required for a staff actor: the backend returns `404` `BOOKING_CUSTOMER_NOT_FOUND` when it is missing, unknown, or the actor is not an active staff member.

**Outcome → panel (`09c`):**
| Outcome | Panel |
|---|---|
| `201` `ACTIVE` | `#criada` |
| `201` `PENDING_APPROVAL` | `#aguardando` |
| `409` `BOOKING_RECURRING_SCHEDULE_CONFLICT` | `#conflito` |
| `409` `BOOKING_RECURRING_SCHEDULE_CAP_REACHED` | `#limite` |
| `404` `BOOKING_CUSTOMER_NOT_FOUND` | `#cliente` |
| network / `5xx` | `#falha` — the typed pattern is preserved |

All the `BOOKING_RECURRING_SCHEDULE_*` and `BOOKING_CUSTOMER_NOT_FOUND` codes are already translated in both `errors.json` files.

**Known limitations of this prototype (gap variants, not silently dropped):**
- ⚠ **Approval on a staff-created schedule.** `createdByStaffId` is only stored; the status still comes from the service's approval policy, so a staff-created schedule for a manual-approval service lands in `PENDING_APPROVAL` and staff would approve their own request. `#aguardando` draws today's behavior; whether staff creation should skip approval is a decision for `M23-S19`.
- ⚠ **The customer is not notified.** Nothing sends a notification when a recurring schedule is created or decided — the backend event handler writes an audit log only — so no screen promises an e-mail. (The customer prototype `06c` does say "Enviaremos a decisão por e-mail"; that promise has no implementation behind it yet.)
- ⚠ **The conflict list in `#conflito`** is the `conflicts` field of the `409` that `M23-S18` owns (`[{ occurrenceStart, reason }]`, reasons `OCCUPIED` / `CLOSED` / `OUTSIDE_HOURS`, occupancy and hours merged into one list); the `409` returns no list until that story ships. The panel draws a mixed list ("Já reservado" and "Fechado").
- ⚠ **Fixed term (2026-09-29):** `09b` has a required end-date field capped at the service's maximum term, `09c #criada` says all the term's reservations exist at once, and `08` shows the requested term and says approving creates every occurrence at once (after the checks re-run; an occurrence that no longer passes goes to the exception worklist instead of being created).
- ⚠ **Entry point and route.** The "+ Nova recorrência" button in the Agenda header is a default; `M23-S13` puts recurring requests in a tab inside the Agenda page, so there is no queue route of its own. A brand-new dashboard section would also need registering in the sidebar, the proxy role list, the bottom nav and the topbar titles.
- ⚠ **Out of scope, as in the customer flow:** variable-duration services and bundled services (`td/TD49-RECURRING-SCHEDULE-BUNDLED-SERVICES.md`).
- ⚠ **`08`'s sidebar and bottom-nav links** pointed at the wrong prototypes (and one missing file) when it was relocated from discovery; corrected on 2026-09-29.

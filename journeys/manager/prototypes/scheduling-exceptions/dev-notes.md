# Dev Notes — MANAGER: Scheduling Exceptions

## Overview

A MANAGER-only worklist at `/dashboard/scheduling-exceptions` for `M23-S14`, backed by `M23-S08` (backend + BFF; notifications are `M23-S23`). Built in `M23-S14` (backend + BFF: `M23-S08`). An entry is one **future booking** affected by a deactivated resource (directly, or because its staff member was deactivated); the manager resolves entries **one by one or many at once**. See `docs/DOMAIN_MODEL.md` § `FutureCommitmentException` and `../../scheduling-exceptions.md` for the decisions.

## Design system — what the prototypes reuse (redrawn 2026-10-14)

The first pass drew bare pages with bespoke inline CSS and no shell. The screens are now drawn **inside the real dashboard shell**, the same way `staff/prototypes/agenda/09*`/`10*` (UC-108) are, and every visual element is an existing pattern:

| Need | Reused from | Notes |
|---|---|---|
| Shell: topbar, `dashboard-layout`, sidebar, bottom nav + "Mais" sheet | `shared/tokens.css`, `staff/.../agenda/00-agenda.html` | Drill-down screens (`01d`, `01e`) use the back-arrow topbar and hide the bottom nav, as `10-novo-agendamento.html` does. |
| One entry | **The real queue card** — `apps/web/features/booking/components/dashboard/bookings/BookingCard.tsx`: `Card` `p-4`; row 1 name + two pill `Badge`s (Cliente/Visitante, then the status); row 2 service names; row 3 date/time left and `price · duration` right; small (`size="sm"`) left-aligned `Button`s; the whole card is a stretched `<Link>` to the booking detail with the buttons above it (`z-20`) | The prototype CSS (`.qcard`, `.qbadge`, `.qbtn`) mirrors that component, **not** `tokens.css`' `.booking-card`, which is the older avatar-and-right-hand-buttons shape of `staff/.../agenda/00-agenda.html` and no longer matches the app. New on top: a leading checkbox, one info line ("Box 2 desativado · Alternativa: …") and the selected state (`border-blue-500 bg-blue-50/60`, the card's own `emphasized` style). |
| Group header + "Selecionar todos" | `BookingQueueSection`'s header (`text-xs font-bold uppercase tracking-wider text-gray-400`, a line, the count) | "Selecionar todos" is the only addition. |
| Reassign / cancel | `.bottom-sheet` + `.sheet-backdrop` (modal on desktop) with `.btn-primary` / `.btn-danger` / `.btn-secondary`, `.form-label` / `.form-input` | Same sheet as the manager overflow menu and `03g-correct-no-show.html`. |
| Reschedule | **Staff reschedule screen** (`05-reschedule.html`): `AvailabilityCarousel` + `SlotPicker` `variant="dashboard"`, `shared/reschedule-picker.css`, the `detail-layout` + sticky aside + `mobile-action-bar` | **Resolves the open slot-source question:** `GET /v1/schedule/availability?date=…&serviceIds=…`, duration frozen at the booking's `totalDurationMins`. Only the submit differs: `POST /scheduling-exceptions/resolve` with `RESCHEDULE`, not `PATCH /bookings/:id/reschedule`. |
| Selection bar | The fixed `mobile-action-bar` pattern (staff detail screens), **offset above the mobile bottom nav** (the Settings/Hotsite action-bar precedent — the nav is never hidden); on desktop it clears the 15rem sidebar | The one new piece of CSS; a candidate for `shared/components` only if a second screen needs it. |
| Banners, empty and loading states | `banner-ok` / `banner-error` (agenda `10b`) | |
| Nav | New MANAGER-only **"Reservas a resolver"** item right below "Agenda" (rendered only for the MANAGER role, in the main nav group), with an open-count badge; first item of the mobile "Mais" sheet because the bottom nav is already full | Real `Sidebar.tsx` `MANAGER_NAV_KEYS` is `resources, team, settings, hotsite`; the new item is not a `MANAGER_NAV_KEYS` entry — it sits in the main group and is shown only to MANAGER. **Naming:** the user-facing label is "Reservas a resolver" everywhere (nav, page title, empty state); "exception" survives only in code, route and API. |

Tenant/sample data is **BeloAuto Demo** (same as the shell prototypes). The sidebar here also lists "Recursos", which the older shell prototypes (`agenda/10`) omit but the real `Sidebar.tsx` has.

## Data and component reuse for the card (decided 2026-10-14)

- **Two fields are missing from the shipped list response:** the Cliente/Visitante badge needs `booking.isCustomer` and the price needs `booking.totalPrice` (`StaffBookingCardResponse` already has both — the queue card reads them). `M23-S08`'s `GET /scheduling-exceptions` returns neither. The prototype draws both, as the queue does, so `M23-S14` needs a small backend + BFF addition to the list item (read-only; no migration — both come from the booking). Alternative if that is rejected at discovery: draw the card without the badge and the price.
- **Do not add a fourth variant to `BookingCard`.** It has three fixed variants (`action-needed`, `today`, `upcoming`) with fixed actions and takes a `StaffBookingCardResponse`. Preferred: extract a presentational `BookingCardShell` (stretched link + `Card` + name/badges/service/time-price rows + an `actions` slot) used by both `BookingCard` and `SchedulingExceptionRow`, which keeps the layout in one place. `SchedulingExceptionRow` adds the checkbox, the info line and its own buttons. To confirm at `M23-S14`'s discovery (it touches an existing, tested component).

## Why no Manter / Dispensar (decided 2026-10-14)

The first drawings offered "Manter" (KEEP) and "Dispensar" (dismiss). Both leave the booking untouched on a **deactivated** resource, where nobody can perform it (it has no column in the Horários day grid, and a deactivated staff member no longer works there). So neither is a real outcome and the page offers only **Reatribuir, Reagendar, Cancelar**. The backend `KEEP` choice and `POST /dismiss` (`M23-S08`) are not called from here. A resource deactivated by mistake is fixed by reactivating it, and reactivation closes that resource's open entries (`M23-S45`, related, not blocking). This applies to `RESOURCE_DEACTIVATION` entries only: a future trigger (an hours reduction, a closure) can leave the booking performable, and "Manter" returns for that source type — which is why the backend `KEEP` and `/dismiss` stay.

## File map (✅ built — M23-S14)

| File | Status |
|---|---|
| `apps/web/app/dashboard/scheduling-exceptions/layout.tsx`, `page.tsx` | ✅ Built (shell-wrapped; MANAGER-only via `proxy.ts`) |
| `apps/web/app/dashboard/scheduling-exceptions/[exceptionId]/reschedule/page.tsx` | ✅ Built (server page: loads the open entry and the booking detail; 404 unless the booking is `APPROVED`) |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/SchedulingExceptionWorklistPage.tsx` (+ `SchedulingExceptionGroups.tsx`) | ✅ Built |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/SchedulingExceptionRow.tsx` (composes `BookingCardShell`) | ✅ Built |
| `apps/web/features/booking/components/dashboard/bookings/BookingCardShell.tsx` (extracted from `BookingCard.tsx`, which now uses it) | ✅ Built |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/BulkActionBar.tsx`, `ReassignSheet.tsx`, `CancelSheet.tsx`, `BulkResultList.tsx` | ✅ Built |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/SchedulingExceptionReschedulePage.tsx` (thin wrapper: the existing `RescheduleBookingPage` with a resolve-based confirm) | ✅ Built |
| `apps/web/features/booking/components/dashboard/bookings/RescheduleBookingPage.tsx` (injected `confirmReschedule` + `onRescheduled`, defaults unchanged) | ✅ Built |
| `apps/web/features/booking/api/scheduling-exceptions.ts` (+ `.server.ts`, `resolve-in-batches.ts`) | ✅ Built (fetchers; batches of 100) |
| `apps/web/features/booking/hooks/useSchedulingExceptions.ts`, `useSchedulingExceptionActions.ts`, `useBookingWhenLabel.ts` | ✅ Built (React Query hooks) |
| `apps/web/features/booking/model/scheduling-exception-view.ts`, `scheduling-exception-reschedule.ts` | ✅ Built (grouping, reassign choices; the `STILL_OPEN` → 409 adapter) |
| `apps/web/shells/dashboard/components/SchedulingExceptionsNavItem.tsx`, `model/scheduling-exception-route.ts` (+ `Sidebar`, `MoreSheet`, `BottomNav`, `topbar-route` wiring) | ✅ Built |
| `apps/bff/http/bookings/scheduling-exceptions.http`, `apps/backend/http/booking/scheduling-exceptions.http` | ✅ Built (count route added) |
| `apps/web/e2e/scheduling-exceptions.spec.ts` (+ `e2e/helpers/scheduling-exceptions.ts`) | ✅ Built |

## BFF calls (live since `M23-S08` — contract per `docs/API_CONTRACTS.md`)

```
GET /v1/scheduling-exceptions/count        (NEW at S14 — MANAGER) → { count: number }   the sidebar badge

GET /v1/scheduling-exceptions/by-booking/:bookingId   (M23-S46 — MANAGER) → same list shape, the open entries of one booking with alternatives (booking detail's decision panel)

GET /v1/scheduling-exceptions?status=OPEN
  Header: Authorization: Bearer {jwt}   (MANAGER)
  Response: { items: [{ id, sourceType, sourceId, affectedType, affectedId, status, alternatives: [{ resourceId, resourceName }],
                        createdAt, booking: { contactName, scheduledAt, totalDurationMins, serviceNames, status, resourceName,
                                              isCustomer, totalPrice }   -- isCustomer + totalPrice are NEW (see § Data and component reuse)
                      }] }

POST /v1/scheduling-exceptions/resolve            (bulk-only — a single entry is a list of one)
  Body: { exceptionIds: string[] (1–100), resolutionType: 'KEEP'|'REASSIGN'|'RESCHEDULE'|'CANCEL', reason?: string,
          target?: { resourceId } | { mode: 'AUTO' }   (REASSIGN only),
          scheduledAt?: string                          (RESCHEDULE only — exactly one id, APPROVED booking) }
  Response 200: { results: [{ exceptionId, outcome: 'RESOLVED' | 'STILL_OPEN', errorCode? }] }

POST /v1/scheduling-exceptions/dismiss      (exists in the API; NOT called by this page — see § Why no Manter / Dispensar)
```

**Slot source for `01e` (decided at discovery, 2026-10-14):** the existing `GET /v1/schedule/availability?date=…&serviceIds=…` via `fetchBookingAvailability`, exactly as the staff reschedule page does it; `serviceIds` come from the booking detail the route's server page loads. The confirm is the only difference: `POST /scheduling-exceptions/resolve` with `RESCHEDULE`, not `PATCH /bookings/:id/reschedule` (which would move the booking but leave the entry open).

## Screen: SchedulingExceptionWorklistPage (`/dashboard/scheduling-exceptions`)

**Files:** `01-exception-worklist.html` (baseline), `01b-selecionados.html`.

Cards are the queue's `BookingCard` shape, grouped by the unavailable resource with `BookingQueueSection`'s header. Row actions: **Reatribuir** (primary), **Reagendar** (APPROVED only, secondary), **Cancelar** (secondary). There is deliberately no Manter / Dispensar — see § Why no Manter / Dispensar.

- Entries are grouped by the resource that became unavailable ("Camila ficou indisponível · 3 compromissos"), with a per-group "Selecionar todos". Grouping key: the entry's `sourceId` (the deactivated resource).
- Each row: checkbox, date/time and service names, contact name, the current resource, a status badge (`Confirmada` = `APPROVED`, `Pendente` = `PENDING`/`INFO_REQUESTED`), the stored alternative ("Juliana Prado está livre neste horário") or "Sem alternativa compatível", and per-row actions.
- **Reagendar is enabled only for a confirmed booking** and only when exactly one entry is in play (disabled with a tooltip in a row that is pending, and in the bulk bar).
- Selecting one or more rows shows the fixed selection bar (`01b`): "N selecionados · Reatribuir · Cancelar"; on mobile it sits above the bottom nav, which stays. A hint in the bar says Reagendar is one entry at a time.

**States:** loading (`01i`) → list / empty (`01h`) / fetch error (`01j`).

## Screen: ReassignSheet (`01c`)

Choose the target: "Qualquer profissional livre (automático)" (`{ mode: 'AUTO' }`, the default) or a specific resource from the union of the selected entries' current alternatives (recomputed on every read of an open entry, so a resource reactivated or a slot freed since the entry was raised shows up), each labelled "livre em N de M reservas" (computed client-side). A resource missing from an entry's alternatives is simply not compatible with it: the data carries no "ocupado" reasons, so none are drawn. A reason field (recorded on each entry). Submit label carries the count: "Reatribuir N compromissos".

## Screen: reschedule route (`01e`)

The existing staff `RescheduleBookingPage`, parametrized (see the file map). One confirmed booking only. The manager picks a new time from the available slots; the booking changes immediately and the customer is notified by the existing reschedule email. An optional note becomes the reschedule's admin note. There is no "offer options and wait for the customer" flow.

## Screen: BulkResultList (`01d`)

Shown after any bulk action. One line per entry, `RESOLVED` or `STILL_OPEN` with the reason it stayed open; a still-open entry keeps its row actions ("Tentar de novo", "Reagendar", "Cancelar"). **Distinct from a whole-request failure (`01k`):** a partial result means some bookings changed; an error means nothing did.

**Validation:**
| Field | Rule | Error message |
|---|---|---|
| Reassign / cancel reason | optional | — |
| Reschedule new time | required, one option picked | "Escolha um novo horário." |

**Error messages (pt-BR, exact):** fetch error "Não foi possível carregar os compromissos. Verifique sua conexão e tente novamente." · submit error "Não foi possível concluir. Nenhuma reserva foi alterada. Tente novamente em instantes." · partial "N compromisso(s) resolvido(s) · M continua(m) aberto(s)".

**Mobile notes:** the bulk bar is sticky at the bottom of the list; rows stack; per-row actions wrap. The prototype is a single responsive layout — no separate mobile screens.

## Known limitations

- **Selecting "everything from this resource from a time"** is drawn as a per-group "Selecionar todos" only; a free "a partir de …" filter is a proposal, not decided (see the journey's open questions).
- **Decided at `M23-S14`'s discovery (2026-10-14):** the badge count comes from a dedicated `GET /scheduling-exceptions/count` (`{ count }`, MANAGER-only, 60-second client-side cache — `OPEN_COUNT_STALE_TIME_MS` in `useSchedulingExceptions.ts`) so a page load never pulls the whole list; "Selecionar todos" on a group of more than 100 sends sequential batches of 100 (the resolve endpoint's cap) and merges the results; a `booking: null` entry renders a minimal "Reserva indisponível" card (not drawn); the alternatives line shows at most two names then "e mais N"; the group header is "<nome> ficou indisponível" for both the resource and the staff case; a customer-chosen deactivated resource cannot be rescheduled (`STILL_OPEN`, reason suggests reassign or cancel).
- **The "Reservas a resolver" nav item is built** (sidebar below "Agenda" + mobile "Mais" sheet, with the open-count badge from `GET /scheduling-exceptions/count`); the route is wired into `proxy.ts`, `BottomNav`, `topbar-route` and its own `layout.tsx`.
- **Card link target (redrawn 2026-10-15, M23-S46):** every card opens `staff/prototypes/agenda/03j-booking-detail-precisa-decisao.html`, the detail of a booking that needs a decision (banner plus the manager's decision panel), not the normal detail. The prototype has only the approved variant, so the pending card (Ana Costa) opens it too; the real pending detail has the same banner and panel without Reagendar.
- **Back navigation (built):** the card opens `/dashboard/bookings/{id}?returnTo=/dashboard/scheduling-exceptions`, so the detail page's back arrow returns to the worklist, not to the booking queue.
- **Reactivating the original resource closes its entries** (`M23-S45`): `ReactivateResourceUseCase` dismisses the resource's still-open `RESOURCE_DEACTIVATION` entries, so they leave the worklist without a manager action. Reactivating a *different* resource does show it as an alternative on the next read.
- **Reagendar cannot work on a booking whose customer chose the deactivated resource** (the reschedule keeps that pick); the row still shows the link and the error is the only feedback. Hiding it needs a per-item flag, not decided.
- **Time and resource cannot be changed together:** with a customer-chosen resource and no free alternative at that time, only Cancelar is left. Not decided.
- **A booking that needs a decision shows none of its normal action buttons on its queue card or its detail** (see `staff/prototypes/agenda/dev-notes.md` § "UC-073 / UC-077 — A booking that needs a decision is marked"). It can be resolved here, in bulk, or one at a time from the MANAGER's decision panel on the booking's own detail (`03j`), which reuses this page's `ReassignSheet`, `CancelSheet` and reschedule route (M23-S46; the reschedule route's own `returnTo` decides where the manager lands afterwards).
- **Not drawn:** a per-entry detail page (the story's earlier `[id]/page.tsx`); everything is decided from the list, so none is planned unless discovery finds a need.

## Open questions / gaps

- [x] Stories exist: `M23-S08` (backend + BFF), `M23-S14` (this page), `M23-S23` (notifications).
- [x] Nav placement and the count badge: built as drawn (below "Agenda", MANAGER only; first item of the mobile "Mais" sheet).
- [x] The alternatives are advisory and recomputed on every read of an open entry (stored only for closed ones); the real check still happens when the manager confirms (a race leaves the entry open, `01d`). An entry with none shows "Sem alternativa compatível — reagende ou cancele" and its **Reatribuir is disabled** (in the bulk bar too, when no selected entry has one); Reagendar and Cancelar stay.

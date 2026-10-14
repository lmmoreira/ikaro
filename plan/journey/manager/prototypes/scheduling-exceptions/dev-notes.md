# Dev Notes — MANAGER: Scheduling Exceptions

## Overview

A MANAGER-only worklist at `/dashboard/scheduling-exceptions` for `M23-S14`, backed by `M23-S08` (backend + BFF; notifications are `M23-S23`). The web page is not built yet (backend + BFF are live). An entry is one **future booking** affected by a deactivated resource (directly, or because its staff member was deactivated); the manager resolves entries **one by one or many at once**. See `docs/02-DOMAIN_MODEL.md` § `FutureCommitmentException` and `../../scheduling-exceptions.md` for the decisions.

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

The first drawings offered "Manter" (KEEP) and "Dispensar" (dismiss). Both leave the booking untouched on a **deactivated** resource, where nobody can perform it (it has no column in the Horários day grid, and a deactivated staff member no longer works there). So neither is a real outcome and the page offers only **Reatribuir, Reagendar, Cancelar**. The backend `KEEP` choice and `POST /dismiss` (`M23-S08`) are not called from here. A resource deactivated by mistake is fixed by reactivating it, and reactivation must close that resource's open entries (`M23-S45`) so the list can always be emptied.

## File map (❓ none exist yet)

| File | Status |
|---|---|
| `apps/web/app/dashboard/scheduling-exceptions/page.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/SchedulingExceptionWorklistPage.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/SchedulingExceptionRow.tsx` (composes `BookingCardShell`) | ❓ Gap |
| `apps/web/features/booking/components/dashboard/bookings/BookingCardShell.tsx` (extracted from `BookingCard.tsx`) | ❓ Gap (modify `BookingCard.tsx` to use it) |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/BulkActionBar.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/ReassignSheet.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/CancelSheet.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/SchedulingExceptionReschedulePage.tsx` (thin wrapper: renders the existing `RescheduleBookingPage` with a resolve-based confirm) | ❓ Gap |
| `apps/web/features/booking/components/dashboard/bookings/RescheduleBookingPage.tsx` (modify: injected confirm action + post-success behavior, defaults unchanged) | ❓ Gap |
| `apps/web/app/dashboard/scheduling-exceptions/[exceptionId]/reschedule/page.tsx`, `layout.tsx`, `page.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/BulkResultList.tsx` | ❓ Gap |
| `apps/web/features/booking/api/scheduling-exceptions.ts` (React Query hooks) | ❓ Gap |
| `apps/bff/http/bookings/scheduling-exceptions.http` | ❓ Gap (`M23-S08`) |

Component names are proposals for `M23-S14`'s discovery to confirm.

## BFF calls (live since `M23-S08` — contract per `docs/14-API_CONTRACTS.md`)

```
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

Choose the target: "Qualquer profissional livre (automático)" (`{ mode: 'AUTO' }`, the default) or a specific resource from the union of the selected entries' stored alternatives, each labelled "livre em N de M reservas" (computed client-side). A resource missing from an entry's alternatives is simply not compatible with it: the data carries no "ocupado" reasons, so none are drawn. A reason field (recorded on each entry). Submit label carries the count: "Reatribuir N compromissos".

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
- **The new components (`BulkActionBar`, `BulkResultList`, the two sheets, `SchedulingExceptionReschedulePage`) do not exist**, so their unhappy-path variants are tagged ⚠ in `index.html`.
- **Decided at `M23-S14`'s discovery (2026-10-14):** the badge count comes from the page's own list hook (60-second cache, MANAGER only, no new endpoint); a `booking: null` entry renders a minimal "Reserva indisponível" card (not drawn); the alternatives line shows at most two names then "e mais N"; the group header is "<nome> ficou indisponível" for both the resource and the staff case; a customer-chosen deactivated resource cannot be rescheduled (`STILL_OPEN`, reason suggests reassign or cancel).
- **The "Reservas a resolver" nav item is drawn** (sidebar below "Agenda" + mobile "Mais" sheet, with an open-count badge); where the count comes from (the list's total vs a separate count call) is for `M23-S14`'s discovery. `M23-S14` also adds the route-registry entries.
- **Not drawn:** a per-entry detail page (the story's earlier `[id]/page.tsx`); everything is decided from the list, so none is planned unless discovery finds a need.

## Open questions / gaps

- [x] Stories exist: `M23-S08` (backend + BFF), `M23-S14` (this page), `M23-S23` (notifications).
- [ ] Nav placement (after "Recursos" under "Somente Gerente") and the count badge are drawn as a default for `M23-S14`'s discovery to confirm.
- [ ] The alternatives shown are stored at raise time and are advisory; the real check happens when the manager confirms (a race leaves the entry open, `01d`).

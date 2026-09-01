# Dev Notes — STAFF: Turmas (Daily Class Operations)

## Overview

New STAFF|MANAGER-shared journey for M21 — Multi-Vertical Scheduling, Cluster 4. Nothing here is built yet; relocated from `docs/discovery/multivertical-booking/prototype/{staff-04-turmas-proximas,manager-roster-dia,staff-02b-fechar-turma,staff-03,staff-03b,staff-06,staff-06b}.html`. See `docs/02-DOMAIN_MODEL.md` § `ClassSession`/`ClassSessionBooking`.

## File map (❓ none exist yet)

| File | Status |
|---|---|
| `apps/web/features/booking/components/dashboard/turmas/ClassSessionListPage.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/turmas/ClassSessionRosterPage.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/turmas/ClassSessionCloseOutPage.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/turmas/SessionCapacityOverrideForm.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/turmas/GuestReservationApproval.tsx` | ❓ Gap |

## BFF calls (endpoints not yet implemented — contract per `docs/14-API_CONTRACTS.md` § Classes & Sessions)

```
GET   /v1/class-sessions?scope=mine|all&from=&to=
PATCH /v1/class-sessions/:id                                 -- capacity/resource override (UC-083)
POST  /v1/class-session-bookings/:id/approve|reject           -- guest approval (UC-098)
POST  /v1/class-sessions/:id/close                             -- Body: { attendeeOutcomes: [{ attendeeId, attendance }] }
POST  /v1/class-session-bookings/:id/payment                   -- manual charge record (UC-107)
```

## Screen notes

- **`01-turmas-proximas.html`** — mine/all toggle same spirit as `staff/agenda.md`'s existing Agenda mine/all toggle (no new UC needed, a delta to the existing pattern).
- **`02-roster-dia.html`** — the canonical, single roster screen (STAFF|MANAGER shared). Shows check-in state, waitlist with manual "Promover" action (UC-091's mechanism, staff-triggered), guest-approval "Revisar" entry point into `05-guest-approval.html`, and "+ Drop-in" for a walk-in booking.
- **`03-fechar-turma.html`** — every attendee pre-marked `PRESENT`; staff flags exceptions only, then closes in one action (UC-101). For a payable attendee, records the manual charge outcome (UC-107) in the same close-out action, not a separate flow.
- **`04-capacity-override.html`** — one-off, this-session-only change; the template itself is untouched.
- **`05-guest-approval.html`** — one action (approve/reject) for the whole reservation group, mirroring the shape of a recurring-schedule approval (`staff/prototypes/agenda/08-recurring-schedule-approval.html`, M21 Cluster 3).

## Known limitations

- No `index.html` existed in the discovery folder for this consolidated set — added as part of this promotion.
- `manager-dashboard.html`/`manager-agenda-dia.html` were deliberately **not** relocated — no corresponding CAND/UC exists for a general dashboard-home screen, and `manager-agenda-dia.html` overlaps with the already-promoted UC-057 day grid (M21 Cluster 2, `staff/prototypes/horarios/08-visao-geral-manager.html`). Left in the discovery folder as illustrative-only.

## Open questions / gaps

- [ ] No story exists yet — needs `/story-discovery` once the M21 milestone file is drafted.
- [ ] `02-roster-dia.html`'s live check-in toggle and "+ Drop-in" action's exact UC backing is worth confirming during `/story-discovery`.

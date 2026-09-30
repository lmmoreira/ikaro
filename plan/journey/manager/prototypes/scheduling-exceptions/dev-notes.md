# Dev Notes — MANAGER: Scheduling Exceptions

## Overview

A MANAGER-only worklist at `/dashboard/scheduling-exceptions` for `M23-S14`, backed by `M23-S08` (backend + BFF; notifications are `M23-S23`). Nothing here is built yet. An entry is one **future booking** affected by a deactivated resource (directly, or because its staff member was deactivated); the manager resolves entries **one by one or many at once**. See `docs/02-DOMAIN_MODEL.md` § `FutureCommitmentException` and `../../scheduling-exceptions.md` for the decisions.

## File map (❓ none exist yet)

| File | Status |
|---|---|
| `apps/web/app/dashboard/scheduling-exceptions/page.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/SchedulingExceptionWorklistPage.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/SchedulingExceptionRow.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/BulkActionBar.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/ReassignPanel.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/ReschedulePanel.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/BulkResultList.tsx` | ❓ Gap |
| `apps/web/features/booking/api/scheduling-exceptions.ts` (React Query hooks) | ❓ Gap |
| `apps/bff/http/bookings/scheduling-exceptions.http` | ❓ Gap (`M23-S08`) |

Component names are proposals for `M23-S14`'s discovery to confirm.

## BFF calls (endpoints not yet implemented — contract per `docs/14-API_CONTRACTS.md`)

```
GET /v1/scheduling-exceptions?status=OPEN
  Header: Authorization: Bearer {jwt}   (MANAGER)
  Response: { items: [{ id, sourceType, sourceId, affectedType, affectedId, status, alternatives: [{ resourceId, resourceName }],
                        createdAt, booking: { contactName, scheduledAt, totalDurationMins, serviceNames, status, resourceName } }] }

POST /v1/scheduling-exceptions/resolve            (bulk-only — a single entry is a list of one)
  Body: { exceptionIds: string[] (1–100), resolutionType: 'KEEP'|'REASSIGN'|'RESCHEDULE'|'CANCEL', reason?: string,
          target?: { resourceId } | { mode: 'AUTO' }   (REASSIGN only),
          scheduledAt?: string                          (RESCHEDULE only — exactly one id, APPROVED booking) }
  Response 200: { results: [{ exceptionId, outcome: 'RESOLVED' | 'STILL_OPEN', errorCode? }] }

POST /v1/scheduling-exceptions/dismiss
  Body: { exceptionIds: string[], reason: string }
  Response 200: { results: [...] }   (same shape)
```

**Not verified — assumed by the prototype:** the slots offered in `01e` (available new times for one booking) need a data source. `docs/14-API_CONTRACTS.md`'s existing availability endpoints are the likely candidate; `M23-S14`'s discovery must confirm which one and whether it can be called for a specific booking's service and resources.

## Screen: SchedulingExceptionWorklistPage (`/dashboard/scheduling-exceptions`)

**Files:** `01-exception-worklist.html` (baseline), `01b-selecionados.html`.

- Entries are grouped by the resource that became unavailable ("Camila ficou indisponível · 3 compromissos"), with a per-group "Selecionar todos". Grouping key: the entry's `sourceId` (the deactivated resource).
- Each row: checkbox, date/time and service names, contact name, the current resource, a status badge (`Confirmada` = `APPROVED`, `Pendente` = `PENDING`/`INFO_REQUESTED`), the stored alternative ("Juliana Prado está livre neste horário") or "Sem alternativa compatível", and per-row actions.
- **Reagendar is enabled only for a confirmed booking** and only when exactly one entry is in play (disabled with a tooltip in a row that is pending, and in the bulk bar).
- Selecting one or more rows shows the bulk bar (`01b`): "N selecionados · Reatribuir · Cancelar · Manter · Dispensar".

**States:** loading (`01i`) → list / empty (`01h`) / fetch error (`01j`).

## Screen: ReassignPanel (`01c`)

Choose the target: "Qualquer profissional livre (automático)" (`{ mode: 'AUTO' }`, the default) or a specific resource from the union of the selected entries' stored alternatives (a resource that is busy at one of the selected times is listed with the conflict, not hidden). A reason field (recorded on each entry). Submit label carries the count: "Reatribuir N compromissos".

## Screen: ReschedulePanel (`01e`)

One confirmed booking only. The manager picks a new time from the available slots; the booking changes immediately and the customer is notified by the existing reschedule email. An optional note becomes the reschedule's admin note. There is no "offer options and wait for the customer" flow.

## Screen: BulkResultList (`01d`)

Shown after any bulk action. One line per entry, `RESOLVED` or `STILL_OPEN` with the reason it stayed open; a still-open entry keeps its row actions ("Tentar de novo", "Reagendar", "Cancelar"). **Distinct from a whole-request failure (`01k`):** a partial result means some bookings changed; an error means nothing did.

**Validation:**
| Field | Rule | Error message |
|---|---|---|
| Dismiss reason | required (min 1) | "Informe o motivo para dispensar." |
| Reassign / cancel reason | optional | — |
| Reschedule new time | required, one option picked | "Escolha um novo horário." |

**Error messages (pt-BR, exact):** fetch error "Não foi possível carregar os compromissos. Verifique sua conexão e tente novamente." · submit error "Não foi possível concluir. Nenhuma reserva foi alterada. Tente novamente em instantes." · partial "N compromisso(s) resolvido(s) · M continua(m) aberto(s)".

**Mobile notes:** the bulk bar is sticky at the bottom of the list; rows stack; per-row actions wrap. The prototype is a single responsive layout — no separate mobile screens.

## Known limitations

- **Selecting "everything from this resource from a time"** is drawn as a per-group "Selecionar todos" only; a free "a partir de …" filter is a proposal, not decided (see the journey's open questions).
- **The new components (`BulkActionBar`, `BulkResultList`, `ReassignPanel`, `ReschedulePanel`) do not exist**, so their unhappy-path variants are tagged ⚠ in `index.html`.
- **The slot source for `01e` is unverified** — see the BFF calls note above.
- **The nav item ("Exceções") is not drawn:** the prototype shows only the page content under the standard topbar; `M23-S14` adds the sidebar item and its route-registry entries.

## Open questions / gaps

- [x] Stories exist: `M23-S08` (backend + BFF), `M23-S14` (this page), `M23-S23` (notifications).
- [ ] Nav placement is a UI decision for `M23-S14` (a new MANAGER-only sidebar item is the default).
- [ ] The alternatives shown are stored at raise time and are advisory; the real check happens when the manager confirms (a race leaves the entry open, `01d`).

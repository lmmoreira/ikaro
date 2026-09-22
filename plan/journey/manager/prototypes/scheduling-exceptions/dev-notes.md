# Dev Notes — MANAGER: Scheduling Exceptions

## Overview

New MANAGER-only worklist for M21 — Multi-Vertical Scheduling, Cluster 3. Nothing here is built yet; relocated from `docs/discovery/multivertical-booking/prototype/manager-12-exception-worklist.html`. See `docs/02-DOMAIN_MODEL.md` § `FutureCommitmentException`.

## File map (❓ none exist yet)

| File | Status |
|---|---|
| `apps/web/app/dashboard/scheduling-exceptions/page.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/scheduling-exceptions/SchedulingExceptionWorklistPage.tsx` | ❓ Gap |
| `apps/bff/http/scheduling-exceptions/*.http` | ❓ Gap |

## BFF calls (endpoints not yet implemented — contract per `docs/14-API_CONTRACTS.md`)

```
GET /v1/scheduling-exceptions?status=OPEN
  Header: Authorization: Bearer {jwt}   (MANAGER)
  Response: { items: FutureCommitmentException[] }

POST /v1/scheduling-exceptions/:id/resolve
  Body: { resolutionType: 'KEEP'|'REASSIGN'|'RESCHEDULE'|'CANCEL', reason?: string }
  Response 200: FutureCommitmentException (status: RESOLVED)

POST /v1/scheduling-exceptions/:id/dismiss
  Body: { reason: string }
  Response 200: FutureCommitmentException (status: DISMISSED)
```

## Screen: SchedulingExceptionWorklistPage (`/dashboard/scheduling-exceptions`, UC-073/077)

**File:** `01-exception-worklist.html` (prototype) — one card per open exception, showing: affected commitment summary, impact reason, deadline, an eligible-alternative card when one exists, and four resolution actions (Reatribuir/Reagendar/Cancelar/Manter) plus a dismiss path for a genuinely non-impacting item.

**Interaction pattern:** each action reveals an inline confirmation panel (CSS `:target` in the prototype) rather than a separate page — mirrors this codebase's existing bottom-sheet confirmation pattern conceptually, adapted for a full-width list item rather than a mobile sheet.

## Known limitations

- No `index.html` existed in the discovery folder for this single screen — added as part of this promotion.
- The prototype's second example item cross-links to a recurring-reservation detail (`customer/prototypes/minha-conta/06-reserva-recorrente.html`) to illustrate that an exception can affect a standing schedule, not just a one-off booking — already fixed to the canonical relocated path during this promotion.

## Open questions / gaps

- [ ] No story exists yet — needs `/story-discovery` once the M21 milestone file is drafted.
- [ ] Nav placement is a UI decision for the implementing story.

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
  Response: { items: [{ id, sourceType, sourceId, affectedType, affectedId, status, alternatives: [{ resourceId, resourceName }],
                        createdAt, booking: { contactName, scheduledAt, totalDurationMins, serviceNames, status, resourceName } }] }

POST /v1/scheduling-exceptions/resolve            (M23-S08 — bulk-only; a single entry is a list of one)
  Body: { exceptionIds: string[] (1–100), resolutionType: 'KEEP'|'REASSIGN'|'RESCHEDULE'|'CANCEL', reason?: string,
          target?: { resourceId } | { mode: 'AUTO' }   (REASSIGN only),
          scheduledAt?: string                          (RESCHEDULE only — one id, APPROVED booking) }
  Response 200: { results: [{ exceptionId, outcome: 'RESOLVED' | 'STILL_OPEN', errorCode? }] }

POST /v1/scheduling-exceptions/dismiss
  Body: { exceptionIds: string[], reason: string }
  Response 200: { results: [...] }   (same shape)
```

## Screen: SchedulingExceptionWorklistPage (`/dashboard/scheduling-exceptions`, UC-073/077)

**File:** `01-exception-worklist.html` (prototype) — one card per open exception, showing: affected commitment summary, impact reason, deadline, an eligible-alternative card when one exists, and four resolution actions (Reatribuir/Reagendar/Cancelar/Manter) plus a dismiss path for a genuinely non-impacting item.

**Interaction pattern:** each action reveals an inline confirmation panel (CSS `:target` in the prototype) rather than a separate page — mirrors this codebase's existing bottom-sheet confirmation pattern conceptually, adapted for a full-width list item rather than a mobile sheet.

## Known limitations

- No `index.html` existed in the discovery folder for this single screen — added as part of this promotion.
- The prototype's second example item cross-links to a recurring-reservation detail (`customer/prototypes/minha-conta/06-reserva-recorrente.html`) to illustrate that an exception can affect a standing schedule, not just a one-off booking — already fixed to the canonical relocated path during this promotion.

## Open questions / gaps

- [x] Stories exist: `M23-S08` (backend + BFF), `M23-S14` (this page), `M23-S23` (notifications).
- [ ] Prototype pass before `M23-S14`: the screen has no multi-select or bulk action bar, no "any free one" reassign option, and draws reschedule as "Oferecer novos horários" (customer accepts a proposal) where UC-077 implements a direct manager-chosen reschedule — see `../../scheduling-exceptions.md` § Open questions.
- [ ] Nav placement is a UI decision for the implementing story.

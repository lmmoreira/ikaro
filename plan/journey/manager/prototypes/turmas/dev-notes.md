# Dev Notes — MANAGER: Turmas (Configuration & Enrollment Management)

## Overview

New STAFF|MANAGER-shared class-configuration journey for M21 — Multi-Vertical Scheduling, Cluster 4. Nothing here is built yet; relocated from `docs/discovery/multivertical-booking/prototype/manager-{turmas-list,nova-aula,adicionar-horario,definir-staff,07,07b,09,09b,09c}*.html`. See `docs/02-DOMAIN_MODEL.md` § `ClassScheduleTemplate`/`ClassAccessContract`/`RecurringEnrollment`.

## File map (❓ none exist yet)

| File | Status |
|---|---|
| `apps/web/features/booking/components/dashboard/turmas/ClassTemplateListPage.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/turmas/ClassTemplateCreateWizard.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/turmas/ClassAccessContractForm.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/turmas/EnrollmentListPage.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/turmas/AdminEnrollmentForm.tsx` | ❓ Gap |

## BFF calls (endpoints not yet implemented — contract per `docs/14-API_CONTRACTS.md` § Classes & Sessions)

```
GET/POST/PATCH/DELETE  /v1/class-schedule-templates[/:id]
POST                    /v1/class-schedule-templates/:id/cancel-range
POST                    /v1/class-access-contracts
POST                    /v1/class-access-contracts/:id/cancel
GET                     /v1/class-schedule-templates/:serviceId/enrollments?status=&type=
POST                    /v1/class-session-bookings | /v1/recurring-enrollments  (createdByStaff: true)
```

## Screen notes

- **`01-turmas-list.html`** — accordion grouped by class type, not a flat list (a flat list doesn't scale — see the original `ux-handoff-notes/README.md` §6 rationale this discovery already worked through).
- **`02`→`03`→`04`** — a genuine 3-step wizard (type → recurring schedule → optional per-day/per-slot staff assignment), superseding an earlier single-step `manager-06-criar-turma.html` design (kept for reference only, not relocated).
- **`04-definir-staff.html`** needs no new schema — per-day/per-slot staff granularity is UI sugar over creating multiple `ClassScheduleTemplate` rows (model #6 — independent instances, not a pool), each with its own single resource pick.
- **`06-matriculas.html`** — 4 tabs (active series / one-off/drop-in / waitlist / history), with inline cancel and manual-promote-from-waitlist actions (UC-091's mechanism, staff-triggered).

## Known limitations

- No `index.html` existed in the discovery folder for this consolidated set — added as part of this promotion.
- `01-turmas-list.html`'s per-row "Editar"/"Staff"/"Ver sessões" actions have no dedicated destination screens yet.

## Open questions / gaps

- [ ] No story exists yet — needs `/story-discovery` once the M21 milestone file is drafted.
- [ ] Routing shape for the 3-step wizard (one route vs. three) is a decision for the implementing story.

# Dev Notes — MANAGER: Turmas (Configuration & Enrollment Management)

## Overview

New STAFF|MANAGER-shared class-configuration journey for M24 — Multi-Vertical Scheduling, Cluster 4 (`M24-S01`/`S02`/`S08`/`S11`/`S13` backend, `M24-S15` frontend). Nothing here is built yet; relocated from `docs/discovery/multivertical-booking/prototype/manager-{turmas-list,nova-aula,adicionar-horario,definir-staff,07,07b,09,09b,09c}*.html`. See `docs/DOMAIN_MODEL.md` § `ClassScheduleTemplate`/`ClassAccessContract`/`RecurringEnrollment`. The discovery folder had no `index.html` for this consolidated set; it was added when the set was promoted here.

## File map (❓ none exist yet)

| File | Status |
|---|---|
| `apps/web/features/booking/components/dashboard/turmas/ClassTemplateListPage.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/turmas/ClassTemplateCreateWizard.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/turmas/ClassAccessContractForm.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/turmas/EnrollmentListPage.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/turmas/AdminEnrollmentForm.tsx` | ❓ Gap |

## BFF calls (endpoints not yet implemented — contract per `docs/API_CONTRACTS.md` § Classes & Sessions)

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

- `01-turmas-list.html`'s per-row "Editar"/"Staff"/"Ver sessões" actions have no dedicated destination screens yet.

## Open questions / gaps

- [ ] Stories exist (`M24-S01`/`S02`/`S08`/`S11`/`S13`, `M24-S15`) — each needs `/story-discovery` first.
- [ ] Routing shape for the 3-step wizard (one route vs. three) is a decision for the implementing story.

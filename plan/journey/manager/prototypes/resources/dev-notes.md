# Dev Notes — MANAGER: Recursos (Resource Management)

## Overview

Dashboard section for creating and managing the tenant's `Resource` rows (`LOCATION`/`STAFF`/`ROOM`/`EQUIPMENT`) — the M21 Multi-Vertical Scheduling Cluster 1 (Foundation) feature. Nothing here is built yet; this is a ❓ GAP journey, relocated from `docs/discovery/multivertical-booking/prototype/` (`manager-01-resources-list.html`, `manager-04-criar-recurso.html`, `manager-04b-criar-recurso-erro.html`).

## File map (❓ none exist yet)

| File | Status |
|---|---|
| `apps/web/app/dashboard/resources/page.tsx` | ❓ Gap |
| `apps/web/app/dashboard/resources/new/page.tsx` | ❓ Gap |
| `apps/web/app/dashboard/resources/[id]/page.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/resources/ResourceListPage.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/resources/ResourceCreateForm.tsx` | ❓ Gap |
| `apps/web/features/booking/components/dashboard/resources/ResourceEditForm.tsx` | ❓ Gap (every field editable — name, type, refId, working hours, turnover, capacity — broadened from working-hours-only in PR #457 round 9+) |
| `apps/bff/http/resources/*.http` | ❓ Gap |

## BFF calls (endpoints not yet implemented — contract per `docs/14-API_CONTRACTS.md`)

```
GET /v1/resources?type=&isActive=
  Header: Authorization: Bearer {jwt}   (MANAGER)
  Response: { items: Resource[] }

POST /v1/resources
  Header: Authorization: Bearer {jwt}   (MANAGER)
  Body: { type: 'STAFF'|'ROOM'|'EQUIPMENT', refId?: string, name?: string, workingHours?: BusinessHours, turnoverMinutes?: number, maxCapacity?: number }
  Response 201: Resource
  Response 409: { code: 'BOOKING_RESOURCE_STAFF_ALREADY_WRAPPED' }   -- CAND-01 A1
  Response 422: { code: 'BOOKING_RESOURCE_NO_WORKING_HOURS' }        -- CAND-01 A2

PATCH /v1/resources/:id
  Body: every field independently optional (unsent = unchanged) —
    { name?, type?, refId?: string | null, workingHours?: BusinessHours | null, turnoverMinutes?: number, maxCapacity?: number | null }
    (broadened from working-hours-only in PR #457 round 9+; corrected here during M21-S04 story discovery, 2026-09-02)
  Response 200: Resource
  Response 404: not found / cross-tenant / (type→STAFF) target staff not found or inactive
  Response 409: type=STAFF target already wrapped by a different Resource / type changing to-or-from LOCATION
  Response 400/422: type changing away from STAFF without refId: null / no working hours anywhere after the update

DELETE /v1/resources/:id → 204   -- deactivate (UC-047)
POST /v1/resources/:id/reactivate → 200: Resource   -- reactivate (UC-049), no event published
```

Error codes above are illustrative — the implementing story mints the real `BOOKING_*` codes per `docs/25-ERROR_CATALOG.md`'s 3-step checklist (code → both locale translations → typed constructor), not these placeholder names.

## Screen: ResourceListPage (`/dashboard/resources`, UC-044)

**File:** `01-resources-list.html` (prototype)

Lists every `Resource`, grouped by `type` (`LOCATION` first — always exactly one, then `STAFF`, `ROOM`, `EQUIPMENT`), each row showing name, a working-hours summary ("Herda do negócio" when `workingHours = null`, otherwise the per-weekday summary), and an Ativo/Inativo badge. Inactive rows show a "Reativar" action instead of "Desativar"/"Horários" — same one-click-row-action pattern `manager/equipe.md`'s "Ativar" already established for `UC-031`.

**"+ Novo recurso"** — desktop topbar button + mobile FAB, same pair as `manager/equipe.md`'s "+ Convidar membro".

## Component: ResourceCreateForm (`/dashboard/resources/new`, UC-045)

**File:** `02-criar-recurso.html` (prototype) — real interactive type-switcher already built in the discovery pass (dev-notes item 15: "selecting Sala or Equipamento now swaps the staff-picker for a display-name field").

**Form fields:**

| Field | Component | Validation |
|---|---|---|
| `type` | 3-card selector: Profissional (STAFF) / Sala (ROOM) / Equipamento (EQUIPMENT) | required — `LOCATION` is never manually created |
| `refId` (STAFF only) | `<Select>` of existing, not-yet-wrapped `Staff` rows | required when `type = STAFF` |
| `name` (ROOM/EQUIPMENT only; denormalized display name for STAFF too) | `<Input type="text">` | required |
| `workingHours` | per-weekday open/close editor, same shape as tenant `businessHours` editor | optional — blank inherits tenant hours; every window must be a subset of the tenant's own hours |
| `turnoverMinutes` | `<Input type="number">` | optional, default 0, `>= 0` |
| `maxCapacity` | `<Input type="number">` (ROOM/EQUIPMENT/LOCATION only, hidden for STAFF) | optional, `> 0` when set |

**Error messages (pt-BR, from CAND-01 alt flows):**
- 409 staff already wrapped: "Este profissional já está vinculado a outro recurso."
- 422 no working hours anywhere: "Defina um horário de funcionamento para este recurso ou configure o horário padrão do negócio primeiro."

## Not yet prototyped (needed before implementation)

- **ResourceEditForm** (UC-046, every field editable — broadened from working-hours-only in PR #457 round 9+) — no discovery screen exists. Build the working-hours section from `apps/web/features/platform/components/settings/SettingsHoursSection.tsx`'s existing per-weekday hours editor (the tenant `businessHours` editor — same shape minus the timezone key; corrected during M21-S04 story discovery, 2026-09-02 — `staff/prototypes/horarios/` has no such editor to mirror), not from scratch.
- **Deactivate confirmation** (UC-047) — no discovery screen exists (flagged as a known gap by the discovery itself: "CAND-03... has zero entry points — not even a dead link"). Mirror `manager/prototypes/equipe/03-deactivate-confirm.html`'s shape: show the resource's future approved appointments/materialized sessions as explicit commitments (empty for a Cluster-1-only tenant — nothing populates this list until Clusters 2–4 land) before confirming.
- **Reactivate confirmation** (UC-049) — no discovery screen exists. A simple confirm dialog; on 200, no event published (`ResourceReactivated` descoped during M21-S01 story discovery, 2026-09-01 — no consumer exists yet).

## Known limitations

- Cluster 2–4 features this journey will eventually integrate with (`Service.classResourceSlots` eligibility pools, `resource_occupancy`-based availability) do not exist yet — `01-resources-list.html`'s "Horários" and "Serviços" nav links point at not-yet-promoted screens. See `staff/prototypes/horarios/dev-notes.md`'s matching note.
- `LOCATION` resources are never shown as editable/deactivatable in the discovery's own screens beyond the list row itself — the implementing story should decide whether the list even offers a "Desativar" action on the tenant's one `LOCATION` resource (probably not, since UC-047's A1/A2 don't cover this case and a tenant needs at least one always-active default resource).

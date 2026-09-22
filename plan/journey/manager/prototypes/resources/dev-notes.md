# Dev Notes — MANAGER: Recursos (Resource Management)

**Journey:** MANAGER — Recursos (Resource Management)
**UCs:** UC-044 (list), UC-045 (create), UC-046 (edit), UC-047 (deactivate), UC-048 (staff-deactivation cascade), UC-049 (reactivate)
**Prototype:** `manager/prototypes/resources/`
**Status:** ✅ Done — backend/BFF `M21-S01`, dashboard frontend `M21-S04`

---

## Overview

Dashboard section for creating and managing the tenant's `Resource` rows (`LOCATION`/`STAFF`/`ROOM`/`EQUIPMENT`) — the M21 Multi-Vertical Scheduling Cluster 1 (Foundation) feature. Fully shipped: backend/BFF endpoints (`M21-S01`), the historical `LOCATION` backfill + going-forward `TenantProvisioned` handler (`M21-S02`), and the manager dashboard UI (`M21-S04`, this document). Originally relocated from `docs/discovery/multivertical-booking/prototype/` (`manager-01-resources-list.html`, `manager-04-criar-recurso.html`, `manager-04b-criar-recurso-erro.html`).

---

## Routes (all ✅ shipped, no `[slug]` segment — dashboard is JWT/session-scoped)

| Prototype file | Production route | Page component |
|---|---|---|
| `01-resources-list.html` | `/dashboard/resources` | `ResourceListPage` |
| `02-criar-recurso.html` / `02b-criar-recurso-erro.html` | `/dashboard/resources/new` | `ResourceCreateForm` |
| Not prototyped (built from `SettingsHoursSection.tsx`'s pattern) | `/dashboard/resources/[id]` | `ResourceEditForm` / `ResourceEditFormFields` |
| Not prototyped (built from `equipe/03-deactivate-confirm.html`'s shape) | `/dashboard/resources/[id]/deactivate` | `ResourceDeactivatePage` (deactivate only — redirects away if the resource is already inactive) |

## BFF calls (all ✅ shipped)

| Action | Method + Path | Role guard | Request body | Success |
|---|---|---|---|---|
| List resources | `GET /v1/resources?type=&isActive=` | MANAGER | — | `ResourceListResponse` |
| Get one resource | `GET /v1/resources/:id` | MANAGER | — | `ResourceResponse` (added during `M21-S04` — no prior single-resource read endpoint existed) |
| Create resource | `POST /v1/resources` | MANAGER | `CreateResourceRequest` | `201` |
| Edit resource | `PATCH /v1/resources/:id` | MANAGER | `UpdateResourceRequest` (every field independently optional) | `200` |
| Deactivate resource | `DELETE /v1/resources/:id` | MANAGER | — | `204` |
| Reactivate resource | `POST /v1/resources/:id/reactivate` | MANAGER | — | `200` |

All endpoints exist (`apps/bff/src/features/booking/resource.controller.ts`; backend `apps/backend/src/contexts/booking/infrastructure/controllers/resource.controller.ts`). Full contract: `docs/14-API_CONTRACTS.md` § Resource Management.

## Screen: ResourceListPage (`/dashboard/resources`, UC-044)

Lists every `Resource`, sorted by `type` (`LOCATION` first — always exactly one, then `STAFF`, `ROOM`, `EQUIPMENT`), each row showing name, a working-hours summary ("Herda do negócio" when `workingHours = null`, otherwise the per-weekday summary), and an Ativo/Inativo badge. Filterable by both `type` (Todos/Profissionais/Salas/Equipamentos tabs, matching the prototype) and `isActive` (Todos/Ativos/Inativos, added during PR #459 bot review to satisfy UC-044's main flow — no prototype coverage for this second filter dimension). Inactive rows show a "Reativar" action instead of "Desativar"/"Horários" — same one-click-row-action pattern `manager/equipe.md`'s "Ativar" already established for `UC-031`. `LOCATION` never offers a "Desativar" action (UC-047 doesn't cover deactivating a tenant's one default resource).

**"+ Novo recurso"** — desktop topbar button + mobile FAB, same pair as `manager/equipe.md`'s "+ Convidar membro".

## Component: ResourceCreateForm (`/dashboard/resources/new`, UC-045)

Real interactive type-switcher (`ResourceIdentityFields`) — selecting Sala or Equipamento swaps the staff-picker for a display-name field, matching the discovery-stage prototype.

**Form fields:**

| Field | Component | Validation |
|---|---|---|
| `type` | 3-card selector: Profissional (STAFF) / Sala (ROOM) / Equipamento (EQUIPMENT) | required — `LOCATION` is never manually created |
| `refId` (STAFF only) | `<Select>` of existing, not-yet-wrapped, active `Staff` rows (currently-selected staff stays visible-but-disabled if since deactivated) | required when `type = STAFF` |
| `name` | `<Input type="text">` — for STAFF, auto-seeded from the picked staff member's own name but independently editable after (`Resource.name` is denormalized, per `docs/02-DOMAIN_MODEL.md` § Resource) | required for every type |
| `workingHours` | per-weekday open/close editor (`ResourceWorkingHoursEditor`, shared `WeekDayRow` primitive with the tenant `businessHours` editor) | optional — blank inherits tenant hours; every window must be a subset of the tenant's own hours |
| `turnoverMinutes` | `<Input type="number">` | optional, default 0, `>= 0` |
| `maxCapacity` | `<Input type="number">` (hidden for STAFF — discarded on submit even if a stale value exists from a prior type selection) | optional, `> 0` when set |

**Error messages (pt-BR, from UC-045 alt flows):** surfaced inline via the shared API-error resolver, not hardcoded per-code strings as originally drafted here.
- 409 staff already wrapped → `BOOKING_RESOURCE_STAFF_ALREADY_WRAPPED`
- 422 no working hours anywhere → `BOOKING_RESOURCE_NO_WORKING_HOURS`

## Component: ResourceEditForm / ResourceEditFormFields (`/dashboard/resources/[id]`, UC-046)

No discovery-stage prototype — built from `SettingsHoursSection.tsx`'s existing per-weekday hours editor pattern (same shape minus the timezone key, since a Resource always inherits the tenant's timezone). Every field is independently editable (broadened from working-hours-only in PR #457 round 9+). Split into an outer `ResourceEditForm` (fetch + topbar status + load-error state) and an inner `ResourceEditFormFields` (keyed by `resourceId`, initializes local form state directly from the loaded resource — no `useEffect` sync).

## Component: ResourceDeactivateConfirm (`/dashboard/resources/[id]/deactivate`, UC-047)

No discovery-stage prototype — mirrors `manager/prototypes/equipe/03-deactivate-confirm.html`'s shape. Shows the resource's future approved appointments/materialized sessions as explicit commitments (empty for a Cluster-1-only tenant — nothing populates this list until Clusters 2–4 land). This route only ever serves an active resource — `ResourceDeactivatePage` redirects back to the list if reached for one that's already inactive.

## Reactivation (UC-049) — inline row action, no dedicated screen

Corrected during live manual testing (2026-09-02, superseding an earlier confirm-screen implementation) to mirror `TeamListPage`/`MemberRow`'s own established precedent: reactivating a resource is a one-click action directly on `ResourceListPage`'s inactive row (`ReactivateResourceAction`, in `ResourceRow.tsx`), not a navigation to a confirmation screen. On success, no event is published (`ResourceReactivated` descoped during `M21-S01` story discovery — no consumer exists yet).

## Known limitations

- Cluster 2–4 features this journey will eventually integrate with (`Service.classResourceSlots` eligibility pools, `resource_occupancy`-based availability) do not exist yet.
- The STAFF picker (`ResourceCreateForm`/`ResourceEditFormFields`) fetches only the first 100 staff rows — the backend's own `GET /staff` hard-caps `limit` at 100 (`staff.controller.ts`), matching the Team page's own existing `fetchStaffList` precedent. No pagination/search UI exists anywhere in the codebase to build one from; worth a dedicated staff-search TD if team sizes ever realistically exceed 100.
- The resource list itself has no pagination — `GET /resources` has no `limit`/`offset` params in its documented contract, and Resources (rooms/equipment/staff-wrappers/one location) is an inherently small, physically-bounded dataset by domain nature, unlike customer/booking-scale entities.

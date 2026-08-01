# Equipe — Dev Notes

**Journey:** MANAGER — Equipe (Team Management)
**UCs:** UC-028 (invite), UC-029 (deactivate), UC-030 (edit profile), UC-031 (reactivate)
**Prototype:** `manager/prototypes/equipe/`
**Status:** ✅ Done — `M13-S43` (list, invite, deactivate, edit) / `M13-S44` (reactivate)

---

## Overview

Fully shipped. Updated 2026-07-31 — UC-030/UC-031 were added to this journey after a docs audit found them shipped with zero prototype coverage; everything else in this file was already accurate.

---

## Routes (all ✅ shipped, no `[slug]` segment — dashboard is JWT/session-scoped)

| Prototype file | Production route | Page component |
|---|---|---|
| `01-team-list.html` | `/dashboard/team` | `TeamListPage` |
| `02-invite-form.html` | `/dashboard/team/invite` | `InviteForm` |
| `03-deactivate-confirm.html` | `/dashboard/team/[id]/deactivate` | `DeactivateConfirmPage` |
| `04-staff-detail-edit.html` (added 2026-07-31) | `/dashboard/team/[id]` | `StaffDetailPage` (UC-030) |
| Reactivate (added 2026-07-31, no dedicated screen — one-click on `01-team-list.html`) | inline `PATCH /staff/:id/activate` | `TeamListPage` row action (UC-031) |

---

## BFF calls

| Action | Method + Path | Role guard | Request body | Success |
|---|---|---|---|---|
| List staff | `GET /staff` | MANAGER | — | `StaffListResponse` |
| Invite staff | `POST /staff/invite` | MANAGER | `InviteStaffDto` | `201` |
| Deactivate staff | `PATCH /staff/:id/deactivate` | MANAGER | — | `200` |
| Update staff (UC-030) | `PATCH /staff/:id` | MANAGER | `{ name, role }` | `200` |
| Reactivate staff (UC-031) | `PATCH /staff/:id/activate` | MANAGER | — | `200` |

All endpoints exist (`apps/bff/src/features/staff/staff.controller.ts`).

```typescript
interface InviteStaffDto {
  firstName: string;
  lastName: string;
  email: string;        // z.email()
  role: 'MANAGER' | 'STAFF';
}
```

**Important:** the API accepts `firstName`/`lastName` as separate fields, but the backend concatenates them into a single `name` field before persisting (`invite-staff.use-case.ts`: `` `${firstName} ${lastName}`.trim() ``). `docs/04-USE_CASES.md` UC-028 was corrected to reflect this (2026-06-16) — don't expect a `firstName`/`lastName` split when reading the staff list back; only `name` comes back from `GET /staff`.

---

## Deriving member status for the list UI

The `staff` table has **no dedicated "pending invite" status**, and since M13-S13's staff-auth security redesign, `Staff.invite()` provisions every row as `isActive = true` from the moment of creation (previously `false` — changed because `is_active=false` could be bypassed). This means `isActive` alone can no longer distinguish "never accepted the invite" from "currently active": a brand-new, never-logged-in invitee already has `isActive = true`. The reliable signal is `googleOAuthId`, set once at UC-025 activation and never cleared by `deactivate()` — it must be checked **before** `isActive`, not after:

```typescript
function memberStatus(member: { isActive: boolean; googleOAuthId: string | null }): 'active' | 'pending' | 'deactivated' {
  if (member.googleOAuthId === null) return 'pending';
  return member.isActive ? 'active' : 'deactivated';
}
```

This is implemented server-side in the BFF's `deriveStaffStatus()` (`apps/bff/src/features/staff/staff.mapper.ts`), which strips `googleOAuthId` from the response and exposes only the precomputed `status` field to the frontend — `StaffListItem` never sees `googleOAuthId` directly.

---

## Self-row protection (client-side, must also hold server-side)

The "Desativar" action must not render on the logged-in admin's own row (compare `member.staffId` to the JWT's `sub`). This is a UX nicety, not the actual safety net — `DeactivateStaffUseCase` already throws `StaffSelfDeactivationError` (403) server-side regardless of what the UI does. `03b-deactivate-self-error.html` shows the defensive error screen for the case this protection is bypassed (stale client state, multi-tab race).

---

## Validation (UC-028 invite form)

| Field | Rule | Error message |
|---|---|---|
| firstName | min 1 | "Informe o nome." |
| lastName | min 1 | "Informe o sobrenome." |
| email | `z.email()` | "E-mail inválido." |
| role | enum `MANAGER` \| `STAFF` | — (radio/card select, always has a default) |

## Error handling

| HTTP status | Scenario | UI response |
|---|---|---|
| `409` | Email already has an active staff record (UC-028 A1) | `email` field: red border + "Este e-mail já está cadastrado na sua equipe." — `02b-invite-error.html` |
| — | Email has an inactive record (UC-028 A2) | Silently reactivates; same success toast as a new invite — no distinct screen needed |
| `403` | Self-deactivation attempt (UC-029 A1) | `03b-deactivate-self-error.html` |
| `409` | Last active MANAGER (UC-029 A2) | `03c-deactivate-lastmanager-error.html` |
| `404` | Staff not found (stale URL) | `notFound()` |

---

## UC-030 — Edit staff profile (`StaffDetailPage`)

**File:** `apps/web/features/staff/components/team/StaffDetailPage.tsx` (✅ Exists)

Fields: `name` (editable), `email` (read-only, tied to the Google account), `role` (`RoleSelectorField` — `STAFF`/`MANAGER`). No phone field. Submits `PATCH /staff/:id { name, role }`; on success, `router.push('/dashboard/team')`.

## UC-031 — Reactivate staff (one-click, `TeamListPage`)

No dedicated screen — an inactive row in `TeamListPage` gets a one-click "Ativar" action calling `PATCH /staff/:id/activate`, mirroring the pattern already used for reactivating a service (`staff/servicos.md`).

## Types

`StaffResponse`/`StaffListResponse` in `@ikaro/types` are the real shapes consumed by `TeamListPage`/`StaffDetailPage`.

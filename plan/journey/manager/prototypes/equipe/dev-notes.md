# Equipe — Dev Notes

**Journey:** MANAGER — Equipe (Team Management)
**UCs:** UC-028 (invite), UC-029 (deactivate)
**Prototype:** `manager/prototypes/equipe/`

---

## Overview

Both backend and BFF are fully implemented and `MANAGER`-guarded (confirmed via `/uc-audit UC-026,UC-027,UC-028,UC-029`, 2026-06-16). This is a **frontend-only** gap — no new backend or BFF story needed, just thinner `.http` coverage on the BFF side for invite/deactivate (`apps/bff/http/staff/staff.http` only documents list/detail; add invite + deactivate examples as a small hygiene fix, not blocking).

---

## Routes

| Prototype file | Production route | Page component |
|---|---|---|
| `01-team-list.html` | `/{slug}/dashboard/team` | `TeamListPage` |
| `02-invite-form.html` | `/{slug}/dashboard/team/invite` | `InviteStaffForm` |
| `03-deactivate-confirm.html` | `/{slug}/dashboard/team/[id]/deactivate` or bottom-sheet | `DeactivateConfirmPage` or `DeactivateSheet` |

> ⚠️ **Open question:** invite form as full page vs. modal/sheet, and deactivate confirmation as dedicated route vs. inline sheet. The prototype uses full pages for both, matching the `staff/servicos.md` precedent. Decide before implementing.

---

## BFF calls

| Action | Method + Path | Role guard | Request body | Success |
|---|---|---|---|---|
| List staff | `GET /staff` | MANAGER | — | `StaffListResponse` |
| Invite staff | `POST /staff/invite` | MANAGER | `InviteStaffDto` | `201` |
| Deactivate staff | `PATCH /staff/:id/deactivate` | MANAGER | — | `200` |

All endpoints exist (`apps/bff/src/staff/staff.controller.ts`). Verify exact response shape against `@ikaro/types` before using.

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

The `staff` table has **no dedicated "pending invite" status** — both a never-activated invitee and a deactivated former member have `isActive = false`. Distinguish them client-side using fields already on the aggregate:

```typescript
function memberStatus(member: StaffListItem): 'active' | 'pending' | 'deactivated' {
  if (member.isActive) return 'active';
  return member.googleOAuthId === null ? 'pending' : 'deactivated';
}
```

`googleOAuthId` is set once, during UC-025 activation (`staff.aggregate.ts` `activate()`), and is never cleared by `deactivate()`. So `googleOAuthId === null` reliably means "never accepted the invite." Verify `StaffListItem` actually exposes `googleOAuthId` through the BFF response — if it's stripped for privacy, the BFF needs to expose a precomputed `status` field instead (cleaner anyway; consider proposing this as the API shape rather than leaking `googleOAuthId` to the frontend).

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

## Missing types

`StaffListItem`/`StaffListResponse` shape not yet verified in `@ikaro/types` — audit before implementing and add the `googleOAuthId` (or precomputed `status`) field discussed above.

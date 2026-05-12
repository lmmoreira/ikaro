# Backend Agent — Staff Context

You implement domain logic and use cases for the Staff bounded context.

---

## File Boundary (hard rule)

You may ONLY create or edit files under:
```
apps/backend/src/contexts/staff/
```
If a task requires touching any other path, **STOP** and report to the orchestrator.

---

## Load for Each Task

From the story brief (provided in your prompt).
If you need to verify something:
- `docs/04-USE_CASES.md` — UC-022, UC-028, UC-029
- `docs/02-DOMAIN_MODEL.md` — Staff aggregate
- `docs/06-TENANT_ISOLATION_STRATEGY.md` — single-tenant staff model

---

## Folder Structure You Must Follow

```
apps/backend/src/contexts/staff/
├── domain/
│   ├── entities/           # Staff
│   └── services/           # StaffDomainService
├── application/
│   ├── use-cases/          # StaffLoginUseCase, AcceptInviteUseCase
│   ├── ports/              # IStaffRepository
│   └── dtos/
└── infrastructure/
    ├── persistence/         # TypeOrmStaffRepository
    └── controllers/         # StaffController
```

---

## Critical Multi-Tenancy Rule for Staff

Staff are **single-tenant**:
- One `Staff` row per person per tenant.
- **`UNIQUE(tenant_id, google_oauth_id)`** at the DB level.
- A person cannot be staff at two tenants with the same Google account (by design).
- JWT payload includes `tenantId`, `tenantSlug`, `role: STAFF`.

This is different from Customers, who can exist at multiple tenants.

---

## Use Cases in Scope

| UC | Title |
|---|---|
| UC-022 | Staff login — single tenant (Google OAuth) |
| UC-025 | Admin first login / accepts invite |
| UC-028 | Invite new staff (triggered by Platform context event) |
| UC-029 | Deactivate staff (triggered by Platform context event) |

UC-015 is **superseded by UC-022** — do not implement UC-015.

---

## Key Domain Rules

- Staff login (UC-022) uses Google OAuth — no password auth.
- Invite flow (UC-025, UC-028): Platform context emits `StaffInvited`. Staff context listens and creates a pending `Staff` record. On first OAuth login, the record is activated.
- Deactivation (UC-029): Platform context emits `StaffDeactivated`. Staff context marks the record inactive. JWT is invalidated on next request.
- `isActive` flag controls access — deactivated staff cannot log in.

---

## Invariants (non-negotiable)

- Every query filters by `tenant_id`
- `UNIQUE(tenant_id, google_oauth_id)` at DB level — enforced in domain too
- No password-based auth — Google OAuth only
- No synchronous cross-context calls — listen to Platform events
- No import from other context paths
- No `any`, no `@ts-ignore`

---

## Self-Check Before Opening PR

```
□ Every repository query filters by tenant_id
□ Staff entity has UNIQUE(tenant_id, google_oauth_id)
□ No password fields — Google OAuth only
□ Deactivated staff are blocked on the next request (isActive check)
□ Invite flow triggered by StaffInvited event from Platform — not synchronous call
□ No imports from other context paths
□ Functions ≤ 20 lines, classes ≤ 200 lines
□ No 'any', no @ts-ignore
```

Open PR as **DRAFT**.
Title: `[UC-XXX] <description> (backend-staff)`

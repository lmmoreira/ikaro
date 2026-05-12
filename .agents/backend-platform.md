# Backend Agent — Platform Context

You implement domain logic and use cases for the Platform bounded context.

---

## File Boundary (hard rule)

You may ONLY create or edit files under:
```
apps/backend/src/contexts/platform/
```
If a task requires touching any other path, **STOP** and report to the orchestrator.

---

## Load for Each Task

From the story brief (provided in your prompt).
If you need to verify something:
- `docs/04-USE_CASES.md` — UC-024 to UC-029
- `docs/02-DOMAIN_MODEL.md` — Tenant, HotsiteConfig aggregates
- `docs/03-DOMAIN_EVENTS.md` — StaffInvited, StaffDeactivated

---

## Folder Structure You Must Follow

```
apps/backend/src/contexts/platform/
├── domain/
│   ├── entities/           # Tenant, HotsiteConfig
│   ├── value-objects/      # Slug (globally unique), TenantSettings
│   └── services/           # TenantProvisioningService
├── application/
│   ├── use-cases/          # ProvisionTenantUseCase, InviteStaffUseCase, etc.
│   ├── ports/              # ITenantRepository, IHotsiteConfigRepository
│   └── dtos/
└── infrastructure/
    ├── persistence/         # TypeOrmTenantRepository
    ├── controllers/         # TenantController, HotsiteController
    └── event-publishers/    # PubSubPlatformPublisher
```

---

## Use Cases in Scope

| UC | Title |
|---|---|
| UC-024 | Developer provisions new tenant (CLI) |
| UC-025 | Admin first login / accepts invite |
| UC-026 | Admin edits tenant settings |
| UC-027 | Admin manages hotsite content |
| UC-028 | Admin invites new staff member |
| UC-029 | Admin deactivates staff member |

---

## Key Domain Rules

### Tenant
- `slug` is globally unique across all tenants (URL-safe, e.g. `lavacar-belo`)
- `tenants.settings` is a JSONB column — all configurable values live here
- Schema: `docs/21-TENANTS_SETTINGS_SCHEMA.md`

### HotsiteConfig
- Per-tenant. Controls public hotsite branding and module layout.
- Served as a JSON manifest by the BFF — never the backend directly.

### Staff (multi-tenancy rule)
- Staff are **single-tenant**: `UNIQUE(tenant_id, google_oauth_id)` at DB level
- `StaffInvited` event triggers an invite email via the Notification context
- `StaffDeactivated` event revokes access

### Authentication (Google OAuth only)
- No password-based auth in MVP
- UC-025 (first login) uses Google OAuth callback — no email/password flow

---

## Events Published

- `StaffInvited` — UC-028, triggers invite email
- `StaffDeactivated` — UC-029, revokes access

All events use the standard 7-field envelope (CLAUDE.md §4).

---

## Invariants (non-negotiable)

- Every query filters by `tenant_id`
- `slug` must be validated as URL-safe and globally unique before persisting
- Staff: `UNIQUE(tenant_id, google_oauth_id)` enforced at DB and domain level
- Tenant settings are always read from `tenants.settings` JSONB — never env vars for business rules
- No synchronous cross-context calls — use events
- No import from other context paths
- No `any`, no `@ts-ignore`

---

## Self-Check Before Opening PR

```
□ Every query filters by tenant_id
□ Slug uniqueness validated (globally, not per-tenant)
□ Staff uniqueness: UNIQUE(tenant_id, google_oauth_id)
□ StaffInvited and StaffDeactivated use standard 7-field envelope
□ No hardcoded config values — everything reads from tenants.settings
□ No imports from other context paths
□ Functions ≤ 20 lines, classes ≤ 200 lines
□ No 'any', no @ts-ignore
□ No password auth — Google OAuth only
```

Open PR as **DRAFT**.
Title: `[UC-XXX] <description> (backend-platform)`

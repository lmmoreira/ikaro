# Backend Agent — Customer Context

You implement domain logic and use cases for the Customer bounded context.

---

## File Boundary (hard rule)

You may ONLY create or edit files under:
```
apps/backend/src/contexts/customer/
```
If a task requires touching any other path, **STOP** and report to the orchestrator.

---

## Load for Each Task

From the story brief (provided in your prompt).
If you need to verify something:
- `docs/04-USE_CASES.md` — UC-021, UC-022, UC-023, UC-006
- `docs/02-DOMAIN_MODEL.md` — Customer aggregate
- `docs/06-TENANT_ISOLATION_STRATEGY.md` — multi-tenant customer model

---

## Folder Structure You Must Follow

```
apps/backend/src/contexts/customer/
├── domain/
│   ├── entities/           # Customer
│   └── services/           # CustomerDomainService
├── application/
│   ├── use-cases/          # FindOrCreateCustomerUseCase, SwitchTenantUseCase
│   ├── ports/              # ICustomerRepository
│   └── dtos/
└── infrastructure/
    ├── persistence/         # TypeOrmCustomerRepository
    └── controllers/         # CustomerController
```

---

## Critical Multi-Tenancy Rule for Customers

Customers are **multi-tenant**:
- The same Google `sub` (OAuth subject) can have **multiple `Customer` rows** — one per tenant.
- **No `UNIQUE` constraint on `google_oauth_id` alone.**
- The correct unique constraint is `UNIQUE(tenant_id, google_oauth_id)`.
- This means a customer can book at multiple car washes independently.

```typescript
// CORRECT
@Unique(['tenantId', 'googleOAuthId'])
export class Customer { ... }

// WRONG — never do this
@Unique(['googleOAuthId'])  // ❌ breaks multi-tenancy
export class Customer { ... }
```

This is different from Staff, who are single-tenant.

---

## Use Cases in Scope

| UC | Title |
|---|---|
| UC-021 | Customer login + tenant selection (Google OAuth) |
| UC-023 | Customer switches tenant |
| UC-006 | Customer views and manages their bookings |

UC-014 is **superseded by UC-021** — do not implement UC-014.

---

## Key Domain Rules

- `findOrCreate` pattern: on OAuth login, find existing Customer row for `(tenantId, googleOAuthId)` or create one.
- Customer profile is per-tenant — same person can have different display names per tenant.
- JWT payload includes `tenantId`, `tenantSlug`, `role: CUSTOMER`.
- Tenant switching (UC-023) issues a new JWT with the new `tenantId` — does not share sessions.

---

## Invariants (non-negotiable)

- Every query filters by `tenant_id`
- `UNIQUE(tenant_id, google_oauth_id)` — not on `google_oauth_id` alone
- No synchronous cross-context calls
- No import from other context paths
- No `any`, no `@ts-ignore`

---

## Self-Check Before Opening PR

```
□ Every repository query filters by tenant_id
□ Customer entity has UNIQUE(tenant_id, google_oauth_id) — NOT on google_oauth_id alone
□ findOrCreate uses (tenantId, googleOAuthId) as the lookup key
□ Tenant switching issues a new JWT — does not reuse existing session
□ No imports from other context paths
□ Functions ≤ 20 lines, classes ≤ 200 lines
□ No 'any', no @ts-ignore
```

Open PR as **DRAFT**.
Title: `[UC-XXX] <description> (backend-customer)`

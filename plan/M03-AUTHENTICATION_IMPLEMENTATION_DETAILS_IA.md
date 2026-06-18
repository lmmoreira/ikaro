# M03 — Authentication Implementation Details (AI Agents)

**Audience:** AI coding agents working on M04+  
**Purpose:** Avoid re-learning what M03 solved. Load when touching auth, OAuth, JWT, BFF guards, customer/staff login, or tenant switching.  
**Companion:** Always read `CLAUDE.md` first. Load this file for any M04+ work that touches the auth layer or BFF.

---

## 1. Artifacts Table

| Artifact | Location | Notes |
|---|---|---|
| Customer aggregate | `src/contexts/customer/domain/customer.aggregate.ts` | Multi-tenant — same Google `sub` = multiple rows (one per tenant); `email: Email` VO |
| Staff aggregate | `src/contexts/staff/domain/staff.aggregate.ts` | Single-tenant; `UNIQUE(tenant_id, google_oauth_id)` partial index (nullable); `email: Email` VO |
| `FindOrCreateCustomerUseCase` → `FindOrCreateCustomerUseCaseResult` | `src/contexts/customer/application/use-cases/` | Idempotent: finds or creates Customer for a `(tenantId, googleOAuthId)` pair |
| `GetCustomerTenantsUseCase` → `GetCustomerTenantsUseCaseResult` | `src/contexts/customer/application/use-cases/` | All tenants for a googleOAuthId — used in multi-tenant login + `POST /auth/token` |
| `GetCustomerTenantsByIdUseCase` → `GetCustomerTenantsByIdUseCaseResult` | `src/contexts/customer/application/use-cases/` | Bridge for switch-tenant: `(customerId, tenantId)` → googleOAuthId → all tenants |
| `GetStaffByOAuthIdUseCase` → `GetStaffByOAuthIdUseCaseResult` | `src/contexts/staff/application/use-cases/` | Throws `StaffNotFoundError` if not found; returns `{ staffId, tenantId, role, isActive }` |
| `CustomerNotFoundError` | `src/contexts/customer/domain/errors/customer-domain.error.ts` | Extends `CustomerDomainError` |
| `StaffNotFoundError` | `src/contexts/staff/domain/errors/staff-domain.error.ts` | Extends `StaffDomainError` |
| `mapCustomerError` | `src/contexts/customer/infrastructure/http/customer-error.mapper.ts` | `CustomerNotFoundError`→404, `CustomerDomainError`→400 |
| `mapStaffError` | `src/contexts/staff/infrastructure/http/staff-error.mapper.ts` | `StaffNotFoundError`→404, `StaffDomainError`→400 |
| `InternalCustomerController` | `src/contexts/customer/infrastructure/controllers/` | `GET /internal/customers/tenants` · `GET /internal/customers/:customerId/tenants` · `POST /internal/customers` |
| `InternalStaffController` | `src/contexts/staff/infrastructure/controllers/` | `GET /internal/staff/by-oauth?googleOAuthId=<sub>` |
| `InternalTenantReadController` | `src/contexts/platform/infrastructure/controllers/` | `GET /internal/tenants/by-slug/:slug` (static first) · `GET /internal/tenants/:tenantId` |
| `GoogleStrategy` | `apps/bff/src/auth/strategies/google.strategy.ts` | `passReqToCallback: true` — validate signature is `(req, access, refresh, profile, done)` |
| `GoogleAuthGuard` | `apps/bff/src/auth/guards/google-auth.guard.ts` | Overrides `getAuthenticateOptions()` — `type=staff` → `state='__staff__'`, `tenantSlug` → `state=<slug>` |
| `JwtStrategy` | `apps/bff/src/auth/strategies/jwt.strategy.ts` | Reads Bearer header AND `access_token` cookie (inline regex — no cookie-parser) |
| `JwtIssuerService` | `apps/bff/src/auth/jwt-issuer.service.ts` | `issueToken({ sub, tenantId, tenantSlug, role }): string`; `sub` = backend entity UUID always |
| `SelectionTokenService` | `apps/bff/src/auth/selection-token.service.ts` | 5-min JWTs with `type:'selection'` — prevents misuse as access token |
| `JWT_COOKIE_OPTIONS` | `apps/bff/src/auth/cookie-options.ts` | `httpOnly, secure, sameSite:'lax', maxAge:7d, path:'/'` — import from here, never `main.ts` |
| `IssueTokenDto` | `apps/bff/src/auth/dtos/issue-token.dto.ts` | Zod schema for `POST /auth/token` body |
| `SwitchTenantDto` | `apps/bff/src/auth/dtos/switch-tenant.dto.ts` | Zod schema for `POST /auth/switch-tenant` body |
| `AuthController` | `apps/bff/src/auth/auth.controller.ts` | `GET /auth/google` · `GET /auth/google/callback` · `POST /auth/token` · `POST /auth/switch-tenant` |
| `ZodValidationPipe` (BFF) | `apps/bff/src/shared/http/zod-validation.pipe.ts` | Separate copy from backend — BFF has no shared package dependency |
| `JwtAuthGuard` | `apps/bff/src/shared/guards/jwt-auth.guard.ts` | Global; `@Public()` bypasses it |
| `TenantGuard` | `apps/bff/src/shared/guards/tenant.guard.ts` | Compares `X-Tenant-Slug` header with JWT `tenantSlug` |
| `RolesGuard` | `apps/bff/src/shared/guards/roles.guard.ts` | `@Roles('CUSTOMER')` / `@Roles('MANAGER')` decorators |
| `CurrentUser` / `CurrentUserPayload` | `apps/bff/src/shared/decorators/current-user.decorator.ts` | `{ sub, tenantId, tenantSlug, role }` — `sub` is backend entity UUID |
| `BackendHttpService` | `apps/bff/src/shared/http/backend-http.service.ts` | REQUEST-scoped; injects `X-Actor-*` + `X-Tenant-ID` + `X-Correlation-ID` headers |

---

## 2. Critical Gotchas

**#1 — OAuth state encoding (3 distinct cases)**
```
GET /auth/google                    → state=''          → general customer login (no tenant context)
GET /auth/google?tenantSlug=<slug>  → state=<slug>      → hotsite customer login
GET /auth/google?type=staff         → state=__staff__   → staff login
```
`'__staff__'` uses underscores (not in `[a-z0-9-]+` slug charset) — zero collision risk with real slugs. A plain slug `'staff'` routes to customer flow, not staff.

**#2 — `passReqToCallback: true` changes validate() signature**
```typescript
// req is FIRST when passReqToCallback: true
validate(req, _access, _refresh, profile, done): void
```
Without this, the signature is `(_access, _refresh, profile, done)` — wrong argument count causes silent failures.

**#3 — `JWT_COOKIE_OPTIONS` must NOT be in `main.ts`**
`import { X } from '../main'` triggers bootstrap → `validateEnv()` → `process.exit(1)` in tests. Constant lives in `apps/bff/src/auth/cookie-options.ts`.

**#4 — `sub` is always backend entity UUID, never Google's OAuth sub**
- Staff/Manager → `staffId` (from `staff.staff` table)
- Customer → `customerId` (from `customer.customers` table, tenant-scoped)

**#5 — `BackendHttpService` is REQUEST-scoped — use `jest.fn()` in BFF controller tests**
No in-memory double exists. `jest.fn()` is correct here (exception to the general rule). Use case tests in backend still use `InMemoryXxxRepository`.

**#6 — `actor` headers during OAuth callback**
`req.user` is a `GoogleProfile` (truthy but no `sub`). `BackendHttpService.headers()` guards on `user?.sub` — not `user` — to avoid forwarding `X-Actor-Type: STAFF` with `X-Actor-ID: undefined`.

**#7 — Cookie `path:'/'` is mandatory**
Omitting `path` scopes the cookie to `/v1/auth/google/callback`. Frontend at `/dashboard` never sees it.

**#8 — Static routes before dynamic in the same controller**
`@Get('by-slug/:slug')` before `@Get(':tenantId')`. `@Get('tenants')` before `@Get(':customerId/tenants')`. NestJS resolves in declaration order.

**#9 — Zod v4 UUID format**
`z.string().uuid()` deprecated → use `z.uuid()`. Zod v4 validates RFC 4122 variant bits — segment-3 must start with `[1-8]`, segment-4 with `[89abAB]`. Test UUIDs must follow: `'10000000-0000-4000-8000-000000000001'`.

**#10 — `StaffEntityBuilder` id must be `uuidv7()`**
Fixed in M03-S07 (was hardcoded). Every second `save()` would silently upsert the first row.

**#11 — SonarCloud S6582: optional chain over `||` null guards**
`if (!customer || customer.tenantId !== tenantId)` → `if (customer?.tenantId === tenantId)` SonarCloud flags the `||` form as a major issue.

**#12 — `mapXxxError` dedicated spec required for SonarCloud coverage**
Only the 404 branch is exercised by controller tests. Create `xxx-error.mapper.spec.ts` to cover all 4 branches: domain-specific error → 4xx, generic domain error → 400, `Error` re-throw, unknown → wrapped `Error`.

**#13 — Inactive staff (isActive=false) flow**
`findByGoogleOAuthId` finds staff only if `googleOAuthId` is set. Invited-but-not-yet-activated staff have `googleOAuthId=null` → `findByGoogleOAuthId` returns null → BFF redirects to `not-a-staff-member`. Deactivated staff (previously active → googleOAuthId set, isActive=false) → BFF redirects to `/auth/first-login?staffId=<id>`. Activation flow (UC-025) implemented in M04-S01.

**#14 — `.catch(() => null)` antipattern for backend HTTP calls**
Only catch 404 specifically. `.catch(err => { if (err instanceof HttpException && err.getStatus() === 404) return null; throw err; })` — avoids swallowing 5xx/timeouts.

**#15 — Use case result type naming**
Every use case `execute()` return type must be named `{UseCaseClassName}Result` and exported from the same `.use-case.ts` file. Never `*Info`, `*Dto`, or raw `T[]`. All use cases in M03 follow this pattern — see artifact table above.

**#16 — Request DTO naming and split-DTO pattern**
Input DTOs are named `{Action}Dto`; Zod schema is `{Action}Schema`. Never use a `{Action}RequestDto` suffix. When a path param must accompany a body (e.g. `staffId` from `@Param` + body fields), pass them as **separate arguments**: `execute(staffId, dto: ActivateStaffDto)` — not merged via `{ staffId, ...dto }`. The `ActivateStaffDto` in this milestone is `z.infer<typeof ActivateStaffSchema>` (body only); `staffId` is the first parameter.

---

## 3. Auth Flows

### UC-021 — Customer login (hotsite or general)
```
GET /auth/google?tenantSlug=lavacar-bh   (hotsite)
  → state=lavacar-bh → Google → callback
  → GET /internal/tenants/by-slug/lavacar-bh
  → POST /internal/customers { tenantId, googleOAuthId, email, name }  ← FindOrCreate (idempotent)
  → JWT { sub: customerId, tenantId, tenantSlug, role: CUSTOMER }
  → cookie + redirect /dashboard

GET /auth/google   (no tenantSlug)
  → GET /internal/customers/tenants?googleOAuthId=<sub>
  → 0 tenants → /auth/error?reason=no-tenant
  → 1 tenant  → JWT → /dashboard
  → 2+ tenants → SelectionToken (5 min) → /select-tenant?token=...
    → POST /auth/token { selectionToken, tenantId } → JWT → { accessToken, expiresIn }
```

### UC-022 — Staff login
```
GET /auth/google?type=staff
  → state=__staff__ → Google → callback
  → GET /internal/staff/by-oauth?googleOAuthId=<sub>
  → 404 (not found) → /auth/error?reason=not-a-staff-member
  → found, isActive=false → /auth/first-login?staffId=<id>  (UC-025 — implemented M04-S01)
  → found, isActive=true  → GET /internal/tenants/:tenantId → JWT { sub: staffId, role: STAFF|MANAGER }
```

### UC-023 — Customer switches tenant
```
POST /auth/switch-tenant { targetTenantId }   [JWT required, role: CUSTOMER]
  → GET /internal/customers/:sub/tenants?tenantId=:currentTenantId
  → targetTenantId not in list → 403
  → found → GET /internal/tenants/:targetTenantId
  → new JWT { sub: targetCustomerId, tenantId: targetTenantId, tenantSlug, role: CUSTOMER }
```

---

## 4. JWT Payload
```json
{
  "sub":        "<backend-entity-uuid>",
  "tenantId":   "<uuid>",
  "tenantSlug": "<slug>",
  "role":       "CUSTOMER | STAFF | MANAGER",
  "iat": 0,
  "exp": 0
}
```

---

## 5. Environment Variables Added in M03

| Var | App | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | BFF | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | BFF | Google OAuth 2.0 client secret |
| `GOOGLE_CALLBACK_URL` | BFF | Local dev: `http://localhost:3002/v1/auth/google/callback` |
| `JWT_SECRET` | BFF | Min 64 chars — validated at startup |
| `JWT_EXPIRES_IN` | BFF | Default `7d` |
| `FRONTEND_URL` | BFF | Default `http://localhost:3000` |

---

## 6. Test Patterns Established in M03

**BFF controller test — `BackendHttpService` via `jest.fn()` (correct):**
```typescript
const makeBackendHttp = (overrides?: Partial<BackendHttpService>): BackendHttpService =>
  ({ get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn(), ...overrides })
  as unknown as BackendHttpService;
```

**Use `beforeEach` in all specs (not `makeXxx` helper functions):**
```typescript
describe('SomeController', () => {
  let repo: InMemoryXxxRepository;
  let controller: SomeController;

  beforeEach(() => {
    repo = new InMemoryXxxRepository();
    controller = new SomeController(new SomeUseCase(repo));
  });
```

**Zod v4-compliant test UUID constants:**
```typescript
const TENANT_ID_A  = '10000000-0000-4000-8000-000000000001';
const CUSTOMER_ID_A = '20000000-0000-4000-8000-000000000001';
const STAFF_ID_A   = '30000000-0000-4000-8000-000000000001';
```

---

## 7. Common Commands (M04+)

```bash
# Customer context unit tests
pnpm --filter @ikaro/backend exec jest --testPathPatterns="contexts/customer" --no-coverage --selectProjects unit

# Staff context unit tests
pnpm --filter @ikaro/backend exec jest --testPathPatterns="contexts/staff" --no-coverage --selectProjects unit

# All BFF tests
pnpm --filter @ikaro/bff exec jest --no-coverage

# Full type-check
pnpm --filter @ikaro/backend run type-check && pnpm --filter @ikaro/bff run type-check
```

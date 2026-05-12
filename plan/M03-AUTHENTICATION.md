# M03 — Authentication

**Phase:** Local Development  
**Goal:** A customer can sign in with Google OAuth, see their tenant list, receive a JWT, and access protected endpoints. A staff member signs in and is routed directly to their single tenant. All subsequent milestones rely on this JWT as the identity and tenant carrier.  
**Depends on:** M02 (tenants must exist), M00-S04 (BFF skeleton)  
**Blocks:** M04 (staff management needs auth), M07 (booking creation needs customer identity), M13 (dashboard needs auth)

---

## Stories

---

### M03-S01 — Customer domain layer + migration

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Customer context, `docs/06-TENANT_ISOLATION_STRATEGY.md` § customer multi-tenant model

**Description:**  
Implement the `Customer` aggregate domain layer and its database migration. Customers are multi-tenant: the same Google `sub` can appear as multiple `Customer` rows — one per tenant. There must be NO unique constraint on `google_oauth_id` alone.

**Domain layer (`apps/backend/src/contexts/customer/domain/`):**
- `Customer` aggregate:
  - Properties: `id` (UUID v7), `tenantId`, `googleOAuthId`, `email`, `name`, `phone?`, `defaultAddress?` (Address value object), `createdAt`
  - Methods: `create(tenantId, googleOAuthId, email, name)`, `updateProfile(name, phone, defaultAddress)`
  - Invariants: `email` must be valid format, `tenantId` required

**Migration (`customer.customers` table):**
```sql
id               UUID PRIMARY KEY
tenant_id        UUID NOT NULL
google_oauth_id  VARCHAR(255) NOT NULL
email            VARCHAR(255) NOT NULL
name             VARCHAR(255) NOT NULL
phone            VARCHAR(20)
default_address  JSONB
created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
INDEX (tenant_id)
INDEX (tenant_id, google_oauth_id)    ← lookup by OAuth ID per tenant
-- NO UNIQUE on google_oauth_id alone
```

**Repository port `ICustomerRepository`:**
- `findByTenantAndOAuthId(tenantId, googleOAuthId): Promise<Customer | null>`
- `findAllTenantsByOAuthId(googleOAuthId): Promise<{ tenantId, tenantSlug, activePoints }[]>` — used in UC-021 tenant selection
- `save(customer): Promise<void>`

**Acceptance criteria:**
- [ ] Two `Customer` rows with the same `google_oauth_id` but different `tenant_id` can coexist (no unique violation)
- [ ] `findByTenantAndOAuthId(tenantA, oauthId)` returns customer for Tenant A; same call with `tenantB` returns null or Tenant B's customer
- [ ] Migration runs and reverts cleanly
- [ ] No `@nestjs/*` imports in domain layer
- [ ] Unit tests cover invariants (invalid email, missing tenantId)
- [ ] Integration test (Testcontainers): create two customers for same `google_oauth_id` in different tenants — both persist without error

**Dependencies:** M00-S08, M02-S02

---

### M03-S02 — Staff domain layer + migration

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Staff context, `docs/06-TENANT_ISOLATION_STRATEGY.md` § staff single-tenant model

**Description:**  
Implement the `Staff` aggregate domain layer and its database migration. Staff are single-tenant: a `UNIQUE(tenant_id, google_oauth_id)` constraint prevents the same person from being staff at multiple tenants. The `google_oauth_id` is `NULL` until the staff member completes their first login (UC-025).

**Domain layer (`apps/backend/src/contexts/staff/domain/`):**
- `Staff` aggregate:
  - Properties: `id` (UUID v7), `tenantId`, `googleOAuthId?` (null until first login), `email`, `role` (`MANAGER | STAFF`), `isActive`, `createdAt`
  - Methods: `invite(tenantId, email, role)` (static factory — creates with `isActive=false`, `googleOAuthId=null`), `activate(googleOAuthId)`, `deactivate()`
  - Invariants: `role` must be `MANAGER` or `STAFF`, cannot deactivate if last active MANAGER in tenant

**Migration (`staff.staff` table):**
```sql
id               UUID PRIMARY KEY
tenant_id        UUID NOT NULL
google_oauth_id  VARCHAR(255)          ← nullable until first login
email            VARCHAR(255) NOT NULL
role             VARCHAR(20) NOT NULL CHECK (role IN ('MANAGER','STAFF'))
is_active        BOOLEAN NOT NULL DEFAULT false
created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE(tenant_id, google_oauth_id)    ← enforces single-tenant constraint
INDEX(tenant_id)
INDEX(tenant_id, email)
```

**Repository port `IStaffRepository`:**
- `findByTenantAndOAuthId(tenantId, googleOAuthId): Promise<Staff | null>`
- `findByTenantAndEmail(tenantId, email): Promise<Staff | null>`
- `findById(id, tenantId): Promise<Staff | null>`
- `findAllByTenant(tenantId): Promise<Staff[]>`
- `countActiveManagersByTenant(tenantId): Promise<number>`
- `save(staff): Promise<void>`

**Acceptance criteria:**
- [ ] Two staff with the same `google_oauth_id` in different `tenant_id` values causes a unique constraint violation
- [ ] `google_oauth_id` can be null (before first login)
- [ ] `Staff.invite()` creates an aggregate with `isActive=false` and `googleOAuthId=null`
- [ ] `Staff.activate('sub123')` sets `googleOAuthId='sub123'` and `isActive=true`
- [ ] Migration runs and reverts cleanly
- [ ] Integration test: attempt to insert same `(tenant_id, google_oauth_id)` twice → unique constraint error

**Dependencies:** M00-S08, M02-S02

---

### M03-S03 — BFF Google OAuth strategy + auth module

**Agent:** `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md` § OAuth + JWT flow, `docs/14-API_CONTRACTS.md` § auth endpoints

**Description:**  
Implement the Google OAuth 2.0 authentication flow in the BFF using `passport-google-oauth20`. When Google redirects back, the BFF receives the user's profile (name, email, Google `sub`) and uses it to resolve the correct Customer or Staff records in the backend.

**What to create in `apps/bff/src/auth/`:**
- `GoogleStrategy` — extends `PassportStrategy(Strategy, 'google')`, requests scopes: `email profile`, reads `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_CALLBACK_URL` from env
- `AuthModule` — imports `PassportModule`, registers `GoogleStrategy`
- `AuthController`:
  - `GET /auth/google` — `@UseGuards(AuthGuard('google'))` (redirects to Google)
  - `GET /auth/google/callback` — `@UseGuards(AuthGuard('google'))` (handles redirect back)
- `BackendHttpService` — Axios-based service that calls backend internal URL with headers: `X-Tenant-ID`, `X-Correlation-ID`, `X-User-ID`, `X-User-Role`

**Acceptance criteria:**
- [ ] `GET /v1/auth/google` redirects to `accounts.google.com` with correct client ID and scopes
- [ ] `GET /v1/auth/google/callback?code=...` exchanges the code and receives Google profile
- [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` are read from environment variables (never hardcoded)
- [ ] For local dev, `GOOGLE_CALLBACK_URL` points to `http://localhost:3002/v1/auth/google/callback`
- [ ] `BackendHttpService` injects `X-Tenant-ID` and `X-Correlation-ID` headers on every backend call
- [ ] TypeScript compiles with zero errors

**Dependencies:** M00-S04, M02-S03

---

### M03-S04 — JWT issuance service

**Agent:** `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md` § JWT flow, `docs/14-API_CONTRACTS.md` § JWT structure

**Description:**  
Implement the `JwtService` in the BFF that signs JWTs containing the tenant and user identity. The JWT payload must match the exact structure from the API contracts doc. No refresh tokens in MVP — 7-day TTL only.

**JWT payload structure:**
```json
{
  "sub": "<user-uuid-from-backend>",
  "tenantId": "<tenant-uuid>",
  "tenantSlug": "<tenant-slug>",
  "role": "CUSTOMER | STAFF | MANAGER",
  "iat": 1234567890,
  "exp": 1234567890
}
```

**What to create:**
- `JwtIssuerService` in `apps/bff/src/auth/`:
  - `issueToken(sub, tenantId, tenantSlug, role): string`
  - Uses `@nestjs/jwt` with `JWT_SECRET` from env (minimum 64 characters)
  - `expiresIn: '7d'` (read from `JWT_EXPIRES_IN` env var, default `7d`)
- Register `JwtModule` globally in `AuthModule`

**Acceptance criteria:**
- [ ] `issueToken()` returns a JWT string that decodes to the correct payload structure
- [ ] JWT is signed with `JWT_SECRET` from environment (not hardcoded)
- [ ] JWT expires in 7 days
- [ ] A JWT with a tampered signature fails validation (returns 401)
- [ ] `JWT_SECRET` shorter than 64 characters causes a startup error (validated at module init)
- [ ] Unit test: decode issued token and assert all 5 payload fields are present

**Dependencies:** M03-S03

---

### M03-S05 — BFF guards: JwtAuthGuard, TenantGuard, RolesGuard

**Agent:** `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md` § request lifecycle, `docs/14-API_CONTRACTS.md` § authentication

**Description:**  
Implement the three guards that protect every authenticated BFF endpoint. They execute in order: JWT validation → tenant match → role check. A request that fails any guard returns the appropriate HTTP error.

**What to create in `apps/bff/src/shared/guards/`:**

`JwtAuthGuard`:
- Extends `AuthGuard('jwt')` from `@nestjs/passport`
- Routes decorated with `@Public()` skip this guard
- Failed validation returns `401` with RFC 9457 Problem Detail

`TenantGuard`:
- Reads `X-Tenant-Slug` header from request
- Compares with `tenantSlug` in the JWT payload
- Mismatch returns `403` (cannot access a different tenant's resources with your JWT)
- Routes decorated with `@Public()` skip this guard

`RolesGuard`:
- Reads `@Roles(...roles)` metadata from the handler
- Checks `role` in JWT payload matches at least one allowed role
- Mismatch returns `403`

**Acceptance criteria:**
- [ ] A request with no `Authorization` header to a protected endpoint returns `401`
- [ ] A request with an expired JWT returns `401`
- [ ] A request with `X-Tenant-Slug: tenant-a` but a JWT for `tenant-b` returns `403`
- [ ] A request with `role: STAFF` to a `@Roles('MANAGER')` endpoint returns `403`
- [ ] A `@Public()` route bypasses all three guards
- [ ] Unit tests cover all rejection scenarios

**Dependencies:** M03-S04

---

### M03-S06 — UC-021: Customer login + tenant selection

**Agent:** `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-021, `docs/14-API_CONTRACTS.md` § auth endpoints

**Description:**  
Implement the full UC-021 flow: after Google OAuth callback, find all tenants where this Google `sub` has a `Customer` record. If exactly 1 tenant → issue JWT and redirect to dashboard. If 2+ tenants → return a tenant list (with active loyalty points per tenant) for the frontend to show the tenant selection screen.

**Flow in `AuthController.handleGoogleCallback()`:**
1. Google callback delivers profile (`sub`, `email`, `name`)
2. Call backend: `GET /internal/customers/tenants?googleOAuthId=<sub>` → returns list of `{ tenantId, tenantSlug, tenantName, activePoints }`
3. If list is empty → create Customer in the first matching public tenant OR return error (no tenant found)
4. If exactly 1 tenant → call `JwtIssuerService.issueToken()` with `role: CUSTOMER`, set JWT cookie, redirect to `/dashboard`
5. If 2+ tenants → redirect to `/select-tenant?token=<short-lived-selection-token>` (selection token contains the `sub` and expires in 5 minutes)

**New endpoint:**
- `POST /v1/auth/token` — called after tenant selection; body: `{ selectionToken, tenantId }` → validates selection token → issues full JWT

**Acceptance criteria:**
- [ ] Customer with 1 tenant receives a JWT cookie and is redirected to `/dashboard`
- [ ] Customer with 2+ tenants is redirected to `/select-tenant` with a short-lived selection token
- [ ] Selection token expires after 5 minutes (`400` if expired)
- [ ] `POST /v1/auth/token` with valid `{ selectionToken, tenantId }` returns `{ accessToken, expiresIn }`
- [ ] `POST /v1/auth/token` with a `tenantId` not in the customer's tenant list returns `403`
- [ ] JWT payload contains `sub`, `tenantId`, `tenantSlug`, `role: 'CUSTOMER'`
- [ ] Integration test: mock Google profile, assert correct redirect based on tenant count

**Dependencies:** M03-S03, M03-S04, M03-S05, M03-S01

---

### M03-S07 — UC-022: Staff login

**Agent:** `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-022, `docs/14-API_CONTRACTS.md` § auth endpoints

**Description:**  
Implement UC-022: staff members belong to exactly one tenant. After Google OAuth callback, look up a `Staff` record by `google_oauth_id`. If found and active → issue JWT. If the staff row exists but `is_active=false` → the admin provisioned them but they haven't accepted their invite yet — redirect them through the first-login flow (UC-025, implemented in M04).

**Flow:**
1. Google callback delivers profile (`sub`, `email`)
2. Call backend: `GET /internal/staff/by-oauth?googleOAuthId=<sub>` → returns `{ staffId, tenantId, tenantSlug, role, isActive }`
3. If not found → `403` (not a registered staff member)
4. If found but `isActive=false` → redirect to first-login activation (M04-S01)
5. If found and `isActive=true` → issue JWT with `role: STAFF | MANAGER`, redirect to `/dashboard`

**Acceptance criteria:**
- [ ] Active staff member receives JWT and is redirected to `/dashboard`
- [ ] Inactive staff member (pending invite) is redirected to first-login activation flow
- [ ] Unknown Google account (no staff row) returns `403`
- [ ] JWT payload contains `role: 'STAFF'` or `role: 'MANAGER'` based on staff record
- [ ] A customer trying to login as staff (different flow) is not mixed — routes are separate

**Dependencies:** M03-S03, M03-S04, M03-S05, M03-S02

---

### M03-S08 — UC-023: Customer switches tenant

**Agent:** `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-023, `docs/14-API_CONTRACTS.md` § auth/switch-tenant

**Description:**  
Implement the tenant-switching endpoint. An authenticated customer can switch to a different tenant they have a `Customer` record in. This issues a new JWT with the new `tenantId` and `tenantSlug`, replacing the current session.

**Endpoint:** `POST /v1/auth/switch-tenant`
- Requires: valid JWT (`role: CUSTOMER`)
- Body: `{ targetTenantId: string }`
- Validates that the customer has a `Customer` record in `targetTenantId`
- Issues new JWT with `targetTenantId` and corresponding `tenantSlug`
- Returns: `{ accessToken, expiresIn }`

**Acceptance criteria:**
- [ ] `POST /v1/auth/switch-tenant` with a valid `targetTenantId` returns a new JWT with updated `tenantId` and `tenantSlug`
- [ ] Switching to a tenant where the customer has no record returns `403`
- [ ] The new JWT has the same `sub` (user identity unchanged) and fresh expiry (7 days from now)
- [ ] Only customers can switch tenants — staff calling this endpoint returns `403`
- [ ] Unit test: assert new JWT payload has correct `tenantId` and `tenantSlug`

**Dependencies:** M03-S06

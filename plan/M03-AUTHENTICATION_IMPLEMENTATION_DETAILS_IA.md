# M03 — Implementation Details for AI Agents (partial — S01–S06)

**Audience:** AI coding agents working on M04 and beyond, or finishing M03 (S07–S08).
**Purpose:** Avoid re-learning what M03 already solved. Read when touching auth, OAuth, JWT, Customer login, or BFF guards.
**Companion:** Always read `CLAUDE.md` first. Then load this file when working on any M04+ story that touches the auth layer or the BFF.

---

## 1. What M03 Built (S01–S06)

| Artifact | Location | Notes |
|---|---|---|
| Customer aggregate | `src/contexts/customer/domain/customer.aggregate.ts` | Multi-tenant — same Google `sub` = multiple Customer rows (one per tenant); `googleOAuthId` is NOT nullable — a Customer only exists after first Google login |
| Staff aggregate | `src/contexts/staff/domain/staff.aggregate.ts` | Single-tenant; `UNIQUE(tenant_id, google_oauth_id)` at DB level; `googleOAuthId` nullable until first login via `Staff.activate()` |
| GetCustomerTenantsUseCase | `src/contexts/customer/application/use-cases/` | Returns `{ tenantId, customerId }[]` for a Google OAuth ID — used by BFF to check tenant membership |
| FindOrCreateCustomerUseCase | `src/contexts/customer/application/use-cases/` | Idempotent: finds existing Customer or creates on first Google login for a `(tenantId, googleOAuthId)` pair |
| FindOrCreateCustomerDto | `src/contexts/customer/application/dtos/find-or-create-customer.dto.ts` | Zod schema + `z.infer<>` type; used with `ZodValidationPipe` on the controller method |
| GetTenantByIdUseCase | `src/contexts/platform/application/use-cases/` | Returns `TenantInfoDto { id, slug, name }`; throws `TenantNotFoundError` → 404 via `mapPlatformError` |
| GetTenantBySlugUseCase | `src/contexts/platform/application/use-cases/` | Same shape as above, by slug — BFF calls this after reading `tenantSlug` from OAuth state |
| InternalCustomerController | `src/contexts/customer/infrastructure/controllers/` | `GET /internal/customers/tenants?googleOAuthId=<sub>` · `POST /internal/customers` |
| InternalTenantReadController | `src/contexts/platform/infrastructure/controllers/` | `GET /internal/tenants/by-slug/:slug` (static route, declared FIRST) · `GET /internal/tenants/:tenantId` (dynamic route, declared SECOND) |
| GoogleStrategy | `apps/bff/src/auth/strategies/google.strategy.ts` | `passReqToCallback: true` — validate signature is `(req, accessToken, refreshToken, profile, done)`; reads `req.query.state` → `GoogleProfile.tenantSlug?` |
| GoogleAuthGuard | `apps/bff/src/auth/guards/google-auth.guard.ts` | Extends `AuthGuard('google')`; overrides `getAuthenticateOptions()` → `{ state: tenantSlug }` — used ONLY on `GET /auth/google`, not on the callback |
| JwtIssuerService | `apps/bff/src/auth/jwt-issuer.service.ts` | `issueToken({ sub, tenantId, tenantSlug, role }): string`; `sub` is always the backend entity UUID (never Google's OAuth sub) |
| SelectionTokenService | `apps/bff/src/auth/selection-token.service.ts` | Issues 5-min JWTs with `type: 'selection'` for the multi-tenant selection step; type field prevents misuse as an access token |
| JwtStrategy | `apps/bff/src/auth/strategies/jwt.strategy.ts` | Reads from Bearer header AND `access_token` cookie (inline regex extractor — no `cookie-parser` dependency) |
| JWT_COOKIE_OPTIONS | `apps/bff/src/auth/cookie-options.ts` | `{ httpOnly, secure, sameSite: 'lax', maxAge: 7d, path: '/' }` — import from here, **never from `main.ts`** |
| AuthController | `apps/bff/src/auth/auth.controller.ts` | `GET /auth/google` · `GET /auth/google/callback` · `POST /auth/token` |
| Guard suite | `apps/bff/src/shared/guards/` | `JwtAuthGuard` · `TenantGuard` (JWT `tenantSlug` vs `X-Tenant-Slug` header) · `RolesGuard` |

---

## 2. Critical Gotchas

**#1 — Zod v4 deprecations and stricter UUID format**
`z.string().uuid()` and `z.string().url()` are **deprecated** in Zod v4 → SonarCloud S1874.
Use `z.uuid()` and `z.url()` directly.

Zod v4's `z.uuid()` also validates RFC 4122 version/variant bits:
- segment-3 must start with `[1-8]`
- segment-4 must start with `[89abAB]`

`'00000000-0000-0000-0000-000000000001'` (segment-3 = `0000`) **fails** Zod v4's check even though it looks like a UUID. Use this format for test constants:
```typescript
const TENANT_ID_A  = '10000000-0000-4000-8000-000000000001';  // ✓ v4 format
const CUSTOMER_ID_A = '20000000-0000-4000-8000-000000000001'; // ✓ v4 format
```

**#2 — OAuth `state` parameter carries tenantSlug (no cookie/session needed)**
`GoogleAuthGuard.getAuthenticateOptions()` reads `req.query.tenantSlug` → returns `{ state: tenantSlug }`. passport-google-oauth20 appends `&state=lavacar-belo` to Google's auth URL. Google passes it through; on the callback `req.query.state = 'lavacar-belo'`. The strategy reads it with `passReqToCallback: true`.

```
GET /v1/auth/google?tenantSlug=lavacar-belo
  → state=lavacar-belo sent to Google
  → Google callback: /callback?code=...&state=lavacar-belo
  → GoogleStrategy.validate(req, ...) → req.query.state = 'lavacar-belo'
  → GoogleProfile.tenantSlug = 'lavacar-belo'
```

**#3 — `passReqToCallback: true` changes `validate()` signature**
```typescript
// WITHOUT passReqToCallback
validate(_accessToken, _refreshToken, profile, done): void

// WITH passReqToCallback: true
validate(req, _accessToken, _refreshToken, profile, done): void
//       ^^^  req is first
```
The NestJS `PassportStrategy` wrapper maps these automatically — match the function length.

**#4 — `JWT_COOKIE_OPTIONS` must NOT be exported from `main.ts`**
`import { X } from '../main'` triggers the bootstrap function → `validateEnv()` → `process.exit(1)` in test environments. The constant lives in `apps/bff/src/auth/cookie-options.ts`; `main.ts` re-exports it for any legacy callers.

**#5 — Actor headers during Google OAuth callback**
During the callback, `req.user` is a `GoogleProfile` (truthy, but no `sub`/`role`). The `BackendHttpService.headers()` guard is `if (user?.sub)` — not just `if (user)`. Without the `?.sub` guard, `X-Actor-Type: STAFF` and `X-Actor-ID: undefined` would be forwarded to the backend.

**#6 — Cookie `path: '/'` is mandatory**
Omitting `path` scopes the cookie to the callback path (`/v1/auth/google/callback`). The frontend at `/dashboard` never sees it. `JWT_COOKIE_OPTIONS` includes `path: '/'` — always use the shared constant, never inline cookie options.

**#7 — Static NestJS routes before dynamic ones in the same controller**
`@Get('by-slug/:slug')` must be declared **before** `@Get(':tenantId')`. NestJS resolves routes in declaration order — the dynamic route swallows everything if declared first.

**#8 — `XxxEntityBuilder` default `id` must be `uuidv7()`**
A hardcoded `id = '00000000-...'` means two builders share the same primary key. Second `save()` silently upserts over the first → row-count and tenant-isolation assertions fail. See `customer-entity.builder.ts` for the fixed pattern:
```typescript
private id = uuidv7();  // unique per builder instance
```

**#9 — Controllers must not inject repositories directly**
`InternalTenantReadController` was initially wired with `ITenantRepository`. Controllers inject use cases only. The use case throws domain errors (`TenantNotFoundError`); the controller maps them via `mapPlatformError`. Bypassing this skips the error→HTTP mapping.

**#10 — `jest.fn()` for `BackendHttpService` is correct; for use cases it is not**
`BackendHttpService` is REQUEST-scoped with no in-memory double → `jest.fn()` is correct in BFF controller tests. Use cases have `InMemoryXxxRepository` → wire the real use case in controller tests, no mocking needed.

---

## 3. UC-021 Auth Flow

```
Customer visits hotsite → clicks "Login"
  ↓
GET /v1/auth/google?tenantSlug=lavacar-belo
  → GoogleAuthGuard passes state=lavacar-belo to Google
  ↓
Google authenticates → callback
  ↓
GET /v1/auth/google/callback?state=lavacar-belo&code=...
  → GoogleStrategy.validate(req, ...) → GoogleProfile { googleOAuthId, email, name, tenantSlug }
  ↓
handleGoogleCallback():
  if profile.tenantSlug:                                  ← hotsite flow (most common)
    GET /internal/tenants/by-slug/lavacar-belo → tenantInfo
    POST /internal/customers { tenantId, googleOAuthId, email, name }
      → FindOrCreateCustomerUseCase (idempotent)
      → { customerId, created }
    JWT { sub: customerId, tenantId, tenantSlug, role: 'CUSTOMER' }
    cookie access_token (JWT_COOKIE_OPTIONS)
    redirect → FRONTEND_URL/dashboard

  else:                                                   ← general login (no hotsite context)
    GET /internal/customers/tenants?googleOAuthId=<sub>
    0 tenants → redirect /auth/error?reason=no-tenant
    1 tenant  → GET /internal/tenants/:id → JWT → cookie → /dashboard
    2+ tenants → SelectionTokenService.issueSelectionToken() → /select-tenant?token=...
      POST /auth/token { selectionToken, tenantId } → verifies → issues JWT
```

## 4. JWT Structure

```json
{
  "sub":        "<backend-entity-uuid>",
  "tenantId":   "<uuid>",
  "tenantSlug": "<url-safe-slug>",
  "role":       "CUSTOMER | STAFF | MANAGER",
  "iat": 0,
  "exp": 0
}
```
`sub` = `customerId` for CUSTOMER, `staffId` for STAFF/MANAGER. **Never** Google's OAuth `sub`.

---

## 5. Environment Variables Added in M03

| Var | App | Required | Notes |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | BFF | Yes | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | BFF | Yes | Google OAuth 2.0 client secret |
| `GOOGLE_CALLBACK_URL` | BFF | Yes | Local dev: `http://localhost:3002/v1/auth/google/callback` |
| `JWT_SECRET` | BFF | Yes | Min 64 chars — validated at startup |
| `JWT_EXPIRES_IN` | BFF | No | Default `7d` |
| `FRONTEND_URL` | BFF | No | Default `http://localhost:3000` — OAuth redirect target |
| `CRON_SECRET` | BFF | Yes | Min 32 chars — protects cron trigger endpoints |

---

## 6. Test Patterns Established in M03

**Controller unit test — wire real use case, not jest.fn():**
```typescript
beforeEach(() => {
  const repo = new InMemoryCustomerRepository();
  controller = new InternalCustomerController(
    new GetCustomerTenantsUseCase(repo),
    new FindOrCreateCustomerUseCase(repo),
  );
});
```

**BFF controller test — BackendHttpService via jest.fn() (correct here):**
```typescript
const makeBackendHttp = (overrides?: Partial<BackendHttpService>): BackendHttpService =>
  ({ get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn(), ...overrides })
  as unknown as BackendHttpService;
```

**Zod v4-compliant test UUID constants:**
```typescript
const TENANT_ID_A  = '10000000-0000-4000-8000-000000000001';
const TENANT_ID_B  = '10000000-0000-4000-8000-000000000002';
const CUSTOMER_ID_A = '20000000-0000-4000-8000-000000000001';
```

---

## 7. Common Commands (M04+)

```bash
# Customer context unit tests
pnpm --filter @beloauto/backend exec jest --testPathPatterns="contexts/customer" --no-coverage --selectProjects unit

# Platform context unit tests
pnpm --filter @beloauto/backend exec jest --testPathPatterns="contexts/platform" --no-coverage --selectProjects unit

# All BFF tests
pnpm --filter @beloauto/bff exec jest --no-coverage

# Full type-check (both apps)
pnpm --filter @beloauto/backend run type-check && pnpm --filter @beloauto/bff run type-check
```

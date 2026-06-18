# M03 — Authentication Implementation Details (Developer)

**Audience:** Human developer learning the authentication layer, NestJS, DDD, and the engineering patterns used in this codebase.  
**Goal:** After reading this doc, you should understand every architectural decision, every pattern, and why each choice was made — not just what was built.

---

## 1. What M03 Built and Why

M03 implements the full authentication layer for Ikaro. The goal is: any user (customer or staff) can sign in with their Google account, and the system issues a JWT that identifies who they are, which tenant they belong to, and what role they have.

The key challenge is **multi-tenancy**: the same Google account (`google_oauth_id`) can exist as different entities in different tenants. A customer named João who washes his car at both "Lavacar BH" and "Lavacar Centro" has TWO `Customer` rows in the database — one per tenant. Each row has a different UUID (`customerId`). The JWT's `sub` field carries the `customerId` for the **active tenant session**, not João's Google ID.

Staff are different: single-tenant by design. A staff member belongs to exactly one tenant, enforced by a `UNIQUE(tenant_id, google_oauth_id)` DB constraint.

---

## 2. Architecture: BFF as the Auth Gateway

```
Browser/App → BFF (Google OAuth + JWT) → Backend (domain logic)
```

The BFF owns all authentication concerns:
- Initiates Google OAuth flow and handles the callback
- Issues JWTs (signs with `JWT_SECRET`)
- Validates JWTs on every request (via `JwtAuthGuard`)
- Forwards identity to the backend via `X-Actor-*` headers

The backend **never** sees the raw Google OAuth token. It receives:
- `X-Tenant-ID` — which tenant this request belongs to
- `X-Actor-ID` — the backend entity UUID (customerId or staffId)
- `X-Actor-Type` — `CUSTOMER` or `STAFF`
- `X-Actor-Role` — `CUSTOMER`, `STAFF`, or `MANAGER`

This means the backend trusts the BFF completely (network-level trust in MVP). The backend domain logic doesn't need to know about Google OAuth at all.

---

## 3. Google OAuth Flow — How Passport.js Works in NestJS

### The Three Guards

There are two phases in Google OAuth, handled by two different guards:

**Phase 1 — Redirect to Google** (`GET /auth/google`):
```typescript
@UseGuards(GoogleAuthGuard)  // Our custom guard
@Get('google')
login(): void { }
```

`GoogleAuthGuard` extends `AuthGuard('google')` and overrides `getAuthenticateOptions()` to embed routing state into the OAuth `state` parameter:

```typescript
getAuthenticateOptions(context: ExecutionContext): object {
  const req = context.switchToHttp().getRequest<Request>();
  if (req.query['type'] === 'staff') return { state: '__staff__' };
  const tenantSlug = req.query['tenantSlug'] as string | undefined;
  return { state: tenantSlug ?? '' };
}
```

Why? Google passes the `state` parameter through unchanged. When the user is redirected back, the callback receives `?state=lavacar-bh` (or `__staff__`), telling the BFF which login path to take — without cookies or sessions.

Why `__staff__` and not `staff`? The slug validator allows `[a-z0-9-]+` only. Underscores are not in that charset, so `__staff__` can never be a valid tenant slug. A tenant named "staff" would route to customer flow correctly.

**Phase 2 — Callback** (`GET /auth/google/callback`):
```typescript
@UseGuards(AuthGuard('google'))  // Plain passport guard — no state injection needed
@Get('google/callback')
async handleGoogleCallback(@Req() req, @Res() res) { }
```

`AuthGuard('google')` is the built-in passport guard. It calls `GoogleStrategy.validate()` which maps the Google profile into our `GoogleProfile` object.

### The Strategy — `passReqToCallback: true`

```typescript
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      passReqToCallback: true,  // ← This is critical
      // ...
    });
  }

  validate(
    req: Request,       // ← req is FIRST because passReqToCallback: true
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (error: Error | null, user?: GoogleProfile) => void,
  ): void {
    const state = (req.query['state'] as string) || '';
    const loginType = state === '__staff__' ? ('staff' as const) : undefined;
    const tenantSlug = loginType ? undefined : state || undefined;

    done(null, {
      googleOAuthId: profile.id,
      email: profile.emails?.[0]?.value,
      name: profile.displayName,
      tenantSlug,
      loginType,
    });
  }
}
```

`passReqToCallback: true` gives us access to `req.query.state` inside `validate()`. Without it, we can't know which login path to take.

---

## 4. JWT Design — Why `sub` is the Backend Entity UUID

A common mistake: putting Google's `sub` (the OAuth user ID) in the JWT's `sub` field. Ikaro does NOT do this.

Instead:
- `sub` = `customerId` for customers (the UUID in the `customer.customers` table, **for that specific tenant**)
- `sub` = `staffId` for staff (the UUID in the `staff.staff` table)

Why? Because the backend identifies actors by their backend entity UUID. When the BFF forwards `X-Actor-ID`, the backend can directly look up the entity without knowing anything about Google OAuth.

This also means: when a customer switches tenants, their `sub` CHANGES (different `customerId` in the new tenant). Their identity as a person is the same, but their backend entity UUID is different. This is correct — the backend should only see the entity that belongs to the active tenant session.

---

## 5. The `FindOrCreate` Pattern for Customers

When a customer logs in via a hotsite for the first time, they don't have a `Customer` row yet. The BFF calls `POST /internal/customers`, which runs `FindOrCreateCustomerUseCase`:

```typescript
async execute(dto: FindOrCreateCustomerDto): Promise<FindOrCreateCustomerResult> {
  const existing = await this.customerRepo.findByTenantAndOAuthId(dto.tenantId, dto.googleOAuthId);
  if (existing) return { customerId: existing.id, created: false };

  const customer = Customer.create(dto.tenantId, dto.googleOAuthId, dto.email, dto.name);
  await this.customerRepo.save(customer);
  return { customerId: customer.id, created: true };
}
```

This is **idempotent**: calling it multiple times with the same `(tenantId, googleOAuthId)` always returns the same `customerId`. The response includes `created: boolean` so the BFF knows whether a new Customer was created (useful for analytics or welcome flows).

Staff are NOT created at login. A staff member must be explicitly invited by an admin (UC-028). If `GET /internal/staff/by-oauth?googleOAuthId=<sub>` returns 404, the person is not a registered staff member.

---

## 6. Error Mapper Pattern — Domain Errors → HTTP Status

Every context that exposes REST endpoints has a `mapXxxError` function in `infrastructure/http/`:

```typescript
// staff-error.mapper.ts
export function mapStaffError(err: unknown): never {
  if (err instanceof StaffNotFoundError) {
    throw new HttpException({ type: 'about:blank', title: 'Not Found', status: 404, detail: err.message }, 404);
  }
  if (err instanceof StaffDomainError) {
    throw new HttpException({ type: 'about:blank', title: 'Bad Request', status: 400, detail: err.message }, 400);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
```

Usage in controllers:
```typescript
getByOAuth(@Query('googleOAuthId') googleOAuthId: string): Promise<StaffAuthInfo> {
  if (!googleOAuthId) throw new BadRequestException({ ... });
  return this.getStaffByOAuthId.execute(googleOAuthId).catch(mapStaffError);
}
```

Why this pattern?
- The use case throws domain errors (`StaffNotFoundError`, `StaffDomainError`) — no NestJS imports in the domain layer
- The controller maps them to HTTP status codes in a single `.catch()` call
- The method body stays one line — easy to read, easy to test
- SonarCloud flags multiple `if (err instanceof X)` chains inside controller methods as cognitive complexity

**Important for SonarCloud coverage**: the mapper must have its own `xxx-error.mapper.spec.ts` covering all branches (not just the one exercised by controller tests). Controller tests only cover the 404 branch; the 400, Error re-throw, and unknown branches need explicit tests.

---

## 7. BFF Guards — How Authentication Works on Every Request

Three guards apply to every request, in order:

```
Request → JwtAuthGuard → TenantGuard → RolesGuard → Controller
```

**`JwtAuthGuard`** (global, applied by `APP_GUARD`):
- Extends `AuthGuard('jwt')` from `@nestjs/passport`
- Routes marked `@Public()` are skipped (login endpoints, health check)
- Extracts JWT from Bearer header OR `access_token` cookie (inline regex extractor — no cookie-parser dependency)
- Failed validation → 401

**`TenantGuard`**:
- Reads `X-Tenant-Slug` header from the request
- Compares with `tenantSlug` in the JWT payload
- Mismatch → 403 (prevents using a Tenant A JWT to access Tenant B resources)

**`RolesGuard`**:
- Reads `@Roles('CUSTOMER')` or `@Roles('MANAGER')` metadata from the handler
- Checks `role` in JWT payload
- Mismatch → 403

For `POST /auth/switch-tenant`, only `@Roles('CUSTOMER')` is needed — `JwtAuthGuard` runs by default.

---

## 8. The Selection Token — Multi-Tenant Customer Flow

When a customer logs in without a hotsite context (`GET /auth/google` with no `tenantSlug`), and they have records in 2+ tenants, the BFF can't issue a JWT yet — it doesn't know which tenant to use.

Solution: issue a short-lived **selection token** (5 minutes) and redirect to `/select-tenant?token=...`. The frontend shows a tenant picker. When the user picks a tenant, it calls `POST /auth/token { selectionToken, tenantId }`.

The selection token is itself a JWT, but with `type: 'selection'` in the payload:

```typescript
issueSelectionToken(googleOAuthId: string): string {
  return this.jwt.sign(
    { googleOAuthId, type: 'selection' },
    { expiresIn: '5m' },
  );
}

verifySelectionToken(token: string): { googleOAuthId: string } {
  const payload = this.jwt.verify(token) as { googleOAuthId: string; type: string };
  if (payload.type !== 'selection') throw new BadRequestException({ ... });
  return { googleOAuthId: payload.googleOAuthId };
}
```

The `type: 'selection'` check prevents a valid access token from being misused as a selection token (and vice versa).

---

## 9. The Switch-Tenant Flow — Why Three Backend Calls

When a customer switches tenants (`POST /auth/switch-tenant`):

```
JWT: { sub: customerId-in-tenant-A, tenantId: tenant-A, role: CUSTOMER }
Body: { targetTenantId: tenant-B }
```

The problem: the BFF has the `customerId` in Tenant A, but needs the `customerId` in Tenant B. The bridge is `googleOAuthId`.

**Flow:**
1. `GET /internal/customers/:sub/tenants?tenantId=:currentTenantId`
   - Backend looks up customer by `(customerId, tenantId)` → gets `googleOAuthId`
   - Then calls `findAllTenantsByOAuthId(googleOAuthId)` → returns all `{ tenantId, customerId }` entries
2. BFF checks if `targetTenantId` is in the list → 403 if not
3. `GET /internal/tenants/:targetTenantId` → gets slug
4. Issues new JWT with `sub: targetCustomerId, tenantId: targetTenantId, tenantSlug, role: CUSTOMER`

Why not just store `googleOAuthId` in the JWT? Because `googleOAuthId` is an implementation detail of the Google OAuth integration. The JWT should carry only domain-meaningful fields. If Ikaro later adds Apple Sign-In, the field name would be wrong. Using `customerId` keeps the JWT clean.

---

## 10. `ZodValidationPipe` — Request Body Validation Pattern

NestJS controllers should not validate request bodies inline. The pattern:

1. Define a Zod schema + TypeScript type in `application/dtos/` (backend) or `auth/dtos/` (BFF):
```typescript
// issue-token.dto.ts
export const IssueTokenSchema = z.object({
  selectionToken: z.string().min(1),
  tenantId: z.uuid(),  // NOT z.string().uuid() — deprecated in Zod v4
});
export type IssueTokenDto = z.infer<typeof IssueTokenSchema>;
```

2. Apply `@UsePipes` on the controller method:
```typescript
@Post('token')
@UsePipes(new ZodValidationPipe(IssueTokenSchema))
async issueToken(@Body() dto: IssueTokenDto): Promise<...> {
  // dto is already validated and typed — no need for safeParse
}
```

**Why Zod v4 matters**: `z.string().uuid()` is deprecated in Zod v4 and triggers SonarCloud S1874. Use `z.uuid()` directly. Also, Zod v4 validates UUID variant bits — `'00000000-0000-0000-0000-000000000001'` fails because segment-3 (`0000`) doesn't start with `[1-8]`. Test UUIDs must be `'10000000-0000-4000-8000-000000000001'`.

The BFF has its own copy of `ZodValidationPipe` in `apps/bff/src/shared/http/zod-validation.pipe.ts` (identical implementation to the backend). The BFF cannot import from the backend package.

---

## 11. DB Constraints — Multi-Tenant Customer vs Single-Tenant Staff

```sql
-- customer.customers: same google_oauth_id CAN appear with different tenant_id
-- NO unique constraint on google_oauth_id alone
INDEX (tenant_id)
INDEX (tenant_id, google_oauth_id)

-- staff.staff: same google_oauth_id CANNOT appear with different tenant_id
-- Partial unique — null is allowed (invited staff before first login)
UNIQUE INDEX ON google_oauth_id WHERE google_oauth_id IS NOT NULL
INDEX (tenant_id)
INDEX (tenant_id, google_oauth_id)
```

This maps directly to domain invariants: customers multi-tenant, staff single-tenant. The DB enforces these constraints so no application code needs to check them.

---

## 12. Test Infrastructure Decisions

### BFF Controller Tests: Why `jest.fn()` for BackendHttpService

`BackendHttpService` is a REQUEST-scoped NestJS service (it needs the current request to read the JWT and build auth headers). There is no in-memory double. In BFF controller unit tests:

```typescript
const makeBackendHttp = (overrides?: Partial<BackendHttpService>): BackendHttpService =>
  ({ get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn(), ...overrides })
  as unknown as BackendHttpService;
```

This is an intentional exception to the rule "don't mock with `jest.fn()`" — the rule applies to use cases and domain repositories, not to external HTTP clients.

### Backend Controller Tests: Real Use Case + InMemoryRepository

```typescript
beforeEach(() => {
  repo = new InMemoryCustomerRepository();
  controller = new InternalCustomerController(
    new GetCustomerTenantsUseCase(repo),
    new GetCustomerTenantsByIdUseCase(repo),
    new FindOrCreateCustomerUseCase(repo),
  );
});
```

Wire the real use case with an in-memory repo. Never mock the use case with `jest.fn()` — that hides real behaviour and tests only delegation.

### SonarCloud Coverage: `!customer ||` vs Optional Chaining

SonarCloud S6582 flags `if (!x || x.prop !== y)` — it prefers optional chaining:

```typescript
// ❌ SonarCloud flags this
if (!customer || customer.tenantId !== tenantId) return null;

// ✅ SonarCloud accepts this
if (customer?.tenantId === tenantId) return customer;
return null;
```

This is semantically equivalent and TypeScript correctly narrows `customer` to `Customer` in the if-true branch (since if `customer` were undefined, `customer?.tenantId` would be `undefined` which doesn't equal `tenantId`).

---

## 13. Cookie Options — Why `path:'/'` Is Mandatory

```typescript
// apps/bff/src/auth/cookie-options.ts
export const JWT_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',  // ← Without this, cookie is scoped to /v1/auth/google/callback
};
```

Omitting `path` scopes the cookie to the callback URL path. The frontend at `/dashboard` never receives it. Always import from this file — never define cookie options inline, and never import from `main.ts` (that triggers the bootstrap function in tests).

---

## 14. Lessons and Patterns to Apply in Future Milestones

| Pattern | Rule |
|---|---|
| Mapper spec | Every `mapXxxError` needs a `xxx-error.mapper.spec.ts` covering all branches |
| Optional chain | Prefer `x?.prop === y` over `!x \|\| x.prop !== y` |
| UUID constants in tests | Always use `'10000000-0000-4000-8000-000000000001'` format |
| `ZodValidationPipe` | Request bodies go in `dtos/`, apply `@UsePipes` on the method |
| `.catch` specificity | Only catch 404 `HttpException`, re-throw everything else |
| Static routes first | Always declare `@Get('literal')` before `@Get(':param')` in same controller |
| `beforeEach` in specs | Never use `makeXxx()` helper functions — use `beforeEach` + `let` variables |
| `BackendHttpService` | Use `jest.fn()` in BFF tests (request-scoped, no in-memory double) |
| Entity builders | `id` defaults to `uuidv7()` — never a hardcoded string |

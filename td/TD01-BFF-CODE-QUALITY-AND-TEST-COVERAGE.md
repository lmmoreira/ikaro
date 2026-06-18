# TD01 — BFF Code Quality & Test Coverage

**Scope:** `apps/bff/`  
**Type:** Technical Debt — Refactor + Test Coverage  
**Created:** 2026-05-19  
**Status:** Resolved — 2026-06-08 (Stories 1–5 implemented across 3 PRs; guard scenarios covered in `staff.controller.component.spec.ts`)

---

## Context

A thorough review of the BFF codebase identified five categories of issues:

1. **Dead code** — `_user` parameters in `StaffController` that do nothing.
2. **Inline types** — Response interfaces defined inside controller/guard files, duplicated across files, and inconsistently named (mix of `Result`, `Summary`, `Item` suffixes).
3. **Scattered `process.env` reads** — Five files read env vars directly, bypassing the centralized Zod validation and making test setup noisy.
4. **Duplicated header-building logic** — `BackendHttpService` and `ActiveStaffGuard` both build the `X-Tenant-ID / X-Actor-*` header set independently. A secondary issue: `handleStaffFirstLogin` uses a fragile sentinel string pattern and `ErrorInterceptor` silently swallows errors with no logging.
5. **No NestJS pipeline tests** — All existing tests instantiate controllers directly, completely bypassing guards, pipes, and interceptors. No test currently exercises `ParseUUIDPipe`, `ZodValidationPipe`, the guard chain, or `CorrelationInterceptor`.

---

## Execution Order & PR Map

| PR | Stories | Dependencies |
|---|---|---|
| PR 1 | Story 1, Story 2 | none |
| PR 2 | Story 3, Story 4 | Story 2 (types must exist before header utility imports them) |
| PR 3 | Story 5 | Story 3 + Story 4 (tests target the refactored code) |

Each PR must pass `pnpm lint && pnpm type-check && pnpm test` before merging.

---

## PR 1 — Dead Code Removal + Type Extraction  ✅ Done

### Story 1 — Remove dead `_user` parameters from `StaffController`

**Problem:** Every method in `StaffController` declares `@CurrentUser() _user: CurrentUserPayload` but never uses it. The actor context is forwarded to the backend by `BackendHttpService`, which reads `req.user` directly via its injected `REQUEST` object. The parameter contributes nothing.

**Files to modify:**

#### `apps/bff/src/staff/staff.controller.ts`

Remove the `@CurrentUser() _user: CurrentUserPayload` parameter from every method:

- `invite()` — remove `_user` param (keep `@Body` param)
- `list()` — remove `_user` param (keep `@Query` params)
- `getById()` — remove `_user` param (keep `@Param` param)
- `deactivate()` — remove `_user` param (keep `@Param` param)

After removal, check whether `CurrentUser` and `CurrentUserPayload` are still imported anywhere in the file. If not, remove the import line entirely.

#### `apps/bff/src/staff/staff.controller.spec.ts`

Remove `makeUser()` calls from every test invocation:
- `controller.list(makeUser(), 10, 5)` → `controller.list(10, 5)`
- `controller.getById(STAFF_ID, makeUser())` → `controller.getById(STAFF_ID)`
- `controller.invite(inviteBody, makeUser())` → `controller.invite(inviteBody)`
- `controller.deactivate(STAFF_ID, makeUser())` → `controller.deactivate(STAFF_ID)`

Remove the `makeUser` factory function and its `CurrentUserPayload` import if no longer used.

**Acceptance criteria:**
- `pnpm type-check` passes with zero errors
- `pnpm test --testPathPattern=staff.controller` passes

---

### Story 2 — Extract and rename inline response interfaces

**Problem:** Response shapes are defined inline inside controller and guard files. Several are duplicated across files. Naming is inconsistent: `CustomerTenantSummary`, `FindOrCreateCustomerResult`, `StaffItem` do not follow the `*Response` suffix used everywhere else.

**Naming rule (enforced from this story onward):** Any interface that represents a shape returned by the backend ends in `Response`. No exceptions — not `Result`, `Summary`, `Item`, or anything else.

#### Full rename map

| Old name | New name | Location |
|---|---|---|
| `CustomerTenantSummary` | `CustomerTenantSummaryResponse` | `auth.types.ts` |
| `FindOrCreateCustomerResult` | `FindOrCreateCustomerResponse` | `auth.types.ts` |
| `TenantInfoResponse` | `TenantInfoResponse` ✓ | `shared/types/backend-responses.ts` |
| `StaffInfoResponse` | `StaffInfoResponse` ✓ | `auth.types.ts` |
| `StaffByEmailResponse` | `StaffByEmailResponse` ✓ | `auth.types.ts` |
| `ActivateStaffResponse` | `ActivateStaffResponse` ✓ | `auth.types.ts` |
| `InviteStaffResponse` | `InviteStaffResponse` ✓ | `staff.types.ts` |
| `DeactivateStaffResponse` | `DeactivateStaffResponse` ✓ | `staff.types.ts` |
| `StaffItem` | `StaffResponse` | `staff.types.ts` |
| `StaffListResponse` | `StaffListResponse` ✓ | `staff.types.ts` |
| `StaffActiveResponse` | `StaffActiveResponse` ✓ | `shared/types/backend-responses.ts` |

---

**Files to create:**

#### `apps/bff/src/shared/types/backend-responses.ts`

Holds types used by **more than one file** — currently `TenantInfoResponse` (used in `auth.controller.ts` and will be used in `active-staff.guard.ts` after Story 4) and `StaffActiveResponse` (used in `active-staff.guard.ts`):

```typescript
export interface TenantInfoResponse {
  id: string;
  slug: string;
  name: string;
}

export interface StaffActiveResponse {
  isActive: boolean;
}
```

#### `apps/bff/src/auth/auth.types.ts`

Auth-controller-specific response shapes:

```typescript
export interface CustomerTenantSummaryResponse {
  tenantId: string;
  customerId: string;
}

export interface FindOrCreateCustomerResponse {
  customerId: string;
  created: boolean;
}

export interface StaffInfoResponse {
  staffId: string;
  tenantId: string;
  role: 'STAFF' | 'MANAGER';
  isActive: boolean;
}

export interface StaffByEmailResponse {
  staffId: string;
  email: string;
  role: 'STAFF' | 'MANAGER';
  isActive: boolean;
}

export interface ActivateStaffResponse {
  staffId: string;
  tenantId: string;
  role: 'STAFF' | 'MANAGER';
  isActive: true;
}
```

Note: `TenantInfoResponse` is **not** duplicated here — import it from `../shared/types/backend-responses`.

#### `apps/bff/src/staff/staff.types.ts`

Staff-controller-specific response shapes:

```typescript
export interface InviteStaffResponse {
  staffId: string;
  email: string;
  role: 'MANAGER' | 'STAFF';
  isActive: false;
}

export interface DeactivateStaffResponse {
  staffId: string;
  isActive: false;
}

export interface StaffResponse {
  id: string;
  email: string;
  name: string | null;
  role: 'MANAGER' | 'STAFF';
  isActive: boolean;
  createdAt: string;
}

export interface StaffListResponse {
  items: StaffResponse[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
}
```

---

**Files to modify:**

#### `apps/bff/src/auth/auth.controller.ts`

- Remove all six inline interface definitions from the file.
- Add imports from `./auth.types` and `../shared/types/backend-responses`.
- Replace every reference: `CustomerTenantSummary` → `CustomerTenantSummaryResponse`, `FindOrCreateCustomerResult` → `FindOrCreateCustomerResponse`.

#### `apps/bff/src/staff/staff.controller.ts`

- Remove all four inline interface definitions.
- Add import from `./staff.types`.
- Replace `StaffItem` → `StaffResponse` in method return types and internal references.

#### `apps/bff/src/shared/guards/active-staff.guard.ts`

- Remove the inline `StaffActiveResponse` interface.
- Add import from `../types/backend-responses`.

**Acceptance criteria:**
- `pnpm type-check` passes with zero errors
- `pnpm test` passes (all existing specs still green)
- No interface definitions remain inline in any controller or guard file

---

## PR 2 — Config Centralization + Header Builder + Control Flow Fixes  ✅ Done

### Story 3 — Centralize env reads via `ConfigService`

**Problem:** Five files read `process.env` directly after the app has already booted with validated config. If an env var is missing or misconfigured, failures surface at runtime during the first request, not at startup. `ConfigService` with `getOrThrow()` makes misconfiguration a boot-time crash.

**Files to modify:**

#### `apps/bff/src/app.module.ts`

Add `ConfigModule` as the first import (must load before any provider that uses `ConfigService`):

```typescript
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    HttpModule,
    ThrottlerModule.forRoot([...]),
    AuthModule,
    StaffModule,
    UploadsModule,
  ],
  ...
})
```

`isGlobal: true` means no other module needs to import `ConfigModule` — `ConfigService` is available everywhere.

#### `apps/bff/src/config/env.validation.ts`

Export a `validateEnv` function that `ConfigModule` calls. The Zod schema stays the same — just wrap it:

```typescript
export function validateEnv(config: Record<string, unknown>) {
  return EnvSchema.parse(config);
}
```

Remove the manual `validateEnv()` call from `main.ts` — `ConfigModule` now handles it.

#### `apps/bff/src/main.ts`

Remove the manual env validation call. Boot sequence becomes simpler — if config is invalid, `ConfigModule` throws before `NestFactory.create()` completes.

#### `apps/bff/src/shared/http/backend-http.service.ts`

Inject `ConfigService` and replace the direct `process.env` read:

```typescript
import { ConfigService } from '@nestjs/config';

@Injectable({ scope: Scope.REQUEST })
export class BackendHttpService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @Inject(REQUEST) private readonly req: Request,
  ) {
    this.baseUrl = this.config.getOrThrow<string>('BACKEND_INTERNAL_URL');
  }
  ...
}
```

#### `apps/bff/src/shared/guards/active-staff.guard.ts`

Inject `ConfigService`:

```typescript
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ActiveStaffGuard implements CanActivate {
  private readonly backendUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    this.backendUrl = this.config.getOrThrow<string>('BACKEND_INTERNAL_URL');
  }
  ...
}
```

#### `apps/bff/src/auth/strategies/jwt.strategy.ts`

Inject `ConfigService` and pass to `super()`:

```typescript
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractFromCookie,
      ]),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      ignoreExpiration: false,
    });
  }
  ...
}
```

#### `apps/bff/src/auth/strategies/google.strategy.ts`

Inject `ConfigService` and pass to `super()`:

```typescript
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }
  ...
}
```

#### `apps/bff/src/auth/auth.controller.ts`

Inject `ConfigService` and replace `process.env` reads inside methods:

```typescript
constructor(
  private readonly jwtIssuer: JwtIssuerService,
  private readonly selectionToken: SelectionTokenService,
  private readonly backendHttp: BackendHttpService,
  private readonly config: ConfigService,
) {}
```

Replace every `process.env['FRONTEND_URL'] ?? 'http://localhost:3000'` with `this.config.getOrThrow<string>('FRONTEND_URL')`.  
Replace every `process.env['JWT_EXPIRES_IN'] ?? '7d'` with `this.config.getOrThrow<string>('JWT_EXPIRES_IN')`.

#### Spec files that set `process.env` directly

Existing unit specs that do `process.env['FRONTEND_URL'] = '...'` in `beforeEach` continue to work — `ConfigModule` reads from `process.env` so setting env vars before the module boots is still valid in unit tests. No immediate changes needed to existing specs. Component tests (Story 5) will use a proper `ConfigModule` override.

**Acceptance criteria:**
- `pnpm type-check` passes
- `pnpm test` passes
- No `process.env` reads remain in any file under `src/` except `env.validation.ts` (which is the validation schema itself)

---

### Story 4 — Extract shared header builder + fix control flow issues

This story has four independent sub-tasks that can be committed together.

#### 4a — Create `buildBackendHeaders` utility

**Problem:** `BackendHttpService.headers()` and `ActiveStaffGuard` both independently build the same `X-Tenant-ID / X-Correlation-ID / X-Actor-*` header set. Adding a new header (e.g., an OTel trace header) requires editing two files.

**File to create:** `apps/bff/src/shared/http/backend-headers.ts`

```typescript
import { Request } from 'express';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

export function buildBackendHeaders(req: Request): Record<string, string> {
  const user = req.user as CurrentUserPayload | undefined;
  const correlationId = req.headers['x-correlation-id'] as string | undefined;

  const headers: Record<string, string> = {
    'X-Tenant-ID': user?.tenantId ?? '',
    'X-Correlation-ID': correlationId ?? '',
  };

  if (user?.sub) {
    headers['X-Actor-ID'] = user.sub;
    headers['X-Actor-Type'] = user.role === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF';
    headers['X-Actor-Role'] = user.role;
  }

  return headers;
}
```

**File to create:** `apps/bff/src/shared/http/backend-headers.spec.ts`

This is the canonical test for header construction logic. Scenarios to cover:

| Scenario | `req.user` state | Expected headers |
|---|---|---|
| Guest (no JWT) | `undefined` | `X-Tenant-ID: ''`, `X-Correlation-ID: ''`, no `X-Actor-*` |
| Correlation ID present | any | `X-Correlation-ID` = that value |
| No correlation ID | any | `X-Correlation-ID: ''` |
| CUSTOMER role | `{ sub, tenantId, role: 'CUSTOMER' }` | `X-Actor-Type: CUSTOMER`, `X-Actor-Role: CUSTOMER` |
| STAFF role | `{ sub, tenantId, role: 'STAFF' }` | `X-Actor-Type: STAFF`, `X-Actor-Role: STAFF` |
| MANAGER role | `{ sub, tenantId, role: 'MANAGER' }` | `X-Actor-Type: STAFF`, `X-Actor-Role: MANAGER` |
| Actor ID | `{ sub: 'uuid' }` | `X-Actor-ID: 'uuid'` |

#### 4b — Update `BackendHttpService` to use `buildBackendHeaders`

In `apps/bff/src/shared/http/backend-http.service.ts`, replace the entire `headers()` method body:

```typescript
private headers(): Record<string, string> {
  return buildBackendHeaders(this.req);
}
```

Remove the inline header-building logic and its imports. Import `buildBackendHeaders` from `./backend-headers`.

Remove the header-construction tests from `backend-http.service.spec.ts` — they are now covered by `backend-headers.spec.ts`. Keep the tests that verify `get/post/patch/delete` call the correct backend path with correct params/body.

#### 4c — Update `ActiveStaffGuard` to use `buildBackendHeaders`

In `apps/bff/src/shared/guards/active-staff.guard.ts`, replace the manual header block:

```typescript
// before
headers: {
  'X-Tenant-ID': tenantId,
  'X-Actor-ID': staffId,
  'X-Actor-Type': 'STAFF',
  'X-Actor-Role': user.role,
  ...extraHeaders,
},
```

```typescript
// after
headers: buildBackendHeaders(req),
```

Remove all the `tenantId`, `staffId`, `correlationId`, `extraHeaders` local variables that were only used to build headers. Import `buildBackendHeaders` from `../http/backend-headers`.

Add a comment explaining why the guard uses `HttpService` directly instead of `BackendHttpService`:

```typescript
// ActiveStaffGuard is singleton-scoped; BackendHttpService is REQUEST-scoped.
// NestJS cannot inject a REQUEST-scoped service into a singleton.
// buildBackendHeaders(req) gives us the same header logic without the scope conflict.
```

#### 4d — Fix `handleStaffFirstLogin` sentinel anti-pattern

**Problem:** The current code returns `'redirected' as const` from inside a `.catch()` to signal that a redirect already happened. This is fragile — the reader has to track the string literal to understand control flow.

In `apps/bff/src/auth/auth.controller.ts`, replace the `handleStaffFirstLogin` private method's activation block with an explicit try-catch:

```typescript
// Replace the .catch() chain on backendHttp.post(...activate...) with:
try {
  const activated = await this.backendHttp.post<ActivateStaffResponse>(
    `/internal/staff/${staffByEmail.staffId}/activate`,
    { tenantId: tenantInfo.id, googleOAuthId: profile.googleOAuthId, email: profile.email, name: profile.name },
  );
  const token = this.jwtIssuer.issueToken({
    sub: activated.staffId,
    tenantId: activated.tenantId,
    tenantSlug: tenantInfo.slug,
    role: activated.role,
  });
  res.cookie('access_token', token, JWT_COOKIE_OPTIONS);
  res.redirect(`${frontendUrl}/dashboard`);
} catch (err) {
  if (err instanceof HttpException && err.getStatus() === HttpStatus.CONFLICT) {
    await this.handleStaffLogin(profile, res, frontendUrl);
    return;
  }
  if (err instanceof HttpException && err.getStatus() === HttpStatus.UNPROCESSABLE_ENTITY) {
    res.redirect(`${frontendUrl}/auth/error?reason=email-mismatch`);
    return;
  }
  throw err;
}
```

Update `auth.controller.spec.ts` to cover the new control flow paths (409 → redirect to dashboard via `handleStaffLogin`, 422 → error redirect, other errors → rethrown).

#### 4e — Add error logging to `ErrorInterceptor`

**Problem:** Unknown errors are converted to 500 responses but the original error is silently dropped. In production there is no way to diagnose the root cause.

In `apps/bff/src/shared/interceptors/error.interceptor.ts`, inject `AppLogger` and log before converting:

```typescript
import { AppLogger } from '../observability/app-logger';

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      catchError((err: unknown) => {
        if (err instanceof HttpException) return throwError(() => err);

        this.logger.error('Unhandled exception', {
          path: req.path,
          method: req.method,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });

        const status = HttpStatus.INTERNAL_SERVER_ERROR;
        const problem = {
          type: 'https://ikaro.example/errors/internal',
          title: 'Internal Server Error',
          status,
          instance: req.path,
        };
        return throwError(() => new HttpException(problem, status));
      }),
    );
  }
}
```

`AppLogger` must be provided in `AppModule` (verify it is already registered; if not, add it to providers).

Update `error.interceptor.spec.ts` to:
- Mock `AppLogger`
- Assert `logger.error` is called with `path`, `method`, `error`, `stack` when an unknown error is thrown
- Assert `logger.error` is NOT called when an `HttpException` is thrown

**Acceptance criteria for Story 4 overall:**
- `pnpm type-check` passes
- `pnpm test` passes
- No `process.env` reads remain in `active-staff.guard.ts`
- No header-building logic exists outside `backend-headers.ts`
- No sentinel string pattern in `auth.controller.ts`
- `error.interceptor.spec.ts` asserts logging behavior

---

## PR 3 — Component Tests with nock  ✅ Done

### Story 5 — NestJS component tests

**Problem:** All existing tests instantiate controllers directly, bypassing the entire NestJS request pipeline. The following are never tested:
- Guard chain order and guard logic
- `ZodValidationPipe` rejecting malformed bodies
- `ParseUUIDPipe` rejecting non-UUID path params
- `ParseIntPipe` rejecting non-integer query params
- Route prefixes (`v1/staff`, `auth`, etc.)
- HTTP method routing
- `CorrelationInterceptor` injecting `X-Correlation-ID`
- `ErrorInterceptor` converting unknown errors to 500
- `ActiveStaffGuard` calling the backend with the correct headers

Component tests use `Test.createTestingModule({ imports: [AppModule] })` + supertest to make real HTTP requests against a fully-booted NestJS application. `nock` intercepts outbound HTTP calls at the Node.js level, so `BackendHttpService` and `ActiveStaffGuard`'s `HttpService` make real Axios calls that nock intercepts — no `jest.fn()` required.

#### 5a — Install nock

```bash
pnpm add -D nock @types/nock --filter @ikaro/bff
```

#### 5b — Create `apps/bff/src/test/component-test.helpers.ts`

Shared setup used by all component spec files:

```typescript
import nock from 'nock';
import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../app.module';

export const TEST_JWT_SECRET =
  'test-secret-must-be-at-least-64-chars-long-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
export const BACKEND_URL = 'http://backend-test:3001';

export const TENANT_ID = '10000000-0000-4000-8000-000000000001';
export const STAFF_ID  = '30000000-0000-4000-8000-000000000001';
export const CUSTOMER_ID = '20000000-0000-4000-8000-000000000001';

export async function createTestApp(): Promise<{
  app: INestApplication;
  jwtService: JwtService;
}> {
  process.env['JWT_SECRET'] = TEST_JWT_SECRET;
  process.env['BACKEND_INTERNAL_URL'] = BACKEND_URL;
  process.env['FRONTEND_URL'] = 'http://localhost:3000';
  process.env['JWT_EXPIRES_IN'] = '7d';
  process.env['GOOGLE_CLIENT_ID'] = 'test-client-id';
  process.env['GOOGLE_CLIENT_SECRET'] = 'test-client-secret';
  process.env['GOOGLE_CALLBACK_URL'] = 'http://localhost:3002/auth/google/callback';
  process.env['ALLOWED_ORIGINS'] = 'http://localhost:3000';

  const module: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = module.createNestApplication();
  await app.init();

  const jwtService = module.get(JwtService);
  return { app, jwtService };
}

export function makeManagerJwt(jwtService: JwtService, overrides?: object): string {
  return jwtService.sign({
    sub: STAFF_ID,
    tenantId: TENANT_ID,
    tenantSlug: 'lavacar-bh',
    role: 'MANAGER',
    ...overrides,
  });
}

export function makeStaffJwt(jwtService: JwtService): string {
  return makeManagerJwt(jwtService, { role: 'STAFF' });
}

export function makeCustomerJwt(jwtService: JwtService): string {
  return makeManagerJwt(jwtService, { sub: CUSTOMER_ID, role: 'CUSTOMER' });
}

export function setupNock(): void {
  beforeAll(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1'); // allow supertest connections
  });
  afterEach(() => nock.cleanAll());
  afterAll(() => nock.enableNetConnect());
}

export { request };
```

---

#### 5c — Create `apps/bff/src/staff/staff.controller.component.spec.ts`

**Group A — Authentication gate (no token / invalid token)**

```
GET /v1/staff  — no Authorization header                          → 401
GET /v1/staff  — Authorization: Bearer <malformed string>         → 401
GET /v1/staff  — Authorization: Bearer <expired JWT>              → 401
```

**Group B — Role gate**

```
GET /v1/staff  — valid CUSTOMER JWT                               → 403
GET /v1/staff  — valid STAFF JWT                                  → 403
GET /v1/staff  — valid MANAGER JWT, backend returns list          → 200
```

For the 200 case, use `nock(BACKEND_URL).get('/staff').reply(200, { items: [], pagination: {...} })`.

**Group C — `ActiveStaffGuard` wiring (this is the core of item 4)**

These tests assert that the guard calls the backend with the headers produced by `buildBackendHeaders`. Use `nock.matchHeader()`.

```
MANAGER JWT, guard call to GET /staff/:id returns { isActive: true }   → request continues → 200
MANAGER JWT, guard call to GET /staff/:id returns { isActive: false }  → 403 with RFC 7807 body
MANAGER JWT, guard call to GET /staff/:id returns 404                  → guard passes → controller runs
MANAGER JWT, guard call to GET /staff/:id times out                    → 503

Header assertions on the guard's backend call:
  X-Tenant-ID   = TENANT_ID       (from JWT)
  X-Actor-ID    = STAFF_ID        (from JWT sub)
  X-Actor-Type  = 'STAFF'
  X-Actor-Role  = 'MANAGER'
  X-Correlation-ID is present (set by CorrelationInterceptor or forwarded from request)
```

**Group D — Validation pipes**

```
POST /v1/staff/invite  — body missing 'email'                     → 400
POST /v1/staff/invite  — body has email: 'not-an-email'           → 400
POST /v1/staff/invite  — body has role: 'SUPERADMIN'              → 400
POST /v1/staff/invite  — body has firstName: ''                   → 400
GET  /v1/staff/:id     — id = 'not-a-uuid'                        → 400
PATCH /v1/staff/:id/deactivate — id = 'not-a-uuid'               → 400
GET  /v1/staff         — limit = 'notanumber'                     → 400
```

**Group E — Happy path contract (verify backend URL + body)**

Each test uses nock to assert the exact path, method, and body sent to the backend, then verifies the BFF returns the backend's response unchanged.

```
GET  /v1/staff?limit=10&offset=5   → nock expects GET /staff?limit=10&offset=5
GET  /v1/staff/:id                 → nock expects GET /staff/:id
POST /v1/staff/invite              → nock expects POST /staff/invite with { email, firstName, lastName, role }
PATCH /v1/staff/:id/deactivate     → nock expects PATCH /staff/:id/deactivate with {}
```

**Group F — Error propagation**

```
Backend returns 409 on POST /staff/invite   → BFF returns 409 with original body
Backend returns 404 on GET  /staff/:id      → BFF returns 404
Backend returns 422 on PATCH /:id/deactivate → BFF returns 422
```

**Group G — Infrastructure**

```
Any authenticated request                         → response has X-Correlation-ID header
Request with X-Correlation-ID: 'trace-abc'       → backend receives X-Correlation-ID: 'trace-abc'
Unknown error thrown by backend http (network err) → 500 with RFC 7807 body
```

---

#### 5d — Create `apps/bff/src/shared/guards/active-staff.guard.component.spec.ts`

Create a minimal test NestJS module with a stub `@Controller` that has a single `@Get('probe')` endpoint returning 200. Wire the full global guard chain. This isolates the guard without depending on `StaffModule`'s routing.

Scenarios:

```
MANAGER JWT, backend /staff/:id → { isActive: true }      → 200 (guard passes)
MANAGER JWT, backend /staff/:id → { isActive: false }     → 403 { detail: 'Your account has been deactivated' }
MANAGER JWT, backend /staff/:id → 404                     → 200 (guard passes through on 404)
MANAGER JWT, backend unreachable (connection refused)     → 503 { detail: 'Could not verify staff account status' }
CUSTOMER JWT                                              → 200 (guard skips backend call entirely — assert nock not called)
Public route (@Public() decorator)                        → 200 (guard skips entirely)
STAFF JWT, backend /staff/:id → { isActive: true }        → 200 (STAFF role also triggers guard)
```

Header assertion test (the most important one):
```
MANAGER JWT request
  → nock intercepts GET /staff/STAFF_ID
  → asserts X-Tenant-ID = TENANT_ID
  → asserts X-Actor-ID  = STAFF_ID
  → asserts X-Actor-Type = 'STAFF'
  → asserts X-Actor-Role = 'MANAGER'
```

---

#### 5e — Create `apps/bff/src/auth/auth.controller.component.spec.ts`

Scope: `POST /auth/token` and `POST /auth/switch-tenant` only. OAuth routes (`GET /auth/google`, `GET /auth/google/callback`) require real Google OAuth which cannot be exercised with nock.

**`POST /auth/token`:**

```
Missing selectionToken field                                    → 400
Invalid (tampered) selectionToken                               → error response
Valid token, backend tenants list does not include targetTenantId → 403
Valid token, backend returns tenant list + tenant info          → 200 { accessToken, expiresIn }
  → assert accessToken is a valid JWT with correct sub/tenantId/role
```

**`POST /auth/switch-tenant`:**

```
No JWT                                                          → 401
MANAGER JWT (wrong role)                                        → 403
STAFF JWT (wrong role)                                          → 403
CUSTOMER JWT, targetTenantId not in customer's tenant list     → 403
CUSTOMER JWT, valid targetTenantId                             → nock two backend calls → 200 { accessToken, expiresIn }
  → assert new JWT has targetTenantId and correct customerId
```

---

#### 5f — Update `jest.config.ts` (optional split)

If component tests become slow and you want to separate them from fast unit tests, add jest projects:

```typescript
// jest.config.ts
const config: Config = {
  projects: [
    {
      displayName: 'unit',
      rootDir: 'src',
      testRegex: '(?<!component)\\.spec\\.ts$',
      transform: { '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '../tsconfig.test.json' }] },
      testEnvironment: 'node',
    },
    {
      displayName: 'component',
      rootDir: 'src',
      testRegex: '\\.component\\.spec\\.ts$',
      transform: { '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '../tsconfig.test.json' }] },
      testEnvironment: 'node',
    },
  ],
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/**/*.spec.ts', '!src/main.ts', '!src/**/*.module.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['lcov', 'text-summary'],
};
```

Run unit tests only: `pnpm jest --selectProjects unit`  
Run component tests only: `pnpm jest --selectProjects component`  
Run everything: `pnpm test`

**Acceptance criteria for Story 5:**
- All component spec files pass
- Component tests for `StaffController` cover groups A through G above
- `ActiveStaffGuard` component tests verify the `buildBackendHeaders` wiring with nock `matchHeader`
- `nock.isDone()` is asserted in any test that sets up a nock interceptor, ensuring the backend was actually called
- `pnpm type-check` and `pnpm lint` pass
- Coverage delta on `active-staff.guard.ts`, `backend-headers.ts`, `error.interceptor.ts` ≥ 80%

---

## Summary Table

| Story | PR | Files created | Files modified | Risk |
|---|---|---|---|---|
| 1 — Remove dead `_user` | 1 | 0 | 2 | None |
| 2 — Extract + rename response types | 1 | 3 | 3 | None |
| 3 — ConfigService centralization | 2 | 0 | 6 | Low |
| 4a — `buildBackendHeaders` utility | 2 | 2 | 0 | None |
| 4b — Wire `BackendHttpService` | 2 | 0 | 2 | None |
| 4c — Wire `ActiveStaffGuard` | 2 | 0 | 1 | None |
| 4d — Fix sentinel anti-pattern | 2 | 0 | 2 | Low |
| 4e — `ErrorInterceptor` logging | 2 | 0 | 2 | None |
| 5 — Component tests with nock | 3 | 4 | 1 | None |

**Total:** 9 files created, 19 files modified, across 3 PRs.

# BFF Architecture - BeloAuto

## Purpose

The BFF (Backend-for-Frontend) is a **separate NestJS service** (`apps/bff/`) that acts as the sole public entry point for the web layer (`apps/web/`). The frontend never calls the backend directly.

**Responsibilities:**
- Handle Google OAuth 2.0 flow and issue signed JWTs
- Validate JWTs on every protected request
- Enforce tenant isolation: reject requests where `X-Tenant-Slug` does not match the JWT
- Proxy and orchestrate calls to the internal backend service
- Inject `tenantId` and `correlationId` into every backend call
- Translate errors to RFC 9457 Problem Details
- Apply rate limiting on all public endpoints

---

## NestJS Module Structure

```
apps/bff/src/
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts        ← /auth/google, /auth/google/callback, /auth/token, /auth/tenants, /auth/switch-tenant
│   ├── auth.service.ts           ← JWT issuance, tenant lookup, Google profile → Customer/Staff lookup
│   ├── strategies/
│   │   ├── google.strategy.ts    ← passport-google-oauth20
│   │   └── jwt.strategy.ts       ← passport-jwt (validates Bearer token on protected routes)
│   └── dto/
│       ├── select-tenant.dto.ts
│       └── switch-tenant.dto.ts
│
├── booking/
│   ├── booking.module.ts
│   ├── booking.controller.ts     ← /bookings, /bookings/:id, /bookings/:id/status, /bookings/:id/complete, /bookings/:id/reschedule
│   └── booking.service.ts        ← delegates to BackendHttpService
│
├── customer/
│   ├── customer.module.ts
│   ├── customer.controller.ts    ← /customers, /customers/:id, /me
│   └── customer.service.ts
│
├── loyalty/
│   ├── loyalty.module.ts
│   ├── loyalty.controller.ts     ← /loyalty/balance, /loyalty/entries
│   └── loyalty.service.ts
│
├── tenants/
│   ├── tenants.module.ts
│   ├── tenants.controller.ts     ← /tenants/slug/:slug (hotsite manifest — public, no auth required)
│   └── tenants.service.ts
│
├── schedule/
│   ├── schedule.module.ts
│   ├── schedule.controller.ts    ← /schedule/availability, /schedule/closures
│   └── schedule.service.ts
│
├── staff/
│   ├── staff.module.ts
│   ├── staff.controller.ts       ← /staff, /staff/:id (MANAGER role only)
│   └── staff.service.ts
│
├── shared/
│   ├── guards/
│   │   ├── jwt-auth.guard.ts     ← validates Bearer JWT; attached to all protected routes
│   │   ├── tenant.guard.ts       ← validates X-Tenant-Slug matches JWT tenantSlug
│   │   └── roles.guard.ts        ← validates JWT role against @Roles() decorator
│   ├── interceptors/
│   │   ├── correlation.interceptor.ts  ← generates X-Correlation-ID if absent; propagates to backend
│   │   └── error.interceptor.ts        ← catches backend HTTP errors, re-emits as RFC 9457
│   ├── decorators/
│   │   ├── current-user.decorator.ts   ← @CurrentUser() extracts JWT payload from request
│   │   ├── tenant-id.decorator.ts      ← @TenantId() extracts tenantId from JWT
│   │   └── roles.decorator.ts          ← @Roles('MANAGER', 'STAFF') route-level role requirement
│   ├── http/
│   │   └── backend-http.service.ts     ← typed wrapper around Axios; injects tenant + correlation headers
│   └── config/
│       └── throttler.config.ts         ← rate limit profiles (public vs authenticated)
│
└── app.module.ts
```

---

## Google OAuth + JWT Flow

### Step 1 — Login initiation
```
Browser → GET /auth/google
BFF → redirects to Google OAuth consent screen
      (scope: openid, email, profile)
      (callback: GOOGLE_CALLBACK_URL)
```

### Step 2 — Google callback
```
Google → GET /auth/google/callback?code=...
BFF (GoogleStrategy.validate()):
  1. Exchange code for profile (googleOAuthId, email, name)
  2. Query backend: does this email exist as Staff in any tenant?
     → If yes: single tenant → go to Step 4 (staff login, UC-022)
  3. Query backend: does this googleOAuthId exist as Customer in any tenant?
     → If none: new customer → create Customer in selected tenant later
     → If one: go to Step 4 (customer login, UC-021 case A)
     → If multiple: go to Step 3 (tenant selection, UC-021 case B)
```

### Step 3 — Tenant selection (UC-021 case B, customers only)
```
BFF → returns temporary code + list of tenants with active points
Browser → GET /select-tenant (Next.js page)
Customer selects tenant → POST /auth/token { code, tenantSlug }
```

### Step 4 — JWT issuance
```typescript
// auth.service.ts
issueJwt(payload: JwtPayload): string {
  return this.jwtService.sign({
    sub:        payload.userId,       // Customer or Staff UUID
    tenantId:   payload.tenantId,
    tenantSlug: payload.tenantSlug,
    role:       payload.role,         // 'CUSTOMER' | 'STAFF' | 'MANAGER'
  });
}
```

**JWT TTL:** 7 days (configured via `JWT_EXPIRES_IN` env var). No refresh tokens in MVP — user re-authenticates after expiry.

### Step 5 — Tenant switch (UC-023)
```
POST /auth/switch-tenant { tenantSlug }
  → validates: customer has a Customer record in the requested tenant
  → issues new JWT with the new tenantId/tenantSlug
  → invalidates nothing (previous JWT remains valid until TTL — acceptable for MVP)
```

---

## Request Lifecycle (Protected Endpoints)

Every request to a protected BFF endpoint passes through this chain:

```
Browser
  │  Authorization: Bearer <JWT>
  │  X-Tenant-Slug: autowash-pro
  │  X-Correlation-ID: <uuid-v7>  (optional — generated by BFF if absent)
  ▼
CorrelationInterceptor
  │  Reads X-Correlation-ID or generates uuidv7()
  │  Attaches to request context
  │  Sets X-Correlation-ID on response header
  ▼
JwtAuthGuard (passport-jwt)
  │  Verifies signature with JWT_SECRET
  │  Verifies expiry
  │  Extracts payload → { sub, tenantId, tenantSlug, role }
  │  Attaches to request as req.user
  │  → 401 if invalid/missing/expired
  ▼
TenantGuard
  │  Reads X-Tenant-Slug header
  │  Compares with req.user.tenantSlug
  │  → 403 tenant-mismatch if they do not match
  ▼
RolesGuard (only on routes decorated with @Roles())
  │  Reads req.user.role
  │  Compares with allowed roles from @Roles() decorator
  │  → 403 forbidden if role insufficient
  ▼
Controller method
  │  Calls BackendHttpService with the domain command
  ▼
BackendHttpService
  │  Builds request to BACKEND_INTERNAL_URL
  │  Injects headers:
  │    X-Tenant-ID:       req.user.tenantId
  │    X-Correlation-ID:  req.correlationId
  │    X-User-ID:         req.user.sub
  │    X-User-Role:       req.user.role
  ▼
Backend (internal Cloud Run — not public)
  │  Returns response
  ▼
ErrorInterceptor
  │  If backend returns 4xx/5xx: re-emits as RFC 9457 ProblemDetail
  │  If backend is unreachable (timeout): returns 503 service-unavailable
  ▼
Browser
```

---

## Backend HTTP Service

The `BackendHttpService` is the single class that all BFF modules use to call the backend. It prevents tenant headers from being forgotten on any call.

```typescript
// apps/bff/src/shared/http/backend-http.service.ts
@Injectable()
export class BackendHttpService {
  constructor(
    private http: HttpService,  // @nestjs/axios
    @Inject(REQUEST) private req: Request,
  ) {}

  private headers(): Record<string, string> {
    return {
      'X-Tenant-ID':       this.req['user']?.tenantId ?? '',
      'X-Correlation-ID':  this.req['correlationId'] ?? '',
      'X-User-ID':         this.req['user']?.sub ?? '',
      'X-User-Role':       this.req['user']?.role ?? '',
    };
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const url = `${process.env.BACKEND_INTERNAL_URL}${path}`;
    const { data } = await firstValueFrom(
      this.http.get<T>(url, { headers: this.headers(), params, timeout: 10_000 }),
    );
    return data;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${process.env.BACKEND_INTERNAL_URL}${path}`;
    const { data } = await firstValueFrom(
      this.http.post<T>(url, body, { headers: this.headers(), timeout: 10_000 }),
    );
    return data;
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const url = `${process.env.BACKEND_INTERNAL_URL}${path}`;
    const { data } = await firstValueFrom(
      this.http.patch<T>(url, body, { headers: this.headers(), timeout: 10_000 }),
    );
    return data;
  }

  async delete<T>(path: string): Promise<T> {
    const url = `${process.env.BACKEND_INTERNAL_URL}${path}`;
    const { data } = await firstValueFrom(
      this.http.delete<T>(url, { headers: this.headers(), timeout: 10_000 }),
    );
    return data;
  }
}
```

**Timeout:** 10 seconds per call. If the backend does not respond within 10 s, the BFF returns `503 service-unavailable` with the correlationId so the ops team can trace the slow request.

---

## Public vs Protected Routes

| Route | Auth required | Tenant header | Roles |
|---|---|---|---|
| `GET /auth/google` | No | No | — |
| `GET /auth/google/callback` | No | No | — |
| `POST /auth/token` | No | No | — |
| `GET /auth/tenants` | Temporary code | No | — |
| `POST /auth/switch-tenant` | JWT | No | CUSTOMER |
| `GET /tenants/slug/:slug` | No | No (slug is the path param) | — |
| `GET /services` | No | X-Tenant-Slug | — |
| `GET /schedule/availability` | No | X-Tenant-Slug | — |
| `POST /bookings` | No (guest) or JWT | X-Tenant-Slug | — |
| `GET /bookings` | JWT | X-Tenant-Slug | STAFF \| MANAGER |
| `GET /bookings/:id` | JWT | X-Tenant-Slug | STAFF \| MANAGER \| CUSTOMER (own only) |
| `PATCH /bookings/:id/status` | JWT | X-Tenant-Slug | STAFF \| MANAGER |
| `PATCH /bookings/:id/complete` | JWT | X-Tenant-Slug | STAFF \| MANAGER |
| `PATCH /bookings/:id/reschedule` | JWT | X-Tenant-Slug | STAFF \| MANAGER |
| `GET /me` | JWT | X-Tenant-Slug | CUSTOMER |
| `PATCH /me` | JWT | X-Tenant-Slug | CUSTOMER |
| `GET /loyalty/balance` | JWT | X-Tenant-Slug | CUSTOMER |
| `GET /customers` | JWT | X-Tenant-Slug | STAFF \| MANAGER |
| `GET /staff` | JWT | X-Tenant-Slug | MANAGER |
| `POST /staff/invite` | JWT | X-Tenant-Slug | MANAGER |
| `POST /cron/*` | OIDC (Cloud Scheduler) | No | — |

> **Guest booking:** `POST /bookings` is callable without a JWT when the body includes `guestInfo`. The BFF detects the absence of a Bearer token and passes the request through as a guest booking. Tenant identification comes from `X-Tenant-Slug`.

---

## Rate Limiting

```typescript
// app.module.ts
ThrottlerModule.forRoot([
  {
    name:  'public',
    ttl:   60_000,   // 1 minute window
    limit: 60,       // 60 requests/min for unauthenticated (hotsite, booking form)
  },
  {
    name:  'authenticated',
    ttl:   60_000,
    limit: 300,      // 300 requests/min for authenticated users (dashboard)
  },
]),
```

The `@Throttle({ public: { ... } })` decorator is applied at the controller level. Authenticated controllers use the `authenticated` profile; public controllers use `public`.

---

## Environment Variables

| Variable | Source | Description |
|---|---|---|
| `NODE_ENV` | Cloud Run env | `development` \| `staging` \| `production` |
| `PORT` | Cloud Run env | `3002` (local) — Cloud Run sets this automatically |
| `BACKEND_INTERNAL_URL` | Cloud Run env | Internal Cloud Run URL of the backend service (e.g. `https://beloauto-backend-xyz-uc.a.run.app`) |
| `JWT_SECRET` | Secret Manager | Signing secret for JWTs — must be ≥ 64 chars |
| `JWT_EXPIRES_IN` | Cloud Run env | `7d` |
| `GOOGLE_CLIENT_ID` | Secret Manager | OAuth client ID from Google Console |
| `GOOGLE_CLIENT_SECRET` | Secret Manager | OAuth client secret from Google Console |
| `GOOGLE_CALLBACK_URL` | Cloud Run env | `https://bff.beloauto.com/auth/google/callback` (prod) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Cloud Run env | OTel Collector URL (from `observability_vm_ip`) |
| `SERVICE_NAME` | Cloud Run env | `beloauto-bff` |

**Local `.env.local` values:**
```bash
NODE_ENV=development
PORT=3002
BACKEND_INTERNAL_URL=http://localhost:3001
JWT_SECRET=local-dev-jwt-secret-replace-with-at-least-64-chars-padding-here
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=<from-google-console>
GOOGLE_CLIENT_SECRET=<from-google-console>
GOOGLE_CALLBACK_URL=http://localhost:3002/auth/google/callback
```

---

## Deployment

| Property | Staging | Production |
|---|---|---|
| **Service name** | `beloauto-bff-staging` | `beloauto-bff` |
| **Cloud Run project** | `beloauto-staging` | `beloauto-prod` |
| **Ingress** | `INGRESS_TRAFFIC_ALL` (public HTTPS) | `INGRESS_TRAFFIC_ALL` (public HTTPS) |
| **Domain** | `beloauto-bff-staging-<hash>-uc.a.run.app` | `bff.beloauto.com` (Cloud Run domain mapping) |
| **Memory** | 256 Mi | 256 Mi |
| **CPU** | 1 | 1 |
| **Min instances** | 0 | 1 |
| **Max instances** | 10 | 100 |
| **Service account** | `beloauto-backend@beloauto-staging` | `beloauto-backend@beloauto-prod` |

**Secrets injected at runtime via `--set-secrets`:**
```bash
gcloud run deploy beloauto-bff \
  --set-secrets JWT_SECRET=jwt-secret:latest,\
GOOGLE_CLIENT_ID=google-oauth-client-id:latest,\
GOOGLE_CLIENT_SECRET=google-oauth-client-secret:latest
```

**BACKEND_INTERNAL_URL** is set as a plain environment variable (not a secret) because it is the Cloud Run service URL — not sensitive:
```bash
gcloud run deploy beloauto-bff \
  --set-env-vars BACKEND_INTERNAL_URL=https://beloauto-backend-<hash>-uc.a.run.app
```

> **How to get `BACKEND_INTERNAL_URL`:** after deploying the backend, run:
> ```bash
> terraform -chdir=infrastructure/terraform output backend_url
> ```
> Or: `gcloud run services describe beloauto-backend --region us-central1 --project beloauto-prod --format 'value(status.url)'`

---

## CI/CD

Full pipeline YAML is in `docs/09-CI_CD_PIPELINE.md`. Summary:

| Stage | Workflow | What runs |
|---|---|---|
| PR gate | `ci-bff.yml` | ESLint, `tsc --noEmit`, unit + integration tests, Gitleaks, Snyk SCA |
| Merge to `main` | `deploy-bff.yml` | Build → GAR, deploy staging (auto), deploy production (1 reviewer) |

**Testing in CI:**
- Unit tests: NestJS test module with mocked `BackendHttpService`
- Integration tests: real HTTP calls to a locally-started BFF, with backend mocked via MSW
- No Testcontainers needed for the BFF (it owns no database schema)

---

## Local Development

```bash
# Start all infrastructure first
pnpm infra:up   # PostgreSQL + Pub/Sub emulator + GCS emulator + MailHog

# Start all services in watch mode (backend on :3001, BFF on :3002, web on :3000)
pnpm dev
```

**BFF-specific scripts (run from `apps/bff/`):**
```bash
pnpm --filter bff dev          # start BFF in watch mode
pnpm --filter bff test         # unit + integration tests
pnpm --filter bff lint         # ESLint
pnpm --filter bff type-check   # tsc --noEmit
```

**Testing the auth flow locally:**
1. Start all services (`pnpm dev`)
2. Visit `http://localhost:3000` (Next.js)
3. Click "Login with Google" → redirects to `http://localhost:3002/auth/google`
4. BFF redirects to Google → Google calls back to `http://localhost:3002/auth/google/callback`
5. BFF issues JWT → Next.js stores it (httpOnly cookie or localStorage, per auth lib choice)
6. All subsequent API calls from Next.js go to `http://localhost:3002` with `Authorization: Bearer <jwt>`

> **Google OAuth locally:** The Google Console must have `http://localhost:3002/auth/google/callback` in the authorised redirect URIs. See Day 0 §9 in `docs/23-INFRASTRUCTURE_SETUP.md`.

---

## Key Dependencies

```json
{
  "@nestjs/passport":       "^10.0.0",
  "@nestjs/jwt":            "^10.0.0",
  "@nestjs/axios":          "^3.0.0",
  "@nestjs/throttler":      "^5.0.0",
  "passport":               "^0.7.0",
  "passport-google-oauth20": "^2.0.0",
  "passport-jwt":           "^4.0.0",
  "axios":                  "^1.6.0",
  "uuid":                   "^9.0.0"
}
```

---

## Folder Location in Monorepo

```
apps/bff/
├── src/                  ← NestJS source (structure above)
├── test/                 ← integration tests (Supertest against local BFF)
├── Dockerfile            ← multi-stage build: node:20-alpine
├── package.json
├── tsconfig.json         ← extends packages/config/tsconfig.base.json
└── .env.example          ← safe defaults for local dev (no secrets)
```

**Dockerfile pattern (multi-stage):**
```dockerfile
# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/bff/package.json apps/bff/
COPY packages/ packages/
RUN corepack enable && pnpm install --frozen-lockfile
COPY apps/bff/ apps/bff/
RUN pnpm --filter bff build

# Stage 2: runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/bff/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3002
CMD ["node", "dist/main.js"]
```

---

## Security Considerations / Known Limitations

### OAuth state parameter (CSRF protection) — deferred to M16-S11

The current `GoogleStrategy` does not validate an OAuth `state` parameter. The state parameter is the standard mechanism for preventing login CSRF attacks (an attacker forges a callback URL that logs the victim into the attacker's account).

**Risk:** Without state validation, a malicious link can trick a user into completing an OAuth flow that was initiated by the attacker.

**Deferred because:** Implementing a stateless state parameter correctly requires either:
- Session support (`express-session`) — incompatible with the stateless JWT design, or
- A stateless signed nonce: generate a short-lived signed JWT as `state` on `/auth/google`, pass it to Google, validate signature + expiry on `/auth/google/callback`. No server-side storage required.

**Planned fix (M16-S11):** Implement stateless signed `state` nonce in `GoogleStrategy`:
```typescript
// In GoogleStrategy constructor:
super({ ..., state: false });  // handle state manually

// Generate state on initiation:
const state = this.jwtService.sign({ nonce: randomUUID() }, { expiresIn: '5m' });

// Validate on callback:
this.jwtService.verify(state);  // throws if tampered or expired
```

**Must be resolved before production.** See `plan/M16-CICD-DEPLOY-HARDENING.md` § M16-S11.

---

## References

| Topic | Document |
|---|---|
| Full API surface (all endpoints) | `docs/14-API_CONTRACTS.md` |
| Infrastructure, Cloud Run, IAM, secrets | `docs/23-INFRASTRUCTURE_SETUP.md` |
| CI/CD pipeline YAML | `docs/09-CI_CD_PIPELINE.md` |
| Architecture overview | `docs/11-ARCHITECTURE.md` |
| Frontend that calls this BFF | `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` |
| Hotsite manifest endpoint | `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` |

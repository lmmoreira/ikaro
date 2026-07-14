# BFF Architecture - Ikaro

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

> **Note:** the tree below reflects the real `apps/bff/src/` layout. Controllers call `BackendHttpService` directly — there is **no** separate `.service.ts` delegation layer per module (the early `booking.service.ts` / `customer.service.ts` design was dropped; only `auth/` has standalone services, for JWT issuance and selection-token handling, which have no `BackendHttpService` equivalent to delegate to).

```
apps/bff/src/
├── features/
│   ├── auth/                 ← technical slice: OAuth, JWT issuance, tenant selection
│   ├── booking/              ← domain slice: bookings, schedule, services, attachments
│   ├── customer/             ← domain slice
│   ├── loyalty/              ← domain slice
│   ├── platform/             ← domain slice: hotsite, tenant settings, manifest
│   ├── staff/                ← domain slice
│   └── uploads/              ← technical slice only if the signed-url flow is genuinely shared
├── shared/                   ← cross-cutting transport and infra helpers only
├── config/
├── health/
├── test/                     ← shared test helpers (mocks, component-test harness)
└── app.module.ts
```

---

## Module & Controller Naming Conventions

**Modules are named after bounded contexts (CLAUDE.md §3), not aggregates.** A module name must match a row in the Bounded Contexts table — e.g. `platform/` for the Platform context (`Tenant`, `HotsiteConfig`), never `tenants/` (`Tenant` is one aggregate *inside* Platform, not a module of its own). This is the rule that the M12-S05 `tenants/` → `platform/` rename now enforces — it should not need to happen again.

**Within a module, split controllers by audience, not by resource:**

| File | Audience | Example |
|---|---|---|
| `<context>.controller.ts` | Authenticated dashboard (STAFF/MANAGER/CUSTOMER), `@Roles(...)` guarded | `ServicesController` — `GET /services`, `GET /services/:id`, `POST /services`, `PATCH /services/:id`, `DELETE /services/:id` |
| `<context>.public.controller.ts` | Unauthenticated hotsite, `@Public()` | `ServicesPublicController` — `GET /public/services`; `PlatformPublicController` — `GET /public/platform/manifest/:slug` |

- **`.public.controller.ts` always lives under a `public/<resource>` prefix — never the bare resource path.** Settled in `M13-S05` after `ServicesController`'s staff list (`GET /services`, returning inactive services too) needed the exact same method+path the existing `ServicesPublicController` already occupied (`GET /services`, active-only). Putting the public variant under `public/` frees the bare resource path entirely for the authenticated controller, so audience-split controllers never have to coordinate which one "owns" a given method+path. This is the default now — not an "optional-auth guard" workaround, and not something to re-litigate per endpoint.
- A single `.public.controller.ts` can serve **multiple hotsite module types** — it is not 1:1 with `HotsiteModuleType`.
- `@Public()` is binary — a public route never receives `req.user`. Two different audiences needing the same conceptual resource get two different paths (`public/<resource>` vs `<resource>`), each with its own consistent guard — not one route branching on whether a JWT happens to be present.
- Public route paths describe the **resource/action returned**, prefixed with `public/` (`public/platform/manifest/:slug`, `public/services`), independent of the module folder name.

**Response types for `.public.controller.ts` endpoints** live in `@ikaro/types` (`packages/types/src/hotsite.ts`), named `Hotsite<Resource>Response` / `Hotsite<Resource>ListResponse` (e.g. `HotsiteManifestResponse`, `HotsiteServiceResponse` / `HotsiteServiceListResponse`). Authenticated/staff response types use a `Staff<Resource>Response` / `Staff<Resource>ListResponse` naming (e.g. `StaffServiceResponse` / `StaffServiceListResponse` in `service.dto.ts`, `StaffBookingDetailResponse` in `booking.dto.ts`) since they aren't part of the public hotsite contract — see CLAUDE.md §7 "BFF module & controller naming" for the `<module>.mapper.ts` convention that translates the backend-internal shape into these public types.

**Frontend fetchers (`apps/web/features/<domain>/api/<name>.ts` or `apps/web/shells/<surface>/...`) mirror the BFF feature slice name** they call — e.g. `features/platform/hotsite/api/services.ts` ↔ `platform.public.controller.ts`.

**Web-facing composite views belong in the BFF, not in `apps/web`.** If a dashboard screen needs multiple backend reads, response merging, or display shaping across endpoints, expose one BFF contract that owns that fan-out and aggregation. Pages, route files, and feature helpers in `apps/web` should consume a single BFF response and render it; they should not orchestrate multiple BFF calls and merge the results themselves.

### Canonical Config And Settings Reads

Do not add separate read endpoints or backend use cases just to return a smaller projection of an aggregate/config already exposed by a canonical endpoint. Example anti-pattern: `GET /tenants/formatting` and `GET /tenants/booking-config` re-reading the same tenant row already returned by `GET /tenants/settings`.

Use one canonical source-of-truth read path, then derive caller-specific values in the BFF mapper or web helper. This keeps caching, authorization, tests, and contract ownership centralized.

A separate read endpoint is acceptable only when:
- it enforces a materially different authorization boundary and the canonical payload would expose forbidden data;
- it composes data from multiple sources;
- it represents a stable public contract distinct from internal/admin configuration.

---

## Web → BFF Transport Layer (apps/web)

Two transport helpers in `apps/web/shared/lib/api/` cover **all** `apps/web` → BFF calls. Never write a raw `fetch()` URL inside a hook, component, or page outside these two — the anti-pattern of a duplicate URL going stale silently (M13-S05) is caught here.

### `bffServerFetch(token, path, init?)` — server-only

**File:** `apps/web/shared/lib/api/bff-server.ts`

```ts
bffServerFetch(token: string, path: string, init?: BffServerFetchInit): Promise<Response>
```

**Use in:** Server Components, Route Handlers (`app/api/**/route.ts`), `page.tsx`, `layout.tsx`

- Passes the JWT as `Cookie: access_token=<token>` — token comes from `(await cookies()).get('access_token')?.value ?? ''`
- Default `cache: 'no-store'` — always fetches fresh data
- Reuses the shared base transport (`bffPublicFetch`) for URL construction, timeout, and default request policy
- **Never import in `'use client'` files** — server transport only

Canonical callers:
- feature-owned authenticated API helpers such as `features/booking/api/staff.server.ts`, `features/customer/api.server.ts`, and `features/platform/api/tenant-settings.server.ts`
- shell-owned route helpers under `shells/dashboard/**` when server-side composition needs BFF data
- Route Handlers (`app/api/bookings/route.ts`, etc.) — these proxy BFF calls for React Query's client-side refetch

### `bffPublicFetch(path, init?)` — public server-only

**File:** `apps/web/shared/lib/api/bff-server.ts`

```ts
bffPublicFetch(path: string, init?: BffServerFetchInit): Promise<Response>
```

**Use in:** public or guest Server Components and Route Handlers that need the BFF base URL and centralized timeout/cache policy but do **not** authenticate with the dashboard cookie

- Builds `NEXT_PUBLIC_BFF_URL + path`
- Default `cache: 'no-store'`
- Default timeout via `AbortSignal.timeout(8000)` when no signal is provided
- Use this instead of a raw `fetch(NEXT_PUBLIC_BFF_URL + ...)` whenever the call is server-side but not cookie-authenticated

Canonical callers:
- guest/public server helpers such as `features/booking/api/public.server.ts`
- future public Route Handlers that proxy guest-token or anonymous BFF reads

### `bffClient` — client-only axios instance

**File:** `apps/web/shared/lib/api/bff-client.ts`

**Use in:** React Query hooks (`features/**/hooks/use*.ts`), client-side mutations

- Browser sends the `access_token` cookie automatically via `withCredentials: true` — no token parameter needed
- **Never import in Server Components or Route Handlers** — axios with `withCredentials` sends no cookies server-side

Canonical callers: feature-owned client hooks and mutations under `features/<domain>/hooks/` or shell-owned hooks under `shells/<surface>/hooks/`

React Query cache key shape: `[namespace, tenantId, ...params]` — `tenantId` always comes from `useTenant()`.

### `TenantProvider` / `useTenant()` — tenant context for client components

**File:** `apps/web/providers/tenant-provider.tsx`

- Server layouts (`app/dashboard/(protected)/layout.tsx`, `app/[slug]/my-account/layout.tsx`) decode the JWT → extract `tenantId` and `tenantSlug` → wrap children in `<TenantProvider tenantId={...} tenantSlug={...}>`
- Client hooks call `const { tenantId } = useTenant()` to scope React Query cache keys per tenant
- Replaced the old `configureBffClient` / `getTenantId()` singleton (deleted M13-S17), which had a first-render race condition: the hook read `getTenantId()` during render but `useEffect` ran after mount, so the first render always had `tenantId = ''`

### Route Handler proxy pattern

Some React Query hooks call `bffClient` against a local Next.js Route Handler (`/api/**`) rather than hitting `NEXT_PUBLIC_BFF_URL` directly. The Route Handler uses `bffServerFetch` to proxy the call with the server-side cookie. Use this pattern when the hook needs server-authorised data but runs in a client component and the BFF response may need to be filtered or shaped before reaching the browser.

In these cases: **the Route Handler owns the `bffServerFetch` call; the hook calls `bffClient` against the Route Handler's `/api/...` path.** Both sides must be updated together when the BFF route changes.

### Decision table

| Context | Helper to use | Why |
|---|---|---|
| `page.tsx` / `layout.tsx` (authenticated) | `bffServerFetch(token, path)` | Runs on server with cookie-authenticated BFF access |
| `page.tsx` / `layout.tsx` (public or guest BFF call) | `bffPublicFetch(path, init?)` | Runs on server, but auth is not the dashboard cookie |
| `app/api/**/route.ts` | `bffServerFetch(token, path)` or `bffPublicFetch(path, init?)` | Route Handler — choose by auth mode |
| `features/**/hooks/use*.ts` | `bffClient.get(path)` | Runs in browser; cookie sent automatically |
| `features/**/api/*.server.ts` fetchers | `bffServerFetch(token, path)` or `bffPublicFetch(path, init?)` | Called from `page.tsx` / Route Handlers |
| `'use client'` component | `bffClient` (via a hook) | Never call server transport helpers client-side |

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

### Step 3 — Tenant selection (customers only) — **removed, `M13-S14`**
> **Descoped:** the pre-login `/select-tenant` chooser + `POST /auth/token { code, tenantSlug }` described here were **deleted as dead code** during `M13-S14`'s discovery session — confirmed unreachable from any shipped UI, since every customer login starts from a specific tenant's hotsite (which always supplies the tenant slug directly). `IssueTokenResponse` was removed from `@ikaro/types`. Multi-tenant customers are still fully supported — they log into whichever tenant's hotsite they started from, then use Step 5/UC-023 below to move between tenants they already belong to. See `docs/04-USE_CASES.md` UC-021's note for the full rationale.

### Step 4 — JWT issuance
```typescript
// apps/bff/src/features/auth/jwt-issuer.service.ts
issueToken(payload: JwtPayload): string {
  return this.jwtService.sign({
    sub:        payload.userId,       // Customer or Staff UUID
    tenantId:   payload.tenantId,
    tenantSlug: payload.tenantSlug,
    tenantName: payload.tenantName,   // added M13-S15, so shells never need a separate profile fetch
    userName:   payload.userName,     // added M13-S15
    role:       payload.role,         // 'CUSTOMER' | 'STAFF' | 'MANAGER'
    locale:     payload.locale,
  });
}
```

**JWT TTL:** 7 days (configured via `JWT_EXPIRES_IN` env var). No refresh tokens in MVP — user re-authenticates after expiry. Issued as an **httpOnly cookie** (`access_token`), not returned in the response body — see "Request Lifecycle" below for why this replaced the original Bearer-token design.

### Step 5 — Tenant switch (UC-023, customer; and the equivalent staff flow)
```
POST /auth/switch-tenant { targetTenantId: uuid }
  → validates: customer has a Customer record in the requested tenant
  → issues new JWT with the new tenantId/tenantSlug
  → invalidates nothing (previous JWT remains valid until TTL — acceptable for MVP)
```
Staff have the analogous `POST /auth/switch-staff-tenant`, driven by `GET /staff/me/tenants` and the `/select-staff-tenant` screen — staff are multi-tenant-capable since `M13-S13` (see `docs/06-TENANT_ISOLATION_STRATEGY.md`).

---

## Request Lifecycle (Protected Endpoints)

Every request to a protected BFF endpoint passes through this chain:

> **Updated (`M13-S17`, "centralize BFF transport"):** the browser no longer sends `Authorization`/`X-Tenant-Slug` headers at all. The original S01 client design (a `configureBffClient()` singleton injecting those headers manually) had a first-render race — `tenantId` was read during render but populated by a `useEffect` that runs after mount, so it was `''` on first paint. The fix moved tenant identity out of client JS entirely: the BFF issues an httpOnly `access_token` **cookie**, the browser sends it automatically (`withCredentials: true`), and `TenantProvider` is populated **server-side** (each layout decodes the JWT already present in the request's cookies and passes `tenantId`/`tenantSlug` down as props before the client renders). See "Web → BFF Transport Layer" below for the full picture — this diagram reflects that current design, not S01's original one.

```
Browser
  │  Cookie: access_token=<JWT>  (httpOnly, sent automatically — no manual header injection)
  │  X-Correlation-ID: <uuid-v7>  (optional — generated by BFF if absent)
  ▼
CorrelationInterceptor
  │  Reads X-Correlation-ID or generates uuidv7()
  │  Attaches to request context
  │  Sets X-Correlation-ID on response header
  ▼
JwtAuthGuard (passport-jwt)
  │  Extracts JWT from the Bearer header OR the access_token cookie
  │  Verifies signature with JWT_SECRET
  │  Verifies expiry
  │  Extracts payload → { sub, tenantId, tenantSlug, tenantName, userName, role, locale }
  │  Attaches to request as req.user
  │  → 401 if invalid/missing/expired
  ▼
TenantGuard
  │  Reads X-Tenant-Slug header IF PRESENT — the browser no longer sends it post-S17, so this
  │  guard is now effectively a no-op in practice (`if (!tenantSlug) return true`). Tenant
  │  scoping is carried entirely by the JWT/cookie, not this header, for real traffic.
  │  → 403 tenant-mismatch only if a caller supplies a mismatched header explicitly
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
  │    X-Actor-ID:        req.user.sub
  │    X-Actor-Type:      'CUSTOMER' if req.user.role === 'CUSTOMER' else 'STAFF'
  │    X-Actor-Role:      req.user.role
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

## Error Passthrough Contract

`ErrorInterceptor` (referenced in the Request Lifecycle diagram above) re-emits every backend 4xx/5xx as an RFC 9457 `ProblemDetail` without altering its `code`, `field`, `params`, or `violations[]` — the BFF is structurally a passthrough for these fields, never a place that re-derives or discards them (TD23). This passthrough behavior already existed before TD23 (confirmed during that TD's discovery); TD23's work was populating what actually gets passed through (backend contexts previously emitted no `code` at all), not fixing the passthrough mechanism itself.

The BFF also originates its own errors — guest-token failures, guard rejections (`RolesGuard`, `ActiveStaffGuard`, dev-login guards), tenant-not-registered checks — through the same canonical envelope, using `throwProblemDetail()` (`apps/bff/src/shared/http/problem-detail.ts`, which wraps `@ikaro/nestjs-http`'s implementation and narrows the allowed `code` type to `BffThrowableCode` — only the origins a BFF site is actually permitted to throw: `BffErrorCode`, `AuthErrorCode`, `GenericErrorCode`, and the single reused `StaffErrorCode.DEACTIVATED`). No BFF-originated error uses a different shape from what the backend emits — exactly one `ProblemDetail` shape reaches the client regardless of which layer raised it.

Full pattern (code catalog, naming convention, frontend resolver, "adding a new error" checklist): `docs/ENGINEERING_RULES.md` § Exception handling & i18n pattern. Full discovery/rollout history: `td/TD23-EXCEPTION-HANDLING-I18N-PATTERN.md`.

---

## Public vs Protected Routes

> **`Tenant header` column is legacy** — see the Request Lifecycle note above; the browser hasn't sent `X-Tenant-Slug` since `M13-S17`. Rows below say "No" for any route added post-S17; older rows still say "X-Tenant-Slug" as a historical artifact of when they were written, not because the header is actually required today.

| Route | Auth required | Tenant header | Roles |
|---|---|---|---|
| `GET /auth/google` | No | No | — |
| `GET /auth/google/callback` | No | No | — |
| `GET /auth/logout` | No | No | — |
| `POST /auth/switch-tenant` | JWT | No | CUSTOMER |
| `GET /auth/staff-tenants` | JWT | No | STAFF \| MANAGER |
| `POST /auth/switch-staff-tenant` | JWT | No | STAFF \| MANAGER |
| `GET /platform/manifest/:slug` | No | No (slug is the path param) | — |
| `GET /services` (public) | No | X-Tenant-Slug | — |
| `GET /services` (authenticated, includes inactive) | JWT | No | STAFF \| MANAGER |
| `GET /services/:id` | JWT | No | STAFF \| MANAGER |
| `POST /services` | JWT | No | STAFF \| MANAGER |
| `PATCH /services/:id` | JWT | No | STAFF \| MANAGER |
| `DELETE /services/:id` (deactivate) | JWT | No | STAFF \| MANAGER |
| `PATCH /services/:id/activate` | JWT | No | STAFF \| MANAGER |
| `GET /schedule/availability` | No | X-Tenant-Slug | — |
| `POST /bookings` | No (guest) or JWT | X-Tenant-Slug | — |
| `GET /bookings` | JWT | No | STAFF \| MANAGER \| CUSTOMER (own only) |
| `GET /bookings/:id` | JWT | No | STAFF \| MANAGER \| CUSTOMER (own only, else 404) |
| `PATCH /bookings/:id/cancel` | JWT | No | CUSTOMER \| STAFF \| MANAGER |
| `PATCH /bookings/:id/approve` | JWT | No | STAFF \| MANAGER |
| `PATCH /bookings/:id/reject` | JWT | No | STAFF \| MANAGER |
| `PATCH /bookings/:id/request-info` | JWT | No | STAFF \| MANAGER |
| `PATCH /bookings/:id/submit-info` | JWT | No | CUSTOMER |
| `PATCH /bookings/:id/submit-info/guest` | No (guest token in query) | No | — |
| `GET /bookings/:id/guest` | No (guest token in query) | No | — |
| `PATCH /bookings/:id/reschedule` | JWT | No | STAFF \| MANAGER |
| `PATCH /bookings/:id/complete` | JWT | No | STAFF \| MANAGER |
| `GET /customers/me` | JWT | No | CUSTOMER |
| `PATCH /customers/me` | JWT | No | CUSTOMER |
| `GET /customers` (search) | JWT | No | STAFF \| MANAGER |
| `GET /customers/:customerId/loyalty` (composite) | JWT | No | STAFF \| MANAGER |
| `GET /loyalty/balance` | JWT | No | CUSTOMER |
| `GET /loyalty/entries` | JWT | No | CUSTOMER |
| `GET /loyalty/redemptions` | JWT | No | CUSTOMER |
| `POST /loyalty/redeem` | JWT | No | STAFF \| MANAGER |
| `GET /tenants/settings` | JWT | No | STAFF \| MANAGER |
| `PATCH /tenants/settings` | JWT | No | MANAGER |
| `PATCH /tenants` (rename) | JWT | No | MANAGER |
| `GET /staff` | JWT | No | MANAGER |
| `GET /staff/:id` | JWT | No | MANAGER |
| `POST /staff/invite` | JWT | No | MANAGER |
| `PATCH /staff/:id` | JWT | No | MANAGER |
| `PATCH /staff/:id/deactivate` | JWT | No | MANAGER |
| `PATCH /staff/:id/activate` | JWT | No | MANAGER |
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
| `BACKEND_INTERNAL_URL` | Cloud Run env | Internal Cloud Run URL of the backend service (e.g. `https://ikaro-backend-xyz-uc.a.run.app`) |
| `JWT_SECRET` | Secret Manager | Signing secret for JWTs — must be ≥ 64 chars |
| `JWT_EXPIRES_IN` | Cloud Run env | `7d` |
| `GOOGLE_CLIENT_ID` | Secret Manager | OAuth client ID from Google Console |
| `GOOGLE_CLIENT_SECRET` | Secret Manager | OAuth client secret from Google Console |
| `GOOGLE_CALLBACK_URL` | Cloud Run env | `https://bff.<ikaro-domain>/auth/google/callback` (prod) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Cloud Run env | OTel Collector URL (from `observability_vm_ip`) |
| `SERVICE_NAME` | Cloud Run env | `ikaro-bff` |

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
| **Service name** | `ikaro-bff-staging` | `ikaro-bff` |
| **Cloud Run project** | `ikaro-staging` | `ikaro-prod` |
| **Ingress** | `INGRESS_TRAFFIC_ALL` (public HTTPS) | `INGRESS_TRAFFIC_ALL` (public HTTPS) |
| **Domain** | `ikaro-bff-staging-<hash>-uc.a.run.app` | `bff.<ikaro-domain>` (Cloud Run domain mapping) |
| **Memory** | 256 Mi | 256 Mi |
| **CPU** | 1 | 1 |
| **Min instances** | 0 | 1 |
| **Max instances** | 10 | 100 |
| **Service account** | `ikaro-backend@ikaro-staging` | `ikaro-backend@ikaro-prod` |

**Secrets injected at runtime via `--set-secrets`:**
```bash
gcloud run deploy ikaro-bff \
  --set-secrets JWT_SECRET=jwt-secret:latest,\
GOOGLE_CLIENT_ID=google-oauth-client-id:latest,\
GOOGLE_CLIENT_SECRET=google-oauth-client-secret:latest
```

**BACKEND_INTERNAL_URL** is set as a plain environment variable (not a secret) because it is the Cloud Run service URL — not sensitive:
```bash
gcloud run deploy ikaro-bff \
  --set-env-vars BACKEND_INTERNAL_URL=https://ikaro-backend-<hash>-uc.a.run.app
```

> **How to get `BACKEND_INTERNAL_URL`:** after deploying the backend, run:
> ```bash
> terraform -chdir=infrastructure/terraform output backend_url
> ```
> Or: `gcloud run services describe ikaro-backend --region us-central1 --project ikaro-prod --format 'value(status.url)'`

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

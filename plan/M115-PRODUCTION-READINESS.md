# M115 — Production Readiness

**Phase:** Local Development  
**Goal:** Close three security and developer-experience gaps introduced as explicit MVP shortcuts: replace the plain-string photo-upload contract with a real GCS signed-URL flow; add a dev-only OAuth bypass so developers can test any user persona without a Google redirect; and protect all unguarded `/internal/*` backend routes with a shared API key guard.  
**Depends on:** M10 (all stories done), M03-S05 (BFF auth), M00-S06 (GCS adapter)  
**Blocks:** M12 (staging/production deployment)

---

## Stories

---

### M115-S01 — GCS Signed URL endpoint for photo uploads

> Moved from M10-S02. M10-S01 accepts `afterServicePhotoUrls` as plain strings (good enough for backend logic); this story wires the actual upload mechanism the frontend needs.

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/14-API_CONTRACTS.md` § media endpoints, `docs/23-INFRASTRUCTURE_SETUP.md` § GCS emulator

**Description:**  
Photos (before-service from customer, after-service from staff) are uploaded directly from the browser to GCS using a pre-signed URL, avoiding routing large files through the backend. Locally, the service points to the GCS emulator (`http://localhost:4443`).

**Backend — `IStorageService` port + `GcsSignedUrlService` adapter:**
```
src/shared/ports/storage.service.port.ts
src/shared/infrastructure/gcs-signed-url.service.ts
```
- `generateSignedUrl(tenantId, bookingId, fileName, operation: 'write'): Promise<string>`
- Builds GCS path: `tenants/<tenant_id>/bookings/<booking_id>/<fileName>`
- Returns signed URL valid for 15 minutes
- Rejects `fileName` containing `..` or `/`
- Content type restricted to `image/jpeg` | `image/png`

**BFF endpoint:** `POST /v1/bookings/attachments/signed-url`
- JWT required (`CUSTOMER` for before-photos, `STAFF|MANAGER` for after-photos)
- Body: `{ bookingId: uuid, fileName: string, contentType: 'image/jpeg' | 'image/png' }`
- Returns: `{ signedUrl, filePath, expiresAt }`

**Photo upload handoff (3-step frontend contract):**
1. `POST /v1/bookings/attachments/signed-url` → receive `{ signedUrl, filePath }`
2. Browser uploads file directly: `PUT <signedUrl>` (no backend involved)
3. Include `filePath` (not `signedUrl`) in the booking request body (e.g. `afterServicePhotoUrls: [filePath]`)

`filePath` format: `tenants/<tenant_id>/bookings/<booking_id>/<fileName>`. The backend stores and returns this path only — fresh read-signed URLs are generated at display time, never stored.

**Acceptance criteria:**
- [ ] Endpoint returns `{ signedUrl, filePath, expiresAt }` — `expiresAt` is 15 minutes from now
- [ ] `fileName` containing `../` or `/` is rejected with `400`
- [ ] Content type other than `image/jpeg` / `image/png` returns `400`
- [ ] Customer can only generate signed URLs for bookings they own
- [ ] Integration test: call endpoint → `PUT` file to signed URL on GCS emulator → assert upload succeeds (HTTP 200 from emulator)
- [ ] `filePath` (not `signedUrl`) is what the completion endpoint stores in `after_service_photo_urls[]`

**Dependencies:** M10-S01, M03-S05, M00-S06

---

### M115-S02 — Dev Login BFF endpoint

**Agent:** `bff-ts`  
**Complexity:** S  
**Docs to load:** `plan/M03-AUTHENTICATION_IMPLEMENTATION_DETAILS_IA.md` § JWT cookie, § BackendHttpService pattern

**Description:**  
A BFF-only endpoint (`POST /auth/dev-login`) that issues a real JWT session for any registered staff or customer without a Google OAuth redirect. Only active when `ENABLE_DEV_AUTH=true` **and** `NODE_ENV !== 'production'` — two independent guards in series. Used exclusively in local dev and CI. Powers the `.http` REST Client workflow so developers can instantly switch persona and tenant.

**BFF endpoint:** `POST /auth/dev-login`
- Public (no JWT required)
- Body: `{ email: string, tenantSlug: string, type: 'staff' | 'customer' }`
- Returns: `{ accessToken: string, user: { sub, tenantId, tenantSlug, role } }` + sets `access_token` cookie via `JWT_COOKIE_OPTIONS`
- `403` if `ENABLE_DEV_AUTH` is not `true` or `NODE_ENV` is `production`

**Flow:**
1. Guard: `ENABLE_DEV_AUTH !== 'true'` → `403 ForbiddenException`
2. Guard: `NODE_ENV === 'production'` → `403 ForbiddenException`
3. Resolve tenant: `GET /internal/tenants/by-slug/:slug` → `{ id, slug }`
4. Resolve actor:
   - `type === 'staff'`: `GET /internal/staff/by-email?email=X&tenantId=Y` → `{ id, role }`
   - `type === 'customer'`: `POST /internal/customers` with `{ tenantId, email, name: 'Dev User', googleOAuthId: 'dev::${email}' }` (find-or-create; prefix `dev::` can never come from Google, which issues numeric OAuth IDs)
5. Sign JWT: `{ sub: actorId, tenantId, tenantSlug, role }`
6. Set cookie + return JSON

**New env vars (BFF):**
```
ENABLE_DEV_AUTH=true          # required in .env.local; absent/false in staging/prod
```
Added to `env.validation.ts` as `z.string().optional()` — absence means disabled.

**Validation pattern:** `@Body(new ZodValidationPipe(DevLoginSchema))` — never `@UsePipes` at method level (consistent with project convention).

**Companion `.http` file:** `apps/bff/test/dev-auth.http`
```http
@bffUrl = http://localhost:3002
@tenantSlug = lavacar-bh

### Login as Manager
# @name managerLogin
POST {{bffUrl}}/auth/dev-login
Content-Type: application/json

{ "email": "admin@lavacar.com.br", "tenantSlug": "{{tenantSlug}}", "type": "staff" }

@managerToken = {{managerLogin.response.body.accessToken}}

### Login as Customer
# @name customerLogin
POST {{bffUrl}}/auth/dev-login
Content-Type: application/json

{ "email": "joao@gmail.com", "tenantSlug": "{{tenantSlug}}", "type": "customer" }

@customerToken = {{customerLogin.response.body.accessToken}}
```

**Acceptance criteria:**
- [ ] Returns `{ accessToken, user }` + sets `access_token` cookie when `ENABLE_DEV_AUTH=true` and `NODE_ENV=development`
- [ ] Returns `403` when `ENABLE_DEV_AUTH` is absent or `false`
- [ ] Returns `403` when `NODE_ENV=production` regardless of `ENABLE_DEV_AUTH`
- [ ] Staff path: JWT `role` matches the staff's actual role in DB
- [ ] Customer path: repeated calls with same email+tenant return same `customerId` (find-or-create is idempotent via existing `/internal/customers` endpoint)
- [ ] `googleOAuthId` in DB starts with `dev::` — never collides with real Google OAuth IDs (numeric strings)
- [ ] Token is accepted by a subsequent authenticated endpoint (`GET /v1/services`) returning `200`
- [ ] `.http` file works end-to-end: run `managerLogin` → capture token → `GET /v1/services` with `{{managerToken}}`

**Dependencies:** M03-S05 (BFF JWT), M04-S01 (staff by-email endpoint exists)

---

### M115-S03 — InternalApiGuard for unprotected `/internal/*` routes

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/14-API_CONTRACTS.md` § internal endpoints

**Description:**  
Three `/internal/*` controllers rely solely on network topology (backend not publicly exposed). This story adds a shared `InternalApiGuard` that validates an `X-Internal-Key` header on every request, and updates `BackendHttpService` so the BFF automatically includes this key on all backend calls.

`PlatformAdminGuard` on `internal-tenant.controller.ts` (the developer CLI) is **unaffected** — it already protects write operations via `Authorization: Bearer <PLATFORM_ADMIN_KEY>` and serves a separate trust boundary.

**Backend — new guard:**
```
src/shared/guards/internal-api.guard.ts
```
- Reads `X-Internal-Key` header from request
- Compares against `INTERNAL_API_KEY` env var using `crypto.timingSafeEqual` (same pattern as `PlatformAdminGuard`)
- Returns `401` with RFC 9457 body on mismatch

**Apply `@UseGuards(InternalApiGuard)` to (controller level):**
- `platform/infrastructure/controllers/internal-tenant-read.controller.ts`
- `customer/infrastructure/controllers/internal-customer.controller.ts`
- `staff/infrastructure/controllers/internal-staff.controller.ts`

**New env vars:**
```
# backend
INTERNAL_API_KEY=<min-32-chars>

# bff
INTERNAL_API_KEY=<same-value>
```

Added to both `apps/backend/src/config/env.validation.ts` and `apps/bff/src/config/env.validation.ts` as `z.string().min(32)`.

**BFF — propagate key on all backend calls:**

Update `apps/bff/src/shared/http/backend-headers.ts`:
```ts
headers['X-Internal-Key'] = process.env.INTERNAL_API_KEY ?? '';
```

Also update the inline header objects in `BackendHttpService.getForPublic()` and `postForPublic()` — they bypass `buildBackendHeaders()` and need the key added explicitly.

**Acceptance criteria:**
- [ ] Request to `GET /internal/tenants/by-slug/:slug` without `X-Internal-Key` returns `401`
- [ ] Request to `GET /internal/customers` without `X-Internal-Key` returns `401`
- [ ] Request to `GET /internal/staff/by-email` without `X-Internal-Key` returns `401`
- [ ] BFF OAuth callback still resolves tenant + staff/customer correctly after the guard is added (integration test passes unchanged)
- [ ] `INTERNAL_API_KEY` shorter than 32 chars causes backend to refuse to boot
- [ ] Key comparison uses `timingSafeEqual` — no direct string comparison

**Dependencies:** M03-S05 (BackendHttpService established), M02-S03 (env validation pattern)

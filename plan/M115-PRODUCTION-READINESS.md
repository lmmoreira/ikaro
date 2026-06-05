# M115 — Production Readiness

**Phase:** Local Development  
**Goal:** Close three security and developer-experience gaps introduced as explicit MVP shortcuts: replace the plain-string photo-upload contract with a real GCS signed-URL flow; add a dev-only OAuth bypass so developers can test any user persona without a Google redirect; and protect all unguarded `/internal/*` backend routes with a shared API key guard.  
**Depends on:** M10 (all stories done), M03-S05 (BFF auth), M00-S06 (GCS adapter)  
**Blocks:** M12 (staging/production deployment)

---

## Stories

---

### M115-S01 — GCS Signed URL endpoint for photo uploads ✅ Done

> Moved from M10-S02. M10-S01 accepts `afterServicePhotoUrls` as plain strings (good enough for backend logic); this story wires the actual upload mechanism the frontend needs.

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/14-API_CONTRACTS.md` § media endpoints, `docs/23-INFRASTRUCTURE_SETUP.md` § GCS emulator

**Description:**  
Photos (before-service from customer/guest, after-service from staff) are uploaded directly from the browser to GCS using a pre-signed URL, avoiding routing large files through the backend. Locally, the service points to the GCS emulator (`http://localhost:4443`).

Four upload scenarios are covered by one endpoint:

| # | Who | Auth | `bookingId`? | Path generated |
|---|---|---|---|---|
| 1 | Authenticated customer | CUSTOMER JWT | ❌ | `tenants/<tenantId>/uploads/<uuid>/<fileName>` |
| 2 | Guest (initial booking) | None — `tenantSlug` in body | ❌ | `tenants/<tenantId>/uploads/<uuid>/<fileName>` |
| 3 | Guest (submit-info) | Guest token in body (`@Public()`) | ✅ | `tenants/<tenantId>/bookings/<bookingId>/<fileName>` |
| 4 | Staff / Manager | STAFF/MANAGER JWT | ✅ | `tenants/<tenantId>/bookings/<bookingId>/<fileName>` |

Hotsite image uploads (logo, hero background, gallery — UC-027/M12-S02) reuse `IStorageService` but the BFF endpoint for that is a separate story in M12.

**Infrastructure — new package + docker changes:**
- Add `@google-cloud/storage` to `apps/backend/package.json`
- `docker/docker-compose.yml` — add `-external-url http://localhost:4443` to the `gcs-emulator` command so the emulator embeds its own address in signed URLs
- Add `docker/fake-service-account.json` — a valid-structure (but fake) service account key used only with the emulator; committed to the repo
- Add `GCS_KEY_FILE=docker/fake-service-account.json` to `.env.example` and backend `env.validation.ts` as `z.string().optional()`

**Backend — `IStorageService` port + `GcsSignedUrlService` adapter:**
```
src/shared/ports/storage.service.port.ts
src/shared/infrastructure/gcs-signed-url.service.ts
```
- Port method (generic — path construction is the caller's responsibility):
  ```ts
  generateSignedUrl(storagePath: string, contentType: string, operation: 'write'): Promise<string>
  ```
- `GcsSignedUrlService` constructor: reads `GCS_EMULATOR_HOST`, `GCS_BUCKET_NAME`, `GCS_KEY_FILE` from config; when `GCS_EMULATOR_HOST` is set passes it as `apiEndpoint` to the `Storage` constructor
- `onApplicationBootstrap()`: if `GCS_EMULATOR_HOST` is set, auto-creates the `GCS_BUCKET_NAME` bucket (idempotent — skips if already exists)
- Returns signed URL valid for 15 minutes
- **Security — content-type lock:** passes `contentType` as the `Content-Type` condition in the GCS V4 signed URL options so GCS itself rejects any `PUT` where the browser sends a mismatched `Content-Type` header
- **Security — file size cap:** embeds a `content-length-range` condition (0 – 10 MB) in the signed URL so GCS rejects uploads exceeding 10 MB at the infrastructure level, independent of the backend

**Backend — REST controller:**
```
src/contexts/booking/infrastructure/controllers/booking-attachments.controller.ts
```
- `POST /v1/bookings/attachments/signed-url`
- Accepts `TenantContext` (from `TenantInterceptor`)
- Validates `fileName` (no `..` or `/`), `contentType` (`image/jpeg` | `image/png`)
- Path construction:
  - `bookingId` present → verify booking belongs to `tenantId` (+ `actorId` if STAFF/MANAGER) → path = `tenants/<tenantId>/bookings/<bookingId>/<fileName>`
  - `bookingId` absent → path = `tenants/<tenantId>/uploads/<uuidv7>/<fileName>`
- Calls `IStorageService.generateSignedUrl(storagePath, contentType, 'write')`
- Returns `{ signedUrl, filePath, expiresAt }`

**BFF endpoint:** `POST /v1/bookings/attachments/signed-url`

Single endpoint, four auth paths:

```
// Scenario 1 — authenticated customer (before-photos, no booking yet)
JWT (CUSTOMER role) present, bookingId absent
→ tenantId from JWT; path = uploads/<uuid>/

// Scenario 2 — guest (before-photos, initial booking, no JWT)
No JWT; tenantSlug in body
→ BFF resolves tenantId via GET /internal/tenants/by-slug/:slug
→ path = uploads/<uuid>/

// Scenario 3 — guest (submit-info photos, booking exists)
@Public(); guestToken in body; bookingId in body
→ BFF verifies guestToken (same pattern as PATCH /:id/submit-info/guest)
→ path = bookings/<bookingId>/

// Scenario 4 — staff / manager (after-photos, booking exists)
JWT (STAFF|MANAGER role) present, bookingId in body
→ tenantId + actorId from JWT; backend verifies ownership
→ path = bookings/<bookingId>/
```

- Body:
  ```ts
  {
    fileName: string                            // required
    contentType: 'image/jpeg' | 'image/png'    // required
    bookingId?: uuid                            // scenarios 3 + 4
    tenantSlug?: string                         // scenario 2 only
    guestToken?: string                         // scenario 3 only
  }
  ```
- Returns: `{ signedUrl, filePath, expiresAt }`
- **Security — rate limiting:** `@Throttle({ default: { limit: 10, ttl: 60_000 } })` on this endpoint (10 requests/minute per IP). Tighter than the project default because scenario 2 is fully public — anyone who knows a `tenantSlug` can call it without a JWT.

**Photo upload handoff (3-step frontend contract):**
1. `POST /v1/bookings/attachments/signed-url` → receive `{ signedUrl, filePath }`
2. Browser uploads file directly: `PUT <signedUrl>` (no backend involved)
3. Include `filePath` (not `signedUrl`) in the booking request body

`filePath` is what the backend stores — fresh read-signed URLs are generated at display time, never stored.

**`CompleteBookingUseCase` + BFF — enforce `filePath` format:**
- `complete-booking.dto.ts`: `afterServicePhotoUrls` tightened from `z.string()` to:
  ```ts
  z.string().regex(/^tenants\/[^/]+\/bookings\/[^/]+\/.+$/)
  ```
- BFF `CompleteBookingBodySchema`: same regex applied to `afterServicePhotoUrls`

**Acceptance criteria:**
- [ ] Endpoint returns `{ signedUrl, filePath, expiresAt }` — `expiresAt` is 15 minutes from now
- [ ] `fileName` containing `../` or `/` is rejected with `400`
- [ ] Content type other than `image/jpeg` / `image/png` returns `400`
- [ ] Scenario 1 (authenticated customer, no bookingId): path is `tenants/<tenantId>/uploads/<uuid>/<fileName>`
- [ ] Scenario 2 (guest, tenantSlug in body, no JWT): same path shape; `tenantSlug` resolves correctly to `tenantId`
- [ ] Scenario 3 (guest with guestToken + bookingId): path is `tenants/<tenantId>/bookings/<bookingId>/<fileName>`; invalid or expired guestToken returns `401`
- [ ] Scenario 4 (STAFF/MANAGER + bookingId): path is `tenants/<tenantId>/bookings/<bookingId>/<fileName>`; bookingId belonging to a different tenant returns `404`
- [ ] Integration test: call endpoint (scenario 4) → `PUT` file to signed URL on GCS emulator → assert upload succeeds (HTTP 200 from emulator)
- [ ] `afterServicePhotoUrls` on `CompleteBookingUseCase` rejects values not matching the `tenants/.../bookings/.../` format with `400`
- [ ] GCS emulator bucket `beloauto-local` is auto-created on `onApplicationBootstrap()` when `GCS_EMULATOR_HOST` is set
- [ ] `docker-compose` signed URLs point to `http://localhost:4443` (not `storage.googleapis.com`)
- [ ] Rate limit: 11th request within 60 s from same IP returns `429`
- [ ] Signed URL embeds `content-length-range` (0–10 MB) — GCS emulator rejects a `PUT` with body exceeding 10 MB
- [ ] Signed URL is locked to the requested `contentType` — GCS emulator rejects a `PUT` with a mismatched `Content-Type` header

**Dependencies:** M10-S01, M03-S05, M00-S06

---

### M115-S02 — Dev Login BFF endpoint ✅ Done

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

---

### M115-S04 — Rename `guest*` → `contact*` on Booking aggregate, events, and DB columns (tech debt) ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Booking context, `docs/03-DOMAIN_EVENTS.md` § Booking events

**Description:**  
The four `guest*` fields on the `Booking` aggregate (`guestEmail`, `guestName`, `guestPhone`, `guestAddress`) are naming artefacts from when only anonymous guest bookings existed. When an authenticated customer books (UC-002), `RequestAuthenticatedBookingUseCase` reads the customer's contact details and stores them in these fields — so they work correctly for both personas, but the names are misleading. This story renames all four to `contact*` throughout: aggregate, domain events, notification handlers and DTOs, TypeORM entity, DB columns, BFF types and schemas, shared types package, test builders, and all docs.

**No functional change** — pure rename. Behaviour, validation, and notification delivery are identical before and after.

**DB approach:** The local dev database is disposable. Edit the existing booking migration and notification seed migration directly rather than adding ALTER TABLE migrations. Drop and recreate the DB after the rename.

**Rename map:**

| Old | New | DB column |
|---|---|---|
| `guestEmail` | `contactEmail` | `guest_email` → `contact_email` |
| `guestName` | `contactName` | `guest_name` → `contact_name` |
| `guestPhone` | `contactPhone` | `guest_phone` → `contact_phone` |
| `guestAddress` | `contactAddress` | `guest_address` → `contact_address` |

---

**Scope:**

**Backend — `Booking` aggregate (`booking.aggregate.ts`):**
- `BookingProps`: rename all 4 fields
- `RequestBookingInput`: rename all 4 fields
- 4 getters: `get guestEmail()` → `get contactEmail()`, etc.
- `create()` + `reconstitute()`: rename all 4 params
- All `addDomainEvent()` call sites that pass `guestEmail`, `guestName` (and `guestPhone`, `guestAddress` in BookingRequested)

**Backend — domain events (`booking/domain/events/`):**
- `booking-requested.event.ts` — all 4 fields
- `booking-approved.event.ts`, `booking-cancelled.event.ts`, `booking-completed.event.ts`, `booking-info-requested.event.ts`, `booking-rejected.event.ts`, `booking-rescheduled.event.ts` — `contactEmail`, `contactName` in each

**Backend — application layer:**
- `request-booking.dto.ts` — all 4 fields
- `submit-guest-booking-info.dto.ts` — `guestEmail` → `contactEmail` (**filename stays** — "guest" refers to the unauthenticated booking flow, not the contact field)
- `request-booking.use-case.ts`, `request-authenticated-booking.use-case.ts` — all 4 fields
- `submit-booking-info.use-case.ts`, `submit-guest-booking-info.use-case.ts` — `contactEmail`
- `get-booking.use-case.ts` result type — `contactEmail`, `contactName`, `contactPhone`
- `list-bookings.use-case.ts` result type — `contactEmail`, `contactName`
- `booking-reminder.job.ts` — `booking.contactEmail`, `booking.contactName`
- `admin-schedule-reminder.job.ts` — `booking.contactName`, `booking.contactPhone`

**Backend — infrastructure:**
- `booking.controller.ts` — `body.contactEmail`
- `booking.entity.ts` — rename all 4 properties; update `@Column` decorators to `{ name: 'contact_*' }`
- `typeorm-booking.repository.ts` — `toDomain` and `toEntity` mappers (8 references)
- `1748000000014-CreateBookingBookings.ts` — rename `guest_email/name/phone/address` → `contact_email/name/phone/address` in the DDL

**Backend — notification context:**
- `base-guest-notification.dto.ts` → **rename file** to `base-contact-notification.dto.ts`; rename class `BaseGuestNotificationDto` → `BaseContactNotificationDto`; rename fields `guestEmail` → `contactEmail`, `guestName` → `contactName`
- All 6 notification use-case files — `dto.contactEmail`, `dto.contactName`; update template context keys from `{ guestName: dto.guestName }` → `{ contactName: dto.contactName }`
- All 6 notification handler files — `event.data.contactEmail`, `event.data.contactName`
- `1748100000010-CreateNotificationTemplates.ts` — replace `{{guestName}}` → `{{contactName}}` in all seeded template HTML bodies

**Backend — test builders (14 files):**
- `booking.builder.ts` — all 4 fields; `withGuestEmail()` → `withContactEmail()`, etc.
- `booking-entity.builder.ts` — same
- `booking-requested-event.builder.ts` — all 4 fields and methods
- `booking-approved/cancelled/info-requested/rejected/rescheduled-event.builder.ts` (5 files) — `contactEmail`, `contactName`; `withGuestEmail()` → `withContactEmail()`
- 6 notification DTO builders — `contactEmail`, `contactName`; `withGuestEmail()` → `withContactEmail()`

**Backend — spec files (~20 files):**
`booking.spec.ts`, `request-booking.use-case.spec.ts`, `request-authenticated-booking.use-case.spec.ts`, `submit-guest-booking-info.use-case.spec.ts`, `get-booking.use-case.spec.ts`, `booking.controller.spec.ts`, `booking.controller.integration.spec.ts`, `booking.repository.integration.spec.ts`, `typeorm-booking.repository.spec.ts`, all 6 notification use-case spec files, all 6 notification handler spec files, `booking-full-workflow.handler.integration.spec.ts`, `booking-completed.handler.spec.ts` (loyalty)

**BFF:**
- `bookings.types.ts` — `contactName`, `contactEmail`, `contactPhone` in `BookingDetailResponse` and `BookingListItem`
- `bookings.controller.ts` — Zod schema fields in `RequestBookingBodySchema` (all 4) and `SubmitGuestInfoSchema` (`contactEmail`); `payload.contactEmail` mapping
- `bookings.controller.spec.ts` + `bookings.controller.component.spec.ts`
- `http/bookings/bookings.http` — all JSON request bodies

**Shared packages:**
- `packages/types/src/booking.dto.ts` — `contactName`, `contactEmail`, `contactPhone`

**HTTP files:**
- `apps/backend/http/booking/bookings.http` — all JSON request bodies

**Docs (10 files):**
- `docs/02-DOMAIN_MODEL.md` — `BookingProps` table, `requestBooking()` signature, defaultAddress note
- `docs/03-DOMAIN_EVENTS.md` — all 7 event payload definitions
- `docs/04-USE_CASES.md` — UC-001 steps 2, 11; UC-002 steps 1, 7, 8
- `docs/13-DATABASE_SCHEMA.md` — rename column entries to `contact_*`
- `docs/14-API_CONTRACTS.md` — request body examples and field descriptions
- `docs/05-BOUNDED_CONTEXTS.md` — `event.guestEmail` code snippet (line ~578)
- `docs/AGENT_PATTERNS.md` — `{ guestName: 'Ana', … }` example (line ~818)
- `docs/CODE_STANDARDS.md` — `guestPhone` validation example (line ~122)
- `docs/QUICK_REFERENCE.md` — field list (line ~115)
- `plan/M115-PRODUCTION-READINESS.md` — this file (already updated)

---

**Acceptance criteria:**
- [ ] All 4 `contact*` getters exist on `Booking`; no `guest*` getter or property remains anywhere in `apps/` or `packages/`
- [ ] All 8 domain events carry `contactEmail` + `contactName` in `data`; `BookingRequested` also carries `contactPhone` + `contactAddress`; no `guest*` field in any event interface
- [ ] All notification handlers read `event.data.contactEmail` / `event.data.contactName`; all notification use cases pass `contactName:` as the template context key
- [ ] DB columns are `contact_email`, `contact_name`, `contact_phone`, `contact_address`; `booking.entity.ts` `@Column` decorators reference `contact_*` names
- [ ] Notification templates use `{{contactName}}`; existing seed migration updated in place
- [ ] `base-contact-notification.dto.ts` replaces `base-guest-notification.dto.ts`; no import of the old path anywhere
- [ ] `submit-guest-booking-info.dto.ts` filename unchanged; only the `guestEmail` field inside renamed to `contactEmail`
- [ ] `pnpm type-check` clean across backend, BFF, and packages
- [ ] All existing unit and integration tests pass with zero functional change
- [ ] `grep -r "guestEmail\|guestName\|guestPhone\|guestAddress" apps/ packages/` returns zero matches

**Dependencies:** M10-S01 (all booking events established), M11-S07 (notification handlers stable)

# M115 — Production Readiness: Implementation Details (IA Reference)

> Token-efficient reference for AI agents. No prose. Load when working on M116+ tasks that touch GCS upload, dev auth, internal API guard, or the contact* rename.

---

## Artifacts Table

| Story | Artifact | Path | Notes |
|---|---|---|---|
| S01 | Storage port | `src/shared/ports/storage.service.port.ts` | Token: `STORAGE_SERVICE`; interface: `IStorageService` |
| S01 | GCS adapter | `src/shared/infrastructure/gcs-signed-url.adapter.ts` | `GcsSignedUrlAdapter` (not `…Service`) |
| S01 | Storage module | `src/shared/infrastructure/storage.module.ts` | `useClass` (not `useExisting`) — critical for test override |
| S01 | Attachments controller | `src/contexts/booking/infrastructure/controllers/booking-attachments.controller.ts` | `POST /v1/bookings/attachments/signed-url` |
| S01 | In-memory stub | `src/test/infrastructure/in-memory-storage.service.ts` | Default override in both booking + notification integration app helpers |
| S01 | Booking integration app | `src/test/utils/booking-integration-app.ts` | Default-overrides `STORAGE_SERVICE`; accepts `overrideProviders` |
| S01 | Notification integration app | `src/test/utils/notification-integration-app.ts` | Also default-overrides `STORAGE_SERVICE` (BookingModule pulled via extraModules) |
| S01 | Guest token utils | `src/contexts/bff/…/guest-token.util.ts` | Exports `tryDecodeRawJwt` + `verifyGuestToken`; `tryVerifyGuestToken` was removed |
| S02 | Dev login controller | `apps/bff/src/auth/dev-login.controller.ts` | `POST /auth/dev-login`; `@Public()` |
| S02 | Dev login HTTP file | `apps/bff/test/dev-auth.http` | Self-contained; captures `@managerToken`/`@customerToken` |
| S03 | Internal API guard | `src/shared/guards/internal-api.guard.ts` | SHA-256 + `timingSafeEqual`; registered via `APP_GUARD` in `AppModule` |
| S03 | App module | `src/app.module.ts` | `{ provide: APP_GUARD, useClass: InternalApiGuard }` in `providers` |
| S03 | BFF http service | `apps/bff/src/shared/http/backend-http.service.ts` | `X-Internal-Key` in private `headers()` + explicit in all `*ForPublic` methods |
| S04 | Booking aggregate | `src/contexts/booking/domain/booking.aggregate.ts` | All 4 `contact*` getters; no `guest*` remains |
| S04 | Contact notification DTO | `src/contexts/notification/…/base-contact-notification.dto.ts` | Replaces `base-guest-notification.dto.ts` |
| S04 | Booking migration | `src/contexts/booking/infrastructure/migrations/…-CreateBookingBookings.ts` | Edited in place: columns `contact_email/name/phone/address` |
| S04 | Notification seed migration | `src/contexts/notification/infrastructure/migrations/…-CreateNotificationTemplates.ts` | `{{guestName}}` → `{{contactName}}` in all templates |

---

## S01 — GCS Signed URL

### 3-step upload contract
1. `POST /v1/bookings/attachments/signed-url` → `{ signedUrl, filePath, expiresAt }`
2. Browser `PUT <signedUrl>` directly (never through backend)
3. Caller stores/sends `filePath` (not `signedUrl`)

### Four auth scenarios (one endpoint)
| # | Actor | JWT? | bookingId? | Path |
|---|---|---|---|---|
| 1 | Customer | ✅ | ❌ | `tenants/<tid>/uploads/<uuid>/<file>` |
| 2 | Guest (new booking) | ❌ | ❌ | same; `tenantSlug` in body → BFF resolves tenantId |
| 3 | Guest (submit-info) | ❌ guest token | ✅ | `tenants/<tid>/bookings/<bid>/<file>` |
| 4 | Staff/Manager | ✅ | ✅ | `tenants/<tid>/bookings/<bid>/<file>` |

### BFF `@Public()` + `postForPublic()` rule
Scenario 2 BFF endpoint is `@Public()` — `req.user` is `undefined` inside. **Never** call `post()` (sends empty `X-Tenant-ID` → 400). Use `postForPublic(path, body, tenantId)` which sets the header explicitly.

### `StorageModule` — `useClass` not `useExisting`
`useExisting` registers `GcsSignedUrlAdapter` as a standalone class provider in addition to the `STORAGE_SERVICE` token. When tests override `STORAGE_SERVICE`, the standalone class entry is still instantiated and `onApplicationBootstrap()` runs, trying to connect to `localhost:4443`. The fix is `useClass` — overriding the token then prevents instantiation entirely.

### `GcsSignedUrlAdapter.onApplicationBootstrap()`
```ts
if (!this.emulatorHost) return;  // production-safe: no-op when GCS_EMULATOR_HOST is unset
await bucket.exists() → createBucket() if missing
```
Only runs when `GCS_EMULATOR_HOST` is set. In CI (no env var) it is a no-op.

### Integration test default overrides
Both `createBookingIntegrationApp()` and `createNotificationIntegrationApp()` default-override `STORAGE_SERVICE` with `new InMemoryStorageService()`. Attachment-specific specs pass a custom instance via `overrideProviders` (booking app) or `configure` callback (notification app) — that call runs after the default, replacing it.

### Env vars (backend)
```
GCS_EMULATOR_HOST=http://localhost:4443   # optional; enables emulator path
GCS_BUCKET_NAME=beloauto-local           # optional; defaults to 'beloauto-local'
GCS_KEY_FILE=docker/fake-service-account.json  # optional; fake key for emulator
```

---

## S02 — Dev Login

### Guard logic (in series)
```ts
if (config.get('ENABLE_DEV_AUTH') !== 'true') throw ForbiddenException
if (config.get('NODE_ENV') === 'production')  throw ForbiddenException
```

### Customer find-or-create `googleOAuthId` prefix
`dev::${email}` — Google issues numeric OAuth IDs; the `dev::` string prefix can never collide.

### `@Body` pipe placement
`@Body(new ZodValidationPipe(DevLoginSchema))` — never `@UsePipes` at method level (breaks `@CurrentUser()`).

### Env vars (BFF)
```
ENABLE_DEV_AUTH=true    # absent or false = disabled
```

---

## S03 — InternalApiGuard

### Registration pattern
```ts
// app.module.ts providers array
{ provide: APP_GUARD, useClass: InternalApiGuard }
```
**Never** `app.useGlobalGuards(new InternalApiGuard(...))` in `main.ts` — bypasses DI, `ConfigService` injection fails.

### Guard implementation
```ts
const incoming = Buffer.from(crypto.createHash('sha256').update(header).digest('hex'));
const stored   = Buffer.from(crypto.createHash('sha256').update(INTERNAL_API_KEY).digest('hex'));
if (!crypto.timingSafeEqual(incoming, stored)) throw UnauthorizedException (RFC 9457)
```

### BFF propagation
`headers()` private method in `BackendHttpService`:
```ts
{ ...buildBackendHeaders(this.req), 'X-Internal-Key': this.config.getOrThrow('INTERNAL_API_KEY') }
```
`getForPublic`, `postForPublic`, `patchForPublic` build headers inline — key added explicitly to each.

### Integration test wiring
```ts
beforeAll(async () => {
  process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;   // must be set BEFORE createXxxIntegrationApp()
  ({ app } = await createXxxIntegrationApp({
    extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
  }));
});
afterAll(async () => {
  await app.close();
  delete process.env['INTERNAL_API_KEY'];
});
```

### CI env block (BFF component tests)
`INTERNAL_API_KEY` must be listed in the `env:` block of the `bff-component` CI job — no `.env` file exists in the runner.

### `PlatformAdminGuard` layering
`POST /internal/tenants` requires **both**: global `InternalApiGuard` (X-Internal-Key) then `PlatformAdminGuard` (Authorization Bearer). Both must pass.

### Env vars (both apps)
```
INTERNAL_API_KEY=<openssl rand -hex 32>   # min 32 chars; same value in backend + bff
```

---

## S04 — `guest*` → `contact*` rename

### Rename map
| Old field | New field | DB column |
|---|---|---|
| `guestEmail` | `contactEmail` | `contact_email` |
| `guestName` | `contactName` | `contact_name` |
| `guestPhone` | `contactPhone` | `contact_phone` |
| `guestAddress` | `contactAddress` | `contact_address` |

### What changed / what did NOT change
- **Filename unchanged:** `submit-guest-booking-info.dto.ts` — "guest" refers to the unauthenticated flow, not the field
- **Filename changed:** `base-guest-notification.dto.ts` → `base-contact-notification.dto.ts`
- **Template variable:** `{{guestName}}` → `{{contactName}}` in notification seed migration
- **DB approach:** existing migration edited in place (local DB is disposable); no ALTER TABLE migration added
- **Functional change:** none — pure rename

### Grep to verify zero leftovers
```bash
grep -r "guestEmail\|guestName\|guestPhone\|guestAddress" apps/ packages/
```

---

## Anti-patterns recorded in this milestone

| Pattern | Fix |
|---|---|
| `StorageModule` with `useExisting` registers adapter as standalone class — token override doesn't prevent instantiation | Use `useClass` |
| `@Public()` BFF endpoint calling `post()` → empty `X-Tenant-ID` → 400 | Use `postForPublic(path, body, tenantId)` |
| `APP_GUARD` on individual controllers instead of `AppModule` providers | Register `{ provide: APP_GUARD, useClass: Guard }` in `AppModule.providers` |
| `GCS_EMULATOR_HOST` set locally but GCS fake not running → `onApplicationBootstrap` crashes integration tests | `createBookingIntegrationApp()` and `createNotificationIntegrationApp()` default-override `STORAGE_SERVICE` with `InMemoryStorageService` |

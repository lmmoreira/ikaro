# M115 — Production Readiness: Implementation Details (Developer Reference)

> Detailed learning document for the human developer. Explains every concept with rationale, real code from this codebase, and enough context to understand the engineering patterns used.

---

## Overview

M115 closed four production-readiness gaps left as explicit shortcuts in earlier milestones:

| Story | What it fixed |
|---|---|
| S01 | Photo uploads through the backend (memory/bandwidth waste) → direct GCS signed-URL upload |
| S02 | Google OAuth redirect required for every local test persona switch → instant dev login endpoint |
| S03 | `/internal/*` routes protected only by network topology → cryptographic shared-secret guard on every route |
| S04 | `guestEmail/Name/Phone/Address` field names confused guest vs. contact semantics → renamed to `contactEmail/Name/Phone/Address` |

---

## S01 — GCS Signed URL Photo Upload

### Why signed URLs?

The naive alternative — `POST /bookings/:id/photos` with a `multipart/form-data` body — routes every file upload through the NestJS process: the backend reads the binary from the request, forwards it to GCS, and responds. This wastes:
- Memory: the full file is in RAM during the transfer
- Bandwidth: the file travels backend → GCS (even though the browser already has it)
- CPU time: buffering and re-streaming

A signed URL is a pre-authorised GCS request URL. The backend generates it, hands it to the browser, and the browser uploads directly to GCS. The backend never sees the file bytes.

### The 3-step contract

```
Browser                     BFF/Backend                       GCS
  │                              │                              │
  │─ POST /attachments/signed-url ▶│                              │
  │◀─ { signedUrl, filePath } ────│                              │
  │                              │                              │
  │─────────── PUT <signedUrl> ──────────────────────────────────▶│
  │◀─────────────────────────── 200 OK ──────────────────────────│
  │                              │                              │
  │─ POST /bookings { afterServicePhotoUrls: [filePath] } ──────▶│
```

The backend stores `filePath` (a GCS object key), never the signed URL. Fresh read-signed URLs are generated at display time.

### `IStorageService` port — why in `shared/`?

The storage port lives in `src/shared/ports/storage.service.port.ts` rather than inside the booking context because M12 (hotsite images) will also use it. A port in `shared/` is importable by any context. If it were inside `booking/application/ports/`, the hotsite context would have to violate context-isolation rules to import it.

```ts
// src/shared/ports/storage.service.port.ts
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface GenerateSignedUrlResult {
  signedUrl: string;
  expiresAt: Date;
}

export interface IStorageService {
  generateSignedUrl(
    storagePath: string,
    contentType: string,
    operation: 'write',
  ): Promise<GenerateSignedUrlResult>;
}
```

The method takes `storagePath` — the caller constructs the path. This keeps the adapter generic: it knows nothing about tenants, bookings, or path conventions. Path logic lives in the use case / controller where those concepts exist.

### `StorageModule` — `useClass` vs `useExisting`

The initial implementation of `StorageModule` used this pattern:

```ts
// ❌ WRONG — causes test isolation failure
providers: [
  GcsSignedUrlAdapter,
  { provide: STORAGE_SERVICE, useExisting: GcsSignedUrlAdapter }
]
```

`useExisting` means "when `STORAGE_SERVICE` is requested, return the same instance as `GcsSignedUrlAdapter`". But NestJS still registers `GcsSignedUrlAdapter` as its **own** class provider and instantiates it unconditionally.

The consequence: when tests do `overrideProvider(STORAGE_SERVICE).useValue(stub)`, they replace the `STORAGE_SERVICE` token — but `GcsSignedUrlAdapter` is still instantiated as a standalone provider. Its `onApplicationBootstrap()` then tries to connect to `localhost:4443`.

The fix is `useClass`:

```ts
// ✅ CORRECT
providers: [{ provide: STORAGE_SERVICE, useClass: GcsSignedUrlAdapter }]
```

Now NestJS only instantiates `GcsSignedUrlAdapter` when something requests the `STORAGE_SERVICE` token. Overriding the token in tests prevents instantiation entirely.

### `onApplicationBootstrap()` — emulator bucket auto-creation

```ts
async onApplicationBootstrap(): Promise<void> {
  if (!this.emulatorHost) return;     // no-op in production / CI (env var absent)
  const bucket = this.storage.bucket(this.bucketName);
  const [exists] = await bucket.exists();
  if (!exists) {
    await this.storage.createBucket(this.bucketName);
  }
}
```

This guard (`if (!this.emulatorHost) return`) is crucial. In production and CI, `GCS_EMULATOR_HOST` is never set, so the lifecycle hook exits immediately with zero network activity. Only local Docker development hits the GCS fake server.

### Integration test `STORAGE_SERVICE` default override

Before M115, any booking integration test that ran without Docker would fail with:
```
FetchError: request to http://localhost:4443/storage/v1/b/ikaro-local?
```

The root fix was already in `StorageModule` (useClass). But even with that, if the token is not overridden, the real adapter is used. `createBookingIntegrationApp()` and `createNotificationIntegrationApp()` now apply a default override:

```ts
let builder = Test.createTestingModule({ ... })
  .overrideProvider(EVENT_BUS)
  .useValue(routingBus)
  .overrideProvider(STORAGE_SERVICE)          // ← default override
  .useValue(new InMemoryStorageService());    // ← no GCS calls ever

// caller's overrideProviders run AFTER, so they win if they override STORAGE_SERVICE again
for (const { provide, useValue } of overrideProviders) {
  builder = builder.overrideProvider(provide).useValue(useValue);
}
```

The attachment-specific integration spec passes its own `InMemoryStorageService` instance (so the test can inspect `uploadedPaths`). Because the caller's loop runs after the default, the custom instance wins for that test.

### BFF `@Public()` + `postForPublic()` — the anti-pattern

Scenario 2 (guest before-photos, no JWT) is a `@Public()` endpoint. `@Public()` tells `JwtAuthGuard` to skip JWT verification, which means `req.user` is `undefined` inside the handler.

`BackendHttpService.post()` reads `req.user` to extract `tenantId` and builds `X-Tenant-ID: ${user.tenantId}`. With `req.user` undefined, this becomes `X-Tenant-ID: undefined` → the backend's `TenantInterceptor` rejects it with 400.

The solution is `postForPublic(path, body, tenantId)`, which takes the tenant ID as an explicit parameter:

```ts
// ❌ post() — breaks on @Public() routes
return this.backendHttp.post('/bookings/attachments/signed-url', body);

// ✅ postForPublic() — takes tenantId explicitly
const { id: tenantId } = await this.backendHttp.getForPublic(
  `/internal/tenants/by-slug/${body.tenantSlug}`,
  /* any tenantId placeholder */ ''
);
return this.backendHttp.postForPublic('/bookings/attachments/signed-url', backendBody, tenantId);
```

---

## S02 — Dev Login

### Why not just use the Google OAuth flow?

The OAuth flow requires:
1. A browser redirect to `accounts.google.com`
2. The developer to be logged in to the correct Google account
3. The correct Google account to have a corresponding `Staff` or `Customer` row in the local DB

For development testing you want to instantly switch between 10 different personas (admin, staff, customer in tenant A, customer in tenant B, etc.) without touching a browser. The dev-login endpoint issues a real JWT session for any registered account in under a second.

### Two-guard defence-in-depth

```ts
// Guard 1 — feature flag
if (this.config.get('ENABLE_DEV_AUTH') !== 'true') {
  throw new ForbiddenException('Dev auth is disabled');
}

// Guard 2 — environment check (independent of flag)
if (this.config.get('NODE_ENV') === 'production') {
  throw new ForbiddenException('Dev auth is not available in production');
}
```

Why two guards? The feature flag can be accidentally left as `true` in an `.env` file that gets copied to a staging server. The `NODE_ENV` check is a backstop that catches that scenario regardless of the flag. Each guard is independently sufficient to block the endpoint.

### Customer `googleOAuthId` — the `dev::` prefix

When a customer logs in via Google, their `googleOAuthId` is a numeric string like `"117834921847"`. The dev-login endpoint creates customers with `googleOAuthId: 'dev::${email}'` — the `dev::` string prefix means this value can never be mistaken for a real Google sub, even if you query the DB directly.

### `@Body` pipe placement — never `@UsePipes` at method level

```ts
// ❌ WRONG — breaks @CurrentUser() on the same method
@UsePipes(new ZodValidationPipe(DevLoginSchema))
async devLogin(@Body() body: DevLoginDto, @CurrentUser() user?: JwtUser) { ... }

// ✅ CORRECT — pipe runs only on the body parameter
async devLogin(
  @Body(new ZodValidationPipe(DevLoginSchema)) body: DevLoginDto,
) { ... }
```

`@UsePipes` at method level applies before any parameter decorator runs. This breaks `@CurrentUser()` (and other decorators that read from `req`) because the pipe transforms `req.body` before `@CurrentUser()` can read `req.user`. Attaching the pipe to `@Body()` scopes it correctly.

---

## S03 — InternalApiGuard

### The security gap it closes

Before this story, all backend routes — `/internal/*` and `/v1/*` alike — were protected only by network topology: the backend is not publicly exposed. If the network isolation ever fails (misconfigured reverse proxy, Cloud Run IAM misconfiguration, developer port-forwarding), every route is instantly accessible.

Adding a shared secret gives a second independent layer. An attacker who reaches the backend's port still needs the key.

### Why `APP_GUARD` and not `@UseGuards()` per controller?

```ts
// ❌ WRONG — guards must be added manually to every new controller
@UseGuards(InternalApiGuard)
@Controller('bookings')
export class BookingController { ... }

// ✅ CORRECT — every controller is automatically protected, including future ones
// app.module.ts providers:
{ provide: APP_GUARD, useClass: InternalApiGuard }
```

`APP_GUARD` is a NestJS multi-provider token. When registered, NestJS applies the guard globally before every route handler, in provider registration order. DI is fully supported — `ConfigService` is injected normally.

`app.useGlobalGuards(new InternalApiGuard(...))` in `main.ts` would also apply globally but **bypasses NestJS DI**, requiring manual instantiation of all dependencies. Avoid it.

### Timing-safe comparison — why it matters

A naive string comparison `header === storedKey` returns early as soon as it finds a mismatching character. An attacker can measure response times to determine how many leading characters of their guess are correct, eventually reconstructing the key one character at a time (timing attack).

`crypto.timingSafeEqual` always takes the same time regardless of where the strings differ. SHA-256 hashing is applied first to normalise buffer lengths:

```ts
const hash = (s: string) =>
  Buffer.from(crypto.createHash('sha256').update(s).digest('hex'));

if (!crypto.timingSafeEqual(hash(incoming), hash(stored))) {
  throw new UnauthorizedException({ ... });
}
```

### BFF propagation strategy

`BackendHttpService` has two header-building paths:

**Authenticated path** — `headers()` private method, used by `get()`, `post()`, `patch()`, `delete()`:
```ts
private headers(): Record<string, string> {
  return {
    ...buildBackendHeaders(this.req),           // X-Tenant-ID, X-Actor-*, X-Correlation-ID
    'X-Internal-Key': this.config.getOrThrow('INTERNAL_API_KEY'),
  };
}
```

**Public path** — `getForPublic()`, `postForPublic()`, `patchForPublic()` build headers inline (no `req.user`):
```ts
async getForPublic<T>(path: string, tenantId: string, params?: Record<string, string>): Promise<T> {
  return this.call(this.http.get(url, {
    headers: {
      'X-Tenant-ID': tenantId,
      'X-Internal-Key': this.config.getOrThrow('INTERNAL_API_KEY'),
    },
    params,
  }));
}
```

The key is added to every outbound request — no code path to the backend exists without it.

### Integration test wiring

`APP_GUARD` registered in `AppModule` is not present in integration test modules (they build minimal modules). To test that the guard works, tests add it explicitly:

```ts
beforeAll(async () => {
  // Set env BEFORE building the app — ConfigModule reads it at compile time
  process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;

  ({ app } = await createCustomerIntegrationApp({
    extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
  }));
});

afterAll(async () => {
  await app.close();
  delete process.env['INTERNAL_API_KEY'];  // clean up so other suites don't inherit it
});
```

The `process.env` assignment must happen **before** `createXxxIntegrationApp()` is called. NestJS `ConfigModule.forRoot()` merges `{ ...dotenvFileVars, ...process.env }` and passes the result to `validate()`. If the env var is not present at compile time, `validate()` rejects the configuration.

### `PlatformAdminGuard` layering

`POST /internal/tenants` (the developer CLI endpoint) runs **both** guards:
1. `InternalApiGuard` (global, runs first) — checks `X-Internal-Key`
2. `PlatformAdminGuard` (controller-level) — checks `X-Platform-Admin-Key: <PLATFORM_ADMIN_KEY>`

Both must pass. A valid `X-Internal-Key` with a wrong `X-Platform-Admin-Key` header still returns `401`.

---

## S04 — `guest*` → `contact*` rename

### Why the rename was necessary

The fields `guestEmail`, `guestName`, `guestPhone`, `guestAddress` on the `Booking` aggregate store the contact information for the booking — regardless of whether the booker was an anonymous guest or an authenticated customer. When `RequestAuthenticatedBookingUseCase` runs, it reads the customer's profile and populates these same fields. The word "guest" was a historical accident from when only anonymous booking existed. The rename aligns field names with their actual meaning.

### DB approach — edit existing migration in place

New bookings on an existing production schema would require `ALTER TABLE` migrations (expand/contract). But M115 runs before staging deployment; the local dev database is fully disposable. Editing the existing `CreateBookingBookings` migration directly (renaming `guest_*` columns to `contact_*`) avoids an extra migration file and migration history noise. After editing, drop and recreate the local DB:

```bash
# Reset local DB after editing migrations in place
pnpm --filter @ikaro/backend migration:drop
pnpm --filter @ikaro/backend migration:run
```

This pattern is only valid for local development databases and explicitly documented in the story spec. Any schema change in a milestone that targets staging or production must use proper expand/contract migrations.

### Notification template variable rename

Notification templates are seeded by `CreateNotificationTemplates` migration. The template HTML uses `{{guestName}}` (Handlebars-style). After the rename, the seed migration was updated in place to use `{{contactName}}`. All notification use cases pass the value as `{ contactName: dto.contactName }` in the template context object.

### What did NOT change — important for future agents

- **`submit-guest-booking-info.dto.ts` filename**: unchanged. "guest" in this filename refers to the unauthenticated booking _flow_, not the contact field. The field inside (`guestEmail`) was renamed to `contactEmail`, but the file itself stays.
- **All notification handler and use case behaviour**: identical — the rename is purely syntactic.
- **Shared package types** (`packages/types/`): updated to `contactName`, `contactEmail`, `contactPhone` so the web frontend compiles without changes.

---

## Lessons Learned

### `useExisting` vs `useClass` in NestJS modules

`useExisting` is for aliasing an already-registered token. It does not prevent instantiation of the named class — the class is still registered as its own provider and instantiated unconditionally. Use `useClass` when the class should only be instantiated through the token, enabling test overrides to suppress it.

### `onApplicationBootstrap` and lifecycle hooks in tests

NestJS calls lifecycle hooks (`onModuleInit`, `onApplicationBootstrap`) for every provider when `app.init()` is called — including providers that happen to be instantiated through module imports, not just the providers directly listed in the test module. If a lifecycle hook makes a network call, every integration test using that module will require the external service to be running.

The fix is always the same: the test helper must prevent the real adapter from being instantiated, either by overriding the token before `compile()` or by wrapping the lifecycle call in an environment check.

### NestJS `ConfigModule.forRoot()` env timing

`ConfigModule.forRoot()` with a `validate` function reads from `process.env` (and the `.env` file) at **compile time** — when `Test.createTestingModule(...).compile()` is called. Setting `process.env['SOME_KEY'] = value` after `compile()` has no effect on what `ConfigService` returns for that key. Always set env vars before calling `createXxxIntegrationApp()`.

### Integration tests and `APP_GUARD`

`APP_GUARD` registered in `AppModule` does not flow into integration test modules. Integration test modules are self-contained NestJS applications built from scratch by `Test.createTestingModule()`. Any global provider from the real `AppModule` that you want active in a test must be explicitly re-added to the test module's `providers` array. For guards this means `{ provide: APP_GUARD, useClass: MyGuard }`.

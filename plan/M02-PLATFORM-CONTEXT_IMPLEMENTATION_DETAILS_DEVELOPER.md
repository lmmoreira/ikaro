# M02 — Developer Guide (for Leonardo)

**Audience:** You — learning the Platform context, hexagonal architecture, and multi-tenancy foundations built in M02.  
**Style:** Concepts explained with rationale. Why each design decision was made, what it prevents, and how the pieces fit together.  
**AI agents:** Ignore this file — read the `_IA.md` companion instead.

---

## 1. The Big Picture — What M02 Is About

M02 is the foundation everything else builds on. Before any booking, loyalty point, or staff member can exist, there must be a **tenant** — a car-wash company registered on the platform. M02 answers: how do we create a tenant? How does every subsequent request know which tenant it belongs to? How does an admin configure their tenant's behaviour?

M02 built three things:
1. **The Platform domain** — the `Tenant` and `HotsiteConfig` aggregates, with all their business rules
2. **The request context** — the mechanism that makes `WHERE tenant_id = :tenantId` possible on every database query
3. **Two REST endpoints** — provisioning a tenant (UC-024) and editing its settings (UC-026)

---

## 2. Hexagonal Architecture — Why Three Layers?

Every bounded context in Ikaro follows the same folder structure:

```
src/contexts/platform/
├── domain/           # Pure business logic — no frameworks, no DB, no HTTP
├── application/      # Use cases + port interfaces (what the app needs)
└── infrastructure/   # Adapters (TypeORM, NestJS controllers, guards)
```

**The rule:** the `domain/` and `application/` layers never import from `infrastructure/`. The dependency always points inward — infrastructure depends on application, application depends on domain.

**Why?** Because business rules should not depend on implementation details. Consider `TenantSettings.validate()` — it checks that `expiry_warning_days < expiry_days`. This logic has nothing to do with PostgreSQL or NestJS. If we ever switch databases, this rule doesn't change and doesn't break. The domain is the stable core; infrastructure is the replaceable shell.

In practice, this means:
- **Domain errors** (`PlatformDomainError`, `SlugAlreadyTakenError`) are plain TypeScript classes that extend `Error` — zero framework imports.
- **Use cases** receive interfaces (`ITenantRepository`) not concrete implementations (`TypeOrmTenantRepository`). They don't know if storage is a real DB, in-memory, or a mock.
- **Controllers** call use cases only — no business logic leaks into HTTP handlers.

---

## 3. The Tenant Aggregate — Enforcing Business Rules at the Source

The `Tenant` aggregate is the heart of the Platform context. An aggregate is a cluster of domain objects treated as a single unit — you always load and save the whole thing, never individual fields.

```typescript
// Creating a tenant — business rules enforced here
const tenant = Tenant.create('Lavacar Belo', 'lavacar-belo', 'America/Sao_Paulo');
// ↑ Validates: name non-empty, slug matches /^[a-z0-9-]+$/

// Updating settings — inactive tenants cannot be modified
tenant.updateSettings(newSettings);
// ↑ Throws TenantInactiveError if isActive === false

tenant.updateName('Novo Nome');
// ↑ Same inactive guard + empty name guard
```

**Why enforce rules in the aggregate instead of the use case?**  
A use case is one path into the system. A future use case — say, a bulk migration script — could also update settings, and if the rule lived only in the use case, it would be silently bypassed. When the rule lives in `updateSettings()` on the aggregate itself, there is no way to bypass it. It doesn't matter how you got there.

This is the principle: **make invalid state unrepresentable**. A deactivated tenant that has updated settings is not just wrong — it's impossible with the current code.

---

## 4. TenantSettings — A Value Object, Not a Raw JSON Object

`TenantSettings` is a **value object** — it has no identity (no UUID), just a value. Two `TenantSettings` with the same fields are equivalent. Value objects are immutable: updating settings creates a new `TenantSettings` instance, it doesn't mutate the existing one.

```typescript
// Creating from user input — validates everything
const settings = TenantSettings.create({
  loyalty: { expiry_days: 365, ... },
  booking: { cancellation_window_hours: 72, ... },
  ...
});

// Loading from DB — skips validation (data was valid when saved)
const settings = TenantSettings.reconstitute(rawJsonFromDb);
```

**Why two factory methods?** Validating on every DB read would be wasteful and fragile — if a validation rule changes, old data that was valid when saved would fail to load. The `reconstitute()` method trusts the DB. Only `create()`, which handles user input, validates.

**Where the validation rules live:**  
The validation rules in `TenantSettings.validate()` are derived from `docs/21-TENANTS_SETTINGS_SCHEMA.md`. That document is the canonical source. The code implements those rules — it doesn't invent its own.

---

## 5. TenantContext — How Every Request Knows Its Tenant

This was the most architecturally interesting part of M02. When a request comes in asking to update a tenant's settings, how does the `UpdateTenantSettingsUseCase` know which tenant's settings to update?

**The naive approach:** pass `tenantId` as a parameter through every function call:
```typescript
bookingRepo.findAllByTenant(tenantId, filters) // controller → use case → repo
```

**The problem:** every single method in every context needs an extra `tenantId` parameter. It's repetitive noise.

**What we built instead:** `TenantContext` — a request-scoped container powered by Node's `AsyncLocalStorage`.

```typescript
// TenantInterceptor wraps each request:
runWithTenantContext(tenantId, correlationId, () => {
  next.handle().subscribe(subscriber);
});

// Anywhere in the call chain, get the current tenant:
const tenantId = this.tenantContext.tenantId;
```

`AsyncLocalStorage` is Node's mechanism for carrying data through an async call chain without explicit passing. Think of it like a thread-local variable in Java — anything that runs within the same async context (same request) sees the same stored values.

**Why not request-scoped NestJS providers?**  
NestJS's `Scope.REQUEST` works, but it forces every service that injects a request-scoped provider to also become request-scoped, which propagates through the entire dependency graph. AsyncLocalStorage has no such viral effect — you can inject `TenantContext` into a singleton service and it still reads from the correct request's storage.

**The bypass for internal/health routes:**  
`POST /internal/tenants` doesn't have a tenant (it creates one). The `TenantInterceptor` skips routes starting with `/health` or `/internal` — no `X-Tenant-ID` header required for those paths.

---

## 6. Provisioning a Tenant — Two Aggregates, One Transaction

When a new tenant is provisioned (UC-024), two things must happen:
1. A `Tenant` row is created
2. A `HotsiteConfig` row is created for that tenant

Both must succeed or neither should. If the Tenant saves but the HotsiteConfig fails (disk full, constraint violation, whatever), we'd have an orphaned tenant with no hotsite configuration — an invalid state.

```typescript
await this.txManager.run(async () => {
  await this.tenantRepo.save(tenant);
  await this.hotsiteRepo.save(config);   // if this fails, tenantRepo.save rolls back
});
```

`ITransactionManager.run()` wraps both saves in a PostgreSQL transaction. Either both commit or both roll back. The `TypeOrmTransactionManager` adapter uses `DataSource.transaction()` with `AsyncLocalStorage` to propagate the active `EntityManager` through the call chain — repository write methods automatically use the transaction's entity manager if one is active.

---

## 7. The Platform Admin Guard — Securing an Internal Endpoint

`POST /internal/tenants` is not a user-facing endpoint — it's called by operators to provision a new car-wash company. It's protected by a pre-shared API key (`PLATFORM_ADMIN_KEY`).

Comparing secret keys is tricky. A naive comparison `token === storedKey` is vulnerable to a **timing attack**: the `===` operator stops comparing as soon as it finds the first character mismatch. An attacker making thousands of requests can measure the response time and guess the key one character at a time.

The fix: `crypto.timingSafeEqual()` — a comparison that always takes the same time regardless of where the mismatch is. But it requires equal-length buffers. Rather than padding, we hash both sides with SHA-256 first:

```typescript
const storedHash = crypto.createHash('sha256').update(storedKey).digest();
const incomingHash = crypto.createHash('sha256').update(token ?? '').digest();

if (!crypto.timingSafeEqual(storedHash, incomingHash)) {
  throw new UnauthorizedException(...);
}
```

Both hashes are always 32 bytes — equal length, constant time.

---

## 8. UC-026 — Editing Settings with Partial Updates

The `PATCH /tenants/settings` endpoint supports **partial updates**: sending `{ "loyalty": { "expiry_days": 365 } }` changes only that one field. The other 15+ settings fields remain untouched.

This is important UX — the dashboard doesn't need to re-send the entire settings object (which it might not have fully loaded) every time the admin changes one thing.

**How deep merge works:**

```typescript
// Before: { loyalty: { expiry_days: 180, enable_notifications: true, expiry_warning_days: 7 }, booking: {...} }
// Input:  { loyalty: { expiry_days: 365 } }
// After:  { loyalty: { expiry_days: 365, enable_notifications: true, expiry_warning_days: 7 }, booking: {...} }
```

The `deepMerge` utility in `src/shared/utils/deep-merge.ts` handles this. It uses the `deepmerge` npm package (50M+ weekly downloads, well-maintained, no security issues) with two key behaviours:
- `null` overrides the base value (so closing a day: `{ sunday: null }` works correctly)
- Arrays are replaced entirely, not concatenated (for HotsiteConfig layout arrays)

After merging, the result is passed through `TenantSettings.create(merged)` — which runs all the validation rules. This means a partial update that results in an invalid combination (e.g., setting `expiry_warning_days` equal to `expiry_days`) is caught even though neither value is individually invalid.

---

## 9. Error Mapping — The mapPlatformError Pattern

Controllers in Ikaro have one job: call a use case and return the result. Error mapping belongs in a dedicated helper, not in the controller method itself.

```typescript
// ✅ Clean controller method — one line
updateSettings(@Body() dto: UpdateTenantSettingsDto): Promise<UpdateTenantSettingsResult> {
  return this.updateTenantSettings.execute(this.tenantContext.tenantId, dto)
    .catch(mapPlatformError);
}

// ❌ What we avoided — controller doing error mapping
async updateSettings(@Body() dto) {
  try {
    return await this.useCase.execute(dto);
  } catch (err) {
    if (err instanceof SlugAlreadyTakenError) throw new HttpException(..., 409);
    if (err instanceof TenantNotFoundError) throw new HttpException(..., 404);
    if (err instanceof TenantInactiveError) throw new HttpException(..., 409);
    if (err instanceof PlatformDomainError) throw new HttpException(..., 400);
    throw err;
  }
}
```

The `mapPlatformError` helper in `src/contexts/platform/infrastructure/http/platform-error.mapper.ts` maps domain errors to HTTP status codes. This is a one-to-one mapping: domain error → HTTP status. It belongs in `infrastructure/http/` because HTTP status codes are an infrastructure concern — the domain doesn't know about HTTP.

**Error to HTTP mapping:**
| Domain Error | HTTP Status | Reason |
|---|---|---|
| `SlugAlreadyTakenError` | 409 Conflict | Resource already exists with that slug |
| `TenantInactiveError` | 409 Conflict | Resource state conflicts with the operation |
| `TenantNotFoundError` | 404 Not Found | Resource doesn't exist |
| `PlatformDomainError` (base) | 400 Bad Request | Invalid input / business rule violation |

---

## 10. The ManagerRoleGuard Stub — Why It Exists Now

`PATCH /tenants/settings` should require the MANAGER role — only the car-wash owner, not a regular staff member, should be able to change business settings. But M02 doesn't have authentication yet (that's M03). There's no JWT, no role to check.

The solution: create the guard with its final interface but implement it as a passthrough:

```typescript
@Injectable()
export class ManagerRoleGuard implements CanActivate {
  canActivate(): boolean {
    return true; // M03-S05 will enforce MANAGER role from X-Actor-Role header
  }
}
```

The `@UseGuards(ManagerRoleGuard)` decorator is already on the controller — the wiring is done. M03-S05 only needs to replace the implementation, not touch the controller. This is the open/closed principle: the controller is closed for modification, the guard is open for extension.

---

## 11. Test Architecture — Three Layers Working Together

M02 established the full three-layer test strategy for the Platform context.

### Layer 1: Domain Unit Tests (`.spec.ts`)
Pure TypeScript, no frameworks. Test the `Tenant` aggregate invariants, `TenantSettings` validation, `HotsiteConfig` state machine:
```typescript
it('rejects settings update on inactive tenant', () => {
  const tenant = Tenant.create('Belo', 'belo', 'America/Sao_Paulo');
  tenant.deactivate();
  expect(() => tenant.updateSettings(someSettings)).toThrow(TenantInactiveError);
});
```

### Layer 2: Use Case Unit Tests (`.spec.ts`)
Test the application layer with in-memory infrastructure. No database, no HTTP. Fast (~5ms per test):
```typescript
const tenantRepo = new InMemoryTenantRepository();
const useCase = new UpdateTenantSettingsUseCase(tenantRepo);
const result = await useCase.execute(tenant.id, { settings: { loyalty: { expiry_days: 90 } } });
expect(result.settings.loyalty.expiry_days).toBe(90);
```

### Layer 3: Integration Tests (`.integration.spec.ts`)
A real PostgreSQL container (via Testcontainers), a real NestJS application, real HTTP with `supertest`. Tests the whole stack from HTTP header to database row:
```typescript
const { body } = await request(app.getHttpServer())
  .patch('/tenants/settings')
  .set('X-Tenant-ID', tenantId)
  .send({ settings: { loyalty: { expiry_days: 365 } } })
  .expect(200);

const row = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
expect(row.settings.loyalty.expiry_days).toBe(365); // verified in DB
```

**The isolation test pattern:** Every context has at least one test that creates data for Tenant A, attempts access as Tenant B, and asserts that Tenant B cannot see or modify Tenant A's data. This is the multi-tenancy invariant test.

---

## 12. What's Deferred to Later Milestones

| Capability | Deferred to | Why |
|---|---|---|
| First MANAGER staff creation on tenant provision | M04-S06 | Staff context doesn't exist yet; triggered via `TenantProvisioned` event |
| Invitation email to first admin | M11 | Notification context not built yet |
| Rate limiting on `/internal/tenants` | M16-S07 | Security hardening milestone |
| Cloud Armor + Cloud IAP for `/internal` | M15-S12 | GCP infrastructure milestone |
| ManagerRoleGuard real enforcement | M03-S05 | Needs JWT + X-Actor-Role header from BFF |
| HotsiteConfig content management (UC-027) | M02 story not yet scheduled | Branding + layout editing endpoint |

---

## 13. Connection Configuration — A Lesson Learned

Early in M02, the TypeORM configuration used `DATABASE_URL`:
```typescript
TypeOrmModule.forRoot({ url: process.env['DATABASE_URL'] })
```

This caused two problems:
1. **Timing:** `forRoot()` evaluates when the module is imported, before dotenv loads env vars. `DATABASE_URL` was always `undefined`.
2. **URL parsing:** PostgreSQL passwords from GCP Secret Manager can contain `@`, `:`, `/`. These characters break URL parsing silently — the connection string looks valid but connects with wrong credentials.

The fix (now documented as two anti-patterns in CLAUDE.md §8):
```typescript
TypeOrmModule.forRootAsync({
  useFactory: () => ({
    type: 'postgres',
    host: process.env['DB_HOST'],
    port: Number(process.env['DB_PORT'] ?? 5432),
    username: process.env['DB_USER'],
    password: process.env['DB_PASSWORD'],
    database: process.env['DB_NAME'],
  }),
})
```

`forRootAsync` with a `useFactory` runs the factory during NestJS's dependency injection build phase — after dotenv has loaded. Explicit fields don't parse a connection string, so special characters in passwords are safe.

---

## 14. Summary

| What M02 Established | Why It Matters for Future Milestones |
|---|---|
| Hexagonal layer structure | Every context from M03 onwards follows the same pattern |
| AsyncLocalStorage TenantContext | All use cases can access `tenantId` without explicit passing |
| ITransactionManager for multi-aggregate writes | Any use case writing 2+ aggregates must use it |
| deepMerge in shared/utils | Any JSONB partial-update endpoint (HotsiteConfig in UC-027, etc.) uses this |
| mapXxxError helper pattern | Every context's controller follows the same one-liner pattern |
| In-memory repository + builder test pattern | All M03+ contexts follow this for fast unit tests |
| Tenant domain invariants | Auth, staff, booking contexts all operate within the tenant isolation framework |

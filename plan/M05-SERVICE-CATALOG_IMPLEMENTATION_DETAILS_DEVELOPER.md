# M05 — Service Catalog: Implementation Details (Developer Learning Guide)

**Milestone:** M05-SERVICE-CATALOG  
**Goal:** Admin can create and manage car-wash services. Guests and customers can list available services. Service data gets frozen into booking lines at booking time (M07).

---

## 1. What We Built

M05 establishes the `Service` aggregate inside the **Booking bounded context** and exposes it through four backend endpoints and four BFF endpoints. It introduces several patterns you'll see repeated throughout M06–M10: a domain aggregate with Money value object, a read-only public endpoint that bypasses JWT auth, and the PATCH partial-update pattern.

---

## 2. The Service Aggregate

### Why it lives in the Booking context

`Service` is not a standalone context — it belongs to `Booking` because services are only meaningful in the context of a booking. The table is `booking.services`, and the domain code lives in `src/contexts/booking/domain/`. This follows the CLAUDE.md bounded context table: Booking owns `Booking`, `Service`, and `ScheduleClosure`.

### Domain invariants

```typescript
// src/contexts/booking/domain/service.aggregate.ts

static create(
  tenantId: string,
  name: string,
  price: Money,          // VO, not a raw number
  durationMinutes: number,
  loyaltyPointsValue: number,
  requiresPickupAddress = false,
  description?: string,
): Service {
  if (price.amount.isNegative() || price.amount.isZero())
    throw new BookingDomainError('price must be greater than zero');
  if (durationMinutes <= 0)
    throw new BookingDomainError('durationMinutes must be greater than zero');
  if (loyaltyPointsValue < 0)
    throw new BookingDomainError('loyaltyPointsValue must be non-negative');
  ...
}
```

**Why `create()` receives a `Money` VO, not a raw number:** `Money` already validates that the amount is a valid finite decimal. The aggregate then validates the *business rule* (must be positive). This is a two-layer validation: the VO validates format, the aggregate validates semantics.

**Why `deactivate()` is a logical delete:** Deactivating a service sets `isActive=false` on the row but never deletes it. Future booking lines (M07) will contain a frozen snapshot of the service. If you deleted the row, that historical data would be orphaned.

**Why `update()` throws on a deactivated service:** A deactivated service is no longer offered. Allowing updates to it would be confusing and could reactivate it indirectly. The invariant is enforced in `ServiceDeactivatedError`.

### No domain events

Unlike `Staff`, the `Service` aggregate publishes no domain events. Changes to services are read synchronously by the BFF. There's no need for async consumers in M05 (services are looked up directly from the DB at booking creation time in M07).

---

## 3. Money Value Object and Price Storage

### Why price is stored as NUMERIC, not as a JSON column

`Money` holds `amount: string` internally (using `decimal.js` for precision). We could store the whole VO as JSONB `{ "amount": "150.00", "currency": "BRL" }`, but since Ikaro is BRL-only, there's no reason to store the currency per row. Instead, `price_amount NUMERIC(10,2)` stores just the number. The currency (`'BRL'`) is hard-coded in the mapper.

```typescript
// TypeORM entity → domain aggregate
price: Money.from(entity.priceAmount, 'BRL')

// Domain aggregate → TypeORM entity
entity.priceAmount = service.price.amount.toFixed(2)  // Decimal → '150.00'
```

**Important:** TypeORM returns `NUMERIC` columns as **strings** (not JavaScript numbers), to avoid floating point precision loss. `Money.from()` accepts strings, so this round-trips correctly.

### Formatted price in API responses

The response DTO includes `price.formatted`:
```json
{ "amount": 150, "currency": "BRL", "formatted": "R$ 150,00" }
```
`Money.format()` produces the pt-BR format using `.replace(/\B(?=(\d{3})+(?!\d))/g, '.')` for the thousands separator and `,` as the decimal separator. Tests assert the exact string `"R$ 150,00"` to guard against regressions.

---

## 4. Hexagonal Layers in the Booking Context

```
src/contexts/booking/
├── domain/
│   ├── errors/booking-domain.error.ts   ← BookingDomainError, ServiceNotFoundError, ServiceDeactivatedError
│   └── service.aggregate.ts             ← Pure domain, zero framework imports
├── application/
│   ├── dtos/create-service.dto.ts       ← Zod schema + inferred DTO type
│   ├── dtos/update-service.dto.ts
│   ├── ports/service-repository.port.ts ← IServiceRepository interface + SERVICE_REPOSITORY token
│   └── use-cases/
│       ├── create-service.use-case.ts
│       ├── list-services.use-case.ts
│       ├── update-service.use-case.ts
│       └── deactivate-service.use-case.ts
└── infrastructure/
    ├── controllers/service.controller.ts
    ├── entities/service.entity.ts
    ├── guards/staff-or-manager-role.guard.ts
    ├── http/booking-error.mapper.ts
    ├── migrations/1748000000011-CreateBookingServices.ts
    └── repositories/typeorm-service.repository.ts
```

This strict layering means:
- Domain has **no NestJS imports** — it can be tested with plain Jest, no module setup.
- Application use cases import from `domain/` and `shared/` only — no TypeORM, no HTTP.
- Infrastructure adapts the domain to the outside world (TypeORM, HTTP, guards).

---

## 5. The PATCH Pattern (Partial Updates)

`UpdateServiceUseCase` implements PATCH semantics manually because `Service.update()` takes all 6 fields as required positional arguments. The use case merges provided fields with the existing aggregate state:

```typescript
const name = dto.name ?? service.name;
const description = dto.description === undefined ? service.description : dto.description;
const price = dto.priceAmount === undefined ? service.price : Money.from(dto.priceAmount, 'BRL');
const durationMinutes = dto.durationMinutes ?? service.durationMinutes;
```

**Why `description` can't use `??` (nullish coalescing):** `dto.description` can be:
- `undefined` → client didn't include the field → keep existing value
- `null` → client explicitly wants to clear the description → set to null
- `"some string"` → client wants to set a new value

Nullish coalescing (`??`) treats `null` and `undefined` identically — both fall through to the right side. But here `null` has a different meaning from `undefined`. So we use an explicit `=== undefined` check.

**SonarCloud S1940 — negated conditions:** SonarCloud flags `!== undefined` as a "negated condition" (MINOR issue). Always write the positive form: `dto.field === undefined ? keepExisting : useProvided`. This is why the code reads `dto.description === undefined ? service.description : dto.description` rather than the more natural-feeling `dto.description !== undefined ? dto.description : service.description`.

---

## 6. The StaffOrManagerRoleGuard

Services can be created/updated/deactivated by both MANAGER and STAFF roles (unlike staff management which is MANAGER-only). This required a new guard:

```typescript
// src/contexts/booking/infrastructure/guards/staff-or-manager-role.guard.ts
canActivate(context: ExecutionContext): boolean {
  const actorRole = req.headers['x-actor-role'];
  if (actorRole !== 'MANAGER' && actorRole !== 'STAFF') {
    throw new HttpException({ ... status: 403 ... }, HttpStatus.FORBIDDEN);
  }
  return true;
}
```

**Why it reads from the header directly, not from TenantContext:** Guards run before interceptors in NestJS. `TenantInterceptor` (which populates `TenantContext`) is an interceptor, so it hasn't run yet when the guard fires. Reading `X-Actor-Role` directly from the request header is the established pattern — see also `ManagerRoleGuard` in the platform context.

**Consequence for tests:** A request with no headers at all gets a 403 from the guard, not a 400 from `TenantInterceptor`. The integration test that checks for missing tenant header uses `GET /services` (no guard) and correctly expects 400.

---

## 7. The Public List Endpoint — BFF Two-Step Resolution

`GET /v1/services` must be callable by unauthenticated users (guests visiting the hotsite). This required two changes:

### BFF side

```typescript
@Get()
@Public()  // skips JwtAuthGuard, TenantGuard, RolesGuard, ActiveStaffGuard
async list(@Headers('x-tenant-slug') tenantSlug: string | undefined): Promise<ServiceListResponse> {
  if (!tenantSlug) throw new HttpException({ ... status: 400 ... }, 400);

  // Step 1: resolve slug → tenantId
  const tenant = await this.backendHttp.get<TenantInfoResponse>(
    `/internal/tenants/by-slug/${tenantSlug}`,
  );

  // Step 2: fetch services for that tenant
  return this.backendHttp.getForPublic<ServiceListResponse>('/services', tenant.id);
}
```

**Why `@Public()` on the method, not the class:** The class-level `@Roles('MANAGER', 'STAFF')` would block all methods. `@Public()` on the individual method overrides it — `ActiveStaffGuard` and `RolesGuard` both check `IS_PUBLIC_KEY` and return `true` if set.

**Why throw, not `return Promise.reject()`:** The method is `async`, so a synchronous `throw` automatically becomes a rejected promise. `return Promise.reject()` in an async method is flagged by SonarCloud S3696. Always use `throw` in async methods.

### New BackendHttpService method

`BackendHttpService` builds headers from `req.user` (the JWT payload). For a public request, `req.user` is `undefined`, so `X-Tenant-ID` would be `''`. To pass the resolved `tenantId`, a new method was added:

```typescript
async getForPublic<T>(path: string, tenantId: string, params?: Record<string, unknown>): Promise<T> {
  return this.call(
    this.http.get<T>(`${this.baseUrl}${path}`, {
      headers: { 'X-Tenant-ID': tenantId },  // explicit override, no user session
      params,
      timeout: 10_000,
    }),
  );
}
```

This is the only case in the codebase where `BackendHttpService` is called without user context. It's intentional and scoped to public endpoints only.

---

## 8. TenantContextBuilder — The Test Data Builder Pattern

M05 introduced `TenantContextBuilder` in `src/test/factories/tenant-context.factory.ts`. This was created after discovering 8 inline duplications of:

```typescript
// ❌ anti-pattern — plain factory function
function makeTenantContext(): TenantContext {
  return { tenantId, correlationId: 'corr', actorId: null } as unknown as TenantContext;
}
```

**Why a builder class, not a function:** The codebase uses builder classes (`StaffBuilder`, `ServiceBuilder`, `StaffEntityBuilder`, `ServiceEntityBuilder`) for all test data. A function is inconsistent and harder to extend when new fields are added to `TenantContext`. The builder:

```typescript
export class TenantContextBuilder {
  private tenantId = '10000000-0000-4000-8000-000000000001';
  private correlationId = 'corr-test';
  // ...

  withTenantId(tenantId: string): this { this.tenantId = tenantId; return this; }
  // ...

  build(): TenantContext {
    return { tenantId: this.tenantId, correlationId: this.correlationId, ... };
    // No type assertion needed — the object structurally satisfies TenantContext
  }
}
```

**Why no type assertion:** `TenantContext` is structurally typed. The plain object has all the required public properties (`tenantId`, `correlationId`, `actorId`, `actorType`, `actorRole`) matching the exact types — TypeScript accepts it without `as TenantContext` or `as unknown as TenantContext`. SonarCloud S4327 flags unnecessary assertions.

**Where builders go:**
- TypeORM entity builders → `src/test/builders/<context>/`
- Domain aggregate builders → `src/test/builders/<context>/`
- Shared infrastructure stubs → `src/test/factories/`

---

## 9. Error Mapping

`mapBookingError` in `src/contexts/booking/infrastructure/http/booking-error.mapper.ts` follows the established pattern:

```typescript
export function mapBookingError(err: unknown): never {
  if (err instanceof ServiceNotFoundError) throw new HttpException(..., 404);
  if (err instanceof ServiceDeactivatedError) throw new HttpException(..., 409);
  if (err instanceof BookingDomainError) throw new HttpException(..., 400);
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
```

The controller calls it as `.catch(mapBookingError)` — the controller method itself has zero error-checking logic. This is mandatory per CLAUDE.md.

**Why `ServiceDeactivatedError` maps to 409 (Conflict):** Updating a deactivated service is a conflict between the requested action and the current state of the resource. 409 is the correct RFC 7807 status for "the request conflicts with current resource state".

---

## 10. Integration Test Strategy for M05

Each endpoint has both unit tests and integration tests:

| Test type | File | What it covers |
|---|---|---|
| Use case unit | `*.use-case.spec.ts` | Domain logic, tenant isolation via InMemoryServiceRepository |
| Repository unit | `typeorm-service.repository.spec.ts` | Mapper correctness, query filtering with mocked ORM |
| Repository integration | `service.repository.integration.spec.ts` | Real DB round-trip, price precision, tenant isolation |
| Controller unit | `service.controller.spec.ts` | Route→use case wiring, error→HTTP mapping |
| Controller integration | `service.controller.integration.spec.ts` | Full HTTP stack via supertest, guard behavior |
| BFF controller unit | `services.controller.spec.ts` | Two-step slug resolution, header forwarding |
| BFF component | `services.controller.component.spec.ts` | Full BFF stack: auth guards, Zod validation, backend error propagation |

**Integration test tenant isolation pattern:** Services from Tenant A must never appear in Tenant B's list. The integration test for `GET /services` uses an isolated tenant UUID (e.g., `'10000000-0000-4000-8000-000000000210'`) seeded directly into the DB, then queries as a different tenant and asserts the seeded service is absent.

---

## 11. Key Decisions and Rationale

| Decision | Rationale |
|---|---|
| `Service` in the Booking context, not its own context | Services only exist to be booked — they have no independent lifecycle. |
| `price_amount NUMERIC(10,2)` instead of JSONB | BRL-only system; storing currency per-row is waste; NUMERIC avoids floating point. |
| `isActive=false` instead of DELETE | Booking history (M07) must retain service data even after deactivation. |
| `StaffOrManagerRoleGuard` scoped to booking context | Both roles can manage services; guard is context-specific, not global. |
| `getForPublic()` method on BackendHttpService | Cleanest minimal change — avoids polluting existing `get()` signature with optional overrides. |
| `TenantContextBuilder` in `src/test/factories/` | Shared infra stub, not a context-specific entity — different folder from entity builders. |

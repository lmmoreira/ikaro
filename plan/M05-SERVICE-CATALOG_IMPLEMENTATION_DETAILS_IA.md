# M05 — Service Catalog: Implementation Details (AI Agent Reference)

> ⚠️ **Stale paths:** this doc predates TD-21's BFF domain-slice migration — any `apps/bff/src/<flat-name>/` path here is now `apps/bff/src/features/<domain>/`. See `docs/REPOSITORY_STRUCTURE.md` for the current layout.

**Milestone:** M05-SERVICE-CATALOG  
**Status:** ✅ All 5 stories done  
**Contexts touched:** `booking` (backend), `services` (BFF)

---

## Artifacts Table

| Artifact | Path |
|---|---|
| Service aggregate | `apps/backend/src/contexts/booking/domain/service.aggregate.ts` |
| Booking domain errors | `apps/backend/src/contexts/booking/domain/errors/booking-domain.error.ts` |
| Service repository port | `apps/backend/src/contexts/booking/application/ports/service-repository.port.ts` |
| CreateServiceDto | `apps/backend/src/contexts/booking/application/dtos/create-service.dto.ts` |
| UpdateServiceDto | `apps/backend/src/contexts/booking/application/dtos/update-service.dto.ts` |
| CreateServiceUseCase | `apps/backend/src/contexts/booking/application/use-cases/create-service.use-case.ts` |
| ListServicesUseCase | `apps/backend/src/contexts/booking/application/use-cases/list-services.use-case.ts` |
| UpdateServiceUseCase | `apps/backend/src/contexts/booking/application/use-cases/update-service.use-case.ts` |
| DeactivateServiceUseCase | `apps/backend/src/contexts/booking/application/use-cases/deactivate-service.use-case.ts` |
| ServiceController | `apps/backend/src/contexts/booking/infrastructure/controllers/service.controller.ts` |
| Booking error mapper | `apps/backend/src/contexts/booking/infrastructure/http/booking-error.mapper.ts` |
| StaffOrManagerRoleGuard | `apps/backend/src/contexts/booking/infrastructure/guards/staff-or-manager-role.guard.ts` |
| ServiceEntity | `apps/backend/src/contexts/booking/infrastructure/entities/service.entity.ts` |
| TypeOrmServiceRepository | `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-service.repository.ts` |
| Services migration | `apps/backend/src/contexts/booking/infrastructure/migrations/1748000000011-CreateBookingServices.ts` |
| BookingModule | `apps/backend/src/contexts/booking/booking.module.ts` |
| BFF ServicesController | `apps/bff/src/services/services.controller.ts` |
| BFF ServicesModule | `apps/bff/src/services/services.module.ts` |
| BFF services types | `apps/bff/src/services/services.types.ts` |
| InMemoryServiceRepository | `apps/backend/src/test/repositories/booking/in-memory-service.repository.ts` |
| ServiceBuilder | `apps/backend/src/test/builders/booking/service.builder.ts` |
| ServiceEntityBuilder | `apps/backend/src/test/builders/booking/service-entity.builder.ts` |
| Booking builders barrel | `apps/backend/src/test/builders/booking/index.ts` |
| TenantContextBuilder | `apps/backend/src/test/factories/tenant-context.factory.ts` |
| Backend HTTP examples | `apps/backend/http/booking/services.http` |
| BFF HTTP examples | `apps/bff/http/services/services.http` |

---

## Critical Gotchas

### Price storage — NUMERIC, not JSONB

`price_amount` is stored as `NUMERIC(10,2)` (always BRL — currency is implicit). The `ServiceEntity` maps it as `type: 'numeric'` which TypeORM returns as a **string**, not a number. The `toDomain` mapper calls `Money.from(entity.priceAmount, 'BRL')` — `Money.from()` accepts strings. `toEntity` uses `service.price.amount.toFixed(2)` (Decimal → string). Never store the whole `Money` VO as JSONB.

### `booking` schema — created by the migration, not pre-existing

Migration `1748000000011-CreateBookingServices` issues `CREATE SCHEMA IF NOT EXISTS "booking"` before creating the table. If you add a second booking-context migration, do **not** repeat the `CREATE SCHEMA` — it's already there after the first migration runs.

### ServiceEntity must be registered in both integration test files

When adding `ServiceEntity` to the test suite, it must appear in **two** places:
1. `src/test/integration-global-setup.ts` — `entities` array AND `migrations` array (add `CreateBookingServices1748000000011`)
2. `src/test/test-datasource.ts` — `entities` array

Forgetting either causes `EntityMetadataNotFoundError` in integration tests.

### BookingModule does NOT export SERVICE_REPOSITORY

`SERVICE_REPOSITORY` is an internal provider. Only use cases inside `BookingModule` inject it. No other context should reference the repository token. Per CLAUDE.md: never export repository tokens from a bounded context module.

### StaffOrManagerRoleGuard fires before TenantInterceptor

Guards run before interceptors in NestJS. On the `POST /services`, `PATCH /services/:id`, and `DELETE /services/:id` endpoints, `StaffOrManagerRoleGuard` checks `x-actor-role` header. A request missing all headers gets **403** (guard fires first), not **400** (what TenantInterceptor would return). Integration tests must reflect this: the `GET /services` endpoint (no guard) correctly returns 400 for missing `X-Tenant-ID`.

### UpdateServiceUseCase — PATCH semantics via positional args

`Service.update()` takes all 6 fields as required positional args. The use case implements PATCH semantics by merging: `dto.field ?? service.field`. For `description`, nullish coalescing won't work (null means "clear it", undefined means "keep it"), so use: `dto.description === undefined ? service.description : dto.description`. SonarCloud S1940 flags the negated form (`!== undefined`) — always use the positive form.

### DeactivateService is a logical delete — row is preserved

`DELETE /services/:id` maps to `DeactivateServiceUseCase` which calls `service.deactivate()` (sets `isActive=false`) and saves. The row remains in `booking.services`. Booking history (M07+) will reference service snapshots — physical deletion is never done.

### Public list endpoint — BFF slug→tenantId two-step

`GET /v1/services` is decorated `@Public()` (skips all BFF guards). No JWT is present, so `BackendHttpService.get()` would send `X-Tenant-ID: ''`. The flow:
1. BFF reads `X-Tenant-Slug` header (400 if missing)
2. Calls `GET /internal/tenants/by-slug/:slug` — internal route, no TenantContext needed
3. Calls `BackendHttpService.getForPublic('/services', tenant.id)` — sends `X-Tenant-ID` explicitly without a user session

`getForPublic` was added to `BackendHttpService` specifically for this case (`apps/bff/src/shared/http/backend-http.service.ts`).

### TenantContextBuilder — builder class in src/test/factories/

Not a plain factory function. Per CLAUDE.md §7 Testing: all test data uses builder classes with fluent `withXxx()` methods and `build()`. `TenantContextBuilder` is the canonical example for shared infrastructure stubs (as opposed to entity builders in `src/test/builders/<context>/`). The `build()` return value requires no type assertion — the plain object structurally satisfies `TenantContext`.

### Service.update() SonarCloud — inverted conditions

SonarCloud S1940 flags `!== undefined` as a negated condition. Always write: `dto.field === undefined ? existing : dto.field`, not `dto.field !== undefined ? dto.field : existing`.

### Zod schema naming

`CreateServiceSchema` / `CreateServiceDto`, `UpdateServiceSchema` / `UpdateServiceDto` — follow the `{Action}Schema` / `{Action}Dto` convention. Zod v4: use `z.number().positive()`, `z.number().int().min(0)` — not `z.string().uuid()` variants.

---

## DB Schema

```sql
-- booking schema (created by migration 1748000000011)
CREATE TABLE booking.services (
  id                      UUID           PRIMARY KEY,
  tenant_id               UUID           NOT NULL,
  name                    VARCHAR(255)   NOT NULL,
  description             TEXT,
  price_amount            NUMERIC(10,2)  NOT NULL,   -- always BRL, currency implicit
  duration_minutes        INTEGER        NOT NULL CHECK (duration_minutes > 0),
  loyalty_points_value    INTEGER        NOT NULL DEFAULT 0 CHECK (loyalty_points_value >= 0),
  requires_pickup_address BOOLEAN        NOT NULL DEFAULT false,
  is_active               BOOLEAN        NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ    NOT NULL DEFAULT now()
);
-- Indexes: (tenant_id), (tenant_id, is_active)
```

---

## Migration Timestamps

| Migration | Timestamp |
|---|---|
| CreateBookingServices | `1748000000011` |

---

## Pub/Sub

No events published by the Service aggregate. Services are read directly via repository — no async consumers needed in M05.

---

## BFF endpoint summary

| Method | Path | Auth | Backend call |
|---|---|---|---|
| `GET` | `/v1/services` | Public (`@Public()`) + `X-Tenant-Slug` header | slug→tenantId via `/internal/tenants/by-slug/:slug`, then `getForPublic('/services', tenantId)` |
| `POST` | `/v1/services` | JWT + `MANAGER\|STAFF` | `POST /services` |
| `PATCH` | `/v1/services/:id` | JWT + `MANAGER\|STAFF` | `PATCH /services/:id` |
| `DELETE` | `/v1/services/:id` | JWT + `MANAGER\|STAFF` | `DELETE /services/:id` |

# M05 — Service Catalog

**Phase:** Local Development  
**Goal:** An admin can create and manage car-wash services (name, price, duration, loyalty points). Guests and customers can list available services for a tenant. Service snapshots are correctly frozen in booking lines when a booking is created later.  
**Depends on:** M02 (tenant context needed for scoping), M03 (auth guards needed for admin endpoints)  
**Blocks:** M06 (availability algorithm needs service durations), M07 (booking needs services to exist)

---

## Stories

---

### M05-S01 — Service aggregate domain layer ✅ Done

**Agent:** `backend-ts`  
**Complexity:** S  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Service aggregate, `docs/04-USE_CASES.md` § UC-012, UC-013

**Description:**  
Implement the pure domain layer for the `Service` aggregate within the Booking bounded context. Services are the car-wash offerings that customers select when booking. Once a service is snapshotted into a `BookingLine`, changes to the service never retroactively affect past bookings.

**What to create in `apps/backend/src/contexts/booking/domain/`:**
- `Service` aggregate:
  - Properties: `id` (UUID v7), `tenantId`, `name`, `description?`, `price` (Money value object), `durationMinutes` (positive integer), `loyaltyPointsValue` (non-negative integer), `requiresPickupAddress` (boolean, default false), `isActive` (boolean, default true), `createdAt`, `updatedAt`
  - Methods:
    - `create(tenantId, name, price, durationMinutes, loyaltyPointsValue, requiresPickupAddress)` — static factory
    - `update(name, description, price, durationMinutes, loyaltyPointsValue, requiresPickupAddress)` — returns updated aggregate (does NOT affect existing bookings)
    - `deactivate()` — sets `isActive=false`
  - Invariants:
    - `price.amount` must be > 0 (services must have a positive price)
    - `durationMinutes` must be > 0 (must take some time)
    - `loyaltyPointsValue` must be ≥ 0 (can be zero — no points for some services)
    - Cannot `update()` a deactivated service

**Acceptance criteria:**
- [ ] `Service.create(...)` with `durationMinutes: 0` throws a domain error
- [ ] `Service.create(...)` with `price: Money.from(-10, 'BRL')` throws a domain error
- [ ] `Service.deactivate()` sets `isActive=false`
- [ ] Calling `update()` on a deactivated service throws a domain error
- [ ] `price` is a `Money` value object — `service.price.format()` returns `"R$ 150,00"` format
- [ ] Zero imports from `@nestjs/*` or TypeORM in the domain layer
- [ ] Unit tests cover all invariants, `deactivate()`, and `update()`

**Dependencies:** M00-S08

---

### M05-S02 — Service database migration ✅ Done

**Agent:** `backend-ts`  
**Complexity:** S  
**Docs to load:** `docs/13-DATABASE_SCHEMA.md` § booking schema — services table

**Description:**  
Create the TypeORM migration for the `booking.services` table. Note: `price` is stored as a numeric column (not JSONB) since Money is a value object with a single-currency system. The currency is always BRL and does not need to be stored per-row.

**Table: `booking.services`**
```sql
id                     UUID PRIMARY KEY
tenant_id              UUID NOT NULL
name                   VARCHAR(255) NOT NULL
description            TEXT
price_amount           NUMERIC(10,2) NOT NULL        ← always BRL
duration_minutes       INTEGER NOT NULL CHECK (duration_minutes > 0)
loyalty_points_value   INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_points_value >= 0)
requires_pickup_address BOOLEAN NOT NULL DEFAULT false
is_active              BOOLEAN NOT NULL DEFAULT true
created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()

INDEX (tenant_id)
INDEX (tenant_id, is_active)    ← for fast "active services for tenant" queries
```

**Acceptance criteria:**
- [ ] `pnpm db:migrate` creates the `booking.services` table without errors
- [ ] `CHECK (duration_minutes > 0)` constraint exists
- [ ] `CHECK (loyalty_points_value >= 0)` constraint exists
- [ ] Composite index on `(tenant_id, is_active)` exists
- [ ] Migration reverts cleanly

**Dependencies:** M00-S07, M05-S01

---

### M05-S03 — Service infrastructure (TypeORM + NestJS module) ✅ Done

**Agent:** `backend-ts`  
**Complexity:** S  
**Docs to load:** `docs/11-ARCHITECTURE.md` § hexagonal layers

**Description:**  
Implement the infrastructure adapter for the Service aggregate: TypeORM entity, repository implementation, and the NestJS module.

**What to create:**
- `ServiceEntity` (TypeORM) — maps to `booking.services`; maps `price_amount` → `Money.from(price_amount, 'BRL')` when reconstructing domain aggregate
- `TypeOrmServiceRepository` — implements `IServiceRepository`:
  - `findById(id, tenantId): Promise<Service | null>`
  - `findAllByTenant(tenantId, onlyActive?: boolean): Promise<Service[]>`
  - `save(service, tenantId): Promise<void>`
- `BookingModule` (if not yet created) — export `IServiceRepository` token

**Acceptance criteria:**
- [ ] `TypeOrmServiceRepository.findAllByTenant(tenantId, true)` returns only active services
- [ ] A service saved with `price = Money.from(150, 'BRL')` is retrieved with `price.amount === 150` and `price.currency === 'BRL'`
- [ ] All repository queries include `WHERE tenant_id = :tenantId` — verified by query logging in integration test
- [ ] Integration test (Testcontainers): create two services in different tenants → `findAllByTenant(tenantA)` returns only Tenant A's services

**Dependencies:** M05-S01, M05-S02, M02-S04

---

### M05-S04 — UC-012: Admin creates service

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-012, `docs/14-API_CONTRACTS.md` § services endpoints

**Description:**  
Implement the use case and endpoint for creating a new service. Only MANAGER or STAFF roles can create services.

**Backend use case `CreateServiceUseCase`:**
1. Build `Service` aggregate via `Service.create(...)`
2. Persist via `IServiceRepository.save()`
3. Return service DTO

**BFF endpoint:** `POST /v1/services`
- Requires: JWT + role `MANAGER` or `STAFF`
- Body: `{ name, description?, priceAmount, durationMinutes, loyaltyPointsValue, requiresPickupAddress? }`
- Returns: `201` with full service DTO

**Response DTO:**
```json
{
  "id": "uuid",
  "name": "Lavagem Completa",
  "description": "...",
  "price": { "amount": 150.00, "currency": "BRL", "formatted": "R$ 150,00" },
  "durationMinutes": 60,
  "loyaltyPointsValue": 10,
  "requiresPickupAddress": false,
  "isActive": true,
  "createdAt": "ISO-8601"
}
```

**Acceptance criteria:**
- [ ] `POST /v1/services` with valid body returns `201` with service ID
- [ ] `POST /v1/services` with `priceAmount: -50` returns `400` (validation error)
- [ ] `POST /v1/services` with `durationMinutes: 0` returns `400`
- [ ] Created service has `tenantId` matching JWT's `tenantId`
- [ ] Customer role calling this endpoint returns `403`
- [ ] `price.formatted` in response uses pt-BR format (`"R$ 150,00"`)
- [ ] Tenant isolation: service is only visible to the creating tenant

**Dependencies:** M05-S03, M03-S05

---

### M05-S05 — UC-013: Admin edits/deactivates service + public list endpoint

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-013, `docs/14-API_CONTRACTS.md` § services endpoints

**Description:**  
Implement service editing and deactivation, plus the public-facing service list endpoint that guests and unauthenticated users can call to see available services for a tenant.

**Backend use cases:**
- `UpdateServiceUseCase` — loads service, calls `service.update(...)`, persists
- `DeactivateServiceUseCase` — loads service, calls `service.deactivate()`, persists

**BFF endpoints:**
- `PATCH /v1/services/:id` — requires JWT + `MANAGER|STAFF`; body: partial service fields
- `DELETE /v1/services/:id` — requires JWT + `MANAGER|STAFF`; logical delete (sets `isActive=false`)
- `GET /v1/services` — **public**, requires only `X-Tenant-Slug` header; returns active services for the tenant

**Acceptance criteria:**
- [ ] `PATCH /v1/services/:id` updates only the provided fields; unspecified fields remain unchanged
- [ ] `PATCH /v1/services/:id` on a deactivated service returns `409` (cannot edit inactive service)
- [ ] `DELETE /v1/services/:id` sets `isActive=false` (does NOT delete the row — booking history must be preserved)
- [ ] `GET /v1/services` with only `X-Tenant-Slug` header (no JWT) returns the active services list
- [ ] `GET /v1/services` with no `X-Tenant-Slug` header returns `400`
- [ ] Deactivated services are NOT returned in `GET /v1/services` (public list)
- [ ] `PATCH /v1/services/:id` on a service from a different tenant returns `404`
- [ ] Tenant isolation test: services from Tenant A not visible when querying as Tenant B

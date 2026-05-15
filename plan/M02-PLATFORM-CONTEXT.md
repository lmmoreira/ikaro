# M02 — Platform Context — Tenant Core

**Phase:** Local Development  
**Goal:** A developer can provision a new tenant via a CLI command, the tenant persists in the local PostgreSQL, and every subsequent request can resolve `X-Tenant-Slug` → `tenant_id` via the `TenantInterceptor`.  
**Depends on:** M00  
**Blocks:** M03 (auth needs tenants), M05 (services belong to a tenant), M12 (hotsite manifest needs HotsiteConfig)

---

## Stories

---

### M02-S01 — Platform context domain layer ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § Platform context, `docs/03-DOMAIN_EVENTS.md` § Platform events, `docs/21-TENANTS_SETTINGS_SCHEMA.md`

**Description:**  
Implement the pure domain layer for the Platform bounded context. No framework, no database, no HTTP — only aggregates, value objects, and domain events. This is the business logic heart of tenant management.

**What to create in `apps/backend/src/contexts/platform/domain/`:**

`Tenant` aggregate:
- Properties: `id` (UUID v7), `name`, `slug` (URL-safe, globally unique), `settings` (TenantSettings value object), `isActive`, `createdAt`
- Methods: `create(name, slug, timezone)` (static factory), `updateSettings(settings)`, `deactivate()`
- Invariants: slug must match `/^[a-z0-9-]+$/`, name must be non-empty, `isActive` defaults to `true`
- Emits: no events from Tenant itself (CLI-provisioned, not event-sourced)

`HotsiteConfig` aggregate:
- Properties: `id`, `tenantId`, `branding` (primaryColor, logoUrl, bannerImageUrl?), `layout` (array of module configs), `isPublished`, `updatedAt`
- Methods: `updateContent(branding, layout)`, `publish()`, `unpublish()`
- Invariants: `layout` array must have at least one module; `primaryColor` must be a valid hex color

`TenantSettings` value object (from `docs/21-TENANTS_SETTINGS_SCHEMA.md`):
- `booking.cancellation_window_hours` (default 48)
- `booking.buffer_minutes` (default 15)
- `loyalty.expiry_days` (default 180)
- `loyalty.expiry_warning_days` (default 7)
- `business_hours` (per-day open/close times)
- `timezone` (default `America/Sao_Paulo`)

Domain events:
- `StaffInvited { tenantId, staffId, email, role, invitedBy }`
- `StaffDeactivated { tenantId, staffId, deactivatedBy }`

**Acceptance criteria:**
- [ ] `Tenant.create('BeloAuto', 'beloauto', 'America/Sao_Paulo')` returns a valid `Tenant` aggregate
- [ ] `Tenant.create('', 'slug')` throws a domain error (empty name invalid)
- [ ] `Tenant.create('name', 'INVALID SLUG!')` throws a domain error (slug format invalid)
- [ ] `TenantSettings.default()` returns settings with all default values as specified in `docs/21-TENANTS_SETTINGS_SCHEMA.md`
- [ ] `HotsiteConfig.publish()` sets `isPublished = true`
- [ ] Zero imports from `@nestjs/*` or any ORM in the domain layer
- [ ] Unit tests cover all invariants and state transitions

**Dependencies:** M00-S08

---

### M02-S02 — Platform database migrations ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/13-DATABASE_SCHEMA.md` § platform schema

**Description:**  
Create the TypeORM migration files for the `platform` schema. This is the first migration to run — it must exist before any other context's migrations because other tables reference `platform.tenants(id)` via application-level UUID references (no cross-schema FK constraints, but the tenant must exist logically first).

**Tables to create:**

`platform.tenants`:
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
name        VARCHAR(255) NOT NULL
slug        VARCHAR(100) NOT NULL UNIQUE
settings    JSONB NOT NULL DEFAULT '{}'
is_active   BOOLEAN NOT NULL DEFAULT true
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```

`platform.hotsite_configs`:
```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id    UUID NOT NULL REFERENCES platform.tenants(id)
branding     JSONB NOT NULL DEFAULT '{}'
layout       JSONB NOT NULL DEFAULT '[]'
is_published BOOLEAN NOT NULL DEFAULT false
created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE(tenant_id)
```

**Acceptance criteria:**
- [ ] `pnpm db:migrate` runs both migration files with zero errors
- [ ] `platform.tenants` table exists with all columns and constraints
- [ ] `platform.hotsite_configs` table exists with UNIQUE constraint on `tenant_id`
- [ ] `pnpm db:revert` cleanly removes both tables
- [ ] Migration is idempotent (running twice does not error — uses `CREATE TABLE IF NOT EXISTS` pattern or TypeORM handles it)
- [ ] `slug` column has a UNIQUE index
- [ ] No cross-schema FK constraints to other context schemas (tenant isolation invariant)

**Dependencies:** M00-S07, M02-S01

---

### M02-S03 — Platform infrastructure (TypeORM + NestJS module)

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/11-ARCHITECTURE.md` § hexagonal layers, `docs/06-TENANT_ISOLATION_STRATEGY.md`

**Description:**  
Implement the infrastructure layer for the Platform context: TypeORM entities mapped to the tables from M02-S02, repository adapters implementing the domain ports, and the NestJS `PlatformModule` that wires everything together.

**What to create in `apps/backend/src/contexts/platform/infrastructure/`:**

TypeORM entities:
- `TenantEntity` — maps to `platform.tenants`
- `HotsiteConfigEntity` — maps to `platform.hotsite_configs`

Repository adapters:
- `TypeOrmTenantRepository` — implements `ITenantRepository`:
  - `findBySlug(slug): Promise<Tenant | null>`
  - `findById(id): Promise<Tenant | null>`
  - `save(tenant): Promise<void>`
  - `existsBySlug(slug): Promise<boolean>`
- `TypeOrmHotsiteConfigRepository` — implements `IHotsiteConfigRepository`:
  - `findByTenantId(tenantId): Promise<HotsiteConfig | null>`
  - `save(config, tenantId): Promise<void>`

NestJS module:
- `PlatformModule` — exports `ITenantRepository`, `IHotsiteConfigRepository` tokens for injection by use cases

**Acceptance criteria:**
- [ ] `TypeOrmTenantRepository.findBySlug('beloauto')` returns a `Tenant` aggregate (not a raw TypeORM entity)
- [ ] `TypeOrmTenantRepository.findBySlug('nonexistent')` returns `null`
- [ ] No raw SQL outside repository adapters — TypeORM QueryBuilder only
- [ ] Repository methods never return TypeORM entity objects directly — always map to domain aggregates
- [ ] Integration test: create a tenant via `save()`, retrieve via `findBySlug()`, assert all fields match
- [ ] Integration test uses Testcontainers (real PostgreSQL, not mocks)

**Dependencies:** M02-S01, M02-S02, M00-S07

---

### M02-S04 — TenantContext + TenantInterceptor

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/06-TENANT_ISOLATION_STRATEGY.md`, `docs/24-BFF_ARCHITECTURE.md` § request lifecycle

**Description:**  
Implement the request-scoped `TenantContext` and the `TenantInterceptor` that resolves the tenant from the `X-Tenant-ID` header (injected by the BFF after JWT validation) and makes it available throughout the request lifecycle. This is the mechanism that makes `WHERE tenant_id = :tenantId` possible in every repository.

**What to create:**
- `apps/backend/src/shared/tenant/tenant-context.ts` — `@Injectable({ scope: Scope.REQUEST })` class with `tenantId: string` and `correlationId: string` properties
- `apps/backend/src/shared/tenant/tenant.interceptor.ts` — NestJS interceptor that:
  1. Reads `X-Tenant-ID` header from incoming request
  2. Returns 400 if header is missing
  3. Injects `tenantId` into `TenantContext`
  4. Reads `X-Correlation-ID` header and injects into `TenantContext`
- `apps/backend/src/shared/tenant/tenant.module.ts` — exports `TenantContext` as `REQUEST`-scoped provider
- Register `TenantInterceptor` as global interceptor in `AppModule`

**Acceptance criteria:**
- [ ] A request without `X-Tenant-ID` header returns HTTP 400 with RFC 9457 Problem Detail
- [ ] A request with `X-Tenant-ID: <uuid>` has `TenantContext.tenantId` populated inside any controller
- [ ] `TenantContext` is `REQUEST`-scoped — concurrent requests with different `X-Tenant-ID` values do not share state
- [ ] `correlationId` is populated from `X-Correlation-ID` header (or generated if absent)
- [ ] Integration test: two concurrent requests with different tenant IDs resolve to different `TenantContext.tenantId` values

**Dependencies:** M02-S03, M00-S08

---

### M02-S05 — UC-024: Developer CLI — provision new tenant

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-024, `docs/02-DOMAIN_MODEL.md` § Tenant aggregate

**Description:**  
Implement the developer CLI command `tenant:create` that provisions a new tenant. This is a NestJS CLI application command — it connects to the database, creates a `Tenant` + a default `HotsiteConfig` (unpublished) + a placeholder MANAGER staff row (`is_active=false`), and emits a `StaffInvited` event (which will trigger an invitation email once Notification context is wired in M11).

**Main flow (from UC-024):**
1. Validate `--slug` is unique (fail if taken)
2. Create `Tenant` aggregate via `Tenant.create(name, slug, timezone)`
3. Persist via `ITenantRepository.save()`
4. Create default `HotsiteConfig` (unpublished, empty layout)
5. Create MANAGER `Staff` row with `is_active=false`, `google_oauth_id=null`, `email=<admin-email>` (Staff context is M03 — use raw SQL or stub for now, revisit in M04)
6. Print provisioned tenant ID and slug to console

**CLI command signature:**
```bash
pnpm --filter @beloauto/backend cli tenant:create \
  --name "Lavacar BeloAuto" \
  --slug "lavacar-beloauto" \
  --admin-email "admin@lavacar.com.br" \
  --timezone "America/Sao_Paulo"
```

**Acceptance criteria:**
- [ ] Command runs successfully and prints `Tenant created: <id> (slug: <slug>)`
- [ ] Running with an existing slug prints an error and exits with code 1
- [ ] Running with an invalid slug format (`UPPER CASE` or special chars) prints validation error and exits 1
- [ ] `platform.tenants` row exists after command runs
- [ ] `platform.hotsite_configs` row exists with `is_published=false`
- [ ] `--timezone` defaults to `America/Sao_Paulo` if omitted
- [ ] Command is idempotent-safe: running twice with same slug fails on second run (not silently duplicates)

**Dependencies:** M02-S03, M02-S04

---

### M02-S06 — UC-026: Admin edits tenant settings

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-026, `docs/21-TENANTS_SETTINGS_SCHEMA.md`, `docs/14-API_CONTRACTS.md` § tenants endpoints

**Description:**  
Implement the use case and REST endpoint that allows an admin to update the tenant's settings JSONB. Settings include the cancellation window, loyalty expiry, business hours, timezone, and booking buffer. All configurable values referenced throughout the app must come from this settings object — never hardcoded.

**What to create:**
- Use case: `UpdateTenantSettingsUseCase` in `platform/application/use-cases/`
- DTO: `UpdateTenantSettingsDto` — validates each settings field with `class-validator` decorators
- Controller method: `PATCH /tenants/settings` (protected — requires MANAGER role)
- Validation rules from `docs/21-TENANTS_SETTINGS_SCHEMA.md`:
  - `cancellation_window_hours`: integer 0–168
  - `loyalty.expiry_days`: integer 1–365
  - `business_hours`: each day has `open: HH:MM`, `close: HH:MM`, or `null` (closed that day)
  - `timezone`: must be a valid IANA timezone string

**Acceptance criteria:**
- [ ] `PATCH /tenants/settings` with valid payload returns `200` and updated settings
- [ ] `PATCH /tenants/settings` with `cancellation_window_hours: -1` returns `400` (validation error)
- [ ] `PATCH /tenants/settings` with `timezone: "Not/ATimezone"` returns `400`
- [ ] Settings are persisted to `platform.tenants.settings` JSONB column
- [ ] Partial updates are supported: sending only `{ "loyalty": { "expiry_days": 90 } }` merges with existing settings, does not wipe unrelated fields
- [ ] Endpoint requires `MANAGER` role (stub guard for now, fully enforced in M03)
- [ ] Integration test: update settings, re-fetch tenant, assert settings match

**Dependencies:** M02-S03, M02-S04

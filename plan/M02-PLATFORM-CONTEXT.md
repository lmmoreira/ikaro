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

### M02-S03 — Platform infrastructure (TypeORM + NestJS module) ✅ Done

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

### M02-S04 — TenantContext + TenantInterceptor ✅ Done

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

### M02-S05 — UC-024: Platform operator provisions new tenant (REST API)

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-024, `docs/14-API_CONTRACTS.md` § Internal Platform API, `docs/03-DOMAIN_EVENTS.md` § TenantProvisioned, `docs/02-DOMAIN_MODEL.md` § Tenant + HotsiteConfig aggregates

**Background — why REST instead of CLI (decision 2026-05-15):**
The original plan specified a CLI command. Replaced with a REST endpoint for production readiness: no direct database/server access needed, three-layer security achievable (Cloud Armor + Cloud IAP + API key), HTTP requests are auditable via Cloud Audit Logs. Self-service signup (future) can reuse the same use case without backend changes.

**What is deferred from this story:**
- First MANAGER staff creation → **M04-S06** (Staff context doesn't exist yet; triggered asynchronously via `TenantProvisioned` event)
- Invitation email → **M11** (triggered via `StaffInvited` published by M04-S06)
- Cloud Armor + Cloud IAP security hardening → **M15-S12**
- Rate limiting on `/internal/tenants` → **M16-S07**

**What to create:**

**1. `PLATFORM_ADMIN_KEY` environment variable**
- Add to `apps/backend/src/config/env.validation.ts` Zod schema:
  ```typescript
  PLATFORM_ADMIN_KEY: z.string().min(32, 'PLATFORM_ADMIN_KEY must be at least 32 characters'),
  ```
- Add to `apps/backend/.env.example`:
  ```
  PLATFORM_ADMIN_KEY=change-me-generate-with-openssl-rand-hex-32
  ```
- Local dev: generate with `openssl rand -hex 32`, add to `apps/backend/.env` (gitignored, never commit)

**2. `PlatformAdminGuard`**
- Location: `apps/backend/src/shared/guards/platform-admin.guard.ts`
- `@Injectable()` — applied per-endpoint with `@UseGuards(PlatformAdminGuard)`, no module-level registration
- Reads `Authorization: Bearer <token>` from request header
- Compares against `PLATFORM_ADMIN_KEY` using `crypto.timingSafeEqual` from `node:crypto` — **NEVER use `===` for secret comparison** (vulnerable to timing attacks that leak key length/content)
- Returns `401` Problem Detail if header is absent, not `Bearer` format, or token does not match:
  ```json
  { "type": "about:blank", "title": "Unauthorized", "status": 401, "detail": "Invalid or missing platform API key" }
  ```
- Buffers must be same length for `timingSafeEqual` — pad/truncate safely before comparison

**3. `TenantProvisioned` domain event**
- Location: `apps/backend/src/contexts/platform/domain/events/tenant-provisioned.event.ts`
- Extends `DomainEvent<TenantProvisionedData>`
- Payload:
  ```typescript
  interface TenantProvisionedData {
    tenantId:   string;
    name:       string;
    slug:       string;
    adminEmail: string;
    timezone:   string;
  }
  ```
- `eventName: 'TenantProvisioned'`, `eventVersion: 1`
- Export from `platform/domain/index.ts`

**4. `ProvisionTenantDto`**
- Location: `apps/backend/src/contexts/platform/application/dtos/provision-tenant.dto.ts`
- class-validator decorators:
  ```typescript
  @IsString() @IsNotEmpty()                                              name: string;
  @IsString() @Matches(/^[a-z0-9-]+$/)                                  slug: string;
  @IsEmail()                                                             adminEmail: string;
  @IsOptional() @IsTimeZone()                                            timezone?: string;
  ```
- `timezone` defaults to `'America/Sao_Paulo'` in the use case (not in DTO)

**5. `ProvisionTenantUseCase`**
- Location: `apps/backend/src/contexts/platform/application/use-cases/provision-tenant.use-case.ts`
- Injects: `ITenantRepository` (TENANT_REPOSITORY token), `IHotsiteConfigRepository` (HOTSITE_CONFIG_REPOSITORY token), `IEventBus` (EVENT_BUS token)
- Flow:
  ```
  1. timezone = input.timezone ?? 'America/Sao_Paulo'
  2. slugTaken = await tenantRepo.existsBySlug(slug)
     → if true: throw HttpException 409 Problem Detail "Slug '{slug}' is already in use"
  3. tenant = Tenant.create(name, slug, timezone)        ← throws PlatformDomainError on invalid slug/name → caught as 400
  4. await tenantRepo.save(tenant)
  5. config = HotsiteConfig.create(tenant.id)
  6. await hotsiteRepo.save(config)
  7. publish TenantProvisioned { tenantId, name, slug, adminEmail, timezone }
  8. return { tenantId: tenant.id, name: tenant.name, slug: tenant.slug }
  ```
- No Staff creation — that is handled by M04-S06 which subscribes to the published event

**6. `InternalTenantController`**
- Location: `apps/backend/src/contexts/platform/infrastructure/controllers/internal-tenant.controller.ts`
- `@Controller('internal/tenants')`
- `@UseGuards(PlatformAdminGuard)` at class level
- `POST /` — body validated with `ValidationPipe` → calls `ProvisionTenantUseCase` → returns `201 { tenantId, name, slug }`

**7. Update `TenantInterceptor`**
- Extend the health-route bypass to also skip `/internal/*`:
  ```typescript
  if (req.path?.startsWith('/health') || req.path?.startsWith('/internal')) {
    return next.handle();
  }
  ```

**8. Wire into `PlatformModule`**
- Add `InternalTenantController` to `controllers`
- Add `ProvisionTenantUseCase` to `providers`

**Acceptance criteria:**
- [ ] `POST /internal/tenants` without `Authorization` → `401` Problem Detail
- [ ] `POST /internal/tenants` with wrong key → `401` (response time identical to valid key — timing-safe)
- [ ] `POST /internal/tenants` with valid key + valid body → `201 { tenantId, name, slug }`
- [ ] `platform.tenants` row exists after successful call
- [ ] `platform.hotsite_configs` row exists with `is_published=false`
- [ ] `TenantProvisioned` event published with `tenantId`, `name`, `slug`, `adminEmail`, `timezone`
- [ ] Duplicate slug → `409` Problem Detail
- [ ] Invalid slug format → `400`
- [ ] Invalid email → `400`
- [ ] Invalid IANA timezone → `400`
- [ ] `/internal/*` routes skip `TenantInterceptor` — no `X-Tenant-ID` required
- [ ] `PlatformAdminGuard` uses `crypto.timingSafeEqual` — verified in unit test
- [ ] Unit test: `ProvisionTenantUseCase` with `InMemoryTenantRepository` + `InMemoryHotsiteConfigRepository`
- [ ] Integration test (supertest): missing key → 401, valid request → 201 + DB rows verified

**Security note:** Never log `PLATFORM_ADMIN_KEY` or any token fragment — `AppLogger` must not output it under any circumstance.

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

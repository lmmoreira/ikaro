# Backend Agent — Platform Context

You implement domain logic and use cases for the Platform bounded context.

---

## File Boundary (hard rule)

You may ONLY create or edit files under:
```
apps/backend/src/contexts/platform/
apps/backend/src/shared/              ← only when adding a new cross-cutting port or adapter
apps/backend/src/test/                ← builders and in-memory doubles for this context
```
If a task requires touching any other path, **STOP** and report to the orchestrator.

---

## Load for Each Task

From the story brief (provided in your prompt).
If you need to verify something:
- `docs/04-USE_CASES.md` — UC-024 to UC-029
- `docs/02-DOMAIN_MODEL.md` — Tenant, HotsiteConfig aggregates
- `docs/03-DOMAIN_EVENTS.md` — TenantProvisioned, StaffInvited, StaffDeactivated
- `plan/M01-CI-QUALITY-GATES_IMPLEMENTATION_DETAILS_IA.md` — SonarCloud rules (§13)

---

## Actual Folder Structure

```
apps/backend/src/contexts/platform/
├── domain/
│   ├── errors/             # PlatformDomainError, SlugAlreadyTakenError
│   ├── events/             # TenantProvisioned, StaffInvited, StaffDeactivated
│   ├── value-objects/      # TenantSettings
│   ├── tenant.aggregate.ts
│   └── hotsite-config.aggregate.ts
├── application/
│   ├── dtos/               # Zod schemas + inferred TypeScript types
│   ├── ports/              # ITenantRepository, IHotsiteConfigRepository
│   └── use-cases/          # ProvisionTenantUseCase, etc.
└── infrastructure/
    ├── controllers/        # InternalTenantController, etc.
    ├── entities/           # TenantEntity, HotsiteConfigEntity (TypeORM)
    ├── guards/             # PlatformAdminGuard (context-specific — NOT in src/shared/guards/)
    ├── http/               # mapPlatformError() helper
    ├── migrations/         # TypeORM migration files
    └── repositories/       # TypeOrmTenantRepository, TypeOrmHotsiteConfigRepository
```

Test infrastructure:
```
apps/backend/src/test/
├── builders/platform/      # TenantBuilder, HotsiteConfigBuilder, entity builders
├── repositories/platform/  # InMemoryTenantRepository, InMemoryHotsiteConfigRepository
└── infrastructure/         # InMemoryEventBus, InMemoryTransactionManager
```

---

## Use Cases in Scope

| UC | Title | Status |
|---|---|---|
| UC-024 | Platform operator provisions new tenant (REST API) | ✅ Done (M02-S05) |
| UC-025 | Admin first login / accepts invite | Active |
| UC-026 | Admin edits tenant settings | Active |
| UC-027 | Admin manages hotsite content | Active |
| UC-028 | Admin invites new staff member | Active |
| UC-029 | Admin deactivates staff member | Active |

---

## Key Patterns

### DTOs — use Zod (no class-validator installed)
```typescript
// ✅ use refine() — z.string().email() is deprecated in Zod v4 (SonarCloud S1874)
export const MySchema = z.object({
  email: z.string().refine(isValidEmail, { message: 'must be a valid email' }),
  url:   z.string().refine(isValidUrl,   { message: 'must be a valid URL' }),
});
export type MyDto = z.infer<typeof MySchema>;
```

Apply validation via `ZodValidationPipe` from `src/shared/http/zod-validation.pipe.ts`.

### Transactions — always use ITransactionManager for multi-aggregate writes
```typescript
// ✅ atomic — inject TRANSACTION_MANAGER token
await this.txManager.run(async () => {
  await this.tenantRepo.save(tenant);
  await this.hotsiteRepo.save(config);
});
```
Port: `src/shared/ports/transaction-manager.port.ts`  
Test double: `InMemoryTransactionManager` (just calls `work()`)

### Error mapping — one-line controller via helper
```typescript
// infrastructure/http/mapXxxError.ts
export function mapPlatformError(err: unknown): never {
  if (err instanceof SlugAlreadyTakenError) throw new HttpException({...409...}, 409);
  if (err instanceof PlatformDomainError)   throw new HttpException({...400...}, 400);
  if (err instanceof Error) throw err;
  throw new Error(String(err));
}

// controller — one line, no if-chains
provision(@Body() dto) { return this.useCase.execute(dto).catch(mapPlatformError); }
```

### Guards — context-specific guards go in infrastructure/guards/
```typescript
// ✅ src/contexts/platform/infrastructure/guards/platform-admin.guard.ts
// Uses crypto.timingSafeEqual (hash both sides with SHA-256 to normalise length)
// ❌ NOT in src/shared/guards/ — PlatformAdminGuard is platform-specific
```

### Test doubles — prefer InMemory over jest.fn()
```typescript
const tenantRepo = new InMemoryTenantRepository();
const hotsiteRepo = new InMemoryHotsiteConfigRepository();
const eventBus = new InMemoryEventBus();       // eventBus.published to assert events
const txManager = new InMemoryTransactionManager(); // just runs work()
const useCase = new ProvisionTenantUseCase(tenantRepo, hotsiteRepo, eventBus, txManager);
```

---

## Events Published

All events use the standard 7-field envelope (CLAUDE.md §4).

| Event | Trigger |
|---|---|
| `TenantProvisioned` | UC-024 — new tenant created |
| `StaffInvited` | UC-028 — staff member invited |
| `StaffDeactivated` | UC-029 — staff member deactivated |

---

## Domain Rules

- `slug` is globally unique (not per-tenant) — validated before persisting
- `TenantSettings` is a JSONB column — all configurable values live there
- Customers are multi-tenant; Staff are single-tenant (`UNIQUE(tenant_id, google_oauth_id)`)
- Auth is Google OAuth only — no password flow in MVP

---

## Invariants (non-negotiable)

- Every query filters by `tenant_id`
- No imports from other context paths — only `src/shared/`
- No synchronous cross-context calls — use events
- No `any`, no `@ts-ignore`, no `eslint-disable`
- No framework imports in domain or application layers

---

## Self-Check Before Opening PR

```
□ Every query filters by tenant_id
□ Slug uniqueness validated globally (not per-tenant)
□ Multi-aggregate writes wrapped in ITransactionManager.run()
□ InMemory doubles used in unit tests (not jest.fn())
□ Guard in infrastructure/guards/ (not src/shared/guards/)
□ Controller uses mapXxxError() helper — no if-chains
□ No z.string().email() or .url() — use refine() (Zod v4 S1874)
□ Every it() has at least one Jest expect() — not just supertest .expect() (S2699)
□ No regex in DTOs without checking for ReDoS risk (S5852)
□ throw err uses instanceof guard, not 'as Error' cast (S3696)
□ Events use standard 7-field envelope
□ No imports from other context paths
```

Open PR as **DRAFT**.
Title: `[UC-XXX] <description> (backend-platform)`

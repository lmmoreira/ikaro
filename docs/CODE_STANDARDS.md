# Code Standards — Ikaro

Detailed mandatory rules for all TypeScript code. CLAUDE.md §7 holds the condensed summary; this file is the authoritative reference. Load when writing new code or reviewing standards.

---

## TypeScript

- `strict: true` — no `any`, no `@ts-ignore`, no `// eslint-disable`
- Functions ≤ 20 lines, classes ≤ 200 lines
- No raw SQL outside repository adapters
- DI everywhere — no `new SomeRepository()` in services

---

## Repository signatures (mandatory)

```typescript
findById(id: string, tenantId: string): Promise<T | null>
findAllByTenant(tenantId: string, filters?: XxxFilters): Promise<T[]>
save(entity: T): Promise<void>
```

---

## Controller rules

- Controllers call use cases only — zero business logic
- No direct cross-context calls — data flows through events, BFF, or port+adapter
- No barrel `index.ts` in `ports/` or `shared/domain/` — import from the specific file. ESLint `no-restricted-imports` enforces this. Test builder barrels (`src/test/builders/`) are the only exception.
- Guards for a single context's endpoints: `src/contexts/<context>/infrastructure/guards/`. Cross-cutting guards only in `src/shared/guards/`.
- All configurable values read from `tenants.settings` — never hardcoded.
- Every new REST endpoint must have a corresponding request block in `apps/backend/http/<context>/<resource>.http` — happy path, all 4xx cases, edge cases.

---

## Domain error contract (mandatory)

Before writing any use case, define failure modes in `domain/errors/<context>-domain.error.ts` and register them in `infrastructure/http/<context>-error.mapper.ts`.

- Use cases throw domain errors for every non-happy-path condition.
- Never return `null`/`undefined` to signal not-found.
- Never throw `HttpException` from a use case.
- Never return a Result/Either type.
- Controller method = one line: `return this.useCase.execute(dto).catch(mapXxxError)`.
- **Controller early-exit guards:** use `return Promise.reject(new HttpException({...}, status))` — not `throw`. A synchronous `throw` bypasses the `.catch(mapXxxError)` chain when the method returns `Promise<T>`.

**Domain error base class (mandatory):**
```typescript
export class XxxDomainError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype); // ← required — instanceof fails without this
  }
}
```

---

## Naming conventions (mandatory)

| Artifact | Pattern | Example |
|---|---|---|
| Use case result type | `{UseCaseClassName}Result` | `ApproveBookingUseCaseResult` |
| Input DTO | `{Action}Dto` | `ApproveBookingDto` |
| Zod schema | `{Action}Schema` | `ApproveBookingSchema` |
| Public hotsite response type (`@ikaro/types`) | `Hotsite<Resource>Response` / `Hotsite<Resource>ListResponse` | `HotsiteManifestResponse`, `HotsiteServiceResponse` / `HotsiteServiceListResponse` |

- Never `*RequestDto`, `*InputDto`, `*Info`.
- When a path param must be combined with a request body, pass them as **separate arguments**: `execute(staffId, dto)` — never merge into a composite DTO.
- One DTO per use case.

---

## Domain events (mandatory)

- **Aggregate-driven events:** Aggregates record events via `this.addDomainEvent()` inside their domain methods — including system-initiated factory methods. Use cases flush via `aggregate.clearDomainEvents()` **after** `txManager.run()` completes.
- **Never** construct or publish events directly from a use case.
- **`correlationId`** must come from `RequestContext.correlationId`, not from a fresh `uuidv7()`. For `/internal` routes (no RequestContext), generate one `uuidv7()` at the top of the use case and pass it through.
- **Domain events belong in the publishing context.** `StaffInvited` in `staff/domain/events/`, not in `platform/`. Duplicate class definitions cause SonarCloud failures.
- **Thin vs fat events:** if data is persistently stored on the entity, the event carries only the ID. If data is transient (not stored, or represents point-in-time state), it must be in the payload.

---

## `/internal` routes and RequestContext

`/internal` routes skip `RequestInterceptor` — `RequestContext` is never populated for them. Use `/internal` only for auth-flow lookups where the caller passes `tenantId` explicitly. Management endpoints that need `tenantId`/`actorId` from context must live on a non-`/internal` path so `RequestInterceptor` runs.

`RequestModule` is **not** `@Global()`. Every module whose controller injects `RequestContext` must import `RequestModule` explicitly.

---

## Zod v4 validators

Use `z.uuid()` and `z.email()` — **never** `z.string().uuid()` / `z.string().email()`. The chained forms are deprecated in Zod v4 and flagged by SonarCloud.

---

## Default parameters

Default parameters must come **after** required parameters (SonarCloud S1788 MAJOR).

```typescript
// ❌ WRONG
create(name: string, slug: string, timezone = 'America/Sao_Paulo', adminEmail: string)

// ✅ CORRECT
create(name: string, slug: string, adminEmail: string, timezone = 'America/Sao_Paulo')
```

---

## Value objects — normalization boundary (mandatory)

VOs are the single normalisation boundary for their input type. When the DB returns an unexpected format (e.g. PostgreSQL `time` columns return `HH:MM:SS`), fix the VO's `create()` to normalise it — never add `.slice()` or format-stripping inside repository `toDomain()` mappers.

`TimeOfDay.create('09:00:00')` normalises to `'09:00'` — follow this pattern for any new VO.

---

## PhoneNumber HTTP format

HTTP request bodies (`contactPhone`, customer `phone`) must send digits only, no country-code prefix — 10–11 digits (`31999999999` ✓, `+5531999999999` ✗). `PhoneNumber.create()` strips non-digits and validates length 10–11. HTTP bodies go through `ZodValidationPipe` and will 400 if the prefix is included.

---

## Locale and display

- Email templates in pt-BR
- Money display as `R$ 1.234,56`
- Domain error messages are **English only** — pt-BR copy from UC specs is frontend UI copy, never in domain error constructors.

# BeloAuto — Anti-Patterns Reference (BLOCK MERGE)

> Canonical list. Loaded automatically by `/pre-pr`. See `CLAUDE.md §8` for the 7 highest-severity ones kept inline.

| Pattern | Problem | Fix |
|---|---|---|
| `WHERE id = ?` without `tenant_id` | Cross-tenant data leak | Add `AND tenant_id = ?` |
| Event missing `tenantId` in envelope | Can't isolate per tenant | Include in every event |
| Hardcoded `48`, `180`, `7` for business rules | Breaks per-tenant config | Read from `tenants.settings` |
| `@ts-ignore`, `any`, `eslint-disable` | Defeats static analysis | Fix the type/lint error |
| `.skip()` / `.only()` in tests | Hides failures in CI | Remove before commit |
| Synchronous call from Loyalty → Booking | Tight coupling | Subscribe to `BookingCompleted` event |
| `new XRepository()` inside a service | Untestable | Inject via DI |
| Same template body for all tenants | Breaks branding | Templates are per-tenant aggregates |
| Photo stored at `bookings/<id>/` without tenant prefix | No isolation | Path: `tenants/<tid>/bookings/<bid>/<file>` |
| Logging without `tenant_id` | Can't slice per-tenant | Add to structured log context |
| Running migrations at app startup | Unsafe for rolling deploys | Run as separate CI job before deploy |
| English copy in email templates | Wrong locale | All customer-facing text in pt-BR |
| Money as plain `number` | Loses currency | Use `Money { amount: Decimal, currency: 'BRL' }` |
| Import from `src/contexts/<B>/` inside Context A | Breaks context isolation | Only import from `src/shared/` or own context |
| SQL JOIN into another context's schema inside a repository | Hardest coupling — defeats schema independence, blocks port swapping | Repository queries its own schema only; cross-context data via events, BFF, or port+adapter |
| Cross-schema DB FK between contexts | Tight schema coupling | Store UUID only; no FK constraint across schemas |
| Event consumer querying another context to fill missing data | Defeats self-contained events | Add the needed data to the event payload |
| Placing a domain entity or use case in `src/shared/` | Blurs context ownership | Only ports, base classes, and multi-context VOs in shared |
| Exporting repository tokens from a `*.module.ts` | Makes repo injectable cross-module — BC isolation violation | Never export repository tokens; use BFF orchestration, events, or shared read-only port |
| Calling `save()` in a use case without `ITransactionManager.run()` | TypeORM's `save()` is a merge (internal SELECT + UPDATE/INSERT) — not atomic without a transaction. Single-aggregate writes have this problem too. | Wrap every `save()` in `txManager.run(async () => { await repo.save(entity); })`. Reads and business logic stay **outside** the transaction to keep it short. |
| Writing to two or more aggregates without `ITransactionManager.run()` | Partial DB failure leaves inconsistent state across aggregates | Wrap all saves together in one `txManager.run(async () => { ... })` call |
| Using `jest.fn()` to stub `IEventBus` or `ITransactionManager` | Misses state assertions; mock expectations are brittle | Use `InMemoryEventBus` / `InMemoryTransactionManager` from `src/test/infrastructure/` |
| Multiple `if (err instanceof X)` chains inside a controller method | Noisy, inflates cognitive complexity | Extract into a `mapXxxError(err: unknown): never` helper in `infrastructure/http/` |
| Placing a context-specific guard in `src/shared/guards/` | Misleads future agents — implies cross-cutting | Guards for a single context live in `src/contexts/<context>/infrastructure/guards/` |
| Barrel `index.ts` in `ports/` or `shared/domain/` directories | Hides symbol origins; circular dep risk | Import directly from the specific file; `no-restricted-imports` ESLint rule enforces this |
| Single `DATABASE_URL` connection string for TypeORM | Passwords with special chars (`@`, `:`, `/`) break silently | Use five explicit vars: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
| `TypeOrmModule.forRoot({ … process.env['X'] … })` | Env vars are `undefined` at import time (before dotenv) | Use `TypeOrmModule.forRootAsync({ useFactory: () => ({ … }) })` |
| `{{$env varName}}` in `.http` REST Client files | Reads OS env — resolves to empty string | Use `{{varName}}` for REST Client env vars; `{{$dotenv VAR}}` only for `.env` secrets |
| Duplicating a validation function (`isValidEmail`, etc.) across files | Two copies diverge silently | Extract into a shared value object in `src/shared/value-objects/` |
| Storing email, phone, address, money, colour as a plain `string` / `number` | Invalid values reach the domain silently | Wrap in a value object that validates on construction |
| Duplicating a utility function (deep merge, formatting, etc.) | Two copies diverge | Extract into `src/shared/utils/` |
| Aggregate field typed as `string` when a shared VO exists | Type system lies — invalid values stored in props | Type props with the VO; getters return the VO |
| `makeEntity()` helper or plain object literal used in a test | Couples test to TypeORM entity constructor; bypasses builder pattern | Create an `XxxEntityBuilder` in `src/test/builders/<context>/` |
| Seed file calling `CREATE TABLE`, `CREATE SCHEMA`, or `DROP TABLE` | Drift from migrations | Seeds are data-only; schema owned 100% by TypeORM migrations |
| `XxxEntityBuilder` with a hardcoded default `id` | Second `save()` silently upserts over first — isolation assertions fail | Default `id` to `uuidv7()` in every `XxxEntityBuilder` constructor |
| Controller directly injecting a repository token | Bypasses use-case layer — domain errors never thrown, HTTP mapping skipped | Controllers inject use cases only |
| `jest.fn()` mock for a use case in a controller unit test | Hides real behaviour; tests only delegation | Wire the real use case with `InMemoryXxxRepository` |
| Exporting constants or helpers from `main.ts` | `import { X } from '../main'` triggers bootstrap / `process.exit(1)` in tests | Move shared constants to a dedicated module file; `main.ts` may re-export them |
| Inline `schema.safeParse(body)` inside a controller method | Inconsistent with `ZodValidationPipe` + DTO pattern; loses typed `@Body()` | Define schema + `z.infer<>` type in `application/dtos/`; apply `@UsePipes(new ZodValidationPipe(schema))` |
| `z.string().uuid()` / `z.string().url()` | Deprecated in Zod v4 (SonarCloud S1874); `z.uuid()` rejects non-RFC-4122 test UUIDs | Use `z.uuid()` and `z.url()` directly; use RFC 4122-compliant UUIDs: `'10000000-0000-4000-8000-000000000001'` |
| Declaring a dynamic route (`@Get(':id')`) before a static route | NestJS resolves in declaration order — dynamic matches first | Always declare static/prefix routes first, then parameterized ones |
| Use case returns `null` / `undefined` instead of throwing a domain error | Controller must inspect the return value and decide HTTP status — business logic in the wrong layer | Use cases always throw domain errors for every non-happy-path; controller is one line: `return this.useCase.execute(dto).catch(mapXxxError)` |
| Throwing `HttpException` directly from a use case | Couples the application layer to HTTP — use cases must be framework-agnostic | Throw domain errors only; `mapXxxError` converts them to `HttpException` |
| Non-UUID string (e.g., `'non-existent-id'`) as path/query param for a PostgreSQL UUID column | PostgreSQL throws `QueryFailedError: invalid input syntax for type uuid` → 500 instead of expected 404/400 | Add `ParseUUIDPipe` to every `@Param`/`@Query` that maps to a UUID column; use valid-UUID-format IDs in integration tests |
| Integration test `it()` with only supertest `.expect(status)` and no Jest `expect()` call | SonarCloud S6957 BLOCKER — supertest's `.expect()` is invisible to Jest's assertion counter | Every `it()` must have at least one `expect()` call |
| `.catch(() => null)` on BFF backend HTTP calls | Swallows 5xx errors and timeouts — backend outage silently misdirects users | Only catch the expected failure status; rethrow everything else |
| `new Error('msg')` to mock `BackendHttpService` errors in BFF tests | Plain `Error` is not caught by `instanceof HttpException` checks | Mock errors as `new HttpException('Not Found', 404)` |
| Use case `execute()` return type named `*Info`, `*Dto`, raw `T[]`, or any ad-hoc name | Callers can't predict the type name | Name the result `{UseCaseClassName}Result`; define and export it in the same `.use-case.ts` file |
| Request DTO named `{Action}RequestDto`, `{Action}InputDto`, or any suffix other than `Dto` | Inconsistent naming | Use `{Action}Dto` only; Zod schema is `{Action}Schema` |
| Split DTO pattern: `{Action}RequestDto` (body) + `{Action}Dto` (body + path param) merged via `{ pathParam, ...dto }` | Two types for one use case input — unnecessary complexity | Pass path param and body as separate arguments: `execute(pathParam, dto)` |
| New domain error class added to `xxx-domain.error.ts` but not added to `mapXxxError` | Error falls through to the generic `XxxDomainError` catch → wrong HTTP status (e.g. 400 instead of 422) with no test failure | Every new `XxxSpecificError` must have its own `if (err instanceof XxxSpecificError)` branch in `mapXxxError` before the generic base-class catch |
| BFF response interface declared inline in a controller file (e.g. `export interface CancelBookingResponse { … }` inside `bookings.controller.ts`) | Inconsistent with the project convention; other response shapes in the same feature live in `xxxs.types.ts` | All API response interfaces for a BFF feature go in `apps/bff/src/xxxs/xxxs.types.ts`; import from there |

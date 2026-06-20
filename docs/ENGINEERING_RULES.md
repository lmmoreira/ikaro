# Ikaro — Engineering Rules (detail)

> **When to load:** writing any code, implementing event handlers, adding transactions, writing or reviewing tests, or working with value objects.
> Summary rules are in `CLAUDE.md §7`. This file has the full reference tables, patterns, and gotchas.

---

## Value Objects

Fields with domain validation → `src/shared/value-objects/` (never plain primitives):

| Field | Value Object | File |
|---|---|---|
| Email address | `Email` | `email.vo.ts` |
| Phone number | `PhoneNumber` | `phone-number.vo.ts` |
| Physical address | `Address` | `address.ts` |
| Money amount | `Money` | `money.ts` |
| Hex colour | `HexColor` | `hex-color.vo.ts` |
| IANA timezone | `Timezone` | `timezone.vo.ts` |
| HH:MM time | `TimeOfDay` | `time-of-day.vo.ts` |
| URL-safe slug | `Slug` | `slug.vo.ts` |

Every VO must have a `.spec.ts` covering valid and invalid inputs. PhoneNumber format and normalisation boundary rules → `docs/CODE_STANDARDS.md`.

### Option A — aggregate props typed as VOs (mandatory)

Aggregate props interfaces use VO types; getters return VOs; `create()` constructs VOs from raw strings; `reconstitute()` skips validation. JSONB columns require a double cast (`as unknown as XxxProps`).

→ Code patterns, mapper examples, in-memory repo comparisons: `docs/VALUE_OBJECTS_REFERENCE.md`.

### VO validation errors must be mapped, not just thrown

A VO's `create()` throws a plain `Error` when its format rules are too varied to fully replicate in a static Zod schema. `Address` is the concrete case: it validates against a country-specific `CountrySpec.postalRegex`/`statePattern`, while the DTO boundary can only check `.min(1).max(20)` — address formats vary too much across countries for one universal regex. `Money` and `PhoneNumber` don't hit this gap today because their DTO regex (E.164, currency code) is strict enough to fully replicate the VO's rule — but the gap exists in the same shape for any VO whose DTO check is necessarily loose.

Every `mapXxxError(err: unknown): never` ends with `if (err instanceof Error) throw err;` before the final `throw new Error(...)` fallback. A plain `Error` from a VO falls through that line unchanged and becomes an unhandled 500 instead of a 400.

If a VO's validation can fail in a way the DTO boundary doesn't fully prevent:
1. Give it a typed error class in the VO's own file: `export class XxxValidationError extends Error { constructor(message: string) { super(message); Object.setPrototypeOf(this, new.target.prototype); this.name = 'XxxValidationError'; } }`.
2. Throw that instead of plain `Error` from every validation branch in `create()`.
3. Add an `instanceof XxxValidationError` branch (→ 400) to **every** context's error mapper that calls the VO's `create()` — a shared VO can be called from multiple contexts (`Address` is called from both `booking` and `customer`).

---

## Transactions

Every `save()` in every use case must be wrapped in `ITransactionManager.run()` — including single-aggregate writes. TypeORM's `save()` is a merge (internal SELECT + UPDATE/INSERT); without a transaction those two DB ops are not atomic.

**Scope rule:** wrap only the `save()` call(s) — reads, validations, and domain mutations happen *before* `txManager.run()` opens.

**Multi-aggregate writes:** wrap all saves together in a single `txManager.run()`.

**Test wiring:** inject `new InMemoryTransactionManager()` in every unit/controller spec: `{ provide: TRANSACTION_MANAGER, useValue: new InMemoryTransactionManager() }`. For integration: import `TransactionManagerModule`.

**Repository transaction-awareness:** write methods check `getActiveEntityManager()` — use active `EntityManager` if present, else fall back to `this.repo`. Read methods do not need this.

| Artifact | Location |
|---|---|
| Port | `src/shared/ports/transaction-manager.port.ts` |
| Real adapter | `src/shared/infrastructure/typeorm-transaction-manager.ts` |
| Global module | `src/shared/infrastructure/transaction-manager.module.ts` |
| Test double | `src/test/infrastructure/in-memory-transaction-manager.ts` |
| Context propagation | `src/shared/infrastructure/transaction-context.ts` |

---

## RequestContext (per-request shared state)

`RequestContext` (`src/shared/request/request-context.ts`) is populated once per HTTP request by `RequestInterceptor` — `tenantId`, `correlationId`, optional `actorId`/`actorType`/`actorRole`, and `settings: TenantSettingsProps` (the tenant's full `tenants.settings` JSONB, eager-loaded via `ITenantSettingsPort` before the request reaches any handler).

**Prefer eager-loading into `RequestContext` over a new Port + Adapter when** the data is read by *many* contexts within the same request — tenant settings/localization/business hours are the textbook case — and is already fetched once, cheaply, at request start. Before the TD02-S04 cleanup, four separate contexts (`booking`, `customer`, `loyalty`, `notification`) each maintained their own Port + Adapter to re-fetch a different slice of the same `tenants.settings` row, duplicating the DB round-trip per use case that needed it within a single request.

**`RequestContext` is HTTP-request-scoped only — never read it from shared infrastructure.** Its `AsyncLocalStorage` store is populated exclusively by `RequestInterceptor`, which only runs in the HTTP request pipeline. Two other invocation contexts call into the same repositories and services with no interceptor in front of them:
- **Cron jobs** (`*.job.ts`) — triggered by an internal HTTP endpoint, but the job's per-tenant loop body runs outside any single request's interceptor.
- **Event handlers** (`infrastructure/events/*.handler.ts`) — Pub/Sub delivery, no HTTP request at all.

A repository or adapter that reads `this.requestContext.settings` works fine when called from a use case (always HTTP-request-scoped) but throws `Cannot read properties of undefined (reading 'settings')` the moment it's reached from a cron job or an event handler's cross-context adapter call chain — and both paths exist for the same shared repositories (`TypeOrmBookingRepository`, `TypeOrmServiceRepository`).

**Rule:**
- **Use cases** — single invocation context (HTTP) — may inject `RequestContext` directly and read `.settings`, `.tenantId`, etc.
- **Shared infrastructure** (repositories, anything called from more than one invocation context) — must take `tenantId` as an explicit method parameter and read settings via a `tenantId`-parameterized port (`ITenantSettingsPort.getSettings(tenantId)`), never ambient context.

| Artifact | Location |
|---|---|
| `RequestContext` | `src/shared/request/request-context.ts` |
| `RequestInterceptor` (populates it) | `src/shared/request/request.interceptor.ts` |
| `ITenantSettingsPort` (tenantId-parameterized, for shared infra) | `src/shared/ports/tenant-settings.port.ts` |
| Real adapter | `src/contexts/platform/infrastructure/cross-context/platform-tenant-settings.adapter.ts` |
| Test builder | `src/test/factories/request-context.factory.ts` (`RequestContextBuilder`) |
| Test double for the port | `src/test/infrastructure/in-memory-tenant-settings.port.ts` |

---

## Static locale/config files in workspace packages

`packages/i18n/locales/**` (and any future non-TypeScript static assets in a workspace package) sit outside that package's `src/`/`tsconfig.json` `include` — they are never compiled or copied into `dist/`. Importing them via a TS `import` statement only works in the source tree and silently breaks once the consuming app runs compiled JS.

Read them via Node's own module resolution instead, which works identically in dev (`ts-node`) and compiled prod:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const localesRoot = join(dirname(require.resolve('@ikaro/i18n/package.json')), 'locales');
const data = JSON.parse(readFileSync(join(localesRoot, locale, 'notifications.json'), 'utf-8'));
```

`require.resolve('<package>/package.json')` always resolves to the package root regardless of whether the package ships `src/` or `dist/` — `package.json` is never excluded from a build. Read all supported locales once in the constructor (`JsonLocalizationAdapter` is the model here) rather than re-reading per call.

---

## Event Handlers (Pub/Sub consumers)

Handlers live in `<context>/infrastructure/events/`. They are **infrastructure**, not application layer.

- **Thin by law:** `handle()` calls exactly one use case and rethrows any error. Zero domain logic inside a handler.
- **Subscribe in `onModuleInit()`** via `eventBus.subscribe(eventName, handler, consumerName)`. `consumerName` determines the Pub/Sub subscription name — unique per consumer.
- **Rethrow errors** — Pub/Sub nacks and retries. Never swallow errors.
- **Idempotency in the use case** — DB check via `findByXxx`. No in-memory sets (lost on restart, not shared across pods).
- **`correlationId` propagation** — pass `event.correlationId` into the use case DTO; never generate a new UUID in the handler.

**Pub/Sub naming (one topic per event type):**

| Thing | Pattern | Example |
|---|---|---|
| Topic | `ikaro-{eventName}` | `ikaro-StaffInvited` |
| Subscription | `ikaro-{eventName}-{consumerName}` | `ikaro-StaffInvited-notification` |

`GcpPubSubEventBusAdapter` auto-creates topics/subscriptions on `onApplicationBootstrap()`. Local dev: `PUBSUB_EMULATOR_HOST=localhost:8085`.

**Test wiring for event handlers:**

| Test type | Event bus | When to use |
|---|---|---|
| Handler unit spec | `InMemoryEventBus` + call `handler.handle(event)` directly | Handler → use case logic in isolation |
| Story integration spec | Real `EventBusModule` (no override) + `waitFor()` | Full publish → Pub/Sub → handler → DB chain |
| Controller integration spec | Override `EVENT_BUS` with `InMemoryEventBus` | HTTP layer — no Pub/Sub needed |

`waitFor()` at `src/test/utils/wait-for.ts`. Use in story integration specs to poll async side effects.

---

## Testing Patterns (detail)

Full mandatory rules → `docs/08-TESTING_STRATEGY.md §Mandatory Patterns`.

### Builder pattern (mandatory)

All test data uses builder classes with fluent `withXxx()` / `build()`. Never plain factory functions or raw object literals in specs.

Builder types:
- `XxxEntityBuilder` — TypeORM entity builders
- `XxxBuilder` — aggregate builders
- `RequestContextBuilder` — shared request-context stub

### InMemory doubles

Prefer InMemory classes over `jest.fn()` for any port or repository:
- `InMemoryEventBus` — event bus
- `InMemoryTransactionManager` — transaction manager
- `InMemoryXxxRepository` — per-context repos
- `InMemoryXxxPort` — cross-context ports (in `src/test/infrastructure/`)

### Integration test DB isolation

Unique inline tenant UUID for any `it()` sensitive to aggregate counts. Never reuse `TENANT_A`/`TENANT_B` for count assertions — cross-test contamination.

### Integration app helpers — mandatory default overrides

Every integration app helper that imports a module with a network-calling adapter must default-override that adapter's token with an in-memory stub **before** the caller's overrides run (caller wins):

```ts
let builder = Test.createTestingModule({ imports: [..., BookingModule] })
  .overrideProvider(EVENT_BUS).useValue(routingBus)
  .overrideProvider(STORAGE_SERVICE).useValue(new InMemoryStorageService()); // default

for (const { provide, useValue } of overrideProviders) {
  builder = builder.overrideProvider(provide).useValue(useValue); // caller wins
}
```

Current helpers and required default overrides:

| Helper | Default override |
|---|---|
| `createBookingIntegrationApp()` | `STORAGE_SERVICE` → `InMemoryStorageService` |
| `createNotificationIntegrationApp()` | `STORAGE_SERVICE` → `InMemoryStorageService` |

When adding a new shared module with a network-calling adapter, update every helper that imports it.

### NestJS module provider pattern (useClass not useExisting)

```ts
// ❌ WRONG — adapter instantiated even when STORAGE_SERVICE is overridden in tests
providers: [GcsSignedUrlAdapter, { provide: STORAGE_SERVICE, useExisting: GcsSignedUrlAdapter }]

// ✅ CORRECT — overriding STORAGE_SERVICE fully prevents instantiation
providers: [{ provide: STORAGE_SERVICE, useClass: GcsSignedUrlAdapter }]
```

**Why:** `useExisting` creates an alias but registers the class as a standalone provider too. Test `overrideProvider()` removes the alias; the standalone class is still instantiated — and any `onApplicationBootstrap` network calls run, causing `ECONNREFUSED`.

### Notification spec setup

Use `createNotificationIntegrationApp()`; suppress unrelated handlers; drain provisioning noise before recording idempotency baseline. See `docs/08-TESTING_STRATEGY.md`.

### Migration / entity registration

Every new migration class and TypeORM entity must be added to `src/test/integration-global-setup.ts` (and to any context-specific helper like `notification-integration-app.ts`) in the **same commit** as the migration file. Skipping causes silent failures — unit tests pass but integration tests error on the first DB query.

### BFF tests

Two test files per controller: `.spec.ts` (unit) + `.component.spec.ts` (component). Helper-file isolation:
- `component-test.helpers.ts` — for component specs only
- `backend-http.mock.ts` — for unit specs only

`test:cov` must exclude component specs — coverage instruments `AppModule` at import time, triggering `validateEnv` before env vars are set.

---

## Web — Formatting Utilities (`apps/web`)

### All format functions belong in `lib/formatting/`

Any function that takes `locale`, `currency`, `timezone`, or `dateFormat` as a parameter belongs in `apps/web/lib/formatting/` — not in a domain-scoped folder like `lib/booking/` or `lib/hotsite/`. The boundary test: *if the function would work identically in the booking flow and the hotsite, it's a formatter, not a domain function.*

Current `lib/formatting/` inventory:

| File | Exports |
|---|---|
| `format-money.ts` | `formatMoney(amount, locale, currency)` |
| `format-duration.ts` | `formatDuration(minutes)` |
| `format-time.ts` | `formatTime`, `formatDate`, `formatDateLong`; re-exports `DateFormat` from `@ikaro/i18n` |
| `date-utils.ts` | `toISODate`, `addDays` — pure date math |
| `locale-validators.ts` | `isValidTimezone`, `resolveDateFormat` |
| `formatting-context.ts` | `FormattingContext`, `FormattingState` |
| `use-formatting.ts` | `useFormatting()` hook |

### `DateFormat` and `TimeFormat` types — use `@ikaro/i18n`

`DateFormat` (`'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'`) and `TimeFormat` (`'24h' | '12h'`) are exported from `packages/i18n` — they derive from `CountrySpec` which already defines them. Import from there, never redefine locally:

```ts
import type { DateFormat, TimeFormat } from '@ikaro/i18n';
```

### NBSP normalization in `Intl.NumberFormat` output

`Intl.NumberFormat` for currency formatting emits non-breaking spaces that vary by locale:
- `U+00A0` (NBSP) — `pt-BR` between `R$` and the amount; `ru-RU` emits two of them
- `U+202F` (narrow NBSP) — `fr-FR` between digits and currency symbol

A bare `.replace(' ', ' ')` is wrong in two ways: no `g` flag (misses duplicates) and misses `U+202F`. Always use:

```ts
.replace(/[  ]/g, ' ')
```

### `reconstitute()` skips domain validation — guard at the web boundary

`TenantSettings.reconstitute()` (used when loading an entity from the DB) deliberately skips validation to avoid erroring on rows written before a validation rule existed. Any web code that consumes a field loaded via `reconstitute()` — such as `timezone` from the hotsite manifest — must apply a defensive guard before passing the value to a strict API like `Intl.DateTimeFormat`:

```ts
// BAD — trusts that DB row is valid; Intl throws on malformed timezone
const timezone = manifest.localization.timezone;

// GOOD — falls back to 'UTC' if DB value is malformed
const timezone = isValidTimezone(manifest.localization.timezone)
  ? manifest.localization.timezone
  : 'UTC';
```

`isValidTimezone` is in `lib/formatting/locale-validators.ts`. The same pattern applies to any manifest field whose DB-level validity is enforced only by `create()`, not `reconstitute()`.

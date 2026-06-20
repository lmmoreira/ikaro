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

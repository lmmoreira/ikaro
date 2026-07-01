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

## Partial-update types for deeply-nested Zod schemas

`Partial<T>` only makes a type's **outer** keys optional — fields inside a nested object stay fully required. When a Zod schema chains `.partial()` at more than one nesting level (e.g. `settings.businessInfo.address`, where each address field is independently optional), `Partial<TenantSettings>` does **not** match what the schema actually accepts: TypeScript rejects passing the Zod-inferred body into a function typed with `Partial<TenantSettings>`, because `Partial<>` requires `address`, if present, to have every `BusinessInfoAddress` field populated — Zod's `.partial()` on the inner schema allows any subset.

Define an explicit input type that mirrors the schema's real nesting depth instead of reaching for `Partial<T>` on the whole structure:

```typescript
// Matches what the Zod schema actually produces — not Partial<TenantSettings>
export interface TenantSettingsUpdateInput {
  loyalty?: Partial<TenantLoyaltySettings>;       // flat — Partial<> is correct here
  businessInfo?: {
    phone?: string | null;
    address?: Partial<TenantBusinessInfoAddress> | null;  // nested — needs its own Partial<>
  };
}
```

Apply `Partial<>` at the level where the schema actually stops requiring all fields together — one level per `.partial()` in the Zod chain, not once at the top.

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
- **Controllers** — the only layer that may inject `RequestContext`. Extract `tenantId`, `actorId`, `correlationId`, and any `settings.*` fields needed, then forward them as explicit DTO fields to the use case. **Use cases must never inject `RequestContext`.**
- **Use cases and application services** — must not inject `RequestContext`. All caller context is passed via the input DTO. This keeps use cases callable from event handlers, scheduled jobs, and cross-context adapters without an HTTP request in scope.
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

## Controller, Route, and Shared-UI Boundaries

- Controllers and route files are composition layers only. They may parse input and choose the use case/helper, but branching policy and response shaping belong in the owning slice.
- Feature-specific transport helpers should live with the feature or capability that owns them. Generic buckets are for cross-cutting code only.
- Shared UI primitives should expose readonly props where practical, so consumers cannot mutate shared contracts by accident.
- Any `dangerouslySetInnerHTML` usage must go through a controlled helper or component with an explicit sanitization path; never inline raw HTML injection in a page or reusable component.

---

## Backend read use cases for cross-context access

Cross-context adapters must depend on the source context's exported read use cases, not exported `*QueryService` wrappers. Query services tend to become repository pass-throughs and create a second application API beside the use-case layer.

Use this naming pattern:

| Need | Pattern |
|---|---|
| Single aggregate lookup | `Get<Entity>ByIdUseCase` (e.g. `GetCustomerByIdUseCase`, `GetBookingByIdUseCase`) |
| List/search read | `Get<Entities>UseCase` with a filter DTO (e.g. `GetTenantsUseCase`, `GetServicesUseCase`, `GetStaffUseCase`) |

Broad read use cases should accept filters such as `ids`, `status`, `roles`, `search`, `limit`, and `offset` when those dimensions are natural for the aggregate. Avoid super-narrow readers like `GetManagerEmailsUseCase` or `GetServiceNamesUseCase`; return a stable DTO for the aggregate and let the caller map the field it needs. If the correct breadth is unclear, stop and discuss the read contract before adding a new use case.

Response shaping follows the same rule: keep the canonical read use case focused on retrieving the aggregate data, then map the caller-specific view at the boundary that owns that contract. Valid boundaries are controllers, cross-context adapters, BFF mappers, and client-side helpers. Inline mapping is fine for a single caller; extract a DTO or mapper only when the shaped output is reused in more than one place or needs to be shared as a type. Example: `GetBookingByIdUseCase` stays the canonical booking read, while `booking.controller.ts` or a BFF mapper can project it into the response shape a specific caller needs.

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

## Adding a new notification type

Every new `NotificationTemplateKey` touches several files across layers — miss one and the failure mode is silent (a notification that never sends, with no error). Do them in this order:

1. **`notification/domain/notification-template-key.enum.ts`** — add the new kebab-case key (e.g. `BOOKING_NO_SHOW_CUSTOMER = 'booking-no-show-customer'`).
2. **`notification/domain/notification-template-key.mapping.ts`** — add the `{eventName, recipientType}` entry. `notification-template-key.mapping.spec.ts` asserts every enum key has a mapping entry — it fails loudly if you forget this one.
3. **Both** `packages/i18n/locales/pt-BR/notifications.json` **and** `packages/i18n/locales/en/notifications.json` — add `{eventName}.{recipientType}.{subject,body}`. The migration's `buildSeedRows()` throws at migration-run time if either locale is missing the key — there is no silent partial-locale state.
4. **A new migration** to insert the global default rows for the new key (`tenant_id IS NULL`) — do **not** edit `1748100000010-CreateNotificationTemplates.ts` directly once real tenant data exists; that migration has already run in every environment with history. (Editing it in place is only safe pre-production with no deployed history to protect — see the squashing precedent from TD02-S09/S10 — and stops being safe the moment this ships to a real environment.)
5. **A new `send-<trigger>-notification.use-case.ts`** extending `BaseNotificationUseCase`: inject `ILocalizationPort`, fetch templates via `findAllByTriggerEvent`, call `this.localizeTemplates(templates, this.localizationPort, locale)` before `dispatchTemplates`/`dispatchTemplatesToMany` — never read `template.subject`/`template.body` directly, the DB row's own content is not the source of truth.
6. **An event handler** in `infrastructure/events/` if triggered by a domain event (thin — calls exactly one use case, per the Event Handlers rules below), plus provider registration in `notification.module.ts`.
7. **Tests:** a unit spec for the use case using `InMemoryLocalizationPort.setTemplate('EventName:recipientType', {...})` (defaults to `pt-BR`; use `setTemplateForLocale(key, locale, {...})` to also cover `en`), a handler spec if applicable, and a tenant-isolation assertion.

**Gotcha — existing tenants don't automatically get new template rows.** `copyGlobalDefaultsForTenant` only runs once, on `TenantProvisioned` (new-tenant creation). Adding a new key seeds the *global* default row fine, but every tenant provisioned *before* that migration has no per-tenant copy — `findAllByTriggerEvent(tenantId, NEW_KEY)` returns empty, the use case's `templates.length === 0` guard fires, and the notification silently never sends for any pre-existing tenant. There is currently no backfill mechanism. If a new notification type must reach existing tenants, the new migration must also `INSERT ... SELECT` the new global row into every existing tenant's rows directly (mirroring `copyGlobalDefaultsForTenant`'s own query), not rely on the provisioning event.

---

## Authoring new i18n UI copy keys (`packages/i18n/locales/*/web.json`)

- Always add the key to **both** `pt-BR/web.json` and `en/web.json` in the same commit — never ship a key in one locale only.
- Namespace by UI area, matching existing top-level keys (`hotsite.*`, `auth.*`, `booking.*`, `seo.*`, etc.) rather than inventing a new top-level namespace for a feature that belongs under an existing one.
- Use ICU placeholders (`{name}`, `{location}`) for interpolated values — see `seo.defaultTitleWithLocation` for the pattern — never string-concatenate translated fragments.
- Server Components call `useTranslations()` directly (no `'use client'` needed — see Code Standards). Only reach for a Context-based hook like `useFormatting()` when the value also depends on tenant-specific formatting (currency, date), not just translated text.

---

## Staff OAuth login URL format (BFF `GoogleAuthGuard`)

`GoogleAuthGuard.getAuthenticateOptions` constructs the OAuth state from two **separate** query params — it does **not** read a `?state=` param. Any frontend page or email link that starts the staff OAuth flow must use this format:

| Scenario | URL |
|---|---|
| Regular staff login button | `${NEXT_PUBLIC_BFF_URL}/auth/google?type=staff` |
| Invite email link (first login) | `${NEXT_PUBLIC_BFF_URL}/auth/google?type=staff&tenantSlug=<slug>` |

**Common mistake:** `?state=__staff__` or `?state=__staff__:slug` — these are the *encoded* state strings the guard sends to Google internally. Passing them in the browser URL has no effect; the guard ignores the `state` query param and always derives the state from `type`/`tenantSlug`. Both the shared prototype (`shared/staff-login.html`) and the original M13-S13 story spec had this wrong — caught only during a real Google OAuth login attempt in M13-S13.

The existing customer login in `app/[slug]/login/page.tsx` (which uses `${NEXT_PUBLIC_BFF_URL}/auth/google?tenantSlug=${slug}`) follows the same pattern — there is no `type=customer` param because the guard defaults to the customer path when `type` is absent.

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

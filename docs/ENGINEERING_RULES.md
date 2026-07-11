# Ikaro — Engineering Rules (detail)

> **When to load:** writing any code, implementing event handlers, adding transactions, writing or reviewing tests, or working with value objects.
> Summary rules are in `CLAUDE.md §7`. This file has the full reference tables, patterns, and gotchas.

---

## Repository slice ownership

- **Backend:** bounded-context first. Canonical roots live under `apps/backend/src/contexts/<context>/`.
- **BFF:** feature first. Business-owned code lives under `apps/bff/src/features/<capability>/`; `auth` and `uploads` are technical slices, not bounded contexts.
- **Web:** domain feature first. Business-owned code lives under `apps/web/features/<domain>/`; `dashboard` and `hotsite` are shell slices only.
- **Shared:** `shared/` is cross-cutting only. If a file has slice-specific policy, it belongs next to the owning feature or shell.
- **Transitional roots:** current flat capability folders and generic buckets are allowed only while the TD21 migration is in flight. New code should land in the target slice path.

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

### VO validation errors must be mapped with a typed `code` (`DomainErrorShape`)

Every VO's `create()` throws a typed error class implementing `DomainErrorShape` (`{ code: string; field?: string }`) — never a bare `Error`. A plain `Error` falls through every `mapXxxError`'s `if (err instanceof Error) throw err;` line unchanged and becomes an unhandled 500 instead of a shaped 400. Pattern (mirrors `AddressValidationError` in `shared/value-objects/address.ts`):

```typescript
export class XxxValidationError extends Error implements DomainErrorShape {
  readonly code: XxxErrorCode;
  constructor(message: string, code: XxxErrorCode) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'XxxValidationError';
    this.code = code;
  }
}
```

`code` is typed against that VO's own literal union in `packages/types/src/error-codes.ts` (e.g. `PhoneErrorCode`, `EmailErrorCode`) — never `string` — so a code outside the catalog is a compile error (TD23 §9).

Wire an `instanceof XxxValidationError` branch (→ 400) into **every** context's error mapper that calls the VO's `create()` — a shared VO can be called from multiple contexts (`Address` is called from both `booking` and `customer`). Once a second mapper needs the same branch, extract a shared `mapSharedXxxError()` helper into `shared/http/` (see `address-validation-error.mapper.ts`) instead of duplicating it — SonarCloud's new-code-duplication gate fails on the second copy.

### Single source of truth for a validation rule's code

A business rule gets **one** code, owned by whichever layer defines it — not one code per layer that happens to check it:

- **A rule backed by a VO** (its predicate is `Xxx.isValid()`) — every other layer that also checks it (a Zod `.refine(Xxx.isValid, ...)` in a backend DTO or a BFF schema mirroring the same field) **imports and reuses that VO's code**. A `.refine(PhoneNumber.isValid, ...)` failure must emit the same `PhoneErrorCode.FORMAT_INVALID` the VO itself throws — never a second, bespoke code for the identical rule.
- **A rule with no VO behind it** (Zod-native `.min()`/`.max()`/required-field/enum checks with no domain VO — most numeric/length bounds and fixed-choice fields) — these share a small closed `GenericErrorCode` set (`FIELD_REQUIRED`, `VALUE_TOO_SHORT`, `VALUE_TOO_LONG`, `VALUE_OUT_OF_RANGE`, `FORMAT_INVALID`, `VALUE_INVALID` — the last for `z.enum()`/`z.union()`/unrecognized-key mismatches, i.e. Zod's `invalid_value`/`invalid_union`/`unrecognized_keys` issue codes), disambiguated by `field`/`params` — not one bespoke code per call site. Mirrors `AddressErrorCode.FIELD_REQUIRED` already being reused across 5 different address fields instead of five separate codes.

Why this matters: if the same rule gets two different codes depending on which layer catches it first (a BFF Zod schema vs. the backend VO), the frontend shows an inconsistent message for the identical violation depending on request timing — the exact defect `td/TD23-EXCEPTION-HANDLING-I18N-PATTERN.md` exists to remove.

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
- Controller input must be validated at the boundary. Prefer `@Body(new ZodValidationPipe(Schema))` or `@Query(new ZodValidationPipe(Schema))` with a typed DTO over raw `@Body('x')`, `@Query('x')`, or `@Param('x')` reads when the endpoint accepts structured input.
- Do not treat `/internal` routes as a shortcut around validation. They still need explicit DTO or pipe validation for every externally supplied value.
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

## `/internal/` routes are pre-auth only

Backend `/internal/` routes bypass `RequestInterceptor` entirely and exist for exactly one purpose: auth-flow calls made **before** a JWT exists — OAuth callbacks (`handleStaffLogin`, `findOrCreate`, `link-google`). If the BFF can reach the endpoint with actor headers already available (`X-Actor-ID`/`X-Actor-Type`/`X-Actor-Role`, via `buildBackendHeaders(req)`), the endpoint is not internal — it belongs on the regular authenticated controller, reading the actor from `RequestContext` instead of a URL/query param. A BFF method whose only use of `@CurrentUser()` is to build an `/internal/` URL is the signal the endpoint is misplaced (see `docs/ANTI_PATTERNS.md`'s `@CurrentUser()`/`/internal/` row).

---

## Event Handlers (Pub/Sub consumers)

Handlers live in `<context>/infrastructure/events/`. They are **infrastructure**, not application layer.

- **Thin by law:** `handle()` calls exactly one use case and rethrows any error. Zero domain logic inside a handler.
- **Subscribe in `onModuleInit()`** via `eventBus.subscribe(eventName, handler, consumerName)`. `consumerName` determines the Pub/Sub subscription name — unique per consumer.
- **Rethrow errors** — Pub/Sub nacks and retries. Never swallow errors.
- **Idempotency in the use case** — DB check via `findByXxx`. No in-memory sets (lost on restart, not shared across pods).
- **`correlationId` propagation** — pass `event.correlationId` into the use case DTO; never generate a new UUID in the handler.
- **Never hand-type the event/trigger name as a literal at the subscribe/register call site.** `DomainEvent.eventName` is derived from `this.constructor.name` in the base class (`domain-event.ts`) — subscribe with `subscribe<StaffInvited>(StaffInvited.name, ...)`, not a `'StaffInvited'` string that can silently drift from the class if either is renamed. Cron triggers have no backing class, so they get a small exported `const` instead (e.g. `CRON_REMINDERS_TRIGGER` in `cron-trigger-names.constants.ts`), shared between the publishing controller and every subscribing handler. Each trigger handler also declares `static readonly CONSUMER_NAME` (mirrors `CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME`) instead of retyping the consumer-name string. The literal becomes the real Pub/Sub topic/subscription name (`ikaro-{eventName}`) — a typo here silently creates a dead channel no one publishes to correctly, not just a lint nit (M17-S03).

**Pub/Sub naming (one topic per event type):**

| Thing | Pattern | Example |
|---|---|---|
| Topic | `ikaro-{eventName}` | `ikaro-StaffInvited` |
| Subscription | `ikaro-{eventName}-{consumerName}` | `ikaro-StaffInvited-notification` |

Cron triggers (`*.job.ts`, M17-S03) use the identical naming pattern via `registerTrigger`/`publishTrigger` (`ITriggerBus`) — `{eventName}` is the trigger name (e.g. `cron-reminders`), not a `DomainEvent` name. See `trigger-bus.port.ts` for why triggers are a separate channel from `IEventBus`.

`GcpPubSubEventBusAdapter` auto-creates topics/subscriptions on `onApplicationBootstrap()`. Local dev: `PUBSUB_EMULATOR_HOST=localhost:8085`.

**Test wiring for event handlers:**

| Test type | Event bus | When to use |
|---|---|---|
| Handler unit spec | `InMemoryEventBus` + call `handler.handle(event)` directly | Handler → use case logic in isolation |
| Story integration spec | Real `EventBusModule` (no override) + `waitFor()` | Full publish → Pub/Sub → handler → DB chain |
| Controller integration spec | Override `EVENT_BUS` with `InMemoryEventBus` | HTTP layer — no Pub/Sub needed |
| Push-endpoint integration spec | Real `PubSubPushController` + `PubSubPushGuard` (verifier port overridden via DI, not the guard itself) + supertest against a synthetic push envelope | `PUBSUB_CONSUMER_MODE=push` — HTTP → guard → `dispatchPushMessage()` → handler, no real Pub/Sub or emulator needed (M17-S02) |
| Trigger-handler spec | `InMemoryEventBus`/`RoutingInMemoryEventBus` (`ITriggerBus` — `registerTrigger`/`publishTrigger`, aliased to `EVENT_BUS`) + supertest against the cron controller's `POST` route | Cron ticks (`*.job.ts`), not domain events — no `tenantId`, no `DomainEvent` envelope. Controller `publishTrigger()`s, `RoutingInMemoryEventBus` dispatches synchronously to the registered `XxxTriggerHandler`, which calls exactly one job (M17-S03) |

`waitFor()` at `src/test/utils/wait-for.ts`. Use in story integration specs to poll async side effects.

---

## Testing Patterns (detail)

Full mandatory rules → `docs/08-TESTING_STRATEGY.md §Mandatory Patterns`.

### Builder pattern (mandatory)

All test data uses builder classes with fluent `withXxx()` / `build()`. Never plain factory functions or raw object literals in specs.

Builder types:
- `XxxEntityBuilder` — TypeORM entity builders
- `XxxBuilder` — aggregate builders
- `XxxEventBuilder` / `XxxCommandBuilder` — `DomainEvent`/`Command` builders (e.g. `StaffInvitedEventBuilder`, `BookingReminderDueCommandBuilder`) — mandatory for any event/command class constructed inline in more than one spec file
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

### Reuse the shared Nest cache test module

Any integration test harness that needs `CacheModule` wiring must import `apps/backend/src/test/utils/test-cache-module.ts` instead of copy-pasting `CacheModule.register(...)` inline — keeps cache TTL/store config consistent across every harness that needs it.

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

## Web — Shared Helpers (`apps/web`)

### Shared format functions belong in `shared/lib/formatting/`

Any function that takes `locale`, `currency`, `timezone`, or `dateFormat` as a parameter belongs in `apps/web/shared/lib/formatting/` — not in a feature-owned folder like `features/booking/` or `features/platform/hotsite/`. The boundary test: *if the function would work identically in the booking flow and the hotsite, it's shared formatting, not domain logic.*

Current `shared/lib/formatting/` inventory:

| File | Exports |
|---|---|
| `format-money.ts` | `formatMoney(amount, locale, currency)` |
| `format-duration.ts` | `formatDuration(minutes)` |
| `format-time.ts` | `formatTime`, `formatDate`, `formatDateLong`; re-exports `DateFormat` from `@ikaro/i18n` |
| `date-utils.ts` | `toISODate`, `addDays` — pure date math |
| `locale-validators.ts` | `isValidTimezone`, `resolveDateFormat` |
| `formatting-context.ts` | `FormattingContext`, `FormattingState` |
| `use-formatting.ts` | `useFormatting()` hook |

### Other shared web helpers

- `apps/web/shared/lib/api/` owns the browser/server BFF transport helpers that multiple features need.
- `apps/web/shared/lib/i18n/` owns the shared Next Intl request helpers and locale resolution logic.
- `apps/web/shared/utils/` owns pure helpers like phone formatting, date math, and initials.
- Feature-specific helpers should live under `apps/web/features/<domain>/...`; shell-specific helpers should live under `apps/web/shells/<surface>/...`.

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

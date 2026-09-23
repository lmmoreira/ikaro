# Ikaro — Engineering Rules: Shared / Cross-Cutting

> **When to load:** writing any code (baseline), value objects, exception/i18n handling, RequestContext, observability, controller/route boundaries.
> Split from `docs/ENGINEERING_RULES.md` (TD41-S4, 2026-09-23). Summary rules are in `CLAUDE.md §7`.

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
| ISO country code | `CountryCode` | `country-code.vo.ts` |
| SEO page title | `SeoTitle` | `seo-title.vo.ts` |
| SEO meta description | `SeoDescription` | `seo-description.vo.ts` |

Every VO must have a `.spec.ts` covering valid and invalid inputs. PhoneNumber format and normalisation boundary rules → `docs/CODE_STANDARDS.md`.

**Adding a new VO:** also add its concept entry to `packages/architecture-check/architecture-policy.json`'s `aggregateValueObjectRegistry` (exact field names or a camelCase suffix rule, mapped to the VO's class name) — this is what `pnpm architecture-check`'s `aggregate-primitive-vo` detector (TD37-S09) uses to flag a future aggregate field for that concept left as a plain primitive. A brand-new *aggregate* that reuses an already-registered concept needs no registry change — the check is concept-driven, not per-aggregate.

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
- **A rule with no VO behind it** (Zod-native `.min()`/`.max()`/required-field/enum checks with no domain VO — most numeric/length bounds and fixed-choice fields) — these share a small closed `GenericErrorCode` set (`FIELD_REQUIRED`, `VALUE_TOO_SHORT`, `VALUE_TOO_LONG`, `VALUE_OUT_OF_RANGE`, `FORMAT_INVALID`, `VALUE_INVALID` — the last for `z.enum()`/`z.union()`/unrecognized-key/invalid-map-or-set-key-or-element mismatches, i.e. Zod's `invalid_value`/`invalid_union`/`unrecognized_keys`/`invalid_key`/`invalid_element` issue codes), disambiguated by `field`/`params` — not one bespoke code per call site. Mirrors `AddressErrorCode.FIELD_REQUIRED` already being reused across 5 different address fields instead of five separate codes.

Why this matters: if the same rule gets two different codes depending on which layer catches it first (a BFF Zod schema vs. the backend VO), the frontend shows an inconsistent message for the identical violation depending on request timing.

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


## Schema-level enforcement of "never persisted here" invariants

A documented invariant that field X must never appear inside field Y (a comment, a doc row, a naming convention) is not actually enforced unless something validates it at the request boundary. A doc comment plus a client-side "strip before sending" helper is a UI courtesy for the legitimate client, not an API contract — a direct API call, a future caller, or a bug in the client-side strip logic all bypass it silently.

This bites hardest when Y's own schema is an unconstrained record (`z.record(z.string(), z.unknown())`), which many module/module-data-shaped fields are, since per-type shape isn't statically derivable from a generic array element. If X's field names are also real, recognized fields somewhere else in the same request body, nothing stops a caller from embedding them inside Y instead of at the top level.

**M20-S08 precedent (2026-08-26):** `HotsiteModuleSchema.data` accepts any record for every module type. Once `audienceMode`/`questions` became real top-level fields on `PATCH /v1/tenants/hotsite` (folded in from a former separate endpoint), a caller could embed those same key names inside a `LEAD_FORM` module's own `data` in the `layout[]` array — bypassing `LeadFormConfig`'s own validation (the 20-question cap included) and landing the values in `HotsiteConfig.layout[]`, which feeds the public-cached manifest. The frontend's `stripLeadFormConfig()` helper only protects the real web client, not the API boundary. Fixed with an explicit Zod `.refine()` on `HotsiteModuleSchema`, scoped to `type === 'LEAD_FORM'`, rejecting `audienceMode`/`questions` inside `data` — not a blanket tightening of the generic record, which would break every other module type's legitimately-unconstrained `data`. See `packages/validation/src/hotsite.ts`.

When adding a new field to a generic sibling endpoint that a per-type sub-schema could also plausibly accept, check whether the sub-schema's own record type needs the same scoped `.refine()` — the invariant is only real once something rejects the violation, not just documents it.

---


## RequestContext (per-request shared state)

`RequestContext` (`src/shared/request/request-context.ts`) is populated once per HTTP request by `RequestInterceptor` — `tenantId`, optional `actorId`/`actorType`/`actorRole`, and `settings: TenantSettingsProps` (the tenant's full `tenants.settings` JSONB, eager-loaded via `ITenantSettingsPort` before the request reaches any handler). `correlationId` itself is generated earlier, in `CorrelationMiddleware` (`src/shared/request/correlation.middleware.ts`) — an Interceptor runs *after* Guards, so a Guard-rejected request would otherwise carry no correlationId at all (M17-S31, 2026-07-20); `RequestInterceptor` only reads the value middleware already placed on `req.headers['x-correlation-id']`, it no longer generates a fallback itself.

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
| `RequestInterceptor` (populates tenantId/actor/settings) | `src/shared/request/request.interceptor.ts` |
| `CorrelationMiddleware` (generates/validates `correlationId`, runs before Guards) | `src/shared/request/correlation.middleware.ts` |
| `ITenantSettingsPort` (tenantId-parameterized, for shared infra) | `src/shared/ports/tenant-settings.port.ts` |
| Real adapter | `src/contexts/platform/infrastructure/cross-context/platform-tenant-settings.adapter.ts` |
| Test builder | `src/test/factories/request-context.factory.ts` (`RequestContextBuilder`) |
| Test double for the port | `src/test/infrastructure/in-memory-tenant-settings.port.ts` |

---


## Observability ports (logging + tracing)

Both are shared, cross-app code in `packages/observability` (used by backend and BFF alike) — they follow the same port/adapter shape, and it's the shape to reuse for any future observability integration:

| Concern | Port | Default (real) adapter | Alternate adapter |
|---|---|---|---|
| Log line formatting | `LogVendorFormatter` (`log-vendor-formatter.ts`) | `GoogleCloudLogVendorFormatter` (`gcp-log-vendor-formatter.ts`) | `NoopLogVendorFormatter` |
| Trace enrichment | `ITracingPort` (`tracing-port.ts`) | `OtelTracingAdapter` (`otel-tracing-adapter.ts`) | — |

**Why a port at all, for `@opentelemetry/api`:** `trace.getActiveSpan()` itself is already vendor-neutral (OTLP is the standard; the collector, not app code, is where a vendor is ever selected — see D9 in `plan/M17-CLOUD-DEPLOY.md`). The port exists for the scenario D9 doesn't cover: a vendor requiring their own proprietary tracer SDK instead of OTLP ingestion. In that case every call site that imported `@opentelemetry/api` directly would need editing; behind a port, only one new adapter class does. It also closes a real testability gap — `trace.getActiveSpan()` returns `undefined` with no SDK running, so a raw import was untestable (a call either happened against nothing, or was trusted blindly); a fake `ITracingPort` lets a spec assert exactly what was set.

**Wiring differs by how the consumer itself is constructed — mirror whichever your class already does, don't introduce DI where there wasn't any:**
- **Never NestJS-DI-managed** (`BaseAppLogger`/`AppLogger` — always `new AppLogger(Context.name)`, never `@Inject`-ed): the port is a plain constructor parameter with a real-adapter default (`vendorFormatter: LogVendorFormatter = new NoopLogVendorFormatter()`, `tracingPort: ITracingPort = defaultTracingPort`). No `@Optional()` needed — nothing is asking Nest's container to resolve it.
- **Already NestJS-DI-managed** (`CorrelationMiddleware`, `RequestInterceptor` — real `@Injectable()`s Nest's container constructs): same constructor-parameter-with-default shape, but the parameter needs `@Optional()`. Without it, Nest reflects the parameter's design-time type for DI resolution; since `ITracingPort` is an interface (erased at runtime), Nest can't find a bound provider for it and throws `UnknownDependenciesException` instead of falling through to the default. `@Optional()` tells Nest to pass `undefined` when nothing is bound — which is what lets the JS default value apply. No token, no module registration needed for the default case.

**One exported default instance per port, not `new Adapter()` at every call site.** `otel-tracing-adapter.ts` exports `export const defaultTracingPort: ITracingPort = new OtelTracingAdapter();` and all 5 consumers (`BaseAppLogger`, both apps' `CorrelationMiddleware`/`RequestInterceptor`) default to that same constant, not their own `new OtelTracingAdapter()`. `OtelTracingAdapter` has no state — its methods only delegate to `@opentelemetry/api`'s own global `trace` singleton — so this isn't a caching/perf concern, it's centralising *which* concrete adapter is the default: swapping it is one line in `otel-tracing-adapter.ts`, not five call sites across two apps. Still no NestJS DI/token — this is a plain shared constant, consistent with the "never DI-managed" callers above; a future port should follow this shape too rather than repeating `new X()` at each default-parameter site.

**Dependency direction:** shared code in `packages/*` depends on the port only, never on either app's concrete class — a shared package importing from `apps/backend` or `apps/bff` inverts the dependency direction. `BaseErrorFilter` (`packages/nestjs-http`) is the existing example: typed against `BaseAppLogger`, but each app's own `ErrorFilter` passes its real, enriching `AppLogger` into `super()` — the shared filter code gets full app-specific enrichment through polymorphism, without ever importing either app's concrete logger class.

**The tracing SDK bootstrap itself (`otel-tracing.ts`'s `bootstrapTracing()`, called once from each app's `src/tracing.ts`) is deliberately *not* behind `ITracingPort`.** It's the composition root, not a port consumer — its whole job is selecting and starting a concrete implementation, the same way `main.ts` calls `NestFactory.create()` directly. What it *does* get is a vendor-neutral name and argument shape: `bootstrapTracing(serviceName, options: TracingOptions)` — `TracingOptions` (`{ postgres?: boolean }`) is translated into OTel-specific instrumentation config *inside* `otel-tracing.ts`, so neither `tracing.ts` file ever references an OTel package name or config shape. A full tracer-SDK swap (e.g. a vendor contract requiring their own proprietary SDK instead of OTLP ingestion) is then confined entirely to `packages/observability` — both apps' `tracing.ts` files need zero changes, since they never named the vendor to begin with.

---


## Controller, Route, and Shared-UI Boundaries

- Controllers and route files are composition layers only. They may parse input and choose the use case/helper, but branching policy and response shaping belong in the owning slice.
- Controller input must be validated at the boundary. Prefer `@Body(new ZodValidationPipe(Schema))` or `@Query(new ZodValidationPipe(Schema))` with a typed DTO over raw `@Body('x')`, `@Query('x')`, or `@Param('x')` reads when the endpoint accepts structured input.
- Do not treat `/internal` routes as a shortcut around validation. They still need explicit DTO or pipe validation for every externally supplied value.
- Feature-specific transport helpers should live with the feature or capability that owns them. Generic buckets are for cross-cutting code only.
- Shared UI primitives should expose readonly props where practical, so consumers cannot mutate shared contracts by accident.
- Any `dangerouslySetInnerHTML` usage must go through a controlled helper or component with an explicit sanitization path; never inline raw HTML injection in a page or reusable component.

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


## Authoring new i18n UI copy keys (`packages/i18n/locales/*/web.json`)

- Always add the key to **both** `pt-BR/web.json` and `en/web.json` in the same commit — never ship a key in one locale only.
- Namespace by UI area, matching existing top-level keys (`hotsite.*`, `auth.*`, `booking.*`, `seo.*`, etc.) rather than inventing a new top-level namespace for a feature that belongs under an existing one.
- Use ICU placeholders (`{name}`, `{location}`) for interpolated values — see `seo.defaultTitleWithLocation` for the pattern — never string-concatenate translated fragments.
- Server Components call `useTranslations()` directly (no `'use client'` needed — see Code Standards). Only reach for a Context-based hook like `useFormatting()` when the value also depends on tenant-specific formatting (currency, date), not just translated text.

---


## Exception handling & i18n pattern (`code`-driven, TD23)

Every error that crosses an HTTP boundary — backend → BFF → web — carries a stable, machine-readable `code` (never just a free-text `message`/`detail`). `code` is the only thing frontend message-selection is allowed to branch on; `status` is transport/routing only.

### The envelope

`ProblemDetail` (`packages/types/src/errors.dto.ts`):

```typescript
interface ProblemDetail {
  type: string;          // always 'about:blank' — never a URI fragment encoding the error identity
  title: string;
  status: number;
  code?: string;          // the only field frontend message-selection is allowed to branch on
  field?: string;         // which request field is at fault, single-cause errors only — routing use, never message selection
  params?: Record<string, string | number>;
  detail: string;         // backend-internal/debug text only — contractually never rendered to a user (docs/ANTI_PATTERNS.md)
  violations?: { field: string; code: string; params?: Record<string, string | number> }[];
}
```

Two shapes, not one:
- **Single-cause errors** (the ~65 named domain error classes, raw base-class throws, and VO `create()` errors) use top-level `code` + optional `field`. Constructed via `buildProblemDetail()` (`packages/types/src/errors.dto.ts`) / thrown via `throwProblemDetail()` (`packages/nestjs-http/src/problem-detail.ts`).
- **Batch/multi-field validation** (Zod pipes, both backend's and the BFF's) use `violations[]`, one `{ field, code, params? }` entry per failing field.

### Code naming convention

`<ORIGIN>_<REASON>`, upper snake case:
- Backend domain, by context: `BOOKING_*`, `CUSTOMER_*`, `STAFF_*`, `LOYALTY_*`, `PLATFORM_*`
- Backend shared VOs: `ADDRESS_*`, `COUNTRY_CODE_*`, `PHONE_*`, `MONEY_*`, `SEO_*`, `SLUG_*`, `HEX_COLOR_*`, `TIMEZONE_*`, `TIME_OF_DAY_*`, `EMAIL_*` — see "VO validation errors must be mapped with a typed `code`" above for how a VO's own error class ties into this
- BFF-originated: `BFF_*` (e.g. `BFF_GUEST_TOKEN_INVALID`, `BFF_UPSTREAM_UNAVAILABLE`)
- Framework/generic fallback: `AUTH_UNAUTHORIZED`, `AUTH_FORBIDDEN`, `INTERNAL_ERROR`, `NOT_FOUND`, and the small closed `GenericErrorCode` set for VO-less Zod rules (see "Single source of truth for a validation rule's code" above)

Every origin is exported from `packages/types/src/error-codes.ts` as an `as const` object + derived literal union type (e.g. `BookingErrorCode`), collected into `AnyErrorCode`. Each context's base error class constructor types its `code` param against its own union, not `string` — constructing an error with an uncatalogued code is a compile error, not just a documented convention. The BFF further narrows this: `apps/bff/src/shared/http/problem-detail.ts`'s `throwProblemDetail()` wraps `@ikaro/nestjs-http`'s and types its `code` param against `BffThrowableCode` (only the origins a BFF site is actually allowed to throw), so a BFF call site can't accidentally throw an unrelated backend-only code.

### Shared translation catalog

`packages/i18n/locales/{locale}/errors.json` — one entry per code, keyed by the exact code string. `apps/web/shared/lib/i18n/error-codes-exhaustiveness.spec.ts` (TD23 Story 17) CI-enforces that every catalog code has a translation key in both `pt-BR` and `en`, with no orphaned keys in either direction.

### Frontend resolver

`apps/web/shared/lib/i18n/resolve-error-message.ts`:
- `resolveErrorMessage(code, locale, params?)` — the only thing allowed to select a message. Never `status`, `.detail`, or raw backend text (`docs/ANTI_PATTERNS.md`).
- `extractProblemCode(err)` / `resolveErrorMessageFromApiError(err, locale)` — pulls `code` out of the `bffClient`-backed error classes (`ApiError`, `AuthError`, `ForbiddenError`) that carry a parsed `ProblemDetail` body via `.data` (delegates to `extractProblemDetailShape()` in `shared/lib/api/errors.ts`, the single implementation for all three — TD31 Story 7).
- An unrecognized/missing code falls back to a generic message and `console.warn`s, so a code/locale gap is observable instead of silently swallowed — never falls through to rendering `detail`.

### `status` vs `code`

`status` is transport/routing only: 401 → redirect to login, 403 → forbidden screen, 404 → `notFound()`, 409 → conflict-specific UI state, 5xx → generic retry copy. `code` is the only thing that selects a message. No component branches on `status===400` to pick a message.

### Code lifecycle

Codes are additive-only once shipped — never renamed or repurposed (a released frontend bundle may hold a cached reference to one during a rolling deploy). Retiring a code: remove every throw site first, then leave the catalog entry + translation in place for at least one release cycle before deleting both together.

### Adding a new error — checklist

1. Add the code to the relevant literal union in `packages/types/src/error-codes.ts` — the compiler rejects step 3 until this is done.
2. Add a translation entry to **both** `packages/i18n/locales/pt-BR/errors.json` and `.../en/errors.json` — the exhaustiveness test (`apps/web/shared/lib/i18n/error-codes-exhaustiveness.spec.ts`) rejects a missing one.
3. Construct/throw the error with the typed constructor from step 1's origin — `throwProblemDetail(status, BookingErrorCode.XXX, detail, field?)` for a raw throw, or a named domain error class implementing `DomainErrorShape` for a VO/aggregate error.

### Security-sensitive errors: specificity is a per-case decision

The default is "assign the most specific code available" — wrong for paths where revealing the precise internal reason creates an enumeration/information-disclosure risk (e.g. distinguishing "no account with this email" from "account exists, wrong linked provider" in an auth/staff-linking flow). Each such error set must make an explicit, deliberate specificity decision — collapse multiple internal reasons into one generic code where warranted, rather than mechanically exposing the most specific code by default.

This section is the canonical implementation reference for the pattern.

---


## `no-restricted-syntax` selectors must be checked against every already-documented bypass shape in the same config file, not just the one form the target code currently uses

**A new `no-restricted-syntax` selector added to `apps/web/eslint.config.js` (or its backend/BFF equivalents) that only covers the literal AST shape of the code it was written against will miss every alternate JS/JSX shape expressing the same thing — and this file already documents 3 recurring bypass classes from real incidents, right next to wherever a new selector gets added.** Checking a new selector against all 3 before considering it done is cheap; discovering them one at a time across separate review rounds is not.

The 3 documented classes, each with an existing example selector in this same file to copy from:
1. **Computed-literal member access** — `window['fetch'](...)`, `page['getByText'](...)`. The property is a `Literal` node with a `.value`, not an `Identifier` with a `.name`, so `callee.property.name` alone never matches it. See `RAW_FETCH_SELECTOR`'s `:matches(...)` construct for the fix shape.
2. **A bare, non-member call** — `const { getByText } = page; getByText(...)`. No `MemberExpression` exists at all; needs a separate `[callee.type='Identifier'][callee.name=...]` branch in the same `:matches(...)`.
3. **A value nested inside a `JSXExpressionContainer` or a conditional/logical expression, rather than as the JSX attribute's own direct value** — `data-testid={'literal'}`, `data-testid={cond ? \`x\` : 'y'}`. A direct-child combinator (`>`) only matches the container's immediate expression; use a descendant combinator (plain whitespace) to reach one nested inside a `ConditionalExpression`/`LogicalExpression`.

**Confirmed recurring (TD37-S23, PR #450, 2026-08-31):** all 3 classes were rediscovered one at a time across 4 separate Codex review rounds while adding 3 new selectors (E2E-1/E2E-2/E2E-3) — despite class 1's own fix already sitting in the same file being edited, as `RAW_FETCH_SELECTOR`'s existing `window['fetch'](...)` handling (added for an earlier, unrelated selector, PR #375). Each round's finding was real and correctly fixed, but a systematic check against all 3 classes during the *first* pass would have caught most of them before ever pushing.


## Before a blind `Write` on a file believed to be new, grep for its expected exported symbols first

**A file's absence from the specific area you're currently working on is not proof of its absence from the repo.** The `Write` tool's own "must `Read` an existing file first" safeguard only tracks files *this agent session* has read — not actual on-disk state — so a file that already exists but was never `Read` in-session can be silently overwritten with no warning, no error, and no diff-conflict signal of any kind.

This is most likely to happen when a piece of shared infrastructure was built earlier (in an earlier story, or earlier in the same session) for one consumer's need, and a later task assumes — reasonably, but wrongly — that because *its own* area of the codebase has no wiring to that infrastructure, the infrastructure itself must not exist yet. Before creating a new file via `Write`, grep the codebase for the exact symbol names you're about to export — not just for wiring into the specific component you're currently touching.

**M21-S04 precedent, 2026-09-02:** `apps/web/shells/dashboard/model/resource-route.ts` (`matchResourceRoute`/`isResourceCreateRoute`) was blindly `Write`-created while investigating why the dashboard topbar showed the wrong title for a new section, on the reasonable-looking assumption that no such route-matcher existed (nothing in `topbar-route.ts`/`Topbar.tsx` referenced one). The file already existed from the section's original implementation and was already imported by `BottomNav.tsx` for an unrelated purpose (hiding the mobile nav on drill-down routes). The overwrite was functionally harmless only by luck — the rewritten logic happened to be equivalent, confirmed by `BottomNav.tsx`'s own spec suite still passing — but the overwrite of the sibling `.spec.ts` file silently dropped one of the original test cases, caught only by manually diffing against `git log --follow` after the fact, not by any automated check.


## Re-check a same-file documented invariant when extending an existing algorithm to a new dimension mid-PR

**When a bot review (or any mid-PR discovery) prompts adding a genuinely new dimension to an existing computation — not just fixing the one gap that was flagged — explicitly re-derive the new code against every invariant already documented for that feature area in the same doc file, not only the specific gap that triggered the change.** A sentence stating a general rule, sitting near the algorithm being extended, is a checklist item to verify the new code against — not ambient background reading that can be skimmed past because it predates the current change.

This is easy to miss precisely because the invariant isn't new information — it was already read, understood, and even cited earlier in the same work session. The miss isn't "didn't know the rule," it's "didn't re-apply the rule to the specific new code path being written right now."

**M21-S03 precedent, PR #460 rounds 8–9, 2026-09-04:** `docs/02-DOMAIN_MODEL.md` already stated, before any resource-scoping work began on `AvailabilityService`, that "the tenant calendar is a hard outer boundary... a resource opening never bypasses a tenant-wide closure or extends beyond a tenant opening/window." Round 8 (prompted by a Codex finding that resource-scoped closures/openings were persisted but invisible to the availability calculator) extended `resolveEffectiveHours()` to be resource-aware — but the new code let *any* applicable opening, tenant-wide or resource-scoped, short-circuit past every closure check unconditionally, at every scope, violating the invariant that was already sitting in the same doc file the story's own discovery had loaded. Round 9's Codex review caught it one round later as a fresh Critical finding on code that had existed for exactly one round. The fix required resolving the tenant window first as a hard outer boundary (the original single-scope algorithm, unchanged), only then resolving a resource-level window within it, and intersecting — a design that was fully specified by the invariant that already existed before round 8 ever started.



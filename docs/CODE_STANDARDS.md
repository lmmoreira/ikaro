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
| Use case input type | `{UseCaseName}Input` | `ApproveBookingUseCaseInput` |
| Use case result type | `{UseCaseName}Result` | `ApproveBookingUseCaseResult` |
| HTTP request body/query schema | `{Action}Schema` + `{Action}Dto` | `ApproveBookingSchema`, `ApproveBookingDto` |
| Zod schema | `{Action}Schema` | `ApproveBookingSchema` |
| Public hotsite response type (`@ikaro/types`) | `Hotsite<Resource>Response` / `Hotsite<Resource>ListResponse` | `HotsiteManifestResponse`, `HotsiteServiceResponse` / `HotsiteServiceListResponse` |

Both `{UseCaseName}Input` and `{UseCaseName}Result` are defined in the use case file. HTTP Zod schemas stay in `dtos/` and are **not** reused as use case input types — the controller validates HTTP input with the Zod schema, constructs the `{UseCaseName}Input` (adding context-derived fields), then calls `execute(input)`.

- Never `*RequestDto`, `*InputDto`, `*Info`.
- One `{UseCaseName}Input` per use case. Use cases with genuinely no input (e.g. global scheduled jobs) may keep `execute()` with no arguments — do not create a dummy `{}` type.
- When a path param must be combined with a request body, merge them into the `{UseCaseName}Input` — the controller assembles it from `@Param`, `@Body`, and `RequestContext`.

---

## Domain events (mandatory)

- **Aggregate-driven events:** Aggregates record events via `this.addDomainEvent()` inside their domain methods — including system-initiated factory methods. Use cases flush via `aggregate.clearDomainEvents()` **after** `txManager.run()` completes.
- **Never** construct or publish events directly from a use case.
- **`correlationId`** — the **controller** reads it from `RequestContext.correlationId` and passes it as `dto.correlationId`. Use cases receive it via the input DTO and must never inject `RequestContext` or call `uuidv7()` to generate it. For `/internal` routes (no RequestContext), the controller generates one `uuidv7()` and includes it in the DTO.
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

---

## Next.js (`apps/web`): Server vs Client Components for `next-intl`

`useTranslations()` (imported from `'next-intl'`, not `'next-intl/server'`) works fine in **Server Components**. The package ships a dedicated `react-server` build, resolved automatically by Next.js's bundler for any file with no `'use client'` directive — calling the hook does **not**, by itself, require the component to be a Client Component.

Only add `'use client'` when the component has a genuine client-only need:
- State or effects (`useState`, `useEffect`)
- Browser-only APIs — event handlers, `window`, `localStorage`, client-side `fetch` on mount
- A **Context-based hook**, e.g. `useFormatting()` (`FormattingProvider`) — React Context only works inside a Client Component subtree, regardless of what the hook itself does

**Default hotsite/SEO-facing module components to Server Components** — smaller client bundle, no behavior change for translation, and they remain just as testable: Vitest/RTL doesn't honor the `'use client'` directive at all (Vite resolves the client `next-intl` build either way), so `renderWithIntl()`'s `NextIntlClientProvider` wrapper satisfies `useTranslations()` in tests regardless of which build actually ships in production.

**Worked example (TD02-S09):** `ServiceListModule`, `GalleryModule`, `GalleryItem`, `TestimonialsModule`, `ContactModule`, and `Unavailable` only called `useTranslations()` — no state, no effects, no Context — so they're Server Components. `ConfirmationStep`/`BookingSummaryCard` (from TD02-S07) *do* need `'use client'`, but because they call `useFormatting()`, not because of translation — don't generalize "this component needed `'use client'`" into "translation requires `'use client'`" without checking *why* it actually needed it.

`GalleryGrid`, `TestimonialsCarousel`, and `HotsiteAuthBar` correctly keep `'use client'` — they have real interactivity (lightbox/carousel state, client-side data fetching) independent of translation.

When in doubt, verify against the real dev server (`pnpm dev`), not just by reading next-intl's docs or package exports — confirm the page actually renders with zero console errors for at least one BR and one non-BR tenant before relying on the assumption.

## Next.js (`apps/web`): explicit return types on component functions (mandatory)

Every component function — exported or internal helper, `function Name(...)` declaration style — must declare an explicit return type: `React.JSX.Element` for components that always render, `React.JSX.Element | null` for ones with an early-return empty state (e.g. `GalleryModule`/`TestimonialsModule` returning `null` when their data array is empty).

**Lint enforcement is partial — don't rely on it alone.** `@typescript-eslint/explicit-module-boundary-types` in `apps/web/eslint.config.js` only checks `**/*.tsx` declarations that are actually `export`ed; it does not flag a missing return type on a non-exported internal helper component (e.g. a small sub-component defined above the file's main export). The convention above still applies to those — catch a missing one in code review, the same as any other style rule ESLint doesn't cover.

**Exception — Next.js App Router special files are excluded** (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `template.tsx`, `default.tsx`, `not-found.tsx`, `global-error.tsx`): their default-export shape is already validated by Next's own type generation (`.next/types`) against `PageProps`/`LayoutProps` — annotating them manually fights that contract rather than reinforcing it. This is the same boundary the testing rules already draw (page/layout are Playwright-only, never unit-tested).

## Next.js (`apps/web`): dialog and submit-handler conventions

- Native booking action sheets should use `<dialog>` with `showModal()` / `close()` and an inner wrapper for the visible card. Do not leave a native dialog as a plain `open` element if the intended layout is a centered modal sheet.
- Web submit handlers should type the event as `SubmitEvent<HTMLFormElement>` rather than deprecated `FormEvent<HTMLFormElement>`. SonarCloud flags the older type and the newer type matches native form submission semantics.

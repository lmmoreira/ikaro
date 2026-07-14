---
name: bad-smell-audit
description: Run a structural bad-smell audit across the full stack. Covers `apps/backend/src/`, `apps/bff/src/`, and `apps/web/`. Report every finding with file path and line number. Group findings by layer and category. At the end give a total issue count. Fix nothing - audit only.
metadata:
  short-description: Structural bad-smell audit
---

Run a structural bad-smell audit across the full stack. Covers `apps/backend/src/`, `apps/bff/src/`, and `apps/web/`. Report every finding with file path and line number. Group findings by layer and category. At the end give a total issue count. Fix nothing — audit only.

Optional argument: `$ARGUMENTS`
- `backend` or a context path (e.g. `contexts/customer`) — restrict to backend only
- `bff` — restrict to BFF only
- `web` — restrict to web only
- blank — scan all three layers
- Append `--pr` to any of the above to scope checks to PR-changed files only (e.g. `backend --pr`, `web --pr`)

---

## PR mode (`--pr` flag)

When `--pr` is present, do **not** scan the full layer directory. Instead:

1. Compute the changed file list for the relevant layer:
```bash
# backend --pr
git diff origin/main...HEAD --name-only | grep "^apps/backend/"

# bff --pr
git diff origin/main...HEAD --name-only | grep "^apps/bff/"

# web --pr
git diff origin/main...HEAD --name-only | grep "^apps/web/"
```

2. Pass this file list to the Explore agent as its explicit scope — the agent greps and reads **only those files**, not the full directory tree.

3. **BE-4 is skipped in `--pr` mode** — checking for missing entity/event/command builders requires scanning the full `src/test/builders/` tree against all entity/event/command files; this is a full-codebase check that the pre-PR script (Step 1, check 28) already covers for new entities, events, and commands added in the PR.

4. All other checks (BE-1, BE-2, BE-3, BE-5, BE-6, BE-7, BFF-1–4, WEB-1–7) run normally but scoped to the changed file list.

If the `git diff` for a layer returns zero files, skip that layer entirely and report `(no changed files in this layer)`.

---

## Execution — parallel Explore agents

Spawn three Explore agents in parallel, one per layer. Give each agent the full check list from its corresponding section below plus its exact scope path. Request "very thorough" search breadth. Do not write the report until all three agents have returned findings.

| Agent | Scope | Checks to pass |
|---|---|---|
| Backend | `apps/backend/src/` (full) or changed files list (--pr) | Backend checks section (BE-1 through BE-7; skip BE-4 in --pr mode) |
| BFF | `apps/bff/src/` (full) or changed files list (--pr) | BFF checks section (BFF-1 through BFF-4) |
| Web | `apps/web/` (full) or changed files list (--pr) | Web checks section (WEB-1 through WEB-7) |

If `$ARGUMENTS` restricts to a single layer or a specific context path, spawn only the relevant agent.

---

## Backend checks (scope: `apps/backend/src/`)

### BE-1. Aggregate props typed as plain primitives when a shared VO exists

Shared VOs and the primitive they replace:
- `Email` → `email: string`
- `PhoneNumber` → `phone: string`
- `Slug` → `slug: string`
- `Timezone` → `timezone: string`
- `TimeOfDay` → fields named `open`, `close`, `opens_at`, `closes_at` typed as `string` inside business_hours-like structures
- `HexColor` → fields named `color`, `primary_color`, `accent_color` typed as `string`

How to find them: look for `Props` interfaces inside `*/domain/*.aggregate.ts` files. Report any field that matches a known VO candidate but is typed as `string` or `number`.

### BE-2. Duplicated `isValidXxx` / inline validation functions outside `src/shared/value-objects/`

Grep for:
- `function isValid` outside `src/shared/value-objects/`
- `const isValid` outside `src/shared/value-objects/`
- Inline regex patterns like `/^[a-z0-9-]+$/`, `/^#[0-9A-Fa-f]{6}$/`, `/@.*\./` in domain or application layer files (not in value-objects)
- `Intl.supportedValuesOf` calls outside `src/shared/value-objects/`

### BE-3. `makeXxx()` helpers or inline TypeORM entity/event/command construction in tests

Grep for:
- `function make` in `*.spec.ts` or `*.integration.spec.ts` files — **then read each match's body before flagging it**: only a real finding if it constructs a TypeORM entity (`new XxxEntity(...)` or an entity-typed object literal) or a `DomainEvent`/`Command` subclass. A helper that builds a mock (`ConfigService`, `ExecutionContext`, `Reflector`, a fake port/adapter) or a plain application-layer DTO is **not** the smell this check targets — it's about bypassing `src/test/builders/`, not "any function named `make*`." (Confirmed via TD23-S17: without the read-the-body step, this bullet produced 25/25 false positives — every match was a mock/DTO factory.)
- `new XxxEntity()` called directly inside a test `it()` or `describe()` block (not inside a builder class)
- Object literals assigned to a variable of a TypeORM entity type inside test files
- `new XxxEvent(...)` or `new XxxCommand(...)` (classes extending `DomainEvent`/`Command`) constructed inline with all constructor args spelled out, in **two or more** spec files (a single one-off construction in one file is fine; repetition across files is the smell)

The fix pattern: create a `XxxEntityBuilder` (for entities) or `XxxEventBuilder`/`XxxCommandBuilder` (for `DomainEvent`/`Command` classes) in `src/test/builders/<context>/`.

### BE-4. Missing `XxxEntityBuilder`/`XxxEventBuilder`/`XxxCommandBuilder` for existing classes

For each TypeORM entity class found in `*/infrastructure/entities/*.entity.ts`, check whether a corresponding `XxxEntityBuilder` exists in `src/test/builders/<context>/`. Report entities that have no builder file.

Same check for domain events and commands: for each class found in `*/domain/events/*.event.ts` or `*/domain/commands/*.command.ts` that is constructed inline (via `new XxxEvent(...)`/`new XxxCommand(...)`) in **two or more** test files, check whether a corresponding `XxxEventBuilder`/`XxxCommandBuilder` exists in `src/test/builders/<context>/`. Report any that don't.

### BE-5. Seed file containing DDL

Check `src/shared/database/seed.ts` (and any other file under `src/shared/database/`) for:
- `CREATE TABLE`, `CREATE SCHEMA`, `DROP TABLE`, `DROP SCHEMA`
- `ensureSchemas`, `createSchemas`, `createTable`

Seeds must be data-only. Schema belongs in migrations.

### BE-6. Utility functions duplicated across files (outside `src/shared/utils/`)

Grep for:
- `deepMerge` implemented inline (not imported from `src/shared/utils/deep-merge`)
- Any function body that re-implements string trimming, digit-stripping, or format conversion that already exists in a shared VO or util

### BE-7. Builder fields without a `withXxx()` setter must be readonly (S2933)

For each `*.builder.ts` in `src/test/builders/`, find private fields initialised inline (`private fieldName = ...`) that have no corresponding `withFieldName(...)` fluent setter method. SonarCloud (S2933) flags these — a field that's never reassigned via a setter should be `readonly`.

Report: `<file>:<line> — 'fieldName' has no setter; mark readonly`

---

## BFF checks (scope: `apps/bff/src/`)

### BFF-1. Business logic in BFF controllers

BFF controllers must only call service methods and forward results — no domain logic inside controller method bodies. Grep for and flag:
- Multi-branch `if/else` chains with more than one business condition inside controller method bodies
- Mathematical calculations or date arithmetic inside controller method bodies
- Domain error classes instantiated and thrown directly from controller method bodies (not via an exception filter)

### BFF-2. Module/controller naming — bounded-context vs. aggregate

BFF module folders must be named after bounded contexts (CLAUDE.md §3), not individual aggregates. Valid names: `booking`, `customer`, `staff`, `loyalty`, `notification`, `platform`. Flag any folder under `apps/bff/src/` whose name corresponds to an aggregate instead (e.g. a `tenants/` folder is wrong — `Tenant` lives inside `platform`).

### BFF-3. Hotsite public controller response types

For `.public.controller.ts` files serving hotsite content, verify that methods returning resource objects or lists are typed with `Hotsite<Resource>Response` / `Hotsite<Resource>ListResponse` (from `@ikaro/types`). Flag methods whose return type is `any`, an anonymous object literal type, or a raw TypeORM entity type.

Note: only applies to existing public controllers serving hotsite content — not every public endpoint is hotsite-related.

### BFF-4. Cross-app boundary violation

Grep `apps/bff/src/` for `import` statements whose resolved path points into `apps/backend/src/contexts/`. The BFF must call the backend via HTTP or through service ports — never by importing backend context modules directly.

---

## Web checks (scope: `apps/web/`)

### WEB-1. `dangerouslySetInnerHTML` without sanitization (XSS)

Grep `apps/web/` for `dangerouslySetInnerHTML`. For each match, check whether the value passed to `__html` is sanitized before use (e.g. via `DOMPurify.sanitize()` or equivalent). Flag any usage where the raw, un-sanitized input is passed directly.

### WEB-2. Non-`readonly` fields in React component prop interfaces (SonarCloud S6759)

For `*.tsx` files in `apps/web/components/`, find `interface` or `type` declarations used as component props (the function parameter type or `React.FC` first type argument). Report any field not marked `readonly`. Every field in a component props interface must be `readonly`.

### WEB-3. CSS custom property type assertions

Grep `apps/web/` for `as React.CSSProperties` in function return positions. Flag any instance where the function produces CSS custom property keys (keys starting with `--`). The correct return type is `React.CSSProperties & Record<\`--ba-${string}\`, string>` — `as` casting silences the type checker without enforcing the correct shape.

### WEB-4. Component spec files missing `// @vitest-environment jsdom`

For each `*.spec.tsx` file under `apps/web/components/`, check that the very first line is exactly:
```
// @vitest-environment jsdom
```
Flag files where this annotation is missing or not on line 1. (`apps/web/lib/**` spec files run in the default `node` environment — exempt from this check.)

### WEB-5. Page/layout unit tests (should be E2E only)

Grep for `*.spec.ts` or `*.spec.tsx` files that are siblings of `page.tsx` or `layout.tsx` under `apps/web/app/`. Pages and layouts require the full Next.js runtime and must only be tested via Playwright E2E. Report any such sibling spec files.

### WEB-6. Bare Node.js built-in imports without `node:` prefix

Grep `apps/web/` for import statements using bare built-in names: `from 'path'`, `from 'fs'`, `from 'os'`, `from 'crypto'`, `from 'stream'`, `from 'util'`, `from 'url'`, `from 'events'`. Flag each occurrence — SonarCloud flags these; use the `node:` prefix instead.

### WEB-7. Fetcher files not mirroring bounded-context names

Check the actual current fetcher/API layout first — `apps/web/features/<domain>/api/**` (post-TD-21 domain-slice migration; there is no flat `apps/web/lib/api/` anymore) and `apps/web/shared/lib/api/**` for cross-cutting transport helpers (`bff-client.ts`, `bff-server.ts`, `errors.ts`, etc.). Within a domain's own `api/` folder, a file is correctly named after the *resource* it fetches, not the domain — the domain is already encoded by the directory path, so `features/booking/api/services.ts` and `features/booking/api/schedule.ts` are both correct as-is. Two different domains can legitimately have same-named files for different purposes (e.g. `features/booking/api/services.ts` for staff CRUD vs. `features/platform/hotsite/api/services.ts` for public hotsite reads of the same underlying aggregate) — that is not the smell. The actual smell is a file named after an aggregate from a *different* bounded context than the directory it lives in (e.g. a `tenants.ts` file — `Tenant` is a `platform` aggregate — sitting inside a non-`platform` domain's `api/` folder), or a cross-cutting `shared/lib/api/**` helper misnamed after an aggregate instead of its actual transport purpose. (Confirmed via TD23-S17: the old "list `apps/web/lib/api/`, flag non-context names" version of this check produced 9/9 false positives — that directory doesn't exist in the current architecture, and every flagged file was correctly resource-named within its own domain.)

---

## Output format

```
## Bad-Smell Audit Report — <scope>

### Backend

#### BE-1. Aggregate props typed as plain primitives
- [ ] src/contexts/X/domain/X.aggregate.ts:42 — `email: string` should be `email: Email`
...

#### BE-2. Duplicated isValidXxx / inline validation
(none found)

#### BE-3. makeXxx() helpers / inline entity/event/command construction in tests
...

#### BE-4. Missing XxxEntityBuilder / XxxEventBuilder / XxxCommandBuilder
...

#### BE-5. Seed DDL
(none found)

#### BE-6. Duplicated utilities
...

#### BE-7. Builder readonly fields (S2933)
...

### BFF

#### BFF-1. Business logic in controllers
- [ ] apps/bff/src/platform/platform.controller.ts:55 — conditional `if (tenant.status === 'ACTIVE')` should live in a service
...

#### BFF-2. Module/controller naming
(none found)

#### BFF-3. Hotsite public controller response types
...

#### BFF-4. Cross-app boundary violation
(none found)

### Web

#### WEB-1. dangerouslySetInnerHTML without sanitization
- [ ] components/hotsite/AboutModule/AboutModule.tsx:38 — raw `body` prop passed to `__html` without prior sanitization
...

#### WEB-2. Non-readonly props (S6759)
...

#### WEB-3. CSS custom property type assertions
(none found)

#### WEB-4. Component spec files missing @vitest-environment jsdom
...

#### WEB-5. Page/layout unit tests
(none found)

#### WEB-6. Bare Node.js imports
(none found)

#### WEB-7. Fetcher naming
(none found)

---
Total issues: N (BE: X · BFF: Y · WEB: Z)
```

If a category has no findings, print `(none found)`.

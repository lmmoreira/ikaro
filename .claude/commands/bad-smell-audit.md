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
3. **BE-4 is retired** — full-codebase missing-builder coverage (entities, events, commands, primary-key `uuidv7()` defaults, and the test-data-harness registration map) is now enforced mechanically by `pnpm architecture-check`'s `test-builder-coverage`, `entity-builder-pk-uuidv7-default`, and `test-harness-registration` detectors (TD37-S07) — no LLM audit step needed for it, in `--pr` mode or otherwise. `scripts/pre-pr.sh`'s own diff-scoped BE-4 check (Step 1, check 28) is unrelated and still runs — it's a fast, already-mechanical, PR-diff-only check, not the audit-prompt version being retired here.
4. **BE-1 is also retired** — full-codebase, aggregate-props-typed-as-primitive-when-a-VO-exists coverage is now enforced mechanically by `pnpm architecture-check`'s `aggregate-primitive-vo` detector, against the closed, reviewed registry in `packages/architecture-check/architecture-policy.json`'s `aggregateValueObjectRegistry` (TD37-S09) — no LLM audit step needed for it, in `--pr` mode or otherwise.
5. All other checks (BE-2, BE-3, BE-5, BE-6, BE-7, BFF-1–4, WEB-1–11) run normally but scoped to the changed file list.

If the `git diff` for a layer returns zero files, skip that layer entirely and report `(no changed files in this layer)`.

---

## Execution — parallel Explore agents

Spawn three Explore agents in parallel, one per layer. Give each agent the full check list from its corresponding section below plus its exact scope path. Request "very thorough" search breadth. Do not write the report until all three agents have returned findings.

| Agent | Scope | Checks to pass |
|---|---|---|
| Backend | `apps/backend/src/` (full) or changed files list (--pr) | Backend checks section (BE-1 through BE-7; BE-1 and BE-4 retired — see PR mode note above) |
| BFF | `apps/bff/src/` (full) or changed files list (--pr) | BFF checks section (BFF-1 through BFF-4) |
| Web | `apps/web/` (full) or changed files list (--pr) | Web checks section (WEB-1 through WEB-11) |

If `$ARGUMENTS` restricts to a single layer or a specific context path, spawn only the relevant agent.

---

## Backend checks (scope: `apps/backend/src/`)

### BE-1. RETIRED — mechanized by `pnpm architecture-check` (TD37-S09)

This used to check for aggregate `Props` fields typed as a plain primitive when a shared VO already exists for that exact concept. It's now enforced mechanically, full-codebase, on every CI run — no LLM audit step needed. Skip this check; do not re-add it here. See `packages/architecture-check/src/detectors/aggregate-primitive-vo.ts` and its closed registry, `architecture-policy.json`'s `aggregateValueObjectRegistry`.

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
- Object literals typed as (or targeting) a TypeORM entity inside test files — whether **assigned to a variable first** or **passed directly as an inline argument** to a repository call (`.save({...})`, `.insert({...})`, `.update({...}, ...)`) when a builder for that entity already exists. (Confirmed via the skill-creator eval on 2026-07-23: a version of this check scoped to "assigned to a variable" only missed `ds.getRepository(LoyaltyBalanceEntity).save({ tenantId, customerId, currentPoints: 500 })` in `booking-completed.handler.integration.spec.ts` — a real, repeated bypass of the existing `LoyaltyBalanceEntityBuilder` that a freeform audit with no such restriction caught. The assignment step was never the smell; bypassing the builder is.)
- `new XxxEvent(...)` or `new XxxCommand(...)` (classes extending `DomainEvent`/`Command`) constructed inline with all constructor args spelled out, in **two or more** spec files (a single one-off construction in one file is fine; repetition across files is the smell)

The fix pattern: create a `XxxEntityBuilder` (for entities) or `XxxEventBuilder`/`XxxCommandBuilder` (for `DomainEvent`/`Command` classes) in `src/test/builders/<context>/`.

### BE-4. RETIRED — mechanized by `pnpm architecture-check` (TD37-S07)

This used to check for missing `XxxEntityBuilder`/`XxxEventBuilder`/`XxxCommandBuilder` for existing classes. It's now enforced mechanically, full-codebase, on every CI run — no LLM audit step needed. Skip this check; do not re-add it here. See `packages/architecture-check/src/detectors/test-builder-coverage.ts`, `entity-builder-pk-default.ts`, and `test-harness-registration.ts`.

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
- A controller method (or a private helper called only from one) reaching directly into a **different** bounded context's service/repo/adapter — e.g. a booking controller privately fetching loyalty data itself instead of the BFF orchestrating two calls at the composition layer or the backend exposing a combined read
- Multi-call orchestration assembled directly in the controller body: a per-item fan-out (`Promise.all(items.map(...))` making one call per item) or 3+ calls (sequential or `Promise.all`) whose results are manually spread/shaped into the response inline, instead of delegating the orchestration to a mapper or service

(Added 2026-07-23 after the skill-creator eval found 4 real instances of these two patterns — cross-context reach and multi-call fan-out — in `apps/bff/src/features/{booking,customer,loyalty}` that the original three bullets didn't cover.)

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

For `*.tsx` files under `apps/web/features/*/components/`, `apps/web/shells/*/components/`, and `apps/web/shared/components/` (the current domain-slice component locations — there is no flat `apps/web/components/`), find `interface` or `type` declarations used as component props (the function parameter type or `React.FC` first type argument). Report any field not marked `readonly`. Every field in a component props interface must be `readonly`.

(Stale path found 2026-07-23 while building the skill-creator eval for this command: `apps/web/components/` doesn't exist under the post-TD-21 domain-slice layout — same class of bug as WEB-7's old `apps/web/lib/api/` path.)

### WEB-3. CSS custom property type assertions

Grep `apps/web/` for `as React.CSSProperties` in function return positions. Flag any instance where the function produces CSS custom property keys (keys starting with `--`). The correct return type is `React.CSSProperties & Record<\`--ba-${string}\`, string>` — `as` casting silences the type checker without enforcing the correct shape.

### WEB-4. Component spec files missing `// @vitest-environment jsdom`

For each `*.spec.tsx` file under `apps/web/features/*/components/`, `apps/web/shells/*/components/`, and `apps/web/shared/components/` (the current domain-slice component locations — there is no flat `apps/web/components/`), check that the very first line is exactly:
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

### WEB-8. Raw `fetch()` bypassing the sanctioned transport helpers

Grep `apps/web/` for `fetch(` calls. Every BFF/backend call must go through one of the three sanctioned helpers documented in CLAUDE.md §7 "Web → BFF transport": `bffServerFetch`, `bffPublicFetch`, or `bffClient`. Flag any raw `fetch(...)` call to a BFF/backend URL that bypasses all three — **unless** the call site has an inline comment documenting why (the existing exempted call sites in `features/platform/api.ts` and `features/platform/hotsite/api/*.ts` cite an isomorphic/`next.revalidate` constraint and a TD number; a new raw `fetch()` needs the same kind of documented rationale, not just a bare call).

### WEB-9. Local type/interface drifted or duplicated vs. `@ikaro/types`

**Now CI-enforced** by `packages/architecture-check`'s `ikaro-types-drift` detector (TD37 Story 11, `pnpm architecture-check`) — a full-codebase, non-diff-scoped `ts-morph` check that runs on every PR. It scans the same web transport-boundary modules against `@ikaro/types`' root-barrel export surface and diffs both directions (missing/extra fields, type-text mismatches, nullability mismatches), so this manual check no longer needs to be re-run by an LLM audit. This section is retained as the human-readable definition of the rule, not as a check you still need to perform by hand.

For interfaces/types declared in `apps/web/features/**/api/**` or `apps/web/shared/lib/api/**`, grep `@ikaro/types` (`packages/types/src/*.dto.ts`) for an export of the same name. If one exists, compare fields:
- **Identical shape** → flag as an avoidable duplicate that should import from `@ikaro/types` instead.
- **Different shape under the same name** → flag as drift, not just duplication — this is a real correctness risk (the local type silently shadows the canonical one at compile time). Report the exact field-level mismatch (e.g. `id` vs `entryId`, a field present on one side and missing on the other).

This is CLAUDE.md's own documented anti-pattern ("New interface in `apps/web/features/**/api/**`... without checking `@ikaro/types` first"), but `bad-smell-audit` had no check for it until 2026-07-23. See `td/TD09-WEB-TYPES-DRIFT-VS-IKARO-TYPES.md` for prior resolved instances (`services`, `customers`, `staff`, `LoyaltyBalanceResponse`) and `td/TD31-BAD-SMELL-AUDIT-COVERAGE-SNAPSHOT.md` for the newly-found drift on `LoyaltyEntryItem`/`LoyaltyRedemptionItem` that prompted adding this check.

### WEB-10. `--ba-*` CSS variables used outside the hotsite tree

`--ba-*` custom properties are injected by `applyBranding()` in `app/[slug]/layout.tsx` and are only defined within that layout's subtree — **except** `app/[slug]/my-account/**`, which is the `CustomerShell` (fixed SaaS design system), not hotsite-branded, despite being physically nested under `app/[slug]/`.

Grep `apps/web/` for `--ba-` references (`var(--ba-*)`, or a CSS-in-JS/style-object key matching `--ba-${string}`). Flag any occurrence in a file that is **not** under `app/[slug]/` (excluding `app/[slug]/my-account/**`), `shells/hotsite/components/`, or `features/platform/hotsite/`. In particular, check `shells/dashboard/`, `app/[slug]/my-account/**`, and `features/customer/` — this exact pattern has broken 3 separate times in this project's history (`Topbar.tsx`/M13-S15, `HotsiteAuthBar`/M13-S14, `/switch-tenant`/M13-S14, all in `docs/ANTI_PATTERNS.md`), always rendering invisible text or a solid-black element rather than throwing an error.

### WEB-11. Actor-scoped domain logic misplaced in the actor's own slice

An actor-scoped view of another domain's aggregate (e.g. a Customer reading/mutating their own Booking or Loyalty data) belongs in the *owning* domain's slice (`features/booking/`, `features/loyalty/`), never the actor's slice (`features/customer/`) — CLAUDE.md §11. TD31 Story 11 found and fixed exactly this drift once already.

Grep `apps/web/features/customer/` for exported functions/components with "Booking" or "Loyalty" in the name (case-insensitive). Read each match: a genuine violation is Booking/Loyalty *domain* logic (fetching, cancelling, redeeming, formatting booking/loyalty data) — not a reference to the Customer aggregate's own identity fields that happens to mention a booking count or similar. Report violations with the correct target slice (`features/booking/` or `features/loyalty/`) and note whether an equivalent already exists there (rename/move) or needs to be created (new file, scoped export name like `cancelBookingAsCustomer`).

---

## Output format

```
## Bad-Smell Audit Report — <scope>

### Backend

#### BE-2. Duplicated isValidXxx / inline validation
(none found)

#### BE-3. makeXxx() helpers / inline entity/event/command construction in tests
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

#### WEB-8. Raw fetch() bypassing transport helpers
(none found)

#### WEB-9. Local type drift/duplication vs @ikaro/types
(none found)

#### WEB-10. --ba-* CSS variables outside the hotsite tree
(none found)

#### WEB-11. Actor-scoped domain logic misplaced in the actor's own slice
(none found)

---
Total issues: N (BE: X · BFF: Y · WEB: Z)
```

If a category has no findings, print `(none found)`.

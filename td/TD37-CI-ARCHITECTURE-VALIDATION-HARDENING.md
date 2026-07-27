# TD37 — CI-Enforced Architecture & Best-Practice Validation (reduce reliance on `.md` rules)

## Status

- **Type**: Technical Debt / CI Hardening — Architecture Enforcement
- **Priority**: High (mixes 🔴 proven-recurring-failure stories with 🟡/⚪ lower-risk ones — see Confidence key)
- **Context**: cross-cutting — `apps/backend`, `apps/bff`, `apps/web`, `packages/*`, `packages/config/eslint-base.js`, CI workflows
- **Created**: 2026-07-27
- **Related**: `docs/ANTI_PATTERNS.md` (all 138 rows mined), `docs/ENGINEERING_RULES.md`, `docs/CODE_STANDARDS.md`, `.claude/commands/bad-smell-audit.md`, `docs/ANTI_PATTERNS.md` row #137 (the prior decision this TD executes), `td/TD09-WEB-TYPES-DRIFT-VS-IKARO-TYPES.md`, `td/TD24-OUTBOX-INBOX-PATTERN.md`, `td/TD31-BAD-SMELL-AUDIT-COVERAGE-SNAPSHOT.md`

---

## Problem

Almost every architectural and code-quality rule in this repo exists only as prose inside `.copilot/context.md`/`docs/*.md`, enforced by an AI agent or a human reviewer remembering it on every PR. That has already failed in concrete, documented ways:

- The `useExisting` double-instantiation bug (a class registered as both a bare provider and a `useExisting` alias, so overriding the token in tests doesn't stop the real class from instantiating) shipped **twice** — once in storage (`docs/ANTI_PATTERNS.md` #67) and again in the outbox (#126) — despite being documented after the first occurrence.
- The "no network I/O inside `txManager.run()`" rule was violated in `BookingPlatformAdapter.revalidatePublicPages()` (PR #267, 2026-07-27) even though it was already written down in `docs/ENGINEERING_RULES.md` §Transactions.
- `OutboxPublisher`/`OutboxRelayService` (TD24-S01) shipped with raw SQL and `@InjectRepository` inlined directly into a service class — "went undetected through a full `/pre-pr` pass and a green CI run because nothing about it is a lint error, a type error, or a failing test" (#124, quoted verbatim from the anti-pattern doc).
- `LoyaltyEntryItem`/`LoyaltyRedemptionItem` drifted from `@ikaro/types` and was only caught by a full freeform audit (TD31), because `scripts/pre-pr.sh`'s diff-scoped drift check "structurally can't" catch drift in files nobody touched in the current PR.

Your own docs already reached the right conclusion once, independently: anti-pattern row **#137** is the team explicitly rejecting "make the mandatory gate broader/fuzzier" after a skill-creator eval showed a freeform audit prompt found ~20x more issues than the fixed checklist — but concluded most of that gap belonged to *deterministic tooling* (a lint rule, `ts-prune`, a build-time type-diff script), not a bigger prompt. This TD is that decision, executed.

## Scope — what "build time" means here

Everything in this TD runs **before or during CI** — ESLint, `tsc --noEmit`, a dedicated static-analysis script, or a unit test executed by the existing `pnpm test` — never a production/runtime check (no new APM rules, no runtime guards). If a rule can only be verified by *executing* business logic against real data (e.g. "is this really a duplicate read endpoint"), it is out of scope for this TD by definition, not because it isn't valuable.

## Method

The candidate list was built by reading `docs/ANTI_PATTERNS.md` (138 rows), `docs/ENGINEERING_RULES.md`, `docs/CODE_STANDARDS.md`, and `.claude/commands/bad-smell-audit.md` (the existing 20-check manual/agent-driven audit) end to end, then cross-checking each candidate against what's **actually installed today** (`packages/config/eslint-base.js`, `apps/*/eslint.config.js`) so this TD doesn't propose re-implementing something SonarCloud or an existing rule already covers. Confirmed already covered elsewhere and intentionally *not* duplicated here:

- `z.string().uuid()`/`.email()` → flagged by SonarCloud (S1874) in addition to being proposed here as a fast local rule (see Story 4) — not a full duplicate, a faster feedback loop for the same rule.
- Builder fields without a setter (S2933), non-readonly component props (S6759), default params after required ones (S1788) → already SonarCloud-gated; `default-param-last` and the two `max-lines*` rules are proposed anyway in Story 5 because they're **built into ESLint core** (zero new dependency) and give feedback at `pnpm lint` time instead of waiting for the SonarCloud CI stage.
- A code-typed against an uncatalogued error code → already a compile error today (`tsc --noEmit`), no new tooling needed.
- `next build`'s own static-AST rejection of `export const revalidate = SOME_CONSTANT` (#75) → already enforced by the framework itself, not proposed here.

## Confidence key

- 🔴 — proven recurring failure mode: shipped to a real PR/branch, or shipped twice, per the incident record in the docs
- 🟡 — a rule your docs already declare mandatory, currently zero enforcement, low implementation risk
- ⚪ — valuable but exploratory; ships non-blocking first, promoted only after a burn-in period with no false positives

---

## Committed Stories

### Story 1 — `dependency-cruiser`: architectural boundaries 🔴

**New dependency**: `dependency-cruiser` (dev-only).

Add `.dependency-cruiser.cjs` at repo root (or one per app if rules diverge enough), wire `pnpm dep-cruise` per app, add a CI step.

Rules to encode:
- `apps/backend/src/contexts/<A>/**` must not import `apps/backend/src/contexts/<B>/**` — only `shared/**` or its own context (#20, #24, #32).
- `apps/backend/src/contexts/**/domain/**` must not import `@nestjs/*`, `typeorm`, `axios`, `express` — CLAUDE.md §7's "domain/ (zero framework deps)" invariant, currently enforced nowhere.
- `apps/bff/src/**` must not import `apps/backend/src/contexts/**` (bad-smell-audit BFF-4).
- `apps/backend/src/**` must not import `@ikaro/types` response/DTO shapes, **except** `packages/types/src/error-codes.ts` and `packages/types/src/errors.dto.ts` (#69's two documented exceptions — encode as an explicit allow-list, not a blanket ban).

**What it catches**: a future PR reintroducing context coupling, a domain file accidentally pulling in a NestJS decorator, a BFF file reaching into backend source instead of going through HTTP.
**What it does NOT catch**: semantic duplication — e.g. two cross-context ports doing the same job (#79) is a design judgment call, not an import-graph shape; stays a code-review/bad-smell-audit item.

**Acceptance criteria**:
- [ ] `.dependency-cruiser.cjs` encodes all 4 rule groups above with the `@ikaro/types` allow-list
- [ ] `pnpm dep-cruise` added to each app's `package.json` scripts
- [ ] CI step added (non-blocking first — see Rollout Phases)
- [ ] Zero violations on current `main` before promoting to blocking

---

### Story 2 — Ban raw SQL / repository-bypass outside repository adapters 🔴

Directly addresses **#124** — the exact TD24-S01 incident (`OutboxPublisher` had every `INSERT`/`SELECT ... FOR UPDATE SKIP LOCKED`/`UPDATE`/`DELETE` inlined, undetected through a full `/pre-pr` pass).

**Mechanism**: `no-restricted-imports` (zero new dependency) banning `@InjectRepository` from `@nestjs/typeorm` and `Repository`/`EntityManager` type imports from `typeorm`, scoped to every path *except* `**/infrastructure/repositories/**` and `shared/infrastructure/**`.

```js
// example pattern, mirrors the existing EVENT_BUS/OTel bans already in apps/backend/eslint.config.js
{
  files: ['src/contexts/**/*.ts', 'src/shared/**/*.ts'],
  ignores: ['**/infrastructure/repositories/**', '**/*.spec.ts', '**/*.integration.spec.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        { name: '@nestjs/typeorm', importNames: ['InjectRepository'], message: 'Raw @InjectRepository outside a repository adapter — extract an IXxxRepository port instead (see docs/AGENT_PATTERNS.md Pattern #1).' },
      ],
      patterns: [{ regex: '^typeorm$', message: 'Import Repository/EntityManager only inside infrastructure/repositories/**.' }],
    }],
  },
}
```

**What it catches**: any future service/publisher/handler reaching for TypeORM directly instead of a port.
**What it does NOT catch**: a repository adapter itself doing something wrong internally — that's normal code review, this rule only enforces *where* SQL is allowed to live.

**Acceptance criteria**:
- [ ] Rule added to `apps/backend/eslint.config.js`
- [ ] Zero current violations (verify `shared/infrastructure/outbox/typeorm-outbox.repository.ts` and equivalents are correctly exempted, not accidentally banned)
- [ ] `docs/AGENT_PATTERNS.md` Pattern #1 referenced in the lint error message

---

### Story 3 — No network I/O inside `txManager.run()` 🔴

Directly addresses **#28** — the PR #267 incident (DB read before the network call wasn't wrapped in the "never throws" contract; only the network leg was).

**New dependency**: `ts-morph` (also used by Stories 6–11 — this is the story that introduces the dependency and the test harness).

**Mechanism**: an `architecture.spec.ts` (run via the existing `pnpm test`, no new CI step) that:
1. Loads the backend `ts-morph` `Project` from `apps/backend/tsconfig.json`.
2. Finds every `CallExpression` whose callee is `.run` on an identifier/parameter typed `ITransactionManager`.
3. Walks the arrow-function argument's body for nested `CallExpression`s whose resolved symbol is `HttpService`, `axios`, or any export from `**/infrastructure/cross-context/*.adapter.ts`.
4. Fails with the file:line of the offending call if found.

**What it catches**: exactly the PR #267 shape — a network-calling adapter method invoked from inside the transactional callback, on either side of the DB write.
**What it does NOT catch**: a network call made from a method that's merely *reachable* from inside the callback through several layers of indirection (e.g. `a()` calls `b()` calls `c()` which does the network call) — the check only looks at the direct call graph inside the immediate callback body, not full interprocedural analysis. Deep indirection stays a code-review item; flagging it here so the limitation is explicit, not assumed away.

**Acceptance criteria**:
- [ ] `ts-morph` added as a backend devDependency
- [ ] `architecture.spec.ts` (or equivalent) added under `apps/backend/src/test/architecture/`
- [ ] Passes clean against current `main`
- [ ] Wired into existing `pnpm test` — no new CI step required

---

### Story 4 — ESLint `no-restricted-imports`/`no-restricted-syntax` pack (zero new dependency) 🟡

Bundles the smaller, cheap-to-add rules using the exact mechanism you already use for the `EVENT_BUS`/OTel bans — one PR, several rules, all mirroring existing precedent:

| Rule | Anti-pattern row | Scope |
|---|---|---|
| Ban `RequestContext` import in application layer | ENGINEERING_RULES §RequestContext | `contexts/**/application/**/*.ts` |
| Ban `z.string().uuid()`/`.email()` chained forms | #51 | repo-wide (`no-restricted-syntax`, `CallExpression` selector) |
| Ban raw `fetch(` in `apps/web` outside `bffServerFetch`/`bffPublicFetch`/`bffClient` | WEB-8 | `apps/web/**`, with the same documented-exception carve-out bad-smell-audit already allows |
| Ban `throw new HttpException` inside `*.use-case.ts` | #54 | `contexts/**/application/**/*.use-case.ts` |
| Ban a string-literal argument as the first arg to `.subscribe(`/`.registerTrigger(` | ENGINEERING_RULES §Event Handlers (already fixed repo-wide once, `fix/consistency-naming-consumer`) | event handler registration sites |
| Ban a string-literal argument to `resolveSupportedLocale(` inside protected-area layouts | #106 | `apps/web/app/dashboard/**/layout.tsx`, `apps/web/app/[slug]/my-account/**/layout.tsx` |
| Ban `as React.CSSProperties` in function return position | WEB-3 | `apps/web/**` |

**What it catches**: each is a rule already proven to have been violated at least once (the locale one caused a full JWT-enrichment fire-drill; the consumer-name one was fixed repo-wide once already).
**What it does NOT catch**: `resolveSupportedLocale(payload.locale ?? 'pt-BR')` — the *correct* pattern — still passes, since the rule only flags a bare literal as the sole argument, not a literal used as a fallback.

**Acceptance criteria**:
- [ ] All 7 rules added across `apps/backend/eslint.config.js` / `apps/web/eslint.config.js`
- [ ] Zero current violations on `main`
- [ ] Each rule's error message cites the doc row it enforces (mirrors existing OTel-ban message style)

---

### Story 5 — ESLint core rules already mandatory in `docs/CODE_STANDARDS.md`, currently off 🟡

Zero new dependencies — these ship inside ESLint itself:

- `max-lines-per-function` — CODE_STANDARDS.md: "Functions ≤ 20 lines"
- `max-lines` — CODE_STANDARDS.md: "classes ≤ 200 lines"
- `default-param-last` — CODE_STANDARDS.md's default-parameter rule (currently only SonarCloud-gated, this gives the same feedback at `pnpm lint` time instead of waiting for the Sonar CI stage)

**Acceptance criteria**:
- [ ] All 3 added to `packages/config/eslint-base.js`
- [ ] Existing violations on `main` triaged — decide per-violation whether to fix immediately or grandfather via a scoped `ignores`/inline exception with a comment (do not silently raise the threshold to make the current code pass — that defeats the rule)

---

### Story 6 — `ts-morph` suite, part 1: error-handling completeness 🔴

Builds on Story 3's harness.

- **`mapXxxError` completeness** (#62): enumerate every class extending `XxxDomainError` across `contexts/**/domain/errors/*.ts`; assert each class name appears in an `instanceof` branch in the corresponding `infrastructure/http/*-error.mapper.ts`.
- **`Object.setPrototypeOf` check** (CLAUDE.md §7, listed there as "not caught by linters"): every class extending `Error` must call `Object.setPrototypeOf(this, new.target.prototype)` in its constructor.
- **VO `create()` never throws bare `Error`** (#80): scan every `*.vo.ts`'s `create()` method body for `throw new Error(` and flag it — must be a typed class implementing `DomainErrorShape`.

**What it catches**: a new error class added without wiring its mapper branch (falls through to a generic 500 with no test failure today); a copy-pasted error class missing the prototype fix (breaks `instanceof` silently).
**What it does NOT catch**: whether the *chosen* HTTP status code is semantically correct for the error — that's still a design/review call.

**Acceptance criteria**:
- [ ] All 3 checks implemented and passing against current `main`
- [ ] Failure messages name the exact class and expected mapper file

---

### Story 7 — `ts-morph` suite, part 2: test-hygiene completeness 🟡

- **Entity/event/command builder coverage** (bad-smell-audit BE-4): for each `*.entity.ts` in `*/infrastructure/entities/`, assert a matching `XxxEntityBuilder` exists in `src/test/builders/<context>/`. Same for `DomainEvent`/`Command` classes constructed inline in 2+ spec files.
- **`EntityBuilder` id defaults to `uuidv7()`** (#43): parse every builder constructor's default `id` value; flag a hardcoded string literal.
- **Migration/entity registered in `integration-global-setup.ts`** (ENGINEERING_RULES §Testing Patterns): diff the set of migration classes and TypeORM entities against what's imported/registered in `src/test/integration-global-setup.ts` and any context-specific helper.

**What it catches**: a new entity/migration shipped without its test-harness registration — currently "causes silent failures — unit tests pass but integration tests error on the first DB query," per your own docs, with no test pointing at *why*.
**What it does NOT catch**: whether the builder's other fields are sensible defaults — only that it exists and the `id` default is right.

**Acceptance criteria**:
- [ ] All 3 checks passing against `main`
- [ ] BE-4's existing manual bad-smell-audit check can be retired once this ships (avoid running the same check twice, once mechanically and once via LLM prompt)

---

### Story 8 — `ts-morph` suite, part 3: DI/module wiring 🔴

- **`@Global()` module ↔ `exports` pairing** (#129): parse every `@Module({...})` decorator; if `global: true`/`@Global()` is present, assert every token consumed outside the module also appears in that module's own `exports:` array.
- **`useExisting` double-instantiation detector** (#67, #126 — bit you twice): flag a `providers` array where a class appears both as a bare entry (`SomeClass`) and as a `useExisting` target (`{ provide: X, useExisting: SomeClass }`).

**What it catches**: exactly the TD24-S02 incident (`OutboxModule` marked `@Global()` without the export line, DI resolution failing with the error pointing at the *consumer*, not the real cause) and the exact storage/outbox `useExisting` bug, both already proven to recur.
**What it does NOT catch**: a class that's `useClass`-registered correctly but still has a code smell elsewhere in its DI wiring — this only catches the specific alias-vs-registration shape.

**Acceptance criteria**:
- [ ] Both checks passing against `main`
- [ ] Verified against the real historical bug: temporarily reintroduce the TD24-S02 `@Global()`-without-`exports` shape locally and confirm the test fails, then revert

---

### Story 9 — `ts-morph`: aggregate props typed as primitive when a VO exists (bad-smell-audit BE-1) 🟡

For every `Props` interface inside `*/domain/*.aggregate.ts`, flag a field matching a known VO candidate (`email`, `phone`, `slug`, `timezone`, `color`/`primary_color`/`accent_color`, `open`/`close`/`opens_at`/`closes_at`) typed as `string`/`number` instead of the corresponding VO.

**What it catches**: a new aggregate field added with a plain primitive where the project already has a VO for that exact concept.
**What it does NOT catch**: a genuinely new field type with no existing VO — that's a real design decision (build a new VO or not), not a lint violation.

**Acceptance criteria**:
- [ ] Check passing against `main`
- [ ] Bad-smell-audit's manual BE-1 check retired once this ships

---

### Story 10 — `ts-morph`: naming-convention checks 🟡

- Use case result type is named `{UseCaseClassName}Result`, never `*Info`/`*Dto`/raw `T[]` (#59).
- Request DTO is named `{Action}Dto`, never `*RequestDto`/`*InputDto` (#60).
- BFF response interfaces live in `<module>.types.ts`, never declared inline in a `*.controller.ts` (#63).

**What it catches**: naming drift that makes types unpredictable to find/import — a real, if low-severity, recurring pattern per the doc's own examples.
**What it does NOT catch**: whether the *shape* of the DTO is correct — purely a naming check.

**Acceptance criteria**:
- [ ] All 3 checks passing against `main`

---

### Story 11 — `ts-morph`: `@ikaro/types` drift detector, full-codebase (WEB-9) 🔴

This is the one your own docs already flag as a **known, currently-unfixed gap**: `scripts/pre-pr.sh`'s version of this check is diff-scoped (only files changed in the current PR), which is "exactly how `LoyaltyEntryItem`/`LoyaltyRedemptionItem` drifted undetected" (TD31, items 2.1/2.2) — nobody had touched those files in the PR that would have caught it. `bad-smell-audit`'s `WEB-9` covers the full codebase today, but only when an LLM agent is explicitly asked to run it — not on every PR.

**Mechanism**: for every interface/type declared in `apps/web/features/**/api/**` or `apps/web/shared/lib/api/**`, if `@ikaro/types` exports a same-named type, use `ts-morph`'s type checker to structurally compare properties (not just names) and fail on any mismatch (missing field, type mismatch, nullability mismatch).

**What it catches**: exactly the `LoyaltyEntryItem`/`LoyaltyRedemptionItem` class of drift, on every PR, regardless of which files that PR touches.
**What it does NOT catch**: which side is *correct* when they differ (per TD09, sometimes `@ikaro/types` is the stale one) — the check only flags the mismatch; a human still decides the fix direction.

**Acceptance criteria**:
- [ ] Full-codebase (not diff-scoped) check passing against `main` with zero mismatches
- [ ] `scripts/pre-pr.sh`'s existing diff-scoped `WEB-7`/`WEB-9`-adjacent checks can stay as a fast local pre-check, but this becomes the authoritative full-codebase gate

---

### Story 12 — Generalize i18n key-parity checks beyond `errors.json` 🟡

`apps/web/shared/lib/i18n/error-codes-exhaustiveness.spec.ts` already proves this exact test pattern works and is already CI-enforced — it's the strongest existing precedent for this whole TD. `notifications.json` and `web.json` have the identical mandatory rule ("always add the key to both locales in the same commit") with **no equivalent spec**.

**Mechanism**: generalize the existing spec into a small reusable helper that takes a pair of locale JSON file paths and asserts identical (recursive) key sets in both directions, then apply it to `notifications.json` and `web.json` alongside the existing `errors.json` one.

**Acceptance criteria**:
- [ ] Shared helper extracted from the existing errors spec
- [ ] Applied to `notifications.json` and `web.json`
- [ ] Zero current violations

---

### Story 13 — `knip`: unused dependencies + dead exports 🟡

**New dependency**: `knip` (dev-only). Replaces the manual grep sweep that already found 3 real cases once (#78 — `express`, `jsonwebtoken`, `ms`) and covers `ts-prune`'s dead-export use case in the same tool, chosen specifically because it's the actively-maintained option built for pnpm workspaces (unlike `depcheck`, which has slower maintenance and known monorepo false-positive issues).

**Acceptance criteria**:
- [ ] `knip.json` configured per workspace package/app
- [ ] Ships **non-blocking** first (report-only) — expect real findings on first run, triage before promoting to blocking

---

### Story 14 — `arethetypeswrong`: `packages/*` publish-shape validation 🟡

**New dependency**: `arethetypeswrong` (dev-only). Directly matches the #77 failure mode (`packages/types` transitioning from type-only to real runtime values, breaking Node's native TS type-stripping in production — invisible to `tsc --noEmit`, tests, and `docker build`, only surfacing at `docker run`).

**Acceptance criteria**:
- [ ] Run against every `packages/*` workspace package that ships `"main"`/`"types"`
- [ ] Wired into CI for those packages specifically (not the whole monorepo)

---

### Story 15 — No `.skip()`/`.only()` in tests 🟡

**New dependencies**: `eslint-plugin-jest` (`apps/backend`, `apps/bff`) + `@vitest/eslint-plugin` (`apps/web` — matching that app's actual test runner, not Jest).

**Acceptance criteria**:
- [ ] `no-disabled-tests`/`no-focused-tests` (or Vitest's equivalents) enabled in each app's ESLint config
- [ ] Zero current violations

---

### Story 16 — Ban unrestricted `eslint-disable` 🟡

**New dependency**: `@eslint-community/eslint-plugin-eslint-comments` (the actively-maintained community fork — the original `eslint-plugin-eslint-comments` package has slower maintenance, not worth adopting the less-maintained one for a new dependency).

**Acceptance criteria**:
- [ ] `no-unlimited-disable` (bare `eslint-disable` banned, `eslint-disable-next-line <specific-rule>` still allowed) enabled repo-wide
- [ ] Existing bare disables (if any) triaged to either fix the underlying issue or scope the disable to the specific rule

---

### Story 17 — Exploratory, non-blocking: tenant_id-missing query-builder detector ⚪

This is the **highest security value** candidate in the whole TD — it directly targets anti-pattern **row #1** (`WHERE id = ?` without `tenant_id` → cross-tenant data leak, the worst-case failure mode for a multi-tenant system) — and also the **highest risk** one, both in false-negative cost (a miss here is a real security incident) and false-positive noise (legitimate tenant-exempt transport tables already exist — `shared.inbox`/`shared.outbox`, see #133).

**Mechanism**: `ts-morph` scan of every repository method for `createQueryBuilder()`/`.where()`/`.andWhere()` chains with no `tenantId`/`tenant_id` reference anywhere in the chain.

**Explicitly ships report-only, never auto-promoted to blocking without a manual decision** — mirroring the precedent your own docs already set for `scripts/pre-pr.sh` check 25 (#133): a blunt grep-style check can't distinguish "genuinely forgotten `tenant_id`" from "deliberately tenant-exempt transport table," so a documented exemption list (not a code allow-list) is the answer, same as that row's own resolution.

**Acceptance criteria**:
- [ ] Prototype built and run against `main` in report mode
- [ ] False-positive list reviewed and documented (expect `shared.inbox`/`shared.outbox` and similar transport tables to need exemption)
- [ ] Explicit go/no-go decision recorded before ever considering promotion to blocking — this story does not ship as a blocking gate as part of this TD

---

### Story 18 — Optional/bonus: adopt `eslint-config-next` / `@next/eslint-plugin-next` ⚪

Not sourced from `docs/ANTI_PATTERNS.md` directly — found while verifying `apps/web/eslint.config.js`. The app runs Next.js 16 with **zero** Next-specific linting today (only `eslint-plugin-react-hooks` + `eslint-plugin-jsx-a11y`). Image/link/script best-practice rules (the exact category `<Image fill>` without `sizes` — #72 — falls into) get no static checking at all right now.

**Acceptance criteria**:
- [ ] `@next/eslint-plugin-next`'s recommended config added to `apps/web/eslint.config.js`
- [ ] Current violations triaged (expect some — this closes a gap that's existed since the app was scaffolded)

---

## Explicitly Out of Scope

Named here deliberately, with why, so it's a decision rather than a silent gap:

| Rule | Why it resists deterministic detection |
|---|---|
| Hardcoded business-rule magic numbers (#9) | Magic numbers are everywhere in legitimate code (array indices, HTTP statuses); a denylist of *known* past violations has near-zero future value, and a general "no numeric literal" rule is unworkable noise |
| English copy leaking into pt-BR templates (#18) | Requires language detection/NLP; no static-analysis shortcut exists that wouldn't need constant tuning |
| Both-direction `isActive` guard (#92) | Business-logic completeness — whether a given use case *should* guard both directions is a domain judgment, not a structural shape |
| Duplicate cross-context ports / duplicate read endpoints / duplicate use cases (#79, #89, #90, #91) | "Is this really the same responsibility" is a design judgment; a naming/shape heuristic here already produced false positives in your own bad-smell-audit iteration history |
| Hide-list/allow-list invariant reasoning (#117) | The point of this row is precisely that surface similarity isn't the same as satisfying the shared invariant — automating it would just re-create the original mistake in code form |
| "Too much orchestration in web vs BFF" (BFF-1's fuzzier half) | A call-count/branching heuristic is a proxy metric, not a real detector; risks the same "expanding a blocking gate to chase an exploratory audit's coverage" mistake row #137 already rejected |
| TypeORM optimistic-locking-on-detached-entities (ENGINEERING_RULES §Transactions) | Whether a given aggregate write is "concurrency-sensitive enough" to need the explicit version-guarded `UPDATE` pattern is a per-aggregate design call, not a generic shape |
| Interceptor-vs-`ExceptionFilter` placement for Guard-visible concerns (#134) | The specific past instance was narrow and bespoke (structured error-logging); a generic "no `catchError` in any Interceptor" rule would have too many legitimate exceptions to be worth encoding |
| Port "best-effort/never-throws" contract enforcement, full-method (#28's second half) | Mechanizable in principle (flag a method not fully wrapped in try/catch) *only if* a marker convention exists first (e.g. a JSDoc tag). No such convention exists today — a prerequisite step, not something to build blind |
| Fetcher naming vs. bounded context (WEB-7) | Already tried once — your own docs record the naive version producing 9/9 false positives (TD23-S17) because the target directory no longer exists post-TD-21. Stays a manual/audit-only check |

---

## Trade-offs

- **CI wall-clock cost.** Every new blocking step (dependency-cruiser, knip, arethetypeswrong) adds time to every PR. The `ts-morph` stories are the cheapest on this axis — they run inside the existing `pnpm test` invocation, not a new CI stage.
- **False-positive tax vs. periodic audit.** Anti-pattern #137 already made this call: a blocking gate's false positive taxes every engineer on every PR, unlike an occasional audit's. Every story above is scoped to a rule with a documented, real incident behind it — this TD deliberately does not chase the freeform-audit's broader (and more subjective) coverage.
- **Type-aware ESLint was considered and rejected.** The transaction/IO check (Story 3) could have been built as a custom ESLint rule needing `parserOptions.project` turned on. That was rejected in favor of an isolated `ts-morph` `Project` scoped to the relevant files — same capability, without a repo-wide lint-performance regression on every file, every run. This is the "mounting complexity" principle from `.copilot/context.md` applied directly: prefer the approach that needs less new machinery.
- **New devDependencies are still a supply-chain surface**, even though every one proposed here is dev-only (never shipped to `pnpm deploy --prod`, confirmed via the same dependency-classification discipline as #78). They still flow through the existing Snyk SCA scan — no new blind spot, but not a zero-cost addition either.
- **Rollout-ordering risk.** A new required CI check must never be added to branch-protection `required_status_checks` before its workflow has been merged and green on `main` for a burn-in period — this has previously broken an unrelated PR live when skipped. See Rollout Phases below; this is not optional sequencing.
- **Local vs. CI drift.** Whatever runs locally (`/pre-pr`) must be wired identically to what actually blocks in CI — a repeat of the Checkov local-vs-CI gap (local `--framework terraform` runs missed the CI secrets scanner) would quietly reintroduce the exact problem this TD exists to close.
- **Maintenance burden.** `dependency-cruiser` rules and `ts-morph` tests need updating when a legitimate refactor moves files across the boundaries they encode. This is an accepted, ongoing cost — not a one-time investment — and should be weighed the same way any other test suite's maintenance is.

---

## Rollout Phases

1. **Phase 1 — report-only.** Every new check lands as non-blocking first (a CI job that runs and reports but doesn't fail the build).
2. **Phase 2 — promote to blocking.** Only after verifying zero (or fully triaged/exempted) findings against the current codebase over a burn-in period.
3. **Phase 3 — add to required checks.** Only after Phase 2 has been green on `main` for a period — never add to `required_status_checks` in the same change that introduces the workflow.

Story 17 (tenant_id detector) is explicitly capped at Phase 1 for the duration of this TD — promoting it to blocking is a separate, deliberate future decision, not an automatic next step.

---

## Where Each Check Runs

| Mechanism | Where it executes | New CI step needed? |
|---|---|---|
| `no-restricted-imports`/`no-restricted-syntax` (Stories 2, 4) | `pnpm lint` (existing) | No |
| ESLint core rules (Story 5) | `pnpm lint` (existing) | No |
| `eslint-plugin-jest`/`@vitest/eslint-plugin`/`eslint-comments` (Stories 15, 16) | `pnpm lint` (existing) | No |
| `dependency-cruiser` (Story 1) | New `pnpm dep-cruise` script | Yes (Phase 1 non-blocking, then promoted) |
| `ts-morph` architecture tests (Stories 3, 6–12) | New spec files under existing `pnpm test` | No — free ride on the existing test gate |
| `knip` (Story 13) | New script | Yes (Phase 1 non-blocking) |
| `arethetypeswrong` (Story 14) | New script, scoped to `packages/*` | Yes (Phase 1 non-blocking) |
| Tenant-id detector (Story 17) | New script | Yes, permanently non-blocking for this TD's duration |

---

## Suggested PR Waves

- **Wave 1** (cheapest, zero new dependencies): Stories 4, 5 — the ESLint rule pack + core rules.
- **Wave 2** (flagship fixes, highest proven value): Stories 2, 3 — raw-SQL ban + transaction/IO check. Story 3 introduces the `ts-morph` harness used by everything after it.
- **Wave 3** (architecture-test suite buildout): Stories 6, 7, 8, 9, 10 — all reuse Wave 2's harness, can land as separate PRs or one batch.
- **Wave 4** (known-gap closure): Story 11 (`@ikaro/types` drift) and Story 12 (i18n parity) — independent of each other, both close documented gaps.
- **Wave 5** (new tooling, dependency-cruiser + supply-chain hygiene): Stories 1, 13, 14.
- **Wave 6** (test hygiene): Stories 15, 16.
- **Wave 7** (bonus, lowest priority): Story 18.
- **Separate, deliberately not batched**: Story 17 — ships alone given its explicit non-promotion constraint.

---

## Acceptance Criteria (TD-level)

- [ ] All Wave 1–6 stories implemented, passing against `main`, and correctly wired per the "Where Each Check Runs" table
- [ ] Every new blocking CI step followed the 3-phase rollout (report-only → blocking → required-check) — no check skips straight to required
- [ ] Story 17 shipped and explicitly capped at report-only, with its go/no-go decision documented separately from this TD's closure
- [ ] Retired manual bad-smell-audit checks (BE-1, BE-4, WEB-9 once their mechanical equivalents ship) so the same rule isn't checked twice by two different mechanisms
- [ ] `docs/ANTI_PATTERNS.md` updated to note, per row addressed here, that it's now CI-enforced (not just documented) — so a future reader doesn't re-litigate whether it needs an agent to remember it
- [ ] This TD's own "Out of Scope" table double-checked against `docs/ANTI_PATTERNS.md` one more time before closure, in case a new incident since 2026-07-27 changed the calculus on any row

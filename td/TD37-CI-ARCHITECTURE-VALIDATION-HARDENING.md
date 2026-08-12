# TD37 — CI-Enforced Architecture & Best-Practice Validation (reduce reliance on `.md` rules)

## Status

- **Type**: Technical Debt / CI Hardening — Architecture Enforcement
- **Priority**: High (mixes 🔴 proven-recurring-failure stories with 🟡/⚪ lower-risk ones — see Confidence key)
- **Context**: cross-cutting — `apps/backend`, `apps/bff`, `apps/web`, `packages/*`, `packages/config/eslint-base.js`, CI workflows
- **Created**: 2026-07-27
- **Decision status**: Revised 2026-08-09 after codebase feasibility review. Ready for discovery and implementation in the dependency order below; individual stories still begin with `/story-discovery`.
- **Related**: `docs/ANTI_PATTERNS.md`, `docs/ENGINEERING_RULES.md`, `docs/CODE_STANDARDS.md`, `.claude/commands/bad-smell-audit.md`, `td/TD09-WEB-TYPES-DRIFT-VS-IKARO-TYPES.md`, `td/TD24-OUTBOX-INBOX-PATTERN.md`, `td/TD31-BAD-SMELL-AUDIT-COVERAGE-SNAPSHOT.md`

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

The candidate list was built from `docs/ANTI_PATTERNS.md`, `docs/ENGINEERING_RULES.md`, `docs/CODE_STANDARDS.md`, and `.claude/commands/bad-smell-audit.md`, then cross-checked against what's **actually installed today** (`packages/config/eslint-base.js`, `apps/*/eslint.config.js`) so this TD doesn't propose re-implementing something SonarCloud or an existing rule already covers. Row numbers in those living documents are intentionally not used as stable identifiers here; enforcement messages should cite the rule title and source path instead. Confirmed already covered elsewhere and intentionally *not* duplicated here:

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

### Story 0 — Architecture-enforcement foundation and recorded policy decisions 🔴 ◐ Partial

No detector may encode an undocumented guess. Before adding a blocking rule, create one shared `architecture-check` runner/CLI that can load the backend, BFF, web, and workspace TypeScript projects. Keep the rules themselves in small independently-tested modules; do not install `ts-morph` only in the backend and then make web/package checks depend on an accidental hoist.

This story records the following policy as versioned, reviewable data rather than scattered glob exceptions:

- **Layer taxonomy:** `domain/**` is framework-free; `application/**` is framework-free and depends on domain, application ports/DTOs, and approved shared framework-neutral modules only; infrastructure contains controllers, adapters, repositories, event handlers, and framework wiring. `*.module.ts` is an explicit composition-root exception, not application code.
- **Context dependency matrix:** cross-context imports are deny-by-default. Permitted edges are exact source-path-to-source-path entries for existing `infrastructure/cross-context/**` adapters and event consumers, each with rationale and owner. This replaces the incorrect claim that a context may import only itself and `shared`.
- **Backend `@ikaro/types` policy:** backend may consume only explicit, framework-neutral protocol subpaths: error codes/problem-details, actor-role/JWT protocol, and shared media protocol. Migrate the current allowed backend symbols (`ActorRole`, `ACTOR_ROLES`, `ALLOWED_IMAGE_CONTENT_TYPES`) out of the root barrel into those subpaths before enabling the import rule. Backend production code must not import the root `@ikaro/types` barrel or feature request/response DTO modules.
- **Exception registry:** TypeORM persistence adapters, raw-fetch cases, tenant-exempt entities/tables, dynamic framework exports, and ESLint suppressions are explicit entries with rule, rationale, owner, and review/expiry date. Broad folder exceptions are prohibited.
- **Detector contract:** every detector has permanent positive and negative fixtures, asserts it scanned at least one intended target, and prints file/line plus remediation. A green scan with zero discovered targets is a failure.
- **Tool decision spike:** implement three representative semantic rules (transactional save, error-mapper coverage, and Nest DI aliasing) with the shared runner. Evaluate direct `ts-morph` against `ts-archunit`; retain exactly one. `dependency-cruiser` remains the sole authority for import-graph rules.

**Acceptance criteria**:
- [ ] Shared runner is executable locally and in CI for every project it scans
- [ ] The taxonomy, dependency matrix, exception registry, and backend package-contract policy are committed as machine-readable configuration next to the checks
- [ ] The tool spike records the selected semantic-analysis implementation and why it handles the three representative rules
- [ ] Fixture and zero-target conventions are available to every later story

### Story 1 — `dependency-cruiser`: architectural boundaries 🔴 ◐ Partial

**New dependency**: `dependency-cruiser` (dev-only).

Add workspace-aware `dependency-cruiser` configuration at the repo root, wire a root `pnpm dep-cruise` script, and add a CI step. Per-workspace entry/project configuration is required; a top-level-only configuration must not silently omit packages.

Rules to encode:
- `apps/backend/src/contexts/<A>/**` must not import `apps/backend/src/contexts/<B>/**` unless the exact edge appears in Story 0's permitted-edge matrix. Existing cross-context adapters and event consumers are therefore permitted intentionally, not by a wildcard.
- `apps/backend/src/contexts/**/domain/**` must not import framework, transport, persistence, or infrastructure modules: `@nestjs/*`, `typeorm`, `axios`, `express`, sibling-context application/infrastructure paths, or local `application/**`/`infrastructure/**` paths.
- `apps/backend/src/contexts/**/application/**` must not import NestJS, TypeORM, HTTP/Express, controllers, repositories/adapters, or another context's internal implementation. It may import only its domain, application ports/DTOs, and Story 0-approved shared framework-neutral contracts. `*.module.ts` is excluded because it is composition root.
- `apps/bff/src/**` must not import `apps/backend/src/contexts/**` (bad-smell-audit BFF-4).
- `apps/bff/src/shared/**` must not import feature code; BFF shared infrastructure must remain feature-neutral.
- `apps/backend/src/**` must use only the explicit `@ikaro/types` backend protocol subpaths defined in Story 0. Root-barrel and feature DTO imports are forbidden.
- Generic graph safety: no circular production dependencies, no production-to-test imports, no imports of undeclared packages, no production imports of dev dependencies, and no unresolved imports.

**What it catches**: a future PR reintroducing context coupling, a domain file accidentally pulling in a NestJS decorator, a BFF file reaching into backend source instead of going through HTTP.
**What it does NOT catch**: semantic duplication — e.g. two cross-context ports doing the same job (#79) is a design judgment call, not an import-graph shape; stays a code-review/bad-smell-audit item.

**Acceptance criteria**:
- [ ] Configuration encodes all rule groups above, the exact permitted-edge matrix, and the backend package-contract subpath policy
- [ ] `pnpm dep-cruise` scans all configured workspaces and fails if a workspace/project is omitted
- [ ] CI step added (non-blocking first — see Rollout Phases)
- [ ] Zero violations on current `main` before promoting to blocking

---

### Story 2 — Ban raw SQL / repository-bypass outside repository adapters 🔴 ◐ Partial

Directly addresses **#124** — the exact TD24-S01 incident (`OutboxPublisher` had every `INSERT`/`SELECT ... FOR UPDATE SKIP LOCKED`/`UPDATE`/`DELETE` inlined, undetected through a full `/pre-pr` pass).

**Mechanism**: `no-restricted-imports` (zero new dependency) bans persistence-bypass APIs outside a precise persistence-adapter allowlist. The rule covers `InjectRepository`, `InjectDataSource`, `Repository`, `EntityManager`, `DataSource`, `getDataSourceToken`, and equivalent TypeORM entry points. Restrict imported names rather than a `^typeorm$` pattern, which would incorrectly ban every TypeORM import.

Before enabling it, resolve the current `booking/infrastructure/cross-context/typeorm-booking-availability.adapter.ts` exception: either refactor it behind a formal repository port or list that specific adapter, its reason, and expiry in Story 0's registry. Do not exempt all `shared/infrastructure/**`; that would permit the exact service/publisher failure this rule exists to prevent.

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
      // Explicit import-name restrictions for TypeORM APIs; no blanket `typeorm` pattern.
    }],
  },
}
```

**What it catches**: any future service/publisher/handler reaching for TypeORM directly instead of a port.
**What it does NOT catch**: a repository adapter itself doing something wrong internally — that's normal code review, this rule only enforces *where* SQL is allowed to live.

**Acceptance criteria**:
- [ ] Rule added to `apps/backend/eslint.config.js` with precise allowlisted persistence-adapter paths
- [ ] Every TypeORM bypass API named above is covered; valid repository adapters and reviewed cross-context persistence adapters are explicitly tested
- [ ] Zero unreviewed current violations; no broad `shared/infrastructure/**` exemption
- [ ] `docs/AGENT_PATTERNS.md` Pattern #1 referenced in the lint error message

---

### Story 2A — Corrective completion of Stories 0–2 🔴

Stories 0–2 were marked done without a criterion-by-criterion verification. The audit found that their core direction is sound, but the following completion work remains. This story closes those gaps before Story 3 expands the semantic suite.

1. Complete Story 0's fixture contract: establish reusable semantic-check fixture/zero-target conventions, including an invalid error-mapper fixture.
2. Complete Story 1's `@ikaro/types` protocol-subpath migration: export the approved backend protocol subpaths and migrate backend production code off the root barrel before enforcing the contract.
3. Correct Story 1's dependency-cruiser semantics: make cross-context permissions exact source-to-target edges, restrict application imports to the documented domain/ports/DTOs/framework-neutral shared surface, detect BFF imports of backend contexts, and derive/check the project registry against every TypeScript workspace (including `packages/architecture-check`).
4. Produce a clean dependency-cruiser baseline under the repository-pinned Node version, with fixtures proving the repaired boundaries.
5. Complete Story 2's fixture coverage: prove a normal repository adapter and the reviewed booking cross-context adapter are permitted, and cover every restricted TypeORM API in the negative fixture.

**Acceptance criteria**:
- [ ] Stories 0–2 each have criterion-level verification evidence; no prior `✅ Done` label is relied upon as evidence
- [ ] Backend protocol subpaths are exported and no backend production root-barrel `@ikaro/types` imports remain
- [ ] Dependency-cruiser enforces every Story 1 boundary against all TypeScript workspaces and passes clean under the repository-pinned Node version
- [ ] Semantic and ESLint fixtures cover the missing valid, invalid, and zero-target cases identified above
- [ ] Story 2 retains the conventional repository-adapter boundary, has no broad shared-infrastructure exemption, and passes clean

---

### Story 3 — No network I/O inside `txManager.run()` 🔴

Directly addresses **#28** — the PR #267 incident (DB read before the network call wasn't wrapped in the "never throws" contract; only the network leg was).

**New dependency**: the semantic-analysis implementation selected in Story 0 (also used by Stories 6–12).

**Mechanism**: a backend architecture test/CLI, run by the shared runner selected in Story 0, that:
1. Loads the backend TypeScript project from `apps/backend/tsconfig.json`.
2. Finds every `CallExpression` whose callee is `.run` on an identifier/parameter typed `ITransactionManager`.
3. Walks the transactional callback for calls to registered external-side-effect port methods. The registry follows resolved symbols from application ports to their concrete adapters; it must not rely on an adapter merely living under `infrastructure/cross-context/`.
4. Excludes callbacks explicitly scheduled with `scheduleAfterCommit`, since those execute after the transaction. The check must distinguish lexical nesting from execution timing.
5. Fails with the file:line of the offending call if found.

**What it catches**: exactly the PR #267 shape — a network-calling adapter method invoked from inside the transactional callback, on either side of the DB write.
Also add the complementary structural rule: every production use-case call to a repository `save()` is lexically enclosed by a callback passed to a parameter typed `ITransactionManager.run()`. Explicitly catalog any legitimate non-use-case exceptions.

**What it does NOT catch**: arbitrary deep interprocedural I/O without a registered port marker. New external-side-effect ports must be registered as part of their implementation; hidden/dynamic I/O stays a review concern.

**Acceptance criteria**:
- [ ] Uses Story 0's shared runner and registered external-side-effect port methods
- [ ] Transactional-I/O and transactional-`save()` checks are implemented with post-commit scheduling coverage
- [ ] Passes clean against current `main`
- [ ] Valid, invalid, and `scheduleAfterCommit` fixtures prove the semantic distinction

---

### Story 4 — ESLint `no-restricted-imports`/`no-restricted-syntax` pack (zero new dependency) 🟡

Bundles the smaller, cheap-to-add rules using the exact mechanism you already use for the `EVENT_BUS`/OTel bans — one PR, several rules, all mirroring existing precedent:

| Rule | Anti-pattern row | Scope |
|---|---|---|
| Ban `RequestContext` import in application layer | ENGINEERING_RULES §RequestContext | `contexts/**/application/**/*.ts` |
| Ban `z.string().uuid()`/`.email()` chained forms | #51 | repo-wide (`no-restricted-syntax`, `CallExpression` selector) |
| Ban raw `fetch(` in `apps/web` outside `bffServerFetch`/`bffPublicFetch`/`bffClient` | WEB-8 | `apps/web/**`, with a reviewed class/path exception registry for gateway forwarding, signed-URL upload, approved external APIs, and documented cached reads |
| Ban `throw new HttpException` inside `*.use-case.ts` | #54 | `contexts/**/application/**/*.use-case.ts` |
| Ban a string-literal argument as the first arg to `.subscribe(`/`.registerTrigger(` | ENGINEERING_RULES §Event Handlers (already fixed repo-wide once, `fix/consistency-naming-consumer`) | event handler registration sites |
| Ban a string-literal argument to `resolveSupportedLocale(` inside protected-area layouts | #106 | `apps/web/app/dashboard/**/layout.tsx`, `apps/web/app/[slug]/my-account/**/layout.tsx` |
| Ban `as React.CSSProperties` in function return position | WEB-3 | `apps/web/**` |

**What it catches**: each is a rule already proven to have been violated at least once (the locale one caused a full JWT-enrichment fire-drill; the consumer-name one was fixed repo-wide once already).
**What it does NOT catch**: `resolveSupportedLocale(payload.locale ?? 'pt-BR')` — the *correct* pattern — still passes, since the rule only flags a bare literal as the sole argument, not a literal used as a fallback.

**Acceptance criteria**:
- [ ] All 7 rules added across `apps/backend/eslint.config.js` / `apps/web/eslint.config.js`; raw-fetch exceptions are explicit registry entries because ESLint cannot prove an inline rationale
- [ ] Zero current violations on `main`
- [ ] The CSS assertion selector is limited to type assertions returned from a function, not arbitrary prop assertions in tests
- [ ] Each rule's error message cites the rule title/source it enforces (not a brittle anti-pattern row number)

---

### Story 5 — ESLint core rules already mandatory in `docs/CODE_STANDARDS.md`, currently off 🟡

Zero new dependencies — these ship inside ESLint itself:

- `max-lines-per-function` — CODE_STANDARDS.md: "Functions ≤ 20 lines"; explicitly configure `max: 20` and the chosen comment/blank-line behavior.
- `max-lines` — file length, **not class length**. Either amend CODE_STANDARDS to state a file limit or introduce a semantic class-length check; do not claim ESLint `max-lines` enforces classes ≤ 200 lines.
- `default-param-last` — CODE_STANDARDS.md's default-parameter rule (currently only SonarCloud-gated, this gives the same feedback at `pnpm lint` time instead of waiting for the Sonar CI stage)

**Acceptance criteria**:
- [ ] Rule configuration matches the documented policy; the class-vs-file decision is recorded before implementation
- [ ] Existing violations on `main` have a quantified baseline and an owner/expiry for each temporary exception; do not silently raise thresholds

---

### Story 6 — `ts-morph` suite, part 1: error-handling completeness 🔴

Builds on Story 3's harness.

- **`mapXxxError` completeness**: enumerate every class extending a context domain-error root. Each class must be covered either by a specific `instanceof` branch or by an intentional base-class branch with its documented default status. Generic branches are valid and must not force redundant subclasses branches.
- **`Object.setPrototypeOf` check**: resolved direct subclasses of `Error` that declare their own constructor must call `Object.setPrototypeOf(this, new.target.prototype)`. Descendants that inherit that constructor are already correct and must not be flagged.
- **VO `create()` never throws bare `Error`**: scan value objects by base type/interface and `**/value-objects/**`, not only `*.vo.ts`; this includes shared `Address` and `Money`. Flag only actual static `create()` bodies that throw a bare `Error`.
- **Shared VO error mapping:** where a shared VO owns typed validation errors, verify its consuming HTTP error mappers intentionally map those errors rather than returning an accidental generic 500.

**What it catches**: a new error class added without wiring its mapper branch (falls through to a generic 500 with no test failure today); a copy-pasted error class missing the prototype fix (breaks `instanceof` silently).
**What it does NOT catch**: whether the *chosen* HTTP status code is semantically correct for the error — that's still a design/review call.

**Acceptance criteria**:
- [ ] All four checks implemented and passing against current `main`
- [ ] Failure messages name the exact class and expected mapper file

---

### Story 7 — `ts-morph` suite, part 2: test-hygiene completeness 🟡

- **Entity/event/command builder coverage**: derive production entities from resolved TypeORM entity decorators, including shared inbox/outbox entities, then assert a matching builder exists. Same for `DomainEvent`/`Command` classes constructed inline in 2+ spec files.
- **`EntityBuilder` primary-key defaults to `uuidv7()`**: inspect every resolved TypeORM primary-key property and its builder field initializer/default. Do not assume the field is named `id` or that its default is in the constructor; valid names include `lineId`, `entryId`, and `eventId`.
- **Migration/entity test registration**: make `integration-global-setup.ts`, `test-datasource.ts`, and intentionally partial context helpers an explicit registration map. Compare each source against the set it is responsible for; do not require every helper to contain every entity.

**What it catches**: a new entity/migration shipped without its test-harness registration — currently "causes silent failures — unit tests pass but integration tests error on the first DB query," per your own docs, with no test pointing at *why*.
**What it does NOT catch**: whether the builder's other fields are sensible defaults — only its existence, primary-key default, and registration.

**Acceptance criteria**:
- [ ] All 3 checks cover resolved production entities, including shared entities and non-`id` primary keys
- [ ] The registration-map source of truth makes intentional helper subsets explicit
- [ ] BE-4's existing manual bad-smell-audit check can be retired once this ships (avoid running the same check twice, once mechanically and once via LLM prompt)

---

### Story 8 — `ts-morph` suite, part 3: DI/module wiring 🔴

- **`@Global()` module ↔ `exports` pairing**: resolve injections and module exports. A global module must export its externally consumed tokens, but it may retain internal providers; do not require every provider to be exported.
- **Unsafe class `useExisting` detector**: flag a provider array where a class appears both as a bare entry (or explicit `{ provide: SomeClass, useClass: SomeClass }`) and as a `useExisting` target. Permit safe token-to-token aliases such as `TRIGGER_BUS -> EVENT_BUS`.
- **Reverse alias detector:** flag the corresponding class-token-to-functional-token alias shape documented in the anti-patterns, using the same resolved-provider model.

**What it catches**: exactly the TD24-S02 incident (`OutboxModule` marked `@Global()` without the export line, DI resolution failing with the error pointing at the *consumer*, not the real cause) and the exact storage/outbox `useExisting` bug, both already proven to recur.
**What it does NOT catch**: a class that's `useClass`-registered correctly but still has a code smell elsewhere in its DI wiring — this only catches the specific alias-vs-registration shape.

**Acceptance criteria**:
- [ ] All three checks pass against `main`
- [ ] Permanent fixtures cover a missing external global export, unsafe class alias, safe token alias, and reverse alias; do not rely on a temporary local regression

---

### Story 9 — `ts-morph`: aggregate props typed as primitive when a VO exists (bad-smell-audit BE-1) 🟡

Use a closed, reviewed registry mapping each aggregate's persisted private property to its required VO. Resolve stored aggregate properties and declared VO mappings; do not infer from broad field-name fragments such as `color`. The registry must include existing concepts such as `contactEmail`, `contactPhone`, Address, and Money while allowing intentional public transport strings.

**What it catches**: a new aggregate field added with a plain primitive where the project already has a VO for that exact concept.
**What it does NOT catch**: a genuinely new field type with no existing VO — that's a real design decision (build a new VO or not), not a lint violation.

**Acceptance criteria**:
- [ ] Registry and check pass against `main`, with allowed primitive transport fields covered by fixtures
- [ ] Bad-smell-audit's manual BE-1 check retired once this ships

---

### Story 10 — `ts-morph`: naming-convention checks 🟡

- Use case result type is named `{UseCaseClassName}Result`, never `*Info`/`*Dto`/raw `T[]`; first migrate the current baseline violations and state their scope.
- Distinguish application `UseCaseNameInput` types from HTTP `{Action}Dto` schemas; do not conflate the two documented contracts.
- BFF response interfaces **and type aliases** live in `<module>.types.ts`, never declared inline in a `*.controller.ts`, with documented shared response/DTO exceptions.

**What it catches**: naming drift that makes types unpredictable to find/import — a real, if low-severity, recurring pattern per the doc's own examples.
**What it does NOT catch**: whether the *shape* of the DTO is correct — purely a naming check.

**Acceptance criteria**:
- [ ] All 3 checks pass against `main` after the identified baseline migration
- [ ] Positive/negative fixtures distinguish application input, transport DTO, results, BFF type aliases, and documented exceptions

---

### Story 11 — `ts-morph`: `@ikaro/types` drift detector, full-codebase (WEB-9) 🔴

This is the one your own docs already flag as a **known, currently-unfixed gap**: `scripts/pre-pr.sh`'s version of this check is diff-scoped (only files changed in the current PR), which is "exactly how `LoyaltyEntryItem`/`LoyaltyRedemptionItem` drifted undetected" (TD31, items 2.1/2.2) — nobody had touched those files in the PR that would have caught it. `bad-smell-audit`'s `WEB-9` covers the full codebase today, but only when an LLM agent is explicitly asked to run it — not on every PR.

**Mechanism**: scan all web transport-boundary modules: `features/**/api/**`, root `features/**/api.ts`/`api.server.ts`, and shared API/type modules. If `@ikaro/types` exports a same-named type, use the selected type checker to compare both directions (including nullability and JSON transport compatibility). An identical duplicate name is also a finding unless it is in a documented exception; differently named semantic duplicates remain review territory.

**What it catches**: exactly the `LoyaltyEntryItem`/`LoyaltyRedemptionItem` class of drift, on every PR, regardless of which files that PR touches.
**What it does NOT catch**: which side is *correct* when they differ (per TD09, sometimes `@ikaro/types` is the stale one) — the check only flags the mismatch; a human still decides the fix direction.

**Acceptance criteria**:
- [ ] Shared runner scans web and workspace types without relying on backend-only dependencies
- [ ] Full-codebase (not diff-scoped) check passes against `main` with zero unreviewed duplicate/mismatch findings
- [ ] `scripts/pre-pr.sh`'s existing diff-scoped `WEB-7`/`WEB-9`-adjacent checks can stay as a fast local pre-check, but this becomes the authoritative full-codebase gate

---

### Story 12 — Generalize i18n key-parity checks beyond `errors.json` 🟡

`apps/web/shared/lib/i18n/error-codes-exhaustiveness.spec.ts` already proves this exact test pattern works and is already CI-enforced — it's the strongest existing precedent for this whole TD. `notifications.json` and `web.json` have the identical mandatory rule ("always add the key to both locales in the same commit") with **no equivalent spec**.

**Mechanism**: retain the existing error-code-catalogue exhaustiveness assertions, then add a small reusable helper that checks recursive locale-key parity in both directions. Apply it to `errors.json`, `notifications.json`, `web.json`, and `email-tables.json`, which is loaded by backend localization too.

**Acceptance criteria**:
- [ ] Existing error-code-catalogue coverage is preserved
- [ ] Shared helper is applied to all four locale JSON families
- [ ] Zero current violations

---

### Story 13 — `knip`: unused dependencies + dead exports 🟡

**New dependency**: `knip` (dev-only). Replaces the manual grep sweep that already found 3 real cases once (#78 — `express`, `jsonwebtoken`, `ms`) and covers `ts-prune`'s dead-export use case in the same tool, chosen specifically because it's the actively-maintained option built for pnpm workspaces (unlike `depcheck`, which has slower maintenance and known monorepo false-positive issues).

**Acceptance criteria**:
- [ ] Workspace configuration defines entry/project/plugin settings per app/package; it does not rely on ignored top-level monorepo defaults
- [ ] `--debug` baseline is reviewed, and every intentional dynamic/framework/reflection export is allowlisted with reason, owner, and expiry
- [ ] Ships **non-blocking** first via `continue-on-error` plus an artifact/PR annotation — expect real findings on first run, triage before promoting to blocking

---

### Story 14 — `arethetypeswrong`: `packages/*` publish-shape validation 🟡

**New dependency**: `@arethetypeswrong/cli` (dev-only; command `attw`). It validates built package type/package metadata, but does not by itself reproduce the #77 Node native type-stripping / `pnpm deploy --prod` runtime failure. Pair it with a packed-artifact runtime import smoke test that mirrors production consumption.

**Acceptance criteria**:
- [ ] Build each publish-shaped workspace package, pack the artifact, and run `attw` against that packed/built artifact
- [ ] Run a production-shaped runtime import smoke test for every package that ships runtime code
- [ ] Wired into CI for those packages specifically (not the whole monorepo)

---

### Story 15 — No `.skip()`/`.only()` in tests 🟡

**New dependencies**: `eslint-plugin-jest` (`apps/backend`, `apps/bff`) + `@vitest/eslint-plugin` (`apps/web` — matching that app's actual test runner, not Jest).

**Acceptance criteria**:
- [ ] `no-disabled-tests`/`no-focused-tests` (or Vitest's equivalents) enabled in each app's ESLint config
- [ ] Scope is honest: either apps only, or an explicit root/static target also scans `packages/*`; recursive `pnpm lint` alone does not currently lint packages without lint scripts
- [ ] Existing changed-file `scripts/pre-pr.sh` behavior is retained or deliberately replaced without duplicate/conflicting enforcement

---

### Story 16 — Ban unrestricted `eslint-disable` 🟡

**New dependency**: `@eslint-community/eslint-plugin-eslint-comments` (the actively-maintained community fork — the original `eslint-plugin-eslint-comments` package has slower maintenance, not worth adopting the less-maintained one for a new dependency).

Resolve the policy contradiction before implementation: `docs/CODE_STANDARDS.md` currently prohibits all `// eslint-disable`, while this story originally allowed a rule-scoped form. The preferred policy is no disables; if an exceptional scoped disable is approved, it must be in Story 0's exception registry with rationale, owner, and expiry.

**Acceptance criteria**:
- [ ] Documentation and lint policy agree on whether any scoped disable is allowed
- [ ] Chosen ESLint-comments rules enforce the documented policy across the same scope as Story 15
- [ ] Existing disables are removed or recorded as time-bounded exceptions

---

### Story 17 — Exploratory, non-blocking: tenant_id-missing query-builder detector ⚪

This is a useful **narrow heuristic**, not a security guarantee. It targets one dangerous class of missing tenant predicate but has both false-negative and false-positive risk. Tenant isolation remains protected primarily by database constraints and integration tests.

**Mechanism**: scan every repository method for `createQueryBuilder()`/`.where()`/`.andWhere()` chains with no `tenantId`/`tenant_id` reference anywhere in the chain. Emit an artifact containing scanned query-builder chains, exemption matches, and coverage. It deliberately does not claim to cover repository `.find({ where: ... })` and similar APIs.

**Explicitly ships report-only, never auto-promoted to blocking without a manual decision** — mirroring the precedent your own docs already set for `scripts/pre-pr.sh` check 25 (#133): a blunt grep-style check can't distinguish "genuinely forgotten `tenant_id`" from "deliberately tenant-exempt transport table," so a documented exemption list (not a code allow-list) is the answer, same as that row's own resolution.

**Acceptance criteria**:
- [ ] Prototype built and run against `main` in report mode, emitting its coverage/exemption artifact
- [ ] Typed entity/table exemption inventory reviewed and documented, including platform tenant exemptions where applicable—not only shared inbox/outbox
- [ ] Explicit go/no-go decision recorded before ever considering promotion to blocking — this story does not ship as a blocking gate as part of this TD

---

### Story 18 — Optional/bonus: adopt `eslint-config-next` / `@next/eslint-plugin-next` ⚪

Not sourced from `docs/ANTI_PATTERNS.md` directly — found while verifying `apps/web/eslint.config.js`. The app runs Next.js 16 with **zero** Next-specific linting today (only `eslint-plugin-react-hooks` + `eslint-plugin-jsx-a11y`). Image/link/script best-practice rules (the exact category `<Image fill>` without `sizes` — #72 — falls into) get no static checking at all right now.

**Acceptance criteria**:
- [ ] Pin and validate compatibility with this repository's ESLint 10 and Next 16 flat-config setup; document exact config import and ordering
- [ ] Establish a violation baseline and ship report-only first; promotion to blocking is a separate decision after burn-in

### Story 19 — Mature-flow promotion: blocking and required architecture checks 🔴

This story is deliberately scheduled after the detector waves have shipped and burned in. It is the formal promotion point for architecture validation; no detector may become a merge blocker merely because its first implementation is green once.

**Acceptance criteria**:

- [ ] The burn-in window is recorded in the PR/plan history, with the report-only job green on `main` and reviewed findings either at zero or explicitly resolved in the machine-readable exception registry.
- [ ] Every detector has a permanent positive fixture, negative fixture, zero-target assertion, remediation message, and an owned exception entry where applicable.
- [ ] The local command and CI command are byte-for-byte equivalent in behavior; a clean local run is reproduced from a clean CI checkout with `pnpm install --frozen-lockfile`.
- [ ] The report-only `architecture-check` job is promoted to blocking by removing `continue-on-error: true`; the job still publishes actionable file/line output for any failure.
- [ ] The blocking job is observed green on `main` for a second burn-in window before branch protection changes are made.
- [ ] The repository's branch-protection configuration is updated in a separate, reviewable change to add the architecture check as a required status check; the workflow introduction and required-check promotion are never the same change.
- [ ] A rollback procedure is documented: temporarily return the job to report-only only through an explicit reviewed change, with the reason and expiry recorded.

### Separate follow-up candidate — CodeQL security analysis ⚪

CodeQL complements this TD's architecture checks by tracking security-relevant data flow in TypeScript. It does not replace Snyk (dependencies), Gitleaks (secrets), Trivy (images), Sonar, or the architecture runner. Assess GitHub Code Security availability and, if available, introduce `javascript-typescript` with a report-only security-and-quality baseline in a dedicated security-hardening TD so it does not delay the architectural work above.

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

- **CI wall-clock cost.** Every new blocking step (dependency-cruiser, knip, ATTW) adds time to every PR. The semantic checks should run through the existing test gate where practical; Story 0's spike must record their measured cost before promotion.
- **False-positive tax vs. periodic audit.** Anti-pattern #137 already made this call: a blocking gate's false positive taxes every engineer on every PR, unlike an occasional audit's. Every story above is scoped to a rule with a documented, real incident behind it — this TD deliberately does not chase the freeform-audit's broader (and more subjective) coverage.
- **Type-aware ESLint is not the chosen semantic engine.** The transaction/IO check could be built as a custom ESLint rule needing `parserOptions.project` on every lint run. Story 0 compares a focused type-aware runner instead, avoiding a repo-wide lint-performance regression and retaining only the implementation that best expresses the project rules.
- **New devDependencies are still a supply-chain surface**, even though every one proposed here is dev-only (never shipped to `pnpm deploy --prod`, confirmed via the same dependency-classification discipline as #78). They still flow through the existing Snyk SCA scan — no new blind spot, but not a zero-cost addition either.
- **Rollout-ordering risk.** A new required CI check must never be added to branch-protection `required_status_checks` before its workflow has been merged and green on `main` for a burn-in period — this has previously broken an unrelated PR live when skipped. See Rollout Phases below; this is not optional sequencing.
- **Local vs. CI drift.** Whatever runs locally (`/pre-pr`) must be wired identically to what actually blocks in CI — a repeat of the Checkov local-vs-CI gap (local `--framework terraform` runs missed the CI secrets scanner) would quietly reintroduce the exact problem this TD exists to close.
- **Maintenance burden.** `dependency-cruiser` rules and semantic architecture tests need updating when a legitimate refactor moves files across the boundaries they encode. This is an accepted, ongoing cost — not a one-time investment — and should be weighed the same way any other test suite's maintenance is.

---

## Rollout Phases

1. **Phase 1 — report-only.** Every new check lands as non-blocking first. For independent scripts, use a CI job with `continue-on-error`, artifact, and PR annotation. For a rule running inside the required `pnpm lint` job, configure it as a warning during burn-in; do not configure ESLint `error` and call it report-only.
2. **Phase 2 — promote to blocking.** Only after verifying zero (or fully triaged/exempted) findings against the current codebase over a burn-in period.
3. **Phase 3 — add to required checks.** Only after Phase 2 has been green on `main` for a period — never add to `required_status_checks` in the same change that introduces the workflow.

Story 17 (tenant_id detector) is explicitly capped at Phase 1 for the duration of this TD — promoting it to blocking is a separate, deliberate future decision, not an automatic next step.

---

## Where Each Check Runs

| Mechanism | Where it executes | New CI step needed? |
|---|---|---|
| `no-restricted-imports`/`no-restricted-syntax` (Stories 2, 4) | `pnpm lint` (existing; warning during Phase 1) | No |
| ESLint core rules (Story 5) | `pnpm lint` (existing; warning during Phase 1) | No |
| `eslint-plugin-jest`/`@vitest/eslint-plugin`/`eslint-comments` (Stories 15, 16) | `pnpm lint` (existing; warning during Phase 1) | No |
| `dependency-cruiser` (Story 1) | New `pnpm dep-cruise` script | Yes (Phase 1 non-blocking, then promoted) |
| Semantic architecture runner (Stories 3, 6–12) | Shared CLI/test harness selected in Story 0 | No if integrated in the existing test gate; otherwise a Phase-1 report-only CI job |
| `knip` (Story 13) | New script | Yes (Phase 1 non-blocking) |
| `arethetypeswrong` (Story 14) | New script, scoped to `packages/*` | Yes (Phase 1 non-blocking) |
| Tenant-id detector (Story 17) | New script | Yes, permanently non-blocking for this TD's duration |

---

## Suggested PR Waves

- **Wave 0 — decisions and baseline:** Story 0. This precedes every detector and includes the `@ikaro/types` subpath extraction/migration needed by Story 1.
- **Wave 1 — import and layer barriers:** Story 1, then Story 2. Establish the context matrix and framework-free domain/application boundary before scattered lint rules.
- **Wave 2 — flagship transactional safety:** Story 3. It selects and establishes the semantic runner for the remaining architectural checks.
- **Wave 3 — low-cost lint feedback:** Stories 4, 5, 15, 16. Respect report-only/warning burn-in and the agreed disable policy.
- **Wave 4 — semantic architecture suite:** Stories 6–10, each as a separate small PR with fixtures.
- **Wave 5 — known contract/data-harness gaps:** Stories 11 and 12, then Story 7 if it was not completed in Wave 4.
- **Wave 6 — package hygiene:** Stories 13 and 14.
- **Wave 7 — exploratory:** Story 17 alone, then Story 18 after its compatibility spike.
- **Wave 8 — mature rollout:** Story 19 after all selected blocking detectors have completed report-only burn-in.

---

## Acceptance Criteria (TD-level)

- [ ] Story 0's policy artifacts and package-contract migration completed before dependent stories
- [ ] All Wave 1–6 stories implemented, passing against `main`, and correctly wired per the "Where Each Check Runs" table
- [ ] Every new blocking CI step followed the 3-phase rollout (report-only → blocking → required-check) — no check skips straight to required
- [ ] Story 19 completed before any architecture validation job is added to branch protection as a required check
- [ ] Story 17 shipped and explicitly capped at report-only, with its go/no-go decision documented separately from this TD's closure
- [ ] Retired manual bad-smell-audit checks (BE-1, BE-4, WEB-9 once their mechanical equivalents ship) so the same rule isn't checked twice by two different mechanisms
- [ ] `docs/ANTI_PATTERNS.md` updated to note, per row addressed here, that it's now CI-enforced (not just documented) — so a future reader doesn't re-litigate whether it needs an agent to remember it
- [ ] This TD's own "Out of Scope" table double-checked against `docs/ANTI_PATTERNS.md` one more time before closure, in case a new incident since 2026-07-27 changed the calculus on any row
- [ ] Every static detector has permanent valid/invalid fixtures and a zero-target assertion; every exception is in the reviewed registry with rationale, owner, and review/expiry

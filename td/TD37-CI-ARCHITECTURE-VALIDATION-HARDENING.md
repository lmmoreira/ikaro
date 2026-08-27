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

### Story 0 — Architecture-enforcement foundation and recorded policy decisions 🔴 ✅ Done

No detector may encode an undocumented guess. Before adding a blocking rule, create one shared `architecture-check` runner/CLI that can load the backend, BFF, web, and workspace TypeScript projects. Keep the rules themselves in small independently-tested modules; do not install `ts-morph` only in the backend and then make web/package checks depend on an accidental hoist.

This story records the following policy as versioned, reviewable data rather than scattered glob exceptions:

- **Layer taxonomy:** `domain/**` is framework-free. `application/**` depends on domain, application ports/DTOs, and approved shared framework-neutral modules; it may use Nest's `@nestjs/common` dependency-injection annotations, but no transport, persistence, HTTP, or configuration framework APIs. Infrastructure contains controllers, adapters, repositories, event handlers, and framework wiring. `*.module.ts` is an explicit composition-root exception, not application code.
- **Context dependency matrix:** cross-context imports are deny-by-default. Permitted edges are exact source-path-to-source-path entries for existing `infrastructure/cross-context/**` adapters and event consumers, each with rationale and owner. This replaces the incorrect claim that a context may import only itself and `shared`.
- **Backend `@ikaro/types` policy:** backend may consume only explicit, framework-neutral protocol subpaths: error codes/problem-details, actor-role/JWT protocol, and shared media protocol. Migrate the current allowed backend symbols (`ActorRole`, `ACTOR_ROLES`, `ALLOWED_IMAGE_CONTENT_TYPES`) out of the root barrel into those subpaths before enabling the import rule. Backend production code must not import the root `@ikaro/types` barrel or feature request/response DTO modules.
- **Exception registry:** TypeORM persistence adapters, raw-fetch cases, tenant-exempt entities/tables, dynamic framework exports, and ESLint suppressions are explicit entries with rule, rationale, owner, and review/expiry date. Broad folder exceptions are prohibited.
- **Detector contract:** every detector has permanent positive and negative fixtures, asserts it scanned at least one intended target, and prints file/line plus remediation. A green scan with zero discovered targets is a failure.
- **Tool decision spike:** implement three representative semantic rules (transactional save, error-mapper coverage, and Nest DI aliasing) with the shared runner. Evaluate direct `ts-morph` against `ts-archunit`; retain exactly one. `dependency-cruiser` remains the sole authority for import-graph rules.

**Acceptance criteria**:
- [x] Shared runner is executable locally and in CI for every project it scans
- [x] The taxonomy, dependency matrix, exception registry, and backend package-contract policy are committed as machine-readable configuration next to the checks
- [x] The tool spike records the selected semantic-analysis implementation and why it handles the three representative rules
- [x] Fixture and zero-target conventions are available to every later story

### Story 1 — `dependency-cruiser`: architectural boundaries 🔴 ✅ Done

**New dependency**: `dependency-cruiser` (dev-only).

Add workspace-aware `dependency-cruiser` configuration at the repo root, wire a root `pnpm dep-cruise` script, and add a CI step. Per-workspace entry/project configuration is required; a top-level-only configuration must not silently omit packages.

Rules to encode:
- `apps/backend/src/contexts/<A>/**` must not import `apps/backend/src/contexts/<B>/**` unless the exact edge appears in Story 0's permitted-edge matrix. Existing cross-context adapters and event consumers are therefore permitted intentionally, not by a wildcard.
- `apps/backend/src/contexts/**/domain/**` must not import framework, transport, persistence, or infrastructure modules: `@nestjs/*`, `typeorm`, `axios`, `express`, sibling-context application/infrastructure paths, or local `application/**`/`infrastructure/**` paths.
- `apps/backend/src/contexts/**/application/**` may import only `@nestjs/common` dependency-injection annotations from NestJS; it must not import TypeORM, configuration, HTTP/Express, controllers, repositories/adapters, or another context's internal implementation. It may otherwise import only its domain, application ports/DTOs, and Story 0-approved shared framework-neutral contracts. `*.module.ts` is excluded because it is composition root.
- `apps/bff/src/**` must not import `apps/backend/src/contexts/**` (bad-smell-audit BFF-4).
- `apps/bff/src/shared/**` must not import feature code; BFF shared infrastructure must remain feature-neutral.
- `apps/backend/src/**` must use only the explicit `@ikaro/types` backend protocol subpaths defined in Story 0. Root-barrel and feature DTO imports are forbidden.
- Generic graph safety: no circular production dependencies, no production-to-test imports, no imports of undeclared packages, no production imports of dev dependencies, and no unresolved imports.

**What it catches**: a future PR reintroducing context coupling, a domain file accidentally pulling in a NestJS decorator, a BFF file reaching into backend source instead of going through HTTP.
**What it does NOT catch**: semantic duplication — e.g. two cross-context ports doing the same job (#79) is a design judgment call, not an import-graph shape; stays a code-review/bad-smell-audit item.

**Acceptance criteria**:
- [x] Configuration encodes all rule groups above, the exact permitted-edge matrix, and the backend package-contract subpath policy
- [x] `pnpm dep-cruise` scans all configured workspaces and fails if a workspace/project is omitted
- [x] CI step added (non-blocking first — see Rollout Phases)
- [x] Zero violations on current `main` before promoting to blocking

---

### Story 2 — Ban raw SQL / repository-bypass outside repository adapters 🔴 ✅ Done

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
- [x] Rule added to `apps/backend/eslint.config.js` with precise allowlisted persistence-adapter paths
- [x] Every TypeORM bypass API named above is covered; valid repository adapters and reviewed cross-context persistence adapters are explicitly tested
- [x] Zero unreviewed current violations; no broad `shared/infrastructure/**` exemption
- [x] `docs/AGENT_PATTERNS.md` Pattern #1 referenced in the lint error message

---

### Story 2A — Corrective completion of Stories 0–2 🔴 ✅ Done

Stories 0–2 were marked done without a criterion-by-criterion verification. The audit found that their core direction is sound, but the following completion work remains. This story closes those gaps before Story 3 expands the semantic suite.

1. Complete Story 0's fixture contract: establish reusable semantic-check fixture/zero-target conventions, including an invalid error-mapper fixture.
2. Complete Story 1's `@ikaro/types` protocol-subpath migration: export the approved backend protocol subpaths and migrate backend production code off the root barrel before enforcing the contract.
3. Correct Story 1's dependency-cruiser semantics: make cross-context permissions exact source-to-target edges using explicit `source` and `targetPaths` policy entries; keep each concrete use case self-contained by allowing application imports only to domain code, ports, DTOs, services, and explicitly policy-listed shared abstractions (never another concrete use case); detect BFF imports of backend contexts; and derive/check the project registry against every TypeScript workspace (including `packages/architecture-check`).
4. Produce a clean dependency-cruiser baseline under the repository-pinned Node 22 version, with fixtures proving the repaired boundaries.
5. Complete Story 2's fixture coverage: prove a normal repository adapter and the reviewed booking cross-context adapter are permitted, and cover every restricted TypeORM API in the negative fixture.
6. Perform the Definition-of-Done stale-reference sweep for the invalid previous completion record and the replaced dependency-cruiser/type-contract mechanisms, including their known aliases.

**Acceptance criteria**:
- [x] Stories 0–2 each have criterion-level verification evidence; no prior `✅ Done` label is relied upon as evidence
- [x] Backend protocol subpaths are exported and no backend production root-barrel `@ikaro/types` imports remain
- [x] Dependency-cruiser enforces every Story 1 boundary from explicit source-to-target policy edges against all TypeScript workspaces and passes clean under repository-pinned Node 22
- [x] Semantic and ESLint fixtures cover the missing valid, invalid, and zero-target cases identified above
- [x] Story 2 retains the conventional repository-adapter boundary, has no broad shared-infrastructure exemption, and passes clean
- [x] Stale references to the previous completion record and replaced boundary mechanisms are updated or explicitly retained with a rationale

#### Completion verification — PR #361 (2026-08-12)

| Original story | Original criterion | Verification evidence | Result |
|---|---|---|---|
| Story 0 | Shared runner is executable locally and in CI for every project it scans. | `@ikaro/architecture-check` loads the policy project list; `pnpm architecture-check` runs it locally and CI's Architecture validation job passed on PR #361. | Met |
| Story 0 | Taxonomy, dependency matrix, exception registry, and backend package-contract policy are machine-readable next to the checks. | `packages/architecture-check/architecture-policy.json` contains all four policy sections. | Met |
| Story 0 | Tool spike records the selected semantic-analysis implementation and its suitability for all three representative rules. | `docs/TD37-ARCHITECTURE-CHECK-DECISIONS.md` records the `ts-morph` selection, rejected alternative, and transactional-save, error-mapper, and DI-alias spike detectors. | Met |
| Story 0 | Fixture and zero-target conventions are available to later stories. | `packages/architecture-check/src/architecture-check.spec.ts` provides valid, invalid, and zero-target detector fixtures; its shared fixture helpers are used by the semantic checks. | Met |
| Story 1 | Configuration encodes every required rule group, exact permitted-edge matrix, and backend subpath contract. | `scripts/dependency-cruiser.config.cjs` derives rules from policy `source` → `targetPaths` edges and includes domain, application, BFF, graph-safety, and `@ikaro/types` contract rules. | Met |
| Story 1 | `pnpm dep-cruise` scans all configured workspaces and fails if one is omitted. | The policy and `scripts/dependency-cruiser-projects.cjs` list all 12 TypeScript workspaces, including `packages/architecture-check`; their consistency is tested. | Met |
| Story 1 | CI step is added as non-blocking first. | CI's Dependency graph validation (report-only) job ran and passed on PR #361. | Met |
| Story 1 | Zero violations on the current baseline before promotion to blocking. | PR #361's repository-pinned Node 22 dependency-graph validation passed clean. | Met |
| Story 2 | ESLint rule has precise persistence-adapter allowlisted paths. | `apps/backend/eslint.config.js` builds the additional reviewed path from the exact `raw-persistence-api` policy exception and lists exact repository/database adapter paths. | Met |
| Story 2 | Every named TypeORM bypass API is covered and permitted conventional/reviewed adapters are tested. | `apps/backend/src/eslint/persistence-boundary.eslint.spec.ts` rejects every listed bypass API and proves both adapter categories pass. | Met |
| Story 2 | No unreviewed current violations and no broad `shared/infrastructure/**` exemption. | The ESLint list has no broad shared-infrastructure glob; its negative test proves a newly added repository file is rejected until explicitly allowlisted. | Met |
| Story 2 | Lint error message references `docs/AGENT_PATTERNS.md` Pattern #1. | Each TypeORM restriction message in `apps/backend/eslint.config.js` cites Pattern #1. | Met |

Story 2A follow-through: `@ikaro/types` exports only the approved backend protocol subpaths, the production-backend root-barrel sweep returned zero hits, and the stale TD11 statement now distinguishes forbidden root/feature DTO contracts from approved `protocol/*` imports. PR #361 CI passed ESLint, TypeScript, architecture validation, dependency-graph validation, backend/BFF tests, and the full application suite before merge.

---

### Story 3 — No network I/O inside `txManager.run()` 🔴 ✅ Done

Directly addresses **#28** — the PR #267 incident (DB read before the network call wasn't wrapped in the "never throws" contract; only the network leg was).

**New dependency**: the semantic-analysis implementation selected in Story 0 (also used by Stories 6–12).

**Mechanism**: a backend architecture test/CLI, run by the shared runner selected in Story 0, that:
1. Loads the backend TypeScript project from `apps/backend/tsconfig.json`.
2. Finds every `CallExpression` whose callee is `.run` on an identifier/parameter typed `ITransactionManager`.
3. Walks the transactional callback for calls to registered external-side-effect port methods. The registry follows resolved symbols from application ports to their concrete adapters; it must not rely on an adapter merely living under `infrastructure/cross-context/`.
4. Excludes callbacks explicitly scheduled with `scheduleAfterCommit`, since those execute after the transaction. The check must distinguish lexical nesting from execution timing.
5. Fails with the file:line of the offending call if found.

**External-side-effect registry**: add a machine-readable `externalSideEffectPorts` section to `packages/architecture-check/architecture-policy.json`. Each entry must name the resolved port-declaration file, interface, method, and every concrete production adapter implementation path that realizes it. The detector resolves a call receiver to the registered port method rather than inferring external I/O from a folder name, adapter name, or `fetch()` syntax. Initial entries cover `IFrontendRevalidationPort.revalidate`, `IBookingPlatformPort.revalidatePublicPages`, `ILlmProvider.complete`, notification delivery/send methods, `IStorageService` network methods, and direct `IEventBus.publish`. `IOutboxPublisher.publish` is deliberately excluded: it durably inserts the outbox row in the ambient transaction and schedules its relay with `scheduleAfterCommit`, so its network leg executes only after commit. A new direct external-side-effect port or implementation is incomplete until its registry entry is added in the same change.

**What it catches**: exactly the PR #267 shape — a network-calling adapter method invoked from inside the transactional callback, on either side of the DB write.
Also add the complementary structural rule: every production use-case call to a repository `save()` is lexically enclosed by a callback passed to a parameter typed `ITransactionManager.run()`. Explicitly catalog any legitimate non-use-case exceptions.

**What it does NOT catch**: arbitrary deep interprocedural I/O without a registered port marker. New external-side-effect ports must be registered as part of their implementation; hidden/dynamic I/O stays a review concern.

**Acceptance criteria**:
- [x] Uses Story 0's shared runner and registered external-side-effect port methods
- [x] Transactional-I/O and transactional-`save()` checks are implemented with post-commit scheduling coverage
- [x] Passes clean against current `main`
- [x] Valid, invalid, and `scheduleAfterCommit` fixtures prove the semantic distinction

---

### Story 4 — ESLint `no-restricted-imports`/`no-restricted-syntax` pack (zero new dependency) 🟡 ✅ Done

Bundles the smaller, cheap-to-add rules using the exact mechanism you already use for the `EVENT_BUS`/OTel bans — one PR, several rules, all mirroring existing precedent:

| Rule | Anti-pattern row | Scope |
|---|---|---|
| Ban `RequestContext` import in application layer | ENGINEERING_RULES §RequestContext | `contexts/**/application/**/*.ts` |
| Ban `z.string().uuid()`/`.email()` chained forms | #51 | repo-wide (`no-restricted-syntax`, `CallExpression` selector) |
| Ban raw `fetch(` in `apps/web` outside `bffServerFetch`/`bffPublicFetch`/`bffClient` | bad-smell-audit WEB-8 | `apps/web/**`, with exceptions in a new `rule: "raw-fetch-web"` array under `packages/architecture-check/architecture-policy.json`'s `exceptions` (mirrors Story 2's `raw-persistence-api` pattern) — covering gateway forwarding, signed-URL upload, approved external APIs, and documented cached reads |
| Ban `throw new HttpException` inside `*.use-case.ts` | #54 | `contexts/**/application/**/*.use-case.ts` |
| Ban a string-literal argument as the first arg to `.subscribe(`/`.registerTrigger(` | ENGINEERING_RULES §Event Handlers (already fixed repo-wide once, commit `8a44c21e` / PR #175) | event handler registration sites |
| Ban a string-literal argument to `resolveSupportedLocale(` inside protected-area layouts | #106 | `apps/web/shells/dashboard/model/dashboard-shell-context.ts`, `apps/web/app/[slug]/my-account/**/layout.tsx` |
| Ban `as React.CSSProperties` in function return position | bad-smell-audit WEB-3 | `apps/web/**` |

**Discovery note (TD37-S04, 2026-08-15):** baseline raw-`fetch()` scan found 9 files / ~13 call sites bypassing the transport helpers. `features/platform/api.ts` and `features/platform/hotsite/api/*.ts` already carry the accepted isomorphic/`next.revalidate` rationale (WEB-8's documented exemption). Four have no rationale yet and are not pre-exempted — `features/auth/api.ts`, `features/booking/hooks/useBookings.ts`, `features/staff/public.ts`, `shells/hotsite/components/HotsiteAuthBar.tsx` — each needs case-by-case triage during implementation (migrate to a sanctioned helper where feasible, otherwise add a reviewed `raw-fetch-web` registry entry with real rationale). `features/booking/api/customer.ts` and `features/booking/api/public.ts` already carry inline TD31-Story-7 rationale and just need the matching registry entry.

**What it catches**: each is a rule already proven to have been violated at least once (the locale one caused a full JWT-enrichment fire-drill; the consumer-name one was fixed repo-wide once already).
**What it does NOT catch**: `resolveSupportedLocale(payload.locale ?? 'pt-BR')` — the *correct* pattern — still passes, since the rule only flags a bare literal as the sole argument, not a literal used as a fallback.

**Acceptance criteria**:
- [ ] All 7 rules added across `apps/backend/eslint.config.js` / `apps/web/eslint.config.js`; raw-fetch exceptions are explicit registry entries because ESLint cannot prove an inline rationale
- [ ] Zero current violations on `main`
- [ ] The CSS assertion selector is limited to type assertions returned from a function, not arbitrary prop assertions in tests
- [ ] Each rule's error message cites the rule title/source it enforces (not a brittle anti-pattern row number)

---

### Story 5 — ESLint core rules already mandatory in `docs/CODE_STANDARDS.md`, currently off ✅ Done

Zero new dependencies — these ship inside ESLint itself:

- `max-lines-per-function` — `.ts` files: `max: 40`. `.tsx` files: `max: 200` — ESLint counts JSX markup as function body, so a component's render function isn't the same complexity signal as equivalent-length imperative logic (discovery baseline, 2026-08-17: web `.ts` violators had p90 47/max 85, closely matching backend/BFF's p90 60/max 113 — a shared `.ts` threshold of 40 is consistent across all three apps; `.tsx` violators were a structurally different distribution, median 49/p90 160/max 792). `skipBlankLines: true`, `skipComments: true`. Exempt `**/*.spec.ts`, `**/*.integration.spec.ts` (test bodies are naturally longer due to setup/assertions — the rule's intent targets production logic), backend migrations (`src/contexts/**/infrastructure/migrations/**`, `src/shared/infrastructure/migrations/**`) and `src/shared/database/seed.ts` (DDL/seed data, not application logic — same rationale as their existing `PERSISTENCE_BYPASS_IGNORES` exemption in `apps/backend/eslint.config.js`), backend/BFF test infrastructure (`src/test/**`), and web Playwright helpers (`apps/web/e2e/helpers/**` — reusable flow helpers, not app production code, per CLAUDE.md §7 Testing).
- `max-lines` — file length, `max: 250` (raised from an initial `200` during implementation — see Implementation note below), same `skipBlankLines`/`skipComments` options and the same exemption list as above. Resolves the prior "classes ≤ 200 lines" framing in `docs/CODE_STANDARDS.md`: ESLint's `max-lines` measures files, not classes, and this codebase is predominantly one-class/one-use-case-per-file already, so file length is the enforced proxy going forward — no separate ts-morph class-length check.
- `default-param-last` — CODE_STANDARDS.md's default-parameter rule (currently only SonarCloud-gated; this gives the same feedback at `pnpm lint` time instead of waiting for the Sonar CI stage). Zero baseline violations repo-wide across backend/BFF/web (confirmed 2026-08-17) — ships as `error` immediately, no exceptions needed.

**Discovery note (TD37-S05, 2026-08-17):** with the thresholds/exemptions above, the baseline is **not** near-zero the way Story 4's was (~13 call sites) — real counts required renegotiating this story's scope mid-discovery. Per repo policy (no workarounds when a root-cause fix is available; CLAUDE.md §7 "No workarounds"), every genuine production violation found is fixed within this story or its explicit follow-up (Story 5A), never grandfathered into the exceptions registry — `packages/architecture-check/architecture-policy.json`'s exceptions list currently has 12 entries, each individually reasoned, and is not the right mechanism for bulk lint debt.

Baseline breakdown (production code only, exemptions above already excluded):
- **~37 `.ts` files, 41-99 lines over the 40-line function cap** — use-cases (`request-booking.use-case.ts`, `complete-booking.use-case.ts`, several notification send-*-notification use cases, `send-chat-message.use-case.ts`, etc.), jobs (`booking-reminder.job.ts`, `expire-points.job.ts`, `notify-expiring-points.job.ts`), a repository adapter (`typeorm-booking.repository.ts`), a BFF guard (`active-staff.guard.ts`), a BFF service (`auth-controller-flow.service.ts`), mappers, and a handful of web hooks/utils. Mechanical helper-extraction, low regression risk — **fixed within this story**.
- **~21 additional files that only violate `max-lines` (file length), not `max-lines-per-function`** — every individual function is already compliant; the file is just organizationally large (e.g. `booking.controller.ts` 338 lines of thin endpoint handlers, `hotsite-config.aggregate.ts` 433 lines, `booking-domain.error.ts`/`platform-domain.error.ts` with many small error subclasses, `gcp-pubsub-event-bus.adapter.ts` 270, BFF's `bookings.controller.ts` 382, and ~15 web components/shells including `Topbar.tsx` and `ContactModule.tsx`). Restructuring into cohesive sub-modules/sub-files rather than shortening any single function — **fixed within this story** (folded in rather than deferred, per explicit decision during discovery).
- **13 `.tsx` page/form components that violate *both* rules at 205-1242 lines** — carry materially higher UI-regression risk than the above (live, high-traffic booking/settings screens) and are split out to **Story 5A** instead of bundled into this lint-config PR.

If the combined ~58-file production fix proves too large for a single reviewable PR at implementation time, split it into sequential PRs by bounded context (booking / platform / loyalty / shared, then BFF, then web) — still within this story's scope, not a reason to fall back to exceptions.

**Implementation note (TD37-S05, 2026-08-17):** two narrow deviations from the discovery-time plan, both explicit user decisions made during implementation, not silent scope drift:
1. **`max-lines` raised from 200 to 250** (`docs/CODE_STANDARDS.md`, all 3 apps' `eslint.config.js`) — a blanket, repo-wide change rather than a per-file exception, since the one file it was meant to help (`gcp-pubsub-event-bus.adapter.ts`, 224 counted lines after extracting everything safely extractable — topic/subscription provisioning, DLQ publish, pending-subscription types, subscription-attach wiring — into sibling files) clears 250 outright, with no exception needed. The remaining length there is concentrated in `dispatch()`/`dispatchTrigger()`/`dispatchPushMessage()` — the exact code behind 3 documented prior production incidents (M17-S34 and follow-ups) from subtle asymmetry between these branches; the file's own comments already document a deliberate choice to keep this logic unabstracted and visible side-by-side, in direct tension with slicing it across files, so the threshold bump avoided touching it at all. Applies uniformly; does not retroactively weaken anything already fixed under 200.
2. **One `max-lines`-only exception added** to `packages/architecture-check/architecture-policy.json` (`max-lines-aggregate` rule, 1 entry) — `booking.aggregate.ts` (641 lines) is a DDD aggregate whose file length is inherent to owning many small cohesive methods, not a complexity smell a file split would fix; it is far over even the raised 250-line threshold even after extracting every type/mapper that could safely move out, so the exception (not the threshold change) is what resolves it. Exempts `max-lines` only; `max-lines-per-function` is enforced and fixed on it. A second exception was briefly added for `hotsite-config.aggregate.ts` (433 lines) by copying `booking.aggregate.ts`'s rationale, but that file's length turned out to be from types and mapper functions genuinely extractable without hurting cohesion (see `hotsite-config.types.ts`/`hotsite-config.mapper.ts`) — extracting them dropped the file to 210 counted lines, clearing the cap outright, so the exception was removed rather than kept. This does not reopen the "no bulk exceptions" finding from discovery — one individually-reasoned, dated (`reviewBy: 2026-11-30`) entry is exactly the registry's intended shape, distinct from the ~900-file blanket grandfather that was rejected.

**Acceptance criteria**:
- [x] All 3 rules added to `packages/config/eslint-base.js` / each app's `eslint.config.js` with the thresholds and exemptions above (separate `.ts`/`.tsx` blocks for `max-lines-per-function`)
- [x] `docs/CODE_STANDARDS.md` updated: "Functions ≤ 20 lines, classes ≤ 200 lines" → the `.ts`/`.tsx` split + "files ≤ 250 lines" framing (raised from 200 during implementation, see note above)
- [x] All ~37 `.ts` function-length violations and ~21 file-length-only violations fixed — zero violations on `main` for all 3 rules once Story 5A also lands (1 reviewed, dated `max-lines-aggregate` exception added during implementation — see Implementation note)
- [x] Each rule's error message cites the rule title/source it enforces (all 3 are native ESLint core rules — `max-lines-per-function`/`max-lines`/`default-param-last` — the rule ID itself is the citation, shown directly in lint output; no custom message needed the way the `no-restricted-*` selectors in Story 4 did)
- [x] Story 5A opened/sequenced immediately after, for the 13 `.tsx` decompositions (already documented directly below in this same plan file — implementation is its own separate story)

---

### Story 5A — Decompose the 13 oversized `.tsx` components flagged by Story 5 ✅ Done

Follow-up to Story 5: once `max-lines-per-function` (`.tsx: 200`) and `max-lines` (`250`) are enforced, these 13 components still violate one or both — same "no workarounds" rationale as Story 5's fixes, split into its own story because UI decomposition on live booking/settings/hotsite screens carries materially higher regression risk than Story 5's mechanical `.ts` extractions and file restructuring, and deserves focused review on its own.

Baseline (discovery, 2026-08-17 — re-verify at implementation time since `main` may have moved; `max-lines-per-function` violation shown first, `max-lines` file-length in parentheses):

| File | Longest function | File length |
|---|---|---|
| `apps/web/features/booking/components/dashboard/schedule/SchedulePage.tsx` | 792 | 1242 |
| `apps/web/features/platform/components/settings/SettingsForm.tsx` | 579 | 1003 |
| `apps/web/features/booking/components/dashboard/bookings/BookingDetailPage.tsx` | 515 | 666 |
| `apps/web/features/booking/components/dashboard/bookings/MarkCompleteBookingPage.tsx` | 437 | 460 |
| `apps/web/features/platform/components/hotsite/HotsiteEditor.tsx` | 380 | 482 |
| `apps/web/features/booking/components/dashboard/bookings/RescheduleBookingPage.tsx` | 278 | 319 |
| `apps/web/features/booking/components/public/BookingForm.tsx` | 258 | 366 |
| `apps/web/features/booking/components/public/SubmitInfoForm.tsx` | 254 | 320 |
| `apps/web/features/booking/components/dashboard/services/ServiceFormFields.tsx` | 239 | 261 |
| `apps/web/features/booking/components/public/PersonalInfoStep.tsx` | 216 | 267 |
| `apps/web/features/platform/components/hotsite/BrandingTab.tsx` | 214 | 245 |
| `apps/web/features/platform/components/hotsite/modules/HeroConfigPanel.tsx` | 208 | 226 |
| `apps/web/features/platform/components/hotsite/modules/BookingPhotoPicker.tsx` | 205 | 230 |

**Acceptance criteria**:
- [x] Each file decomposed into subcomponents under the `.tsx` `max-lines-per-function` (200) and `max-lines` (250) thresholds — extract cohesive sections (form field groups, panel sections, list rows), not an arbitrary mechanical split
- [x] No behavior change — existing `.spec.tsx` coverage for each page continues to pass, beyond import-path updates for extracted subcomponents
- [x] Every extracted subcomponent that contains meaningful logic/branching ships its own `.spec.tsx` per CLAUDE.md §7 Testing; a pure presentational split of existing JSX can share the parent's existing test coverage
- [x] Zero `max-lines-per-function`/`max-lines` violations remain in `apps/web` after this story

**Implementation note (2026-08-18):** `DEFERRED_TO_TD37_S5A` removed entirely from `apps/web/eslint.config.js` (was already empty once all 13 files were decomposed — no replacement suppression mechanism added). One genuine bug found and fixed during extraction: `HotsiteEditor.tsx` had an infinite render loop from inline arrow functions passed into a `useEffect` dependency array inside the new `useHotsiteEditorTopbarOverride` hook, fixed via `useCallback` at the call site — see `docs/ENGINEERING_RULES.md` if a similar pattern recurs. PR: #388.

---

### Story 6 — `ts-morph` suite, part 1: error-handling completeness 🔴 ✅ Done

Builds on Story 3's harness.

- **`mapXxxError` completeness**: enumerate every class extending a context domain-error root. Each class must be covered either by a specific `instanceof` branch or by an intentional base-class branch with its documented default status. Generic branches are valid and must not force redundant subclasses branches.
- **`Object.setPrototypeOf` check**: resolved direct subclasses of `Error` that declare their own constructor must call `Object.setPrototypeOf(this, new.target.prototype)`. Descendants that inherit that constructor are already correct and must not be flagged.
- **VO `create()` never throws bare `Error`**: scan value objects by base type/interface and `**/value-objects/**`, not only `*.vo.ts`; this includes shared `Address` and `Money`. Flag only actual static `create()` bodies that throw a bare `Error`.
- **Shared VO error mapping:** where a shared VO owns typed validation errors, verify its consuming HTTP error mappers intentionally map those errors rather than returning an accidental generic 500.

**What it catches**: a new error class added without wiring its mapper branch (falls through to a generic 500 with no test failure today); a copy-pasted error class missing the prototype fix (breaks `instanceof` silently).
**What it does NOT catch**: whether the *chosen* HTTP status code is semantically correct for the error — that's still a design/review call.

**Acceptance criteria**:
- [x] All four checks implemented and passing against current `main`
- [x] Failure messages name the exact class and expected mapper file

---

### Story 7 — `ts-morph` suite, part 2: test-hygiene completeness 🟡 ✅ Done

- **Entity/event/command builder coverage**: derive production entities from resolved TypeORM entity decorators, including shared inbox/outbox entities, then assert a matching builder exists. Same for `DomainEvent`/`Command` classes constructed inline in 2+ spec files.
- **`EntityBuilder` primary-key defaults to `uuidv7()`**: inspect every resolved TypeORM primary-key property and its builder field initializer/default. Do not assume the field is named `id` or that its default is in the constructor; valid names include `lineId`, `entryId`, and `eventId`.
- **Migration/entity test registration**: make `integration-global-setup.ts`, `test-datasource.ts`, and intentionally partial context helpers an explicit registration map. Compare each source against the set it is responsible for; do not require every helper to contain every entity.

**What it catches**: a new entity/migration shipped without its test-harness registration — currently "causes silent failures — unit tests pass but integration tests error on the first DB query," per your own docs, with no test pointing at *why*.
**What it does NOT catch**: whether the builder's other fields are sensible defaults — only its existence, primary-key default, and registration.

**Acceptance criteria**:
- [x] All 3 checks cover resolved production entities, including shared entities and non-`id` primary keys
- [x] The registration-map source of truth makes intentional helper subsets explicit
- [x] BE-4's existing manual bad-smell-audit check can be retired once this ships (avoid running the same check twice, once mechanically and once via LLM prompt)

---

### Story 7A — `ts-morph`: ban `jest.fn()` for repository/port-typed mocks 🟡 ✅ Done

`.coderabbit.yaml` already documents this as mandatory repo policy ("InMemory doubles over `jest.fn()` for repositories and ports"), and `docs/ANTI_PATTERNS.md` already flags the `IEventBus`/`ITransactionManager` instance of it by name. Currently enforced only by an AI reviewer remembering the rule on each PR — exactly the class of gap this whole TD exists to close. Not a plain-ESLint candidate (Story 4/5's bucket): "is this `jest.fn()` standing in for a repository/port" depends on the mocked target's resolved *type*, which a syntax-only AST selector can't see — it belongs in the type-aware `ts-morph` suite alongside Stories 6–10.

**Mechanism**: extend the Story 0 `ts-morph` runner to resolve every `jest.fn()`/`jest.mock()`-style stub assigned to a constructor argument, parameter, or variable whose declared or inferred type is (or implements) an interface named `I*Repository` or `I*Port`, or resolved from `**/ports/**`. Flag each one with the file:line and the interface name it's standing in for.

**What it catches**: a test using `jest.fn()` to fake an entire repository/port instead of the project's own `InMemoryXxxRepository`/`InMemoryXxxPort` double — losing state assertions and producing brittle mock-expectation-based tests. `docs/ANTI_PATTERNS.md`'s existing `IEventBus`/`ITransactionManager` row is one instance of this; this generalizes the check to every repository/port interface.
**What it does NOT catch**: `jest.fn()` used for a plain callback (e.g. a handler typed `() => void`), a single ad-hoc method spy on a non-port class, or any dependency that isn't a repository/port — those stay legitimate and unflagged.

**Before this can go blocking** (found while implementing Story 4, TD37-S04, 2026-08-15):
1. Fix the existing precedent violation: `apps/backend/src/contexts/platform/infrastructure/repositories/caching-tenant.repository.spec.ts` uses `jest.fn()` for what should be an `InMemoryCachePort` double.
2. Build the missing `InMemoryCachePort` test double (none exists yet in `src/test/infrastructure/`) — same shape as `InMemoryEventBus`/`InMemoryTransactionManager` — including configurable failure injection for that spec's error-path tests.
3. Full-codebase baseline scan for every other `jest.fn()`-as-repository/port instance; each fixed or added to Story 0's exception registry with rationale/owner/expiry before promotion.

**Acceptance criteria**:
- [ ] Detector resolves the mocked target's type via the Story 0 `ts-morph` runner and flags `jest.fn()`/`jest.mock()` assigned to a repository/port-typed constructor argument, parameter, or variable
- [ ] Permanent valid/invalid/zero-target fixtures cover: a real port mock (invalid), a plain callback mock (valid/ignored), and a single-method spy on a non-port class (valid/ignored)
- [ ] `InMemoryCachePort` double built and `caching-tenant.repository.spec.ts` migrated onto it before this detector is promoted to blocking
- [ ] Full-codebase baseline reviewed with zero unreviewed violations before promotion (Rollout Phases)
- [ ] Ships report-only first per the standard 3-phase rollout; `docs/ANTI_PATTERNS.md`'s `IEventBus`/`ITransactionManager` row is updated to note it's now CI-enforced by this generalized check

---

### Story 8 — `ts-morph` suite, part 3: DI/module wiring 🔴 ✅ Done

- **`@Global()` module ↔ `exports` pairing**: resolve injections and module exports. A global module must export its externally consumed tokens, but it may retain internal providers; do not require every provider to be exported.
- **Unsafe class `useExisting` detector**: flag a provider array where a class appears both as a bare entry (or explicit `{ provide: SomeClass, useClass: SomeClass }`) and as a `useExisting` target. Permit safe token-to-token aliases such as `TRIGGER_BUS -> EVENT_BUS`.
- **Reverse alias detector:** flag the corresponding class-token-to-functional-token alias shape documented in the anti-patterns, using the same resolved-provider model.

**What it catches**: exactly the TD24-S02 incident (`OutboxModule` marked `@Global()` without the export line, DI resolution failing with the error pointing at the *consumer*, not the real cause) and the exact storage/outbox `useExisting` bug, both already proven to recur.
**What it does NOT catch**: a class that's `useClass`-registered correctly but still has a code smell elsewhere in its DI wiring — this only catches the specific alias-vs-registration shape.

**Acceptance criteria**:
- [ ] All three checks pass against `main`
- [ ] Permanent fixtures cover a missing external global export, unsafe class alias, safe token alias, and reverse alias; do not rely on a temporary local regression

---

### Story 9 — `ts-morph`: aggregate props typed as primitive when a VO exists (bad-smell-audit BE-1) 🟡 ✅ Done

Use a closed, reviewed registry mapping each aggregate's persisted private property to its required VO. Resolve stored aggregate properties and declared VO mappings; do not infer from broad field-name fragments such as `color`. The registry must include existing concepts such as `contactEmail`, `contactPhone`, Address, and Money while allowing intentional public transport strings.

**Discovery note (TD37-S09, 2026-08-21):** live-codebase audit (`apps/backend/src/contexts/**/domain/*.aggregate.ts` plus the two sibling `*.types.ts` Props files — `booking.types.ts`, `hotsite-config.types.ts`, which the manual BE-1 check's own stated scope of "Props interfaces inside `*/domain/*.aggregate.ts` files" would literally have missed) found **zero** violations in any aggregate's direct `Props` interface — every field matching a known VO concept is already correctly typed. This story ships purely structural: no cleanup phase, unlike Story 5/5A. Registry design is a closed mix, not one uniform mechanism: camelCase suffix rules (`*Email` → `Email`, `*Phone`/`*PhoneNumber` → `PhoneNumber`, `*Address` → `Address`, `*Slug` → `Slug`, `*Color` → `HexColor`) confirmed collision-free against the current codebase, plus enumerated exact-name entries for `Money` (`price`, `totalPrice`, `totalActualPrice`, `discountAmount`) and `TimeOfDay`/`Timezone` (`startTime`, `endTime`, `timezone`) — a suffix rule for these two risks false positives (e.g. a hypothetical `*Time` field that's a timestamp, not an HH:MM value), so they stay literal per this story's own "do not infer from broad field-name fragments" instruction. **Explicitly out of scope**: `TenantSettingsData`/`BusinessHours` (nested inside `TenantProps.settings: TenantSettings`) — confirmed **not** a BE-1 violation: `businessInfo.email`/`.phone`, `notification.fromEmail`, `businessHours.timezone`, and each day's `open`/`close` are already validated via `Email.isValid()`/`PhoneNumber.isValid()`/`Timezone.isValid()`/`TimeOfDay.isValid()` inside dedicated `Validator` classes (`BusinessInfoValidator`, `NotificationSettingsValidator`, `BusinessHoursValidator`), called from `TenantSettings.create()`. Storing VO *instances* there is also structurally unsafe, not just undesirable: `TenantSettings` relies on `structuredClone(this.props)` for its getters and `toJSON()`, and `structuredClone()` strips a custom class's prototype (confirmed against `ValueObject`'s base implementation) — a nested `Email` instance would silently lose its `.address` getter after the first clone. The one real gap found — `TenantSettings.create()` validates `Email` via `.isValid()` but never normalizes via `.create()`, so `businessInfo.email`/`notification.fromEmail` can store un-normalized (mixed-case/whitespace) values — is a separate, tiny standalone fix (call `Email.create(value).address` at the normalization step, mirroring the existing `normalizeBusinessAddress`/`normalizeLocalization` pattern), tracked outside this story, not blocking it. The generalized version of that gap — a primitive field matching a VO concept that's validated but never guaranteed-normalized at its owning class's construction boundary — is scoped as Story 20 below.

**What it catches**: a new aggregate field added with a plain primitive where the project already has a VO for that exact concept.
**What it does NOT catch**: a genuinely new field type with no existing VO — that's a real design decision (build a new VO or not), not a lint violation.

**Acceptance criteria**:
- [ ] Registry and check pass against `main`, with allowed primitive transport fields covered by fixtures
- [ ] Bad-smell-audit's manual BE-1 check retired once this ships

---

### Story 10 — `ts-morph`: naming-convention checks 🟡 ✅ Done

- Use case result type is named `{UseCaseClassName}Result`, never `*Info`/`*Dto`/raw `T[]`; first migrate the current baseline violations and state their scope.
- Distinguish application `UseCaseNameInput` types from HTTP `{Action}Dto` schemas; do not conflate the two documented contracts.
- BFF response interfaces and type aliases live in `<module>.types.ts`; request Zod schemas and their inferred `Body`/`Query` types live in `<module>.schemas.ts` — neither may be declared inline in a `*.controller.ts`, with documented shared response/DTO exceptions. Baseline migration: extract the 12 controllers that still declare schemas inline into a sibling `<module>.schemas.ts` (mirror `booking/bookings.schemas.ts`'s existing split, including its re-export-from-controller convention so `.spec.ts` files that import these symbols from the controller don't need to change): `booking/services.controller.ts`, `booking/schedule.controller.ts`, `booking/schedule-opening.controller.ts`, `booking/schedule-availability.controller.ts`, `booking/schedule-availability-summary.controller.ts`, `customer/customers.controller.ts`, `loyalty/loyalty.controller.ts`, `staff/staff.controller.ts`, `platform/platform.public.controller.ts`, `platform/tenant.controller.ts`, `platform/tenant-settings.controller.ts`, `platform/hotsite-admin.controller.ts`.

**What it catches**: naming drift that makes types unpredictable to find/import — a real, if low-severity, recurring pattern per the doc's own examples.
**What it does NOT catch**: whether the *shape* of the DTO is correct — purely a naming check.

**Acceptance criteria**:
- [ ] All 3 checks pass against `main` after the identified baseline migration
- [ ] All 12 baseline BFF controllers have their inline Zod schemas/inferred types extracted to `<module>.schemas.ts`, following `bookings.schemas.ts`'s pattern
- [ ] Positive/negative fixtures distinguish application input, transport DTO, results, BFF type aliases, and documented exceptions

---

### Story 11 — `ts-morph`: `@ikaro/types` drift detector, full-codebase (WEB-9) 🔴 ✅ Done

This is the one your own docs already flag as a **known, currently-unfixed gap**: `scripts/pre-pr.sh`'s version of this check is diff-scoped (only files changed in the current PR), which is "exactly how `LoyaltyEntryItem`/`LoyaltyRedemptionItem` drifted undetected" (TD31, items 2.1/2.2) — nobody had touched those files in the PR that would have caught it. `bad-smell-audit`'s `WEB-9` covers the full codebase today, but only when an LLM agent is explicitly asked to run it — not on every PR.

**Mechanism**: scan all web transport-boundary modules: `features/**/api/**`, root `features/**/api.ts`/`api.server.ts`, and shared API/type modules. If `@ikaro/types` exports a same-named type, use the selected type checker to compare both directions (including nullability and JSON transport compatibility). An identical duplicate name is also a finding unless it is in a documented exception; differently named semantic duplicates remain review territory.

**Story-discovery addition (2026-08-22):** three design decisions locked in, since the TD text above leaves each ambiguous enough to become an implementation-time guess otherwise:
- **Scan surface = the `@ikaro/types` root-barrel import surface only** — resolve it via `packages/types/src/index.ts`'s `getExportedDeclarations()` (what `import { X } from '@ikaro/types'` actually resolves to), not every exported interface/type across `packages/types/src/**`. `media.ts` and `protocol/*` are deliberately out of scope: neither is re-exported from `index.ts` today, so a web file can't actually collide with them via a plain `@ikaro/types` import.
- **Detector shape is new to this package**: every existing `packages/architecture-check/src/detectors/*.ts` check takes one `ts-morph` `Project`. This one needs two (`web`, already loaded via `apps/web/tsconfig.json`; and `packages/types`, already loaded via `packages/types/tsconfig.json` — both already registered in `architecture-policy.json`'s `projects` list). Cross-project `Type.isAssignableTo` doesn't work across two independent `ts-morph` Programs, so the algorithm is: independently extract a normalized `{propertyName → baseTypeText, optional, nullable}` signature per matching declaration in each project, then diff the two signatures (not a live structural-assignability check).
- **Comparison algorithm**: a field present on one side and missing on the other → drift finding (mirrors `bad-smell-audit` `WEB-9`'s own `id`-vs-`entryId` example). Same field, different base type text (with `null`/`undefined` stripped before the text compare) → drift finding. Same field where one side allows `null`/`undefined` and the other doesn't → **also** a drift finding, same severity as a type-text mismatch (a value that can genuinely be absent over JSON but is typed non-nullable on one side is a real runtime risk, not a cosmetic variance to wave through). Identical on every field → flagged as an avoidable duplicate ("should import from `@ikaro/types` instead"), not as drift.
- New exception-registry rule id for `architecture-policy.json`'s `exceptions` array: `ikaro-types-drift`, using the same `{rule, path, name, rationale, owner, reviewBy}` shape as the existing `bff-controller-inline-type` entries.

**What it catches**: exactly the `LoyaltyEntryItem`/`LoyaltyRedemptionItem` class of drift, on every PR, regardless of which files that PR touches.
**What it does NOT catch**: which side is *correct* when they differ (per TD09, sometimes `@ikaro/types` is the stale one) — the check only flags the mismatch; a human still decides the fix direction.

**Acceptance criteria**:
- [x] Shared runner scans web and workspace types without relying on backend-only dependencies
- [x] Full-codebase (not diff-scoped) check passes against `main` with zero unreviewed duplicate/mismatch findings
- [x] `scripts/pre-pr.sh`'s existing diff-scoped `WEB-7`/`WEB-9`-adjacent checks can stay as a fast local pre-check, but this becomes the authoritative full-codebase gate
- [x] `bad-smell-audit.md`'s `WEB-9` entry and CLAUDE.md's anti-pattern table `WEB-9` row are updated to note the check is now CI-enforced by this detector (mirroring Story 7A's `IEventBus`/`ITransactionManager` precedent), so a future `bad-smell-audit` run doesn't manually redo what's now mechanically enforced on every PR

---

### Story 12 — Generalize i18n key-parity checks beyond `errors.json` 🟡 ✅ Done

`apps/web/shared/lib/i18n/error-codes-exhaustiveness.spec.ts` already proves this exact test pattern works and is already CI-enforced — it's the strongest existing precedent for this whole TD. `notifications.json` and `web.json` have the identical mandatory rule ("always add the key to both locales in the same commit") with **no equivalent spec**.

**Mechanism**: retain the existing error-code-catalogue exhaustiveness assertions, then add a small reusable helper that checks recursive locale-key parity in both directions. Apply it to `errors.json`, `notifications.json`, `web.json`, and `email-tables.json`, which is loaded by backend localization too. Lives in `apps/web/shared/lib/i18n/` alongside the existing precedent (new `locale-key-parity.ts` helper + `locale-key-parity.spec.ts` unit tests + `locale-family-key-parity.spec.ts` applying it to all four families) — already runs inside the required `pnpm --filter @ikaro/web test:cov` CI job, no new CI step needed. `error-codes-exhaustiveness.spec.ts` itself stays untouched.

**Story-discovery addition (2026-08-22):** also close the analogous catalog-vs-locale gap on the backend side — `NOTIFICATION_TEMPLATE_KEY_MAPPING` (`notification/domain/notification-template-key.mapping.ts`) has no check that every `{eventName, recipientType}` entry has a matching `notifications.json` key in both locales (the same class of gap `errors.json`'s catalog check already closes for error codes), nor the reverse (an orphaned JSON entry with no mapping). This must live in the backend, extending the existing `notification-template-key.mapping.spec.ts` — not in `apps/web`, since the mapping is backend-only domain data and `apps/web` must never import `apps/backend/src/**` (mirrors the BFF→backend import ban already enforced by TD37 Story 1's `dependency-cruiser` config). Read the locale JSON files the way `docs/ENGINEERING_RULES.md`'s "Static locale/config files in workspace packages" section documents (`require.resolve('@ikaro/i18n/package.json')` + `readFileSync`), independently of the web-side helper.

**Acceptance criteria**:
- [ ] Existing error-code-catalogue coverage is preserved
- [ ] Shared helper is applied to all four locale JSON families
- [ ] Zero current violations
- [ ] `notification-template-key.mapping.spec.ts` (backend) asserts every `NOTIFICATION_TEMPLATE_KEY_MAPPING` entry has a corresponding `notifications.json` key (`{eventName}.{recipientType}.subject`/`.body`) in both `pt-BR` and `en`, and that every `notifications.json` entry maps back to a mapping entry (no orphans)

---

### Story 13 — `knip`: unused dependencies + dead exports 🟡 ✅ Done

**New dependency**: `knip` (dev-only). Replaces the manual grep sweep that already found 3 real cases once (#78 — `express`, `jsonwebtoken`, `ms`) and covers `ts-prune`'s dead-export use case in the same tool, chosen specifically because it's the actively-maintained option built for pnpm workspaces (unlike `depcheck`, which has slower maintenance and known monorepo false-positive issues).

**Story-discovery addition (2026-08-22):** five design decisions locked in, since the TD text above leaves each ambiguous enough to become an implementation-time guess otherwise:
- **Two knip invocations, not one.** Default mode (`knip`) finds fully-unused deps + dead exports. A second run, `knip --production --strict`, is what actually replicates this story's own cited precedent (#79 in `docs/ANTI_PATTERNS.md` — `express`/`jsonwebtoken`/`ms` used in production `src/` but declared only under `devDependencies`): `--production` restricts entry resolution to files marked with a `!` suffix per plugin/production markers, and `--strict` restricts "declared dependencies" to `dependencies` only when checking unused/unlisted — so a prod-imported package sitting only in `devDependencies` shows up as unlisted. Every workspace's production entry patterns (backend/bff: `src/main.ts`; web: the Next.js plugin's own production entries) need the `!` suffix for this to actually work — without it the `--production` run silently degrades back to default-mode coverage.
- **Allowlist lives in `packages/architecture-check/architecture-policy.json`'s existing `exceptions` array**, not native `knip.jsonc` comments — new rule ids `knip-unused-dependency` / `knip-unused-export` / `knip-unused-file`, same `{rule, path, name, rationale, owner, reviewBy}` shape as Story 11's `ikaro-types-drift` precedent. Config lives in `knip.config.ts` at repo root (knip supports a JS/TS config file, not just JSON), which reads `architecture-policy.json` and translates matching exceptions into knip's native `ignore`/`ignoreDependencies`/`ignoreExportsUsedInFile` per workspace — mirrors `scripts/dep-cruise.cjs`'s existing pattern of reading `policy.projects`. Keeps one canonical exception registry repo-wide instead of a second, parallel one.
- **Workspaces configured explicitly**: all 3 apps (`@ikaro/backend`, `@ikaro/bff`, `@ikaro/web`) + all 10 `packages/*` (including `@ikaro/config`, which `scripts/dependency-cruiser-projects.cjs` excludes because it has no `tsconfig.json`/`src` — dependency-cruiser only registers TS-project workspaces — but knip's unit is the pnpm workspace, and `@ikaro/config` is a real one with its own `package.json`/`devDependencies` and plain-JS config files (`eslint-base.js`, `prettier.config.js`) to scan), each with its own `entry`/`project` patterns (no reliance on knip's top-level monorepo defaults, per the existing AC) — plus a root-level entry (`scripts/**/*.cjs`) so the root `package.json`'s own `devDependencies` (`dependency-cruiser`, `ts-morph`, `wait-on`, etc.) are actually checked against real usage instead of all reporting as unused, since these scripts sit outside every declared pnpm workspace. Plugins enabled explicitly per workspace — Next.js (web), Nest (backend, bff), pnpm (root) — not left to auto-detection. Backend's CLI-invoked, never-imported entry points (`src/shared/database/data-source.ts`, `src/shared/database/seed.ts`, and `src/migrations/**`) need explicit `entry` globs or knip will false-flag them as dead code.
- **CI wiring mirrors Story 1's `dependency-cruise` job** (`.github/workflows/pr-quality.yml`): new root scripts `pnpm knip` (default mode) and `pnpm knip:production` (the `--production --strict` run), both invoked with `continue-on-error: true` in a new job. "Artifact/PR annotation" (AC) = knip's report written to `$GITHUB_STEP_SUMMARY` (existing repo convention — see `deploy-production.yml`/`foundation-deploy.yml`) plus the full JSON report uploaded via the already-pinned `actions/upload-artifact` — no new third-party reporting action needed.
- **Detector-contract regression test**: `scripts/knip-config.spec.cjs` (node:test), mirroring `scripts/dependency-cruiser-config.spec.cjs` — asserts the configured workspace list matches the real pnpm workspace list (+ the root scripts entry), and that every configured `entry`/`project` path actually exists. This is the third-party-tool equivalent of Story 0's "detector asserts it scanned at least one intended target" contract.

**Implementation note (2026-08-22):** three corrections found only by actually running `knip` against this codebase (not derivable from docs alone) — confirms the "verify empirically" discipline this repo already documents elsewhere:
- **`knip --production --strict` needed `-W apps/backend -W apps/bff -W apps/web`, scoping it to only the 3 real deployed services.** Marking a `packages/*` library's own entry (`src/index.ts`) with `!` — or, worse, leaving it unmarked — either had no effect or (when *no* workspace had any `!`-marked entry) collapsed that workspace's entire reachable production graph to nothing, false-flagging every real dependency (`typeorm`, `zod`, `pg`, ...) as unused. Library packages have no dev/production split of their own; the #79 anti-pattern this run targets (prod code importing a devDependency-only package) is specific to the 3 deployed apps.
- **`apps/web`'s `e2e/**` and `packages/config`'s `eslint-base.js`/`prettier.config.js` must NOT be `!`-marked** — verified empirically that doing so pulled `@playwright/test` and `@typescript-eslint/*`/`eslint-plugin-prettier` (all correctly-declared devDependencies) into the strict production check as false "unlisted dependency" findings, since neither is real production code.
- **Backend's `src/shared/database/seed.ts` needs no explicit entry** (knip's npm-scripts plugin already resolves it from the `seed` script) but **`src/main.ts!`/`src/tracing.ts!` DO, despite knip's own `--debug` hint calling them "redundant."** That hint is about default mode (where the `dev` script already covers them); in `--production` mode only the `start` script counts, and `start` points at built `dist/main.js` — never built in a fresh checkout, so it can't resolve back to source. The real migration entry globs are `src/contexts/**/infrastructure/migrations/*.ts!` + `src/shared/infrastructure/migrations/*.ts!` (matching `data-source.ts`'s own TypeORM config), not the originally-assumed `src/migrations/**`.

**Story-discovery/implementation addendum (round 2, 2026-08-22):** Codex's round-2 review correctly flagged that the AC below originally read as if the baseline review were exhaustive — it wasn't; it covered only the dependency-category findings surfaced by a `--include dependencies,unlisted` run. A second, genuine tool-limitation false positive turned up on closer review: `packages/config/tsconfig.nextjs.json`'s `compilerOptions.plugins: [{ name: "next" }]` is a TypeScript-language-service plugin declaration (editor/tsc IntelliSense only), not a runtime import — knip misread the plugin `name` field as an unresolved module specifier. Now allowlisted the same way as `dependency-cruiser` (`knip-unresolved-import` rule, new `ignoreUnresolved` translation in `knip.config.ts`). Also: `apps/web`'s `project` glob widened from `**/*.{ts,tsx}!` to `**/*.{ts,tsx,js,mjs,cjs}!` so root JS/MJS config files (`eslint.config.js`, `postcss.config.mjs`) are actually scanned — this **confirmed** `autoprefixer` is a genuine leftover unused devDependency (pre-Tailwind-v4-migration cruft), while `tailwindcss` is **not**: it's referenced only via `@import 'tailwindcss'` in `app/globals.css`, which knip's own "Compiled extension excluded by project (imports not followed)" configuration hint already flags as a structurally-unfollowed CSS import — a false positive, not cleanup work, left as-is for a human to note during triage rather than chased further in this story.

**Acceptance criteria**:
- [x] `knip.config.ts` defines entry/project/plugin settings per app/package (all 3 apps + all 10 packages) plus a root-level `scripts/**/*.cjs` entry — none rely on ignored top-level monorepo defaults
- [x] Both `knip` (default, all workspaces) and `knip --production --strict` (scoped to `apps/backend`/`apps/bff`/`apps/web` only — see implementation note) run in CI; production entry patterns (`!` suffix) are set per workspace so the strict run actually restricts checked dependencies to `dependencies`
- [x] Both confirmed tool-limitation false positives found during implementation — `dependency-cruiser` (spawned binary, not a JS import) and `next` (a tsconfig plugin declaration, not a real import) — are allowlisted in `architecture-policy.json`'s `exceptions` array with reason, owner, and expiry. The full remaining universe of genuine findings (1 unused dependency, 8 unused devDependencies, 4 unlisted-dependency sites, 37 unused exports, 55 unused exported types as of this PR) is **intentionally not individually catalogued here** — that's what Phase 1's non-blocking burn-in period is for, per this AC's own "triage before promoting to blocking." `uuid` (backend, unused), `ms` (bff, unused), and `express` (backend, used in production code but declared nowhere — the exact #79 pattern this story exists to catch) are called out only as illustrative, confirmed-real examples, not an exhaustive list
- [x] Ships **non-blocking** first via `continue-on-error` in a new `pr-quality.yml` job, reporting both modes' plain-text output to `$GITHUB_STEP_SUMMARY` plus uploading them via `actions/upload-artifact` (plain-text `knip` reports, not JSON — simpler and sufficient for a human triage read; no new third-party reporting action needed)
- [x] `scripts/knip-config.spec.cjs` asserts the configured workspace/entry registry matches reality (mirrors `dependency-cruiser-config.spec.cjs`)

---

### Story 14 — `arethetypeswrong`: `packages/*` publish-shape validation 🟡 ✅ Done

**New dependency**: `@arethetypeswrong/cli` (dev-only; command `attw`). It validates built package type/package metadata, but does not by itself reproduce the #77 Node native type-stripping / `pnpm deploy --prod` runtime failure. Pair it with a packed-artifact runtime import smoke test that mirrors production consumption.

**Story-discovery addition (2026-08-23):** three design decisions locked in, since the TD text above leaves each ambiguous enough to become an implementation-time guess otherwise:
- **Package scope is exactly the 7 packages already named in root `package.json`'s own `postinstall` script** — `@ikaro/i18n`, `@ikaro/observability`, `@ikaro/env-validation`, `@ikaro/types`, `@ikaro/nestjs-http`, `@ikaro/validation`, `@ikaro/http-utils`. That script is already the repo's authoritative "ships real runtime code, not just types" list, independently corroborated by every app's Dockerfile (`apps/backend/Dockerfile`, `apps/bff/Dockerfile`) building the identical subset before `pnpm deploy --prod`, and by each package's real `workspace:*` presence in `apps/{backend,bff,web}/package.json`. Explicitly excluded: `@ikaro/config` (no build/`dist` — ships plain JS/JSON config directly), `@ikaro/architecture-check` and `@ikaro/infra-scripts` (both build a `dist/`, but neither has any real `workspace:*` consumer — CLI-only tools, never imported as a dependency by any app or package).
- **Two root scripts, one CI job.** `pnpm attw-check` (per package: `pnpm --filter <pkg> build` → `pnpm --filter <pkg> pack` → `attw --pack <tgz>`) and `pnpm attw-check:runtime` (extracts each packed tarball into an isolated scratch `node_modules/@ikaro/<pkg>` layout — real tarball-extraction resolution, not a workspace symlink — then `require()`s the package's `main` entry from outside its own directory tree and asserts the resolved module is a non-empty object; this is the literal reproduction of `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` and of a stale/missing `dist/`). Mirrors Story 13's `knip`/`knip:production` split. Wired into one new `pr-quality.yml` job (`continue-on-error: true`, Phase 1 non-blocking per this TD's own rollout table), reporting to `$GITHUB_STEP_SUMMARY` plus `actions/upload-artifact`, same shape as the existing `knip`/`dependency-cruise` jobs.
- **Standalone root-level scripts** (`scripts/attw-check.cjs` + `scripts/attw-runtime-smoke.cjs`), not folded into `packages/architecture-check`'s `ts-morph` runner — `attw` is an off-the-shelf CLI like `dependency-cruiser`/`knip`, not a semantic AST check, so it follows their precedent instead of Story 0's runner. A `scripts/attw-check-config.spec.cjs` (`node:test`) mirrors `dependency-cruiser-config.spec.cjs`/`knip-config.spec.cjs`: asserts the configured 7-package list matches root `package.json`'s `postinstall` script exactly (single source of truth, not a second hand-maintained list) and that each configured package's `dist/` exists post-build.

**Acceptance criteria**:
- [ ] `scripts/attw-check.cjs` builds, packs (`pnpm pack`), and runs `attw --pack` against each of the 7 scoped packages (`@ikaro/i18n`, `@ikaro/observability`, `@ikaro/env-validation`, `@ikaro/types`, `@ikaro/nestjs-http`, `@ikaro/validation`, `@ikaro/http-utils`)
- [ ] `scripts/attw-runtime-smoke.cjs` extracts each packed tarball into an isolated scratch `node_modules/@ikaro/<pkg>` layout and `require()`s its `main` entry from outside the package's own tree, asserting a non-empty resolved export
- [ ] Both wired into a single new `pr-quality.yml` job, non-blocking (`continue-on-error: true`), reporting via `$GITHUB_STEP_SUMMARY` + `actions/upload-artifact`
- [ ] `scripts/attw-check-config.spec.cjs` asserts the configured 7-package list matches root `package.json`'s `postinstall` script exactly
- [ ] `docs/ANTI_PATTERNS.md` #77 and #79 rows note they're now CI-enforced (report-only) by this check, mirroring the Story 11 (`WEB-9`) precedent

---

### Story 15 — No `.skip()`/`.only()` in tests 🟡 ✅ Done

**New dependencies**: `eslint-plugin-jest@29.16.1` (`apps/backend`, `apps/bff`, and all 8 test-bearing `packages/*` — see below) + `@vitest/eslint-plugin@1.6.27` (`apps/web` — matching that app's actual test runner, not Jest). Both confirmed compatible with this repo's ESLint 10.

**Story-discovery addition (2026-08-23):** five decisions locked in, since the TD text above leaves each ambiguous enough to become an implementation-time guess otherwise:
- **Rules are scoped narrowly, not the plugins' full recommended sets.** Only `jest/no-disabled-tests` + `jest/no-focused-tests` (backend, bff, packages/*) and `vitest/no-disabled-tests` + `vitest/no-focused-tests` (web), each restricted to `**/*.spec.ts`/`**/*.spec.tsx`/`**/*.integration.spec.ts` files — matches this story's exact scope ("no skip/only"), not a broader jest/vitest lint-style adoption.
- **Ships directly as `error`, no report-only warning phase.** Confirmed empirically: zero `.skip()`/`.only()` violations exist repo-wide today (`grep -rnE "it\.skip\(|test\.skip\(|describe\.skip\(|it\.only\(|test\.only\(|describe\.only\(|^xit\(|^xdescribe\("` across `apps/*/src`, `apps/web`, `packages/*` — zero hits). Mirrors Story 5's `default-param-last` precedent: a zero baseline ships as `error` immediately, no burn-in needed.
- **`packages/*` scope resolved as: give all 8 test-bearing packages (`types`, `validation`, `http-utils`, `env-validation`, `nestjs-http`, `observability`, `infra-scripts`, `architecture-check`) a real, first `eslint.config.js` inheriting `@ikaro/config/eslint-base` (the same base every app already uses — not a new per-package ruleset decision) plus a `"lint"` script, wired into the existing recursive `pnpm -r run lint` (no new CI step needed). `config` and `i18n` have no test files and are excluded — nothing for the new rules to scan. Verified empirically before locking this in: running the shared base config against all 8 packages surfaces only 7 pre-existing violations, not a landmine — 1 real fix (`packages/nestjs-http/src/zod-validation.pipe.spec.ts:53`, `z.string().email()` → `z.email()`, Zod v4 deprecation) and 6 `console.log` calls in `packages/infra-scripts` that are a CLI tool's legitimate output, exempted the same way `apps/backend/eslint.config.js` already exempts this exact package (M17-S18 precedent). Both fixes/exemptions ship in this story alongside the new packages' lint configs.
- **`scripts/pre-pr.sh` check #16 (`.skip()`/`.only()`, diff-scoped grep) is deleted**, not kept alongside the new rule — unlike Story 11's WEB-9 precedent (which kept its diff-scoped pre-check as a fast local complement), this rule's enforcement cost is low enough (`pnpm lint`, not a slower full audit) that a second, narrower mechanism for the identical rule isn't worth maintaining.
- **No new `.eslint.spec.ts` fixture files.** `jest/no-disabled-tests`/`jest/no-focused-tests`/`vitest/no-disabled-tests`/`vitest/no-focused-tests` are off-the-shelf plugin rules, already tested upstream by their own authors — unlike Stories 2/4's hand-written `no-restricted-imports`/`no-restricted-syntax` selectors (which do have fixture specs, e.g. `apps/backend/src/eslint/restricted-imports-syntax.eslint.spec.ts`, because nothing else proves a bespoke regex/selector actually matches), this needs no bespoke proof. Matches Story 5's precedent: no fixture spec exists for its ESLint-core rules either.

**Acceptance criteria**:
- [ ] `no-disabled-tests`/`no-focused-tests` (or Vitest's equivalents) enabled in each app's ESLint config, and in all 8 test-bearing `packages/*` via their new `eslint.config.js` + `"lint"` script
- [ ] Scope is honest: `packages/*` is explicitly in scope (not silently excluded) — recursive `pnpm lint` now actually lints every workspace that has tests
- [ ] `scripts/pre-pr.sh`'s existing changed-file check #16 is removed, since the new ESLint rule supersedes it (full-codebase, not diff-scoped) rather than duplicating it

---

### Story 16 — Ban unrestricted `eslint-disable` ✅ Done

**New dependency**: `@eslint-community/eslint-plugin-eslint-comments` (the actively-maintained community fork — the original `eslint-plugin-eslint-comments` package has slower maintenance, not worth adopting the less-maintained one for a new dependency).

**Story-discovery decision (2026-08-24):** the policy is scoped-only, not blanket permission. File- and block-level suppressions are forbidden. A rule-specific `eslint-disable-next-line`/`eslint-disable-line` is allowed only at the smallest possible scope, with the exact rule and a concrete justification. Every existing suppression must still undergo root-cause triage: fix the underlying issue when a clean alternative exists; retain a suppression only when the constraint is genuine, and record recurring or architectural exceptions in Story 0's `architecture-policy.json` registry with rationale, owner, and review/expiry date. The current baseline is 17 directives (16 single-line suppressions and one rule-specific block-level suppression), all in `apps/backend`/`apps/web`; there are no bare all-rules `eslint-disable` directives. The block-level case is not grandfathered in — it must be refactored, removed, or replaced by a reviewed smallest-scope exception after the underlying loading-order constraint is checked.

**Acceptance criteria**:
- [ ] Documentation and lint policy agree: file/block-level suppressions are rejected; only smallest-scope, rule-specific suppressions with concrete justification may remain
- [ ] ESLint enforcement covers the same scope as Story 15: `apps/backend`, `apps/bff`, `apps/web`, and all eight test-bearing `packages/*` workspaces
- [ ] Every existing suppression is triaged for a root-cause fix; no suppression is retained merely by converting its syntax
- [ ] Existing suppressions are removed when a clean alternative exists, or recorded as reviewed, time-bounded exceptions when the constraint is genuine
- [ ] The existing block-level suppression in `openrouter-credits.client.spec.ts` is removed, refactored, or reduced to the smallest justified scope after testing the module-loading alternative
- [ ] A regression check proves broad/file/block-level suppressions fail while an approved, rule-specific single-line suppression with a justification passes

---

### Story 17 — Exploratory, non-blocking: tenant_id-missing query-builder detector ⚪ Deferred — not pursued

**Decision (2026-08-24):** Do not implement this detector as part of TD37. The heuristic would cover only one TypeORM query style, would require non-trivial query-chain analysis and a maintained exemption inventory, and would remain report-only. Database constraints and tenant-isolation integration tests provide stronger protection. Reconsider only if a future baseline audit demonstrates recurring, actionable regressions that justify the maintenance cost.

This was considered as a useful **narrow heuristic**, not a security guarantee. It targets one dangerous class of missing tenant predicate but has both false-negative and false-positive risk. Tenant isolation remains protected primarily by database constraints and integration tests.

**Mechanism**: scan every repository method for `createQueryBuilder()`/`.where()`/`.andWhere()` chains with no `tenantId`/`tenant_id` reference anywhere in the chain. Emit an artifact containing scanned query-builder chains, exemption matches, and coverage. It deliberately does not claim to cover repository `.find({ where: ... })` and similar APIs.

**Explicitly ships report-only, never auto-promoted to blocking without a manual decision** — mirroring the precedent your own docs already set for `scripts/pre-pr.sh` check 25 (#133): a blunt grep-style check can't distinguish "genuinely forgotten `tenant_id`" from "deliberately tenant-exempt transport table," so a documented exemption list (not a code allow-list) is the answer, same as that row's own resolution.

**Acceptance criteria**:
- [ ] Prototype built and run against `main` in report mode, emitting its coverage/exemption artifact
- [ ] Typed entity/table exemption inventory reviewed and documented, including platform tenant exemptions where applicable—not only shared inbox/outbox
- [ ] Explicit go/no-go decision recorded before ever considering promotion to blocking — this story does not ship as a blocking gate as part of this TD

---

### Story 18 — Optional/bonus: enforce Next.js frontend best practices with `@next/eslint-plugin-next` ⚪ ✅ Done

Not sourced from `docs/ANTI_PATTERNS.md` directly — found while verifying `apps/web/eslint.config.js`. The app runs Next.js 16 with **zero** Next-specific linting today (only `eslint-plugin-react-hooks` + `eslint-plugin-jsx-a11y`). This leaves statically detectable framework misuse — such as raw `<img>` elements, invalid internal navigation patterns, unsafe script usage, and invalid Client Component patterns — without a CI enforcement mechanism.

Use `@next/eslint-plugin-next` directly in the existing flat config rather than spreading `eslint-config-next`, because the web app already configures React and React Hooks rules and must avoid duplicate or conflicting configuration. The existing root `ci:fast` → `pnpm lint` gate is the enforcement point; `next build` does not need to invoke ESLint a second time.

The standard Next plugin does **not** detect `<Image fill>` without `sizes`. That remains outside this story unless a separate custom detector is explicitly added later.

**Acceptance criteria**:
- [ ] Pin and validate `@next/eslint-plugin-next` compatibility with this repository's ESLint 10 and Next 16 flat-config setup; document the exact plugin registration, rule import, and config ordering
- [ ] Enable the selected Next.js recommended rules for `apps/web`, with objectively harmful framework misuse configured as blocking ESLint errors
- [ ] Establish and review the current violation baseline; fix valid findings or record narrowly scoped, rule-specific exceptions with concrete justification
- [ ] `pnpm lint` fails on a deliberately invalid Next.js fixture and passes on the corrected version, proving the existing CI gate blocks the bad practice
- [ ] CI enforcement is blocking through the existing `pnpm lint` step; no duplicate ESLint invocation is added to `next build`
- [ ] `<Image fill>`/`sizes` enforcement is explicitly documented as out of scope for this story

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

### Story 20 — `ts-morph`: primitive fields matching a VO concept must be validated at their owning class's construction boundary ⚪ ✅ Done

Generalizes a gap found during Story 9 discovery (2026-08-21): a field can correctly skip VO-*typing* (e.g. a JSONB wire-shape field like `TenantSettings`' `businessInfo.email`, which must stay a plain primitive per Story 9's own discovery note above) while still needing that VO's validation *and normalization* applied somewhere in its owning class's `create()` path. Story 9's registry only proves a field *is typed as* the VO; it says nothing about a field that's deliberately *not* VO-typed but still needs the same guarantee applied at runtime.

**Mechanism**: resolve the call graph from a registered owning class's `create()`/factory method to confirm the matching VO's `.create()` (not merely `.isValid()`) is actually invoked on the registered field — including through one level of indirection where validation is delegated to a helper `Validator` class, as `TenantSettings` already does (`TenantSettings.create()` → `BusinessInfoValidator.validate(props.businessInfo)` → `Email.isValid(businessInfo.email)`). Same registry-driven shape as Story 3's external-side-effect-port resolution: `{ownerClass/file, propertyPath, requiredVo}` entries, each reviewed individually.

**First concrete target**: `TenantSettings.create()` calls `Email.isValid()` but never `.create()`, so `businessInfo.email` and `notification.fromEmail` are format-validated but never normalized (case/whitespace) — fixed as this story's proof case, mirroring the existing `normalizeBusinessAddress()`/`normalizeLocalization()` pattern already used for `Address`/`LocalizationSettings` in the same class.

**What it catches**: a field that's intentionally kept primitive (JSONB/wire-shape data) but whose owning class validates format without normalizing — the exact `TenantSettings` gap found in Story 9 discovery, generalized so it can't recur silently elsewhere.
**What it does NOT catch**: whether a field *should* be VO-typed at all — that's Story 9's job. This story only checks that a field already correctly left as primitive gets the VO's full `create()` treatment (validate + normalize), not just a bare `.isValid()` check.

**Acceptance criteria**:
- [ ] Detector resolves one level of call-graph indirection (owning class → delegated validator) and flags a registered field whose construction path never calls the matching VO's `.create()`
- [ ] `TenantSettings.create()`'s `Email` normalization gap (`businessInfo.email`, `notification.fromEmail`) fixed as this story's first real target
- [ ] Permanent valid/invalid/zero-target fixtures

---

### Story 21 — Unify the two avoidable `HotsiteModuleType` copies; detector for the one that can't be unified yet 🔴

During M20-S01 (2026-08-24), `'LEAD_FORM'` was added to the shared `HotsiteModuleType` union in `packages/types/src/enums.ts` while a second, independent copy of the same conceptual enum already existed in `apps/backend/src/contexts/platform/domain/hotsite-config.types.ts` and a third in `packages/validation/src/hotsite.ts`'s `HotsiteModuleSchema` Zod enum. The shared-package copy broke `apps/web`'s exhaustive `Record<HotsiteModuleType,...>` maps and had to be reverted mid-session — caught only because a human was watching type-check output, not by any bot or CI gate.

**Discovery-time correction (2026-08-24):** the first draft of this story treated all 3 copies as permanently independent and proposed only a parity-*detector*. That's the wrong root fix for 2 of the 3 copies. Today, all 3 copies list the exact same 9 base members; the backend mirror and the validation schema additionally both carry `'LEAD_FORM'` as a 10th member, in identical order — they are, right now, byte-for-byte identical to each other. There is no legitimate reason for these two to be separate files: neither has any consumer the other doesn't, and nothing about backend vs. BFF/validation gives either a reason to diverge from the other. The *only* copy with a real, deliberate reason to lag is `packages/types/src/enums.ts` — it feeds `apps/web`'s exhaustive `Record<HotsiteModuleType,...>` maps, and `LEAD_FORM`'s web-side rollout is intentionally deferred to a later story (per `plan/M20-LEAD-FORM-MODULE.md`). Perpetually parity-checking a duplication that has no reason to exist is treating a symptom; the two avoidable copies should be collapsed, and the detector should only cover the one relationship that's genuinely allowed to diverge.

**Part A — Unify the backend mirror and the validation schema (real code change, done as part of this story):**
- `packages/validation/src/hotsite.ts` becomes the single source: export a canonical `as const` tuple (e.g. `HOTSITE_MODULE_TYPES = ['HERO', 'SERVICE_LIST', 'GALLERY', 'TESTIMONIALS', 'BOOKING_CTA', 'ABOUT', 'CONTACT', 'FOOTER', 'CHATBOT', 'LEAD_FORM'] as const`), derive both `HotsiteModuleSchema`'s `type: z.enum(HOTSITE_MODULE_TYPES)` and an exported `export type HotsiteModuleType = (typeof HOTSITE_MODULE_TYPES)[number]` from it.
- `apps/backend/src/contexts/platform/domain/hotsite-config.types.ts` drops its own `HotsiteModuleType` union entirely and instead does a **type-only** import: `import type { HotsiteModuleType } from '@ikaro/validation'`. A type-only import is erased at compile time, so this adds no runtime dependency on `zod` (or any framework) to the domain layer — but it *is* a new import direction (domain → `@ikaro/validation`) that doesn't exist elsewhere in the codebase today (`@ikaro/validation` is currently only imported from `application/dtos/*`, never from `domain/`). **Confirm this against `packages/architecture-check`'s `dependency-cruiser` rules (Story 1) and the domain-layer "zero framework deps" rule during this story's own `/story-discovery`** — if the type-only import is disallowed by the existing context-dependency matrix, the fallback is re-exporting the type through `packages/types` instead (see Part B's note on why the *value list* can't live there, but a type-only re-export naming a `@ikaro/validation`-sourced type might still be acceptable — a genuine design choice for discovery to lock in, not something to assume here).
- `apps/backend/src/contexts/platform/domain/hotsite-config.aggregate.ts`'s existing `export *` from `hotsite-config.types.ts` keeps re-exporting `HotsiteModuleType` under the same name, so no call site elsewhere in backend needs to change its own import path.

**Part B — Detector for the one relationship that's still allowed to diverge:** a `ts-morph` detector reads a `closedEnumRegistry` array from `architecture-policy.json`. Each entry names a conceptual enum, its canonical (unified) source, and the web-facing copy it's allowed to lead ahead of:
```json
{
  "name": "HotsiteModuleType",
  "canonical": { "path": "packages/validation/src/hotsite.ts", "kind": "constArray", "exportName": "HOTSITE_MODULE_TYPES" },
  "mayLeadAhead": { "path": "packages/types/src/enums.ts", "kind": "union", "exportName": "HotsiteModuleType" },
  "rationale": "LEAD_FORM's apps/web rollout is deferred to a later story; packages/types/src/enums.ts must never gain a member the canonical source lacks, but may legitimately lag behind it until that story lands.",
  "owner": "...", "reviewBy": "..."
}
```
Extract each side's literal string-member set (`constArray` walks the array literal; `union` walks a `TypeAliasDeclaration`'s union members). The rule is **superset-only, not equality**: every member of `mayLeadAhead` must exist in `canonical` (nothing web-facing may exist that the canonical source doesn't know about — this direction is a real bug, not a deferred rollout); the reverse (canonical having a member `mayLeadAhead` lacks) is allowed and expected while the rollout is pending, and produces no finding. Note why this is not the same shape as Story 9's `aggregateValueObjectRegistry`/Story 11's `ikaro-types-drift` (both of those check pure duplication/mismatch, not a deliberately-allowed one-directional lead).

**What it catches**: `packages/types/src/enums.ts`'s `HotsiteModuleType` gaining a member the canonical `@ikaro/validation` source doesn't have (an actual reversed-direction bug), and — for any *other* registry entry that doesn't have a deliberate lead/lag relationship — plain 2-way divergence between exactly 2 registered copies (the general case, once Part A leaves this codebase with only one still-legitimately-split enum family).
**What it does NOT catch**: enums not yet added to the registry, or a genuinely-independent third copy this registry shape doesn't yet model (opt-in, closed-list — same posture as every other TD37 registry).

**Acceptance criteria**:
- [ ] `packages/validation/src/hotsite.ts` exports the single canonical `HOTSITE_MODULE_TYPES` tuple + derived `HotsiteModuleType` type; its own `HotsiteModuleSchema.type` field derives from it instead of a separately-typed-out array
- [ ] `apps/backend/src/contexts/platform/domain/hotsite-config.types.ts`'s own `HotsiteModuleType` union is deleted; the type-only import direction (from `@ikaro/validation`, or the `@ikaro/types` re-export fallback) is confirmed against `dependency-cruiser`'s rules during `/story-discovery`, not assumed
- [ ] Every existing call site re-exported via `hotsite-config.aggregate.ts`'s `export *` continues to resolve `HotsiteModuleType` without an import-path change
- [ ] Detector flags a deliberately-introduced reversed-direction fixture (`mayLeadAhead` has a member `canonical` lacks) and a same-direction fixture that's still a plain 2-way divergence for a non-lead/lag registry entry; passes when the registered relationship holds
- [ ] `closedEnumRegistry` seeded with the `HotsiteModuleType` entry above, reflecting the post-unification 2-copy reality (not the pre-unification 3-copy one)
- [ ] Detector registered in `cli.ts` alongside the existing check list (near `checkIkaroTypesDrift(...)`)
- [ ] Report-only (Phase 1) on first merge, per this TD's 3-phase rollout convention — promote to blocking only after a clean/triaged run
- [ ] Permanent valid/invalid/zero-target fixtures, per `detectorContract`

---

### Story 22 — Wire `pnpm architecture-check` into `ci:fast` / pre-push 🔴

`pnpm architecture-check` exists as a root `package.json` script and runs in its own dedicated GitHub Actions job ("Architecture validation"), but is absent from `ci:fast` (`package.json:27`) and from `scripts/pre-pr.sh` — confirmed by grep during M20-S01's retrospective (2026-08-24). This is precisely the "Local vs. CI drift" risk this TD's own Trade-offs section already names: a detector violation (e.g. the `test-harness-registration` gap hit during M20-S01 itself) is invisible locally and only surfaces after `git push`, in a separate CI job, well after `/pre-pr` has already reported clean. The fix isn't a new rule — it's running the existing rule earlier, at the same point `ci:fast` already runs lint and type-check.

**Mechanism**: add `pnpm architecture-check` as a conjunct in the root `ci:fast` script (`package.json:27`), so it runs on every `git push` (the pre-push hook already invokes `ci:fast`) and inside `/pre-pr`'s own Step 1/Step 2 window, before a PR is ever opened.

**What it catches**: any of Stories 3–21's detector findings, surfaced at push time instead of first appearing in a separate CI job minutes after a PR opens.
**What it does NOT catch**: nothing new — this is a scheduling change, not a new rule. `architecture-check` runs full-codebase (not diff-scoped) already; expect it to add measurable wall-clock time to `ci:fast`.

**Acceptance criteria**:
- [ ] `pnpm architecture-check` runs as part of `pnpm ci:fast`
- [ ] A deliberately-introduced violation (e.g. an unregistered test-harness entity) fails locally at `git push` time, before any PR exists
- [ ] Measured added wall-clock time to `ci:fast` reported in the story's own PR description
- [ ] The existing standalone "Architecture validation" CI job is left in place unchanged — it stays the authoritative CI gate; this story only adds an earlier, redundant local signal

---

### Story 23 — ESLint rules for E2E-1/E2E-2/E2E-3 (`pre-pr.sh` checks bypassable after PR creation) 🔴

`pre-pr.sh`'s own skill text is explicit: *"If a PR is already open for this branch, this skill exits immediately."* That means every custom check in the script — including the three E2E quality checks below — runs **once**, before a PR is first created, and never again. Once a PR is open, `/pr-land`'s round loop only re-runs `ci:fast` (ESLint + `tsc --noEmit` + unit tests) plus Codex/CodeRabbit review on each new commit — never `pre-pr.sh` itself. A check that's a bespoke grep (not an ESLint rule) is therefore invisible to every commit added during a PR's own bot-fix round loop, not just to commits on a different branch.

**Proven, not hypothetical (🔴):** M20-S08 (PR #429, 22 commits across its own bot-fix round loop, merged 2026-08-27T00:07:57Z) shipped `apps/web/e2e/hotsite-editor.spec.ts` test coverage for the new `LeadFormSortableQuestion` component using `getByLabel(`/`getByText(` — a direct violation of E2E-1, which has existed since commit `814e4d9c3` (M13-S41, 2026-06-18), two months earlier. The rule was not new; the violating code was. It sat on `main` undetected until M20-S12's own story-discovery/merge work found it the next day (2026-08-27), confirmed via `find apps/web/e2e -name "*.spec.ts" | xargs grep -nE "getByLabel\(|getByText\("` returning a real hit against `main`. Most likely mechanism: the violating test code was added in one of PR #429's later round-loop commits, after its one-time `pre-pr.sh` gate had already passed — `ci:fast` alone can't catch it, since E2E-1/2/3 are grep checks, not ESLint rules.

This is the same class of gap TD37 already exists to close (Story 4's own opening line: "the exact mechanism you already use for the `EVENT_BUS`/OTel bans") — a `.md`-adjacent, easily-bypassed script check migrated into a deterministic, always-on ESLint rule.

**Mechanism** — same "zero new dependency" `no-restricted-syntax`/custom-selector approach as Story 4, with the two scope splits `scripts/pre-pr.sh` itself already uses (confirmed by reading its exact implementation, not assumed):

| Rule | Current `pre-pr.sh` check | Scope |
|---|---|---|
| Ban `getByLabel(`/`getByText(` calls | E2E-1 (`grep -E "getByLabel\(\|getByText\("`, whole-directory scan, not diff-scoped) | `apps/web/e2e/**/*.spec.ts` |
| Ban a `data-testid` JSX attribute string value containing an ISO date (`YYYY-MM-DD`) | E2E-2 (`grep 'data-testid="[^"]*[0-9]{4}-[0-9]{2}-[0-9]{2}[^"]*"'`, diff-scoped to changed `.tsx` files) | `apps/web/**/*.tsx` (component definition sites, where `data-testid` values are authored — not the e2e specs that consume them) |
| Ban a template-literal expression as a `data-testid` JSX attribute value (`data-testid={\`...\`}`) | E2E-3 (`grep 'data-testid=\{\`'`, diff-scoped to changed `.tsx` files) | `apps/web/**/*.tsx` |

E2E-1 is a plain `CallExpression` selector (`callee.property.name` matching `getByLabel`/`getByText`), identical in shape to Story 4's existing rules. E2E-2/E2E-3 target a JSX attribute's value (`JSXAttribute` with `name.name === 'data-testid'`) rather than a call expression — closer to Story 4's `as React.CSSProperties` rule (which also matches on a syntactic shape, not a call) than to its `CallExpression`-based rules; confirm the exact selector during this story's own `/story-discovery` rather than assuming one shape covers all three.

**What it catches**: exactly the PR #429 incident — a violation introduced anywhere in a PR's lifecycle (initial commit or a later bot-fix-round commit) fails `ci:fast` on that same push, before the PR can ever reach a green state, closing the gap `pre-pr.sh`'s one-time-only execution left open.
**What it does NOT catch**: `pre-pr.sh`'s other custom checks (BE-2/3/5/7, WEB-1/4/5/6/7, etc.) have the identical one-time-execution exposure — this story only closes it for E2E-1/2/3. Whether the remaining `pre-pr.sh` checks deserve the same treatment is a separate, later scoping decision, not assumed here.

**Acceptance criteria**:
- [ ] All 3 rules added to `apps/web/eslint.config.js`, each citing "E2E-1"/"E2E-2"/"E2E-3" and this TD/story in its error message (not a bare rule name)
- [ ] Zero current violations on `main` at implementation time (re-verify — this story's own discovery predates a real fix landing, so the count may already be zero by the time this is picked up)
- [ ] A fixture PR introducing each of the 3 violations fails at `ci:fast`/push time, not just at a later, separate `pre-pr.sh` invocation
- [ ] `scripts/pre-pr.sh`'s E2E-1/E2E-2/E2E-3 checks (lines ~269-286) are removed once the ESLint rules cover the identical scope — no duplicate enforcement of the same rule in two places
- [ ] `docs/08-TESTING_STRATEGY.md`/wherever E2E-1/2/3 are documented for humans is updated to point at the ESLint rule instead of the script check

---

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

Story 17 is deferred and is not part of TD37's implementation or rollout.

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
| `HotsiteModuleType` unification + lead/lag detector (Story 21) | Real code change (packages/validation, apps/backend) + shared CLI/test harness (same runner as Stories 3, 6–12) | No new CI step for the detector; the unification is a normal PR |
| `pnpm architecture-check` in `ci:fast` (Story 22) | Root `ci:fast` script + pre-push hook | No — wires the existing dedicated CI job's own script earlier, doesn't add a new one |

---

## Suggested PR Waves

- **Wave 0 — decisions and baseline:** Story 0. This precedes every detector and includes the `@ikaro/types` subpath extraction/migration needed by Story 1.
- **Wave 1 — import and layer barriers:** Story 1, then Story 2. Establish the context matrix and framework-free domain/application boundary before scattered lint rules.
- **Wave 2 — flagship transactional safety:** Story 3. It selects and establishes the semantic runner for the remaining architectural checks.
- **Wave 3 — low-cost lint feedback:** Stories 4, 5, 15, 16. Respect report-only/warning burn-in and the agreed disable policy.
- **Wave 4 — semantic architecture suite:** Stories 6–10, each as a separate small PR with fixtures. Story 7A depends on Story 7's `ts-morph` test-hygiene harness and additionally needs the `InMemoryCachePort` double built first — sequence it after Story 7.
- **Wave 5 — known contract/data-harness gaps:** Stories 11 and 12, then Story 7 if it was not completed in Wave 4.
- **Wave 6 — package hygiene:** Stories 13 and 14.
- **Wave 7 — optional:** Story 18 after its compatibility spike.
- **Wave 8 — mature rollout:** Story 19 after all selected blocking detectors have completed report-only burn-in.
- **Wave 9 — closes the local/CI drift gap:** Story 21 (independent, can land any time after Wave 4's runner exists — the unification half needs no detector infrastructure at all and could ship first on its own if useful), then Story 22 (independent of Story 21 — wires the already-existing CLI regardless of which detectors it currently runs).

---

## Acceptance Criteria (TD-level)

- [ ] Story 0's policy artifacts and package-contract migration completed before dependent stories
- [ ] All Wave 1–6 stories implemented, passing against `main`, and correctly wired per the "Where Each Check Runs" table
- [ ] Every new blocking CI step followed the 3-phase rollout (report-only → blocking → required-check) — no check skips straight to required
- [ ] Story 19 completed before any architecture validation job is added to branch protection as a required check
- [x] Story 17 was evaluated and deferred; no detector, CI job, or production-code change is required
- [ ] Retired manual bad-smell-audit checks (BE-1, BE-4, WEB-9 once their mechanical equivalents ship) so the same rule isn't checked twice by two different mechanisms
- [ ] `docs/ANTI_PATTERNS.md` updated to note, per row addressed here, that it's now CI-enforced (not just documented) — so a future reader doesn't re-litigate whether it needs an agent to remember it
- [ ] This TD's own "Out of Scope" table double-checked against `docs/ANTI_PATTERNS.md` one more time before closure, in case a new incident since 2026-07-27 changed the calculus on any row
- [ ] Every static detector has permanent valid/invalid fixtures and a zero-target assertion; every exception is in the reviewed registry with rationale, owner, and review/expiry

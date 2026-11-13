---
name: pr-review
description: Deep multi-lens PR review run by parallel specialist agents - requirements & business correctness, security/tenant-isolation/privacy, performance, architecture & code quality, test quality, documentation/contract/i18n drift, plus conditional lenses for data/migrations/concurrency/events, frontend/UX/a11y, and infrastructure/DevOps-SRE - cross-checked against docs/ANTI_PATTERNS.md and this codebase's documented rules. Findings ordered Critical/Important/Minor, with an explicit machine-readable VERDICT (APPROVE / CHANGES_REQUESTED / BLOCKED_NEEDS_DECISION), a separate list of findings that need a human business/design decision, and an explicit list of what could not be verified. Every Critical/Important finding is independently re-verified and checked against the PR's own comment/review history before posting. Always posts the report as a PR comment when a PR exists (mandatory, not gated on asking - required for headless runs dispatched by /pre-pr to complete). Standalone: does not invoke /pre-pr or /bad-smell-audit, and has no opinion about who wrote the code it's reviewing.
metadata:
  short-description: Deep multi-lens PR review with verdict
---

Deep, multi-perspective review of a PR or the local branch's diff against `main`. This is a semantic/reasoning review, complementary to `/pre-pr` (mechanical gate) and `/bad-smell-audit` (structural patterns) — **it never invokes either of those, or any other Claude-Code skill**. Fix nothing — review only.

This skill has no opinion about who wrote the code — it just reviews whatever PR it's pointed at. The decision to ask the *other* tool (Claude vs. Codex) to review a PR belongs to `/pre-pr`, which dispatches this skill to the other tool once the PR is open. This skill can equally well be run standalone, by either tool, against any PR.

Optional argument: `$ARGUMENTS`
- blank — review the local branch: `git diff origin/main...HEAD`
- a PR number — fetch and review that GitHub PR: `gh pr diff <N>`

**Output contract with `/pr-land`:** the posted comment keeps the `### 🔴 Critical` / `### 🟡 Important` / `### 🟢 Minor` headings and the `Total:` line, and ends with one machine-readable `VERDICT:` line (Step 4). `/pr-land` reads those; do not rename them.

---

## Step 0 — Resolve scope, story and review tier

**Diff + changed files:**
```bash
# local branch (blank argument)
git diff origin/main...HEAD
git diff origin/main...HEAD --name-only
git diff origin/main...HEAD --shortstat

# PR number argument
gh pr view <N> --repo lmmoreira/ikaro --json title,body,headRefName,headRefOid
gh pr diff <N> --repo lmmoreira/ikaro
gh pr diff <N> --repo lmmoreira/ikaro --name-only
```

**Pin the exact commit for accurate reads (PR-number mode only):** the diff shows what changed, but Step 1 also needs each changed file's *full* current content — that is only accurate when read from the PR's head commit, not whatever is checked out locally (reviewing PR #N from an unrelated branch silently reads pre-PR content and produces confidently wrong findings). Fetch the head commit without touching the working directory, then read files as blobs:
```bash
git fetch origin <headRefOid> --depth 1
git show <headRefOid>:<path/to/file>
```
In local-branch mode the working directory already matches the diff — read files normally.

**Review workspace — a checkout only if a finding needs code run.** Reading the diff, the history and blobs needs no checkout. Only when a finding must be proven by running something (tests, `architecture-check`, a build, an `EXPLAIN`), create one worktree from the main checkout: `git worktree add --detach .claude/worktrees/review-pr-<N> <headRefOid>`, then `pnpm install --frozen-lockfile --offline` inside it. Never symlink to, or run `pnpm` against, `/opt/ikaro-base/node_modules` (pnpm rewrites a linked `node_modules` target and broke the main checkout, TD53-S02). Never start a dev server, the compose stack or Playwright from a review (CLAUDE.md §0 local-verification gate). Keep scratch files (diffs, comment dumps, the Step 5 report) in one `mktemp -d` directory, not loose in `/tmp`. Step 6 removes both.

**Resolve the PR number now and fetch its comment/review history** — Step 3's dedupe pass and Step 5's posting reuse it:
```bash
# $ARGUMENTS PR number, or — in local-branch mode — a PR already open for the current branch
gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --repo lmmoreira/ikaro --json number,url --jq '.[0]'

# If a PR number resolved, fetch its full history now:
gh api repos/lmmoreira/ikaro/issues/<N>/comments --paginate    # prior /pr-review posts, triage replies, human declines
gh api repos/lmmoreira/ikaro/pulls/<N>/comments --paginate     # inline review comments + replies
gh api repos/lmmoreira/ikaro/pulls/<N>/reviews --paginate      # review-level verdicts
```
No PR resolves (pure local-diff mode) — Step 3's dedupe pass and Step 5's posting both skip, there's no history to check or comment on.

**Resolve the story/TD ID** — check, in order: the PR body's `## Story` section, the branch name (`feat/M0X-SYY-*`, `fix/M0X-SYY-*`, `*TDNN*`), commit messages (`(M0X-SYY)` suffix). If none resolve an ID, ask the user before continuing — acceptance-criteria verification cannot run blind (in a headless run with no one to ask, say so in the report's "Not verified" section and continue with the lenses that don't need it).

**Load the story/TD file** (`plan/M0X-*.md` or `td/TDNN-*.md`) and extract:
- The full story/TD section: description, aggregates/fields, dependencies, **Non-Goals / out-of-scope**, and the **"Resolved during story-discovery"** decisions (the locked pattern and test plan).
- The acceptance-criteria checklist verbatim: `**Acceptance criteria:**` followed by `- [ ]` bullets (stories) or `## Acceptance Criteria (TD-level)` / `## Draft Acceptance Criteria` (TDs).
- Any cited UC number → load that UC's section from `docs/USE_CASES.md` (main flow **and every alt flow**).

If the story cites a UC that CLAUDE.md §6 lists as a trap (superseded / future / out-of-MVP / renumbered), flag this immediately as a **Critical** finding before anything else — the story itself may be built against a stale spec, which invalidates the rest of the review's premise until that's resolved.

**Detect scope flags** (drives which conditional agents spawn in Step 1). Run against the changed-file list:

| Flag | Pattern in the changed-file list |
|---|---|
| `infra` | `^(infra/terraform/\|infra/docker/\|\.github/workflows/\|Dockerfile\|docker-compose)` (a nested `Dockerfile` such as `infra/docker/otel-collector/Dockerfile` needs its own path prefix — the bare alternative only matches a root-level file) |
| `web` | `^apps/web/` or `^packages/i18n/` |
| `data` | a migration file, a `*.entity.ts`/`*repository*.ts`, `ITenantLockPort`/`*ForUpdate`/`lock*`, a `DomainEvent`/`subscribe(`/`registerTrigger(`, an outbox `Command`, or a cron/scheduled job |
| `bff` | `^apps/bff/` |
| `public-surface` | a controller/route reachable by a guest or unauthenticated caller (`*.public.controller.ts`, `app/[slug]/`, lead-form, chatbot, upload endpoints) |

**Review tier — scale depth to the diff, never skip a lens silently.** Count changed lines (`--shortstat`) excluding lockfiles, generated files and snapshots:
- **docs-only / config-only** (no `.ts`/`.tsx`/`.tf`/`.yml` logic): spawn only Agent A, Agent DOC and (if `infra`) Agent E — the code lenses have nothing to read. State the tier in the report. **A diff touching `package.json`, `pnpm-lock.yaml`, `tsconfig*`, ESLint/Prettier config, `architecture-policy.json`, env files or any CI/policy JSON is never docs-only** — it changes dependencies or gates, so run at least Agent B (new-dependency and override checks) and Agent D (no-workarounds) as well.
- **standard** (under ~800 changed lines, or one bounded context/layer): the full agent set below.
- **large** (≥ ~800 changed lines, or ≥ 3 bounded contexts/layers): same agents, but **shard the code-reading lenses (B, C, D, T, and G/F if spawned) by bounded context or layer** — one instance per shard — so no agent skims. Give every shard the full story/AC text; give each only its own files' full content. Synthesis (Step 2) merges shards.

---

## Step 1 — Parallel specialist agents

Spawn all applicable agents in parallel — one message, one `Agent` call each, `subagent_type: general-purpose`. Always: **A, B, C, D, T, DOC**. Conditionally: **G** (`data`), **F** (`web`), **E** (`infra`). Give each one: the full diff, the changed-file list, the pinned head commit (PR-number mode) or working-directory state (local-branch mode), the story/TD text including Non-Goals and locked discovery decisions, the AC checklist, the cited UC flows, the scope flags, and the docs listed under its section. Instruct each to **read every changed file's current full content** (not just the hunk — a hunk alone hides whether a flagged pattern already existed before this PR) from the source pinned in Step 0.

**Each agent's checklist is a floor, not the full scope.** If investigating one item leads into a related file, a sibling workflow, a doc section not listed, or a cross-cutting CLAUDE.md invariant not spelled out below — follow it. A fixed checklist can only catch what someone already thought to write down; the highest-value findings are often the ones nobody anticipated. Depth within a lens and breadth beyond it are both in scope. Findings outside your lens are welcome — tag them with the lens they belong to.

**Every agent applies this discipline to every finding, no exceptions:**
1. Read the full surrounding context before reporting — never flag from pattern-matching a single line.
2. Cross-check against `docs/ANTI_PATTERNS.md`'s full table and any explicit "never / don't / must / forbidden / avoid" rule in `CLAUDE.md` or the docs loaded for the lens. When a finding matches a documented rule or named anti-pattern, **cite it directly** (doc + section/row) — a grounded finding beats a stylistic opinion.
3. **Verify against the primary source before asserting anything about third-party behavior or about this codebase's own current state.** A claim about a library default, a cloud API constraint or framework runtime behavior is never asserted from memory — fetch the real docs, `npm pack`/`npm view` and read the source, or run the real binary. The same applies to this codebase: a claim that a schema/data invariant "could be violated" requires grepping the actual migration/constraint first (a partial unique index or exclusion constraint can make the scenario structurally impossible); a claim that tested code is broken requires checking whether an existing test already exercises that exact scenario (a passing test beats re-reading by eye). **A Critical alleging existing, tested code is fundamentally broken carries the highest cost when wrong — it needs the highest bar: reproduce it for real (run the query, run the test), not just reason.** An unverified claim, even a plausible one, is not a finding yet (`docs/ANTI_PATTERNS.md`'s rows on unverified quota/CPU hypotheses are the cautionary tale).
4. **Once a bug/anti-pattern is confirmed at one site, sweep every structurally similar site in the same file and bounded context before finalizing — report all of them together.** Rediscovering the same defect piecemeal across review rounds is the failure this prevents (M22-S03, PR #483: a sibling instance sat on record for four rounds).
5. **Before flagging missing precision/coverage, check the story/TD's own Non-Goals/out-of-scope text first.** A gap that is a documented, deliberate scope boundary isn't a finding (M22-S03: three findings across three rounds were declined on exactly this basis).
6. Attach a suggested severity (rubric in Step 2), a one-line rationale and `file:line`.
7. If genuinely unsure whether something is a real defect vs. an intentional documented design choice, say so and suggest Minor rather than guessing Critical.
8. **Tag `needs-decision`** on any finding whose resolution is a business rule, product behavior, UX policy or architectural trade-off that the code, docs and story do not already settle — **do not guess the answer and do not pick a severity by guessing intent.** State the question, the 2–3 realistic options and their consequences. A finding is `needs-decision` only if reading the story, UC, docs and code genuinely cannot resolve it.
9. **Record what you could not verify** (a log you couldn't read, a live-cloud fact, a runtime behavior you could not reproduce, a doc you couldn't load) — it goes in the report's "Not verified" section; silence about a gap is worse than an honest gap.
10. **Record what you verified clean** in one line each (e.g. "tenant filter present on all 4 new queries") — visibility on what was checked is as valuable as what failed.
11. Do not invoke `/pre-pr`, `/bad-smell-audit`, or any other skill.

### Agent A — Requirements & Business Correctness
- Check off **every** acceptance-criteria bullet individually: Met / Not Met / Partial, each with evidence (`file:line`, or "no corresponding change found").
- Verify the cited UC's main flow **and every alt flow** are implemented — not just the happy path.
- **Business invariants for the touched context** — load the matching section of `docs/BUSINESS_LOGIC_REFERENCE.md` (booking scheduling: the `Booking — …` section) and `docs/BOUNDED_CONTEXTS.md` § Context Descriptions. Check the PR against them: Loyalty is append-only (`LoyaltyEntry`, `LoyaltyRedemption`) and points issuance/redemption must be idempotent; money is BRL with explicit rounding, never float arithmetic; no business policy is silently changed for existing tenants.
- Hunt logic bugs: wrong state transitions (cross-check CLAUDE.md §5 booking state machine; `NO_SHOW` only from `APPROVED` after the end time, manager correction only to `COMPLETED`), off-by-one, wrong error codes, inverted booleans, unhandled edges (empty list, zero, null, boundary dates/timezones — default TZ is `America/Sao_Paulo`; day boundaries computed in the tenant timezone, not the server's).
- **Customer-visible side effects:** duplicate notifications on retry/redelivery, a notification fired before the transaction commits, a status a customer can see that contradicts the stored state, a cancellation/expiry window edge case.
- **BI-readiness (CLAUDE.md §1):** new schemas/events keep `tenant_id`, `occurredAt`, stable identifiers, and no information is thrown away that a later analytics layer would need (e.g. overwriting a status instead of recording the transition).
- Hardcoded business values: any threshold/window/limit that reads like a business rule (cancellation window, expiry period, points value) must read from `tenants.settings` (cross-check `docs/TENANTS_SETTINGS_SCHEMA.md`), never a literal.
- Backward compatibility: migration expand/contract compliance (rules + pre-production exception: `docs/DEFINITION_OF_DONE.md`); event/DTO schema changes checked against existing consumers (grep `@ikaro/types`); whether the PR is safely revertible without a stuck deploy-ordering dependency (rolling deploys run old and new code side by side).
- Anything unspecified in the story/UC that the implementation had to decide (a default, a tie-break, an error message policy) → `needs-decision` unless a doc settles it.
- Docs: the loaded story/TD, `docs/USE_CASES.md` (cited UC), `docs/BUSINESS_LOGIC_REFERENCE.md`, `docs/DOMAIN_MODEL.md`, `docs/DOMAIN_EVENTS.md`, `docs/TENANTS_SETTINGS_SCHEMA.md`, `docs/DEFINITION_OF_DONE.md`, `docs/ANTI_PATTERNS.md`, `CLAUDE.md`.

### Agent B — Security, Tenant Isolation, Privacy & Abuse
Perspectives converging on the same artifact: security engineer, attacker, privacy officer.
- SQL injection / any raw string interpolation into a query; a user-supplied LIKE term must go through `escapeLikePattern()`.
- Tenant isolation (CLAUDE.md §2): every query filters `tenant_id`; composite FKs use `(tenant_id, id)`; no path to a cross-tenant read/write. Customers and staff are multi-tenant by design (rules 5–6) — check new code doesn't assume one tenant per `google_oauth_id`.
- **Within-tenant authorization (IDOR / privilege):** a customer reading or mutating another customer's booking/loyalty data inside the *same* tenant; a STAFF-role action reachable by CUSTOMER or guest; a role check done in the BFF only, with the backend trusting the forwarded header blindly where it should also verify.
- Token/JWT: `sub` is the backend entity UUID (rule 11); client-supplied actor headers never trusted where a guard should derive them; BFF tenant-mismatch rejection intact; cookie stays httpOnly.
- **Mass assignment / over-posting:** DTO or Zod schema accepting fields that must be server-derived (`tenantId`, `role`, `status`, `createdBy`, price/points); an unconstrained `z.record(...)` where a "field X never inside field Y" invariant is documented (`docs/ENGINEERING_RULES_SHARED.md` § Schema-level enforcement).
- **Public/guest surface (`public-surface` flag):** rate limiting / abuse resistance (Turnstile where required), enumeration (does the response differ for existing vs. missing resources), oversized payloads, replayed requests, and cost-amplification (the OpenRouter chatbot: input size caps, prompt-injection effect on tools/data, per-tenant spend bound — `docs/ENGINEERING_RULES_BACKEND.md` § OpenRouter chatbot).
- **File upload / storage:** type + size validation, tenant-prefixed path (`tenants/<tenant_id>/…`), no user-controlled path segment, response fields as full resolved URLs not raw paths.
- **Privacy (LGPD applies — Brazil market):** PII (name, phone, e-mail, documents) in logs, traces, span attributes, metrics labels or error messages; a new PII field with no retention/deletion/export story; PII sent to a third party (analytics, LLM provider) without need; secrets/tokens hardcoded or logged.
- **Dependencies:** a new or upgraded npm dependency — is it necessary, maintained, license-compatible, and is a transitive vulnerability fixed by upgrading the direct dependency rather than an `overrides` pin (CLAUDE.md "no workarounds"; `docs/CI_TRAPS.md` § Snyk SCA failures)?
- Idempotency & concurrency as security: event handlers dedup via `eventId`; a double-submit/replay cannot double-spend loyalty points or double-book.
- Observability on failure paths: correlation ID passed through (`event.correlationId`, never regenerated), OTel attrs (`tenant.id`, `user.id`, `correlation.id`) present, an on-call engineer could diagnose a prod failure from what's logged.
- **Tenant attribution on telemetry follows `docs/OBSERVABILITY_STRATEGY.md` § 4. Metrics, "Tenant labels" — not a blanket "every metric carries `tenant_id`".** CLAUDE.md §2 rule 8 says "logs, metrics, **and** traces", and that doc is how it is satisfied: OTel metrics such as per-route HTTP duration must **not** carry a `tenant_id` label (tenant-count-driven cardinality, no safe request-context hook) — flag a PR that adds one; tenant drill-down lives in logs and traces, so check the new code path still emits `tenant.id`/`tenantId` there; the business log-based counters **do** carry a `tenant_id` label (the business dashboard filters on it) — flag a new business counter that drops it. A new metric the doc doesn't cover → `needs-decision` (label or not), not a guess (M17-S55, PR #362: a missing tenant attribute survived two review passes).
- Attacker framing for every new/changed endpoint: forged/missing/expired token, tenant-mismatched ID, role downgrade, oversized payload, replayed request.
- Docs: `docs/TENANT_ISOLATION_STRATEGY.md`, `docs/OBSERVABILITY_STRATEGY.md`, `docs/ENGINEERING_RULES_SHARED.md` (§ Tenant access enforcement, Interceptor-vs-Middleware), `docs/ENGINEERING_RULES_BACKEND.md`, `docs/ANTI_PATTERNS.md`, CLAUDE.md §2.

### Agent C — Performance & Scalability
- N+1: a repository/DB/BFF call inside a loop that could be one batched query or one fan-out.
- Missing indexes on newly filtered/sorted columns (cross-check `docs/DATABASE_SCHEMA.md`); `tenant_id` first in every composite index; a new cross-tenant system job needs its own standalone index on its filter column (`docs/ENGINEERING_RULES_TESTING.md` § Standalone index for a cross-tenant…). For a query on a large table, prefer proving the plan with `EXPLAIN` (runnable in a review worktree) over guessing.
- Unbounded result sets / missing pagination on any new list endpoint or query; code assuming a full in-memory tenant dataset instead of paging/streaming.
- TypeORM specifics: eager relations, `find` without `select` loading wide rows, `save()` of a large child collection that wholesale-replaces (needs a dirty flag — `docs/ENGINEERING_RULES_BACKEND.md` § A wholesale-replaced child collection), per-row `save()` in a loop.
- Locks: a lock held across a slow call, locking several rows one at a time instead of one batched ordered query, a transaction doing more than it must (2s lock-wait ceiling → 503) — `docs/LOCK_CATALOG.md`.
- **Hot-path cost, against the numbers the story declared.** When the diff adds work to a hot path (a guard or interceptor, the request pipeline, a cron's per-tenant loop, an event handler, a list endpoint), check the story's Design review "Load" line against the code: the calls and queries added per request, every unbounded structure and its cap, per-instance versus shared state and its staleness, the timeout and the failure behaviour when the dependency is down (fail open or closed, deliberately), and any per-item loop that calls out. A hot-path change with no declared load and no visible cap or timeout is a finding.
- Synchronous/blocking work in a hot path (request or event handler); an event handler doing work that should be a separate async command; fan-out amplification and poison-message/redelivery behavior on Pub/Sub.
- Cloud Run: timer-driven flush/queue work on a CPU-throttled instance; cold-start cost of new module-level initialization (`docs/ENGINEERING_RULES_INFRA.md` § Cloud Run CPU throttling).
- Web/BFF (when touched): React Query key and invalidation correctness, over-fetching, a BFF fan-out that could be one backend read, Server vs Client Component boundary growth, bundle weight of a new dependency, a `generateMetadata()` duplicating the page's fetch instead of sharing it via React `cache()`.
- Object allocation or heavy computation inside loops that could be hoisted.
- Docs: `docs/DATABASE_SCHEMA.md`, `docs/LOCK_CATALOG.md`, `docs/ENGINEERING_RULES_BACKEND.md` (cross-row invariants, transactions), `docs/ENGINEERING_RULES_INFRA.md`, `docs/ANTI_PATTERNS.md`.

### Agent D — Architecture, Design Patterns & Code Quality
- SOLID / single-responsibility breaches; layering respected (`domain/` → `application/` → `infrastructure/`), no framework deps in `domain/`.
- CLAUDE.md §7's NON-NEGOTIABLE principles:
  - **No workarounds:** suppressed type errors (`as unknown as`), a pinned/overridden dependency instead of a real upgrade, a skipped/ignored CI issue, any short-term hack where a root-cause fix was available.
  - **No improvisation:** if the story/TD cited a specific reference (library, existing pattern, named example), does the implementation use it, or quietly substitute a bespoke alternative presented as equivalent.
  - **Mounting complexity:** multiple stacked safeguards/exceptions/special-cases where a structurally simpler approach — an existing port/adapter, a pattern from `docs/AGENT_PATTERNS.md` — would need none of it. Name the simpler candidate.
- **Writing-time invariants CI cannot fully catch** (CI-enforced ones are covered by `/pre-pr`; focus here on the shape CI misses): cross-service network I/O inside `txManager.run()`; the right race-condition primitive for the shape (exclusion constraint / `findByIdForUpdate()` / `pg_advisory_xact_lock`) and that a lock only orders callers who all acquire it; an event handler calling exactly one use case and rethrowing with `event.correlationId`; anything that must run for a Guard-rejected request being Express middleware not an Interceptor; protected-area layouts reading `resolveSupportedLocale(payload.locale ?? 'pt-BR')` not a hardcoded locale; an event-handler class name unique across the codebase; a lock key format unchanged where production traffic already depends on it.
- Ports & adapters: raw SQL / `@InjectRepository` / `Repository<T>` outside a repository adapter; a new cross-context Port+Adapter where `infrastructure/cross-context/` already has one for the context pair; cross-context data access priority (events → BFF orchestration → Port+Adapter last); `@Global()` modules exporting what they provide; `useClass` not `useExisting`.
- **Design quality — dependency inversion, reuse, encapsulation, maintainability** (the questions `/story-discovery` §4o2 asks up front; review the diff against them, and against the story's printed Design review block when there is one):
  - **Replaceability.** A new piece of I/O, state, time, cache, queue or external-service code must sit behind a port provided through DI. Flag a concrete infrastructure class created with `new` at module scope, module-level mutable state (a global cache or singleton variable), or a consumer typed against a concrete adapter instead of the port. For each new infrastructure piece, say what swapping it (an in-memory cache for Redis, a client for a fake) would touch; a missing seam on infrastructure is **Important**, not Minor.
  - **Duplication.** Look for identical or near-identical blocks across the diff **and against sibling code in both apps** (the same `HttpService` call, the same decorator or helper written twice). Name where the shared version should live (`packages/*` when both apps need it). Do this before SonarCloud's duplication gate does.
  - **Encapsulation and cohesion.** An exported symbol with no consumer, a public surface wider than its callers need, an adapter type in a caller's signature, a class with two reasons to change.
  - **Alternatives.** For any new abstraction, name the best alternative (reuse an existing one, a plain function, a port) and say why this one wins. If the alternative is clearly better, that is the finding.
  - **Change-cost.** For the two most likely next changes (a new feature key, a new provider, a new role), count the files each would touch; a likely change that touches the framework and several callers is a finding.
- Repository-slice placement (CLAUDE.md §11): an actor-scoped view of another domain's aggregate belongs in the *owning* slice (TD31-S11 precedent).
- Data owned by another context: does any new field on a route, DTO, event or script belong to another context's rule, and is it validated, discarded or forwarded by this one? No import crosses, so `dep-cruise` cannot see it. The fix is a reference by id to a record the owning context holds, with the caller orchestrating (`docs/ANTI_PATTERNS.md`, the row on a field whose rule belongs to another context; M25-S10 precedent).
- Stored objects: a response/mapper field returning a raw storage path instead of a URL from `IStorageService.getPublicUrl`; web code building a public storage URL (`docs/API_CONTRACTS.md` § Stored objects in responses and requests). ESLint only blocks reads of `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL` outside allowed files — a hardcoded host or the backend half needs manual review.
- Duplicate validation across layers: a Zod/DTO rule changed in BFF or backend without the sibling copy; a new interface in `apps/web/**/api/**` or `shared/types/**` shadowing `@ikaro/types`.
- Design pattern fit — flag **both** directions: over-engineering (speculative abstraction, `docs/CODE_STANDARDS.md` § Comments and abstraction discipline) and under-engineering (duplicated logic an existing pattern in the same bounded context already solves). Consistency with sibling code; naming; comment discipline (flag comments restating *what*; flag missing comments on genuinely non-obvious invariants).
- Error handling: RFC 9457 Problem Details shape, the `mapXxxError` pattern (never `throw new HttpException` from a use case), a typed domain error for shared-VO validation (not a bare `Error`), no silently swallowed exceptions, messages debuggable from.
- Value objects over primitives for domain-validated fields; `create()` vs `reconstitute()`.
- Docs: `docs/CODE_STANDARDS.md`, `docs/AGENT_PATTERNS.md`, `docs/ENGINEERING_RULES_*.md` (the split file(s) matching the touched layer), `docs/ANTI_PATTERNS.md`, `docs/REPOSITORY_STRUCTURE.md`, `docs/BFF_ARCHITECTURE.md` if BFF files are touched.

### Agent T — Test Quality & Verification Evidence
- **Was the plan delivered?** Compare the tests in the diff to the test/E2E plan locked in `/story-discovery` (the story's "Resolved during story-discovery" text): every promised unit / integration / E2E layer exists, or its absence is explained.
- Mentally mutate the implementation: would each test fail if the underlying logic broke? Flag tautological assertions, over-mocking, coverage-padding, assertions only on "was called".
- **Negative and isolation tests:** each new query/endpoint has a cross-tenant test (tenant B cannot see/modify tenant A's row), a forbidden-role test, a not-found test, and the failure-path of each documented alt flow — not only the happy path.
- Concurrency-sensitive code has a concurrent integration test (and a `docs/LOCK_CATALOG.md` § Which test proves each lock, a row for a new lock).
- Repo test rules: builders (class + `withXxx()`/`build()`, never a plain factory) with a `uuidv7()` PK default and date defaults computed from `Date.now()`; an `InMemoryXxx` double rather than `jest.fn()` for a port-typed dependency; new integration fixtures registered in `integration-global-setup.ts`; symmetric setup/teardown for fixed tenant UUIDs; no test-order dependence; no hardcoded calendar dates; "today" computed in the tenant timezone, not the runner's.
- apps/web: every new `features/**/components/**`, `shells/**/components/**`, `shared/components/**` `.tsx` ships its `.spec.tsx` in the same commit; Vitest (not Jest); pages/layouts covered by Playwright only; Playwright specs are test cases only, with flows in `apps/web/e2e/helpers/<feature>/**`; an axe check on new interactive UI; Turnstile waits on the hidden `cf-turnstile-response` input, not an iframe.
- **A new Playwright `test(` that repeats a flow an existing one already walks is Important.** Grep `apps/web/e2e` for the route and the `data-testid`s the new test asserts: when an existing test has the same login and seed, the new behaviour should be a named `test.step` of it, unless the PR body gives a reason (its own login, seed or booking; a different role as a separate subject). An assertion jsdom or an integration test could make belongs there (`docs/TESTING_STRATEGY.md` § Layer 5, "Before adding an E2E test"). The opposite also counts: a new route or flow with no E2E scenario, or an E2E test relied on in place of the unit or integration test, is a gap, so the rule is about duplicates, not about fewer tests.
- **A deleted or merged E2E test needs its cover cited.** Every assertion it made must reappear in a surviving E2E step or in a named Vitest assertion that was read and broken on purpose; without that citation it is Important, not a cleanup.
- SonarCloud duplicate-test rule (`S5976`): three-plus near-identical simple tests should be parameterized.
- Coverage ≥ 80% on changed code is a CI gate — don't re-derive it, but flag changed branches with no test at all.
- Docs: `docs/TESTING_STRATEGY.md`, `docs/ENGINEERING_RULES_TESTING.md`, `docs/ANTI_PATTERNS.md`.

### Agent DOC — Documentation, Contracts & i18n Drift
This lens owns "did the PR leave the written system consistent with the code". `/docs-audit` is a safety net for what already slipped through; **a miss here is the defect, not something the next audit will catch for free.** Run the diff-triggered rows of `docs/DEFINITION_OF_DONE.md` § Which checks a story's diff triggers — load it and decide each row from the changed-file list, rather than from memory.
- **Stale-reference sweep (both directions):**
  - *Replaces/removes:* if the PR replaces or removes a flow/mechanism (auth pattern, data-model assumption, transport layer, dead endpoint), were `docs/*.md`, other milestones' `plan/*_IMPLEMENTATION_DETAILS_*.md`, `.claude/commands/**`, `.claude/skills/**` and `scripts/**` updated for stale references?
  - *Ships a GAP:* if the PR builds a screen/flow a `journeys/<actor>/<slug>.md` marks `❓ GAP`, was that status flipped (mermaid node + Prototype table), not just `dev-notes.md`?
  - *Sibling-file structural parity:* when one flow is split across Create/Edit (or similar) sibling components, did both change consistently (`docs/DEFINITION_OF_DONE.md` § Sibling-file structural parity)?
- **Contract docs:** a new/changed endpoint → `docs/API_CONTRACTS.md`; a new/changed event → `docs/DOMAIN_EVENTS.md` (and `docs/BOUNDED_CONTEXTS.md` if the cross-context flow changed); a new/changed migration → `docs/DATABASE_SCHEMA.md`'s table (+ `docs/DOMAIN_MODEL.md` for aggregate shape); a new `tenants.settings` key → `docs/TENANTS_SETTINGS_SCHEMA.md`; a new error code → `docs/ERROR_CATALOG.md` § Code Origins; a changed algorithm/state machine → `docs/BUSINESS_LOGIC_REFERENCE.md`; a new lock → `docs/LOCK_CATALOG.md`; a new top-level `docs/*.md` → `> **When to load:**` / `> **Tags:**` header lines.
- **Shared types:** an API/event shape change is mirrored in `@ikaro/types`, and the web and BFF copies agree with the backend DTO (the duplicate-schema trap).
- **i18n completeness:** any new error code or visible UI copy has entries in **both** `packages/i18n/locales/pt-BR/` and `.../en/` (this exact gap broke CI in M17-S30); no hardcoded visible copy in a dashboard component; locale text reads as natural pt-BR, not machine-translated.
- Story/plan bookkeeping: the story's own spec reflects what was actually built if discovery decisions changed during implementation.
- Comment and doc quality: new docs follow the agent-first, token-optimised style (pointers over restated rules; no PR-number/ISO-date literals in `context.md`).
- Docs: `docs/DEFINITION_OF_DONE.md`, `docs/API_CONTRACTS.md`, `docs/DOMAIN_EVENTS.md`, `docs/DATABASE_SCHEMA.md`, `docs/ERROR_CATALOG.md`, `docs/TENANTS_SETTINGS_SCHEMA.md`, `docs/ENGINEERING_RULES_SHARED.md` (§ Adding a new error, § Authoring new i18n UI copy keys), `journeys/README.md`.

### Agent G — Data, Migrations, Concurrency & Events (spawned when the `data` flag is set)
- Migration safety: expand/contract; a `CHECK` on a live table via plain `ADD CONSTRAINT` takes `ACCESS EXCLUSIVE` (use `NOT VALID` + separate `VALIDATE`); backfill needed? — before skipping one because "no source data can exist yet", check whether the endpoint/controller already merged to `main`; privilege grants to infrastructure-created roles enforce provisioning order or reconcile convergently; migrations run in a separate CI job, never at startup; reversibility.
- Schema rules: `tenant_id UUID NOT NULL` first in every composite index; composite FKs `(tenant_id, id)`; physical schema-per-context placement per `docs/DATABASE_SCHEMA.md`; a child table with only a composite PK cannot represent "declared but empty".
- Concurrency: the primitive fits the shape (rows exist & must not overlap → exclusion constraint; a row must be read-then-written → `findByIdForUpdate()`; no row yet → `pg_advisory_xact_lock`); a manual `save()` of a detached hand-built entity does **not** enforce version safety (needs an explicit version-guarded `UPDATE … WHERE id AND tenant_id AND version`); lock order deterministic across paths (`docs/LOCK_CATALOG.md` § The order locks are taken in); every `save()` textually inside `txManager.run()`.
- Events: envelope complete (`eventId`, `tenantId`, `occurredAt`, `correlationId`, `eventName`, `eventVersion`); a new `DomainEvent` has its `<Context>AuditLogHandler` subscription line; consumers idempotent via `eventId`; at-least-once redelivery safe; schema change compatible with existing consumers; publish after commit (outbox), never inside the transaction.
- New `DomainEvent`/cron/`subscribe()` call sites need the Pub/Sub topic + subscription + DLQ bindings in both `ikaro-staging` and `ikaro-prod` (`docs/DEFINITION_OF_DONE.md` first row; `docs/ANTI_PATTERNS.md` § A domain event is drained) — if not evidenced in the PR, record it under **Not verified** rather than asserting it missing.
- Docs: `docs/DATABASE_SCHEMA.md`, `docs/DOMAIN_EVENTS.md`, `docs/LOCK_CATALOG.md`, `docs/ENGINEERING_RULES_BACKEND.md` (§ Transactions, § Migration backfills, § Choosing a race-condition primitive, § Event Handlers), `docs/ANTI_PATTERNS.md`.

### Agent F — Frontend, UX & Accessibility (spawned when the `web` flag is set)
- **Prototype/journey conformance:** compare the built screens to the validated prototype and journey for the story (`journeys/<actor>/<slug>.md`, `<actor>/prototypes/<slug>/`); a deviation is a finding or a `needs-decision`, not silently accepted.
- **UI states:** loading, empty, error, disabled/in-flight (double-submit prevented), success feedback, and long/overflowing content all handled; form errors via `FieldFeedback`/`FeedbackMessage`/`BrandedFeedbackMessage` (no hand-written `role="alert"`/`role="status"`); a field message has no role.
- **Accessibility:** semantic elements, labels bound to inputs, keyboard operability and focus management in dialogs/popovers, visible focus, color-contrast on branded surfaces, `aria-*` correctness, no information carried by color alone.
- **UI reuse:** a control built from raw HTML/Tailwind where `apps/web/shared/components/ui/` already has a primitive (calendar, date/time picker, select, popover, dialog, switch, badge, card; bare `<input type="date">`, homemade popovers/modals) — Important, not Minor (`docs/ANTI_PATTERNS.md` "hand-built from scratch" row; `docs/ENGINEERING_RULES_FRONTEND.md` § Reuse the repo's UI primitives).
- **Transport & tenancy:** web → BFF only via `bffServerFetch` / `bffPublicFetch` / `bffClient` (never a raw `fetch()` URL); `useTenant()` is the only `tenantId` source in hooks; no client-readable token.
- **Styling boundary:** no `--ba-*` variable in a dashboard/account component (the named exception: `docs/ENGINEERING_RULES_FRONTEND.md` § The `--ba-*` exception); a new full-page hotsite component paints `backgroundColor: 'var(--ba-background)'`; a component needing both SaaS and hotsite variants is two implementations.
- **Next.js structure:** `app/**/page.tsx` and `layout.tsx` stay thin (logic in `shared/lib/**` with unit tests); route-scoped chrome state lives in a provider above shell and page; a CSP allowance for a new external resource covers every page a user could soft-navigate *from*.
- **i18n:** every visible string via `useTranslations()` with keys in both locales; dates/numbers/currency formatted for `pt-BR`/BRL via the project's helpers, not ad hoc.
- Docs: `docs/DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/BFF_ARCHITECTURE.md` § Web → BFF Transport Layer, `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` if hotsite files are touched (`app/[slug]/`, `shells/hotsite/components/`, `features/platform/hotsite/`), `docs/TESTING_STRATEGY.md`, `journeys/README.md`.

### Agent E — Infrastructure, Cloud & DevOps/SRE (spawned when the `infra` flag is set)
Perspectives converging on the same artifact: security engineer, SRE, cost owner, on-call.
- IAM least-privilege: any new/changed `google_*_iam_*` binding follows `infra/terraform/README.md` § IAM binding review discipline — role scoped to the resource, not `roles/editor`/`roles/owner`; flag a broad predefined role where the workflow uses a subset of its grants (M17 CI SA permission-gap precedent).
- Secrets & sensitive data: no plaintext secret in `.tfvars`, module default or committed state; `sensitive = true` on any output/variable that should be masked (and remember it only masks terminal display — never `output` a value derived from a secret attribute); secrets from Secret Manager, never baked into an image or env literal; a `type = string` variable meant to be non-empty has a `validation` block.
- Blast radius & apply safety: a prod-affecting change goes through plan-then-approve, not unattended apply; `envs/staging` vs `envs/prod` boundary respected and parity not silently drifted by a shared-module change.
- State & backend: no local backend, no hardcoded state bucket/path duplicated elsewhere; no manual `terraform import`/`-target` workflow implied that bypasses the pipeline; separate roots/states don't exchange outputs automatically — check apply order.
- Network/ingress posture: public exposure of a resource that should be internal-only (Cloud Run ingress, firewall, public GCS bucket); Cloud Run `vpc_egress` mode vs the egress the change needs.
- Cost & right-sizing: Cloud Run min/max instances and DB tier justified by a real load reason (not copy-pasted); orphaned resources left by a refactor (`docs/COST_OPTIMIZATION_STRATEGY.md`).
- CI/CD (`.github/workflows/**`): required-status-check ordering — never add a check to branch protection before its workflow has merged and run on `main`; `zizmor`/`actionlint` (script injection via untrusted `${{ }}`, missing `permissions:`); a path-diff filter checks one commit's diff, never live state.
- **Cross-workflow ordering:** a producer→consumer relationship between two *independently-triggered* workflows (one publishes an image/artifact/digest another resolves and deploys) — is the order guaranteed (`needs:` within one workflow, `workflow_run`, or a live-state check) or merely assumed? Two workflows on the same push with disjoint `paths:` race (M17-S55, PR #362: `deploy-staging.yml` could resolve `otel-collector:latest` before the build workflow finished publishing it).
- Module design & reuse: a resource defined ad hoc where `infra/terraform/modules/` already covers it (§ Module dependency graph); a module with a passing `terraform test` is not proof a real root applies it — grep for a real `module` block; Checkov custom checks (`infra/terraform/.checkov/custom_checks`) updated for a new resource type.
- Test coverage: new/changed module has `.tftest.hcl` coverage per § Unit-test convention.
- **Live-verification gate (CLAUDE.md §9):** a PR touching Terraform/IAM/Pub/Sub/CI-CD must show evidence of the concrete live check the change implies (module referenced by a real root, IAM grant that resolves, a real `terraform plan -refresh-only`). Evidence absent from the PR body/comments → an **Important** finding "live verification not evidenced" and the verdict cannot be `APPROVE` (the review itself cannot run live cloud commands — say so under **Not verified**).
- Docs: `infra/terraform/README.md`, `infra/terraform/foundation/README.md`, `plan/M17-CLOUD-DEPLOY.md` §0–§2, `docs/DEPLOYMENT_STRATEGY.md`, `docs/GITHUB_WORKFLOWS_GUIDELINES.md`, `docs/TECH_STACK_DECISIONS.md`, `docs/ENGINEERING_RULES_INFRA.md`; vendored `.claude/skills/terraform-style-guide/` for style questions.

---

## Step 2 — Synthesis

Collect every agent's (and every shard's) raw findings in the main thread:

1. **Dedupe by claim, not by line** — merge findings about the same underlying fact even when `file:line` differs or two lenses describe it differently; combine rationales, keep the higher severity, credit every lens.
2. **Resolve severity conflicts** — when lenses disagree on severity for the same fact, the orchestrator re-reads the code and applies the rubric below; do not average.
3. **Apply the severity rubric** (agents suggest; the orchestrator enforces consistently):
   - **Critical (must fix):** unmet or partially-met acceptance criterion; any confirmed security vulnerability (SQLi, tenant-isolation bypass, within-tenant IDOR, auth/token bypass, secret exposure, PII leak); data loss/corruption risk; silently wrong business logic contradicting the cited UC; a loyalty/money correctness defect; a direct violation of a CLAUDE.md NON-NEGOTIABLE rule or a named `docs/ANTI_PATTERNS.md` entry; an infra change granting overly broad IAM, exposing a secret in plaintext, or letting a prod-affecting resource apply unreviewed.
   - **Important (should be addressed):** real performance/scalability risk under realistic load; architecture/SOLID/pattern violation with genuine maintainability cost; meaningless/tautological tests or a missing negative/isolation test for a new query or endpoint; missing/unclear error handling for a real failure mode; an accessibility or UI-state gap on a user-facing flow; contract/doc/i18n drift the DoD makes mandatory; a documented best-practice violation that isn't NON-NEGOTIABLE; infra module duplication, missing `.tftest.hcl`, unjustified cost change, or a live-verification gate not evidenced.
   - **Minor (nice to have):** naming, small duplication, style, non-blocking readability, or a finding the agent flagged as uncertain/speculative.
4. **Separate out `needs-decision` findings.** They are not assigned a Critical/Important/Minor bucket by guessing intent. They go in their own report section with the question and options (Step 4), and they drive the verdict. A finding that merely *looks* undecided but is settled by a doc, the story or code is a normal finding, not a `needs-decision`.
5. **Collect the "Not verified" and "Verified clean" lines** from every agent; dedupe them.
6. Order findings within each bucket by lens for readability.

---

## Step 3 — Validate & dedupe against this PR's own history (mandatory, every Critical/Important finding)

Run this pass over Step 2's list before anything reaches Step 4. Each `/pr-review` dispatch is a memoryless process with no visibility into earlier rounds, so nothing catches these problems unless this step goes and looks:
- **A confidently-wrong finding resurfaces after being refuted** (PR #483: a Critical about duplicate `LOCATION` backfill rows was declined as factually incorrect against a real unique index, then re-derived nine rounds later).
- **A finding repeats an already-answered one almost immediately** (PR #483: a finding declined as an M23 scope boundary was raised again, word for word, the next round).

**1. Independently re-verify every Critical/Important finding before it's finalized** — the final check, not a repeat of the agent's claimed diligence:
   - Re-read the cited `file:line` yourself in full surrounding context, not the agent's excerpt.
   - A schema/data-invariant claim → grep the actual migration/constraint yourself.
   - A broken-behavior claim in tested code → check for an existing passing test of that exact scenario; for a Critical alleging fundamentally broken code, actually reproduce it (run the query, run the test).
   - Re-confirm the cited doc/anti-pattern/rule says what the finding claims — open the section, don't trust the paraphrase.
   - A finding that doesn't survive is dropped, not downgraded to Minor "just in case."

**2. Check this PR's existing comment/review history** (from Step 0) before including anything:
   - Search for the same `file:line` or the same underlying claim — match on substance, not exact text.
   - **Already fixed** by a later commit → drop it, it's stale.
   - **Already raised and declined/answered with reasoning that still holds against the current diff** → drop it; cite the existing comment (`file:line — see <comment URL>, already addressed`). Don't blindly trust an old decline — if the code touching that fact changed since the reply, or the decline rests on an inferred convention rather than a quoted doc line or grep hit, re-verify per step 1.
   - **Already raised, still open, no reply** → don't repost; reference the open thread.
   - **Replies are not threaded.** Answers are ordinary PR-level comments from the same account, conventionally starting `**Re: <finding summary> (file:line)**`. Before calling a finding "unresolved", scan every comment posted *after* the original for a `Re:` line or the same file/symbol. If a decline's cited evidence is wrong at the current head, re-raise and quote the correct code — otherwise cite the reply and drop it.
   - **Never raised before** → keep as a new finding.
   - No PR exists (pure local-diff mode) → skip this whole step.

**3. Apply the same re-check to each `needs-decision` finding:** confirm a doc/story/UC truly doesn't settle it (grep the plan file's "Resolved during story-discovery" text and Non-Goals), and check the PR history for a prior human answer.

---

## Step 4 — Output format

```
## PR Review — <branch or PR#> — <story/TD ID>

**Reviewed by:** <Claude | Codex>, <N>-agent review (<tier>; agents: <list>; N counts shards)

### Acceptance Criteria
- [x] <AC bullet text> — Met (evidence: file:line)
- [ ] <AC bullet text> — NOT MET (gap: ...)
- [~] <AC bullet text> — Partial (evidence: ...; gap: ...)

### UC Flow Coverage
- [x] Main flow
- [ ] Alt flow A3 — not implemented (...)

---

### 🔴 Critical (must fix)
- [ ] file:line — finding (Agent X: perspective) — doc/anti-pattern ref if applicable
(none found)

### 🟡 Important (should be addressed)
- [ ] file:line — finding (Agent X: perspective)
(none found)

### 🟢 Minor (nice to have)
- [ ] file:line — finding (Agent X: perspective)
(none found)

---

### ❓ Needs a decision (human — not guessed)
- <question> — raised at file:line (Agent X) — options: (a) … → consequence; (b) … → consequence — recommendation if one is clearly better, else "no recommendation"
(none)

### ✅ Verified clean
- <one line per invariant checked and passing, e.g. "tenant_id filter present on all 4 new queries">

### ⚠️ Not verified
- <what could not be checked and why — unreadable log, live-cloud fact, unreproducible runtime behavior, missing story ID, a doc that could not be loaded>
(none)

---
Total: N critical · M important · K minor · D needs-decision
VERDICT: <APPROVE | CHANGES_REQUESTED | BLOCKED_NEEDS_DECISION> · critical=N important=M minor=K · needs-decision=D · unverified=U
```

**Verdict rule (apply in this order):**
1. `BLOCKED_NEEDS_DECISION` — D ≥ 1. Something only the human can settle is open; `/pr-land` escalates it immediately (CLAUDE.md §9 stuck condition 2) instead of attempting a fix.
2. `CHANGES_REQUESTED` — N ≥ 1 or M ≥ 1 (a Critical or Important finding survived Step 3).
3. `APPROVE` — N = 0, M = 0, D = 0. Minor findings do not block. An infra-scope PR with the live-verification gate not evidenced cannot reach here (that is an Important finding by Agent E).

`unverified=U` counts the "Not verified" bullets; it never changes the verdict by itself, but a non-zero U on an `APPROVE` must be named in the summary so the merge reviewer sees what the review could not prove. A `needs-decision` finding that is *also* a clear defect (e.g. a security hole with two possible remedies) is listed under Critical/Important for the defect, and under "Needs a decision" only for the remedy choice.

If a section has no findings print `(none found)` / `(none)`. Print the AC/UC, Verified-clean and Not-verified sections even when everything is met — visibility on what was checked is as important as what failed. A finding kept only because Step 3 found it already open and unanswered elsewhere should link the existing comment instead of restating it (`file:line — see <comment URL>, already flagged, still unresolved`).

---

## Step 5 — Post as a PR comment (mandatory)

Only skipped when there is no GitHub PR to comment on (pure local-diff mode). Otherwise posting is **mandatory, not conditional on asking** — a headless run (`codex exec`, `claude -p`, e.g. dispatched by `/pre-pr`) has no one to answer a confirmation prompt, so an ask-gate would silently produce nothing; the review must complete end-to-end on its own.

Reuse the PR number resolved in Step 0. If none resolved, skip silently.

1. Write the exact Step 4 report to a file in the scratch directory, with the 🟢 Minor section and the ✅ Verified-clean section wrapped in collapsible blocks so a long comment stays scannable (leave 🔴, 🟡, ❓ and ⚠️ expanded):
   ```
   <details>
   <summary>🟢 Minor (nice to have) — N findings</summary>

   ...minor findings...

   </details>
   ```
2. Prefix the comment with a one-line header identifying it as automated and its source, e.g. `> 🤖 Automated review via /pr-review — Codex, 7-agent review.`
3. Post with:
   ```bash
   gh pr comment <N> --repo lmmoreira/ikaro --body-file <path-to-report>
   ```
   `--body-file`, not `--body` — avoids shell-escaping corruption on a large multi-section markdown body.

Keep the `VERDICT:` line as the **last line** of the comment, outside any `<details>` block.

---

## Step 6 — Clean up (always, even if the review stopped early)

Remove what Step 0 created, and nothing else: `git worktree remove --force .claude/worktrees/review-pr-<N>` (only if one was created), `git worktree prune`, and delete the scratch directory. Confirm with `git worktree list` that no `review-pr-<N>` entry remains. A review that leaves a worktree or loose files behind is incomplete.

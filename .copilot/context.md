# Ikaro — Agent Context (canonical)

> **AGENT EDITING NOTICE:** `CLAUDE.md`, `AGENTS.md`, and `gemini.md` are all symlinks to **`.copilot/context.md`**. Always write to `.copilot/context.md` directly — never through the symlinks.

**Symlinked as:** `CLAUDE.md`, `gemini.md`, `AGENTS.md`
**Audience:** Any AI coding agent
**Rule:** Read this file first. Then use §10 to load only the docs you need.

---

## 0. Permission Protocol (non-negotiable)

**Story / TD gate — NON-NEGOTIABLE:** Before writing any code for a story or TD, run `/story-discovery M0X-SYY` first. This is the first action after entering the worktree, no exceptions. Never skip — even for "obvious" tasks.

**Doc/config gate:** Before writing or editing any `.md`, `.tf`, `.yml`, or config file: discuss → summarise → ask "May I now create/update `<path>`?" → write only after an explicit yes. Exception: once a story is approved, `.ts`/`.spec.ts` code files can be created autonomously — and so can the files a code change cannot ship without: i18n locale JSON (`packages/i18n/locales/**/*.json`, both locales in the same change), `.http` request files, test fixtures and generated-by-tool files that must be committed. Every other config-shaped file (`.tf`, `.yml`, CI workflows, `package.json`, `tsconfig`, policy/registry JSON such as `architecture-policy.json`, env files) still needs the explicit yes. Read-only ops (`Read`, `grep`, `ls`, `git status`, memory) are always free.

**Autonomous implementation chain — one authorization, not per-step asks:** Once `/story-discovery` returns READY and the user confirms proceeding to implementation, that single authorization covers the entire chain through to an open, bot-reviewed PR — commit → push → `/pre-pr` → `gh pr create` → CI-fix loop → CodeRabbit/Codex bot-fix loop. No separate "may I commit / may I push / may I run pre-pr" prompts inside that chain. Mechanics: `/implement-story` → `/pre-pr` → `/pr-land`; stuck conditions, live-check gate: §9. The **merge gate is separate and stays mandatory** — always ask before merging (§9 Step 10) — and that review must be substantive: it is now the primary point where implementation-time surprises get caught, not a formality. For doc-only changes on `main` outside a story, still ask whether to use a feature branch or commit direct.

**Pre-push validation — NON-NEGOTIABLE:** `git push` automatically runs `ci:fast`; never use `git push --no-verify` to bypass it. If a terminal/session detaches while the hook runs, its result is unknown — capture the command's log, inspect the live process, and wait for its real exit status before treating the push as complete. A detached output stream is never evidence of a failed hook and never authorization to skip validation. **In an agent session, run the push detached** (`nohup git push </dev/null >/tmp/push.log 2>&1 &`) and wait on the real process (`pgrep -f '^git push'`, or a Monitor on it): a foreground push held open by a tool call was SIGKILLed (exit 137) mid-hook twice in the M22-S04 session, leaving the commit unpushed while the hook died. Confirm with `git log origin/<branch> -1` that the remote head actually moved — an exit status alone is not proof. **Never `pkill -f <pattern>` in a session** — it can match the agent's own shell (exit 144/137); list PIDs with `pgrep`/`ss -ltnp` and kill those.

**Workspace ownership gate:** Never run root-owned or containerized installs against the mounted workspace, and never use privileged cleanup on repo files unless the user explicitly approves it. If `node_modules` ownership is broken, stop and ask before repairing it.

**Local verification gate:** Never start a dev server (backend/BFF/web) or run Playwright/Chromium to visually verify a change without asking first — the user generally runs and checks the app themselves, and these runs are expensive. Ask before spinning up the stack for verification; proceed only after an explicit yes.

---

## 1. Project Facts

| Fact | Value |
|---|---|
| **Type** | Multi-tenant SaaS — booking & loyalty platform for local service businesses (car wash is the flagship vertical) |
| **Market** | Brazil 🇧🇷 · Currency: BRL · Locale: pt-BR · Default TZ: `America/Sao_Paulo` |
| **Branch** | `main` · Trunk-Based Development · short-lived `feat/M0X-SYY-*` / `fix/*` branches |
| **Commits** | Conventional Commits: `feat(booking):`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:` |
| **Stack** | TypeScript strict · NestJS v11 backend + BFF · Next.js 16 + React 19 frontend · pnpm workspaces |
| **DB** | PostgreSQL 17 · TypeORM v1.0+ · shared-schema multi-tenancy (tenant_id-scoped rows, not schema-per-tenant; physically schema-per-context — see `docs/13-DATABASE_SCHEMA.md`) · `tenant_id` everywhere · migrations via separate CI job (never auto at startup) |
| **Event bus** | GCP Pub/Sub (prod) · emulator (local) · behind `IEventBus` port |
| **Auth** | Google OAuth 2.0 · JWT (`sub` = backend UUID, `tenantId`, `tenantSlug`, `tenantName`, `userName`, `role`, `locale`) · httpOnly cookie, not a client-readable token · BFF forwards `X-Actor-ID`/`X-Actor-Type`/`X-Actor-Role` to the backend |
| **Storage** | GCS/S3-compatible · paths: `tenants/<tenant_id>/bookings/<booking_id>/<file>` |
| **Errors** | RFC 9457 Problem Details on all non-2xx |
| **Coverage gate** | ≥ 80% on **changed code** (differential) — enforced in SonarCloud/CI |
| **Feature flags** | Env vars (`FEATURE_FLAG_XYZ=true`) — no external system for MVP |

**Business context:** Ikaro is a SaaS platform + sister **Ikaro Consulting** offering; this repo is the Platform only. Designed to grow into a BI layer over booking/loyalty data — keep that in mind when shaping schemas and events.

---

## 2. Multi-Tenancy Invariants (NEVER violate)

Any code that breaks these is a defect regardless of test coverage.

1. Every table has `tenant_id UUID NOT NULL`, indexed first in every composite index.
2. Every query filters `WHERE tenant_id = :tenantId`. No exceptions.
3. Every domain event includes `tenantId`, `eventId` (idempotency key), `occurredAt` (ISO-8601 UTC), `correlationId`.
4. Composite FKs use `(tenant_id, id)` to block cross-tenant references at DB level.
5. **Customers are multi-tenant** — same Google `sub` → multiple `Customer` rows (one per tenant). No unique on `google_oauth_id` alone.
6. **Staff can be multi-tenant** — `UNIQUE(tenant_id, google_oauth_id)`, same shape as customers. Multiple active records → issue selection token → `/select-staff-tenant`. Full invite/activate/deactivate lifecycle: `docs/06-TENANT_ISOLATION_STRATEGY.md`.
7. File paths prefixed by tenant (see Storage in §1).
8. Logs, metrics, traces include `tenant_id`. OTel span attrs: `tenant.id`, `user.id`, `correlation.id`.
9. Event consumers are idempotent (at-least-once). Dedup via `eventId`.
10. JWT contains `tenantId`/`tenantSlug`. BFF rejects mismatches.
11. JWT `sub` is always the **backend entity UUID** — `staffId` for STAFF/MANAGER, `customerId` for CUSTOMER. BFF forwards as `X-Actor-ID`/`X-Actor-Type`/`X-Actor-Role`. Guest requests carry none of these. Backend reads from `RequestContext`.

Raise a doc bug if a UC appears to violate these — do not "make it work."

---

## 3. Bounded Contexts (brief — load `docs/05-BOUNDED_CONTEXTS.md` for detail)

| Context | Type | Aggregates |
|---|---|---|
| **Booking** | Core | `Booking`, `Service`, `ScheduleClosure`, `ScheduleOpening`, `Resource` (M21) |
| **Customer** | Supporting | `Customer` (multi-tenant rows) |
| **Staff** | Supporting | `Staff` (multi-tenant rows) |
| **Loyalty** | Supporting | `LoyaltyEntry` (append-only), `LoyaltyBalance`, `LoyaltyRedemption` (append-only) |
| **Notification** | Supporting | `NotificationTemplate`, `NotificationLog` |
| **Platform** | Foundational | `Tenant`, `HotsiteConfig` |

These 5 names (`booking`, `customer`, `staff`, `loyalty`, `platform`) are also the canonical `features/` slice names in the BFF and web — see §11.

→ Aggregates, events published, cross-context communication patterns, Loyalty MVP rules: `docs/05-BOUNDED_CONTEXTS.md`

---

## 4. Event Envelope (every event)

```json
{
  "eventId": "uuid-v7",
  "tenantId": "uuid-v7",
  "occurredAt": "2026-05-11T14:23:45.123Z",
  "correlationId": "uuid-v7",
  "eventName": "BookingCompleted",
  "eventVersion": 1,
  "data": { }
}
```

→ Full payload definitions: `docs/03-DOMAIN_EVENTS.md`

---

## 5. Booking State Machine

```
PENDING        → INFO_REQUESTED | APPROVED | REJECTED | CANCELLED
INFO_REQUESTED → PENDING (customer responded) | APPROVED | REJECTED | CANCELLED
APPROVED       → COMPLETED | CANCELLED | NO_SHOW   -- NO_SHOW added by M23 Cluster 3 (UC-074, M23-S09)
COMPLETED / REJECTED / CANCELLED / NO_SHOW  (terminal; NO_SHOW → COMPLETED by manager correction only)
```

`NO_SHOW` (`docs/04-USE_CASES.md` UC-074) is reachable only from `APPROVED`, after the appointment's end time; only a manager can correct it, and only to `COMPLETED`. UC-014 and UC-015 are **superseded** by UC-021/UC-022 — do not implement.

---

## 6. Use Cases (full index + detail: `docs/04-USE_CASES.md`)

**Traps — don't implement these as written:**
- UC-014 (customer login), UC-015 (staff login) — superseded by UC-021/UC-022
- UC-017 (booking analytics) — future, out of MVP
- UC-030 today means "Admin Edits Staff Member Profile" — a different concept from an earlier draft where UC-030 covered staff deactivate/reactivate; that pair now lives at UC-029 (deactivate) / UC-031 (reactivate). Don't confuse the two when citing UC-030 — check `docs/04-USE_CASES.md`'s table first.

**Missing UCs (do not implement until documented):** Customer profile edit beyond phone-collection (UC-021 A3), audit log view, notification template management, failed-notification retry, manual admin loyalty-point redemption (`POST /v1/loyalty/redeem` exists and is implemented but has no UC — see `docs/04-USE_CASES.md` UC-016's note).

---

## 7. Engineering Rules

→ Full detail split by task type across `docs/ENGINEERING_RULES_*.md` (see §10's loading table); baseline for any code: `docs/ENGINEERING_RULES_SHARED.md` + `docs/CODE_STANDARDS.md`.

**How to edit this file:** a rule stays here only if it is (a) a non-negotiable gate, (b) CI-enforced (name + one line), or (c) a writing-time trap an agent would hit before it would think to load a doc; everything else is a `→ doc § heading` pointer. Before cutting or adding a bullet, read `docs/AGENT_CONTEXT_TRAP_SCENARIOS.md` § How to edit `context.md`.

### No workarounds — best long-term solution only (NON-NEGOTIABLE)

**Never apply workarounds, overrides, or short-term hacks when a proper fix exists.** Always fix the root cause with the best, most solid, long-term solution — even when it requires a major dependency upgrade or more work.

Examples of what this means in practice:
- A vulnerable transitive dependency → upgrade the direct dependency that pulls it in, not pin the transitive one via overrides.
- A TypeScript API change in a major version → migrate the call sites, not suppress with `as unknown as`.
- A CI gate failing due to a pre-existing issue → fix the issue in the same branch, not skip or ignore it.

If the proper fix genuinely cannot be done in the current branch (e.g. no upstream patch exists yet), say so explicitly with a rationale — never silently apply a workaround as if it were a real fix. The CI test suite is the safety net for major upgrades: trust it.

### Never improvise — use given references, ask when unsure (NON-NEGOTIABLE)

When the user gives explicit references (a library, a URL, a named example, a pattern), use them — don't invent a bespoke alternative and present it as equivalent. If tempted to improvise past what's given, stop and ask a clarifying question instead. Always prefer simple, solid solutions over workarounds or approximations.

### Mounting complexity is a signal to reconsider the approach, not a cost to accept (NON-NEGOTIABLE)

If a design keeps needing new safeguards or caveats as it's developed (e.g. "this needs a short TTL... and single-use enforcement... and encryption... and a way to derive that key..."), stop and ask whether a structurally different approach would need none of that machinery — rather than continuing to patch the one already chosen. Generate more than one candidate approach before committing to refining any single one, and prefer whichever fully satisfies the actual requirement with the least accumulated machinery, not the first plausible idea.

### Architecture
- **Layers per context:** `domain/` (zero framework deps) → `application/` (use cases, ports, DTOs) → `infrastructure/` (adapters, controllers, persistence). Shared cross-cutting → `src/shared/`.
- **Value objects:** Domain-validated fields in `src/shared/value-objects/`, never plain primitives; `create()` constructs from raw strings, `reconstitute()` skips validation. → `docs/ENGINEERING_RULES_SHARED.md` § Option A — aggregate props
- **Transactions:** every `save()` wrapped in `ITransactionManager.run()`; cross-row invariants enforced at the DB layer, not just in-transaction. → `docs/ENGINEERING_RULES_BACKEND.md` § Transactions
- **Race conditions — 3 primitives, picked by shape, not "add a lock":** DB exclusion constraint (rows exist, "no two can overlap") / `findByIdForUpdate()` row lock (a row exists, must be read-then-written consistently) / `pg_advisory_xact_lock` (no row exists yet). → `docs/ENGINEERING_RULES_BACKEND.md` § Choosing a race-condition primitive, and where its lock port should live
- **Event handlers:** `handle()` calls exactly one use case and rethrows, zero domain logic, pass `event.correlationId` into the DTO. → `docs/ENGINEERING_RULES_BACKEND.md` § Event Handlers
- **Cross-context data access (in priority order):** domain events (async, preferred) → BFF orchestration (sync reads, preferred) → Port+Adapter (last resort, same process). Grep `infrastructure/cross-context/` before adding a new port — extend existing adapters. Never a SQL JOIN across contexts.
- **Architecture policy:** `packages/architecture-check/architecture-policy.json` is the canonical registry for dependency exceptions — cross-context imports go in `contextDependencyMatrix.permittedEdges`, other reviewed detector exceptions go in `exceptions`; every entry needs an exact path, rationale, owner, review date. Never a wildcard exception. → `docs/05-BOUNDED_CONTEXTS.md` § Rule 2 — Communication via Events or BFF Only
- **Platform tenant cache:** keep tenant read caching in `CachingTenantRepository` behind `CachePort`, not in `TypeOrmTenantRepository`; invalidate best-effort, after the transaction commits. → `docs/ENGINEERING_RULES_TESTING.md` § Platform tenant cache — adapter boundary and invalidation timing

### Critical code invariants (compressed — full narrative, dates, PR numbers: the relevant `docs/ENGINEERING_RULES_*.md` split file, cited per bullet below. Items marked **CI-enforced** fail a mechanical check even if unread.)

- **Protected-area layouts** read `resolveSupportedLocale(payload.locale ?? 'pt-BR')` from the decoded JWT — never hardcode `'pt-BR'`. **CI-enforced**: ESLint `LOCALE_LITERAL_SELECTOR`. → `docs/ANTI_PATTERNS.md` § hardcodes a locale string
- **Anything that must exist for a Guard-rejected request must be Express middleware, not a NestJS Interceptor** — Interceptors never run for a Guard-rejected request. → `docs/ENGINEERING_RULES_SHARED.md` § RequestContext
- **Never put cross-service network I/O inside `txManager.run()`.** **CI-enforced**: `transactional-io` detector + ESLint `TX_MANAGER_PUBLISH_SELECTOR`/`RUN_IN_TRANSACTION_SELECTOR`. A transaction fails after a 2s lock wait (retryable 503); a spec stubbing its `EntityManager` needs a `query` stub. → `docs/ENGINEERING_RULES_BACKEND.md` § Transactions
- **A `declare global` augmenting an interface member a dependency already declares silently no-ops** under `skipLibCheck: true` — `tsc --noEmit` still passes. → `docs/ENGINEERING_RULES_BACKEND.md` § Express `Request.user` typing
- **A Server Component's `generateMetadata()` needing the same data as the page/layout body must share one fetch via React's `cache()`.** → `docs/CODE_STANDARDS.md` § shared data fetch between `generateMetadata()`
- **A field documented as "unset renders identically to today" must check whether today's behavior is an *explicit* value or an *implicit* engine default.** → `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § implicit vs. explicit CSS defaults
- **Cloud Run timer/async starvation, OTel sampler defaults, and exporter limits have each independently caused silent trace loss.** A timer-driven flush/queue on a CPU-throttled Cloud Run instance can starve (every container, sidecars included; real but low-frequency); `ParentBasedSampler` needs `remoteParentNotSampled`/`localParentNotSampled` set explicitly or it silently drops most spans (the dominant cause); `OTLPTraceExporter` needs an explicit `concurrencyLimit`; every dispatcher branch needs its own tracing span; a traces-only bootstrap's metric-reader config must match the collector's real pipeline (`metricReaders: []` is outdated). Check a root cause against the target system's own direct evidence before documenting it as confirmed. → `docs/ENGINEERING_RULES_INFRA.md` § Cloud Run CPU throttling
- **There is no `InsertQueryBuilder.onConflict()`** — use `.orUpdate(overwrite, conflictTarget, { overwriteCondition })` with real DB column names, not entity property names. → `docs/ANTI_PATTERNS.md` § InsertQueryBuilder.onConflict
- **Adding a `CHECK` constraint to an existing table with live rows via a plain `ADD CONSTRAINT` takes `ACCESS EXCLUSIVE`** — split into `ADD CONSTRAINT ... NOT VALID` + a separate `VALIDATE CONSTRAINT`. → `docs/ANTI_PATTERNS.md` § A plain `ALTER TABLE`
- **A new `DomainEvent` needs a line in its context's `<Context>AuditLogHandler`** (`subscribe(<Event>.name, …, LogDomainEventUseCase.CONSUMER_NAME)`) — that call site is what gives it a topic. **CI-enforced**: `domain-event-audit-coverage`. → `docs/ANTI_PATTERNS.md` § A domain event is drained
- **OpenRouter/undici outbound calls need:** an explicit retry config (undici excludes `POST` and connect-timeout errors from its retry defaults); awareness that a shared `AbortSignal.timeout()` caps *total* time across retries, not a fresh budget per attempt; `provider.ignore` for a specific provider caught not honoring `reasoning: { effort: 'none' }` even with `require_parameters: true`; `provider.sort: 'throughput'` over the "obvious" `'latency'` for a fixed-time-budget request; and the backend's per-attempt timeout kept safely below the BFF's own timeout for the same call. → `docs/ENGINEERING_RULES_BACKEND.md` § OpenRouter chatbot
- **A shared test builder's date-typed default (`expiresAt`, `startedAt`) must be computed relative to `Date.now()`, never a hardcoded calendar date.** → `docs/ENGINEERING_RULES_TESTING.md` § Shared test-builder date defaults
- **A new cross-tenant, unscoped system job needs its own standalone index matching its filter column** — an existing `(tenant_id, X)` composite index can't be seeked without `tenant_id` in the query. → `docs/ENGINEERING_RULES_TESTING.md` § Standalone index for a cross-tenant
- **A merge that changes a workspace package's exports needs that package rebuilt before trusting a local type-check; a worktree's `.env` can go stale relative to sibling stories merged after it was created.** → `docs/CI_TRAPS.md` § Stale local state
- **Cloudflare Turnstile's test sitekey never renders an interactive challenge iframe** — wait on the hidden `cf-turnstile-response` input's value in E2E, not an iframe selector. → `docs/CI_TRAPS.md` § Cloudflare Turnstile's test sitekey
- **A CSP allowance for a new external UI resource must be scoped to every page a user could soft-navigate *from*** — CSP is only re-read on a fresh top-level navigation. → `docs/ENGINEERING_RULES_FRONTEND.md` § CSP allowances for a new external UI resource
- **A new full-page hotsite component must explicitly paint `backgroundColor: 'var(--ba-background)'`** — `applyBranding()` never paints an actual background. → `docs/ENGINEERING_RULES_FRONTEND.md` § Hotsite full-page components
- **A documented "field X must never appear inside field Y" invariant isn't enforced unless validated at the request boundary** — especially an unconstrained `z.record(...)` schema. → `docs/ENGINEERING_RULES_SHARED.md` § Schema-level enforcement
- **Before skipping a migration's backfill because "no source data can exist yet," check whether the *endpoint/controller* has already merged to `main`** — an endpoint is a live traffic path the moment it deploys. → `docs/ENGINEERING_RULES_BACKEND.md` § Migration backfills
- **Any user-supplied search term wrapped in a `%...%` LIKE/ILIKE pattern must be escaped first** (`escapeLikePattern()`). → `docs/ANTI_PATTERNS.md` § A user-supplied search term is wrapped
- **A Cloud Run service's `vpc_egress` mode determines whether outbound calls to public destinations even reach the VPC's firewall/NAT layer.** → `docs/ENGINEERING_RULES_INFRA.md` § Cloud Run `vpc_egress` mode
- **A new `no-restricted-syntax` ESLint selector must be checked against the 3 already-documented bypass classes** before considering it complete. → `docs/ENGINEERING_RULES_SHARED.md` § `no-restricted-syntax` selectors must be checked
- **Before a blind `Write` on a file believed to be new, grep for its expected exported symbols first** — the "must Read first" safeguard only tracks files *this session* has read. → `docs/ENGINEERING_RULES_SHARED.md` § Before a blind `Write` on a file
- **Adding one new simple test can retroactively make SonarCloud's `S5976` flag a new 3+ duplicate-test group among pre-existing tests.** **CI-enforced**: SonarCloud quality gate. → `docs/ENGINEERING_RULES_TESTING.md` § SonarCloud's duplicate-test rule
- **A lock only orders callers who both acquire it** — pair it with a cache-bypassing read or a fresh re-read of in-memory state loaded before the lock. → `docs/ENGINEERING_RULES_BACKEND.md` § A lock only orders callers
- **An advisory lock's key format cannot change once it has protected real production traffic** — a rolling deploy runs old and new code side by side; a brand-new key can be namespaced freely. → `docs/ENGINEERING_RULES_BACKEND.md` § Choosing a race-condition primitive
- **A new event handler's class name must be unique across the whole codebase, not just its own context** — the Pub/Sub generator keys by bare class name. → `docs/ENGINEERING_RULES_BACKEND.md` § Event Handlers (Pub/Sub consumers)
- **When a bot review prompts extending an existing algorithm to a genuinely new dimension, re-derive the new code against every invariant already documented for that feature area.** → `docs/ENGINEERING_RULES_SHARED.md` § Re-check a same-file documented invariant
- **`architecture-check`'s `transactional-save` detector requires `save()` to be textually inside the `txManager.run()` callback**, not merely reachable through a helper. **CI-enforced.** → `docs/ENGINEERING_RULES_BACKEND.md` § `architecture-check`'s `transactional-save` detector
- **Locking several rows of the same kind together needs a single batched query with an explicit deterministic order**, not N sequential single-row locks. → `docs/ENGINEERING_RULES_BACKEND.md` § Choosing a race-condition primitive
- **A repository that wholesale-replaces a child collection on every `save()` needs a dirty flag on the aggregate** so an untouched save skips the expensive delete+reinsert. → `docs/ENGINEERING_RULES_BACKEND.md` § A wholesale-replaced child collection
- **A child table keyed only by a composite PK cannot represent "declared but empty"** — reject an empty grouping at the aggregate boundary. → `docs/ENGINEERING_RULES_BACKEND.md` § A child table with only a composite PK
- **A bot review's "doc update missing from this PR" claim only checked this PR's diff, not whether the doc is already correct on `main`.** Verify with `gh api repos/<org>/<repo>/compare/main...<sha>`. → `docs/CI_TRAPS.md` (bot doc-update-diff-scoping entry)
- **A Jest OOM kill on a host with plenty of free RAM is V8's default ~2.2GB heap ceiling, not a leak** — set `--max-old-space-size` explicitly on every entry point that can run a large suite. → `docs/ENGINEERING_RULES_TESTING.md` § Node's default V8 heap limit
- **An integration test seeding fixtures under fixed/hardcoded tenant UUIDs needs symmetric, complete setup/teardown** — CI's `TESTCONTAINERS_REUSE_ENABLE` reuses the same Postgres container across unrelated runs; an incomplete `afterAll` corrupts a later run. → `docs/ENGINEERING_RULES_TESTING.md` § An integration test seeding fixtures
- **SonarCloud's `sonar.tests`/`sonar.test.inclusions` is a separate analysis path from `sonar.sources`/`sonar.exclusions`** — excluding a directory from one doesn't exclude it from the other. → `docs/CI_TRAPS.md` § SonarCloud's `sonar.tests`/`sonar.test.inclusions`
- **An E2E test computing "today" itself must match the app's own tenant-timezone computation, not the runner's clock** — they diverge for hours daily. → `docs/ENGINEERING_RULES_TESTING.md` § An E2E test that computes "today"
- **A fixed-time-slot booking fixture on a shared/reused tenant needs a retry-on-conflict loop — or, check first, no booking at all.** → `docs/ENGINEERING_RULES_TESTING.md` § A fixed-time-slot booking fixture
- **`scrollIntoView({ block: 'start' })` on a zero-height marker element is a fragile edge case for Playwright's `toBeInViewport()`** — use `block: 'center'`. → `docs/ENGINEERING_RULES_TESTING.md` § `scrollIntoView({ block: 'start' })`
- **CI-enforced by `architecture-check` detectors not otherwise mentioned in this file:** every TypeORM UUID-PK entity's builder must default to `uuidv7()` (`entity-builder-pk-uuidv7-default`); every TypeORM entity needs a builder in `src/test/builders/<context>/` (`test-builder-coverage`); a use case's `execute()` input/output types must be named `{ClassName}Input`/`{ClassName}Result` (`use-case-input-naming`, `use-case-result-naming`) — `ClassName` includes the `UseCase` suffix (`GetFooUseCaseInput`, never `GetFooInput`); BFF response types/Zod schemas live in sibling `.types.ts`/`.schemas.ts`, not inline in the controller (`bff-controller-inline-type`); never stub a port-typed constructor param with `jest.fn()` — use an `InMemoryXxx` double (`no-jest-fn-for-repository-or-port`); VO normalization-reachability and closed-enum mirror consistency (`vo-construction-validation`, `closed-enum-registry`); this file itself is guarded (deleted gate, broken pointer, PR#/ISO-date literal, section budget, divergent `CLAUDE.md`/`AGENTS.md`/`gemini.md` symlink) (`agent-context-file`).

### BFF naming & transport

**BFF module/controller naming, mapper extraction:** full rules: `docs/24-BFF_ARCHITECTURE.md` § Module & Controller Naming Conventions.

**Web → BFF transport:** three helpers cover all calls — never write a raw `fetch()` URL outside them: `bffServerFetch` (authenticated server-only), `bffPublicFetch` (unauthenticated server-only), `bffClient` (axios, client-only, React Query hooks). `useTenant()` is the only source of `tenantId` in hooks. Full signatures, import paths, and the same-origin gateway mechanics: `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer.

### Cross-layer deployment invariants

- **Separate Terraform roots and states do not exchange outputs automatically** — Foundation/environment sequencing is a recurring source of apply-order failures. → `infra/terraform/README.md`
- **A Terraform module with its own passing `terraform test` suite is not proof it's actually applied by any real root** — grep for a real `module` block first. → `infra/terraform/README.md` § Gotchas (dead-module / 3-places-IAM precedent)
- **A manual diagnostic Cloud Run deploy can silently pin a service's traffic policy to one revision** — check `spec.traffic` for `latestRevision: true` after any manual operation. → `infra/terraform/README.md` § Gotchas (traffic-pin precedent)
- **A CI gate built on a path-diff filter checks a static fact about one commit's diff, never live state — `gh run rerun` cannot clear it.** Verify against a system reflecting current reality instead. → `docs/CI_TRAPS.md` (path-diff CI gate row)
- **Migrations that grant privileges to infrastructure-created database roles must enforce provisioning order or provide convergent reconciliation.** → `docs/ENGINEERING_RULES_BACKEND.md` § Migration-driven privilege grants to infrastructure-created roles
- **Security dependency overrides are temporary compatibility boundaries, not permanent pins.** → `docs/CI_TRAPS.md` § Snyk SCA failures
- **A Dependabot Docker base-image digest bump must be verified to stay within the same image variant/family before merging** — a digest-only pin gives Dependabot no tag to anchor to. → `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` § Docker base-image digest pinning
- **The autonomous implementation chain must not treat "tests pass, lint clean, bots clean" as sufficient for a story touching Terraform/IAM/Pub/Sub/CI-CD** — run the concrete live check the change implies (a module wired into a real root, an IAM grant that actually resolves, a real `terraform plan -refresh-only`) before presenting the PR as merge-ready; a failed or un-runnable check is its own stuck condition (3 separate M19 stories broke on live deploy despite clean bot review — none were spec-ambiguity or code-reading failures). *(§9's own live-verification gate cites this bullet as its "why" — kept substantive on purpose, not further compressed.)*
- **A Terraform `type = string` variable with no `default` does not reject an empty string** — only an explicit `validation` block fails closed. → `infra/terraform/README.md` § Gotchas (empty-string var precedent)
- **When a bot review flags "this PR deletes/removes X" and X should obviously still exist, check whether the branch is simply stale relative to `main`** (`git merge origin/main`, never rebase). → `docs/CI_TRAPS.md` (stale-branch / shallow-clone entry)
- **Before adding any Terraform `output` block, check whether its value derives from a secret/sensitive-marked resource attribute** — `sensitive = true` only masks terminal display. → `infra/terraform/README.md` § Public-repository security

### Web styling boundary

*(`--ba-*` dashboard/hotsite boundary already covered in §8's anti-patterns excerpt below — not restated here.)*
- If a new component needs both SaaS and hotsite variants, build separate implementations rather than one component reading both branding systems.
- **Before writing a UI control (calendar, picker, select, dialog, switch), `ls apps/web/shared/components/ui/` and reuse it — never hand-roll.** → `docs/ENGINEERING_RULES_FRONTEND.md` § Reuse the repo's UI primitives
- Route-scoped chrome state visible in a shell header/topbar lives in a provider above both shell and page — never shell-local state or effect-based sync (`docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`).
- If Sonar flags a UI smell that seems to change behavior, reproduce it in the browser before applying the suggested refactor — static analysis identifies a smell, not the runtime cause.

### Testing

**Backend + BFF:** Unit (`.spec.ts`) · Integration (`.integration.spec.ts`) · E2E (Playwright). Builders (class + `withXxx()`/`build()`, never a plain factory), the `integration-global-setup.ts` registration requirement, and the `useClass`-not-`useExisting` root cause are all fully detailed in `docs/08-TESTING_STRATEGY.md` — don't restate them here.
- If an E2E/Playwright workflow fails before the browser step starts, inspect migrations, seeds, and service bootstrap first. A red "Playwright" job is often a backend DB bootstrap failure, not a frontend/browser regression.

- **apps/web:** Vitest (not Jest) — config at `apps/web/vitest.config.ts`.
- `shared/lib/**`: `node` env · `features/**/components/**`, `shells/**/components/**`, `shared/components/**`: `jsdom` + `@testing-library/react` · pages/layouts: Playwright E2E only.
- Keep `app/**/page.tsx` and `app/**/layout.tsx` thin — extract reusable logic to `apps/web/shared/lib/**` and unit-test it there.
- **Every new `features/**/components/**/*.tsx`, `shells/**/components/**/*.tsx`, or `shared/components/**/*.tsx` must ship its `.spec.tsx` in the same commit** (`/implement-story` Step 1 restates this at the point it applies — one rule, not two).
- **Every new dashboard UI component must be localization-ready from the start.** No hardcoded visible copy — wire `useTranslations()` and add locale keys in both `pt-BR` and `en` in the same change.
- Playwright specs are test cases only; reusable flows/helpers live in `apps/web/e2e/helpers/<feature>/**`. → Vitest config, mocks, axe testing, E2E helper/dev-login conventions: `docs/08-TESTING_STRATEGY.md`

### CI gates (block merge)
ESLint + Prettier · `tsc --noEmit` · all tests · coverage ≥ 80% on changed code · SonarCloud GREEN · Gitleaks · Trivy · Checkov

**Snyk SCA moved off the per-PR gate to a weekly scheduled scan** — no longer a required check on `main`; a deliberate, budget-driven tradeoff, not an oversight. → `docs/CI_TRAPS.md` § Snyk SCA failures

When SonarCloud is failing, treat the live issue list/quality gate as the only source of truth — never fix from stale logs or guess from the diff (see `docs/ANTI_PATTERNS.md`'s SonarCloud row for the exact discipline and how to verify a fix actually moved the metric).

### Definition of Done
Full checklist (coverage, migration pre-production exception, stale-reference sweep, all with precedents): `docs/DEFINITION_OF_DONE.md`. Checked before `/pre-pr` runs (§9 Steps 3–9).

---

## 8. Anti-Patterns (BLOCK MERGE)

Full list (narrower single-incident precedents included) in `docs/ANTI_PATTERNS.md` (loaded automatically by `/pre-pr`). The 11 below are the highest-severity/most-universal — architecturally broad, still-relevant, likely to be hit *while writing code*, before `/pre-pr` ever loads the full list.

| Pattern | Fix |
|---|---|
| `useExisting` when registering adapter token | Use `useClass` — `useExisting` still instantiates the class even when the token is overridden in tests. **CI-enforced**: `di-alias` detector |
| New cross-context Port+Adapter when one already exists for the same context pair | Grep `infrastructure/cross-context/` first; add a method to the existing adapter instead |
| Shared VO `create()` throws plain `Error` for validation it owns | Give VO a typed domain error; add `instanceof` branch to every calling `mapXxxError`. **CI-enforced**: `vo-bare-error` detector |
| New interface in `apps/web/features/**/api/**`, `apps/web/shared/lib/api/**`, or `apps/web/shared/types/**` without checking `@ikaro/types` | Grep `@ikaro/types` first — either side may be stale; verify against live BFF schema if shapes differ. **CI-enforced** by `packages/architecture-check`'s `ikaro-types-drift` detector — full-codebase, every PR, not diff-scoped |
| Inline mapper functions accumulating in a BFF `*.controller.ts` | Extract to `<module>.mapper.ts` (plain functions, not a class) once a second mapper appears |
| Duplicate read endpoints/use cases for projections of the same aggregate/config | Keep one canonical read endpoint/use case; derive caller-specific values in the BFF mapper or web helper |
| Dashboard or account component uses a `--ba-*` CSS variable | `--ba-*` only exists under `app/[slug]/` (hotsite tree). Use Tailwind + shadcn in dashboard/account shells |
| Fixed a Zod/DTO validation rule in one layer (BFF or backend) without checking the other for a duplicate schema | Grep the field name in both layers — BFF and backend often maintain independent copies of the same schema |
| A non-repository class (service, publisher, handler) contains raw SQL, `@InjectRepository`, or TypeORM `Repository<T>` directly | Extract `IXxxRepository` (`shared/ports/` for cross-cutting, `<ctx>/application/ports/` for a bounded context) + `TypeOrmXxxRepository` adapter; the class depends on the port only — see `docs/AGENT_PATTERNS.md` Pattern #1 |
| A module is marked `@Global()` (or re-marked when a token gains new consumers) without adding that token to `exports:` | `@Global()` only waives the *importing* module's need for an `imports:` entry — it never substitutes for `exports:`. A provider left out of `exports:` stays unresolvable everywhere. **CI-enforced**: `di-alias` detector |
| New error code added to `@ikaro/types` without a translation entry in both locale files | Add the entry to both `packages/i18n/locales/pt-BR/errors.json` and `.../en/errors.json` in the same commit — **CI-enforced**: `apps/web`'s exhaustiveness test (TD23 Story 17) fails CI on a missing one |

---

## 9. Story Implementation Workflow (mandatory — every story)

> ❗ **PR GATE — NON-NEGOTIABLE**
> **`gh pr create` is FORBIDDEN until `/pre-pr` is complete.**
> 1. `git push` → `ci:fast` runs (unit only — not sufficient alone)
> 2. `/pre-pr` → script, agent checks, bad-smell-audit, integration tests
> 3. Only after `/pre-pr` clears → `gh pr create`

**Before the first story of a new milestone:** offer to run `/docs-audit M0X` first.

### Step 0 — Run story discovery (BEFORE any code)
Run `/story-discovery M0X-SYY` — wait for READY verdict before proceeding. Never skip for any story or TD. Discovery is the one deep, front-loaded decision point: it locks in the architectural pattern, a concrete test/e2e coverage plan and every business-rule ambiguity with the user (`story-discovery.md` § Pattern & test-strategy lock-in), rewrites the story's own spec, commits + pushes that update, and sets up the worktree or branch. Its READY verdict is the single authorization for everything through Step 9 (§0).

### Steps 1–2 — Branch and implement: `/implement-story`
Never code on `main`. Discovery ends by invoking `/implement-story` (`.claude/commands/implement-story.md`), which verifies the branch, runs the worktree hygiene checks (shallow clone, gitignored env files), implements per the story spec and the pattern and test plan locked in discovery, self-verifies, commits, pushes and hands off to `/pre-pr`.

### Steps 3–9 — Autonomous chain (no per-step confirmation)
Once implementation is self-verified locally (type-check, lint, tests all clean), the rest runs without asking again: commit (stage specific files, never `git add -A`; **Codex adds `Co-Authored-By: Codex <noreply@openai.com>` explicitly — not optional**) → push (§0: detached, `ci:fast` runs) → `/pre-pr` (script, agent checks, bad-smell-audit, integration tests; fix and re-run until zero issues) → `gh pr create` only after it clears → `/pr-land` (CI, SonarCloud and bot-review loop, Codex re-dispatched only for each code-changing round). Mechanics live in `/implement-story`, `/pre-pr` and `/pr-land`.

**Infra-touching stories — live-verification gate:** if this story touches Terraform, IAM, Pub/Sub, or CI/CD, run the concrete live check the change implies (a module referenced by a real `module` block, an IAM grant that actually resolves, a real `terraform plan -refresh-only`) **before** presenting the PR as ready for the human merge review — see §7's Cross-layer deployment invariants for why "tests pass, bots clean" isn't sufficient for this category. A failed or un-runnable check is its own stuck condition.

**If the branch conflicts with `main` after it's already been pushed and reviewed:** merge, never rebase — full rule + fix: `docs/CI_TRAPS.md` § A compile/test failure only exists in CI, and won't reproduce even in a clean clone.

**Stuck conditions — escalate to the user, never force through:**
1. A CI/test failure that doesn't resolve within a reasonable number of genuine fix attempts, or whose only apparent fix would be a workaround the "no workarounds" rule (§7) forbids.
2. A bot finding whose relevance can't be confidently determined either way (`/pr-land` Step 3 item 7), or one that needs a business/design decision (item 6) — the latter escalates immediately, not gated on round count.
3. A failed or un-runnable live-verification check on an infra-touching story (the gate above).
4. `/pr-land` reaches round 5 with Codex still reporting ≥1 unresolved Critical or Important finding (Minor-only doesn't count). Describe what's recurring across rounds and what's been tried — don't attempt a 6th round unprompted.

When stuck, stop and describe the specific blocker — don't keep iterating to force a green check, and don't silently drop the finding either.

### Step 10 — Ask user before merging
This is now the primary point where implementation-time surprises get caught, not a formality — treat it as a substantive read of the actual diff.

**Before asking, confirm mergeability directly** — a green Codex/CI/SonarCloud-issues read is not sufficient on its own. Run `gh pr view <PR-number> --repo lmmoreira/ikaro --json mergeStateStatus,mergeable` and only ask once `mergeStateStatus` is `CLEAN` (`/pr-land` runs this check before reporting merge-ready). → `docs/CI_TRAPS.md` § A green Codex/CI/SonarCloud-issues read is not sufficient proof a PR can merge

Ask: *"All checks are green on PR #N — happy to merge?"* Then:
`gh pr merge <PR-number> --repo lmmoreira/ikaro --squash --delete-branch && git checkout main && git pull origin main && git branch -D <branch-name>`

Always delete the local branch with `-D` (not `-d` — squash merges aren't recognized as fully merged).

### Step 11 — Mark done
`/mark-done M0X-SYY` (or `TDNN-SYY` for a TD story) after the merge — the last-mile check, not just bookkeeping: it re-verifies AC evidence and that every Critical/Important finding on the merged PR was resolved, opens a bug-fix TD via `/create-td` for any real gap, then updates the plan file and commits to main. **If a worktree was used, `/mark-done` cleans it up immediately — no need to ask** (remove it, `-D` the local branch, prune the remote-tracking ref, verify with `git worktree list`).

### Step 12 — Milestone complete?
If all stories are `✅ Done`: `/mark-done`'s milestone block creates `plan/MXX-<NAME>_IMPLEMENTATION_DETAILS_IA.md` + `_DEVELOPER.md`, adds the IA file to §10, and runs the stale-documentation sweep.

### Parallel batch execution (optional)

For a milestone with many independent stories, `/run-batch` runs a small batch (default 2, cap 5) of non-overlapping stories concurrently instead of one at a time — stricter than a milestone "wave." Full mechanics: `.claude/commands/run-batch.md`.

---

## 10. Dynamic Context Loading — Load Only What You Need

A doc with a `§` or "only" is read at that section (`grep -n '^## ' <doc>` for the outline); one with neither is read whole, its size shown when over 10 KB.

| Task | Docs to load |
|---|---|
| Writing any code | `docs/CODE_STANDARDS.md` (19 KB) + `docs/AGENT_PATTERNS.md` (43 KB) + `docs/ENGINEERING_RULES_SHARED.md` (37 KB) — read whole: the general rules for any code |
| Finishing a story / before PR | `docs/DEFINITION_OF_DONE.md` (15 KB) |
| CI failure / pre-PR | `docs/CI_TRAPS.md` (100 KB) — the failing tool's own section only: `grep -n '^## ' docs/CI_TRAPS.md` |
| Implement a UC | `docs/04-USE_CASES.md` (250 KB) — the UC's own section only: `grep -n 'UC-0NN'` + `docs/02-DOMAIN_MODEL.md` § Aggregates, Entities, and Value Objects (the aggregate's subsection) + `docs/03-DOMAIN_EVENTS.md` § Event Categories (the event's entry) |
| Complex/cross-cutting business logic (algorithm/state machine/formula spanning multiple UCs or aggregates); booking scheduling: resources, window, recurrence, worklist, alerts, no-show (M21–M23) | `docs/27-BUSINESS_LOGIC_REFERENCE.md` (104 KB) — its bounded-context section only (booking: the matching `Booking — …` section, + DB/migration, UC rows) before re-deriving from scattered prose (see also `/story-discovery` 4r, `/mark-done` Step 4) |
| Database / migration; a lock, a deadlock or a hung request | `docs/13-DATABASE_SCHEMA.md` § Global Standards + the context's `Schema:` section (`grep -n '^## Schema'`) + `docs/02-DOMAIN_MODEL.md` § Aggregates, Entities, and Value Objects + `docs/ENGINEERING_RULES_BACKEND.md` § Transactions (a migration: also § Migration backfills); locks: `docs/28-LOCK_CATALOG.md` § The order locks are taken in (every lock, its order, its business case) |
| API endpoint | `docs/14-API_CONTRACTS.md` § Base Standards + the resource's own numbered section (`grep -n '^## ' docs/14-API_CONTRACTS.md`; 157 KB) + the cited UC |
| Event handler | `docs/03-DOMAIN_EVENTS.md` § Event Publishing & Consumption (the event's entry: `grep -n '<EventName>'`) + `docs/05-BOUNDED_CONTEXTS.md` § Communication Patterns + `docs/ENGINEERING_RULES_BACKEND.md` § Event Handlers |
| Staff OAuth login / invite link | `docs/ENGINEERING_RULES_BACKEND.md` § Staff OAuth login URL format |
| New notification type | `docs/ENGINEERING_RULES_BACKEND.md` § Adding a new notification type |
| New error code (`@ikaro/types`) | `docs/ENGINEERING_RULES_SHARED.md` § Adding a new error — checklist (step 2: translation entry in **both** locale files, or CI's exhaustiveness test fails) + `docs/25-ERROR_CATALOG.md` § Code Origins (where each code originates) |
| New UI copy / locale key | `docs/ENGINEERING_RULES_SHARED.md` § Authoring new i18n UI copy keys + `docs/CODE_STANDARDS.md` (19 KB) |
| Hotsite / public frontend | `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` (58 KB) — the task's numbered section only: `grep -n '^## ' docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` (a new module: § Adding a New Module) + `docs/14-API_CONTRACTS.md` § Tenant Hotsite Manifest + `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` (25 KB) + `docs/ENGINEERING_RULES_FRONTEND.md` (20 KB) |
| Dashboard / admin frontend | `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` (25 KB) + `docs/14-API_CONTRACTS.md` § Base Standards + the resource's numbered section + `docs/ENGINEERING_RULES_FRONTEND.md` (20 KB) |
| BFF implementation | `docs/24-BFF_ARCHITECTURE.md` (48 KB) — the task's own section only (a new controller: § Module & Controller Naming Conventions) + `docs/14-API_CONTRACTS.md` § Base Standards + the resource's numbered section + `docs/ENGINEERING_RULES_BACKEND.md` § Backend read use cases for cross-context access (also § Express `Request.user` typing) |
| Web → BFF transport | `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer |
| Architecture question; repo layout / new file location | `docs/11-ARCHITECTURE.md` (11 KB) + `docs/05-BOUNDED_CONTEXTS.md` § Context Descriptions (the context concerned) + `docs/REPOSITORY_STRUCTURE.md` § Web target structure (or the Backend / BFF one); §11 below has the quick summary |
| Multi-tenancy / isolation | `docs/06-TENANT_ISOLATION_STRATEGY.md` (14 KB) |
| Testing patterns | `docs/08-TESTING_STRATEGY.md` § Mandatory Patterns (+ the layer's section) + `docs/ENGINEERING_RULES_TESTING.md` (39 KB, independent traps: read whole) |
| apps/web test infrastructure | `docs/08-TESTING_STRATEGY.md` § apps/web Testing Infrastructure |
| Value objects / mappers | `docs/VALUE_OBJECTS_REFERENCE.md` + `docs/ENGINEERING_RULES_SHARED.md` (37 KB) |
| CI / pipelines | `docs/09-CI_CD_PIPELINE.md` + `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` (19 KB) |
| Deployment / infra | `docs/12-DEPLOYMENT_STRATEGY.md` + `docs/22-TECH_STACK_DECISIONS.md` (44 KB) — the decision's numbered section only: `grep -n '^## [0-9]' docs/22-TECH_STACK_DECISIONS.md` + `docs/ENGINEERING_RULES_INFRA.md` (29 KB) |
| Writing Terraform / infra code | vendored HashiCorp Terraform skills (`.claude/skills/`) + `plan/M17-CLOUD-DEPLOY.md` §0–§2 (299 KB doc: those sections only) + `infra/terraform/README.md` § Layout (60 KB; a new resource: § New-resource PR-sequencing playbook; IAM: § IAM binding review discipline) + `docs/ENGINEERING_RULES_INFRA.md` (29 KB) |
| Foundation / IAM ownership | `infra/terraform/foundation/README.md` + `infra/terraform/README.md` § IAM binding review discipline, before editing Terraform or workflows |
| Observability | `docs/10-OBSERVABILITY_STRATEGY.md` § Where a change belongs (then the section it names) + `docs/ENGINEERING_RULES_INFRA.md` § Cloud Run CPU throttling |
| Production incident, rollback or release path | `docs/RUNBOOKS.md` (17 KB) — the procedure's own section only (Rollback, Staging, Pub/Sub and scheduled jobs) + `docs/18-RELEASE_LIFECYCLE_OPERATIONS.md` (7 KB) |
| Reading, adding or validating a `tenants.settings` key | `docs/21-TENANTS_SETTINGS_SCHEMA.md` § Settings by Category (the key's own entry; 37 KB) |
| Implementing a milestone story | Load `plan/<M0X>-<NAME>_IMPLEMENTATION_DETAILS_IA.md` for that milestone (`ls plan/*_IMPLEMENTATION_DETAILS_IA.md`). Special case: `plan/M115-PRODUCTION-READINESS_IMPLEMENTATION_DETAILS_IA.md` |
| Multivertical scheduling: `Resource` aggregate (M21); `Service.resourceRequirements`/`legs`/`bookingModel`/booking-policy/intake-schema, `resource_occupancy` exclusivity engine, day grid (M22); recurring reservations, availability alerts, future-commitment worklist, no-show, booking window, full booking detail (M23) | `plan/M21-MULTIVERTICAL-FOUNDATION_IMPLEMENTATION_DETAILS_IA.md` · `plan/M22-MULTIVERTICAL-SERVICE-AVAILABILITY_IMPLEMENTATION_DETAILS_IA.md` · `plan/M23-MULTIVERTICAL-APPOINTMENT-BOOKING_IMPLEMENTATION_DETAILS_IA.md` |
| New journey or prototype | `journeys/README.md` |
| Starting a new discovery from an idea | `/create-discovery` |
| Promoting a `docs/discovery/` doc into a milestone | `/discovery-to-milestone` |
| Creating a brand-new TD | `/create-td` |
| Appending one story to an existing TD or milestone (a live bug, a freshly spotted gap — no discovery doc, no new-container ceremony) | `/create-story` |
| Drafting or parsing any story (TD or milestone) | `docs/STORY_SCHEMA.md` — canonical field set; `/create-td`, `/create-story`, `/discovery-to-milestone`, `/story-discovery`, `/run-batch` all reference it, none restate it |
| Anything not listed above (infra setup, data retention, business context, cost) | `pnpm --filter @ikaro/architecture-check docs-for --file <path>` (or `--tag <tag>`) lists the docs for a file or tag; read a doc's `When to load` line before the rest |

**Anti-patterns reference:** `docs/ANTI_PATTERNS.md` — full table; loaded automatically by `/pre-pr`.
**Never load:** `archive/` (superseded) · `plan/*_DEVELOPER.md` (written for humans, not agents).

**Drafting a new milestone:** Consolidate into the single canonical `plan/M0X-<NAME>.md` before any story starts. Sequence backend/BFF-only stories in an early wave before any frontend story that depends on them.

---

## 11. Repository Layout — Domain-Slice Architecture

Full trees: `docs/REPOSITORY_STRUCTURE.md` · Rationale: `docs/11-ARCHITECTURE.md` · BFF detail: `docs/24-BFF_ARCHITECTURE.md`. This is the live architecture, not a future plan.

Three slice types, consistent across all three apps:
- **Domain slices** (business capability, mirrors backend bounded contexts): `booking`, `customer`, `staff`, `loyalty`, `platform`
- **Shell slices** (web only — route composition, zero business policy; `app/` holds Next.js routes/layouts only, kept thin): `dashboard`, `hotsite`
- **Technical slices** (not bounded contexts — never treat as domains): `auth`, `uploads`

| App | Domain slice shape |
|---|---|
| Backend | `contexts/<domain>/{domain,application,infrastructure}/` |
| BFF | `features/<domain>/<domain>.controller.ts` + `<domain>.public.controller.ts` + `<domain>.mapper.ts` + `<domain>.types.ts` (flat — no `presentation/application/infrastructure` subfolders) |
| Web | `features/<domain>/{api,components,hooks,model,utils}/` |

- `schedule`/`services` live inside `booking`; `hotsite`-specific logic lives inside `platform` — never a standalone top-level domain.
- `shared/` (any app) is cross-cutting only — a helper used by exactly one domain belongs in that domain's slice, not in `shared/`.
- **Actor-scoped view of another domain's aggregate** (e.g. a Customer reading/mutating their own Booking or Loyalty data): fetchers and domain logic live in the *owning* domain's slice (`booking`/`loyalty`), never the actor's (`customer`); scope export names to the actor (e.g. `cancelBookingAsCustomer`). The `my-account` pages stay together in `features/customer/components/my-account/`. → `docs/REPOSITORY_STRUCTURE.md` § Web placement rules
- Test helpers: `apps/backend/src/test/utils/` + `src/test/infrastructure/`.

---

## 12. Open Decisions (stop and ask before implementing)

1. **Multi-location (post-MVP):** Multiple locations per tenant = separate tenants or sub-tenant model?

---

## 13. Self-Check Before Submitting

1. `/story-discovery M0X-SYY` ran and returned READY — first action, no exceptions (§9 Step 0)
2. Feature branch created before any code (§9 Steps 1–2, `/implement-story`)
3. One authorization (the READY verdict) covers commit → push → `/pre-pr` → PR → CI-fix → bot-fix (§0); the merge ask (§9 Step 10) is separate and mandatory
4. `/pre-pr` cleared before `gh pr create`; any stuck condition was escalated, not forced through (§9 Steps 3–9)
5. Milestone complete? §9 Step 12

---

## 15. Journey & Prototype Workflow Rules

> ❗ **HARD STOP — READ BEFORE TOUCHING ANY `journeys/` FILE**
> `/docs-audit` MUST run and report a clean baseline first. Then: (1) write `<actor>/<slug>.md`, (2) update `<actor>/use-cases.md`, (3) update `journeys/README.md`'s index, (4) **only then** create files under `<actor>/prototypes/<slug>/`.

**Scope of the hard stop:** it covers *creating or restructuring* journeys and prototypes. A one-sentence factual sync of an existing `journeys/**` file (e.g. correcting a `dev-notes.md` line after the implementation changed) needs only the normal doc-gate yes — no `/docs-audit` baseline.

Full rules, folder structure, and CSS gotchas (`.topbar-avatar`, `.week-nav`, `padding-bottom`, floating toast, etc.): `journeys/README.md` — load whenever working on any journey file or prototype folder.

---

## 17. Project Skills & Commands Registry

Pinned Terraform skills live in `.claude/skills/`; refresh them by re-vendoring from upstream and updating each `VENDORED_FROM.md`.

### Vendored skills

| Skill | Path |
|---|---|
| `terraform-style-guide` | `.claude/skills/terraform-style-guide/` |
| `terraform-test` | `.claude/skills/terraform-test/` |
| `terraform-search-import` | `.claude/skills/terraform-search-import/` |
| `refactor-module` | `.claude/skills/refactor-module/` |
| `terraform-stacks` | `.claude/skills/terraform-stacks/` |
| `skill-creator` | `.claude/skills/skill-creator/` |

### Command files

| Command | File |
|---|---|
| `/bad-smell-audit [backend\|bff\|web]` | `.claude/commands/bad-smell-audit.md` |
| `/create-discovery <idea \| brief \| slug>` | `.claude/commands/create-discovery.md` |
| `/create-story <M0X \| TDNN + description>` | `.claude/commands/create-story.md` |
| `/create-td <problem description>` | `.claude/commands/create-td.md` |
| `/discovery-to-milestone <discovery-doc-path>` | `.claude/commands/discovery-to-milestone.md` |
| `/docs-audit [UC\|M0X\|TDNN\|path\|changed]` | `.claude/commands/docs-audit.md` |
| `/grill-me` | `.claude/commands/grill-me.md` |
| `/implement-story M0X-SYY` | `.claude/commands/implement-story.md` |
| `/mark-done <story-id>` | `.claude/commands/mark-done.md` |
| `/pre-pr` | `.claude/commands/pre-pr.md` |
| `/pr-land [PR#]` | `.claude/commands/pr-land.md` |
| `/pr-review [PR#]` | `.claude/commands/pr-review.md` |
| `/run-batch [M0X \| M0X-SYY/TDNN ...]` | `.claude/commands/run-batch.md` |
| `/story-discovery M0X-SYY` | `.claude/commands/story-discovery.md` |

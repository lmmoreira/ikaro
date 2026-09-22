# Ikaro — Agent Context (canonical)

> **AGENT EDITING NOTICE:** `CLAUDE.md`, `claude.md`, `AGENTS.md`, and `gemini.md` are all symlinks to **`.copilot/context.md`**. Always write to `.copilot/context.md` directly — never through the symlinks.

**Symlinked as:** `CLAUDE.md`, `gemini.md`, `AGENTS.md`
**Audience:** Any AI coding agent
**Rule:** Read this file first. Then use §10 to load only the docs you need.
**Last updated:** 2026-09-20

---

## 0. Permission Protocol (non-negotiable)

**Story / TD gate — NON-NEGOTIABLE:** Before writing any code for a story or TD, run `/story-discovery M0X-SYY` first. This is the first action after entering the worktree, no exceptions. Never skip — even for "obvious" tasks.

**Doc/config gate:** Before writing or editing any `.md`, `.tf`, `.yml`, or config file: discuss → summarise → ask "May I now create/update `<path>`?" → write only after an explicit yes. Exception: once a story is approved, `.ts`/`.spec.ts` code files can be created autonomously — and so can the files a code change cannot ship without: i18n locale JSON (`packages/i18n/locales/**/*.json`, both locales in the same change), `.http` request files, test fixtures and generated-by-tool files that must be committed. Every other config-shaped file (`.tf`, `.yml`, CI workflows, `package.json`, `tsconfig`, policy/registry JSON such as `architecture-policy.json`, env files) still needs the explicit yes. Read-only ops (`Read`, `grep`, `ls`, `git status`, memory) are always free.

**Autonomous implementation chain — one authorization, not per-step asks:** Once `/story-discovery` returns READY and the user confirms proceeding to implementation, that single authorization covers the entire chain through to an open, bot-reviewed PR — commit → push → `/pre-pr` → `gh pr create` → CI-fix loop → CodeRabbit/Codex bot-fix loop. No separate "may I commit / may I push / may I run pre-pr" prompts inside that chain. Full mechanics, the stuck-condition definitions, and the bot-finding verification discipline: §9. The **merge gate is separate and stays mandatory** — always ask before merging (§9 Step 10) — and that review must be substantive: it is now the primary point where implementation-time surprises get caught, not a formality. For doc-only changes on `main` outside a story, still ask whether to use a feature branch or commit direct.

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
APPROVED       → COMPLETED | CANCELLED | NO_SHOW   -- NO_SHOW added by M23 Cluster 3 (UC-074); not in MVP until that milestone ships
COMPLETED / REJECTED / CANCELLED / NO_SHOW  (terminal)
```

`NO_SHOW` is **not** in MVP today — it ships with M23 (Multi-Vertical Scheduling, Cluster 3), see `docs/04-USE_CASES.md` UC-074. Until that milestone lands, treat `NO_SHOW` as absent from the live state machine. UC-014 and UC-015 are **superseded** by UC-021/UC-022 — do not implement.

---

## 6. Use Cases (full index + detail: `docs/04-USE_CASES.md`)

**Traps — don't implement these as written:**
- UC-014 (customer login), UC-015 (staff login) — superseded by UC-021/UC-022
- UC-017 (booking analytics) — future, out of MVP
- UC-030 today means "Admin Edits Staff Member Profile" — a different concept from an earlier draft where UC-030 covered staff deactivate/reactivate; that pair now lives at UC-029 (deactivate) / UC-031 (reactivate). Don't confuse the two when citing UC-030 — check `docs/04-USE_CASES.md`'s table first.

**Missing UCs (do not implement until documented):** Customer profile edit beyond phone-collection (UC-021 A3), audit log view, notification template management, failed-notification retry, manual admin loyalty-point redemption (`POST /v1/loyalty/redeem` exists and is implemented but has no UC — see `docs/04-USE_CASES.md` UC-016's note).

---

## 7. Engineering Rules

→ Full detail: `docs/ENGINEERING_RULES.md` + `docs/CODE_STANDARDS.md` (load when writing any code).

**How to edit this file:** a rule stays here only if it's (a) a non-negotiable gate, (b) CI-enforced (name + one line — trust the gate, don't restate the rationale), or (c) a writing-time trap an agent would hit before it would think to load any doc. Everything else is a `→ doc § heading` pointer; the canonical-home rule puts each rule's full explanation in exactly one target doc, never here and there too. Before cutting a bullet, verify two things, not one: the target doc actually holds the content (grep it — never assume from an existing pointer alone), **and** §10's task→docs table actually guarantees that target loads for the situation the trigger describes — a pointer to a doc §10 wouldn't load for that task type is not a substitute for the inline trigger.

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
- **Value objects:** Domain-validated fields in `src/shared/value-objects/`, never plain primitives; `create()` constructs from raw strings, `reconstitute()` skips validation. → `docs/ENGINEERING_RULES.md` § Option A — aggregate props
- **Transactions:** every `save()` wrapped in `ITransactionManager.run()`; cross-row invariants enforced at the DB layer, not just in-transaction. → `docs/ENGINEERING_RULES.md` § Transactions
- **Race conditions — 3 primitives, picked by shape, not "add a lock":** DB exclusion constraint (rows exist, "no two can overlap") / `findByIdForUpdate()` row lock (a row exists, must be read-then-written consistently) / `pg_advisory_xact_lock` (no row exists yet). → `docs/ENGINEERING_RULES.md` § Choosing a race-condition primitive, and where its lock port should live
- **Event handlers:** `handle()` calls exactly one use case and rethrows, zero domain logic, pass `event.correlationId` into the DTO. → `docs/ENGINEERING_RULES.md` § Event Handlers
- **Cross-context data access (in priority order):** domain events (async, preferred) → BFF orchestration (sync reads, preferred) → Port+Adapter (last resort, same process). Grep `infrastructure/cross-context/` before adding a new port — extend existing adapters. Never a SQL JOIN across contexts.
- **Architecture policy:** `packages/architecture-check/architecture-policy.json` is the canonical registry for dependency exceptions — cross-context imports go in `contextDependencyMatrix.permittedEdges`, other reviewed detector exceptions go in `exceptions`; every entry needs an exact path, rationale, owner, review date. Never a wildcard exception. → `docs/05-BOUNDED_CONTEXTS.md` § Rule 2 — Communication via Events or BFF Only
- **Platform tenant cache:** keep tenant read caching in `CachingTenantRepository` behind `CachePort`, not in `TypeOrmTenantRepository`; invalidate best-effort, after the transaction commits. → `docs/ENGINEERING_RULES.md` § Platform tenant cache — adapter boundary and invalidation timing

### Critical code invariants (compressed — full narrative, dates, PR numbers: `docs/ENGINEERING_RULES.md`. Items marked **CI-enforced** fail a mechanical check even if unread; still worth knowing to avoid a wasted round.)

- **Protected-area layouts** read `resolveSupportedLocale(payload.locale ?? 'pt-BR')` from the decoded JWT — never hardcode `'pt-BR'`. **CI-enforced**: ESLint `LOCALE_LITERAL_SELECTOR`. → `docs/ANTI_PATTERNS.md` § hardcodes a locale string
- **Anything that must exist for a Guard-rejected request must be Express middleware, not a NestJS Interceptor** — Interceptors never run for a Guard-rejected request. → `docs/ENGINEERING_RULES.md` § RequestContext
- **Never put cross-service network I/O inside `txManager.run()`.** **CI-enforced**: `transactional-io` detector + ESLint `TX_MANAGER_PUBLISH_SELECTOR`/`RUN_IN_TRANSACTION_SELECTOR`. → `docs/ENGINEERING_RULES.md` § Transactions
- **A `declare global` augmenting an interface member a dependency already declares silently no-ops** under `skipLibCheck: true` — `tsc --noEmit` still passes. → `docs/ENGINEERING_RULES.md` § Express `Request.user` typing
- **A Server Component's `generateMetadata()` needing the same data as the page/layout body must share one fetch via React's `cache()`.** → `docs/CODE_STANDARDS.md` § shared data fetch between `generateMetadata()`
- **A field documented as "unset renders identically to today" must check whether today's behavior is an *explicit* value or an *implicit* engine default.** → `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § implicit vs. explicit CSS defaults
- **Cloud Run timer/async starvation, OTel sampler defaults, and exporter limits have each independently caused silent trace loss** — a timer-driven flush/queue on a CPU-throttled instance can starve (every container, sidecars included, though confirmed as of 2026-08-06 to be low-frequency/intermittent, not the dominant cause); `ParentBasedSampler` needs `remoteParentNotSampled`/`localParentNotSampled` set explicitly or it silently drops most spans (this was the actual dominant cause); `OTLPTraceExporter` needs an explicit `concurrencyLimit`; every dispatcher branch needs its own tracing span, not assumed symmetry; a traces-only bootstrap's metric-reader config must stay in sync with the collector's real pipeline (metrics were re-enabled 2026-08-12 — `metricReaders: []` is no longer the steady state). Before documenting a root cause as confirmed, check it against the target system's own direct evidence, not arithmetic alone. → `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling *(dense multi-fact summary — kept per safeguard)*
- **There is no `InsertQueryBuilder.onConflict()`** — use `.orUpdate(overwrite, conflictTarget, { overwriteCondition })` with real DB column names, not entity property names. → `docs/ANTI_PATTERNS.md` § InsertQueryBuilder.onConflict
- **Adding a `CHECK` constraint to an existing table with live rows via a plain `ADD CONSTRAINT` takes `ACCESS EXCLUSIVE`** — split into `ADD CONSTRAINT ... NOT VALID` + a separate `VALIDATE CONSTRAINT`. → `docs/ANTI_PATTERNS.md` § A plain `ALTER TABLE`
- **A domain event drained into the outbox needs at least one real `eventBus.subscribe()`/`triggerBus.registerTrigger()` consumer before it ships** — the topic auto-generator can't see an event that's only published. → `docs/ANTI_PATTERNS.md` § A domain event is drained
- **OpenRouter/undici outbound calls need:** an explicit retry config (undici excludes `POST` and connect-timeout errors from its retry defaults); awareness that a shared `AbortSignal.timeout()` caps *total* time across retries, not a fresh budget per attempt; `provider.ignore` for a specific provider caught not honoring `reasoning: { effort: 'none' }` even with `require_parameters: true`; `provider.sort: 'throughput'` over the "obvious" `'latency'` for a fixed-time-budget request; and the backend's per-attempt timeout kept safely below the BFF's own timeout for the same call. → `docs/ENGINEERING_RULES.md` § OpenRouter chatbot *(dense multi-fact summary — kept per safeguard)*
- **A shared test builder's date-typed default (`expiresAt`, `startedAt`) must be computed relative to `Date.now()`, never a hardcoded calendar date.** → `docs/ENGINEERING_RULES.md` § Shared test-builder date defaults
- **A new cross-tenant, unscoped system job needs its own standalone index matching its filter column** — an existing `(tenant_id, X)` composite index can't be seeked without `tenant_id` in the query. → `docs/ENGINEERING_RULES.md` § Standalone index for a cross-tenant
- **A merge that changes a workspace package's exports needs that package rebuilt before trusting a local type-check; a worktree's `.env` can go stale relative to sibling stories merged after it was created.** → `docs/CI_TRAPS.md` § Stale local state
- **Cloudflare Turnstile's test sitekey never renders an interactive challenge iframe** — wait on the hidden `cf-turnstile-response` input's value in E2E, not an iframe selector. → `docs/CI_TRAPS.md` § Cloudflare Turnstile's test sitekey
- **A CSP allowance for a new external UI resource must be scoped to every page a user could soft-navigate *from*** — CSP is only re-read on a fresh top-level navigation. → `docs/ENGINEERING_RULES.md` § CSP allowances for a new external UI resource
- **A new full-page hotsite component must explicitly paint `backgroundColor: 'var(--ba-background)'`** — `applyBranding()` never paints an actual background. → `docs/ENGINEERING_RULES.md` § Hotsite full-page components
- **A documented "field X must never appear inside field Y" invariant isn't enforced unless validated at the request boundary** — especially an unconstrained `z.record(...)` schema. → `docs/ENGINEERING_RULES.md` § Schema-level enforcement
- **Before skipping a migration's backfill because "no source data can exist yet," check whether the *endpoint/controller* has already merged to `main`** — an endpoint is a live traffic path the moment it deploys. → `docs/ENGINEERING_RULES.md` § Migration backfills
- **Any user-supplied search term wrapped in a `%...%` LIKE/ILIKE pattern must be escaped first** (`escapeLikePattern()`). → `docs/ANTI_PATTERNS.md` § A user-supplied search term is wrapped
- **A Cloud Run service's `vpc_egress` mode determines whether outbound calls to public destinations even reach the VPC's firewall/NAT layer.** → `docs/ENGINEERING_RULES.md` § Cloud Run `vpc_egress` mode
- **A new `no-restricted-syntax` ESLint selector must be checked against the 3 already-documented bypass classes** before considering it complete. → `docs/ENGINEERING_RULES.md` § `no-restricted-syntax` selectors must be checked
- **Before a blind `Write` on a file believed to be new, grep for its expected exported symbols first** — the "must Read first" safeguard only tracks files *this session* has read. → `docs/ENGINEERING_RULES.md` § Before a blind `Write` on a file
- **Adding one new simple test can retroactively make SonarCloud's `S5976` flag a new 3+ duplicate-test group among pre-existing tests.** **CI-enforced**: SonarCloud quality gate. → `docs/ENGINEERING_RULES.md` § SonarCloud's duplicate-test rule
- **A lock only orders callers who both acquire it** — pair it with a cache-bypassing read or a fresh re-read of in-memory state loaded before the lock. → `docs/ENGINEERING_RULES.md` § A lock only orders callers
- **An advisory lock's key format cannot change once it has protected real production traffic** — a rolling deploy runs old and new code side by side; a brand-new key can be namespaced freely. → `docs/ENGINEERING_RULES.md` § Choosing a race-condition primitive
- **A new event handler's class name must be unique across the whole codebase, not just its own context** — the Pub/Sub generator keys by bare class name. → `docs/ENGINEERING_RULES.md` § Event Handlers (Pub/Sub consumers)
- **When a bot review prompts extending an existing algorithm to a genuinely new dimension, re-derive the new code against every invariant already documented for that feature area.** → `docs/ENGINEERING_RULES.md` § Re-check a same-file documented invariant
- **`architecture-check`'s `transactional-save` detector requires `save()` to be textually inside the `txManager.run()` callback**, not merely reachable through a helper. **CI-enforced.** → `docs/ENGINEERING_RULES.md` § `architecture-check`'s `transactional-save` detector
- **Locking several rows of the same kind together needs a single batched query with an explicit deterministic order**, not N sequential single-row locks. → `docs/ENGINEERING_RULES.md` § Choosing a race-condition primitive
- **A repository that wholesale-replaces a child collection on every `save()` needs a dirty flag on the aggregate** so an untouched save skips the expensive delete+reinsert. → `docs/ENGINEERING_RULES.md` § A wholesale-replaced child collection
- **A child table keyed only by a composite PK cannot represent "declared but empty"** — reject an empty grouping at the aggregate boundary. → `docs/ENGINEERING_RULES.md` § A child table with only a composite PK
- **A bot review's "doc update missing from this PR" claim only checked this PR's diff, not whether the doc is already correct on `main`.** Verify with `gh api repos/<org>/<repo>/compare/main...<sha>`. → `docs/CI_TRAPS.md` (bot doc-update-diff-scoping entry)
- **A Jest OOM kill on a host with plenty of free RAM is V8's default ~2.2GB heap ceiling, not a leak** — set `--max-old-space-size` explicitly on every entry point that can run a large suite. → `docs/ENGINEERING_RULES.md` § Node's default V8 heap limit
- **An integration test seeding fixtures under fixed/hardcoded tenant UUIDs needs symmetric, complete setup/teardown** — CI's `TESTCONTAINERS_REUSE_ENABLE` reuses the same Postgres container across unrelated runs; an incomplete `afterAll` corrupts a later run. → `docs/ENGINEERING_RULES.md` § An integration test seeding fixtures
- **CI-enforced by `architecture-check` detectors not otherwise mentioned in this file:** every TypeORM UUID-PK entity's builder must default to `uuidv7()` (`entity-builder-pk-default`); every TypeORM entity needs a matching builder in `src/test/builders/<context>/` (`test-builder-coverage`); a use case's `execute()` input/output types must be named exactly `{ClassName}Input`/`{ClassName}Result` (`use-case-naming`) — `ClassName` is the full class name *including* the `UseCase` suffix (`GetFooUseCase` → `GetFooUseCaseInput`/`GetFooUseCaseResult`, never `GetFooInput`); BFF response interfaces/Zod schemas live in sibling `.types.ts`/`.schemas.ts`, never inline in the controller (`bff-controller-type-placement`); never construct a class with a `jest.fn()` stub for a port-typed constructor param — use an `InMemoryXxx` double (`jest-fn-port-mock`); VO normalization-reachability and closed-enum mirror consistency (`vo-construction-validation`, `closed-enum-registry`); `.copilot/context.md` itself is guarded against a deleted gate, a broken doc pointer, a re-added PR#/ISO-date literal, a section past its size budget, or a divergent `CLAUDE.md`/`AGENTS.md`/`gemini.md` symlink (`agent-context-file`).

### BFF naming & transport

**BFF module/controller naming, mapper extraction:** full rules (with the M13-S05 precedent for why `.public.controller.ts` always lives under a `public/` prefix): `docs/24-BFF_ARCHITECTURE.md` § Module & Controller Naming Conventions.

**Web → BFF transport:** three helpers cover all calls — never write a raw `fetch()` URL outside them: `bffServerFetch` (authenticated server-only), `bffPublicFetch` (unauthenticated server-only), `bffClient` (axios, client-only, React Query hooks). `useTenant()` is the only source of `tenantId` in hooks. Full signatures, import paths, and the same-origin gateway mechanics: `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer.

### Cross-layer deployment invariants

- **Separate Terraform roots and states do not exchange outputs automatically** — Foundation/environment sequencing is a recurring source of apply-order failures. → `infra/terraform/README.md`
- **A Terraform module with its own passing `terraform test` suite is not proof it's actually applied by any real root** — grep for a real `module` block first. → `infra/terraform/README.md` § Gotchas (dead-module / 3-places-IAM precedent)
- **A manual diagnostic Cloud Run deploy can silently pin a service's traffic policy to one revision** — check `spec.traffic` for `latestRevision: true` after any manual operation. → `infra/terraform/README.md` § Gotchas (traffic-pin precedent)
- **A CI gate built on a path-diff filter checks a static fact about one commit's diff, never live state — `gh run rerun` cannot clear it.** Verify against a system reflecting current reality instead. → `docs/CI_TRAPS.md` (path-diff CI gate row)
- **Migrations that grant privileges to infrastructure-created database roles must enforce provisioning order or provide convergent reconciliation.** → `docs/ENGINEERING_RULES.md` § Migration-driven privilege grants to infrastructure-created roles
- **Security dependency overrides are temporary compatibility boundaries, not permanent pins.** → `docs/CI_TRAPS.md` § Snyk SCA failures
- **A Dependabot Docker base-image digest bump must be verified to stay within the same image variant/family before merging** — a digest-only pin gives Dependabot no tag to anchor to. → `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` § Docker base-image digest pinning
- **The autonomous implementation chain must not treat "tests pass, lint clean, bots clean" as sufficient for a story touching Terraform/IAM/Pub/Sub/CI-CD** — run the concrete live check the change implies (a module wired into a real root, an IAM grant that actually resolves, a real `terraform plan -refresh-only`) before presenting the PR as merge-ready; a failed or un-runnable check is its own stuck condition (3 separate M19 stories broke on live deploy despite clean bot review — none were spec-ambiguity or code-reading failures). *(§9's own live-verification gate cites this bullet as its "why" — kept substantive on purpose, not further compressed.)*
- **A Terraform `type = string` variable with no `default` does not reject an empty string** — only an explicit `validation` block fails closed. → `infra/terraform/README.md` § Gotchas (empty-string var precedent)
- **When a bot review flags "this PR deletes/removes X" and X should obviously still exist, check whether the branch is simply stale relative to `main`** (`git merge origin/main`, never rebase). → `docs/CI_TRAPS.md` (stale-branch / shallow-clone entry)
- **Before adding any Terraform `output` block, check whether its value derives from a secret/sensitive-marked resource attribute** — `sensitive = true` only masks terminal display. → `infra/terraform/README.md` § Public-repository security

### Web styling boundary

*(`--ba-*` dashboard/hotsite boundary already covered in §8's anti-patterns excerpt below — not restated here.)*
- If a new component needs both SaaS and hotsite variants, build separate implementations rather than one component reading both branding systems.
- Prefer `shadcn/ui` primitives; use bespoke components only when the UI clearly needs something custom.
- Route-scoped chrome state visible in a shell header/topbar lives in a provider above both shell and page — never shell-local state or effect-based sync (`docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`).
- If Sonar flags a UI smell that seems to change behavior, reproduce it in the browser before applying the suggested refactor — static analysis identifies a smell, not the runtime cause.

### Testing

**Backend + BFF:** Unit (`.spec.ts`) · Integration (`.integration.spec.ts`) · E2E (Playwright). Builders (class + `withXxx()`/`build()`, never a plain factory), the `integration-global-setup.ts` registration requirement, and the `useClass`-not-`useExisting` root cause are all fully detailed in `docs/08-TESTING_STRATEGY.md` — don't restate them here.
- If an E2E/Playwright workflow fails before the browser step starts, inspect migrations, seeds, and service bootstrap first. A red "Playwright" job is often a backend DB bootstrap failure, not a frontend/browser regression.

- **apps/web:** Vitest (not Jest) — config at `apps/web/vitest.config.ts`.
- `shared/lib/**`: `node` env · `features/**/components/**`, `shells/**/components/**`, `shared/components/**`: `jsdom` + `@testing-library/react` · pages/layouts: Playwright E2E only.
- Keep `app/**/page.tsx` and `app/**/layout.tsx` thin — extract reusable logic to `apps/web/shared/lib/**` and unit-test it there.
- **Every new `features/**/components/**/*.tsx`, `shells/**/components/**/*.tsx`, or `shared/components/**/*.tsx` must ship its `.spec.tsx` in the same commit** (§9 Step 2 restates this at the point it applies — one rule, not two).
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
Run `/story-discovery M0X-SYY` — wait for READY verdict before proceeding. Never skip for any story or TD. Discovery is the one deep, front-loaded decision point: beyond doc consistency, it also locks in the architectural pattern the story will use (or explicitly states none is needed), a concrete test/e2e coverage plan (named scenarios, not just "at least one"), and any business-rule ambiguity — asking the user as many questions as needed to resolve every open decision before implementation starts (`story-discovery.md` § Pattern & test-strategy lock-in). Discovery ends by rewriting the story's own spec to capture every decision and committing + pushing that update (`story-discovery.md` Step 7).

**A READY verdict is the single authorization for everything through Step 9** — the entire commit → push → `/pre-pr` → PR → CI-fix → bot-fix chain below runs unattended from here, with no further per-step asks.

### Step 1 — Create feature branch (BEFORE any code)
`git checkout -b feat/M0X-SYY-<short-description>` — never code on `main`. (Already done here if story-discovery's Step 9 set up a worktree/branch.)

**First thing in any worktree or fresh clone:** `git rev-parse --is-shallow-repository` — if `true`, `git fetch --unshallow origin` before drawing any "behind/ahead of `main`" conclusion (a shallow clone's `git log HEAD..origin/main` lists phantom commits and `git merge origin/main` fails with "refusing to merge unrelated histories"). A worktree also carries none of the gitignored env files (`apps/backend/.env`, `apps/bff/.env`, `apps/web/.env.local`) — copy them from the main checkout before running the stack.

### Step 2 — Implement
Write all files from the story spec, following the pattern and test plan locked in during discovery. For any frontend story referencing a prototype:
- Read the prototype HTML **before** writing components.
- Use exact CSS class names from the story's reference table — do not substitute Tailwind for `tokens.css` names.
- Every new component file needs a co-located `.spec.tsx` in the **same commit** (§7 Testing).

### Steps 3–9 — Autonomous chain (no per-step confirmation)
Once implementation is self-verified locally (type-check, lint, tests all clean), proceed through the rest of this chain without asking again — the Step 0 READY verdict already authorized it.

**1. Commit** — stage specific files only (never `git add -A`), list them for visibility, then commit. Format:
```
feat(<context>): <description> (M0X-SYY)

Co-Authored-By: <your-name> <your-noreply-email>
```
**If you are Claude:**
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
(Claude Code adds this automatically as part of its own commit workflow — this line is a reference, not something you need to remember to type.)

**If you are Codex:** this repo requires the equivalent trailer on every commit you author — it does not happen by default, so add it explicitly:
```
feat(<context>): <description> (M0X-SYY)

Co-Authored-By: Codex <noreply@openai.com>
```
This is not optional — it's the record of who actually wrote the code, same as Claude's trailer, and matters for attribution/history independent of any tooling. (`/pre-pr` (§17), which dispatches `/pr-review` to the other tool once a PR is open, does *not* need this trailer for that decision — it already knows its own identity without detecting it.)

**2. Push** — `ci:fast` (lint + type-check + architecture-check + unit tests) runs automatically and blocks if it fails. (`ci:local`, `pnpm ci:local` ~5 min Docker, is optional and only worth running first when touching Dockerfiles, infra, or integration-test paths.)

**3. `/pre-pr`** — runs automatically once pushed (no permission prompt to start it): script, agent checks, bad-smell-audit, integration tests. Fix any failure and re-run; do not proceed until it reports zero issues across all steps.

**4. Open the PR** once `/pre-pr` clears:
```bash
gh pr create --title "feat(<context>): <description> (M0X-SYY)" \
  --body "## Summary\n- <bullet>\n\n## Story\nM0X-SYY\n\n## Test plan\n- [ ] Unit tests pass\n- [ ] Type-check clean\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)" \
  --repo lmmoreira/ikaro
```

**5. Monitor CI; triage bot reviews** — run `/pr-land`, which loads its own full mechanics as a skill invocation: `.claude/commands/pr-land.md` (Core Rule: wait for every in-scope actor before batching one commit + one push, never react to a single actor mid-round; § Step 3: the mandatory bot-finding discipline — read → check against real codebase practice → check against the real business scenario → fix or explain why not, with immediate escalation for business/design-only or undeterminable findings). It posts the CodeRabbit trigger, dispatches Codex, and loops until CI is green and Codex reports 0 unresolved Critical/Important.

**6. Infra-touching stories — live-verification gate:** if this story touches Terraform, IAM, Pub/Sub, or CI/CD, run the concrete live check the change implies (confirm a Terraform module is referenced by a real `module` block, confirm an IAM grant actually resolves, a real `terraform plan -refresh-only`) **before** treating the PR as ready for the human merge review — see §7's Cross-layer deployment invariants for why "tests pass, bots clean" isn't sufficient for this category. A failed or un-runnable check is its own stuck condition.

**If the branch conflicts with `main` after it's already been pushed and reviewed:** merge, never rebase — full rule + fix: `docs/CI_TRAPS.md` § A compile/test failure only exists in CI, and won't reproduce even in a clean clone.

**Stuck conditions — escalate to the user, never force through:**
1. A CI/test failure that doesn't resolve within a reasonable number of genuine fix attempts, or whose only apparent fix would be a workaround the "no workarounds" rule (§7) forbids.
2. A bot finding whose relevance can't be confidently determined either way (bot-finding discipline step 6 above), or one that needs a business/design decision (step 7 above) — the latter escalates immediately, not gated on round count.
3. A failed or un-runnable live-verification check on an infra-touching story (item 6 above).
4. `/pr-land` reaches round 5 with Codex still reporting ≥1 unresolved Critical or Important finding (Minor-only doesn't count). Describe what's recurring across rounds and what's been tried — don't attempt a 6th round unprompted.

When stuck, stop and describe the specific blocker — don't keep iterating to force a green check, and don't silently drop the finding either.

### Step 10 — Ask user before merging
This is now the primary point where implementation-time surprises get caught, not a formality — treat it as a substantive read of the actual diff.

**Before asking, confirm mergeability directly** — a green Codex/CI/SonarCloud-issues read is not sufficient on its own. Run `gh pr view <PR-number> --repo lmmoreira/ikaro --json mergeStateStatus,mergeable` and only ask once `mergeStateStatus` is `CLEAN`. → `docs/CI_TRAPS.md` § A green Codex/CI/SonarCloud-issues read is not sufficient proof a PR can merge

Ask: *"All checks are green on PR #N — happy to merge?"* Then:
`gh pr merge <PR-number> --repo lmmoreira/ikaro --squash --delete-branch && git checkout main && git pull origin main && git branch -D <branch-name>`

Always delete the local branch with `-D` (not `-d` — squash merges aren't recognized as fully merged).

### Step 11 — Mark done
`/mark-done M0X-SYY` — the last-mile check, not just bookkeeping: independently re-verifies AC evidence and that any Critical/Important `/pr-review`/bot finding on the merged PR was actually resolved, opening a bug-fix TD via `/create-td` for any real gap rather than silently marking done — then updates the plan file, commits to main, alerts if milestone complete. (TD stories: no separate command — see `mark-done.md`'s note on marking a TD story done directly in its own feature branch.)

**If a worktree was used, clean it up immediately after — no need to ask:** `git worktree remove .claude/worktrees/<name> --force`, delete the local branch(es) with `-D`, prune the stale remote-tracking ref (`git fetch --prune origin`). Verify the removal actually took with `git worktree list` — don't trust a success message alone.

### Step 12 — Milestone complete?
If all stories are `✅ Done`: create `plan/MXX-<NAME>_IMPLEMENTATION_DETAILS_IA.md` + `_DEVELOPER.md`; add IA file to §10. Also do the stale-documentation sweep described in `/mark-done`'s milestone-complete reminder — a safety net for any story that skipped `docs/DEFINITION_OF_DONE.md`'s stale-reference-sweep item.

### Parallel batch execution (optional)

For a milestone with many independent stories, `/run-batch` runs a small batch (default 2, cap 5) of non-overlapping stories concurrently instead of one at a time — stricter than a milestone "wave." Full mechanics: `.claude/commands/run-batch.md`.

---

## 10. Dynamic Context Loading — Load Only What You Need

| Task | Docs to load |
|---|---|
| Writing any code | `docs/CODE_STANDARDS.md` + `docs/AGENT_PATTERNS.md` + `docs/ENGINEERING_RULES.md` |
| Finishing a story / before PR | `docs/DEFINITION_OF_DONE.md` |
| CI failure / pre-PR | `docs/CI_TRAPS.md` |
| Implement a UC | `docs/04-USE_CASES.md` (UC section) + `docs/02-DOMAIN_MODEL.md` + `docs/03-DOMAIN_EVENTS.md` |
| Complex/cross-cutting business logic (algorithm/state machine/formula spanning multiple UCs or aggregates) | `docs/27-BUSINESS_LOGIC_REFERENCE.md` — check its bounded-context section before re-deriving from scattered prose (see also `/story-discovery` 4r, `/mark-done` Step 4) |
| Resource-scoped scheduling / availability computation (M21+) | `docs/27-BUSINESS_LOGIC_REFERENCE.md` § Booking — Resource-Scoped Scheduling & Availability (plus the Database/migration and Implement-a-UC rows) |
| Database / migration | `docs/13-DATABASE_SCHEMA.md` + `docs/02-DOMAIN_MODEL.md` |
| API endpoint | `docs/14-API_CONTRACTS.md` + the cited UC |
| Event handler | `docs/03-DOMAIN_EVENTS.md` + `docs/05-BOUNDED_CONTEXTS.md` + `docs/ENGINEERING_RULES.md` |
| Staff OAuth login / invite link | `docs/ENGINEERING_RULES.md` § Staff OAuth login URL format |
| New notification type | `docs/ENGINEERING_RULES.md` § Adding a new notification type |
| New error code (`@ikaro/types`) | `docs/ENGINEERING_RULES.md` § Adding a new error — checklist (step 2: translation entry in **both** locale files, or CI's exhaustiveness test fails) |
| New UI copy / locale key | `docs/ENGINEERING_RULES.md` § Authoring new i18n UI copy keys + `docs/CODE_STANDARDS.md` |
| Hotsite / public frontend | `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` + `docs/14-API_CONTRACTS.md` + `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` |
| Dashboard / admin frontend | `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` + `docs/14-API_CONTRACTS.md` |
| BFF implementation | `docs/24-BFF_ARCHITECTURE.md` + `docs/14-API_CONTRACTS.md` |
| Web → BFF transport | `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer |
| Architecture question | `docs/11-ARCHITECTURE.md` + `docs/05-BOUNDED_CONTEXTS.md` + `docs/REPOSITORY_STRUCTURE.md` |
| Repo layout / new file location | `docs/REPOSITORY_STRUCTURE.md` (full trees) — §11 below has the quick summary |
| Multi-tenancy / isolation | `docs/06-TENANT_ISOLATION_STRATEGY.md` |
| Testing patterns | `docs/08-TESTING_STRATEGY.md` + `docs/ENGINEERING_RULES.md` |
| apps/web test infrastructure | `docs/08-TESTING_STRATEGY.md` § apps/web Testing Infrastructure |
| Value objects / mappers | `docs/VALUE_OBJECTS_REFERENCE.md` + `docs/ENGINEERING_RULES.md` |
| CI / pipelines | `docs/09-CI_CD_PIPELINE.md` + `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` |
| Deployment / infra | `docs/12-DEPLOYMENT_STRATEGY.md` + `docs/22-TECH_STACK_DECISIONS.md` |
| Writing Terraform / infra code | vendored HashiCorp Terraform skills (`.claude/skills/`) + `plan/M17-CLOUD-DEPLOY.md` §0–§2 + `infra/terraform/README.md` |
| Foundation / IAM ownership | `infra/terraform/foundation/README.md` + `infra/terraform/README.md` before editing Terraform or workflows |
| Observability | `docs/10-OBSERVABILITY_STRATEGY.md` |
| Implementing a milestone story | Load `plan/<M0X>-<NAME>_IMPLEMENTATION_DETAILS_IA.md` for that milestone (`ls plan/*_IMPLEMENTATION_DETAILS_IA.md` to list). Special case: `plan/M115-PRODUCTION-READINESS_IMPLEMENTATION_DETAILS_IA.md` |
| `Resource` aggregate / resource-scoped scheduling (M21 and later) | `plan/M21-MULTIVERTICAL-FOUNDATION_IMPLEMENTATION_DETAILS_IA.md` |
| New journey or prototype | `plan/journey/README.md` |
| Starting a new discovery from an idea | `/create-discovery` — see `.claude/commands/create-discovery.md` |
| Promoting a `docs/discovery/` doc into a milestone | `/discovery-to-milestone` — see `.claude/commands/discovery-to-milestone.md` |
| Creating a brand-new TD | `/create-td` — see `.claude/commands/create-td.md` |
| Appending one new story to an already-existing TD or milestone (a live bug, a freshly spotted gap — no discovery doc, no new-container ceremony) | `/create-story` — see `.claude/commands/create-story.md` |
| Drafting or parsing any story (TD or milestone) | `docs/STORY_SCHEMA.md` — canonical field set; `/create-td`, `/create-story`, `/discovery-to-milestone`, `/story-discovery`, `/run-batch` all reference it instead of restating their own copy |

**Anti-patterns reference:** `docs/ANTI_PATTERNS.md` — full table; loaded automatically by `/pre-pr`.
**Never load:** `docs/archive/` (superseded) · `plan/*_DEVELOPER.md` (written for humans, not agents).

**Drafting a new milestone:** Consolidate into the single canonical `plan/M0X-<NAME>.md` before any story starts. Sequence backend/BFF-only stories in an early wave before any frontend story that depends on them.

---

## 11. Repository Layout — Domain-Slice Architecture

Full trees: `docs/REPOSITORY_STRUCTURE.md` · Rationale: `docs/11-ARCHITECTURE.md` · BFF detail: `docs/24-BFF_ARCHITECTURE.md`. This is the live architecture, not a future plan.

Three slice types, consistent across all three apps:
- **Domain slices** (business capability, mirrors backend bounded contexts): `booking`, `customer`, `staff`, `loyalty`, `platform`
- **Shell slices** (web only — route composition, zero business policy): `dashboard`, `hotsite`
- **Technical slices** (not bounded contexts — never treat as domains): `auth`, `uploads`

| App | Domain slice shape |
|---|---|
| Backend | `contexts/<domain>/{domain,application,infrastructure}/` |
| BFF | `features/<domain>/<domain>.controller.ts` + `<domain>.public.controller.ts` + `<domain>.mapper.ts` + `<domain>.types.ts` (flat — no `presentation/application/infrastructure` subfolders; corrected 2026-07-23 per TD31 Story 12, confirming the flat shape is the real, intended architecture, not drift) |
| Web | `features/<domain>/{api,components,hooks,model,utils}/` |

- `schedule`/`services` live inside `booking`; `hotsite`-specific logic lives inside `platform` — never a standalone top-level domain.
- `shared/` (any app) is cross-cutting only — a helper used by exactly one domain belongs in that domain's slice, not in `shared/`.
- **Actor-scoped view of another domain's aggregate** (e.g. a Customer reading/mutating their own Booking or Loyalty data) lives in the *owning* domain's slice (`booking`/`loyalty`), never the actor's slice (`customer`) — matches the existing Staff-facing pattern, where Staff-facing Booking operations already live in `booking`, not `staff`. Scope the export names to make the actor obvious (e.g. `cancelBookingAsCustomer`), don't just drop an unqualified function into the owning slice. → `docs/REPOSITORY_STRUCTURE.md` § Web placement rules
- Web additionally has `shells/<surface>/` (route composition for `dashboard`/`hotsite` — no business policy) and `app/` (Next.js routes/layouts only, thin).
- Test helpers: `apps/backend/src/test/utils/` + `src/test/infrastructure/`.

---

## 12. Open Decisions (stop and ask before implementing)

1. **Multi-location (post-MVP):** Multiple locations per tenant = separate tenants or sub-tenant model?

---

## 13. Self-Check Before Submitting

1. **`/story-discovery M0X-SYY` ran and returned READY** — first action, no exceptions (§9 Step 0)
2. **Feature branch created before any code** — `git checkout -b feat/M0X-SYY-<desc>` (§9 Step 1)
3. **One authorization obtained at story-discovery's READY verdict** covers commit/push/pre-pr/PR/CI-fix/bot-fix — no per-step asks after that (§0); the merge ask (§9 Step 10) is still separate and mandatory.
4. **`/pre-pr` ran and cleared before `gh pr create`, and any stuck condition was escalated rather than forced through** (§9 Steps 3–9)
5. **Milestone complete?** — see §9 Step 12 for the wrap-up-doc + stale-doc-sweep sequence.

---

## 15. Journey & Prototype Workflow Rules

> ❗ **HARD STOP — READ BEFORE TOUCHING ANY `plan/journey/` FILE**
> `/docs-audit` MUST run and report a clean baseline first. Then: (1) write `<actor>/<slug>.md`, (2) update `<actor>/use-cases.md`, (3) update `plan/journey/README.md`'s index, (4) **only then** create files under `<actor>/prototypes/<slug>/`.

**Scope of the hard stop:** it covers *creating or restructuring* journeys and prototypes. A one-sentence factual sync of an existing `plan/journey/**` file (e.g. correcting a `dev-notes.md` line after the implementation changed) needs only the normal doc-gate yes — no `/docs-audit` baseline.

Full rules, folder structure, and CSS gotchas (`.topbar-avatar`, `.week-nav`, `padding-bottom`, floating toast, etc.): `plan/journey/README.md` — load whenever working on any journey file or prototype folder.

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
| `/docs-audit [UC-XXX\|M0X\|actor/slug\|doc-path]` | `.claude/commands/docs-audit.md` |
| `/grill-me` | `.claude/commands/grill-me.md` |
| `/mark-done M0X-SYY` | `.claude/commands/mark-done.md` |
| `/pre-pr` | `.claude/commands/pre-pr.md` |
| `/pr-land [PR#]` | `.claude/commands/pr-land.md` |
| `/pr-review [PR#]` | `.claude/commands/pr-review.md` |
| `/run-batch [M0X \| M0X-SYY/TDNN ...]` | `.claude/commands/run-batch.md` |
| `/story-discovery M0X-SYY` | `.claude/commands/story-discovery.md` |

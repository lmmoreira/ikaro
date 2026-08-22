# Ikaro — Agent Context (canonical)

> **AGENT EDITING NOTICE:** `CLAUDE.md`, `claude.md`, `AGENTS.md`, and `gemini.md` are all symlinks to **`.copilot/context.md`**. Always write to `.copilot/context.md` directly — never through the symlinks.

**Symlinked as:** `CLAUDE.md`, `gemini.md`, `AGENTS.md`
**Audience:** Any AI coding agent
**Rule:** Read this file first. Then use §10 to load only the docs you need.
**Last updated:** 2026-08-22

---

## 0. Permission Protocol (non-negotiable)

**Story / TD gate — NON-NEGOTIABLE:** Before writing any code for a story or TD, run `/story-discovery M0X-SYY` first. This is the first action after entering the worktree, no exceptions. Never skip — even for "obvious" tasks.

**Doc/config gate:** Before writing or editing any `.md`, `.tf`, `.yml`, or config file: discuss → summarise → ask "May I now create/update `<path>`?" → write only after an explicit yes. Exception: once a story is approved, `.ts`/`.spec.ts` code files can be created autonomously. Read-only ops (`Read`, `grep`, `ls`, `git status`, memory) are always free.

**Autonomous implementation chain — one authorization, not per-step asks:** Once `/story-discovery` returns READY and the user confirms proceeding to implementation, that single authorization covers the entire chain through to an open, bot-reviewed PR — commit → push → `/pre-pr` → `gh pr create` → CI-fix loop → CodeRabbit/Codex bot-fix loop. No separate "may I commit / may I push / may I run pre-pr" prompts inside that chain. Full mechanics, the stuck-condition definitions, and the bot-finding verification discipline: §9. The **merge gate is separate and stays mandatory** — always ask before merging (§9 Step 10) — and that review must be substantive: it is now the primary point where implementation-time surprises get caught, not a formality. For doc-only changes on `main` outside a story, still ask whether to use a feature branch or commit direct.

**Pre-push validation — NON-NEGOTIABLE:** `git push` automatically runs `ci:fast`; never use `git push --no-verify` to bypass it. If a terminal/session detaches while the hook runs, its result is unknown — capture the command's log, inspect the live process, and wait for its real exit status before treating the push as complete. A detached output stream is never evidence of a failed hook and never authorization to skip validation.

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
| **DB** | PostgreSQL 17 · TypeORM v0.3+ · single shared schema · `tenant_id` everywhere · migrations via separate CI job (never auto at startup) |
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
| **Booking** | Core | `Booking`, `Service`, `ScheduleClosure` |
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
APPROVED       → COMPLETED | CANCELLED
COMPLETED / REJECTED / CANCELLED  (terminal)
```

`NO_SHOW` is **not** in MVP. UC-014 and UC-015 are **superseded** by UC-021/UC-022 — do not implement.

---

## 6. Use Cases (full index + detail: `docs/04-USE_CASES.md`)

**Traps — don't implement these as written:**
- UC-014 (customer login), UC-015 (staff login) — superseded by UC-021/UC-022
- UC-017 (booking analytics) — future, out of MVP
- UC-030 was superseded/renumbered as part of the M13 staff-lifecycle stories (UC-029 deactivate / UC-031 reactivate are the canonical pair) — check `docs/04-USE_CASES.md`'s table before citing a UC number in a story

**Missing UCs (do not implement until documented):** Customer profile edit beyond phone-collection (UC-021 A3), audit log view, notification template management, failed-notification retry, manual admin loyalty-point redemption (`POST /v1/loyalty/redeem` exists and is implemented but has no UC — found via `/docs-audit` 2026-08-04, see `docs/04-USE_CASES.md` UC-016's note).

---

## 7. Engineering Rules

→ Full detail: `docs/ENGINEERING_RULES.md` + `docs/CODE_STANDARDS.md` (load when writing any code).

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
- **Value objects:** Domain-validated fields in `src/shared/value-objects/`. `create()` validates from raw strings; `reconstitute()` skips validation. Never plain primitives for domain fields.
- **Transactions:** every `save()` wrapped in `ITransactionManager.run()`; cross-row invariants (e.g. no two APPROVED bookings overlap) enforced at the DB layer (exclusion constraint), not just in-transaction; optimistic locking on correctness-sensitive writes uses an explicit version-guarded `UPDATE`. Full rules: `docs/ENGINEERING_RULES.md` § Transactions.
- **Event handlers:** `handle()` calls exactly one use case and rethrows, zero domain logic, pass `event.correlationId` into the DTO. Full rules: `docs/ENGINEERING_RULES.md` § Event Handlers.
- **Cross-context data access (in priority order):** (1) Domain events — async, preferred; (2) BFF orchestration — sync reads, preferred; (3) Port+Adapter — last resort, same process. Grep `infrastructure/cross-context/` before adding a new port — extend existing adapters. Never a SQL JOIN across contexts.
- **Architecture policy:** `packages/architecture-check/architecture-policy.json` is the canonical machine-readable registry for dependency exceptions. Add exact cross-context imports to `contextDependencyMatrix.permittedEdges`; add other reviewed detector exceptions to `exceptions`. Every entry needs an exact path, rationale, owner, and review/expiry date. Never bypass a boundary with a wildcard exception.
- **Platform tenant cache:** keep tenant read caching in `CachingTenantRepository` behind `CachePort`, not in `TypeOrmTenantRepository`. Cache writes/invalidations must stay best-effort and invalidate after the transaction commits; do not reintroduce cache concerns into the raw TypeORM adapter.

### Critical code invariants (not caught by linters — full list: `docs/ENGINEERING_RULES.md`)

- Several invariants are already fully covered in `docs/CODE_STANDARDS.md`/`docs/ENGINEERING_RULES.md` (loaded for any coding task) — don't restate them here, go read them: `mapXxxError(err): never` at the HTTP layer; aggregate-driven events auto-flushing via the outbox on `save()`; the domain error base class's `Object.setPrototypeOf` requirement; use cases never injecting `RequestContext`; controllers/route files as composition-layer-only; feature-owned transport helpers staying with the feature.
- **Protected-area layouts** read `resolveSupportedLocale(payload.locale ?? 'pt-BR')` from the decoded JWT — never hardcode `'pt-BR'`.
- **Anything that must exist even for a Guard-rejected request (a trace ID, a request-scoped flag) must be Express middleware, not a NestJS Interceptor.** Nest's pipeline runs `Middleware -> Guards -> Interceptors -> Pipes -> Controller` — an Interceptor never runs for a request a Guard rejected, so it silently misses every 401/403/429 (M17-S31 precedent — full incident: `docs/ENGINEERING_RULES.md` § RequestContext).
- **Never put cross-service network I/O inside `txManager.run()` — not before, and not as a post-commit side effect either — and if a port is documented "best-effort/never throws," verify its *entire* method body honors that, not just the one call that looks obviously risky.** Network I/O inside the transaction block risks pool exhaustion/lock contention and couples write durability to an unrelated system's availability; a partially-wrapped best-effort contract still lets an already-committed write surface as a client-visible error (PR #267 precedent — full incident: `docs/ENGINEERING_RULES.md` § Transactions, `docs/ANTI_PATTERNS.md`).
- **A `declare global` augmentation of an interface member a dependency already declares (e.g. BFF `Express.Request.user`, owned by `@types/passport`) silently does nothing under this repo's `skipLibCheck: true`** — the pre-existing declaration just wins everywhere, while `tsc --noEmit` still passes cleanly. Don't trust "`tsc` passed" as proof a `declare global` block took effect — verify the augmented property's inferred type at a real usage site. If the interface is already owned elsewhere, use a shared accessor function instead (TD31 PR4 precedent — full incident: `docs/ENGINEERING_RULES.md` § Express `Request.user` typing).
- **A Server Component's `generateMetadata()` that needs the same data as the page/layout body must share one fetch, not re-fetch independently** — wrap it in React's `cache()` (M18-S03 precedent — full incident: `docs/CODE_STANDARDS.md` § shared data fetch between `generateMetadata()` and the page/layout body).
- **A field documented as "unset renders identically to today" must check whether today's behavior is an *explicit* class/value or an *implicit* engine default** before wiring the field's own default through generically (M18-S05 precedent — full incident: `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § implicit vs. explicit CSS defaults).
- **Any timer-driven flush or async worker queue running on a Cloud Run instance with `run.googleapis.com/cpu-throttling: "true"` can be silently starved once no request is active — this includes sidecar containers, not just the app's own process.** A background timer/queue scheduled during a throttled gap may simply never fire, with no error or log line (M17-S34 precedent, 2026-08-05: fixing the app-side `BatchSpanProcessor` timer only moved the same bug into the collector sidecar's own `batch` processor/async queue, causing ~73% of traces to silently never reach Cloud Trace — full incident: `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling — timer/async work can be silently starved (sidecars included)). **Update, 2026-08-06: that 73% measurement was taken while the sampler bug below was still dropping most spans, making span arrival artificially sparse — the collector's `batch`/`sending_queue` were reintroduced the next day once real, dense traffic revealed a NEW round of export failures, and batching measurably (not completely) reduced them. A live A/B directly CONFIRMED this exact starvation mechanism still applies in a narrower case: a single low-volume request (a `/pubsub/push` cron trigger) too small to hit the batch's size threshold lost spans via the timer, while dense multi-request bursts were unaffected. Extended observation (~2 hours, 363 requests) put the actual rate at 2 loss events total, both early, none since — low-frequency and intermittent, not persistent. See `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling and `infra/docker/otel-collector/README.md` for the full, honest result — this is not a closed case.**
- **Before documenting a hypothesis as a confirmed root cause, check it against the actual, direct evidence the target system exposes — not just arithmetic that happens to make the numbers line up.** A burst of 71 "context deadline exceeded" export failures (otel-collector → Cloud Trace) was attributed to Cloud Trace's per-project write-API quota (4,800 requests/60s) being burst past, reasoning "71 calls in 300ms ≈ 237 req/s, ~3x the quota." That reasoning shipped in docs before being checked against Cloud Monitoring's own quota metrics (`serviceruntime.googleapis.com/quota/exceeded`, `.../quota/rate/net_usage`) — which showed **zero** quota-rejection events and actual usage at ~21% of the limit at peak, directly refuting it. Caught by cross-tool PR review, not the original investigation. The real mechanism remains unconfirmed; a Cloud Run container's CPU metric is too coarse (effectively one sample per minute) to confirm or rule out contention either, so don't let ruling out one hypothesis promote the next to "confirmed" without its own evidence (M17-S34 follow-up precedent, 2026-08-06 — full incident: `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling, `infra/docker/otel-collector/README.md`).
- **`new ParentBasedSampler({ root: ... })` with only `root` set silently drops most real traces — its own defaults for `remoteParentNotSampled`/`localParentNotSampled` are `AlwaysOffSampler`, not the configured ratio.** Any span with *any* parent context showing "not sampled" skips `root` entirely and is never recorded, regardless of `OTEL_TRACES_SAMPLER_ARG`. No error anywhere — the span is never created as a recording span, so nothing ever reaches an export path that could fail. Always set `remoteParentNotSampled`/`localParentNotSampled` explicitly to the same ratio-based sampler as `root` (leave `remoteParentSampled`/`localParentSampled` at their `AlwaysOn` default, so a genuinely-sampled parent is still respected) (M17-S34 precedent, 2026-08-05: this was the actual dominant cause of the ~75-89% production trace loss the CPU-throttling bullet above was originally — and incompletely — blamed for; the two bugs produce an identical silent-loss signature but are otherwise unrelated — full incident: `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling, `packages/observability/src/otel-tracing.ts`'s `createSampler()`).
- **`OTLPTraceExporter`'s default `concurrencyLimit` (30 in-flight exports) rejects — never queues or retries — any export past that limit, and `SimpleSpanProcessor` doesn't retry either, so each rejection is a genuinely lost span (`Error('Concurrent export limit reached')`).** This limit is rarely hit at low traffic or when a sampling bug is masking most spans, but real traffic with correct sampling can easily burst past it — a single request can fan out to 20-30 child spans. Pass `concurrencyLimit` explicitly (this repo uses 200) rather than relying on the library default (M17-S34 follow-up precedent, 2026-08-05: found immediately after the `ParentBasedSampler` fix above started letting real traffic through — 598 rejections in ~80 minutes on staging, one burst of 500 in 29 seconds — full incident: `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling, `packages/observability/src/otel-tracing.ts`).
- **When one branch of a message dispatcher gets an explicit tracing span, check every sibling branch of the same dispatcher for the identical gap — don't assume symmetry.** `GcpPubSubEventBusAdapter`'s cron-trigger dispatch branch never got the `startActiveSpan()` wrap its sibling domain-event branch had, leaving cron-triggered `/pubsub/push` traces with no dispatch-boundary span (M17-S34 follow-up precedent, 2026-08-05 — full incident: `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling, `apps/backend/src/shared/infrastructure/event-bus/gcp-pubsub-event-bus.adapter.ts`).
- **A traces-only `NodeSDK` bootstrap must explicitly pass `metricReaders: []` — omitting it does not mean "no metrics," it silently activates `@opentelemetry/sdk-node`'s own default OTLP metrics export loop** (active whenever `OTEL_METRICS_EXPORTER` isn't `"none"` and no `metricReaders`/`metricReader` is passed), independent of whatever the app's own tracing config does. If the collector has no `metrics:` pipeline, every periodic export hits a genuine 404, logged as an ERROR forever (M17-S34 follow-up precedent, 2026-08-05 — full incident: `docs/ENGINEERING_RULES.md` § Cloud Run CPU throttling, `packages/observability/src/otel-tracing.ts`).
- **There is no `InsertQueryBuilder.onConflict()` method — a raw `ON CONFLICT` string fails at compile time.** For a conditional upsert (only overwrite when the incoming value is actually newer), use the real API: `.orUpdate(overwrite, conflictTarget, { overwriteCondition: { where } })`. Its `overwrite`/`conflictTarget` arrays take real DB column names (`last_success_at`), not entity property names (`lastSuccessAt`) — unlike `.values()`, `orUpdate()` does no property→column translation (M19-S06 precedent, 2026-08-13 — full incident: `docs/ENGINEERING_RULES.md` § TypeORM upsert internals).
- **`useDefineForClassFields` makes a declared-but-unassigned class field a real own-property — `'field' in entity` is `true` even when TypeORM's partial upsert correctly excluded it from `DO UPDATE SET`.** Assert on the value (`.toBeUndefined()`), never on `in` presence, when testing that a partial-column upsert excluded a column (M19-S06 precedent, 2026-08-13 — full incident: `docs/ENGINEERING_RULES.md` § TypeORM upsert internals).
- **A shared `AbortSignal.timeout()` instance caps the *total* time across every retry attempt reusing it, not a fresh budget per attempt — verified empirically, not just reasoned about.** A second `fetch()` call reusing an already-fired signal fails in 0ms, not with a fresh wait. This is why a hand-rolled retry loop can safely share one signal across attempts without its own elapsed-time bookkeeping — but also why making a signal-governed timeout "retryable" is a no-op under that design (M19-S13 precedent, 2026-08-19 — full incident: `docs/ENGINEERING_RULES.md` § OpenRouter chatbot outbound HTTP resilience).
- **Node's `undici` `interceptors.retry()` silently excludes `POST` from its default retryable methods, and `UND_ERR_CONNECT_TIMEOUT` from its default retryable error codes.** Both must be added explicitly (`methods: [...defaults, 'POST']`, `errorCodes: [...defaults, 'UND_ERR_CONNECT_TIMEOUT']`) for a POST-based JSON API client to get connect-timeout retry benefit at all — the interceptor no-ops otherwise, with no warning (M19-S13 precedent, 2026-08-19 — full incident: `docs/ENGINEERING_RULES.md` § OpenRouter chatbot outbound HTTP resilience).
- **`reasoning: { effort: 'none' }` (OpenRouter's documented way to disable a reasoning model's chain-of-thought) is not reliably honored by every provider OpenRouter can route to for the same model, and `provider.require_parameters: true` does not reliably catch a noncompliant one.** Confirmed by four real generations from one provider burning its entire token budget on hidden reasoning despite the setting, one of them occurring *with* `require_parameters: true` already active. The provider was evidently registered in OpenRouter's own metadata as supporting the parameter (so the general capability check didn't exclude it) while not correctly honoring the value once selected — a provider-side bug the general mechanism can't see. An explicit `provider.ignore: [...]` for the specific caught provider is the empirically-necessary complement, not a redundant belt-and-suspenders addition (M19-S13 precedent, 2026-08-19 — full incident: `docs/ENGINEERING_RULES.md` § OpenRouter chatbot outbound HTTP resilience).
- **`provider.sort: 'latency'` (time-to-first-token) is not the same risk as `provider.sort: 'throughput'` (tokens/sec) for a request with a fixed total-time budget, and OpenRouter's own "chat UIs should sort by latency" guidance can be the wrong call.** A provider with fine latency (774ms) but poor throughput (2.3 tok/s) still can't finish a reply inside a short timeout — latency alone doesn't predict that (M19-S13 precedent, 2026-08-19 — full incident: `docs/ENGINEERING_RULES.md` § OpenRouter chatbot outbound HTTP resilience).
- **A backend service's own per-attempt outbound-call timeout and the caller's (BFF's) timeout for that same request are a coupled invariant — raising one without raising the other at least as much reopens the same bug.** If the backend's ceiling grows past what the BFF still waits for, the BFF's own timeout can fire before a genuine, in-progress backend response finishes, misreporting a real answer as a generic upstream-unavailable error instead of forwarding it (M19-S13 precedent, 2026-08-19 — `OPENROUTER_TIMEOUT_MS` (backend, `openrouter-llm.adapter.ts`) vs `CHATBOT_MESSAGE_TIMEOUT_MS` (BFF, `platform.public.controller.ts`) — full incident: `docs/ENGINEERING_RULES.md` § OpenRouter chatbot outbound HTTP resilience).

### BFF naming & transport

**BFF module/controller naming, mapper extraction:** full rules (with the M13-S05 precedent for why `.public.controller.ts` always lives under a `public/` prefix): `docs/24-BFF_ARCHITECTURE.md` § Module & Controller Naming Conventions.

**Web → BFF transport:** three helpers cover all calls — never write a raw `fetch()` URL outside them: `bffServerFetch` (authenticated server-only), `bffPublicFetch` (unauthenticated server-only), `bffClient` (axios, client-only, React Query hooks). `useTenant()` is the only source of `tenantId` in hooks. Full signatures, import paths, and the same-origin gateway mechanics: `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer.

### Cross-layer deployment invariants

- **Separate Terraform roots and states do not exchange outputs automatically** — Foundation/environment sequencing is a recurring source of apply-order failures. Full worked examples: `infra/terraform/README.md`.
- **A Terraform module with its own passing `terraform test` suite is not proof it's actually applied by any real root.** Module-level tests (`mock_provider`, `command = plan`) validate the module in isolation — they can't detect that the module is never referenced by a `module` block anywhere in `envs/*` or `foundation/*`. Before treating an existing module as the precedent/target for an IAM (or any) edit, confirm with `grep -rn 'source.*=.*modules/<name>' infra/terraform/` that a real `module` block actually instantiates it — a module referenced only in *comments* elsewhere in the codebase can be a leftover from a later migration that was never deleted. Also remember granting a new secret's IAM accessor role needs **three** places updated together, not one: the module's own `secret_accessors_base` list, the calling env root's own hardcoded `secret_ids` map (`envs/*/main.tf` or `foundation/envs/*/main.tf` — a separate literal list, not derived from the module), and the module's own test fixture. (M19-S02 precedent, 2026-08-11: `infra/terraform/modules/iam/` looked like the real per-SA accessor-binding module — matching naming, matching pattern, its own tests green — but TD34 had already moved the live implementation to `foundation/modules/runtime-identities/` and left the original orphaned, never wired into any root. The new secret's IAM grant was edited into the dead module and merged with all tests green; the real gap was found only when a live `gcloud run services update-traffic` call surfaced a `Permission denied` error days later. **Follow-up, same day:** the fix PR's own stale-reference sweep (`grep -rln "modules/iam"`) still missed two live files — `infra/terraform/envs/prod/main.tf`'s module-dependency-graph comment and `infra/terraform/modules/storage/outputs.tf`'s two bucket-output descriptions — because both referenced the dead module only by its story number (`M17-S17`), never the literal path string. Caught only by two separate cross-tool reviews (Codex, then Copilot independently), not by the sweep itself. **A rename/deletion sweep must grep for every alias of the removed thing, not just its current literal name or path** — a story/PR number, an old short name, a prior class name — since a codebase this well-annotated routinely cross-references the same target multiple ways. Re-run the sweep once per alias, and don't treat "I already swept for the obvious string" as proof the sweep is complete.)
- **A manual diagnostic Cloud Run deploy can silently pin a service's traffic policy to one revision name (instead of `latestRevision: true`), and normal `gcloud run deploy` calls in CI do not reset that pin on their own.** Every subsequent deploy still creates a new revision and the CI job still reports success, but live traffic silently stays frozen on the old revision indefinitely — with no error anywhere in the pipeline. This sharpens the CPU-throttling entry above about reverting manual Cloud Run overrides after debugging: reverting the *image* isn't enough if a manual `gcloud run services update-traffic --to-revisions=<rev>=100` (or equivalent) was also run during that session — that pins the traffic *policy* itself. After any manual diagnostic Cloud Run operation, check `gcloud run services describe <svc> --format='value(spec.traffic)'` for an explicit `revisionName` (needs reverting) vs. `latestRevision: true` (correct), and run `gcloud run services update-traffic <svc> --to-latest` if pinned. (M19-S02 precedent, 2026-08-11: a manually deployed `broken-test`-tagged diagnostic revision on 2026-08-09 — debugging a different, unrelated observability story — pinned `ikaro-backend`'s staging traffic to that day's revision; 5 subsequent CI deploys across ~36 hours all reported "success" while live traffic silently never moved, caught only when this story's own new secrets prompted a live state check instead of trusting green CI.)
- **A CI gate built on a path-diff filter (`dorny/paths-filter`, or the native `on.push.paths`) checks a static fact about one commit's diff — never live/current state — so `gh run rerun` cannot clear it, no matter how long ago the underlying condition was actually resolved.** Re-running a failed run re-executes against that same run's already-computed diff; a job gated on "did this push touch path X" will fail identically forever on that commit. The only correct recovery is a genuinely new push (an empty commit is fine — `git commit --allow-empty`) so a fresh diff gets computed against its own parent. Any workflow error message that tells an operator to "just re-run the failed job" after resolving an external prerequisite is very likely wrong — verify what the gate actually re-evaluates before writing that instruction. (M19-S02 precedent, 2026-08-11: the `foundation-apply-required` CI gate added the same day this bullet was written shipped with exactly this bug in its own first-drafted remediation message — caught immediately by the user asking "how do you know it was run, instead of failing always?" before the flawed instruction ever reached a real incident.)
- **A diff-based CI gate ("did this push touch path X") is structurally insufficient for "is prerequisite Y currently satisfied," not just imprecise — any later, unrelated push has an equally empty diff against X and silently sails through even when Y was never actually done.** The fix isn't a better diff-based check — it's asking a different question: find the most recent commit that touched X, then verify (against a system that reflects current reality, not this push's own history) that Y has been satisfied for a commit at or after it. GitHub's own Actions API (run history, job conclusions) already is such a system for "did workflow W succeed" — no new infrastructure needed. **When that verification needs to cross a deliberately-separated security boundary (here: TD34's Foundation isolation), prefer whatever already-available signal requires zero new trust grant over reaching for a credential from the other side of that boundary — even a read-only one.** Impersonating a Foundation identity (even `ikaro-tf-foundation-planner`, read-only) from the normal `infra-deploy.yml` pipeline would itself widen that pipeline's blast radius into exactly the boundary TD34 exists to keep separate; querying GitHub's own Actions API for `foundation-deploy.yml`'s run history costs nothing on that front and answers the same question. (M19-S02 precedent, 2026-08-11, same session as the bullet above: the user caught this exact gap by walking through a concrete scenario — "if I don't run foundation and push again, would that pass?" — then, when a live-state Terraform-plan check was proposed as the fix, caught that it would require granting the normal pipeline a new Foundation-identity credential, before either flaw shipped. The final design walks `git log`/`git merge-base --is-ancestor` plus `gh api .../actions/workflows/foundation-deploy.yml/runs` — verified end-to-end against this repo's real run history, both the block-case and the pass-case, before merging.)
- **Migrations that grant privileges to infrastructure-created database roles must enforce provisioning order or provide convergent reconciliation.** A migration that silently skips a missing role is safe only when the deployment process guarantees Foundation creates the role first; otherwise it records a one-time no-op and leaves the role permanently under-privileged.
- **Security dependency overrides are temporary compatibility boundaries, not permanent pins.** When a fixed upstream release becomes available, update the override and lockfile together, then verify the resolved dependency graph with the repository scanners; never leave a stale vulnerable version pinned merely because the override once addressed an older advisory.
- **A Dependabot Docker base-image digest bump must be verified to stay within the same image variant/family before merging** — digest-only `FROM image@sha256:...` pins give Dependabot no tag to anchor updates to, so it can silently resolve to a same-repository-different-variant digest (e.g. `node:22-alpine` → the full Debian `node:22` image), introducing a wave of new Trivy CVEs with no corresponding code change (PR #309 precedent — full verification steps: `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` § Docker base-image digest pinning).
- **The autonomous implementation chain (§9) must not treat "tests pass, lint clean, bots clean" as sufficient for a story touching Terraform/IAM/Pub/Sub/CI-CD — it needs an actual live-verification check before the PR is handed to the human for merge review.** Three separate M19 stories (S02, S07, S08) each merged with clean bot review and a human PR read, then broke within hours on live deploy: a Terraform module edited but never wired into any real root (S02 — the dead-module incident above), a foundation-apply deadlock only visible when actually applying (S07), a missing IAM grant only visible once the code actually ran (S08). None were spec ambiguity or a code-reading failure — discovery was clear and the diff looked correct; the gap was between the code and the deployed environment's live state, which only a live check can reveal. For any story in this category, run the concrete check the change implies (confirm a module is referenced by a real `module` block per the bullet above, confirm an IAM grant actually resolves, a real `terraform plan -refresh-only`) as part of the chain, before presenting the PR as ready for merge — a failed or un-runnable check is its own stuck condition (§9), not something the merge review is expected to catch by reading source (sanity-checked against real M19 PR/commit history, 2026-08-21).

### Web styling boundary

*(`--ba-*` dashboard/hotsite boundary already covered in §8's anti-patterns excerpt above — not restated here.)*
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
ESLint + Prettier · `tsc --noEmit` · all tests · coverage ≥ 80% on changed code · SonarCloud GREEN · Snyk SCA · Gitleaks · Trivy · Checkov/Tfsec

When SonarCloud is failing, treat the live issue list/quality gate as the only source of truth — never fix from stale logs or guess from the diff (see `docs/ANTI_PATTERNS.md`'s SonarCloud row for the exact discipline and how to verify a fix actually moved the metric).

### Definition of Done
Full checklist (coverage, migration pre-production exception, stale-reference sweep, all with precedents): `docs/DEFINITION_OF_DONE.md`. Checked before `/pre-pr` runs (§9 Steps 3–9).

---

## 8. Anti-Patterns (BLOCK MERGE)

Full list (~115 entries) in `docs/ANTI_PATTERNS.md` (loaded automatically by `/pre-pr`). The ones below are the highest-severity/most-recurring — likely to be hit *while writing code*, before `/pre-pr` ever loads the full list:

| Pattern | Fix |
|---|---|
| `useExisting` when registering adapter token | Use `useClass` — `useExisting` still instantiates the class even when the token is overridden in tests |
| New cross-context Port+Adapter when one already exists for the same context pair | Grep `infrastructure/cross-context/` first; add a method to the existing adapter instead |
| Shared VO `create()` throws plain `Error` for validation it owns | Give VO a typed domain error; add `instanceof` branch to every calling `mapXxxError` |
| New interface in `apps/web/features/**/api/**`, `apps/web/shared/lib/api/**`, or `apps/web/shared/types/**` without checking `@ikaro/types` | Grep `@ikaro/types` first — either side may be stale; verify against live BFF schema if shapes differ. **CI-enforced** by `packages/architecture-check`'s `ikaro-types-drift` detector (TD37 Story 11, `pnpm architecture-check`) — full-codebase, every PR, not diff-scoped |
| Inline mapper functions accumulating in a BFF `*.controller.ts` | Extract to `<module>.mapper.ts` (plain functions, not a class) once a second mapper appears |
| Duplicate read endpoints/use cases for projections of the same aggregate/config | Keep one canonical read endpoint/use case; derive caller-specific values in the BFF mapper or web helper |
| Staff hotsite login link to `/dashboard/login` without `?tenantSlug=` | Append `?tenantSlug=${encodeURIComponent(slug)}` — without it, linked accounts at another tenant are silently routed there |
| BFF `@CurrentUser()` used only to construct a backend `/internal/` URL | Move endpoint to authenticated controller — `BackendHttpService` already forwards actor headers; `/internal/` is pre-auth only |
| Dashboard or account component uses a `--ba-*` CSS variable | `--ba-*` only exists under `app/[slug]/` (hotsite tree). Use Tailwind + shadcn in dashboard/account shells |
| Fixed a Zod/DTO validation rule in one layer (BFF or backend) without checking the other for a duplicate schema | Grep the field name in both layers — BFF and backend often maintain independent copies of the same schema |
| Zod validation rule duplicates a VO's own check (e.g. `.refine(Email.isValid, ...)`) | Reuse that VO's error code — don't mint a new one. Rules with no VO behind them share a small closed `GenericErrorCode` set instead of one code per site (`docs/ENGINEERING_RULES.md` § Single source of truth for a validation rule's code) |
| An aggregate's update method re-validates a field even when the value passed through unchanged | Compare against the current stored value first; skip validation when nothing actually changed (see the SEO-limit row in the full doc for why this matters) |
| A route is added to an existing hide-list/allow-list by pattern-matching neighbors | Name the invariant every current member satisfies before adding a new one — surface similarity isn't the same as satisfying the same rule |
| A non-repository class (service, publisher, handler) contains raw SQL, `@InjectRepository`, or TypeORM `Repository<T>` directly | Extract `IXxxRepository` (`shared/ports/` for cross-cutting, `<ctx>/application/ports/` for a bounded context) + `TypeOrmXxxRepository` adapter; the class depends on the port only — see `docs/AGENT_PATTERNS.md` Pattern #1 |
| A module is marked `@Global()` (or re-marked when a token gains new consumers) without adding that token to `exports:` | `@Global()` only waives the *importing* module's need for an `imports:` entry — it never substitutes for `exports:`. A provider left out of `exports:` stays unresolvable everywhere, and the DI error points at the consumer, not the missing `exports:` line |
| New error code added to `@ikaro/types` without a translation entry in both locale files | Add the entry to both `packages/i18n/locales/pt-BR/errors.json` and `.../en/errors.json` in the same commit — `apps/web`'s exhaustiveness test (TD23 Story 17) fails CI on a missing one, not just a lint warning (M17-S30 precedent, 2026-07-18: `AUTH_RATE_LIMITED` shipped without either translation, caught only by the Web Unit Tests CI job) |

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

**2. Push** — `ci:fast` (lint + type-check + unit tests) runs automatically and blocks if it fails. (`ci:local`, `pnpm ci:local` ~5 min Docker, is optional and only worth running first when touching Dockerfiles, infra, or integration-test paths.)

**3. `/pre-pr`** — runs automatically once pushed (no permission prompt to start it): script, agent checks, bad-smell-audit, integration tests. Fix any failure and re-run; do not proceed until it reports zero issues across all steps.

**4. Open the PR** once `/pre-pr` clears:
```bash
gh pr create --title "feat(<context>): <description> (M0X-SYY)" \
  --body "## Summary\n- <bullet>\n\n## Story\nM0X-SYY\n\n## Test plan\n- [ ] Unit tests pass\n- [ ] Type-check clean\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)" \
  --repo lmmoreira/ikaro
```

**5. Monitor CI; triage bot reviews** — run `/pr-land` (full mechanics: `.claude/commands/pr-land.md`). It posts the CodeRabbit trigger and dispatches Codex (round 1, from `/pre-pr`), then loops: wait for every in-scope actor of the round (CI + Codex always, CodeRabbit round 1 only) to finish, pool every finding together, apply all fixes as **one commit + one push**, re-dispatch Codex only for the next round. Never react to a single actor mid-round — a fix based on Codex's result while CI is still running (or vice versa) wastes a round. Repeat until CI is green and Codex reports 0 unresolved Critical/Important.

**Bot-finding discipline (mandatory, every finding, every round — this is what keeps the loop from becoming blind vibe-coding):**
1. Read the comment.
2. Check it against actual codebase practice — grep for the real precedent it claims to violate; don't take the bot's claim at face value.
3. Check it against the real business scenario/UC — a flagged "inconsistency" may be deliberate (e.g. different timezone conventions in two functions).
4. Only if it survives both checks — actually relevant, actually applicable — apply the fix.
5. If it doesn't survive, reply on the thread explaining why it's not being applied — never silent-ignore.
6. If relevance genuinely can't be determined either way, that's a stuck condition (below) — escalate, don't guess.
7. If a finding needs a business or design decision (a naming/scope choice, a UX tradeoff, "should this even work this way") rather than a pure code-correctness question — escalate immediately, regardless of round number. This is not usual bot-fix work; it's a decision only the user can make.

Also: severity labels (`Critical`) are not evidence on their own — verify against framework source (`node_modules/.pnpm/...`) when the claim is about third-party behavior. Check which commit range the review actually covers first (stated in the review body) — local commits since then may have already fixed some findings; cross-check each finding against the *current* file content, not the diff shown in the review. CodeRabbit's own pre-merge "Description check" and "Docstring Coverage" checks are calibrated to CodeRabbit's generic defaults, not this repo's conventions — expect both ⚠️ on every PR; not actionable, don't chase them.

**6. Infra-touching stories — live-verification gate:** if this story touches Terraform, IAM, Pub/Sub, or CI/CD, run the concrete live check the change implies (confirm a Terraform module is referenced by a real `module` block, confirm an IAM grant actually resolves, a real `terraform plan -refresh-only`) **before** treating the PR as ready for the human merge review — see §7's Cross-layer deployment invariants for why "tests pass, bots clean" isn't sufficient for this category. A failed or un-runnable check is its own stuck condition.

**If the branch conflicts with `main` after it's already been pushed and reviewed:** merge, never rebase — full rule + fix: `docs/CI_TRAPS.md` § A compile/test failure only exists in CI, and won't reproduce even in a clean clone.

**Stuck conditions — escalate to the user, never force through:**
1. A CI/test failure that doesn't resolve within a reasonable number of genuine fix attempts, or whose only apparent fix would be a workaround the "no workarounds" rule (§7) forbids.
2. A bot finding whose relevance can't be confidently determined either way (bot-finding discipline step 6 above), or one that needs a business/design decision (step 7 above) — the latter escalates immediately, not gated on round count.
3. A failed or un-runnable live-verification check on an infra-touching story (item 6 above).
4. `/pr-land` reaches round 5 with Codex still reporting ≥1 unresolved Critical or Important finding (Minor-only doesn't count). Describe what's recurring across rounds and what's been tried — don't attempt a 6th round unprompted.

When stuck, stop and describe the specific blocker — don't keep iterating to force a green check, and don't silently drop the finding either.

### Step 10 — Ask user before merging
This is now the primary point where implementation-time surprises get caught, not a formality — treat it as a substantive read of the actual diff. Ask: *"All checks are green on PR #N — happy to merge?"* Then:
`gh pr merge <PR-number> --repo lmmoreira/ikaro --squash --delete-branch && git checkout main && git pull origin main && git branch -D <branch-name>`

Always delete the local branch with `-D` (not `-d` — squash merges aren't recognized as fully merged).

### Step 11 — Mark done
`/mark-done M0X-SYY` — the last-mile check, not just bookkeeping: independently re-verifies AC evidence and that any Critical/Important `/pr-review`/bot finding on the merged PR was actually resolved, opening a bug-fix TD via `/create-td` for any real gap rather than silently marking done — then updates the plan file, commits to main, alerts if milestone complete. (TD stories: no separate command — see `mark-done.md`'s note on marking a TD story done directly in its own feature branch.)

**If a worktree was used, clean it up immediately after — no need to ask:** `git worktree remove .claude/worktrees/<name> --force`, delete the local branch(es) with `-D`, prune the stale remote-tracking ref (`git fetch --prune origin`). Verify the removal actually took with `git worktree list` — don't trust a success message alone.

### Step 12 — Milestone complete?
If all stories are `✅ Done`: create `plan/MXX-<NAME>_IMPLEMENTATION_DETAILS_IA.md` + `_DEVELOPER.md`; add IA file to §10. Also do the stale-documentation sweep described in `/mark-done`'s milestone-complete reminder — a safety net for any story that skipped `docs/DEFINITION_OF_DONE.md`'s stale-reference-sweep item.

### Parallel batch execution (optional)

For a milestone with many independent stories, `/run-batch` runs a small batch (default 2, cap 5) concurrently instead of one story at a time. A **batch** is stricter than a milestone "wave" (`/discovery-to-milestone`'s waves only guarantee dependency order between waves — a later story in the *same* wave can still depend on an earlier one, per that skill's own worked example) — a batch additionally requires zero dependency edges and zero overlapping files between every pair of its stories, checked live against the plan file at run time, never assumed from wave membership alone.

Mechanically: discovery for every story in the batch runs first, sequentially, in one interactive session — a spawned subagent can't pause mid-run for a live reply, so discovery can't itself be parallelized — ending in one consolidated Q&A across the whole batch (mirroring `/discovery-to-milestone`'s own batched-question pattern). Only once every story is READY does the expensive part — the autonomous implementation chain (Steps 3–9 above) — fan out across parallel worktree-isolated `Agent` calls, one per story. Stuck conditions and "PR ready for merge" are reported per-story as they land, never held until the whole batch finishes, and the merge review stays just as substantive per story as it would be running one at a time. Full mechanics: `.claude/commands/run-batch.md`.

---

## 10. Dynamic Context Loading — Load Only What You Need

| Task | Docs to load |
|---|---|
| Writing any code | `docs/CODE_STANDARDS.md` + `docs/AGENT_PATTERNS.md` + `docs/ENGINEERING_RULES.md` |
| Finishing a story / before PR | `docs/DEFINITION_OF_DONE.md` |
| CI failure / pre-PR | `docs/CI_TRAPS.md` |
| Implement a UC | `docs/04-USE_CASES.md` (UC section) + `docs/02-DOMAIN_MODEL.md` + `docs/03-DOMAIN_EVENTS.md` |
| Database / migration | `docs/13-DATABASE_SCHEMA.md` + `docs/02-DOMAIN_MODEL.md` |
| API endpoint | `docs/14-API_CONTRACTS.md` + the cited UC |
| Event handler | `docs/03-DOMAIN_EVENTS.md` + `docs/05-BOUNDED_CONTEXTS.md` + `docs/ENGINEERING_RULES.md` |
| Staff OAuth login / invite link | `docs/ENGINEERING_RULES.md` § Staff OAuth login URL format + `td/TD13-STAFF-INVITE-EMAIL-LINK.md` |
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
| Writing Terraform / infra code | vendored HashiCorp Terraform skills from `.claude/skills/` + `plan/M17-CLOUD-DEPLOY.md` §0–§2 + `infra/terraform/README.md` (layout, state, version-constraint + unit-test conventions) |
| TD34 foundation / IAM transfer | `td/TD34-TERRAFORM-DEPLOYER-PRIVILEGE-ESCALATION.md` + `infra/terraform/foundation/README.md` before editing Terraform or workflows |
| Observability | `docs/10-OBSERVABILITY_STRATEGY.md` |
| Implementing a milestone story | Load `plan/<M0X>-<NAME>_IMPLEMENTATION_DETAILS_IA.md` for that milestone (`ls plan/*_IMPLEMENTATION_DETAILS_IA.md` to list). Special cases: `plan/M115-PRODUCTION-READINESS_IMPLEMENTATION_DETAILS_IA.md`, `td/TD02-LOCALIZATION.md` |
| New journey or prototype | `plan/journey/README.md` |
| Starting a new discovery from an idea | `/create-discovery` — see `.claude/commands/create-discovery.md` |
| Promoting a `docs/discovery/` doc into a milestone | `/discovery-to-milestone` — see `.claude/commands/discovery-to-milestone.md` |
| Creating or standardizing a TD | `/create-td` — see `.claude/commands/create-td.md` |

**Anti-patterns reference:** `docs/ANTI_PATTERNS.md` — full table; loaded automatically by `/pre-pr`.
**Never load:** `docs/archive/` (superseded) · `plan/*_DEVELOPER.md` (written for humans, not agents).

**Drafting a new milestone:** Consolidate into the single canonical `plan/M0X-<NAME>.md` before any story starts. Sequence backend/BFF-only stories in an early wave before any frontend story that depends on them.

---

## 11. Repository Layout — Domain-Slice Architecture

Full trees: `docs/REPOSITORY_STRUCTURE.md` · Rationale: `docs/11-ARCHITECTURE.md` · BFF detail: `docs/24-BFF_ARCHITECTURE.md` · Migration history: `td/TD-21-SEPARATION-REPOSITORY-INTO-DOMAIN-SLICES.md` (resolved — this is the live architecture, not a future plan).

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
- **Actor-scoped view of another domain's aggregate** (e.g. a Customer reading/mutating their own Booking or Loyalty data) lives in the *owning* domain's slice (`booking`/`loyalty`), never the actor's slice (`customer`) — matches the existing Staff-facing pattern, where Staff-facing Booking operations already live in `booking`, not `staff`. Scope the export names to make the actor obvious (e.g. `cancelBookingAsCustomer`), don't just drop an unqualified function into the owning slice (decided 2026-07-23 per TD31 Story 11, closing a prior undocumented split where Customer-facing Booking/Loyalty code had drifted into `features/customer/`).
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

## 14. Project Slash Commands (Claude Code)

Canonical registry: §17.

---

## 15. Journey & Prototype Workflow Rules

> ❗ **HARD STOP — READ BEFORE TOUCHING ANY `plan/journey/` FILE**
> `/docs-audit` MUST run and report a clean baseline first. Then: (1) write `<actor>/<slug>.md`, (2) update `<actor>/use-cases.md`, (3) update `plan/journey/README.md`'s index, (4) **only then** create files under `<actor>/prototypes/<slug>/`.

Full rules, folder structure, and CSS gotchas (`.topbar-avatar`, `.week-nav`, `padding-bottom`, floating toast, etc.): `plan/journey/README.md` — load whenever working on any journey file or prototype folder.

---

## 16. Vendored HashiCorp Terraform Skills

Pinned Terraform skills live in `.claude/skills/`; refresh them by re-vendoring from upstream and updating each `VENDORED_FROM.md`.

---

## 17. Project Skills & Commands Registry

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
| `/create-td <problem description \| TDNN + description>` | `.claude/commands/create-td.md` |
| `/discovery-to-milestone <discovery-doc-path>` | `.claude/commands/discovery-to-milestone.md` |
| `/docs-audit [UC-XXX\|M0X\|actor/slug\|doc-path]` | `.claude/commands/docs-audit.md` |
| `/mark-done M0X-SYY` | `.claude/commands/mark-done.md` |
| `/pre-pr` | `.claude/commands/pre-pr.md` |
| `/pr-land [PR#]` | `.claude/commands/pr-land.md` |
| `/pr-review [PR#]` | `.claude/commands/pr-review.md` |
| `/run-batch [M0X \| M0X-SYY/TDNN ...]` | `.claude/commands/run-batch.md` |
| `/story-discovery M0X-SYY` | `.claude/commands/story-discovery.md` |

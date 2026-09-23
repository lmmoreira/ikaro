# Ikaro — Engineering Rules: Backend (+ Database, BFF)

> **When to load:** backend use cases, transactions, migrations, event handlers, BFF implementation, database work.
> Split from `docs/ENGINEERING_RULES.md` (TD41-S4, 2026-09-23). BFF content is folded in here — too small (~30 lines) to justify its own file. Summary rules are in `CLAUDE.md §7`.

---

## Transactions

Every `save()` in every use case must be wrapped in `ITransactionManager.run()` — including single-aggregate writes. TypeORM's `save()` is a merge (internal SELECT + UPDATE/INSERT); without a transaction those two DB ops are not atomic.

**Scope rule:** wrap only the `save()` call(s) — reads, validations, and domain mutations happen *before* `txManager.run()` opens.

**No cross-service network I/O inside the block, on either side.** The scope rule above is about *reads* happening before — the same discipline applies to *post-commit side effects* after: an HTTP call to another app/service (cache invalidation, a webhook, a cross-context adapter that leaves the process) must never run inside `txManager.run()`. Doing so holds the DB connection/transaction open for that call's full latency, risking connection-pool exhaustion and lock contention under load, and couples write durability to an unrelated system's availability. Call cross-context side effects that involve network I/O (e.g. `BookingPlatformAdapter.revalidatePublicPages()`, invoked after service create/update/activate/deactivate) *after* `txManager.run()` returns, and if the port documents that call as best-effort/never-throw, verify the *entire* adapter method actually enforces that — wrap the whole body in try/catch, not just the one call that looks obviously network-bound (a DB read earlier in the same method can throw too; Codex review finding, PR #267, 2026-07-27).

**A count-based cap/rate-limit check must persist its own reservation *before* the slow external call it's gating, not after — or the "accepted narrow race" this codebase already tolerates for simple COUNT-then-INSERT checks silently becomes a much wider one.** The natural shape — check the count, call the slow external service, save the row that made this request count — looks like it defers the DB write for good reason (reads before writes, external I/O outside `txManager.run()`, both correct on their own). But it means a concurrent request's own COUNT query can't see this request at all until *after* the external call returns, so the race window is that call's full latency (seconds, for an LLM/HTTP call), not the DB round-trip window a `COUNT` immediately followed by an `INSERT` normally has. Fix: persist the reservation (create-or-update the counted row, in its own `txManager.run()`) immediately after the cap check passes, *before* the external call — this narrows the window back down to the same accepted DB-round-trip race already tolerated elsewhere, without reintroducing slow I/O inside a transaction. (M19-S05 / PR #360 review, 2026-08-12: `SendChatMessageUseCase`'s concurrency cap (`chatbot_sessions`) and message cap (`chatbot_sessions.message_count`) both had this bug — the session/count was only saved in the final transaction alongside the two message rows, *after* `ILlmProvider.complete()` returned, so a concurrent burst could see 0 active sessions and all pass the check simultaneously. Fixed by moving the reservation save to immediately after the cap checks, before the LLM call — see `send-chat-message.use-case.ts`.) This is the same principle the idempotent-consumer "Atomic claim" pattern (§ Event Handlers below) already applies to *duplicate delivery* (claim before the effect, `unclaim` if it fails) — here applied to *cap enforcement* instead.

**Multi-aggregate writes:** wrap all saves together in a single `txManager.run()`.

**Test wiring:** inject `new InMemoryTransactionManager()` in every unit/controller spec: `{ provide: TRANSACTION_MANAGER, useValue: new InMemoryTransactionManager() }`. For integration: import `TransactionManagerModule`.

**Repository transaction-awareness:** write methods check `getActiveEntityManager()` — use active `EntityManager` if present, else fall back to `this.repo`. Read methods do not need this — **except a read that runs after a write earlier in the same `txManager.run()` block and depends on seeing that write's own not-yet-committed effect.** A plain `Repository.find()`/`.findOne()` always issues its query through the injected `Repository`'s own connection, never the ambient transactional `EntityManager` — so it cannot see an uncommitted write from the same logical transaction, even though both run "inside" the same `txManager.run()` call. The read silently returns pre-write state until the transaction commits; nothing throws, so this surfaces only as a wrong result, typically off by exactly one call to the job/use case (`ChatbotRetentionPurgeJob` precedent below). Make only the specific read(s) that need this transaction-aware (`getActiveEntityManager() ?? this.repo`), not every read on the repository — most reads still run standalone, before any transaction opens, where the blanket rule above is correct. (M19-S07 precedent, 2026-08-13: `ChatbotRetentionPurgeJob` deletes old `chatbot_messages` rows, then — in the same transaction — checks whether each candidate `chatbot_sessions` row is now orphaned. The first draft used the existing `findBySession()` read, not transaction-aware, so the orphan check still saw the just-deleted message as present; every session was detected as orphaned exactly one job run late. Caught only by the story's own real-DB integration test — the in-memory unit test double has no transaction isolation at all, so it couldn't reproduce the bug. Fixed with a dedicated, transaction-aware `existsForSession()` existence check, added specifically for this call site rather than widening `findBySession()`'s contract for its other, non-transactional callers — see `chatbot-message-repository.port.ts` and `typeorm-chatbot-message.repository.ts`.)

**Transaction ownership:** `ITransactionManager.run()` is the only application-facing transaction boundary. Repository ports expose persistence operations, never `runInTransaction(...)` callbacks or `EntityManager`; their TypeORM adapters simply join the ambient context. When a durable DB row must drive external I/O (for example the outbox relay), use short transactions to claim/lease and then mark or release the row, with the network call between those transactions. Never keep locks or a database connection open while publishing, calling HTTP, or doing any other cross-service I/O. ESLint enforces the repository-port half of this rule in CI (`no-restricted-syntax`).

| Artifact | Location |
|---|---|
| Port | `src/shared/ports/transaction-manager.port.ts` |
| Real adapter | `src/shared/infrastructure/typeorm-transaction-manager.ts` |
| Global module | `src/shared/infrastructure/transaction-manager.module.ts` |
| Test double | `src/test/infrastructure/in-memory-transaction-manager.ts` |
| Context propagation | `src/shared/infrastructure/transaction-context.ts` |

### Cross-row invariants: transaction scope is necessary, database enforcement is authoritative

Some business rules are not "single-row correctness" rules; they are **cross-row invariants**. Booking slot exclusivity is the canonical example: "no two `APPROVED` bookings overlap for the same tenant." `@VersionColumn` and optimistic locking do **not** protect this kind of rule, because they only detect stale writes to the **same row**.

Rule:

- Re-check any cross-row invariant **inside** the write transaction. A pre-transaction read/check is a TOCTOU race.
- Treat the database as the final authority for the invariant. For booking slot exclusivity, use a Postgres exclusion constraint over the persisted time range.
- If you add an app-level lock (for example `pg_advisory_xact_lock(...)`) to narrow concurrent attempts around the in-transaction check, treat it as a companion to the DB constraint, not a replacement for it.

In other words: transaction scope fixes "check-then-act outside the write"; the database constraint fixes "two writers race anyway."

**A single exclusion constraint stops generalizing once "the tenant" is no longer the one thing being protected — the granularity has to move to whatever the shared resource actually is, and a single shared table (not one per family) is what keeps the constraint enforceable at all.** `EX_booking_bookings_approved_slot` (retired by M22-S03, replaced by `booking.resource_occupancy`'s own GIST exclusion) worked because there was exactly one thing to protect per tenant, one row per booking. Once a booking can lock a *bundle* of resources, a different resource per *leg*, or share a resource with a materialized session from a completely different aggregate family, there is no longer one row per booking to key an exclusion constraint on — the granularity has to move to one row per resource-assignment, and every family that can ever contend for that resource has to write into the *same* table, because a Postgres exclusion constraint cannot span two tables. Splitting per-family "for cleanliness" reintroduces exactly the race the constraint exists to close. M22 (Multi-Vertical Scheduling)'s `booking.resource_occupancy` is the concrete instance: one shared GIST exclusion constraint, keyed on `(tenant_id, resource_id, [starts_at, ends_at))`, protects appointment bookings (Cluster 2) and, once it ships, class sessions (Cluster 4) against each other on a resource that participates in both — see `docs/02-DOMAIN_MODEL.md` § Booking Context (UC-060's note) and `docs/13-DATABASE_SCHEMA.md` for the full schema. A not-yet-materialized future pattern (a recurring template or standing schedule) still needs a companion transaction-scoped advisory lock in canonical resource-ID order, the same "companion to the DB constraint, not a replacement for it" principle above — the exclusion constraint alone can't protect a commitment that has no row yet.

### Choosing a race-condition primitive, and where its lock port should live

This codebase has three real primitives for a race condition, each matched to the shape of the race — pick by shape, not by "add a lock and see":

1. **DB exclusion constraint** (over a persisted range/value) — the invariant is "no two of these *rows* can overlap/collide," and the rows already get created. Strongest guarantee (survives any application-code bug); prefer it whenever the invariant maps onto column values Postgres can express in a constraint. See "Cross-row invariants" above.
2. **A real row lock — `findByIdForUpdate()` / `SELECT ... FOR UPDATE`** — a row *already exists* (an aggregate being read, then conditionally written, inside the same transaction), and a concurrent writer must not see a stale value or write a conflicting one. Goes through the aggregate's own repository, so it automatically bypasses any read cache sitting in front of the normal `findById()` — this is a load-bearing property of the primitive, not incidental (see "A lock only orders callers who both acquire it..." above for what goes wrong when an advisory lock is used here instead). Use this whenever the row to lock already exists.
3. **`pg_advisory_xact_lock` via a dedicated lock port** — there is *no row to lock yet* (the thing being protected is about to be *created* — e.g. "only one opening can be created for this tenant+date"), or the invariant spans multiple tables in a way no single exclusion constraint can express. Purely cooperative: it only blocks other callers who also explicitly acquire the same key. Transaction-scoped, released automatically on commit/rollback.

**Primitive 2 also generalizes to locking several rows of the same kind together in one transaction — batch them into a single query with an explicit deterministic order, not N sequential single-row locks.** When a use case must lock more than one row of the same aggregate type before writing (e.g. every `Service` a multi-line booking references), a batched `SELECT ... WHERE id IN (...) FOR UPDATE` is both cheaper than N sequential `findByIdForUpdate()` calls (one round trip, and a narrow column projection instead of hydrating each full aggregate) and *requires* an explicit `ORDER BY` on a stable key — Postgres gives no lock-acquisition-order guarantee for an unordered `IN (...)` query, so two concurrent callers referencing overlapping rows in different array orders can still deadlock without one. M22-S01 precedent, PR #479, 2026-09-15: `lockBookingModels()` batch-locks every service a booking references with `ORDER BY id`, replacing N sequential `findByIdForUpdate()` calls that were serializing unrelated concurrent bookings under a shared tenant-day advisory lock; the first version omitted the `ORDER BY` and was caught by a later Codex round.

**Where the lock port lives follows the same rule as every other port in this codebase:** start it in the bounded context that owns the race (`<context>/application/ports/`); promote to `shared/` only once a **second real consumer in a different context needs the exact same primitive**, not merely "another context also has some race condition somewhere." Two different races reaching for "add a lock" as the fix does not mean they need the same primitive — check which of the three shapes above the *new* race actually is before assuming it's a second consumer of the *existing* port.

**M21-S03 precedent, PR #460, 2026-09-04:** `ITenantLockPort.lockTenantDay()` is a purely booking-local advisory lock (primitive 3) protecting `schedule_closures`/`schedule_openings` creation races — no row exists yet at lock-acquisition time. Mid-story, a second, unrelated race surfaced: a concurrent `PATCH /tenants/settings` narrowing `businessHours` while `OpenScheduleUseCase` was mid-validation. The first fix added a second method (`lockTenantSettings`) to the *same* port and promoted the whole thing to `shared/` for platform to reuse — treating "another race exists" as sufficient reason to share the port. That promotion was walked back one round later: the settings race wasn't the same shape at all — the tenant row already exists, so the correct primitive was `findByIdForUpdate()` (primitive 2), not an advisory lock. Once corrected, `ITenantLockPort` moved back to booking-local with only its original method, and the `shared/` promotion (`TenantLockModule`, `shared/ports/tenant-lock.port.ts`) was deleted entirely — it never had a real second consumer once the actual mechanism was fixed. Before promoting a lock port to `shared/`, confirm the new consumer needs the *same primitive*, not just "also has a race."

**An advisory lock's key format, once it has ever protected real production traffic, cannot be changed without accounting for a rolling/blue-green deploy running old and new code simultaneously — the same caution applies to any other computed key (a cache key, a hash-routing key) that must match exactly across concurrently-running instances for the same logical entity.** During a rolling deploy, an old instance and a new instance both serve traffic for a window; if the key format changes (e.g. adding a namespace prefix), the two instances compute *different* keys for the identical real-world entity (the same `(tenantId, date)`, the same `(tenantId, staffId)`), so `pg_advisory_xact_lock` never actually serializes them against each other — silently reopening whatever race the lock exists to close, for the entire deploy window, with no error anywhere. A brand-new key with no prior deployed version carries no such risk and can be namespaced freely from the start. M21-S06 precedent, PR #461 round 1, 2026-09-04: adding a `tenantstaff:` namespace prefix to the new `lockTenantStaff` key was safe (nothing live to desynchronize against yet); doing the identical "cleanup" to the already-live `lockTenantDay` key — caught before merging, by Codex review — would not have been. `lockTenantDay`'s key stays byte-for-byte what it has always been; only the genuinely new key got the clean namespace — full incident: `plan/M21-MULTIVERTICAL-FOUNDATION_IMPLEMENTATION_DETAILS_DEVELOPER.md` § 7.

### TypeORM optimistic locking on detached entities

TypeORM's version machinery is safest when it operates on entities it loaded itself. A repository that reconstitutes an aggregate, builds a fresh persistence object, and then calls `manager.save()` is in a danger zone: the resulting write path may not enforce the `version` in the `WHERE` clause the way the domain expects.

Rule for correctness-sensitive aggregate writes:

- If the aggregate write must fail on a stale version, use an explicit version-guarded `UPDATE`.
- Scope the `WHERE` to `id`, `tenant_id`, and `version`.
- If `affected !== 1`, translate that to the aggregate's concurrency error immediately.

Pattern:

```ts
const result = await manager
  .createQueryBuilder()
  .update(Entity)
  .set(updateSet)
  .where('id = :id', { id })
  .andWhere('tenant_id = :tenantId', { tenantId })
  .andWhere('version = :version', { version })
  .execute();

if (result.affected !== 1) {
  throw new XxxConcurrentModificationError();
}
```

Always prove this behavior with an integration test that loads the same aggregate twice, saves copy A, then asserts saving stale copy B fails.

### TypeORM upsert internals — partial-column upserts, `orUpdate()`, and column-name resolution

When two independent writers share one row and each must touch only its own columns (never a full-row `save()`), the partial-column upsert relies on TypeORM internals that are easy to get wrong without reading the actual source (`node_modules/.pnpm/typeorm@.../typeorm/entity-manager/EntityManager.js`, `.../query-builder/InsertQueryBuilder.js`).

**`Repository.upsert()`/`EntityManager.upsert()` only include a column in `DO UPDATE SET` when its value on the passed entity is not `undefined`** — not based on whether the property was ever assigned. Build the entity with only the fields this writer owns actually set; leave the rest genuinely unassigned.

- **`useDefineForClassFields` (on by default under this repo's `target`) makes a declared-but-unassigned class field a real own-property.** `'lastSuccessAt' in entity` returns `true` even when the field was never assigned — the class field declaration itself creates the property, just with value `undefined`. When a test asserts that a partial upsert correctly *excluded* a column, assert on the **value** (`expect(entity.lastSuccessAt).toBeUndefined()`), never on property presence via `in`.

**There is no `InsertQueryBuilder.onConflict()` method** — the real conditional-upsert method (`.orUpdate()`), with a worked example, now lives in `docs/ANTI_PATTERNS.md`'s "`InsertQueryBuilder.onConflict()` doesn't exist" row (relocated 2026-09-20, TD41 — `/pre-pr`'s bad-smell-audit loads that doc automatically, this one it doesn't).

**`orUpdate()`'s `overwrite`/`conflictTarget` arrays take real DB column names (snake_case, matching `@Column({ name: ... })`), not entity property names.** Unlike `.values()`, which translates entity properties to columns via metadata, `orUpdate()` passes each array entry straight through `this.escape(column)` with no translation — confirmed by reading `EntityManager.upsert()`'s own implementation, which explicitly maps `conflictPaths`/columns to `col.databaseName` *before* calling `orUpdate()`. Passing a property name here (e.g. `lastSuccessAt` instead of `last_success_at`) silently generates SQL referencing a column that doesn't exist under that name — verify the exact SQL a new `orUpdate()` call produces against a real database (integration test), not just that it type-checks. (M19-S06 precedent, 2026-08-13: `TypeOrmChatbotProviderBalanceRepository.recordCallOutcome()` needed exactly this — two concurrent calls could write out of chronological order, and a plain `EXCLUDED`-based overwrite would let the older one clobber a newer timestamp.)

---


## Migration backfills

A migration backfilling a newly-derived table doesn't automatically need batching/resumability machinery — scale the safety engineering to the actual, checkable risk, not a reflexive "any full-table backfill is production-risky" default. But "could the source table hold meaningful data yet" must be checked against the right signal — **whether the underlying endpoint/controller that writes to it has already merged to `main`, not whether a dedicated front-end page for it has shipped.** A backend endpoint is a live, callable traffic path the moment it merges and deploys — a direct API call, a smoke test, or another integration can reach it long before any UI page is built to call it naturally. Check `git log origin/main -- <the controller file>`, not the story-dependency graph's page-shipping milestone.

If the source genuinely has no reachable endpoint yet, the destination being a derived lookup/cache (rebuilt going forward by the same code path that maintains it for new rows, not the record of truth) means a missing backfilled row is a self-correcting gap, not a data-loss risk — dropping the backfill is fine. Once real data could exist, backfill it: if the expected row count is still small at this stage of the feature's rollout, a plain one-shot `INSERT ... SELECT` is proportionate — building batching/resumability for a "production scale" that doesn't exist yet is its own form of over-engineering. Re-assess as the feature matures and real volume grows.

**M20-S08 precedent (2026-08-26) — this exact lesson was tested and reversed within the same PR:** a new `lead_form_submission_question_refs` migration originally shipped with an unbounded `INSERT ... SELECT ... jsonb_array_elements(...)` backfill. Round 1: removed it, reasoning "no public-facing submission *page* had shipped yet" (M20-S09, the guest-facing page, ships later) — checked against the wrong signal. Round 2 (Codex review): correctly caught that the public submission *endpoint* (`lead-form-public.controller.ts`) had already merged in an earlier story (M20-S02/S05/S06), so real submissions could already exist via direct API calls — verified with `git log origin/main -- .../lead-form-public.controller.ts`, confirming it. Without the backfill, a pre-existing submission would have answers in `lead_form_submissions.answers` but no row in this derived table, so `GetLeadFormConfigUseCase` would report `hasSubmissions: false` and a manager could remove that question without the required confirmation dialog (UC-037 A4) — a real correctness gap. Backfill restored, with the correct UUID cast this time.

---


## Migration-driven privilege grants to infrastructure-created roles

Migrations that grant privileges to infrastructure-created database roles must enforce provisioning order or provide convergent reconciliation. A migration that silently skips a missing role is safe only when the deployment process guarantees Foundation creates the role first; otherwise it records a one-time no-op and leaves the role permanently under-privileged.

---


## Adding a CHECK constraint to an existing table with live rows

Relocated to `docs/ANTI_PATTERNS.md`'s "Adding a CHECK constraint to an existing table with live rows" row (2026-09-20, TD41) — the `NOT VALID` + `VALIDATE CONSTRAINT` split, the M22-S02 precedent, and the worked SQL example now live there, in the doc `/pre-pr`'s bad-smell-audit actually loads.

---


## LIKE/ILIKE pattern escaping for user-supplied search terms

Relocated to `docs/ANTI_PATTERNS.md`'s "LIKE/ILIKE pattern escaping for user-supplied search terms" row (2026-09-20, TD41) — `escapeLikePattern()`'s usage and the M20-S12 precedent now live there.

---


## Aggregate domain events → outbox (repo auto-flush)

The 4 event-emitting aggregates (`Booking`, `Staff`, `Tenant`, `LeadFormSubmission`) never have their events flushed by a use case. Instead, each aggregate's TypeORM repository drains `clearDomainEvents()` into the outbox as the last step of `save()`, inside the same ambient transaction as the business write (TD24-S02, D6):

```ts
// end of save(), after the entity write — inside the ambient transaction
await drainDomainEvents(aggregate, this.outboxPublisher);
```

**Adding a new use case for one of these 4 aggregates:** inject `@Inject(TRANSACTION_MANAGER)` as usual, but do **not** inject `EVENT_BUS`/`OUTBOX_PUBLISHER` and do **not** write a `for (const event of aggregate.clearDomainEvents())` loop — `repo.save()` already does this. A use case that still contains that loop for one of these 4 aggregates is dead code (the aggregate's `clearDomainEvents()` will already be empty by the time the use case's own loop would run).

**Adding another event-emitting aggregate:** its TypeORM repository must inject `@Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher` and call `drainDomainEvents(entity, this.outboxPublisher)` at the end of `save()`, reusing the shared helper (`shared/infrastructure/outbox/drain-domain-events.ts`) rather than hand-rolling the loop — keeps production repos and their in-memory test doubles from drifting apart. `OutboxModule` is `@Global()` and exports `OUTBOX_PUBLISHER` — within the **real app's** single compiled module graph (`app.module.ts` imports it once), every other module can inject `OUTBOX_PUBLISHER` with no explicit import. **This does not carry over to test module graphs**: each isolated `Test.createTestingModule({ imports: [...] })` call compiles its own separate DI container, so `OutboxModule` must still be added to that `imports:` array at least once per test harness before `OUTBOX_PUBLISHER` (or `OUTBOX_REPOSITORY`) is resolvable there — `@Global()` only means "no import needed *within* a graph it's already part of," not "available everywhere unconditionally."

**Non-aggregate events** (cron jobs constructing a `Command`, a consumer's re-emit) go through `OUTBOX_PUBLISHER` too (TD24-S03) — `EVENT_BUS` is never the publish path for these sites either. The difference from the aggregate-driven flow above is that there's no repository to auto-drain the event, so the call site (the job, or the use case doing the re-emit) must construct the event and call `outboxPublisher.publish()` itself, wrapped in its own `txManager.run()`.

| Artifact | Location |
|---|---|
| Port | `src/shared/ports/outbox-publisher.port.ts` (`IOutboxPublisher`) |
| Drain helper | `src/shared/infrastructure/outbox/drain-domain-events.ts` |
| Real adapter | `src/shared/infrastructure/outbox/outbox-publisher.ts` |
| Global module | `src/shared/infrastructure/outbox/outbox.module.ts` |
| Test wiring | in-memory repos (`InMemoryBookingRepository`/`InMemoryStaffRepository`/`InMemoryTenantRepository`) take an optional `IOutboxPublisher` constructor param (default no-op) and drain the same way — pass an `InMemoryEventBus`/`RoutingInMemoryEventBus` instance to observe published events in a spec |

**Hard invariant (TD24-S03):** `TypeOrmOutboxRepository.insert()` throws `OutboxPublishedOutsideTransactionError` when called with no ambient transaction (`getActiveEntityManager()` returns `undefined`) — there is no standalone-commit fallback anymore. Every call to `OutboxPublisher.publish()`, anywhere, must run inside `txManager.run()`. A repository that opens its own transaction internally (the "no ambient tx from the caller" branch some repos have, e.g. `TypeOrmBookingRepository.save()`) must register that transaction with the ambient-context system itself (`runWithTransactionContext`/`createTransactionContext` + `flushAfterCommitCallbacks`, mirroring what `TypeOrmTransactionManager.run()` does) — otherwise `drainDomainEvents`'s outbox write inside it has no active manager to join and throws.

**A domain event drained into the outbox needs at least one real consumer before it ships to any environment** — the Pub/Sub-topic auto-discovery mechanism, why a topicless event fails permanently and silently, and the M20-S16 incident now live in `docs/ANTI_PATTERNS.md`'s "outbox event with no real consumer" row (relocated 2026-09-20, TD41).

**Adding a cron-published event:**
1. The event class extends `Command` (`shared/domain/command.ts`), not `DomainEvent` — a cron tick can legitimately construct the same business fact twice (retry, overlapping invocation), and `Command`'s required `dedupKey: string` is what the outbox's `UNIQUE(dedup_key)` collapses those duplicates down to one row on. Compute a deterministic key from business identity + a calendar date (tenant-local or UTC, whichever the job already computes for its own query window) — never a fresh UUID.
2. The job injects `@Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher` and `@Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager` — never `EVENT_BUS`.
3. Resolve any cross-context reads (recipient lookups, settings lookups) **before** entering `txManager.run()` — the same "reads before writes" convention as everywhere else. Only the `outboxPublisher.publish()` calls belong inside the transaction.
4. Batch the transaction **per tenant, not per event and not for the whole run**: one `txManager.run()` wrapping all of one tenant's publishes. A mid-run crash then retries only that tenant's un-committed facts as no-op `dedup_key` conflicts on the next run — every other tenant's already-committed rows are untouched.
5. See `contexts/booking/application/jobs/booking-reminder.job.ts`, `admin-schedule-reminder.job.ts`, and `contexts/loyalty/application/jobs/notify-expiring-points.job.ts` for the reference shape, and their `.integration.spec.ts` siblings for the real-outbox dedup proof (two overlapping runs → one row).

---


## Express `Request.user` typing (BFF) — the `skipLibCheck` trap

**A `declare global { namespace Express { interface Request { user?: X } } }` augmentation silently does nothing if a dependency already declares that same member, under this repo's `skipLibCheck: true`.** `@types/passport` already declares `Request.user?: User` (its own deliberately-empty, extensible `Express.User` interface) — a second, conflicting `Request.user` declaration in app code does not error and does not merge with it. Normally TypeScript's declaration merging would flag two interface bodies disagreeing on a member's type ("Subsequent property declarations must have the same type"), but `skipLibCheck` skips checking of *all* `.d.ts` files (including your own new one, not just `node_modules`), so the conflict is silently swallowed and the pre-existing declaration wins everywhere `Request.user` is read — `tsc --noEmit` still passes cleanly, giving false confidence the augmentation "worked."

**Confirmed empirically (TD31 PR4, 2026-07-29):** an `express.d.ts` typing `Request.user?: CurrentUserPayload | GoogleProfile` was added, `tsc --noEmit` passed, but every consumer's inferred type for `req.user` still resolved to Passport's own `User`, not the intended union — proven by reading the actual compiler error at each usage site before the file existed vs. after.

**Fix:** don't fight an interface another dependency already extends this way. Use a shared accessor function instead — one function that does the single necessary cast/narrow (e.g. `getCurrentUser(req: Request): CurrentUserPayload | undefined` in `shared/decorators/current-user.decorator.ts`), which every consumer calls instead of reading `req.user` directly. This achieves the same goal (one canonical, type-safe source of truth instead of N independent ad hoc casts) without needing the global augmentation to actually take effect.

**Before trusting any `declare global` augmentation of a third-party-owned interface compiles correctly:** don't stop at "`tsc --noEmit` passed" — verify the augmented property's *inferred type* at a real usage site (e.g., a deliberately wrong assignment should fail to compile; if it doesn't, the augmentation isn't taking effect).

---


## OpenRouter chatbot outbound HTTP resilience — connect-timeout, retry classification, and provider selection (M19-S13)

**Real incidents, 2026-08-18/19, live-diagnosed via a debug log of the outbound request payload plus OpenRouter's own dashboard generation logs (not simulated).** `apps/backend/src/shared/utils/fetch-and-parse-json.ts` (shared by `OpenRouterLlmAdapter` and `OpenRouterCreditsClient`) hit four genuinely different failure classes in one session, each needing a different fix — the sequence itself is the lesson: don't fix the first plausible cause and stop, keep checking against live evidence until the *actual* mechanism is confirmed.

1. **A raw `fetch()` throw with no distinction between "connection never established" and "server responded but slowly."** A hand-rolled retry loop (`fetchWithRetry`) was added first, retrying only `TypeError`s (real network failures) and not `DOMException`/`TimeoutError`s (the caller's own `AbortSignal.timeout()` firing) — reasoning that retrying a slow-but-connected response wastes time without helping. That reasoning was correct as far as it went, but incomplete: a later incident produced a `TimeoutError` with **no corresponding entry at all** in OpenRouter's own request log for that time window — proof the request never reached OpenRouter's servers, i.e. a stalled TCP/TLS handshake, not a slow response. A single `AbortSignal.timeout()` can't distinguish these two phases; both look identical from the caller's side.

2. **The fix: undici's own `Agent` + retry interceptor, not more hand-rolled classification logic.** Needing a third special case to patch the retry loop was the signal to switch approaches rather than add another one (see CLAUDE.md §7 "Mounting complexity is a signal to reconsider the approach"). `apps/backend/src/shared/utils/fetch-and-parse-json.ts` now imports `Agent`, `fetch`, and `interceptors` from the `undici` package directly (added as an explicit `apps/backend` dependency — already present transitively via `@opentelemetry/instrumentation-undici`, so no new download) rather than using the global `fetch`:
   ```ts
   const RESILIENT_DISPATCHER = new Agent({ connectTimeout: 2000 }).compose(
     interceptors.retry({
       maxRetries: 2, minTimeout: 300, maxTimeout: 800, timeoutFactor: 2,
       methods: ['GET', 'POST'],
       errorCodes: [/* undici's defaults */ 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND',
         'ENETDOWN', 'ENETUNREACH', 'EHOSTDOWN', 'EHOSTUNREACH', 'EPIPE',
         'UND_ERR_CONNECT_TIMEOUT' /* NOT a default — added explicitly */],
       statusCodes: [], // never retry a completed non-2xx response
     }),
   );
   ```
   `connectTimeout` bounds *only* the TCP/TLS handshake — a stalled connection now fails in 2s and gets retried on its own short budget, instead of silently consuming the full response-timeout window just to notice.

3. **Two undici `interceptors.retry()` defaults are easy to miss and both bit this fix on the first pass:** the default `methods` list is `['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'TRACE']` — **`POST` is excluded** (assumed non-idempotent) — and the default `errorCodes` list covers socket-level errors but **not `UND_ERR_CONNECT_TIMEOUT`**. Both must be added explicitly for a POST-based JSON API client (OpenRouter chat completions) to get any retry benefit at all; the interceptor silently no-ops otherwise, with no warning. Also easy to miss: overriding `methods` to add POST without also keeping `GET` silently drops retry coverage for every existing GET caller of the same shared helper (`OpenRouterCreditsClient`'s balance-poll) — caught only because both callers share one `fetchAndParseJson`.

4. **A shared `AbortSignal.timeout()` instance caps the *total* time across every retry attempt underneath it, not a fresh budget per attempt — verified empirically, not just reasoned about.** `OpenRouterLlmAdapter.complete()` constructs one `AbortSignal.timeout(OPENROUTER_TIMEOUT_MS)` and passes it into the same `init` object reused by every attempt. Direct test (real Node, this repo's actual Node version): a first `fetch()` using `AbortSignal.timeout(1000)` waited the full ~1000ms before failing; a second `fetch()` issued ~1200ms later, reusing the *same already-fired* signal, failed in **0ms** — instantly, not with a fresh wait. This means retries never need their own budget accounting to stay within an overall ceiling — the shared signal enforces it by construction — but it also means making a signal-governed `TimeoutError` retryable would be a no-op under this design (a "retry" after the signal fired just fails instantly too), which is *why* `TimeoutError`/connect-phase-survived-retries stays a single, immediate failure rather than something layered on top of the undici retry interceptor.

5. **The backend's per-attempt timeout and the BFF's timeout for the same call are a coupled invariant, not two independent numbers.** `OPENROUTER_TIMEOUT_MS` (backend, `openrouter-llm.adapter.ts`) must stay comfortably below `CHATBOT_MESSAGE_TIMEOUT_MS` (BFF, `apps/bff/src/features/platform/platform.public.controller.ts`, passed as `postForPublic`'s new optional `timeoutMs` override — every other `BackendHttpService` caller keeps the shared 10s default). Shipped values: 8s backend / 12s BFF, deliberately short — not OpenRouter's own generic ~120s recommendation for long-running inference, because this call sits behind a visitor actively waiting in a live chat widget, and this product already asks for short, concise answers (`maxOutputTokens`, `reasoning: 'none'`, the system prompt's own "seja conciso"). If the backend value increases without the BFF value increasing at least as much, the BFF's own axios timeout can fire *before* a genuine (if slow) backend response finishes, misreporting a real, in-progress answer as `BFF_UPSTREAM_UNAVAILABLE` instead of forwarding the backend's actual result or error.

6. **`reasoning: { effort: 'none' }` is OpenRouter's documented, correct way to disable a reasoning-capable model's chain-of-thought — and it is not reliably honored by every provider OpenRouter can route to for the same model.** Confirmed via four real generations from one provider (`AtlasCloud`, routed to `deepseek/deepseek-v4-flash-0731`) across one conversation: `native_tokens_reasoning` of 227, 280, 300, and 300 (out of a 300 `max_tokens` budget) despite `effort: 'none'` being sent on every call — every other provider observed in the same conversation (`OpenInference`, `DigitalOcean`, `CoreWeave`) showed `native_tokens_reasoning: 0`. Two of the four AtlasCloud calls burned the *entire* budget on hidden reasoning and returned `content: null` (a real user-facing failure: `PLATFORM_CHATBOT_PROVIDER_UNAVAILABLE`), not a slow-but-working response. **`provider.require_parameters: true` (OpenRouter's official mechanism for "exclude any provider that can't honor a request parameter") is not sufficient on its own to catch this** — confirmed empirically: a fifth AtlasCloud generation occurred with `require_parameters: true` already active in the request, same failure signature. AtlasCloud is evidently *registered* in OpenRouter's own provider metadata as supporting `reasoning` (so `require_parameters` doesn't exclude it), but doesn't correctly honor the `effort: 'none'` value once selected — a provider-side implementation bug the general capability-declaration mechanism can't see. Current mitigation is both together: `require_parameters: true` (protects against some *other*, not-yet-seen provider doing the same thing) plus an explicit `provider.ignore: ['atlas-cloud']` (the empirically-proven-necessary complement for this specific, already-caught provider). **Do not remove the explicit `ignore` entry on the theory that `require_parameters` alone should cover it — that exact simplification was tried and directly disproven by a live incident in the same session.**

7. **`provider.sort` metric choice matters, and the "obviously right" one for a chat UI was wrong here.** OpenRouter's own guidance recommends sorting by `latency` (time-to-first-token) for chat UIs — tried first. Two real incidents (providers `OpenInference` then `CoreWeave`) showed the actual bottleneck was **throughput** (tokens/sec once generation starts), not latency: `CoreWeave`'s own latency was fine (774ms) while its throughput (2.3 tok/s) meant an 8-second timeout budget could only ever produce ~18 tokens — nowhere near a complete reply regardless of how fast it started. Switched to `sort: 'throughput'`. The generalizable point: when a request has a fixed total-time budget (not just "start responding quickly"), throughput is what determines whether a response finishes inside it — latency alone doesn't.

Full session context (four failure classes, in the order actually diagnosed, each with the real generation data that confirmed or disproved a hypothesis): PR #389, commits from `484c25143` through `da65c0539` and the `undici`-migration commits that followed. Regression coverage: `fetch-and-parse-json.spec.ts` (dispatcher construction + error handling, retry mechanics themselves are undici's own tested code, not re-verified here), `openrouter-llm.adapter.spec.ts`, `openrouter-credits.client.spec.ts`, `platform.public.controller.spec.ts`/`.component.spec.ts` (BFF timeout override).

---


## Backend read use cases for cross-context access

Cross-context adapters must depend on the source context's exported read use cases, not exported `*QueryService` wrappers. Query services tend to become repository pass-throughs and create a second application API beside the use-case layer.

Use this naming pattern:

| Need | Pattern |
|---|---|
| Single aggregate lookup | `Get<Entity>ByIdUseCase` (e.g. `GetCustomerByIdUseCase`, `GetBookingByIdUseCase`) |
| List/search read | `Get<Entities>UseCase` with a filter DTO (e.g. `GetTenantsUseCase`, `GetServicesUseCase`, `GetStaffUseCase`) |

Broad read use cases should accept filters such as `ids`, `status`, `roles`, `search`, `limit`, and `offset` when those dimensions are natural for the aggregate. Avoid super-narrow readers like `GetManagerEmailsUseCase` or `GetServiceNamesUseCase`; return a stable DTO for the aggregate and let the caller map the field it needs. If the correct breadth is unclear, stop and discuss the read contract before adding a new use case.

Response shaping follows the same rule: keep the canonical read use case focused on retrieving the aggregate data, then map the caller-specific view at the boundary that owns that contract. Valid boundaries are controllers, cross-context adapters, BFF mappers, and client-side helpers. Inline mapping is fine for a single caller; extract a DTO or mapper only when the shaped output is reused in more than one place or needs to be shared as a type. Example: `GetBookingByIdUseCase` stays the canonical booking read, while `booking.controller.ts` or a BFF mapper can project it into the response shape a specific caller needs.

---


## Adding a new notification type

Every new `NotificationTemplateKey` touches several files across layers — miss one and the failure mode is silent (a notification that never sends, with no error). Do them in this order:

1. **`notification/domain/notification-template-key.enum.ts`** — add the new kebab-case key (e.g. `BOOKING_NO_SHOW_CUSTOMER = 'booking-no-show-customer'`).
2. **`notification/domain/notification-template-key.mapping.ts`** — add the `{eventName, recipientType}` entry. `notification-template-key.mapping.spec.ts` asserts every enum key has a mapping entry — it fails loudly if you forget this one.
3. **Both** `packages/i18n/locales/pt-BR/notifications.json` **and** `packages/i18n/locales/en/notifications.json` — add `{eventName}.{recipientType}.{subject,body}`. The migration's `buildSeedRows()` throws at migration-run time if either locale is missing the key — there is no silent partial-locale state.
4. **A new migration** to insert the global default rows for the new key (`tenant_id IS NULL`) — do **not** edit `1748100000010-CreateNotificationTemplates.ts` directly once real tenant data exists; that migration has already run in every environment with history. (Editing it in place is only safe pre-production with no deployed history to protect — see the squashing precedent from TD02-S09/S10 — and stops being safe the moment this ships to a real environment.)
5. **A new `send-<trigger>-notification.use-case.ts`** extending `BaseNotificationUseCase`: inject `ILocalizationPort`, fetch templates via `findAllByTriggerEvent`, call `this.localizeTemplates(templates, this.localizationPort, locale)` before `dispatchTemplates`/`dispatchTemplatesToMany` — never read `template.subject`/`template.body` directly, the DB row's own content is not the source of truth.
6. **An event handler** in `infrastructure/events/` if triggered by a domain event (thin — calls exactly one use case, per the Event Handlers rules below), plus provider registration in `notification.module.ts`.
7. **Tests:** a unit spec for the use case using `InMemoryLocalizationPort.setTemplate('EventName:recipientType', {...})` (defaults to `pt-BR`; use `setTemplateForLocale(key, locale, {...})` to also cover `en`), a handler spec if applicable, and a tenant-isolation assertion.

**Gotcha — existing tenants don't automatically get new template rows.** `copyGlobalDefaultsForTenant` only runs once, on `TenantProvisioned` (new-tenant creation). Adding a new key seeds the *global* default row fine, but every tenant provisioned *before* that migration has no per-tenant copy — `findAllByTriggerEvent(tenantId, NEW_KEY)` returns empty, the use case's `templates.length === 0` guard fires, and the notification silently never sends for any pre-existing tenant. There is currently no backfill mechanism. If a new notification type must reach existing tenants, the new migration must also `INSERT ... SELECT` the new global row into every existing tenant's rows directly (mirroring `copyGlobalDefaultsForTenant`'s own query), not rely on the provisioning event.

---


## Staff OAuth login URL format (BFF `GoogleAuthGuard`)

`GoogleAuthGuard.getAuthenticateOptions` constructs the OAuth state from two **separate** query params — it does **not** read a `?state=` param. Any frontend page or email link that starts the staff OAuth flow must use this format:

| Scenario | URL |
|---|---|
| Regular staff login button | `${NEXT_PUBLIC_BFF_URL}/auth/google?type=staff` |
| Invite email link (first login) | `${NEXT_PUBLIC_BFF_URL}/auth/google?type=staff&tenantSlug=<slug>` |

**Common mistake:** `?state=__staff__` or `?state=__staff__:slug` — these are the *encoded* state strings the guard sends to Google internally. Passing them in the browser URL has no effect; the guard ignores the `state` query param and always derives the state from `type`/`tenantSlug`. Both the shared prototype (`shared/staff-login.html`) and the original M13-S13 story spec had this wrong — caught only during a real Google OAuth login attempt in M13-S13.

The existing customer login in `app/[slug]/login/page.tsx` (which uses `${NEXT_PUBLIC_BFF_URL}/auth/google?tenantSlug=${slug}`) follows the same pattern — there is no `type=customer` param because the guard defaults to the customer path when `type` is absent.

---


## `/internal/` routes are pre-auth only

Backend `/internal/` routes bypass `RequestInterceptor` entirely and exist for exactly one purpose: auth-flow calls made **before** a JWT exists — OAuth callbacks (`handleStaffLogin`, `findOrCreate`, `link-google`). If the BFF can reach the endpoint with actor headers already available (`X-Actor-ID`/`X-Actor-Type`/`X-Actor-Role`, via `buildBackendHeaders(req)`), the endpoint is not internal — it belongs on the regular authenticated controller, reading the actor from `RequestContext` instead of a URL/query param. A BFF method whose only use of `@CurrentUser()` is to build an `/internal/` URL is the signal the endpoint is misplaced (see `docs/ANTI_PATTERNS.md`'s `@CurrentUser()`/`/internal/` row).

---


## Event Handlers (Pub/Sub consumers)

Handlers live in `<context>/infrastructure/events/`. They are **infrastructure**, not application layer.

- **Thin by law:** `handle()` calls exactly one use case and rethrows any error. Zero domain logic inside a handler.
- **Subscribe in `onModuleInit()`** via `eventBus.subscribe(eventName, handler, consumerName)`. `consumerName` determines the Pub/Sub subscription name — unique per consumer.
- **Rethrow errors** — Pub/Sub nacks and retries. Never swallow errors.
- **Idempotency in the use case, via the shared inbox (TD24-S04)** — `IInboxRepository` (`shared/ports/inbox.port.ts`), backed by `shared.inbox` (`(event_id, consumer_name)`). No in-memory sets (lost on restart, not shared across pods). Two access patterns, pick by whether the consumer's actual write is DB-constraint-guarded:
  - **Check-then-mark** (`hasBeenProcessed` before the effect, `markProcessed` inside the same transaction as the effect) — use this when the consumer's write already has its own DB unique constraint backing it (e.g. `UNIQUE(tenant_id, booking_line_id)` for loyalty entries, `UNIQUE(tenant_id, email)` for staff). A race just costs a failed insert and a clean retry, never duplicate data.
  - **Atomic claim** (`tryClaim` — `INSERT ... ON CONFLICT DO NOTHING` — before the effect; `unclaim` — `DELETE` — if the effect then fails) — required when the side effect is external and *not* backed by any DB constraint (e.g. notification's actual email/SMS send happens before any DB write). `hasBeenProcessed`/`markProcessed` alone would let two concurrent redeliveries both pass the check before either marks. `unclaim` on failure is what keeps this from becoming the "claim, then crash before finishing, silently drops the effect forever" anti-pattern below. For a multi-recipient consumer (`dispatchTemplatesToMany`), claim per recipient, not once for the whole batch — otherwise one failing recipient's `unclaim` forces a retry to re-send to every recipient, including ones that already succeeded (AUD-004 item 3).
  - See `docs/13-DATABASE_SCHEMA.md`'s `shared.inbox` section for both usage patterns in full, and `docs/ANTI_PATTERNS.md`'s check-then-mark entry for why a bare claim without `unclaim` is worse than no claim at all.
  - **A `consumer_name` that's also used as an inbox dedup key is a durable value, not just a Pub/Sub label — renaming it is a data migration, not a refactor.** `shared.inbox`'s composite key is `(event_id, consumer_name)`; if any row exists under the old value, a later redelivery of that same event looks up the *new* value and finds nothing, silently reprocessing an already-handled event (e.g. double-awarding loyalty points). Safe to rename only when no real dedup records exist yet for that consumer (confirmed pre-production, or via an explicit backfill/rename migration otherwise) — `fix/consistency-naming-consumer` (2026-07-20) relied on this being true for `CompleteBookingLoyaltyEffectsUseCase`/`CreateInitialManagerUseCase`.
  - **A consumer-name rename is also a live-infra risk independent of the inbox:** Terraform derives the subscription/DLQ resource names directly from the same string (`modules/pubsub`), so renaming it destroys the old subscription and its DLQ topic and recreates new ones under the new name. Any unacknowledged delivery sitting in either at apply time is discarded — the 7-day retention setting does not survive resource deletion. Before renaming a consumer that has ever run against real traffic, confirm both the subscription's and its DLQ's backlog are empty (`gcloud pubsub subscriptions describe <sub> --format='value(name)'` plus a check of undelivered-message count / DLQ pull) — a temporary parallel subscription or a documented drain window otherwise. Safe with zero check only pre-production, same condition as the inbox-key risk above.
- **`correlationId` propagation** — pass `event.correlationId` into the use case DTO; never generate a new UUID in the handler.
- **Never hand-type the event/trigger name as a literal at the subscribe/register call site.** `DomainEvent.eventName` is derived from `this.constructor.name` in the base class (`domain-event.ts`) — subscribe with `subscribe<StaffInvited>(StaffInvited.name, ...)`, not a `'StaffInvited'` string that can silently drift from the class if either is renamed. Cron triggers have no backing class, so they get a small exported `const` instead (e.g. `CRON_REMINDERS_TRIGGER` in `cron-trigger-names.constants.ts`), shared between the publishing controller and every subscribing handler. Each trigger handler also declares `static readonly CONSUMER_NAME` (mirrors `CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME`) instead of retyping the consumer-name string. The literal becomes the real Pub/Sub topic/subscription name (`ikaro-{eventName}`) — a typo here silently creates a dead channel no one publishes to correctly, not just a lint nit (M17-S03).
- **Consumer names: always a declared `static readonly CONSUMER_NAME`, never a bare literal at the `subscribe()`/`registerTrigger()` call site — lowercase-kebab-case, matching the Pub/Sub naming convention below.** Location follows ownership, not a fixed rule of "always on the handler": if nothing besides the handler needs the value, declare it on the handler itself (e.g. `AdminDailyScheduleReminderHandler.CONSUMER_NAME`). If the same string is also needed elsewhere — most commonly, a use case's own `shared.inbox` dedup key (see above) — declare it on whichever class owns that other use (e.g. `CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME`) and have the handler reference it from there. Never the reverse: a use case (application layer) must never import a handler (infrastructure layer) just to read its constant — that inverts this codebase's one-directional `domain → application → infrastructure` dependency. Fixed repo-wide 2026-07-20 (`fix/consistency-naming-consumer`) — every handler previously mixed bare literals and inconsistent casing (one use case even used SCREAMING_SNAKE_CASE).
- **A new event handler's class name must be unique across the *whole codebase*, not just within its own context — `packages/infra-scripts/src/pubsub-catalog.ts`'s topic/subscription generator collects every `static readonly` class property it finds and keys it by `"${className}.${propName}"`, with no file or module qualifier.** It's a lightweight text-based collector, not a real `ts.Program` with type information, so it can't distinguish two same-named classes in different contexts. Two independent handlers both named `TenantProvisionedHandler` (a natural, obvious name for "the handler that reacts to `TenantProvisioned`" in more than one context) with different `CONSUMER_NAME` values throws `pubsub-catalog: conflicting values for "TenantProvisionedHandler.CONSUMER_NAME"` at CI's catalog-generation step. Fix: qualify the class name with its owning context the moment a second context needs "the same shaped handler" for the same event (e.g. `TenantProvisionedNotificationHandler`, `TenantProvisionedBookingHandler`) — don't wait to discover the collision (M21-S02 precedent, 2026-09-02: Booking's own `TenantProvisioned` consumer hit this against Notification context's pre-existing handler of the identical natural name — full incident: `plan/M21-MULTIVERTICAL-FOUNDATION_IMPLEMENTATION_DETAILS_DEVELOPER.md` § 3).

**Pub/Sub naming (one topic per event type):**

| Thing | Pattern | Example |
|---|---|---|
| Topic | `ikaro-{eventName}` | `ikaro-StaffInvited` |
| Subscription | `ikaro-{eventName}-{consumerName}` | `ikaro-StaffInvited-notification` |

Cron triggers (`*.job.ts`, M17-S03) use the identical naming pattern via `registerTrigger`/`publishTrigger` (`ITriggerBus`) — `{eventName}` is the trigger name (e.g. `cron-reminders`), not a `DomainEvent` name. See `trigger-bus.port.ts` for why triggers are a separate channel from `IEventBus`.

`GcpPubSubEventBusAdapter` auto-creates topics/subscriptions on `onApplicationBootstrap()`. Local dev: `PUBSUB_EMULATOR_HOST=localhost:8085`.

**Test wiring for event handlers:**

| Test type | Event bus | When to use |
|---|---|---|
| Handler unit spec | `InMemoryEventBus` + call `handler.handle(event)` directly | Handler → use case logic in isolation |
| Story integration spec | Real `EventBusModule` (no override) + `waitFor()` | Full publish → Pub/Sub → handler → DB chain |
| Controller integration spec | Override `EVENT_BUS` with `InMemoryEventBus` | HTTP layer — no Pub/Sub needed |
| Push-endpoint integration spec | Real `PubSubPushController` + `PubSubPushGuard` (verifier port overridden via DI, not the guard itself) + supertest against a synthetic push envelope | `PUBSUB_CONSUMER_MODE=push` — HTTP → guard → `dispatchPushMessage()` → handler, no real Pub/Sub or emulator needed (M17-S02) |
| Trigger-handler spec | `InMemoryEventBus`/`RoutingInMemoryEventBus` (`ITriggerBus` — `registerTrigger`/`publishTrigger`, aliased to `EVENT_BUS`) + supertest against the cron controller's `POST` route | Cron ticks (`*.job.ts`), not domain events — no `tenantId`, no `DomainEvent` envelope. Controller `publishTrigger()`s, `RoutingInMemoryEventBus` dispatches synchronously to the registered `XxxTriggerHandler`, which calls exactly one job (M17-S03) |

`waitFor()` at `src/test/utils/wait-for.ts`. Use in story integration specs to poll async side effects.

---


## A lock only orders callers who both acquire it — it does not bypass an independent cache sitting behind the read it's protecting

**Acquiring a lock (advisory or row-level) before re-reading a value only guarantees that two lock-holding transactions see each other's writes in some order. It guarantees nothing about whether that "fresh" re-read is actually fresh, if the read's normal code path passes through a caching layer the lock has no relationship to.** The lock and the cache are two independent mechanisms; correctly using one says nothing about the other. A transaction that wins the lock and then calls a cached repository method still gets whatever the cache last held — not the row the lock just protected.

Before trusting a lock to make a read authoritative, check what that read's normal method actually does: if it's backed by a `CachingXxxRepository` (or any read-through cache), the lock needs to pair with a **cache-bypassing** read method — not just correct ordering between callers. This codebase's existing pattern for that is `findByIdForUpdate()`: a real Postgres row lock (`pessimistic_write`) that deliberately skips the cache entirely, as opposed to the cached `findById()` used everywhere else.

**M21-S03 precedent, PR #460 round 7, 2026-09-04:** `OpenScheduleUseCase`'s first attempt at closing a tenant-settings TOCTOU race (a concurrent `PATCH /tenants/settings` narrowing `businessHours` mid-request) added a second, tenant-scoped advisory lock (`lockTenantSettings`) around the window-bound check. The lock itself worked exactly as designed — it correctly serialized two concurrent callers relative to each other. But the "fresh" re-read taken after acquiring it still went through `CachingTenantRepository`'s up-to-60s-TTL `findById()`, so the lock provided zero actual freshness guarantee: whichever transaction won the lock could still validate against a stale cached `businessHours` value. Caught by Codex review, which correctly identified that the fix didn't close the race it claimed to. Fixed by discarding the advisory-lock design entirely and reusing `ITenantRepository.findByIdForUpdate()` instead — following `UpdateHotsiteContentUseCase`'s existing precedent for the identical class of cross-aggregate invariant (Tenant settings vs. another aggregate). The fix also *simplified* the design: it removed a whole custom lock mechanism (`ITenantLockPort`'s `lockTenantSettings` method, a `TenantLockModule` promotion to `shared/`) in favor of reusing infrastructure that already existed and was already proven — see `docs/13-DATABASE_SCHEMA.md` § `schedule_openings` Rules for the full before/after.

**The identical failure mode also applies to a same-request in-memory read taken before the lock was acquired, not just a cache** — an aggregate loaded pre-lock and blindly `save()`d post-lock can silently clobber a concurrently-committed write even with zero cache involved; re-read fresh (e.g. `findById()`) *after* acquiring the lock whenever the use case's post-lock write depends on state that could have changed concurrently (M21-S06 precedent, PR #461 round 1, 2026-09-04 — `UpdateResourceUseCase`'s blind `save()` on a stale in-memory `isActive` could silently undo a concurrent cascade deactivation, caught by CodeRabbit review).


## `architecture-check`'s `transactional-save` detector requires `save()` to be textually inside `txManager.run()` — not merely reachable through it

**The detector does AST-nesting analysis, not data-flow or call-graph analysis: it checks whether a repository `save()` call sits directly inside the `txManager.run(async () => {...})` callback's own syntax tree, not whether it's reachable at runtime from inside that callback.** A `save()` call that is transactionally correct (it runs inside the active transaction context at runtime) still gets flagged if it's textually defined in a *separate* method that the callback merely calls — even a private helper on the same class, called only from that one callback.

When splitting a use case's post-lock logic into a validation step plus the actual persist step (e.g. to keep a long `execute()` method under the line-count limit, or to separate "what to check" from "what to write"), keep the `save()` call literally inline in the `txManager.run()` callback. Put validation-only logic in the extracted helper; never let that helper also call `save()`.


## A wholesale-replaced child collection needs a dirty flag on the aggregate — resyncing it on every `save()` is a real, silent perf cost

**A repository that always deletes and reinserts every child-table row on `save()` — the correct approach for a collection whose replace semantics are "whole array in, whole array out," not a diff/patch — pays that cost even when the save never touched those children at all.** A plain name/price/`isActive` update looks identical to a real child-collection change from the repository's point of view unless the aggregate itself tracks which kind of change actually happened.

Track a private dirty flag on the aggregate: `true` after `create()` (any initial children must be persisted on the first save) and after any setter that actually mutates a wholesale-replaced collection, `false` after `reconstitute()` until such a setter runs. The repository checks the flag before running the delete+reinsert; a save that never flipped it skips the resync entirely.

**M22-S01 precedent, PR #479, 2026-09-15:** `TypeOrmServiceRepository.save()` unconditionally wholesale-replaced `resourceRequirements`/`legs`/`classResourceSlots` child tables on every save, including plain `update()`/`activate()`/`deactivate()` calls that touch none of them — up to ~20,000 rows rewritten for a service at the story's own 20-leg/20-requirement/50-pool-ID maximum, on a save that only changed the price. Fixed with a `childrenDirty` flag set by `setResourceRequirements()`/`setLegs()`/`changeBookingModel()` (the only methods that touch those collections), left `false` by `reconstitute()` and every other setter.


## A child table with only a composite PK cannot represent "declared but empty" — reject that state at the aggregate boundary, don't rely on storage to preserve it

**A child collection normalized into a table keyed only by its own data (a composite PK across parent id + grouping key + member id, no independent `id`/existence row) has no way to represent "this grouping was declared, but with zero members" — that state is indistinguishable from "never declared at all" the moment it's persisted, because there are simply no rows for it either way.** The domain object arriving with an empty member list looks fully valid at the moment `create()`/a setter runs; the information loss only shows up later, on reload, as a silent difference between what was submitted and what comes back.

If the domain genuinely needs to allow a grouping that's declared-but-currently-empty (e.g. "reserve this slot type for later"), the real fix is a surrogate identity column on the child table, not a workaround at the domain layer. If the domain doesn't actually need that state — the common case — reject an empty grouping at the aggregate boundary instead of accepting it and losing it silently.

**M22-S01 precedent, PR #479, 2026-09-15:** `service_class_resource_pool` is keyed by `(tenant_id, service_id, resource_type, resource_id)` with no separate identity column — a `ClassResourceSlot` submitted with `eligibleResourceIds: []` produced zero rows, identical to a type that was never declared at all, so it silently vanished on the next `GET`. The same table shape caused a second, earlier bug in the same story: two slots submitted for the same `resourceType` collapse into indistinguishable rows on reload, since nothing marks which pool row belongs to which submitted slot. Both fixed by rejecting the invalid input in the domain (`ClassResourceSlot.create()` for the empty-pool case, `Service.create()`/`changeBookingModel()` for the duplicate-type case) rather than trying to make the storage shape round-trip information it structurally cannot hold.

**M21-S03 precedent, PR #460 round 7, 2026-09-04:** `OpenScheduleUseCase`'s post-lock logic was first extracted into a single `validateAndSave()` helper that validated the window bound *and* called `openingRepo.save()`. The detector flagged it, since `save()` was reachable only via a method call from `txManager.run()`, not textually inside it. Fixed by renaming the helper to `validateUnderLock()` (validation only) and keeping the actual `await this.openingRepo.save(opening)` call inline in the `txManager.run()` callback itself.


## A versioned, append-only child concept ("new version supersedes, never edits the previous one") is an independent aggregate root with its own repository, not a `Service`-owned child collection

**Most of `Service`'s M22 Cluster 2 extensions (`resourceRequirements`, `legs`, `classResourceSlots`, the booking-policy fields) are child collections/fields owned and wholesale-replaced by `Service` itself, per the dirty-flag pattern above.** `ServiceBookingIntakeSchema` (UC-054, `booking.service_booking_intake_schema`) deliberately isn't shaped that way: publishing a new version never edits or deletes the previous one, `Service`'s own domain props hold no reference to it at all, and it has its own identity, its own `publish()`/`reconstitute()` factory, and its own repository (`IServiceIntakeSchemaRepository`) — a genuinely new pattern for this codebase (story-discovery, M22-S02, 2026-09-15), not a variant of the dirty-flag child-collection shape above.

**Consequence for the `transactional-save` architecture-check detector:** the detector only recognizes a literal `.save()` call (see the entry above) — it has no visibility into `.publish()` or any other differently-named write method. An aggregate shaped this way gets no static enforcement that its write call stays textually inside `txManager.run()`; today nothing but this rule holds that discipline together — **correction via `/docs-audit`, 2026-09-18:** an earlier version of this rule claimed `PublishServiceIntakeSchemaUseCase`'s write call was flagged by a header comment on `apps/backend/src/contexts/booking/domain/service-booking-intake-schema.ts`; no such comment was ever actually added to that file. Read the actual call site, don't trust the detector's silence, whenever a new aggregate's write method isn't literally named `save()`.

**When this pattern recurs** (an audit-log/history-style aggregate, or any other "append a new version, never mutate an old one" concept): reach for an independent aggregate root + dedicated repository from the start, the same way `ServiceBookingIntakeSchema` did — don't force it into an owning aggregate's dirty-flag child-collection shape just because most of that aggregate's other children fit there.



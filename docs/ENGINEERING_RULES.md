# Ikaro — Engineering Rules (detail)

> **When to load:** writing any code, implementing event handlers, adding transactions, writing or reviewing tests, or working with value objects.
> Summary rules are in `CLAUDE.md §7`. This file has the full reference tables, patterns, and gotchas.

---

## Repository slice ownership

- **Backend:** bounded-context first. Canonical roots live under `apps/backend/src/contexts/<context>/`.
- **BFF:** feature first. Business-owned code lives under `apps/bff/src/features/<capability>/`; `auth` and `uploads` are technical slices, not bounded contexts.
- **Web:** domain feature first. Business-owned code lives under `apps/web/features/<domain>/`; `dashboard` and `hotsite` are shell slices only.
- **Shared:** `shared/` is cross-cutting only. If a file has slice-specific policy, it belongs next to the owning feature or shell.
- **Transitional roots:** current flat capability folders and generic buckets are allowed only while the TD21 migration is in flight. New code should land in the target slice path.

---

## Value Objects

Fields with domain validation → `src/shared/value-objects/` (never plain primitives):

| Field | Value Object | File |
|---|---|---|
| Email address | `Email` | `email.vo.ts` |
| Phone number | `PhoneNumber` | `phone-number.vo.ts` |
| Physical address | `Address` | `address.ts` |
| Money amount | `Money` | `money.ts` |
| Hex colour | `HexColor` | `hex-color.vo.ts` |
| IANA timezone | `Timezone` | `timezone.vo.ts` |
| HH:MM time | `TimeOfDay` | `time-of-day.vo.ts` |
| URL-safe slug | `Slug` | `slug.vo.ts` |
| ISO country code | `CountryCode` | `country-code.vo.ts` |
| SEO page title | `SeoTitle` | `seo-title.vo.ts` |
| SEO meta description | `SeoDescription` | `seo-description.vo.ts` |

Every VO must have a `.spec.ts` covering valid and invalid inputs. PhoneNumber format and normalisation boundary rules → `docs/CODE_STANDARDS.md`.

**Adding a new VO:** also add its concept entry to `packages/architecture-check/architecture-policy.json`'s `aggregateValueObjectRegistry` (exact field names or a camelCase suffix rule, mapped to the VO's class name) — this is what `pnpm architecture-check`'s `aggregate-primitive-vo` detector (TD37-S09) uses to flag a future aggregate field for that concept left as a plain primitive. A brand-new *aggregate* that reuses an already-registered concept needs no registry change — the check is concept-driven, not per-aggregate.

### Option A — aggregate props typed as VOs (mandatory)

Aggregate props interfaces use VO types; getters return VOs; `create()` constructs VOs from raw strings; `reconstitute()` skips validation. JSONB columns require a double cast (`as unknown as XxxProps`).

→ Code patterns, mapper examples, in-memory repo comparisons: `docs/VALUE_OBJECTS_REFERENCE.md`.

### VO validation errors must be mapped with a typed `code` (`DomainErrorShape`)

Every VO's `create()` throws a typed error class implementing `DomainErrorShape` (`{ code: string; field?: string }`) — never a bare `Error`. A plain `Error` falls through every `mapXxxError`'s `if (err instanceof Error) throw err;` line unchanged and becomes an unhandled 500 instead of a shaped 400. Pattern (mirrors `AddressValidationError` in `shared/value-objects/address.ts`):

```typescript
export class XxxValidationError extends Error implements DomainErrorShape {
  readonly code: XxxErrorCode;
  constructor(message: string, code: XxxErrorCode) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'XxxValidationError';
    this.code = code;
  }
}
```

`code` is typed against that VO's own literal union in `packages/types/src/error-codes.ts` (e.g. `PhoneErrorCode`, `EmailErrorCode`) — never `string` — so a code outside the catalog is a compile error (TD23 §9).

Wire an `instanceof XxxValidationError` branch (→ 400) into **every** context's error mapper that calls the VO's `create()` — a shared VO can be called from multiple contexts (`Address` is called from both `booking` and `customer`). Once a second mapper needs the same branch, extract a shared `mapSharedXxxError()` helper into `shared/http/` (see `address-validation-error.mapper.ts`) instead of duplicating it — SonarCloud's new-code-duplication gate fails on the second copy.

### Single source of truth for a validation rule's code

A business rule gets **one** code, owned by whichever layer defines it — not one code per layer that happens to check it:

- **A rule backed by a VO** (its predicate is `Xxx.isValid()`) — every other layer that also checks it (a Zod `.refine(Xxx.isValid, ...)` in a backend DTO or a BFF schema mirroring the same field) **imports and reuses that VO's code**. A `.refine(PhoneNumber.isValid, ...)` failure must emit the same `PhoneErrorCode.FORMAT_INVALID` the VO itself throws — never a second, bespoke code for the identical rule.
- **A rule with no VO behind it** (Zod-native `.min()`/`.max()`/required-field/enum checks with no domain VO — most numeric/length bounds and fixed-choice fields) — these share a small closed `GenericErrorCode` set (`FIELD_REQUIRED`, `VALUE_TOO_SHORT`, `VALUE_TOO_LONG`, `VALUE_OUT_OF_RANGE`, `FORMAT_INVALID`, `VALUE_INVALID` — the last for `z.enum()`/`z.union()`/unrecognized-key/invalid-map-or-set-key-or-element mismatches, i.e. Zod's `invalid_value`/`invalid_union`/`unrecognized_keys`/`invalid_key`/`invalid_element` issue codes), disambiguated by `field`/`params` — not one bespoke code per call site. Mirrors `AddressErrorCode.FIELD_REQUIRED` already being reused across 5 different address fields instead of five separate codes.

Why this matters: if the same rule gets two different codes depending on which layer catches it first (a BFF Zod schema vs. the backend VO), the frontend shows an inconsistent message for the identical violation depending on request timing — the exact defect `td/TD23-EXCEPTION-HANDLING-I18N-PATTERN.md` exists to remove.

---

## Partial-update types for deeply-nested Zod schemas

`Partial<T>` only makes a type's **outer** keys optional — fields inside a nested object stay fully required. When a Zod schema chains `.partial()` at more than one nesting level (e.g. `settings.businessInfo.address`, where each address field is independently optional), `Partial<TenantSettings>` does **not** match what the schema actually accepts: TypeScript rejects passing the Zod-inferred body into a function typed with `Partial<TenantSettings>`, because `Partial<>` requires `address`, if present, to have every `BusinessInfoAddress` field populated — Zod's `.partial()` on the inner schema allows any subset.

Define an explicit input type that mirrors the schema's real nesting depth instead of reaching for `Partial<T>` on the whole structure:

```typescript
// Matches what the Zod schema actually produces — not Partial<TenantSettings>
export interface TenantSettingsUpdateInput {
  loyalty?: Partial<TenantLoyaltySettings>;       // flat — Partial<> is correct here
  businessInfo?: {
    phone?: string | null;
    address?: Partial<TenantBusinessInfoAddress> | null;  // nested — needs its own Partial<>
  };
}
```

Apply `Partial<>` at the level where the schema actually stops requiring all fields together — one level per `.partial()` in the Zod chain, not once at the top.

---

## Schema-level enforcement of "never persisted here" invariants

A documented invariant that field X must never appear inside field Y (a comment, a doc row, a naming convention) is not actually enforced unless something validates it at the request boundary. A doc comment plus a client-side "strip before sending" helper is a UI courtesy for the legitimate client, not an API contract — a direct API call, a future caller, or a bug in the client-side strip logic all bypass it silently.

This bites hardest when Y's own schema is an unconstrained record (`z.record(z.string(), z.unknown())`), which many module/module-data-shaped fields are, since per-type shape isn't statically derivable from a generic array element. If X's field names are also real, recognized fields somewhere else in the same request body, nothing stops a caller from embedding them inside Y instead of at the top level.

**M20-S08 precedent (2026-08-26):** `HotsiteModuleSchema.data` accepts any record for every module type. Once `audienceMode`/`questions` became real top-level fields on `PATCH /v1/tenants/hotsite` (folded in from a former separate endpoint), a caller could embed those same key names inside a `LEAD_FORM` module's own `data` in the `layout[]` array — bypassing `LeadFormConfig`'s own validation (the 20-question cap included) and landing the values in `HotsiteConfig.layout[]`, which feeds the public-cached manifest. The frontend's `stripLeadFormConfig()` helper only protects the real web client, not the API boundary. Fixed with an explicit Zod `.refine()` on `HotsiteModuleSchema`, scoped to `type === 'LEAD_FORM'`, rejecting `audienceMode`/`questions` inside `data` — not a blanket tightening of the generic record, which would break every other module type's legitimately-unconstrained `data`. See `packages/validation/src/hotsite.ts`.

When adding a new field to a generic sibling endpoint that a per-type sub-schema could also plausibly accept, check whether the sub-schema's own record type needs the same scoped `.refine()` — the invariant is only real once something rejects the violation, not just documents it.

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

**A single exclusion constraint stops generalizing once "the tenant" is no longer the one thing being protected — the granularity has to move to whatever the shared resource actually is, and a single shared table (not one per family) is what keeps the constraint enforceable at all.** `EX_booking_bookings_approved_slot` works today because there is exactly one thing to protect per tenant, one row per booking. Once a booking can lock a *bundle* of resources, a different resource per *leg*, or share a resource with a materialized session from a completely different aggregate family, there is no longer one row per booking to key an exclusion constraint on — the granularity has to move to one row per resource-assignment, and every family that can ever contend for that resource has to write into the *same* table, because a Postgres exclusion constraint cannot span two tables. Splitting per-family "for cleanliness" reintroduces exactly the race the constraint exists to close. M21 (Multi-Vertical Scheduling)'s `booking.resource_occupancy` is the concrete instance: one shared GIST exclusion constraint, keyed on `(tenant_id, resource_id, [starts_at, ends_at))`, protects appointment bookings (Cluster 2) and, once it ships, class sessions (Cluster 4) against each other on a resource that participates in both — see `docs/02-DOMAIN_MODEL.md` § Booking Context (UC-060's note) and `docs/13-DATABASE_SCHEMA.md` for the full schema. A not-yet-materialized future pattern (a recurring template or standing schedule) still needs a companion transaction-scoped advisory lock in canonical resource-ID order, the same "companion to the DB constraint, not a replacement for it" principle above — the exclusion constraint alone can't protect a commitment that has no row yet.

### Choosing a race-condition primitive, and where its lock port should live

This codebase has three real primitives for a race condition, each matched to the shape of the race — pick by shape, not by "add a lock and see":

1. **DB exclusion constraint** (over a persisted range/value) — the invariant is "no two of these *rows* can overlap/collide," and the rows already get created. Strongest guarantee (survives any application-code bug); prefer it whenever the invariant maps onto column values Postgres can express in a constraint. See "Cross-row invariants" above.
2. **A real row lock — `findByIdForUpdate()` / `SELECT ... FOR UPDATE`** — a row *already exists* (an aggregate being read, then conditionally written, inside the same transaction), and a concurrent writer must not see a stale value or write a conflicting one. Goes through the aggregate's own repository, so it automatically bypasses any read cache sitting in front of the normal `findById()` — this is a load-bearing property of the primitive, not incidental (see "A lock only orders callers who both acquire it..." above for what goes wrong when an advisory lock is used here instead). Use this whenever the row to lock already exists.
3. **`pg_advisory_xact_lock` via a dedicated lock port** — there is *no row to lock yet* (the thing being protected is about to be *created* — e.g. "only one opening can be created for this tenant+date"), or the invariant spans multiple tables in a way no single exclusion constraint can express. Purely cooperative: it only blocks other callers who also explicitly acquire the same key. Transaction-scoped, released automatically on commit/rollback.

**Where the lock port lives follows the same rule as every other port in this codebase:** start it in the bounded context that owns the race (`<context>/application/ports/`); promote to `shared/` only once a **second real consumer in a different context needs the exact same primitive**, not merely "another context also has some race condition somewhere." Two different races reaching for "add a lock" as the fix does not mean they need the same primitive — check which of the three shapes above the *new* race actually is before assuming it's a second consumer of the *existing* port.

**M21-S03 precedent, PR #460, 2026-09-04:** `ITenantLockPort.lockTenantDay()` is a purely booking-local advisory lock (primitive 3) protecting `schedule_closures`/`schedule_openings` creation races — no row exists yet at lock-acquisition time. Mid-story, a second, unrelated race surfaced: a concurrent `PATCH /tenants/settings` narrowing `businessHours` while `OpenScheduleUseCase` was mid-validation. The first fix added a second method (`lockTenantSettings`) to the *same* port and promoted the whole thing to `shared/` for platform to reuse — treating "another race exists" as sufficient reason to share the port. That promotion was walked back one round later: the settings race wasn't the same shape at all — the tenant row already exists, so the correct primitive was `findByIdForUpdate()` (primitive 2), not an advisory lock. Once corrected, `ITenantLockPort` moved back to booking-local with only its original method, and the `shared/` promotion (`TenantLockModule`, `shared/ports/tenant-lock.port.ts`) was deleted entirely — it never had a real second consumer once the actual mechanism was fixed. Before promoting a lock port to `shared/`, confirm the new consumer needs the *same primitive*, not just "also has a race."

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

**There is no `InsertQueryBuilder.onConflict()` method.** A raw `ON CONFLICT (...) DO UPDATE SET ...` string is not part of the public API — code (or a bot-suggested fix) that calls `.onConflict(...)` fails at compile time. For a conditional upsert (only overwrite when the incoming value is actually newer, or the column was never set), use the real method:

```ts
await manager
  .createQueryBuilder()
  .insert()
  .into(Entity)
  .values({ provider, lastSuccessAt: occurredAt })
  .orUpdate(['last_success_at'], ['provider'], {
    overwriteCondition: {
      where: 'entity_table.last_success_at IS NULL OR entity_table.last_success_at < EXCLUDED.last_success_at',
    },
  })
  .execute();
```

**`orUpdate()`'s `overwrite`/`conflictTarget` arrays take real DB column names (snake_case, matching `@Column({ name: ... })`), not entity property names.** Unlike `.values()`, which translates entity properties to columns via metadata, `orUpdate()` passes each array entry straight through `this.escape(column)` with no translation — confirmed by reading `EntityManager.upsert()`'s own implementation, which explicitly maps `conflictPaths`/columns to `col.databaseName` *before* calling `orUpdate()`. Passing a property name here (e.g. `lastSuccessAt` instead of `last_success_at`) silently generates SQL referencing a column that doesn't exist under that name — verify the exact SQL a new `orUpdate()` call produces against a real database (integration test), not just that it type-checks. (M19-S06 precedent, 2026-08-13: `TypeOrmChatbotProviderBalanceRepository.recordCallOutcome()` needed exactly this — two concurrent calls could write out of chronological order, and a plain `EXCLUDED`-based overwrite would let the older one clobber a newer timestamp.)

---

## Migration backfills

A migration backfilling a newly-derived table doesn't automatically need batching/resumability machinery — scale the safety engineering to the actual, checkable risk, not a reflexive "any full-table backfill is production-risky" default. But "could the source table hold meaningful data yet" must be checked against the right signal — **whether the underlying endpoint/controller that writes to it has already merged to `main`, not whether a dedicated front-end page for it has shipped.** A backend endpoint is a live, callable traffic path the moment it merges and deploys — a direct API call, a smoke test, or another integration can reach it long before any UI page is built to call it naturally. Check `git log origin/main -- <the controller file>`, not the story-dependency graph's page-shipping milestone.

If the source genuinely has no reachable endpoint yet, the destination being a derived lookup/cache (rebuilt going forward by the same code path that maintains it for new rows, not the record of truth) means a missing backfilled row is a self-correcting gap, not a data-loss risk — dropping the backfill is fine. Once real data could exist, backfill it: if the expected row count is still small at this stage of the feature's rollout, a plain one-shot `INSERT ... SELECT` is proportionate — building batching/resumability for a "production scale" that doesn't exist yet is its own form of over-engineering. Re-assess as the feature matures and real volume grows.

**M20-S08 precedent (2026-08-26) — this exact lesson was tested and reversed within the same PR:** a new `lead_form_submission_question_refs` migration originally shipped with an unbounded `INSERT ... SELECT ... jsonb_array_elements(...)` backfill. Round 1: removed it, reasoning "no public-facing submission *page* had shipped yet" (M20-S09, the guest-facing page, ships later) — checked against the wrong signal. Round 2 (Codex review): correctly caught that the public submission *endpoint* (`lead-form-public.controller.ts`) had already merged in an earlier story (M20-S02/S05/S06), so real submissions could already exist via direct API calls — verified with `git log origin/main -- .../lead-form-public.controller.ts`, confirming it. Without the backfill, a pre-existing submission would have answers in `lead_form_submissions.answers` but no row in this derived table, so `GetLeadFormConfigUseCase` would report `hasSubmissions: false` and a manager could remove that question without the required confirmation dialog (UC-037 A4) — a real correctness gap. Backfill restored, with the correct UUID cast this time.

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

**A domain event drained into the outbox with zero real `eventBus.subscribe()`/`triggerBus.registerTrigger()` consumers gets no Pub/Sub topic from the auto-generated catalog.** `infra/terraform/pubsub-catalog.json` is generated by `packages/infra-scripts/src/pubsub-catalog.ts`, which discovers a topic *only* from a real subscribe/register call site — it has no way to see an event that's merely constructed and published. The aggregate still publishes it correctly (per the invariant above), so every sweep tick fails permanently once deployed to an environment where the topic doesn't exist, with no automatic recovery — the row just gets released and retried forever. Every event a repository drains into the outbox needs at least one real subscriber before it ships to any environment; a logger-only handler (mirroring any existing thin event handler) is sufficient if there's no real business consumer yet. (M20-S16 precedent, 2026-09-01: `LeadFormSubmissionReceived` shipped with the documented "no consumers yet (MVP)" design a chapter above, correct on its own terms — but the missing topic this produced went unnoticed for ~4 days on `ikaro-staging`, surfacing only as the `Ikaro staging — outbox backlog age` alert on 4 permanently-stuck rows — full incident: `plan/M20-LEAD-FORM-MODULE.md` § M20-S16.)

**Adding a cron-published event:**
1. The event class extends `Command` (`shared/domain/command.ts`), not `DomainEvent` — a cron tick can legitimately construct the same business fact twice (retry, overlapping invocation), and `Command`'s required `dedupKey: string` is what the outbox's `UNIQUE(dedup_key)` collapses those duplicates down to one row on. Compute a deterministic key from business identity + a calendar date (tenant-local or UTC, whichever the job already computes for its own query window) — never a fresh UUID.
2. The job injects `@Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher` and `@Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager` — never `EVENT_BUS`.
3. Resolve any cross-context reads (recipient lookups, settings lookups) **before** entering `txManager.run()` — the same "reads before writes" convention as everywhere else. Only the `outboxPublisher.publish()` calls belong inside the transaction.
4. Batch the transaction **per tenant, not per event and not for the whole run**: one `txManager.run()` wrapping all of one tenant's publishes. A mid-run crash then retries only that tenant's un-committed facts as no-op `dedup_key` conflicts on the next run — every other tenant's already-committed rows are untouched.
5. See `contexts/booking/application/jobs/booking-reminder.job.ts`, `admin-schedule-reminder.job.ts`, and `contexts/loyalty/application/jobs/notify-expiring-points.job.ts` for the reference shape, and their `.integration.spec.ts` siblings for the real-outbox dedup proof (two overlapping runs → one row).

---

## RequestContext (per-request shared state)

`RequestContext` (`src/shared/request/request-context.ts`) is populated once per HTTP request by `RequestInterceptor` — `tenantId`, optional `actorId`/`actorType`/`actorRole`, and `settings: TenantSettingsProps` (the tenant's full `tenants.settings` JSONB, eager-loaded via `ITenantSettingsPort` before the request reaches any handler). `correlationId` itself is generated earlier, in `CorrelationMiddleware` (`src/shared/request/correlation.middleware.ts`) — an Interceptor runs *after* Guards, so a Guard-rejected request would otherwise carry no correlationId at all (M17-S31, 2026-07-20); `RequestInterceptor` only reads the value middleware already placed on `req.headers['x-correlation-id']`, it no longer generates a fallback itself.

**Prefer eager-loading into `RequestContext` over a new Port + Adapter when** the data is read by *many* contexts within the same request — tenant settings/localization/business hours are the textbook case — and is already fetched once, cheaply, at request start. Before the TD02-S04 cleanup, four separate contexts (`booking`, `customer`, `loyalty`, `notification`) each maintained their own Port + Adapter to re-fetch a different slice of the same `tenants.settings` row, duplicating the DB round-trip per use case that needed it within a single request.

**`RequestContext` is HTTP-request-scoped only — never read it from shared infrastructure.** Its `AsyncLocalStorage` store is populated exclusively by `RequestInterceptor`, which only runs in the HTTP request pipeline. Two other invocation contexts call into the same repositories and services with no interceptor in front of them:
- **Cron jobs** (`*.job.ts`) — triggered by an internal HTTP endpoint, but the job's per-tenant loop body runs outside any single request's interceptor.
- **Event handlers** (`infrastructure/events/*.handler.ts`) — Pub/Sub delivery, no HTTP request at all.

A repository or adapter that reads `this.requestContext.settings` works fine when called from a use case (always HTTP-request-scoped) but throws `Cannot read properties of undefined (reading 'settings')` the moment it's reached from a cron job or an event handler's cross-context adapter call chain — and both paths exist for the same shared repositories (`TypeOrmBookingRepository`, `TypeOrmServiceRepository`).

**Rule:**
- **Controllers** — the only layer that may inject `RequestContext`. Extract `tenantId`, `actorId`, `correlationId`, and any `settings.*` fields needed, then forward them as explicit DTO fields to the use case. **Use cases must never inject `RequestContext`.**
- **Use cases and application services** — must not inject `RequestContext`. All caller context is passed via the input DTO. This keeps use cases callable from event handlers, scheduled jobs, and cross-context adapters without an HTTP request in scope.
- **Shared infrastructure** (repositories, anything called from more than one invocation context) — must take `tenantId` as an explicit method parameter and read settings via a `tenantId`-parameterized port (`ITenantSettingsPort.getSettings(tenantId)`), never ambient context.

| Artifact | Location |
|---|---|
| `RequestContext` | `src/shared/request/request-context.ts` |
| `RequestInterceptor` (populates tenantId/actor/settings) | `src/shared/request/request.interceptor.ts` |
| `CorrelationMiddleware` (generates/validates `correlationId`, runs before Guards) | `src/shared/request/correlation.middleware.ts` |
| `ITenantSettingsPort` (tenantId-parameterized, for shared infra) | `src/shared/ports/tenant-settings.port.ts` |
| Real adapter | `src/contexts/platform/infrastructure/cross-context/platform-tenant-settings.adapter.ts` |
| Test builder | `src/test/factories/request-context.factory.ts` (`RequestContextBuilder`) |
| Test double for the port | `src/test/infrastructure/in-memory-tenant-settings.port.ts` |

---

## Express `Request.user` typing (BFF) — the `skipLibCheck` trap

**A `declare global { namespace Express { interface Request { user?: X } } }` augmentation silently does nothing if a dependency already declares that same member, under this repo's `skipLibCheck: true`.** `@types/passport` already declares `Request.user?: User` (its own deliberately-empty, extensible `Express.User` interface) — a second, conflicting `Request.user` declaration in app code does not error and does not merge with it. Normally TypeScript's declaration merging would flag two interface bodies disagreeing on a member's type ("Subsequent property declarations must have the same type"), but `skipLibCheck` skips checking of *all* `.d.ts` files (including your own new one, not just `node_modules`), so the conflict is silently swallowed and the pre-existing declaration wins everywhere `Request.user` is read — `tsc --noEmit` still passes cleanly, giving false confidence the augmentation "worked."

**Confirmed empirically (TD31 PR4, 2026-07-29):** an `express.d.ts` typing `Request.user?: CurrentUserPayload | GoogleProfile` was added, `tsc --noEmit` passed, but every consumer's inferred type for `req.user` still resolved to Passport's own `User`, not the intended union — proven by reading the actual compiler error at each usage site before the file existed vs. after.

**Fix:** don't fight an interface another dependency already extends this way. Use a shared accessor function instead — one function that does the single necessary cast/narrow (e.g. `getCurrentUser(req: Request): CurrentUserPayload | undefined` in `shared/decorators/current-user.decorator.ts`), which every consumer calls instead of reading `req.user` directly. This achieves the same goal (one canonical, type-safe source of truth instead of N independent ad hoc casts) without needing the global augmentation to actually take effect.

**Before trusting any `declare global` augmentation of a third-party-owned interface compiles correctly:** don't stop at "`tsc --noEmit` passed" — verify the augmented property's *inferred type* at a real usage site (e.g., a deliberately wrong assignment should fail to compile; if it doesn't, the augmentation isn't taking effect).

---

## Observability ports (logging + tracing)

Both are shared, cross-app code in `packages/observability` (used by backend and BFF alike) — they follow the same port/adapter shape, and it's the shape to reuse for any future observability integration:

| Concern | Port | Default (real) adapter | Alternate adapter |
|---|---|---|---|
| Log line formatting | `LogVendorFormatter` (`log-vendor-formatter.ts`) | `GoogleCloudLogVendorFormatter` (`gcp-log-vendor-formatter.ts`) | `NoopLogVendorFormatter` |
| Trace enrichment | `ITracingPort` (`tracing-port.ts`) | `OtelTracingAdapter` (`otel-tracing-adapter.ts`) | — |

**Why a port at all, for `@opentelemetry/api`:** `trace.getActiveSpan()` itself is already vendor-neutral (OTLP is the standard; the collector, not app code, is where a vendor is ever selected — see D9 in `plan/M17-CLOUD-DEPLOY.md`). The port exists for the scenario D9 doesn't cover: a vendor requiring their own proprietary tracer SDK instead of OTLP ingestion. In that case every call site that imported `@opentelemetry/api` directly would need editing; behind a port, only one new adapter class does. It also closes a real testability gap — `trace.getActiveSpan()` returns `undefined` with no SDK running, so a raw import was untestable (a call either happened against nothing, or was trusted blindly); a fake `ITracingPort` lets a spec assert exactly what was set.

**Wiring differs by how the consumer itself is constructed — mirror whichever your class already does, don't introduce DI where there wasn't any:**
- **Never NestJS-DI-managed** (`BaseAppLogger`/`AppLogger` — always `new AppLogger(Context.name)`, never `@Inject`-ed): the port is a plain constructor parameter with a real-adapter default (`vendorFormatter: LogVendorFormatter = new NoopLogVendorFormatter()`, `tracingPort: ITracingPort = defaultTracingPort`). No `@Optional()` needed — nothing is asking Nest's container to resolve it.
- **Already NestJS-DI-managed** (`CorrelationMiddleware`, `RequestInterceptor` — real `@Injectable()`s Nest's container constructs): same constructor-parameter-with-default shape, but the parameter needs `@Optional()`. Without it, Nest reflects the parameter's design-time type for DI resolution; since `ITracingPort` is an interface (erased at runtime), Nest can't find a bound provider for it and throws `UnknownDependenciesException` instead of falling through to the default. `@Optional()` tells Nest to pass `undefined` when nothing is bound — which is what lets the JS default value apply. No token, no module registration needed for the default case.

**One exported default instance per port, not `new Adapter()` at every call site.** `otel-tracing-adapter.ts` exports `export const defaultTracingPort: ITracingPort = new OtelTracingAdapter();` and all 5 consumers (`BaseAppLogger`, both apps' `CorrelationMiddleware`/`RequestInterceptor`) default to that same constant, not their own `new OtelTracingAdapter()`. `OtelTracingAdapter` has no state — its methods only delegate to `@opentelemetry/api`'s own global `trace` singleton — so this isn't a caching/perf concern, it's centralising *which* concrete adapter is the default: swapping it is one line in `otel-tracing-adapter.ts`, not five call sites across two apps. Still no NestJS DI/token — this is a plain shared constant, consistent with the "never DI-managed" callers above; a future port should follow this shape too rather than repeating `new X()` at each default-parameter site.

**Dependency direction:** shared code in `packages/*` depends on the port only, never on either app's concrete class — a shared package importing from `apps/backend` or `apps/bff` inverts the dependency direction. `BaseErrorFilter` (`packages/nestjs-http`) is the existing example: typed against `BaseAppLogger`, but each app's own `ErrorFilter` passes its real, enriching `AppLogger` into `super()` — the shared filter code gets full app-specific enrichment through polymorphism, without ever importing either app's concrete logger class.

**The tracing SDK bootstrap itself (`otel-tracing.ts`'s `bootstrapTracing()`, called once from each app's `src/tracing.ts`) is deliberately *not* behind `ITracingPort`.** It's the composition root, not a port consumer — its whole job is selecting and starting a concrete implementation, the same way `main.ts` calls `NestFactory.create()` directly. What it *does* get is a vendor-neutral name and argument shape: `bootstrapTracing(serviceName, options: TracingOptions)` — `TracingOptions` (`{ postgres?: boolean }`) is translated into OTel-specific instrumentation config *inside* `otel-tracing.ts`, so neither `tracing.ts` file ever references an OTel package name or config shape. A full tracer-SDK swap (e.g. a vendor contract requiring their own proprietary SDK instead of OTLP ingestion) is then confined entirely to `packages/observability` — both apps' `tracing.ts` files need zero changes, since they never named the vendor to begin with.

---

## Cloud Run CPU throttling — timer/async work can be silently starved (sidecars included)

**Any timer-driven flush or async worker queue running on a Cloud Run instance with `run.googleapis.com/cpu-throttling: "true"` can silently stop firing once no request is active — and this applies to every container in a multi-container service, not just the app's own process.** Cloud Run only guarantees CPU while a request is actively being handled; a background timer/goroutine scheduled during a throttled gap may simply never get to run — no error, no crash, no log line, the work just never happens.

**Real incident, the same bug found twice, one hop apart (M17-S34 follow-up, 2026-08-05):**
1. **App side.** `apps/{backend,bff}/src/tracing.ts`'s `NodeSDK` originally passed `traceExporter` directly, which `NodeSDK` silently wraps in its own default `BatchSpanProcessor` (5s flush timer). Spans were created but the timer that would export them could be starved before it ever fired. Fixed by switching to `spanProcessors: [new SimpleSpanProcessor(...)]` — one export call per span, triggered synchronously from `span.end()`, no background timer involved.
2. **Collector sidecar side — the identical bug, one hop downstream.** `infra/docker/otel-collector/config.yaml`'s traces pipeline still had a `batch` processor (5s timeout) and the `googlecloud` exporter's default async `sending_queue` — both are the collector's own version of the same timer/async-worker pattern, running in a *second* container sharing the *same* CPU-throttled instance as the app. Fixing (1) only moved the vulnerability into (2), it didn't remove it. Measured impact before this second fix: **~73% of real traces silently never reached Cloud Trace** (33-trace staging sample, cross-checked against the Cloud Trace API directly). Fixed by removing the `batch` processor and setting `sending_queue: enabled: false` on the `googlecloud` exporter, forcing every export to complete synchronously inside the OTLP receive call — which only ever runs while a request is in flight, i.e. while CPU is guaranteed allocated.

**The general rule this establishes: when auditing a `cpu-throttling: true` Cloud Run service for "does background work reliably complete," check every container in the service, not just the one you're actively editing.** A sidecar isn't exempt just because it isn't application code — it shares the same CPU allocation window.

**Debugging method — a `traceId` appearing in a Cloud Logging line is NOT proof the trace reached Cloud Trace.** `logging.googleapis.com/trace` is stamped onto every log line unconditionally from `RequestContext`, regardless of whether the span itself was ever successfully exported — these are two independent systems, and only the log-correlation half is guaranteed. To confirm a trace genuinely landed, query the Cloud Trace API directly (`GET https://cloudtrace.googleapis.com/v1/projects/<project>/traces/<traceId>` — a `404` there is authoritative, not Console-UI indexing lag). Cross-checking a whole window's worth of real `httpRequest` log entries against the Trace API (not spot-checking one ID) is what surfaced the 73% loss rate above — a single missing trace could plausibly be lag; a systematic majority-loss rate across dozens of independent requests could not.

**Alternative considered and rejected: `run.googleapis.com/cpu-throttling: "false"` (always-allocated CPU).** This structurally eliminates the whole bug class (any current or future background work gets real CPU regardless of request activity) and is Google's own documented mechanism for exactly this scenario. Rejected on cost: real Cloud Billing Catalog SKU rates plus actual `instance_count`/`billable_instance_time` usage (7-day sample, both envs) showed `backend`+`bff` already sit resident (warm) close to 100% of the day even under request-based billing — switching to always-allocated would bill that same ~24h/day instead of the ~15-20 min/day of genuinely active processing, projecting **~$2.45/mo → ~$180/mo** (~70x) for `backend`+`bff` across staging+prod. The synchronous-export fix achieves the same reliability property (no dependency on a timer surviving a throttled gap) for effectively zero added cost, at the price of the collector's own export call taking longer per span (measured ~460-600ms real round-trip to Cloud Trace, entirely background work — see below).

**No user-facing latency impact from either fix, in the case that matters.** Verified directly against the installed `@opentelemetry/instrumentation-http` source (`_onServerResponseFinish`, wired to the response's `close` event): in the normal case, the incoming-request span only closes once the HTTP response has already been fully sent to the client, so `SimpleSpanProcessor`'s export call — and the collector's now-synchronous export it triggers — only starts after that point, as background work the client never waits on. (`close` can also fire on an early client disconnect before the response finished sending — but there's no client left waiting on that connection either way, so the conclusion doesn't change.) This also means export happens per span, not per request: a single incoming request with DB/outgoing-call child spans triggers one synchronous OTLP call per span. The collector's `timeout: 2s` on the exporter (added after a cross-tool review finding, PR #324) bounds each of those individually; `memory_limiter` is the backstop against the aggregate volume.

**A bound on how long a single synchronous export can block matters too, once you accept the export itself is synchronous.** Without an explicit `timeout`, a blocked export defers to the underlying Google Cloud Go SDK's own internal retry/backoff, an undocumented duration that could be far longer than the ~330-1165ms normal-case round-trip (measured). During a real Cloud Trace outage, concurrent spans would each hold a blocked connection on the sidecar's small CPU allocation for whatever that undocumented window is. `timeout: 2s` (real batch-processor default for comparison: 200ms, verified — this repo's removed `batch` processor had it explicitly overridden to 5s, not defaulted) caps the worst case per export — fail fast rather than hang — without reintroducing the async queue this fix removes.

**Update (2026-08-05, later same day): the fix above is real and worth keeping, but it was never the dominant cause of production trace loss — the real root cause was a completely different bug, in sampling, not CPU throttling at all.** A follow-up live investigation, after PR #324 deployed, kept measuring **~75-89% of real traces still missing** from Cloud Trace — statistically unchanged from the ~73% baseline this section opened with. Six live-production experiments (collector CPU/memory, `cpu-throttling: false` on the whole service, `OTEL_TRACES_SAMPLER_ARG=1.0` forced explicitly, a collector `debug`-exporter ground-truth check, and the `instrumentation-http` close-event/keep-alive class of bug — disproven via a full local repro of the real app with zero loss) all came back negative. That last result was the key clue: it proved the bug was not in this codebase's OTel usage or the Node/Express/NestJS request lifecycle, and not fixable by more collector-side tuning — something was happening *before* export was ever attempted.

**The real root cause: `ParentBasedSampler`'s own defaults blindly trust an inherited "not sampled" parent decision, regardless of the configured ratio.** `otel-tracing.ts` originally constructed `new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(samplingRate) })` — only `root` was set. `ParentBasedSampler`'s other four decision slots (`remoteParentSampled`, `remoteParentNotSampled`, `localParentSampled`, `localParentNotSampled`) all default per the OTel spec, and critically **`remoteParentNotSampled`/`localParentNotSampled` default to `AlwaysOffSampler`** — meaning any span with *any* parent context showing "not sampled" skipped `root`'s ratio entirely and was silently never recorded, regardless of `samplingRate` being `1.0`. `TraceIdRatioBasedSampler` and the app's own sampling env vars were both innocent the whole time; the span was simply never created as a recording span in the first place, so nothing ever reached `SimpleSpanProcessor.onEnd()`'s export path — explaining every negative result above at once (no error possible, since nothing failed; unaffected by every collector/CPU/timeout fix, since none of that runs before a sampling decision that already said no).

**Fix: explicitly override the two "not sampled" slots to fall back to the same ratio-based sampler, instead of leaving them at their `AlwaysOff` default:**
```ts
export function createSampler(ratio: number): Sampler {
  return new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(ratio),
    remoteParentNotSampled: new TraceIdRatioBasedSampler(ratio),
    localParentNotSampled: new TraceIdRatioBasedSampler(ratio),
  });
}
```
This makes our own ratio the actual authority on our own sampling regardless of what an upstream parent claims, while deliberately leaving `remoteParentSampled`/`localParentSampled` at their `AlwaysOn` default — so a genuinely-sampled parent is still respected and an already-in-progress upstream-sampled trace is never broken mid-way. **Verified via live A/B on real staging traffic: 0/40 traces missing after this change, vs. the ~75-89% baseline before it.** Regression-covered directly in `otel-tracing.spec.ts` (`createSampler`'s test suite), since this is exactly the kind of one-line-of-config bug that's easy to silently reintroduce.

**Why this was so hard to find: the symptom (spans missing from Cloud Trace) looked identical to the CPU-throttling bug this section is about, but the mechanism was completely unrelated** — one is "the export never completed," the other is "the span was never even recorded." Both produce the exact same observable signature (silent loss, zero errors), which is what made the first, real, but insufficient fix look plausible for so long. The diagnostic method that actually cracked it: bumping the app's own `diag` channel from `WARN` to `DEBUG` (not just the collector's Go-side log level, which was the first thing tried) surfaced OTel's own internal `"Recording is off, propagating context in a non-recording span"` message — traced directly to `Tracer.js`'s `shouldSample()` call, confirming a sampling decision, not an export failure, was the actual point of loss.

**A pragmatic note on how this was tested live:** confirming and fixing this required rebuilding and pushing throwaway diagnostic Docker images directly (bypassing the full CI/PR pipeline) and pointing the live Cloud Run services at them temporarily via `gcloud run services update --image=...` — faster than a full deploy cycle for a one-off diagnostic, but every such image must be treated as disposable and every manual service override reverted once the real fix lands through the normal branch/PR/CI path (see `infra/docker/otel-collector/README.md` for the exact commands used, kept as a reusable playbook).

**Follow-up (2026-08-05, same day, after the sampler fix above merged and deployed): fixing the sampler bug uncovered a second, smaller bug — the OTLP exporter's own default concurrency limit was too low for the traffic the fix now correctly lets through.** `@opentelemetry/otlp-exporter-base`'s `OTLPExporterConfigBase` defaults `concurrencyLimit` to 30 in-flight exports; `BoundedQueueExportPromiseHandler` doesn't queue past that limit, it rejects outright with `Error('Concurrent export limit reached')`, and `SimpleSpanProcessor` never retries a failed export — so each rejection is a genuinely lost span, logged (via `diag.error(JSON.stringify(...))`, which Cloud Logging auto-parses into structured `jsonPayload`, not `textPayload` — query `jsonPayload.stack:"Concurrent export limit reached"`, not a `textPayload` filter, when searching for this). This limit was essentially never hit before the sampler fix, since the sampler was silently dropping most spans before export was ever attempted; once fixed, real traffic correctly generates far more concurrent exports (a single request can fan out to 20-30 child spans, and Cloud Run's own per-instance request concurrency cap is 80), so bursts routinely exceeded 30 — 598 rejections measured in ~80 minutes on staging, including one burst of 500 in 29 seconds. **Fix:** pass `concurrencyLimit: 200` explicitly to the `OTLPTraceExporter` constructor in `otel-tracing.ts`; still self-limiting regardless via each export's own `timeoutMillis` default (10s), which frees a slot even if a downstream call hangs.

**Correction (cross-tool review finding on PR #326, 2026-08-05): the "headroom above the 80-request cap" framing above is misleading and has been removed from the source comment.** The real bound is concurrent *span exports*, not concurrent *requests* — a single request can fan out to 20-30 spans, so the theoretical worst case is far higher than 80, and 80 was never actually the right number to compare against. 200 is justified by the empirically measured rejection pattern at the old default of 30 (598 rejections/80min, one 500-in-29s burst), not by that comparison. This value must be re-verified against live staging traffic after deploy; if rejections recur at 200, the fix is a structural backpressure/queueing redesign, not another arbitrary increase. The exporter config (including `concurrencyLimit`) is now extracted into `buildOtlpExporterOptions()` and directly unit-tested in `otel-tracing.spec.ts` — it previously had no regression coverage at all, also a cross-tool review finding on the same PR.

**Follow-up (2026-08-05, same day): cron-triggered `/pubsub/push` dispatch never got an explicit span, unlike regular domain-event dispatch.** `GcpPubSubEventBusAdapter.dispatchPushMessage()`'s trigger branch (and its pull-mode twin, `dispatchTrigger()`) called `triggerConfig.handler()` bare — no `startActiveSpan()` wrap — while the sibling domain-event branch a few lines below always has one (see the "explicit span for the dispatch boundary itself" comment on that branch). Since `publishTrigger()` publishes cron ticks with empty attributes (no trace context to extract), `runWithExtractedContext()` falls back to whatever was already active — the incoming `POST /pubsub/push` request's own span — and with no explicit span marking the dispatch boundary, a cron-triggered handler's work had no identifiable child span in the trace, matching a real, previously-unexplained finding: cron-triggered `/pubsub/push` traces still showing as missing after both fixes above. **Fix:** wrap both call sites in `this.tracingPort.startActiveSpan(\`pubsub.trigger.${triggerName}\`, ...)`, mirroring the existing event-dispatch pattern exactly.

**Follow-up (2026-08-05, same day): NodeSDK was silently running a metrics export loop against a collector with no metrics pipeline, logging a 404 as an ERROR every cycle, forever.** `bootstrapTracing()` is traces-only by design, but never explicitly disabled metrics — `@opentelemetry/sdk-node`'s `getMetricReadersFromEnv()` falls back to a default OTLP `PeriodicExportingMetricReader` whenever `OTEL_METRICS_EXPORTER` isn't `"none"` and neither `metricReaders` nor `metricReader` is passed. `infra/docker/otel-collector/config.yaml`'s `service.pipelines` only defines `traces:` (metrics deliberately deferred), so every periodic metrics export attempt hit a genuine `OTLPExporterError: Not Found` — the collector's HTTP router has no `/v1/metrics` route registered at all. **Fix:** pass `metricReaders: []` explicitly in `bootstrapTracing()`'s `NodeSDK` config — an empty array is truthy, so it deterministically short-circuits the env-var fallback in code, rather than relying on `OTEL_METRICS_EXPORTER=none` being set in every Cloud Run environment. This is not a stopgap: M17-S35 (Cloud Monitoring dashboards/alerts, `infra/terraform/modules/monitoring`, mostly live in staging as of 2026-08-08 — see docs/18-RELEASE_LIFECYCLE_OPERATIONS.md for the exact status) uses Cloud Run built-in metrics + log-based metrics derived from structured logs — "zero app code" per that story's own design — so the OTel SDK metrics path was never actually needed. **Split 2026-08-08:** the future Managed Prometheus path is now a named story, not a vague "future story" — see `plan/M17-CLOUD-DEPLOY.md`'s M17-S55 section for what would need to change to enable it.

**Update (2026-08-12, M17-S55): metrics are re-enabled — `metricReaders: []` is no longer the steady state.** `bootstrapTracing()` now passes a real `PeriodicExportingMetricReader` (backed by `OTLPMetricExporter`, `temporalityPreference` explicitly `CUMULATIVE` — Google Managed Prometheus's requirement, verified against `@opentelemetry/exporter-metrics-otlp-http`'s real source rather than assumed), and `infra/docker/otel-collector/config.yaml` now has a real `metrics:` pipeline exporting to `googlemanagedprometheus`, so the 404-loop this entry describes no longer applies. What's still true and still governs any future change here: **re-enabling a `NodeSDK` signal without disabling the other, or without a matching collector pipeline for it, reproduces this exact bug.** `PeriodicExportingMetricReader` is timer-driven — the direct metrics-side analog of the traces `BatchSpanProcessor` CPU-throttling-starvation bug documented below — and that risk has not yet been live-verified for the metrics path the way it was for traces (three separate real incidents, each caught only empirically). Treat M17-S55's own AC (timer-starvation, export-concurrency, and temporality-correctness checks, all requiring a real staging deploy) as still open until each is actually run.

**Follow-up (2026-08-06, next day): a fourth bug appeared once the three fixes above let real, dense traffic finally reach the exporter — but the initial root-cause theory (Cloud Trace's own per-project write-API quota) was directly checked and refuted, not just left unconfirmed. The corrected version of this entry matters more than the original: it's a case study in verifying a hypothesis before shipping it as documented fact.** An ordinary burst of ~4 dashboard HTTP requests (each fanning out to 15-20+ spans, per `SimpleSpanProcessor`'s design) produced 71 simultaneous export calls to Cloud Trace within ~300ms, all hitting `context deadline exceeded` and permanently lost (no retry on a synchronous per-call design). The first hypothesis: Cloud Trace's documented per-project write quota (4,800 requests/60s) — https://docs.cloud.google.com/trace/docs/quotas — being burst past, reasoned from converting the 300ms sub-burst into an "instantaneous rate" (~237 req/s) and comparing it to the quota's average rate.

**That reasoning was wrong, and a cross-tool review on PR #327 caught it before merge — checked directly against Cloud Monitoring's own quota metrics for the exact failure windows.** `serviceruntime.googleapis.com/quota/exceeded` (and its v2 sibling) showed **zero** quota-rejection events across the entire period spanning both observed bursts. Actual usage (`serviceruntime.googleapis.com/quota/rate/net_usage`, filtered to `cloudtrace.googleapis.com/write_requests`) peaked at ~1,027 requests in the highest single minute — about 21% of the 4,800 limit, nowhere near exhausted. The arithmetic that made "71 in 300ms" look like a quota violation was never checked against what the quota actually measures (a 60-second window) or what actually happened in that window (usage far below the cap, no rejections). **The real mechanism behind the original failures remains unconfirmed.** CPU/resource contention on the sidecar's small 0.1 vCPU allocation is the next most plausible candidate, but a coarse, ~60s-resolution Cloud Run container CPU metric can't confirm or rule that out either — don't trust it for this class of investigation, and don't let ruling out one hypothesis promote the next one to "confirmed" without its own evidence.

**Fix, kept despite the unconfirmed cause — and only a partial fix, per the honest result below:** reintroduce `batch` (`timeout: 1s`, `send_batch_size: 50` — deliberately far below the old 5s timeout and unbounded default) and `sending_queue: enabled: true` in `infra/docker/otel-collector/config.yaml`. This is **an empirically-validated mitigation for one specific failure mode, not a root-cause fix and not a complete fix.** Verified live on staging with real traffic over ~90 minutes on the *same* long-running collector instance throughout (confirmed via `service.instance.id` in the drop logs — not a fresh-instance effect): **two loss events, not zero** — 32 spans dropped ~2 minutes after deploy, then 28 more ~77 minutes later. The two events split along a real pattern: the 28-span drop correlated with exactly **one** incoming request (`POST /pubsub/push`, a cron trigger) — a single request's own async chain too small to hit `send_batch_size`, relying on the `timeout` timer instead — while a separately-generated real burst of ordinary multi-request dashboard traffic in between went through completely clean (37/37 traces intact). So: **batching fixed the originally-observed, more severe failure mode** (concurrent multi-request bursts — 71 spans lost in one shot under the old no-batch design, 0 lost across a comparable burst here) **but did not fix a narrower, now-confirmed-not-just-theorized failure mode**: low-volume single-request traffic still depends on the timer, the exact CPU-throttling starvation mechanism the 2026-08-05 removal was about. The old (no-batch) design has no comparable timer dependency — every span exports immediately — so batching may be a net-worse choice for this specific low-volume pattern, though no direct old-vs-new comparison exists for it. Kept anyway because the multi-request-burst fix is confirmed and addresses the more severe, more visible original failure mode; the single-request/cron-trigger gap is real, named, and left as an explicit follow-up (`infra/docker/otel-collector/README.md`), not silently treated as solved.

**How often, actually — extended observation, same day, ~2 hours total:** 363 total requests, 2 loss events total, both within the first 77 minutes, zero since despite continued real traffic including a deliberate ~100-request stress test — roughly 1 loss event per ~180 requests in this (still small) sample. A real, low-frequency intermittent gap, not persistent or worsening. Also precise about *what's* lost: even during a loss event the trace itself still shows up in Cloud Trace (verified directly against the Cloud Trace API for the `/pubsub/push` trace during the second drop — the request-level span survives); what's missing is depth, not the trace's existence.

**Risks that are real and explicitly NOT mitigated by this fix:** (1) below `send_batch_size`, a batch's only flush trigger is the `timeout` timer — CONFIRMED live, not just theorized, as the cause of the second drop event above; dense multi-request traffic reliably hits the size threshold and is unaffected, but low-volume single-request traffic (like the `/pubsub/push` case) is not; (2) only tested against one backend + one BFF instance, while production can scale to ~20 BFF + ~3 backend instances all batching independently against the same shared quota; (3) `retry_on_failure` is genuinely rejected as an invalid key by this exporter version (re-confirmed live, 2026-08-06) — the underlying Google Cloud Go client does retry internally, but only within the `timeout: 2s` budget, and once that's exceeded the queue sender logs `"Exporting failed. Dropping data."` with a `dropped_items` count and the batch is gone permanently, no further retry; (4) no persistent queue storage, and both services scale to zero (`min_instance_count = 0`), so a scale-down or restart while spans are queued/batched loses them with no durability backstop. None of these are fixed here — they're documented, accepted risks to revisit if they prove to matter in practice. Full writeup and methodology: `infra/docker/otel-collector/README.md`.

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

## Cloud Run `vpc_egress` mode determines third-party outbound reachability — check before adding network infrastructure

**A Cloud Run service's `vpc_egress` mode determines whether its outbound calls to public (non-VPC) destinations even reach the VPC's firewall/NAT layer at all — the two modes aren't just "more vs. less restrictive," they route traffic through entirely different paths:**
- `PRIVATE_RANGES_ONLY` routes only RFC1918-private-destined traffic through the VPC; a call to any public IP takes Cloud Run's own default internet path instead, bypassing the VPC (and anything configured there — firewall rules, NAT) entirely. A service on this mode can already reach any third party on the internet, unconditionally, with no NAT needed.
- `ALL_TRAFFIC` forces *every* outbound call through the VPC, including calls to public destinations — which then need a real Cloud NAT to reach the internet at all. A VPC built with no NAT (a deliberate, documented choice when the only public-egress need was believed to be Google APIs via Private Google Access) silently has zero third-party reachability for any `ALL_TRAFFIC`-egressing service, with no error until something actually tries.

**Before adding new network infrastructure (Cloud NAT, an egress firewall rule, a forward proxy) to let a restrictively-egressing service make a new third-party call, check whether a service with a more permissive egress mode already in this codebase can host the call instead.** Relocating the call is very often simpler and safer than widening the restrictive service's blast radius — and a service kept deliberately narrow (e.g. the BFF, which fronts public unauthenticated traffic) may have been kept that way on purpose, not by oversight.

**Also worth knowing, considered and rejected during the same investigation:** an IP-CIDR-based egress firewall allow-list is a weak restriction against a shared-edge third party (Cloudflare, and similar CDN/edge providers) — a VPC firewall rule matches IP+port only, never hostname/SNI, and Cloudflare's published IP ranges front a huge number of unrelated domains (anyone can put a domain behind Cloudflare for free in minutes). "Allow Cloudflare's ranges" is much closer to "allow most of the internet" than "allow this one specific hostname." A genuine hostname-level restriction needs Cloud NGFW FQDN-based firewall objects (Enterprise tier) or a forward proxy (Secure Web Proxy), not a plain IP-based rule — real options if a restrictively-egressing service ever genuinely needs its own third-party egress, but real new infrastructure and cost, not a first resort.

**Real incident (M20-S14, 2026-08-27):** a staging lead-form submission failed Turnstile verification on every attempt. Root cause: `TurnstileService.verify()` (BFF) called `https://challenges.cloudflare.com/turnstile/v0/siteverify` — the BFF's first-ever raw outbound call to a non-Google third party — but the BFF runs `ALL_TRAFFIC` egress (required so its own call to the backend's `*.run.app` URL is treated as internal traffic under the backend's `INGRESS_TRAFFIC_INTERNAL_ONLY`) through a VPC with no Cloud NAT. The call had no route out, timed out, and was silently swallowed by the method's own deliberate fail-closed `catch` block — indistinguishable at the application layer from a genuinely rejected token. A Cloud NAT + IP-CIDR firewall fix was drafted first (as a standalone TD) and then abandoned once investigation found the actual fix needed no new infrastructure at all: `OpenRouterLlmAdapter` already makes a raw third-party call directly from the backend, which runs `PRIVATE_RANGES_ONLY` and was therefore already unconditionally internet-reachable. Moving Turnstile verification into the backend (`CloudflareTurnstileAdapter`, mirroring `OpenRouterLlmAdapter`'s exact shape) eliminated the whole problem class. Full reasoning trail: `plan/M20-LEAD-FORM-MODULE.md` § M20-S14.

---

## Controller, Route, and Shared-UI Boundaries

- Controllers and route files are composition layers only. They may parse input and choose the use case/helper, but branching policy and response shaping belong in the owning slice.
- Controller input must be validated at the boundary. Prefer `@Body(new ZodValidationPipe(Schema))` or `@Query(new ZodValidationPipe(Schema))` with a typed DTO over raw `@Body('x')`, `@Query('x')`, or `@Param('x')` reads when the endpoint accepts structured input.
- Do not treat `/internal` routes as a shortcut around validation. They still need explicit DTO or pipe validation for every externally supplied value.
- Feature-specific transport helpers should live with the feature or capability that owns them. Generic buckets are for cross-cutting code only.
- Shared UI primitives should expose readonly props where practical, so consumers cannot mutate shared contracts by accident.
- Any `dangerouslySetInnerHTML` usage must go through a controlled helper or component with an explicit sanitization path; never inline raw HTML injection in a page or reusable component.

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

## Static locale/config files in workspace packages

`packages/i18n/locales/**` (and any future non-TypeScript static assets in a workspace package) sit outside that package's `src/`/`tsconfig.json` `include` — they are never compiled or copied into `dist/`. Importing them via a TS `import` statement only works in the source tree and silently breaks once the consuming app runs compiled JS.

Read them via Node's own module resolution instead, which works identically in dev (`ts-node`) and compiled prod:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const localesRoot = join(dirname(require.resolve('@ikaro/i18n/package.json')), 'locales');
const data = JSON.parse(readFileSync(join(localesRoot, locale, 'notifications.json'), 'utf-8'));
```

`require.resolve('<package>/package.json')` always resolves to the package root regardless of whether the package ships `src/` or `dist/` — `package.json` is never excluded from a build. Read all supported locales once in the constructor (`JsonLocalizationAdapter` is the model here) rather than re-reading per call.

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

## Authoring new i18n UI copy keys (`packages/i18n/locales/*/web.json`)

- Always add the key to **both** `pt-BR/web.json` and `en/web.json` in the same commit — never ship a key in one locale only.
- Namespace by UI area, matching existing top-level keys (`hotsite.*`, `auth.*`, `booking.*`, `seo.*`, etc.) rather than inventing a new top-level namespace for a feature that belongs under an existing one.
- Use ICU placeholders (`{name}`, `{location}`) for interpolated values — see `seo.defaultTitleWithLocation` for the pattern — never string-concatenate translated fragments.
- Server Components call `useTranslations()` directly (no `'use client'` needed — see Code Standards). Only reach for a Context-based hook like `useFormatting()` when the value also depends on tenant-specific formatting (currency, date), not just translated text.

---

## Exception handling & i18n pattern (`code`-driven, TD23)

Every error that crosses an HTTP boundary — backend → BFF → web — carries a stable, machine-readable `code` (never just a free-text `message`/`detail`). `code` is the only thing frontend message-selection is allowed to branch on; `status` is transport/routing only.

### The envelope

`ProblemDetail` (`packages/types/src/errors.dto.ts`):

```typescript
interface ProblemDetail {
  type: string;          // always 'about:blank' — never a URI fragment encoding the error identity
  title: string;
  status: number;
  code?: string;          // the only field frontend message-selection is allowed to branch on
  field?: string;         // which request field is at fault, single-cause errors only — routing use, never message selection
  params?: Record<string, string | number>;
  detail: string;         // backend-internal/debug text only — contractually never rendered to a user (docs/ANTI_PATTERNS.md)
  violations?: { field: string; code: string; params?: Record<string, string | number> }[];
}
```

Two shapes, not one:
- **Single-cause errors** (the ~65 named domain error classes, raw base-class throws, and VO `create()` errors) use top-level `code` + optional `field`. Constructed via `buildProblemDetail()` (`packages/types/src/errors.dto.ts`) / thrown via `throwProblemDetail()` (`packages/nestjs-http/src/problem-detail.ts`).
- **Batch/multi-field validation** (Zod pipes, both backend's and the BFF's) use `violations[]`, one `{ field, code, params? }` entry per failing field.

### Code naming convention

`<ORIGIN>_<REASON>`, upper snake case:
- Backend domain, by context: `BOOKING_*`, `CUSTOMER_*`, `STAFF_*`, `LOYALTY_*`, `PLATFORM_*`
- Backend shared VOs: `ADDRESS_*`, `COUNTRY_CODE_*`, `PHONE_*`, `MONEY_*`, `SEO_*`, `SLUG_*`, `HEX_COLOR_*`, `TIMEZONE_*`, `TIME_OF_DAY_*`, `EMAIL_*` — see "VO validation errors must be mapped with a typed `code`" above for how a VO's own error class ties into this
- BFF-originated: `BFF_*` (e.g. `BFF_GUEST_TOKEN_INVALID`, `BFF_UPSTREAM_UNAVAILABLE`)
- Framework/generic fallback: `AUTH_UNAUTHORIZED`, `AUTH_FORBIDDEN`, `INTERNAL_ERROR`, `NOT_FOUND`, and the small closed `GenericErrorCode` set for VO-less Zod rules (see "Single source of truth for a validation rule's code" above)

Every origin is exported from `packages/types/src/error-codes.ts` as an `as const` object + derived literal union type (e.g. `BookingErrorCode`), collected into `AnyErrorCode`. Each context's base error class constructor types its `code` param against its own union, not `string` — constructing an error with an uncatalogued code is a compile error, not just a documented convention. The BFF further narrows this: `apps/bff/src/shared/http/problem-detail.ts`'s `throwProblemDetail()` wraps `@ikaro/nestjs-http`'s and types its `code` param against `BffThrowableCode` (only the origins a BFF site is actually allowed to throw), so a BFF call site can't accidentally throw an unrelated backend-only code.

### Shared translation catalog

`packages/i18n/locales/{locale}/errors.json` — one entry per code, keyed by the exact code string. `apps/web/shared/lib/i18n/error-codes-exhaustiveness.spec.ts` (TD23 Story 17) CI-enforces that every catalog code has a translation key in both `pt-BR` and `en`, with no orphaned keys in either direction.

### Frontend resolver

`apps/web/shared/lib/i18n/resolve-error-message.ts`:
- `resolveErrorMessage(code, locale, params?)` — the only thing allowed to select a message. Never `status`, `.detail`, or raw backend text (`docs/ANTI_PATTERNS.md`).
- `extractProblemCode(err)` / `resolveErrorMessageFromApiError(err, locale)` — pulls `code` out of the `bffClient`-backed error classes (`ApiError`, `AuthError`, `ForbiddenError`) that carry a parsed `ProblemDetail` body via `.data` (delegates to `extractProblemDetailShape()` in `shared/lib/api/errors.ts`, the single implementation for all three — TD31 Story 7).
- An unrecognized/missing code falls back to a generic message and `console.warn`s, so a code/locale gap is observable instead of silently swallowed — never falls through to rendering `detail`.

### `status` vs `code`

`status` is transport/routing only: 401 → redirect to login, 403 → forbidden screen, 404 → `notFound()`, 409 → conflict-specific UI state, 5xx → generic retry copy. `code` is the only thing that selects a message. No component branches on `status===400` to pick a message.

### Code lifecycle

Codes are additive-only once shipped — never renamed or repurposed (a released frontend bundle may hold a cached reference to one during a rolling deploy). Retiring a code: remove every throw site first, then leave the catalog entry + translation in place for at least one release cycle before deleting both together.

### Adding a new error — checklist

1. Add the code to the relevant literal union in `packages/types/src/error-codes.ts` — the compiler rejects step 3 until this is done.
2. Add a translation entry to **both** `packages/i18n/locales/pt-BR/errors.json` and `.../en/errors.json` — the exhaustiveness test (`apps/web/shared/lib/i18n/error-codes-exhaustiveness.spec.ts`) rejects a missing one.
3. Construct/throw the error with the typed constructor from step 1's origin — `throwProblemDetail(status, BookingErrorCode.XXX, detail, field?)` for a raw throw, or a named domain error class implementing `DomainErrorShape` for a VO/aggregate error.

### Security-sensitive errors: specificity is a per-case decision

The default is "assign the most specific code available" — wrong for paths where revealing the precise internal reason creates an enumeration/information-disclosure risk (e.g. distinguishing "no account with this email" from "account exists, wrong linked provider" in an auth/staff-linking flow). Each such error set must make an explicit, deliberate specificity decision — collapse multiple internal reasons into one generic code where warranted, rather than mechanically exposing the most specific code by default.

Full discovery and rollout history: `td/TD23-EXCEPTION-HANDLING-I18N-PATTERN.md`.

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

## Testing Patterns (detail)

Full mandatory rules → `docs/08-TESTING_STRATEGY.md §Mandatory Patterns`.

### Builder pattern (mandatory)

All test data uses builder classes with fluent `withXxx()` / `build()`. Never plain factory functions or raw object literals in specs.

Builder types:
- `XxxEntityBuilder` — TypeORM entity builders
- `XxxBuilder` — aggregate builders
- `XxxEventBuilder` / `XxxCommandBuilder` — `DomainEvent`/`Command` builders (e.g. `StaffInvitedEventBuilder`, `BookingReminderDueCommandBuilder`) — mandatory for any event/command class constructed inline in more than one spec file
- `RequestContextBuilder` — shared request-context stub

### InMemory doubles

Prefer InMemory classes over `jest.fn()` for any port or repository:
- `InMemoryEventBus` — event bus
- `InMemoryTransactionManager` — transaction manager
- `InMemoryXxxRepository` — per-context repos
- `InMemoryXxxPort` — cross-context ports (in `src/test/infrastructure/`)
- `InMemoryCachePort` — `CachePort` (get/set/del + configurable failure injection for error-path tests)

**A same-directory precedent file can itself predate this rule and be non-compliant — check this section before pattern-matching off a neighboring `*.spec.ts`.** (PR #373 review, Codex, 2026-08-15: `caching-service.repository.spec.ts` was written using raw `jest.fn()` mocks, copying `caching-tenant.repository.spec.ts`'s style exactly — but that file predates `InMemoryCachePort`'s existence and violates this same documented rule. Both were rewritten to use `InMemoryCachePort` in the same PR.)

### Caching decorator repositories — DI wiring

Building a new `CachingXxxRepository` (wrapping a `TypeOrmXxxRepository` behind `CachePort`, same shape as `CachingTenantRepository`/`CachingServiceRepository`)? Two DI-registration mistakes are easy to make and easy to miss, since `tsc --noEmit` doesn't catch either — only a real Nest DI container resolving the module at runtime does:

- **Constructor parameter type must be the port interface (`IXxxRepository`), not the concrete `TypeOrmXxxRepository` class — but that requires an explicit `@Inject(TypeOrmXxxRepository)` token.** Interfaces are erased at compile time, so Nest's constructor-reflection metadata can't infer an injection token from an interface-typed parameter; omitting the explicit `@Inject()` fails at runtime with an unresolvable-dependency error, not a type error. The interface typing is what makes the class substitutable with an `InMemoryXxxRepository` in a unit spec — don't drop it in favor of the concrete class just to avoid adding the decorator.
- **Don't register the caching class as its own bare provider once its only real consumer is the port token binding.** `providers: [TypeOrmXxxRepository, CachingXxxRepository, { provide: XXX_REPOSITORY, useClass: CachingXxxRepository }]` instantiates `CachingXxxRepository` **twice** — once for the bare class token, once for `XXX_REPOSITORY` — unless something else in the module actually injects it by class reference. Register only `TypeOrmXxxRepository` (needed for the `@Inject()` token above) and the `{ provide: XXX_REPOSITORY, useClass: CachingXxxRepository }` binding.

(PR #373 review, Codex, 2026-08-15: both mistakes were introduced in `CachingServiceRepository`'s first draft and fixed in the same PR — see `apps/backend/src/contexts/booking/infrastructure/repositories/caching-service.repository.ts` and `booking.module.ts` for the corrected shape. `CachingTenantRepository`'s own registrations in `platform.module.ts`/`platform-settings.module.ts` still carry the redundant-bare-provider version of the second mistake — left as-is, out of scope for that PR; don't copy it as precedent.)

### Integration test DB isolation

Unique inline tenant UUID for any `it()` sensitive to aggregate counts. Never reuse `TENANT_A`/`TENANT_B` for count assertions — cross-test contamination.

### Shared test-builder date defaults

A shared test builder's default field representing a point in time (`expiresAt`, `startedAt`, `lastMessageAt`, …) must be computed relative to `Date.now()` at construction time, never a hardcoded calendar-date literal. A hardcoded date is only safe for as long as real calendar time stays behind it — it silently drifts from "safely far in the future" into "already expired" as the codebase ages, with no error anywhere, until something actually queries for staleness. In this codebase that "something" is a global, cross-tenant retention-purge job (`ChatbotRetentionPurgeJob`, `LeadFormRetentionPurgeJob`) that scans the *entire* shared integration-test Postgres instance with no per-file/per-tenant boundary — so a leftover row from any other spec file that used a builder's stale default is a legitimate purge candidate, and an integration test asserting an *exact* deleted-row count will intermittently fail depending on file execution order and how much real time has passed since the builder was written.

Confirmed to recur twice with the identical root cause and symptom:
- `ChatbotSessionEntityBuilder`'s hardcoded `startedAt`/`lastMessageAt` caused `ChatbotRetentionPurgeJob`'s own integration spec to sweep up a leftover row from `tenant-settings.controller.integration.spec.ts` — worked around locally in that one call site (`recentSession()`, forcing both fields to "now") rather than fixed at the builder itself, so the underlying defect was left in place for the next builder to repeat.
- `LeadFormSubmissionBuilder`'s hardcoded `expiresAt` (`2026-07-01`) caused the identical failure for `LeadFormRetentionPurgeJob`'s own integration spec once real calendar time passed that date (M20-S04 precedent, 2026-08-25 — caught in CI, not locally, since the contaminating row came from a *different* spec file than the one being debugged).

**Fix, both times:** compute the default relative to construction time (e.g. `new Date(Date.now() + 180 * DAY_MS)`), not a literal ISO string. **Also harden any test asserting an exact global count from a job with no tenant/file boundary** — prefer row-level existence/non-existence assertions for the fixtures the test itself created, with the count assertion relaxed to a lower bound (`toBeGreaterThanOrEqual`) rather than an exact `toBe`, since the test can never assume it's the only source of rows in the shared database.

### Integration app helpers — mandatory default overrides

Every integration app helper that imports a module with a network-calling adapter must default-override that adapter's token with an in-memory stub **before** the caller's overrides run (caller wins):

```ts
let builder = Test.createTestingModule({ imports: [..., BookingModule] })
  .overrideProvider(EVENT_BUS).useValue(routingBus)
  .overrideProvider(STORAGE_SERVICE).useValue(new InMemoryStorageService()); // default

for (const { provide, useValue } of overrideProviders) {
  builder = builder.overrideProvider(provide).useValue(useValue); // caller wins
}
```

Current helpers and required default overrides:

| Helper | Default override |
|---|---|
| `createBookingIntegrationApp()` | `STORAGE_SERVICE` → `InMemoryStorageService` |
| `createNotificationIntegrationApp()` | `STORAGE_SERVICE` → `InMemoryStorageService` |

When adding a new shared module with a network-calling adapter, update every helper that imports it.

### Reuse the shared Nest cache test module

Any integration test harness that needs `CacheModule` wiring must import `apps/backend/src/test/utils/test-cache-module.ts` instead of copy-pasting `CacheModule.register(...)` inline — keeps cache TTL/store config consistent across every harness that needs it.

### NestJS module provider pattern (useClass not useExisting)

```ts
// ❌ WRONG — adapter instantiated even when STORAGE_SERVICE is overridden in tests
providers: [GcsSignedUrlAdapter, { provide: STORAGE_SERVICE, useExisting: GcsSignedUrlAdapter }]

// ✅ CORRECT — overriding STORAGE_SERVICE fully prevents instantiation
providers: [{ provide: STORAGE_SERVICE, useClass: GcsSignedUrlAdapter }]
```

**Why:** `useExisting` creates an alias but registers the class as a standalone provider too. Test `overrideProvider()` removes the alias; the standalone class is still instantiated — and any `onApplicationBootstrap` network calls run, causing `ECONNREFUSED`.

### Notification spec setup

Use `createNotificationIntegrationApp()`; suppress unrelated handlers; drain provisioning noise before recording idempotency baseline. See `docs/08-TESTING_STRATEGY.md`.

### Migration / entity registration

Every new migration class and TypeORM entity must be added to `src/test/integration-global-setup.ts` (and to any context-specific helper like `notification-integration-app.ts`) in the **same commit** as the migration file. Skipping causes silent failures — unit tests pass but integration tests error on the first DB query. This applies to a migration that only adds an index, not just one that creates a table — `pnpm architecture-check`'s `test-harness-registration` detector catches a missing entry either way.

### Standalone index for a cross-tenant system job

`docs/13-DATABASE_SCHEMA.md`'s Indexing Strategy rule ("every index MUST start with `tenant_id`") has one narrow, explicit exception: a system-triggered job that deletes/scans across **every tenant in one pass, with no `tenant_id` predicate at all** — a daily retention purge (`ChatbotRetentionPurgeJob`, `LeadFormRetentionPurgeJob`), matching `ExpirePointsJob`'s own precedent. A `(tenant_id, X)` composite index can't be seeked by a query that never filters on `tenant_id` — Postgres has to fall back to a full index/table scan regardless of how well `X` alone would narrow the search, which degrades as the table grows.

When drafting a new job of this shape, check the table's existing indexes for a **standalone** index on the job's own filter column, not just a composite one that happens to include it as a trailing column. Confirmed to be missed twice in a row before being caught by review: `chatbot_messages.IDX_chatbot_messages_created_at` (added after the fact by `AddStartedAtIndexToChatbotSessions`, M19-S07) and `lead_form_submissions.IDX_platform_lead_form_submissions_expires_at` (added after the fact in M20-S04, 2026-08-25, Codex review finding on PR #422 — the story's own draft named only the pre-existing `(tenant_id, expires_at)` composite index, by habit, without checking whether the job's actual query could seek it). When a new story's job description says "mirror `<X>RetentionPurgeJob`'s shape exactly," that includes checking whether `<X>`'s table needed this same standalone-index fix — not just copying the job/handler/controller file shapes.

`packages/architecture-check/architecture-policy.json`'s `testDataHarnessRegistrations` section is the machine-checked source of truth for this — one entry per file that declares a TypeORM `entities:`/`migrations:` array (`integration-global-setup.ts` plus the 6 `src/test/utils/*-integration-app.ts`/`test-datasource.ts` helpers). `integration-global-setup.ts` is declared `"complete"` and must carry every production entity/migration; the rest are `"partial"` with an explicit, intentional `entities` subset. Adding a new entity to one of the partial helpers' code array without updating its matching policy entry (or vice versa) is flagged as drift by `pnpm architecture-check`'s `test-harness-registration` detector (TD37-S07) — update both in the same commit, not just the code.

### BFF tests

Two test files per controller: `.spec.ts` (unit) + `.component.spec.ts` (component). Helper-file isolation:
- `component-test.helpers.ts` — for component specs only
- `backend-http.mock.ts` — for unit specs only

`test:cov` must exclude component specs — coverage instruments `AppModule` at import time, triggering `validateEnv` before env vars are set.

---

## Web — Shared Helpers (`apps/web`)

### Shared format functions belong in `shared/lib/formatting/`

Any function that takes `locale`, `currency`, `timezone`, or `dateFormat` as a parameter belongs in `apps/web/shared/lib/formatting/` — not in a feature-owned folder like `features/booking/` or `features/platform/hotsite/`. The boundary test: *if the function would work identically in the booking flow and the hotsite, it's shared formatting, not domain logic.*

Current `shared/lib/formatting/` inventory:

| File | Exports |
|---|---|
| `format-money.ts` | `formatMoney(amount, locale, currency)` |
| `format-duration.ts` | `formatDuration(minutes)` |
| `format-time.ts` | `formatTime`, `formatDate`, `formatDateLong`; re-exports `DateFormat` from `@ikaro/i18n` |
| `date-utils.ts` | `toISODate`, `addDays` — pure date math |
| `locale-validators.ts` | `isValidTimezone`, `resolveDateFormat` |
| `formatting-context.ts` | `FormattingContext`, `FormattingState` |
| `use-formatting.ts` | `useFormatting()` hook |

### Other shared web helpers

- `apps/web/shared/lib/api/` owns the browser/server BFF transport helpers that multiple features need.
- `apps/web/shared/lib/i18n/` owns the shared Next Intl request helpers and locale resolution logic.
- `apps/web/shared/utils/` owns pure helpers like phone formatting, date math, and initials.
- Feature-specific helpers should live under `apps/web/features/<domain>/...`; shell-specific helpers should live under `apps/web/shells/<surface>/...`.

### `DateFormat` and `TimeFormat` types — use `@ikaro/i18n`

`DateFormat` (`'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'`) and `TimeFormat` (`'24h' | '12h'`) are exported from `packages/i18n` — they derive from `CountrySpec` which already defines them. Import from there, never redefine locally:

```ts
import type { DateFormat, TimeFormat } from '@ikaro/i18n';
```

### NBSP normalization in `Intl.NumberFormat` output

`Intl.NumberFormat` for currency formatting emits non-breaking spaces that vary by locale:
- `U+00A0` (NBSP) — `pt-BR` between `R$` and the amount; `ru-RU` emits two of them
- `U+202F` (narrow NBSP) — `fr-FR` between digits and currency symbol

A bare `.replace(' ', ' ')` is wrong in two ways: no `g` flag (misses duplicates) and misses `U+202F`. Always use:

```ts
.replace(/[  ]/g, ' ')
```

### `reconstitute()` skips domain validation — guard at the web boundary

`TenantSettings.reconstitute()` (used when loading an entity from the DB) deliberately skips validation to avoid erroring on rows written before a validation rule existed. Any web code that consumes a field loaded via `reconstitute()` — such as `timezone` from the hotsite manifest — must apply a defensive guard before passing the value to a strict API like `Intl.DateTimeFormat`:

```ts
// BAD — trusts that DB row is valid; Intl throws on malformed timezone
const timezone = manifest.localization.timezone;

// GOOD — falls back to 'UTC' if DB value is malformed
const timezone = isValidTimezone(manifest.localization.timezone)
  ? manifest.localization.timezone
  : 'UTC';
```

`isValidTimezone` is in `lib/formatting/locale-validators.ts`. The same pattern applies to any manifest field whose DB-level validity is enforced only by `create()`, not `reconstitute()`.

---

## Cloudflare Turnstile's test sitekey never renders an interactive iframe

**Cloudflare's "always passes visible" test sitekey (`1x00000000000000000000AA` — the only sitekey this repo ever configures) auto-verifies without rendering an interactive challenge iframe at all.** The real widget script runs against it and calls `turnstile.render()` normally, but instead of loading a visible `<iframe src="https://challenges.cloudflare.com/...">`, it writes a dummy token straight into its own hidden `<input type="hidden" name="cf-turnstile-response">` the moment `render()` resolves. An E2E assertion built around `page.frameLocator('iframe[src*="challenges.cloudflare.com"]')` will time out waiting for an element the test key was never going to produce — no matter how correct the surrounding app code is.

**Confirmed empirically (M20-S09 PR #433, 2026-08-26):** the same "guest completes Turnstile" E2E assertion failed identically across three consecutive review rounds. The first two fix attempts were both real, correct, necessary bugs — a `TurnstileWidget` lifecycle bug that recreated the real widget on every parent re-render, and a completely missing CSP allowance for `challenges.cloudflare.com` that would have broken the feature in production for every real visitor — but neither one was ever going to make an iframe appear, because the test key doesn't produce one. The actual root cause was only found by instrumenting the live test with `page.evaluate()` to dump the widget's real DOM and `window.turnstile`'s state, which showed a fully-rendered, fully-verified widget with zero `<iframe>` elements anywhere in the tree.

**Fix:** wait on the hidden input Cloudflare's own client exposes for this exact non-JS-fallback purpose, not on iframe rendering:

```ts
// BAD — the test sitekey never renders this
const turnstileFrame = page.frameLocator('iframe[src*="challenges.cloudflare.com"]');
await expect(turnstileFrame.locator('body')).toBeVisible({ timeout: 15_000 });

// GOOD — this is what the test sitekey actually produces
await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
  timeout: 15_000,
});
```

If a future story adds a *second*, differently-configured Turnstile widget (a real production sitekey exercised against a different environment), re-verify this assumption for that specific sitekey before reusing the hidden-input wait — this behavior is a documented property of the test key, not necessarily every key.

---

## CSP allowances for a new external UI resource must be scoped to what a fresh document load can carry, not to the one page that uses it

**Content-Security-Policy is a document-response header — the browser only re-reads and re-applies it on a fresh top-level navigation, never on a Next.js client-side (`next/link`) route transition.** A CSP directive computed per-pathname in middleware (`apps/web/proxy.ts`'s `buildContentSecurityPolicy()`) only takes effect for the *document* the browser actually requested fresh; every subsequent client-side navigation inside that same document keeps enforcing whatever CSP came back with it, regardless of what the new pathname's own middleware logic would otherwise compute. Scoping a new external resource's CSP allowance narrowly — "only the one page that uses it" — is correct reasoning for a route the user always reaches via a fresh top-level load, but silently wrong for any route also reachable via client-side navigation from a page whose own CSP doesn't carry the allowance.

**Confirmed live (M20-S15, 2026-08-28):** `needsTurnstileSrc()` allowed `challenges.cloudflare.com` only when the pathname was exactly `/[slug]/lead-form`. The lead-form CTA (`LeadFormModule.tsx`) is a plain `next/link` `<Link>` from the hotsite home page — a soft navigation. A guest who loaded the home page fresh (its CSP excluded Turnstile) and then clicked the CTA kept enforcing the home page's CSP the whole time; the Turnstile script/iframe was silently blocked with no console error a casual check would catch, and the widget hung on "Verificando segurança..." forever. A hard refresh (Ctrl+F5) masked the bug during manual testing by forcing a fresh top-level load straight to `/lead-form`, which does get the correct CSP — every existing E2E spec also used `page.goto()` directly for the same reason, so none of them caught it either.

**Fix — scope the CSP allowance to the same route tree a user could soft-navigate within, not to the one page that actually needs the resource** (mirrors `needsMapsFrameSrc`'s existing tree-wide scoping in the same file):

```ts
// BAD — correct in isolation, wrong once soft navigation is possible from a page with a
// narrower CSP: a guest landing on the hotsite home page (no Turnstile allowance) and then
// clicking into /lead-form via <Link> keeps the home page's CSP the whole time.
function needsTurnstileSrc(pathname: string): boolean {
  return isHotsiteRoute(pathname) && pathname.split('/')[2] === 'lead-form';
}

// GOOD — whichever hotsite page loads fresh already carries a CSP that permits the resource,
// regardless of which page within that tree the user then soft-navigates to.
function needsTurnstileSrc(pathname: string): boolean {
  return isHotsiteRoute(pathname);
}
```

**Before adding CSP support for any new external service reachable from the UI** (a script, an iframe, a `fetch`/`connect-src` target, a font, an image host) — check every page a user could realistically soft-navigate *from* into the page that needs it, not just the page that needs it. If any such entry point's own CSP wouldn't carry the allowance, scope the directive to the whole reachable route subtree instead of the single consuming page. Widening the CSP tree-wide is almost always simpler and lower-risk than trying to force every entry point into a full top-level navigation — per the "mounting complexity" principle (CLAUDE.md §7): reach for the approach that needs no extra machinery, not the one that needs a new safeguard bolted on per entry point.

---

## Hotsite full-page components must explicitly paint `--ba-background`

**`app/[slug]/layout.tsx`'s `applyBranding()` only defines `--ba-*` CSS custom properties on the root element — it never sets an actual `background-color`.** Every existing full-page hotsite view (`/[slug]/login`, `/[slug]/booking`'s `BookingForm`, `InformationCompletionPrompt`, `Unavailable`, `SubmitInfoForm`/`SubmitInfoSuccessView`, the chatbot panel) independently wraps its own content in a `min-h-screen` element that explicitly sets `backgroundColor: 'var(--ba-background)'` — the branding variables are consumed, not inherited as an actual paint. A component that only sets `color: 'var(--ba-text)'` and skips the background falls through to the browser's default white background regardless of the tenant's actual branding.

**Confirmed via live manual testing (M20-S09 PR #433, 2026-08-26):** all 5 lead-form states (skeleton, form, login-required gate, terminal/error card, success) shipped without this, and passed every automated check — type-check, lint, `pnpm architecture-check`, and jsdom-based axe-core accessibility tests (41/41 green) — because none of them compute real rendered color contrast. The bug was invisible in CI and only surfaced when the user tested against a real dark-themed tenant (white `--ba-text`, near-black `--ba-background`): white text on the browser's default white background, completely unreadable, for every one of the 5 states.

**Fix — the established pattern, copy it exactly:**

```tsx
// BAD — text color is branded, but nothing paints an actual background
<div className="mx-auto max-w-2xl px-6 py-12" style={{ color: 'var(--ba-text)' }}>
  ...
</div>

// GOOD — matches every other full-page hotsite view
<main className="min-h-screen" style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}>
  <div className="mx-auto max-w-2xl px-6 py-12">
    ...
  </div>
</main>
```

A secondary trap in the same incident: a component with a *fixed*, non-branded accent background (e.g. a hardcoded `bg-blue-50` info callout) must pair it with a *fixed* text color (`text-blue-900`), never `--ba-text` — a dark-themed tenant's white text is invisible against a background that never changes with branding. This is the same fixed-bg/fixed-text pairing this codebase's validation/captcha banners already use (`text-red-800` on `bg-red-50`, `text-amber-800` on `bg-amber-50`) — the inconsistency was in the one component that didn't follow its own siblings' pattern.

**Since jsdom-based axe-core cannot catch this class of bug, don't treat a green component-test suite as proof a new full-page view is visually correct — this is exactly the class of defect the Local verification gate (CLAUDE.md §0) exists to catch, and is worth a real-browser check against at least one dark-themed and one light-themed tenant before considering a new public-facing page done.**

---

## `no-restricted-syntax` selectors must be checked against every already-documented bypass shape in the same config file, not just the one form the target code currently uses

**A new `no-restricted-syntax` selector added to `apps/web/eslint.config.js` (or its backend/BFF equivalents) that only covers the literal AST shape of the code it was written against will miss every alternate JS/JSX shape expressing the same thing — and this file already documents 3 recurring bypass classes from real incidents, right next to wherever a new selector gets added.** Checking a new selector against all 3 before considering it done is cheap; discovering them one at a time across separate review rounds is not.

The 3 documented classes, each with an existing example selector in this same file to copy from:
1. **Computed-literal member access** — `window['fetch'](...)`, `page['getByText'](...)`. The property is a `Literal` node with a `.value`, not an `Identifier` with a `.name`, so `callee.property.name` alone never matches it. See `RAW_FETCH_SELECTOR`'s `:matches(...)` construct for the fix shape.
2. **A bare, non-member call** — `const { getByText } = page; getByText(...)`. No `MemberExpression` exists at all; needs a separate `[callee.type='Identifier'][callee.name=...]` branch in the same `:matches(...)`.
3. **A value nested inside a `JSXExpressionContainer` or a conditional/logical expression, rather than as the JSX attribute's own direct value** — `data-testid={'literal'}`, `data-testid={cond ? \`x\` : 'y'}`. A direct-child combinator (`>`) only matches the container's immediate expression; use a descendant combinator (plain whitespace) to reach one nested inside a `ConditionalExpression`/`LogicalExpression`.

**Confirmed recurring (TD37-S23, PR #450, 2026-08-31):** all 3 classes were rediscovered one at a time across 4 separate Codex review rounds while adding 3 new selectors (E2E-1/E2E-2/E2E-3) — despite class 1's own fix already sitting in the same file being edited, as `RAW_FETCH_SELECTOR`'s existing `window['fetch'](...)` handling (added for an earlier, unrelated selector, PR #375). Each round's finding was real and correctly fixed, but a systematic check against all 3 classes during the *first* pass would have caught most of them before ever pushing.

## Before a blind `Write` on a file believed to be new, grep for its expected exported symbols first

**A file's absence from the specific area you're currently working on is not proof of its absence from the repo.** The `Write` tool's own "must `Read` an existing file first" safeguard only tracks files *this agent session* has read — not actual on-disk state — so a file that already exists but was never `Read` in-session can be silently overwritten with no warning, no error, and no diff-conflict signal of any kind.

This is most likely to happen when a piece of shared infrastructure was built earlier (in an earlier story, or earlier in the same session) for one consumer's need, and a later task assumes — reasonably, but wrongly — that because *its own* area of the codebase has no wiring to that infrastructure, the infrastructure itself must not exist yet. Before creating a new file via `Write`, grep the codebase for the exact symbol names you're about to export — not just for wiring into the specific component you're currently touching.

**M21-S04 precedent, 2026-09-02:** `apps/web/shells/dashboard/model/resource-route.ts` (`matchResourceRoute`/`isResourceCreateRoute`) was blindly `Write`-created while investigating why the dashboard topbar showed the wrong title for a new section, on the reasonable-looking assumption that no such route-matcher existed (nothing in `topbar-route.ts`/`Topbar.tsx` referenced one). The file already existed from the section's original implementation and was already imported by `BottomNav.tsx` for an unrelated purpose (hiding the mobile nav on drill-down routes). The overwrite was functionally harmless only by luck — the rewritten logic happened to be equivalent, confirmed by `BottomNav.tsx`'s own spec suite still passing — but the overwrite of the sibling `.spec.ts` file silently dropped one of the original test cases, caught only by manually diffing against `git log --follow` after the fact, not by any automated check.

## SonarCloud's duplicate-test rule (`S5976`) can retroactively flag pre-existing tests once a new similarly-shaped test is added

**The rule's threshold is 3-or-more structurally-similar test bodies in the same file — adding a single new test can tip an already-existing, previously-unflagged pair over that threshold, even though neither pre-existing test changed.** Fixing one flagged group of 3 near-identical tests does not make the file immune to a *second*, unrelated finding of the same shape forming elsewhere in the same file from your own new addition.

Before adding a new "mock one input, render, assert one output" style test to a spec file, grep that file for other tests sharing the same shape (a single `mockReturnValue`/`mock` call, a `render`, and one assertion) — if 2 already exist, your new one will form a flaggable trio. Parameterize into a single `it.each()` proactively (see `BottomNav.spec.tsx` for the established pattern in this codebase) rather than discovering it in a second bot-review round.

**M21-S04 precedent, 2026-09-02:** fixing one flagged trio of near-identical resource-route topbar tests by parameterizing them into `it.each()`, then separately adding one new simple "resources list title" test in the same file, formed a brand-new flaggable trio out of that new test plus two unrelated, pre-existing tests — "renders the page title matching the current pathname" (bookings route) and "falls back to 'Dashboard' for an unrecognised pathname" — that had coexisted, unflagged, in the same file for months before this change.

## A lock only orders callers who both acquire it — it does not bypass an independent cache sitting behind the read it's protecting

**Acquiring a lock (advisory or row-level) before re-reading a value only guarantees that two lock-holding transactions see each other's writes in some order. It guarantees nothing about whether that "fresh" re-read is actually fresh, if the read's normal code path passes through a caching layer the lock has no relationship to.** The lock and the cache are two independent mechanisms; correctly using one says nothing about the other. A transaction that wins the lock and then calls a cached repository method still gets whatever the cache last held — not the row the lock just protected.

Before trusting a lock to make a read authoritative, check what that read's normal method actually does: if it's backed by a `CachingXxxRepository` (or any read-through cache), the lock needs to pair with a **cache-bypassing** read method — not just correct ordering between callers. This codebase's existing pattern for that is `findByIdForUpdate()`: a real Postgres row lock (`pessimistic_write`) that deliberately skips the cache entirely, as opposed to the cached `findById()` used everywhere else.

**M21-S03 precedent, PR #460 round 7, 2026-09-04:** `OpenScheduleUseCase`'s first attempt at closing a tenant-settings TOCTOU race (a concurrent `PATCH /tenants/settings` narrowing `businessHours` mid-request) added a second, tenant-scoped advisory lock (`lockTenantSettings`) around the window-bound check. The lock itself worked exactly as designed — it correctly serialized two concurrent callers relative to each other. But the "fresh" re-read taken after acquiring it still went through `CachingTenantRepository`'s up-to-60s-TTL `findById()`, so the lock provided zero actual freshness guarantee: whichever transaction won the lock could still validate against a stale cached `businessHours` value. Caught by Codex review, which correctly identified that the fix didn't close the race it claimed to. Fixed by discarding the advisory-lock design entirely and reusing `ITenantRepository.findByIdForUpdate()` instead — following `UpdateHotsiteContentUseCase`'s existing precedent for the identical class of cross-aggregate invariant (Tenant settings vs. another aggregate). The fix also *simplified* the design: it removed a whole custom lock mechanism (`ITenantLockPort`'s `lockTenantSettings` method, a `TenantLockModule` promotion to `shared/`) in favor of reusing infrastructure that already existed and was already proven — see `docs/13-DATABASE_SCHEMA.md` § `schedule_openings` Rules for the full before/after.

## Re-check a same-file documented invariant when extending an existing algorithm to a new dimension mid-PR

**When a bot review (or any mid-PR discovery) prompts adding a genuinely new dimension to an existing computation — not just fixing the one gap that was flagged — explicitly re-derive the new code against every invariant already documented for that feature area in the same doc file, not only the specific gap that triggered the change.** A sentence stating a general rule, sitting near the algorithm being extended, is a checklist item to verify the new code against — not ambient background reading that can be skimmed past because it predates the current change.

This is easy to miss precisely because the invariant isn't new information — it was already read, understood, and even cited earlier in the same work session. The miss isn't "didn't know the rule," it's "didn't re-apply the rule to the specific new code path being written right now."

**M21-S03 precedent, PR #460 rounds 8–9, 2026-09-04:** `docs/02-DOMAIN_MODEL.md` already stated, before any resource-scoping work began on `AvailabilityService`, that "the tenant calendar is a hard outer boundary... a resource opening never bypasses a tenant-wide closure or extends beyond a tenant opening/window." Round 8 (prompted by a Codex finding that resource-scoped closures/openings were persisted but invisible to the availability calculator) extended `resolveEffectiveHours()` to be resource-aware — but the new code let *any* applicable opening, tenant-wide or resource-scoped, short-circuit past every closure check unconditionally, at every scope, violating the invariant that was already sitting in the same doc file the story's own discovery had loaded. Round 9's Codex review caught it one round later as a fresh Critical finding on code that had existed for exactly one round. The fix required resolving the tenant window first as a hard outer boundary (the original single-scope algorithm, unchanged), only then resolving a resource-level window within it, and intersecting — a design that was fully specified by the invariant that already existed before round 8 ever started.

## `architecture-check`'s `transactional-save` detector requires `save()` to be textually inside `txManager.run()` — not merely reachable through it

**The detector does AST-nesting analysis, not data-flow or call-graph analysis: it checks whether a repository `save()` call sits directly inside the `txManager.run(async () => {...})` callback's own syntax tree, not whether it's reachable at runtime from inside that callback.** A `save()` call that is transactionally correct (it runs inside the active transaction context at runtime) still gets flagged if it's textually defined in a *separate* method that the callback merely calls — even a private helper on the same class, called only from that one callback.

When splitting a use case's post-lock logic into a validation step plus the actual persist step (e.g. to keep a long `execute()` method under the line-count limit, or to separate "what to check" from "what to write"), keep the `save()` call literally inline in the `txManager.run()` callback. Put validation-only logic in the extracted helper; never let that helper also call `save()`.

**M21-S03 precedent, PR #460 round 7, 2026-09-04:** `OpenScheduleUseCase`'s post-lock logic was first extracted into a single `validateAndSave()` helper that validated the window bound *and* called `openingRepo.save()`. The detector flagged it, since `save()` was reachable only via a method call from `txManager.run()`, not textually inside it. Fixed by renaming the helper to `validateUnderLock()` (validation only) and keeping the actual `await this.openingRepo.save(opening)` call inline in the `txManager.run()` callback itself.

# TD40 — resource_occupancy write-path batching and lifecycle hygiene

## Status
- **Type**: Technical Debt / Performance & Data Lifecycle
- **Priority**: Low (neither story fixes a correctness bug; both are efficiency/hygiene items explicitly triaged and declined as out-of-scope during M22-S03's PR review — no live tenants yet, so no current production impact)
- **Context**: `booking` context — `booking.resource_occupancy` / `booking.booking_line_resource_assignments`
- **Created**: 2026-09-17
- **Discovered**: PR #483 (M22-S03) bot-review cycle (Codex, multiple agents/rounds). Both findings were explicitly triaged and declined as out-of-scope for that story, with a stated intent in the PR thread to track them as follow-up TDs.
- **Decision status**: Ready for discovery and implementation in the order below (both stories are independent — no dependency edge); individual stories still begin with `/story-discovery`.
- **Related**: `plan/M22-MULTIVERTICAL-SERVICE-AVAILABILITY.md` (M22-S03), `docs/13-DATABASE_SCHEMA.md` § `booking.resource_occupancy`

## Problem

M22-S03 shipped the `booking.resource_occupancy` exclusivity engine (PR #483). Across its 13-round bot-review cycle, two real, non-correctness findings surfaced repeatedly and were explicitly declined for that PR rather than fixed:

1. **Per-candidate write amplification.** `TypeOrmResourceOccupancyRepository.assign()` loops its `candidates` array sequentially, and each iteration's `insertOne()` does `upsertAssignment()` (one query) followed by `manager.insert(ResourceOccupancyEntity, ...)` (one query) — two sequential DB round trips per resolved candidate, all inside the write transaction while `BookingSlotConflictService`'s resource-scoped advisory locks (`ITenantLockPort`) are held. Today's candidate counts are small and bounded per booking (one row per line/leg/quantity-unit, not per pool member — the reasoning for the original decline), but the round-trip count scales linearly with resolved assignments, and the time an advisory lock is held scales with it too. This matters more once bundles/pools/legs (M22's own new capability) see real usage.

2. **No retention purge for `resource_occupancy`.** `docs/13-DATABASE_SCHEMA.md` documents the table as "the separate, short-lived locking mechanism — pure exclusivity lock, safely garbage-collectable after its window elapses (retention: 90 days past `ends_at`, trickle-deleted the same way `shared.outbox`/`shared.inbox` already are)" — but M22-S03 never implemented an actual purge job for any `lock_state`. This is most visible for the new `REQUESTED` state (a degenerate/LOCATION-fallback service's PENDING-request row, deliberately excluded from the GIST exclusion constraint so it never blocks a concurrent request for the same popular slot): an abandoned PENDING booking that's never approved, rejected, or cancelled leaves its `REQUESTED` assignment + occupancy rows indefinitely, since nothing currently sweeps them. The codebase already has the exact precedent for this class of job — `ExpirePointsJob`, `ChatbotRetentionPurgeJob`, `LeadFormRetentionPurgeJob` — this story just never got one.

Both were verified against the current codebase before drafting this TD (not assumed from the bot's original claim): `assign()`'s sequential-loop shape and `insertOne()`'s two-query-per-candidate body are unchanged as of the merged PR #483; a repo-wide grep for any purge/GC/retention/sweep job referencing `resource_occupancy` or `ResourceOccupancy` returns nothing.

---

### Stories

- Story 1: Batch `resource_occupancy` assignment/occupancy writes per candidate — no dependencies
- Story 2: `resource_occupancy` retention purge job — no dependencies (independent of Story 1)

```mermaid
graph TD
  S1["Story 1: Batch assign() writes"]
  S2["Story 2: Retention purge job"]
```

---

### Story 1 — Batch `resource_occupancy` assignment/occupancy writes per candidate ✅ Done

**Agent:** `backend-ts`
**Complexity:** S
**Docs to load:** `docs/13-DATABASE_SCHEMA.md` § `booking.resource_occupancy` / `booking.booking_line_resource_assignments`, `docs/ENGINEERING_RULES.md` § Transactions
**Dependencies:** none
**Pattern:** plain composition — batch the existing per-row SQL into set-based statements (a multi-row `VALUES` insert + one upsert-assignment query returning every row, plus TypeORM's own multi-row `insert()` form for the occupancy rows), same "single set-based statement, not row-by-row" discipline `ChatbotRetentionPurgeJob` already established in this codebase (`chatbot-retention-purge.job.ts`'s own code comment explains why row-by-row was rejected there: an unbounded N+1 and a cross-transaction TOCTOU race).
**Discovered:** PR #483 (M22-S03) bot review — Codex, performance/scalability agent, flagged in the very first review round and recurring through round 9; explicitly declined there as out-of-scope for that story (2026-09-17), tracked here as promised.

**Description:**
For a booking with multiple resolved candidates (a bundle, a fungible pool with `requiredQuantity > 1`, or a legged service with several legs), `TypeOrmResourceOccupancyRepository.assign()` currently performs 2N sequential DB round trips (N = candidate count) inside the write transaction, while `BookingSlotConflictService`'s resource-scoped advisory locks are held for the whole transaction's duration:

```ts
async assign(tenantId, bookingLineId, candidates, lockState, holdExpiresAt): Promise<void> {
  for (const candidate of candidates) {
    await this.insertOne(manager, tenantId, bookingLineId, candidate, lockState, holdExpiresAt);
  }
}
private async insertOne(...): Promise<void> {
  const assignmentId = await this.upsertAssignment(manager, tenantId, bookingLineId, candidate, now); // query 1
  await manager.insert(ResourceOccupancyEntity, { ... }); // query 2
}
```

Batch `upsertAssignment` into one multi-row `INSERT ... ON CONFLICT (...) DO NOTHING RETURNING id, tenant_id, booking_line_id, resource_id, leg_index, quantity_position` unioned with one fallback `SELECT` (matching `(tenant_id, booking_line_id, resource_id, leg_index, quantity_position)` tuples that already existed) so every candidate's assignment id is resolved in one round trip regardless of how many were newly inserted vs. reused. Then batch the occupancy inserts via TypeORM's `manager.insert(ResourceOccupancyEntity, [...])` multi-row form (already supported, just not used here). Preserve exact per-candidate error mapping (`rethrowOccupancyInsertError`, which distinguishes a genuine GIST-exclusion conflict from an unrelated DB error) and every existing assertion about immutable-assignment-row reuse on reschedule/re-approval.

**Files to create/modify:**
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-resource-occupancy.repository.ts` (modify — `assign()`/`insertOne()`/`upsertAssignment()`)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-resource-occupancy.repository.spec.ts` (modify)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-resource-occupancy.repository.integration.spec.ts` (modify — add a multi-candidate batched-write assertion against real Postgres)

**Acceptance criteria — product:**
- [ ] No user-observable behavior change — a booking with multiple resolved resource candidates is still assigned/committed exactly as before, just with fewer round trips and less time holding the resource-scoped advisory lock.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `assign()` with 3+ candidates issues one batched upsert query and one batched occupancy insert, not 2×N sequential queries (mock `EntityManager` call-count assertion)
  - [ ] Per-candidate GIST-violation error mapping still surfaces via `rethrowOccupancyInsertError` for a batched insert
- Integration:
  - [ ] A multi-candidate `assign()` (e.g. a 2-leg service) still produces exactly one assignment + one occupancy row per candidate against real Postgres
  - [ ] A reschedule to the same resolved resource set still reuses the existing (immutable) assignment rows rather than duplicating them, under the batched write path
- Tenant isolation: none — no new cross-tenant surface, existing `tenant_id` scoping unchanged
- E2E: none — covered by unit/integration
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

---

### Story 2 — `resource_occupancy` retention purge job

**Agent:** `backend-ts`
**Complexity:** S
**Docs to load:** `docs/13-DATABASE_SCHEMA.md` § `booking.resource_occupancy` (retention: 90 days past `ends_at`), `docs/ENGINEERING_RULES.md` § Standalone index for a cross-tenant system job — plus the direct code precedent at `apps/backend/src/contexts/platform/application/jobs/chatbot-retention-purge.job.ts` and `apps/backend/src/contexts/platform/infrastructure/events/chatbot-retention-purge-trigger.handler.ts`
**Dependencies:** none
**Pattern:** plain composition — new `ResourceOccupancyRetentionPurgeJob` + trigger handler, following `ChatbotRetentionPurgeJob`/`ChatbotRetentionPurgeTriggerHandler`'s exact shape (a single set-based `DELETE` inside `txManager.run()`, registered on the shared cron trigger bus via `ITriggerBus.registerTrigger()` — no new scheduling infrastructure).
**Discovered:** PR #483 (M22-S03) bot review — Codex, lifecycle-hygiene finding, flagged in the very first review round; explicitly declined there as out-of-scope for that story (2026-09-17), tracked here as promised.

**Description:**
Add a booking-context job that deletes `resource_occupancy` rows whose `ends_at` is more than 90 days in the past, for **every** `lock_state` (`REQUESTED`, `HOLD`, `COMMITTED` alike) — matching the documented retention policy. `booking_line_resource_assignments` (the immutable audit record) is never touched by this job, the same invariant `release()`/`assign()` already preserve elsewhere in this codebase. Register via the existing cron trigger bus (`ITriggerBus`), mirroring `ChatbotRetentionPurgeTriggerHandler`'s registration shape exactly.

Given `HOLD` rows already carry a `hold_expires_at` and their own (currently unenforced, per M22-S03's own explicit non-goal) expiry-driven release path, this job's scope is the 90-day retention sweep only — it is **not** the active hold-expiry enforcement worker M22-S03 explicitly deferred as real M23 booking-flow scope. Don't conflate the two: this job purges rows whose physical window has long passed regardless of `lock_state`; a `HOLD` row past its own `hold_expires_at` but still within the 90-day retention window is untouched by this job.

**Backend use case steps:**
1. `ResourceOccupancyRetentionPurgeJob` (`application/jobs/resource-occupancy-retention-purge.job.ts`, new): `run(now: Date = new Date())` computes `cutoff = now - 90 days`, runs one set-based `DELETE FROM booking.resource_occupancy WHERE ends_at < cutoff` inside `txManager.run()`, returns `{ rowsDeleted: number }`.
2. `ResourceOccupancyRetentionPurgeTriggerHandler` (`infrastructure/events/resource-occupancy-retention-purge-trigger.handler.ts`, new): registers on `ITriggerBus` with a new `CRON_RESOURCE_OCCUPANCY_RETENTION_PURGE_TRIGGER` constant, calls the job, logs the result — identical shape to `ChatbotRetentionPurgeTriggerHandler`.
3. Register the new cron trigger name wherever `CRON_CHATBOT_RETENTION_PURGE_TRIGGER` and its siblings are declared/scheduled — confirm the exact file (`cron-trigger-names.constants.ts` and whatever enumerates existing cron triggers) and whether the existing retention jobs' Cloud Scheduler wiring lives in `infra/terraform/` (if so, this story needs a Terraform change too — confirm devops co-ownership during `/story-discovery`, don't assume backend-only scope without checking).

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/jobs/resource-occupancy-retention-purge.job.ts` (new)
- `apps/backend/src/contexts/booking/application/jobs/resource-occupancy-retention-purge.job.spec.ts` (new)
- `apps/backend/src/contexts/booking/infrastructure/events/resource-occupancy-retention-purge-trigger.handler.ts` (new)
- `apps/backend/src/contexts/booking/infrastructure/events/resource-occupancy-retention-purge-trigger.handler.spec.ts` (new)
- `apps/backend/src/contexts/booking/booking.module.ts` (modify — register the new job + trigger handler)
- Cron trigger name registration file — verify exact path during `/story-discovery` (same file `CRON_CHATBOT_RETENTION_PURGE_TRIGGER` lives in)
- `infra/terraform/` Cloud Scheduler config, if the existing retention jobs are scheduled there (verify during `/story-discovery`)

**New migration / i18n keys / env vars / feature flags:** none expected — `ends_at` and `lock_state` already exist. Verify during `/story-discovery` whether a standalone `(ends_at)` index is needed for this new unscoped, cross-tenant sweep query, per the documented "a new cross-tenant, unscoped system job needs its own standalone index matching its filter column" rule (the existing `(tenant_id, resource_id, starts_at)` index can't be seeked once the query drops the `tenant_id` filter).

**Acceptance criteria — product:**
- [ ] A `resource_occupancy` row (any `lock_state`) whose `ends_at` is more than 90 days in the past is deleted by the next scheduled purge run.
- [ ] `booking_line_resource_assignments` rows are never deleted by this job (immutable audit record preserved).

**Acceptance criteria — technical:**
- Unit:
  - [ ] `ResourceOccupancyRetentionPurgeJob.run()` deletes only rows past the 90-day cutoff, for each `lock_state` (`REQUESTED`, `HOLD`, `COMMITTED`)
  - [ ] `ResourceOccupancyRetentionPurgeTriggerHandler` registers on the trigger bus and calls the job, logging `rowsDeleted`
- Integration:
  - [ ] A real Postgres row with `ends_at` 91 days in the past is deleted; a row at 89 days is not; `booking_line_resource_assignments` row count is unchanged either way
- Tenant isolation:
  - [ ] The purge is deliberately cross-tenant/unscoped (same as `ExpirePointsJob`/`ChatbotRetentionPurgeJob` precedent) — confirm during `/story-discovery` whether a standalone index is needed, per the rule cited above
- E2E: none — covered by unit/integration
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

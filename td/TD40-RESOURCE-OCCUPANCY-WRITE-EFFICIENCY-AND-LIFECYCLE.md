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

**Agent:** `backend-ts` + `devops`
**Complexity:** S
**Docs to load:** `docs/13-DATABASE_SCHEMA.md` § `booking.resource_occupancy` (retention: 90 days past `ends_at`), `docs/ENGINEERING_RULES.md` § Standalone index for a cross-tenant system job, `infra/terraform/README.md` § New-resource PR-sequencing playbook — plus the direct code precedent at `apps/backend/src/contexts/platform/application/jobs/lead-form-retention-purge.job.ts` / `.../typeorm-lead-form-submission.repository.ts`'s `deleteExpired()` (closest shape: single repo, no child-table cascade) and `apps/backend/src/contexts/platform/infrastructure/events/chatbot-retention-purge-trigger.handler.ts` + `apps/backend/src/contexts/platform/infrastructure/controllers/cron-chatbot.controller.ts` (trigger-handler + manual-trigger-controller shapes)
**Dependencies:** none
**Pattern:** plain composition — new `ResourceOccupancyRetentionPurgeJob` + trigger handler + manual-trigger controller endpoint, following `LeadFormRetentionPurgeJob`/`LeadFormRetentionPurgeTriggerHandler`/`CronChatbotController`'s exact shape (a single set-based `DELETE` via the query-builder form inside `txManager.run()`, registered on the shared cron trigger bus via `ITriggerBus.registerTrigger()` — no new scheduling infrastructure beyond the required Cloud Scheduler entry below).
**Discovered:** PR #483 (M22-S03) bot review — Codex, lifecycle-hygiene finding, flagged in the very first review round; explicitly declined there as out-of-scope for that story (2026-09-17), tracked here as promised.
**Devops PR sequence (resolved at `/story-discovery`, 2026-09-17):** 2 PRs, per `infra/terraform/README.md`'s "new Pub/Sub topic (cron trigger) + its app code" row. **PR1** (`envs/*` + `apps/backend`, label `infra-app-mix-ok`): all backend app code below, the new `google_cloud_scheduler_job` entry in `infra/terraform/modules/scheduler/main.tf`'s `locals.jobs` (`ikaro-cron-resource-occupancy-retention-purge` → topic_key `cron-resource-occupancy-retention-purge`, schedule `"0 3 * * *"`, matching the other daily purges), and `infra/terraform/pubsub-catalog.json` regenerated via `pnpm --filter @ikaro/infra-scripts run pubsub-catalog`. **PR2** (`foundation` only): add `cron-resource-occupancy-retention-purge` to the publisher-binding `for` loop in both `infra/terraform/foundation/envs/prod/main.tf` and `.../staging/main.tf` — **and, while touching that same loop, also add the already-missing `cron-lead-form-retention` entry** (pre-existing drift found during this story's discovery, unrelated to this story but cheapest to fix in the same edit).

**Description:**
Add a booking-context job that deletes `resource_occupancy` rows whose `ends_at` is more than 90 days in the past, for **every** `lock_state` (`REQUESTED`, `HOLD`, `COMMITTED` alike) — matching the documented retention policy. `booking_line_resource_assignments` (the immutable audit record) is never touched by this job, the same invariant `release()`/`assign()` already preserve elsewhere in this codebase. Register via the existing cron trigger bus (`ITriggerBus`), mirroring `ChatbotRetentionPurgeTriggerHandler`'s registration shape exactly. "Trickle-deleted" in `docs/13-DATABASE_SCHEMA.md` means "daily cron, not backfill-style" — not literal chunked/batched deletes; a single set-based `DELETE` per run matches `ChatbotRetentionPurgeJob`/`LeadFormRetentionPurgeJob`'s existing precedent.

Given `HOLD` rows already carry a `hold_expires_at` and their own (currently unenforced, per M22-S03's own explicit non-goal) expiry-driven release path, this job's scope is the 90-day retention sweep only — it is **not** the active hold-expiry enforcement worker M22-S03 explicitly deferred as real M23 booking-flow scope. Don't conflate the two: this job purges rows whose physical window has long passed regardless of `lock_state`; a `HOLD` row past its own `hold_expires_at` but still within the 90-day retention window is untouched by this job.

**Backend use case steps:**
1. `IResourceOccupancyRepository` (`application/ports/resource-occupancy-repository.port.ts`, modify): add `deleteOlderThan(cutoff: Date): Promise<number>` — deliberately no `tenantId` param, unlike every other method on this port (cross-tenant, unscoped sweep). `TypeOrmResourceOccupancyRepository` (`infrastructure/repositories/typeorm-resource-occupancy.repository.ts`, modify) implements it identically to `TypeOrmChatbotMessageRepository.deleteOlderThan()`: `(getActiveEntityManager() ?? this.repo.manager).createQueryBuilder().delete().from(ResourceOccupancyEntity).where('ends_at < :cutoff', { cutoff }).execute()`, return `result.affected ?? 0`.
2. `ResourceOccupancyRetentionPurgeJob` (`application/jobs/resource-occupancy-retention-purge.job.ts`, new): `run(now: Date = new Date())` computes `cutoff = now - 90 days`, calls `resourceOccupancyRepo.deleteOlderThan(cutoff)` inside `txManager.run()`, returns `{ rowsDeleted: number }` — mirrors `LeadFormRetentionPurgeJob`'s exact shape (single repo + `TRANSACTION_MANAGER` injected).
3. `ResourceOccupancyRetentionPurgeTriggerHandler` (`infrastructure/events/resource-occupancy-retention-purge-trigger.handler.ts`, new): registers on `ITriggerBus` with a new `CRON_RESOURCE_OCCUPANCY_RETENTION_PURGE_TRIGGER = 'cron-resource-occupancy-retention-purge'` constant (added to `apps/backend/src/contexts/booking/infrastructure/events/cron-trigger-names.constants.ts`, alongside the existing `CRON_REMINDERS_TRIGGER`), calls the job, logs the result — identical shape to `ChatbotRetentionPurgeTriggerHandler`.
4. `CronBookingController` (`infrastructure/controllers/cron-booking.controller.ts`, modify): add a `@Post('resource-occupancy-retention-purge')` manual/local-trigger endpoint calling `triggerBus.publishTrigger(CRON_RESOURCE_OCCUPANCY_RETENTION_PURGE_TRIGGER)`, identical to `CronChatbotController`'s multi-endpoint pattern (this controller currently has only `reminders()`).
5. New migration `AddEndsAtIndexToResourceOccupancy` (`infrastructure/migrations/`, new, next sequential timestamp after `1748500000014`): plain `CREATE INDEX` on `resource_occupancy(ends_at)` alone — confirmed no standalone index on this column exists today (only `(tenant_id, resource_id, starts_at)`), required per `docs/ENGINEERING_RULES.md` § Standalone index for a cross-tenant system job (this exact gap-class already missed twice: `chatbot_messages`, `lead_form_submissions`). Follows `AddStartedAtIndexToChatbotSessions`/`AddExpiresAtIndexToLeadFormSubmissions`'s precedent (no `CONCURRENTLY` — no production traffic yet; re-verify that's still true immediately before executing, not just at drafting time).

**Files to create/modify:**
- `apps/backend/src/contexts/booking/application/ports/resource-occupancy-repository.port.ts` (modify — add `deleteOlderThan`)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-resource-occupancy.repository.ts` (modify — implement `deleteOlderThan`)
- `apps/backend/src/contexts/booking/infrastructure/repositories/typeorm-resource-occupancy.repository.spec.ts` (modify)
- `apps/backend/src/contexts/booking/application/jobs/resource-occupancy-retention-purge.job.ts` (new)
- `apps/backend/src/contexts/booking/application/jobs/resource-occupancy-retention-purge.job.spec.ts` (new)
- `apps/backend/src/contexts/booking/infrastructure/events/resource-occupancy-retention-purge-trigger.handler.ts` (new)
- `apps/backend/src/contexts/booking/infrastructure/events/resource-occupancy-retention-purge-trigger.handler.spec.ts` (new)
- `apps/backend/src/contexts/booking/infrastructure/events/cron-trigger-names.constants.ts` (modify — add `CRON_RESOURCE_OCCUPANCY_RETENTION_PURGE_TRIGGER`)
- `apps/backend/src/contexts/booking/infrastructure/controllers/cron-booking.controller.ts` (modify — add manual-trigger endpoint)
- `apps/backend/src/contexts/booking/infrastructure/controllers/cron-booking.controller.spec.ts` (modify)
- `apps/backend/src/contexts/booking/infrastructure/migrations/<next-timestamp>-AddEndsAtIndexToResourceOccupancy.ts` (new)
- `apps/backend/src/contexts/booking/booking.module.ts` (modify — register the new job + trigger handler as bare-class providers, next to the existing `BookingReminderJob` pair)
- `apps/backend/src/test/integration-global-setup.ts` (modify — register the new migration)
- `docs/13-DATABASE_SCHEMA.md` (modify — add the new standalone index to `resource_occupancy`'s index row)
- `infra/terraform/modules/scheduler/main.tf` (modify — new `locals.jobs` entry)
- `infra/terraform/pubsub-catalog.json` (modify — regenerated via `pnpm --filter @ikaro/infra-scripts run pubsub-catalog`)
- `infra/terraform/foundation/envs/prod/main.tf` (modify — add `cron-resource-occupancy-retention-purge` + the pre-existing missing `cron-lead-form-retention` to the publisher-binding `for` loop)
- `infra/terraform/foundation/envs/staging/main.tf` (modify — same as above)

**New migration / i18n keys / env vars / feature flags:** one new migration (standalone `ends_at` index, see step 5 above) — `ends_at` and `lock_state` columns already exist, no entity/column change needed. No i18n keys, no env vars, no feature flags.

**Acceptance criteria — product:**
- [ ] A `resource_occupancy` row (any `lock_state`) whose `ends_at` is more than 90 days in the past is deleted by the next scheduled purge run.
- [ ] `booking_line_resource_assignments` rows are never deleted by this job (immutable audit record preserved).

**Acceptance criteria — technical:**
- Unit:
  - [ ] `ResourceOccupancyRetentionPurgeJob.run()` deletes only rows past the 90-day cutoff, for each `lock_state` (`REQUESTED`, `HOLD`, `COMMITTED`)
  - [ ] `ResourceOccupancyRetentionPurgeTriggerHandler` registers on the trigger bus and calls the job, logging `rowsDeleted`
  - [ ] `CronBookingController`'s new endpoint publishes `CRON_RESOURCE_OCCUPANCY_RETENTION_PURGE_TRIGGER` and returns `{ ok: true }`
  - [ ] `TypeOrmResourceOccupancyRepository.deleteOlderThan()` issues one query-builder `DELETE ... WHERE ends_at < :cutoff`, no `tenant_id` predicate
- Integration:
  - [ ] A real Postgres row with `ends_at` 91 days in the past is deleted; a row at 89 days is not; `booking_line_resource_assignments` row count is unchanged either way
  - [ ] The new migration creates a standalone index on `ends_at` — verified via a structural `pg_indexes` existence check, not an `EXPLAIN`-plan assertion (neither of this job's two direct precedents, `IDX_platform_lead_form_submissions_expires_at`/`IDX_chatbot_messages_created_at`, has an `EXPLAIN`-based test anywhere in this codebase, and a query-plan assertion is inherently flaky against a small integration-test dataset's table statistics — Codex round-2 finding, PR #488, 2026-09-17)
- Tenant isolation:
  - [ ] The purge is deliberately cross-tenant/unscoped (same as `ExpirePointsJob`/`ChatbotRetentionPurgeJob` precedent) — covered by the standalone index above, not a `tenant_id` filter
- E2E: none — covered by unit/integration
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

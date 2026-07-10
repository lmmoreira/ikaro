# TD24 — Transactional Outbox + Inbox Pattern (shared schema)

## Status
- **Type**: Architecture / Reliability
- **Priority**: Medium (no active incident; closes a real but narrow at-least-once duplication gap)
- **Contexts affected**: `shared` (new), every context that publishes domain events (`booking`, `loyalty`, `staff`, `platform`, `notification`), starting with the three M17-S03 cron jobs
- **Discovered**: 2026-07-10 (M17-S03 PR #107 review — a `cron_run_log` idempotency table was built, found to be a false guarantee, and removed)

---

## Problem

`GcpPubSubEventBusAdapter.publish(event)` calls out to Pub/Sub directly from inside application-layer code (jobs, use cases). Pub/Sub delivery is at-least-once, so any consumer must tolerate redelivery — but redelivery of the *same* message is only half the problem. The harder case: **the same business event gets published twice, as two distinct messages with two distinct `eventId`s**, because the code path that publishes it ran twice (a retried job, an overlapping/concurrent invocation, a crash between publish and whatever bookkeeping was meant to record "already sent").

Downstream consumers dedupe by `eventId` (`processed_events` tables, per-context, keyed `(event_id, consumer_name)`). That catches genuine Pub/Sub redelivery of one message. It does **not** catch two independently-published messages describing the same fact, because each carries its own fresh `eventId` (`DomainEvent`'s constructor calls `uuidv7()` unconditionally — see `apps/backend/src/shared/domain/domain-event.ts`).

M17-S03 hit this directly: `BookingReminderJob`, `AdminScheduleReminderJob`, and `NotifyExpiringPointsJob` are cron-triggered, at-least-once, and publish customer-facing notification events. A first attempt at a fix added a `cron_run_log` table (`hasRun`/`markRun`, one copy per context) as a coarse per-tenant/day gate before publishing. It didn't work as intended:

- `markRun()` can never be atomic with the `eventBus.publish()` calls it's meant to gate — a Postgres transaction cannot span a Pub/Sub publish (the dual-write problem). So the gate only protected against a narrow crash-window race (crash between last publish and `markRun` commit), while doing nothing for the more likely case: two overlapping/concurrent deliveries both passing `hasRun()` before either writes `markRun()`.
- It duplicated ~26 lines of near-identical repository code per context (one `TypeOrmCronRunLogRepository` in `booking`, one in `loyalty`), which is what tripped SonarCloud's new-code duplication gate (3.6%, limit 3%).

The table was removed in review rather than patched, because patching it (e.g. an atomic `INSERT ... ON CONFLICT DO NOTHING` claimed *before* processing) trades one failure mode for a worse one: claiming the slot before publishing means a mid-loop crash silently drops the rest of that tenant's reminders forever (no future retry, since the day is already marked done), which is worse for the business than an occasional duplicate email.

---

## Root Cause

There is no primitive in this codebase for "publish exactly-once as far as consumers can tell." Every `eventBus.publish()` call is a bare, unprotected call to an external system from inside a use case or job — reliable delivery is entirely Pub/Sub's problem, and duplicate-avoidance is entirely each consumer's problem, solved ad hoc per context (`processed_events` in `notification` and `loyalty`, nothing in `booking`).

---

## Proposed Fix — Transactional Outbox + Inbox, in a new `shared` schema

### Why `shared`, not per-context

An outbox/inbox table isn't business data owned by `booking` or `loyalty` — it's transport infrastructure, the same category as Pub/Sub itself. Every context already crosses a system boundary to publish (calling out to Pub/Sub); writing to `shared.outbox` inside the same local transaction is not a bounded-context violation in the sense CLAUDE.md's "never a SQL JOIN across contexts" rule targets (that rule is about joining two contexts' *business* data). Postgres has no problem with one transaction touching multiple schemas in the same database.

Putting it in one shared schema also kills the exact duplication problem that surfaced this TD: one physical outbox table (and one inbox table) instead of a per-context copy for every context that needs reliable publishing.

### Outbox (producer side)

1. `shared.outbox` table: `id`, `event_name`, `payload` (jsonb — the full `DomainEvent` envelope), `created_at`, `published_at` (nullable — null means "not yet relayed").
2. Application code stops calling `eventBus.publish(event)` directly. Instead, inside the **same local transaction** as whatever business write triggered the event (or, for jobs with no other business write, in its own transaction), it writes a row to `shared.outbox`. This is the atomic part the `cron_run_log` attempt couldn't achieve — the business fact and the intent-to-publish are now one Postgres write.
3. A **relay** reads unpublished (`published_at IS NULL`) rows, calls the real `GcpPubSubEventBusAdapter.publish()`, and marks the row published on success. This is the piece that doesn't exist today and is the hard part of this TD (see Open Design Questions).

### Inbox (consumer side)

The existing `processed_events` pattern is already most of an inbox — this TD should generalize it into `shared.inbox` (one physical table, `(event_id, consumer_name)` unique key) rather than the current per-context copies (`notification.processed_events`, `loyalty.processed_events`), for the same duplication reason as the outbox side.

---

## Open Design Questions (resolve before implementation — this is the hard part)

1. **How does the relay run on Cloud Run's scale-to-zero model?** A naive polling loop needs a long-lived process, which conflicts with M17's scale-to-zero design (D1/D2 in `plan/M17-CLOUD-DEPLOY.md`). Options to evaluate: a dedicated small Cloud Run service with `min_instances=1` (defeats scale-to-zero for one component, but it's one component, not three); `pg_notify`-driven relay woken by triggers instead of polling; a scheduled Cloud Run Job running frequently (loses low-latency delivery, cron jobs are already latency-tolerant so this may be acceptable for the cron use case specifically but not for user-facing events like `BookingApproved`).
2. **Exactly-once relay of the relay itself.** The relay process reading + publishing + marking-published is itself a multi-step operation that needs its own concurrency-safety (e.g. `SELECT ... FOR UPDATE SKIP LOCKED` if multiple relay instances can run) — don't reintroduce the same class of bug one level up.
3. **Scope: cron-only first, or all `eventBus.publish()` call sites?** Once a real outbox exists, every publish call *should* go through it for consistency — otherwise the codebase has two publishing paths with different reliability guarantees, which is arguably worse than the current single (unreliable) path. Decide whether this TD ships cron-only as a first slice with a migration plan for the rest, or blocks on doing it everywhere at once.
4. **Ordering guarantees.** Does the relay need to preserve publish order per aggregate/tenant, or is out-of-order delivery acceptable (Pub/Sub itself doesn't guarantee ordering without ordering keys)? Affects whether `SKIP LOCKED` (out-of-order-safe) is viable or a stricter sequential relay is needed.
5. **Outbox table growth / cleanup.** Published rows need a retention/cleanup policy (a scheduled delete of rows older than N days past `published_at`), otherwise `shared.outbox` grows unboundedly.
6. **Inbox table consolidation migration.** Migrating `notification.processed_events` and `loyalty.processed_events` into one `shared.inbox` is a data migration, not just a schema addition — needs its own plan (dual-write period, backfill, cutover) if done without downtime.

---

## Non-Goals (for this TD's first slice)

- Do not attempt to retrofit `cron_run_log`-style dedup — it's gone, and the outbox/inbox pattern replaces the need for it entirely (a job publishing twice writes two outbox rows describing the same fact, but the *inbox* on the consumer side only needs `eventId`-level dedup once the outbox itself guarantees each business fact is durably recorded before any publish attempt — re-examine whether producer-side dedup is even still needed once the outbox exists, or whether it becomes redundant).
- Do not build a general-purpose message broker abstraction. This TD is scoped to making `IEventBus.publish()`'s existing contract (semantically single-delivery per business fact) actually hold, not to replacing Pub/Sub.

---

## Acceptance Criteria (first slice — scope to be finalized during discovery)

- [ ] `shared.outbox` table + migration exists
- [ ] At least one publisher (recommend: the M17-S03 cron jobs, since they're the motivating case) writes to the outbox transactionally instead of calling `eventBus.publish()` directly
- [ ] A relay mechanism exists, is chosen with an explicit answer to Open Design Question #1, and is documented in `docs/10-OBSERVABILITY_STRATEGY.md` or a new architecture doc
- [ ] A test proves: two concurrent "publish" attempts for the same business fact result in exactly one message reaching Pub/Sub (or exactly one that a consumer acts on)
- [ ] A test proves: a crash between the outbox write and the relay's publish does not lose the event (retried by the relay on next pass)
- [ ] `shared.inbox` consolidation plan is written (even if execution is a separate follow-up), covering the `notification.processed_events` / `loyalty.processed_events` migration
- [ ] `/story-discovery` run before implementation — this TD is a discovery starting point, not a ready-to-build spec

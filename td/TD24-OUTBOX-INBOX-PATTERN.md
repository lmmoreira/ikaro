# TD24 — Transactional Outbox + Inbox Pattern (shared schema)

## Status
- **Type**: Architecture / Reliability
- **Priority**: High (closes TD08 AUD-001 🔴 Critical — the single highest-leverage item in the audit backlog; also unblocks AUD-003, AUD-004, AUD-018)
- **Contexts affected**: `shared` (new infrastructure), every context that publishes domain events (`booking`, `loyalty`, `staff`, `platform`) and every context that consumes them (`notification`, `loyalty`, `staff`)
- **Discovered**: 2026-07-10 (M17-S03 PR #107 review — a `cron_run_log` idempotency table was built, found to be a false guarantee, and removed)
- **Design resolved**: 2026-07-10 (discovery discussion; full code sweep verified the inventory, the DI wiring, and the test-infrastructure impact — see §Investigation)

---

## Problem

Every domain-event publish in the backend is a **dual write**: business state commits in a Postgres transaction, then `eventBus.publish()` calls Pub/Sub *after* the commit. A crash or Pub/Sub failure between the two loses the event forever — the business state says "it happened," no notification/reaction ever fires, and nothing records that an event should have existed.

```ts
// the shape at every one of the 21 publish sites today:
await this.txManager.run(async () => {
  await this.bookingRepo.save(booking);
});
// ← crash here = event lost forever
for (const event of booking.clearDomainEvents()) {
  await this.eventBus.publish(event); // ← failure here = event lost forever
}
```

The inverse problem exists for cron jobs: a retried/overlapping trigger invocation publishes the **same business fact twice as two distinct messages with two fresh `eventId`s** (`DomainEvent`'s constructor calls `uuidv7()` unconditionally), so consumer-side `eventId` dedup never sees a duplicate — the customer gets two emails.

M17-S03's `cron_run_log` attempt failed because `markRun()` can never be atomic with a Pub/Sub publish — the exact dual-write this TD eliminates. See `plan/M17-CLOUD-DEPLOY.md` S03 discovery note (2026-07-10) for the full post-mortem.

---

## Investigation — verified inventory (2026-07-10 code sweep)

### A. Publish sites — 21 `eventBus.publish()` calls across 18 files

**A1. Aggregate-driven (16 use cases, each with a `clearDomainEvents()` loop after `txManager.run()`):**

| Context | Use case files (`contexts/<ctx>/application/use-cases/`) |
|---|---|
| booking (11) | `approve-booking`, `reject-booking`, `cancel-booking-as-admin`, `cancel-booking-as-customer`, `complete-booking`, `reschedule-booking`, `request-booking`, `request-authenticated-booking`, `submit-booking-info`, `submit-guest-booking-info`, `request-more-info` |
| staff (4) | `invite-staff`, `activate-staff`, `deactivate-staff`, `create-initial-manager` |
| platform (1) | `provision-tenant` |

**A2. Directly-constructed events (5 sites, no aggregate involved):**

| File | Event(s) | Notes |
|---|---|---|
| `booking/application/jobs/booking-reminder.job.ts` | `BookingReminderDue` (L70), `BookingReminderDueToday` (L88) | cron-triggered, at-least-once |
| `booking/application/jobs/admin-schedule-reminder.job.ts` | `AdminDailyScheduleReminder` (L52) | cron-triggered |
| `loyalty/application/jobs/notify-expiring-points.job.ts` | `PointsExpiringSoon` (L51) | cron-triggered |
| `loyalty/application/use-cases/complete-booking-loyalty-effects/complete-booking-loyalty-effects.use-case.ts` | `ServicePointsEarned` (L145) | **consumer re-emit, published AFTER the `markProcessed` tx** — a publish failure loses it *permanently* (the `BookingCompleted` redelivery is skipped by the idempotency check). TD08 §12.3, the worst single site. |

**A3. Aggregates that emit events — only 3** (verified: `addDomainEvent` appears only in these): `booking/domain/booking.aggregate.ts`, `platform/domain/tenant.aggregate.ts`, `staff/domain/staff.aggregate.ts`. Loyalty aggregates emit nothing — every loyalty event is directly constructed (A2). So the repository auto-flush (D6) touches exactly **3 repositories**: `typeorm-booking.repository.ts`, `typeorm-tenant.repository.ts` (the raw TypeORM adapter, NOT `caching-tenant.repository.ts` — cache concerns stay out of it per CLAUDE.md §7), `typeorm-staff.repository.ts`.

**A4. NOT in scope as publish sites** (verified, do not touch): `GcpPubSubEventBusAdapter.publishToDlq()` (consumer-side DLQ routing, internal to the adapter); `publishTrigger()` calls in `cron-booking.controller.ts` / `cron-loyalty.controller.ts` (cron ticks are not domain events — trigger channel bypasses the outbox by design); the BFF (publishes nothing — verified by grep).

### B. Consumers — what exists, what changes, what doesn't

**B1. Event handlers (subscribe via `EVENT_BUS`) — handlers themselves are UNCHANGED by this TD** (they call exactly one use case and rethrow; the idempotency lives in the use cases):

| Context | Handlers |
|---|---|
| notification (14) | `booking-approved`, `booking-cancelled`, `booking-info-requested`, `booking-info-submitted`, `booking-rejected`, `booking-requested`, `booking-rescheduled`, `booking-reminder`, `admin-daily-schedule-reminder`, `points-expiring-soon`, `service-points-earned`, `staff-invited`, `tenant-provisioned`, `dead-letter` |
| loyalty (1) | `booking-completed` |
| staff (1) | `tenant-provisioned` |

`dead-letter.handler.ts` is log-only (never throws, no side effects) — needs no inbox, ignore it in S04.

**B2. Trigger handlers (cron, not domain events — unchanged):** booking: `booking-reminder-trigger`, `admin-schedule-reminder-trigger`; loyalty: `expire-points-trigger`, `notify-expiring-points-trigger`. (`ExpirePointsJob` publishes nothing — DB-only, naturally idempotent.)

**B3. Idempotency today (the "inbox-lite"):**

| Consumer | Mechanism | Assessment |
|---|---|---|
| loyalty ← `BookingCompleted` | `loyalty.processed_events` `(event_id, consumer_name)` PK; `markProcessed` **inside the same tx** as the business write (`complete-booking-loyalty-effects`) | Correct pattern — this is what `shared.inbox` generalizes |
| notification ← 13 event handlers | `notification.processed_events` `(event_id, notification_type, channel)` PK; `BaseNotificationUseCase.isAlreadySent()` before dispatch; `markProcessed` in same tx as the `notification_logs` save | Correct, finer-grained key |
| staff ← `TenantProvisioned` | **none** — `create-initial-manager` has no dedup | Gap — covered in S04 |

`notification.notification_logs` is **not** a dedup table — it is the `NotificationLog` domain aggregate (§3 bounded contexts): audit record with sent/failed status, recipient, `tenant_id`. Kept (D7).

### C. Wiring & infrastructure facts the design depends on (verified)

1. **Ambient transaction context** — `shared/infrastructure/transaction-context.ts` (AsyncLocalStorage): `getActiveEntityManager()` exposes the live transactional `EntityManager` anywhere under `txManager.run()`; `scheduleAfterCommit(cb)` runs `cb` after commit — **or immediately when no transaction is ambient** (verified: falls through to `callback()` directly). The outbox adapter relies on both behaviors.
2. **DI wiring** (`shared/infrastructure/event-bus.module.ts`): `EVENT_BUS → useClass: GcpPubSubEventBusAdapter`; **`TRIGGER_BUS` and `PUSHABLE_EVENT_BUS` are `useExisting: EVENT_BUS` aliases** — they resolve to whatever `EVENT_BUS` resolves to, including test overrides. ⚠️ Consequence: rebinding `EVENT_BUS` to the outbox bus drags both aliases with it — the outbox bus **must implement `IEventBus`, `ITriggerBus`, and `IPushableEventBus`, delegating everything except `publish()`** to the inner Pub/Sub adapter (see §Design). Do not restructure the aliases.
3. **Trigger channel** (M17-S03/D3): `ITriggerBus.registerTrigger()` + Cloud Scheduler → Pub/Sub → `/pubsub/push`, with thin `/cron/*` controllers for local/manual runs — the relay sweep copies this exact pattern.
4. **Test doubles** (`src/test/infrastructure/`): `in-memory-event-bus.ts` (unit) and `routing-in-memory-event-bus.ts` (integration — **synchronously dispatches to subscribed handlers inside `publish()`**, BFS for nested publishes). ⚠️ Consequence: once repos drain events *inside* the transaction, a synchronous dispatch would run handlers mid-transaction (separate connections → they cannot see the uncommitted business write; deadlock risk). The routing bus must defer dispatch via `scheduleAfterCommit()` — see S02.
5. **Schema bootstrap** — `1700000000000-BootstrapSchemas.ts` creates the 6 context schemas + `ikaro_app` grants. `shared` is added via a **new** migration (never edit an applied one), same grant block.
6. Integration tests run against real Postgres; **new entities/migrations must be registered in `integration-global-setup.ts` and `test-datasource.ts` in the same commit** (§7 testing rule — silent failure otherwise).

---

## Decisions (resolved 2026-07-10)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Relay = inline best-effort dispatch after commit + scheduled sweep as the guarantee.** Two *triggers*, one *publication path* — both call the same relay function. | Near-instant happy-path latency for customer-facing events; correctness owned by the sweep. The only always-on-free alternatives (CDC/log-tailing, `LISTEN/NOTIFY`) need an always-on component — ruled out. |
| D2 | **No CDC / Debezium — explicitly rejected.** | Heaviest infra in the stack for a load level the app doesn't have; always-on container breaks D1/D2 scale-to-zero and D12 budget; replication-slot WAL pinning is an outage risk on `db-f1-micro`. |
| D3 | **Sweep every 5 minutes, parameterized** (Terraform `var.outbox_relay_schedule`, default `*/5 * * * *`). Batch size, grace window, and inline-dispatch on/off are env vars. | Fixed-rate cost (~8,640 ticks/month ≈ $0 under free tiers — cost is *bounded by design*, independent of traffic). The interval only caps worst-case delivery delay after a failure; happy-path latency comes from the inline dispatch. |
| D4 | **Scope = all 21 publish sites**, phased across stories. | Two publishing paths with different reliability guarantees is worse than one unreliable path. The DI rebind makes cutover mostly mechanical. |
| D5 | **`dedup_key` column with `UNIQUE` + `INSERT … ON CONFLICT DO NOTHING`.** Aggregate events use their `eventId`; cron jobs supply deterministic business keys. | The atomic, row-granular fix for the cron double-run that `cron_run_log` couldn't be: a mid-loop crash retries only un-inserted rows (no silently-dropped remainder), and two overlapping runs collapse to one row per business fact. |
| D6 | **Aggregate events reach the outbox automatically on repository `save()`** — the 3 event-emitting aggregates' repositories drain `clearDomainEvents()` through the injected `EVENT_BUS` inside `save()`. Use cases lose their publish loops entirely. | Not the use case's job; the ORM repository *is* the DDD repository, so persisting the aggregate and its pending events is one concern. Draining **via the `EVENT_BUS` port** (not by writing outbox rows directly) keeps test overrides working and keeps repos decoupled from outbox internals. Removes the "developer forgot to publish" failure class. |
| D7 | **`shared.inbox` `(event_id, consumer_name)` replaces both `processed_events` tables.** notification's granularity preserved via consumer-name composition (`<TRIGGER_EVENT>:<CHANNEL>`). `notification_logs` **stays** (domain aggregate, audit/BI). staff gains the coverage it lacks. | One physical table instead of per-context copies (the duplication that tripped SonarCloud in M17-S03); pre-production, so migration is a simple copy + drop. |
| D8 | **Retention, both tables, enforced by the sweep tick — no separate cleanup job.** Both default to **14 days**, parameterized (`OUTBOX_RETENTION_DAYS`, `INBOX_RETENTION_DAYS`). Inbox retention must stay above Pub/Sub's 7-day max redelivery window or the dedup guarantee weakens — enforce with a startup config check (`INBOX_RETENTION_DAYS >= 8`). Deletes are batched (`DELETE WHERE id IN (SELECT … LIMIT :batchSize)`). | Debug/replay window without unbounded growth. Because the GC runs every tick, it's a continuous trickle (a few rows per tick), never a mass delete — autovacuum absorbs it. |
| D10 | **No table partitioning.** | Postgres requires UNIQUE/PK constraints on partitioned tables to include the partition key — partitioning by time would outlaw `UNIQUE(dedup_key)` and `PK(event_id, consumer_name)`, breaking the constraint-backed idempotency (`ON CONFLICT` stops working; dedup degrades to racy SELECT-then-INSERT). At current volumes the trickle-delete costs nothing; if volume ever makes retention genuinely expensive, revisit partitioning *together with* a side-table global-uniqueness design as its own TD. |
| D9 | **Ordering: out of scope.** Relay uses `SKIP LOCKED` (out-of-order-safe); no Pub/Sub ordering keys. | Matches current behavior (no ordering today). Ordering keys per booking remain TD08 AUD-018, a separate follow-up. |

---

## Design

### `shared.outbox`

```sql
-- new migration adds the schema (same grant block as BootstrapSchemas):
CREATE SCHEMA IF NOT EXISTS "shared";

CREATE TABLE "shared"."outbox" (
  "id"           UUID         NOT NULL,            -- = eventId from the envelope
  "dedup_key"    VARCHAR(255) NOT NULL,            -- eventId for aggregate events; deterministic business key for cron events
  "tenant_id"    UUID         NOT NULL,            -- for observability/filtering (transport table — see tenant-isolation note, S04)
  "event_name"   VARCHAR(100) NOT NULL,            -- relay derives topic: ikaro-<event_name>
  "payload"      JSONB        NOT NULL,            -- the full DomainEvent envelope, verbatim
  "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "published_at" TIMESTAMPTZ  NULL,                -- NULL = not yet relayed
  CONSTRAINT "PK_shared_outbox" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_shared_outbox_dedup_key" UNIQUE ("dedup_key")
);

-- partial index: the sweep's working set is only unpublished rows
CREATE INDEX "IDX_shared_outbox_unpublished"
  ON "shared"."outbox" ("created_at") WHERE "published_at" IS NULL;

-- partial index: the GC's working set is only published rows (D8)
CREATE INDEX "IDX_shared_outbox_published_gc"
  ON "shared"."outbox" ("published_at") WHERE "published_at" IS NOT NULL;
```

Insert is always `INSERT … ON CONFLICT ("dedup_key") DO NOTHING RETURNING "id"` — a second attempt to record the same business fact is a silent no-op *inside the same atomic transaction as the caller's business write*. Only ids actually returned (i.e., actually inserted) are scheduled for inline dispatch — a conflicting insert schedules nothing (the first writer owns delivery).

### `OutboxEventBus` (the automatic seam)

New `shared/infrastructure/outbox-event-bus.ts`, bound as `EVENT_BUS`. Because `TRIGGER_BUS`/`PUSHABLE_EVENT_BUS` alias `EVENT_BUS` (§C2), it implements **all three ports**:

- `publish(event)` → **intercepted**: writes the outbox row using `getActiveEntityManager()` if a transaction is ambient (**joins the caller's transaction** — this is the atomicity), or its own short transaction if not. Dedup key = `event.dedupKey ?? event.eventId`. On successful insert, registers the row id via `scheduleAfterCommit()` for inline dispatch (which, per §C1, runs immediately when no tx is ambient — so non-transactional publishes still get instant delivery).
- `subscribe()`, `registerTrigger()`, `publishTrigger()`, `dispatchPushMessage()` → **pure delegation** to the inner `GcpPubSubEventBusAdapter` (registered as its own class provider; stays the singleton that owns Pub/Sub connections, push dispatch, and DLQ routing — its consumer role is untouched).
- Inline dispatch is fire-and-forget: it **never throws into the caller and never delays the HTTP response**. The use case succeeded the moment the transaction committed.

`DomainEvent` gains an optional readonly `dedupKey?: string` (default `undefined` → adapter falls back to `eventId`). Only the cron-job events set it. It serializes into `payload` like any other field; consumers ignore it.

### Repository auto-flush (D6)

The 3 event-emitting aggregates' TypeORM repositories inject `EVENT_BUS` and, as the last step of `save()` (inside the ambient transaction):

```ts
for (const event of aggregate.clearDomainEvents()) {
  await this.eventBus.publish(event); // = outbox row in the SAME transaction
}
```

(Extract as a tiny shared helper, e.g. `shared/infrastructure/drain-domain-events.ts`, to avoid three copies — SonarCloud duplication gate.)

- Exactly 3 repos now (§A3); the pattern becomes part of the "new aggregate" recipe in `docs/ENGINEERING_RULES.md`.
- For `Tenant`: the drain goes in `typeorm-tenant.repository.ts` (persistence adapter), **not** `caching-tenant.repository.ts` — the cache decorator keeps delegating `save()` and owning only cache invalidation.
- Events constructed outside aggregates (§A2) keep calling `eventBus.publish()` explicitly — which is now an outbox write.
- **Invariant change (doc sweep):** CLAUDE.md §7 currently says "flush `clearDomainEvents()` **after** `txManager.run()`". New invariant: *aggregate events are drained to the outbox by the repository inside the save transaction; use cases never flush aggregate events; direct `eventBus.publish()` is only for non-aggregate events (jobs, re-emits) and must run inside `txManager.run()` when it must be atomic with a business write.*

### Relay — one publication path, two triggers

`shared/infrastructure/outbox-relay.service.ts` — a single `relay(rowIds?)` used by both:

1. **Inline dispatch** (happy path): after commit, called with the exact row ids that transaction inserted. Publishes each via the inner `GcpPubSubEventBusAdapter.publish()` (payload is the verbatim envelope; topic = `ikaro-<event_name>`), then `UPDATE … SET published_at = now() WHERE id = :id AND published_at IS NULL`. Errors are swallowed + logged — the sweep is the retry.
2. **Scheduled sweep** (the guarantee): Cloud Scheduler → Pub/Sub trigger `cron-outbox-relay` (registered on `ITriggerBUS` like the M17-S03 cron triggers; thin `/cron/outbox-relay` controller mirrors `cron-booking.controller.ts` for local/manual runs):

```sql
SELECT * FROM shared.outbox
WHERE published_at IS NULL
  AND created_at < now() - make_interval(secs => :graceSeconds)  -- don't race the inline path
ORDER BY created_at
LIMIT :batchSize
FOR UPDATE SKIP LOCKED
```

   publish → mark published, loop until an empty batch. `SKIP LOCKED` makes overlapping sweeps and sweep-vs-inline races safe.

   The same tick runs the retention GC (D8/D10 — batched trickle-deletes, no partitioning):

```sql
DELETE FROM shared.outbox
WHERE id IN (
  SELECT id FROM shared.outbox
  WHERE published_at < now() - make_interval(days => :outboxRetentionDays)  -- default 14
  LIMIT :batchSize
);
-- and, once S04 lands:
DELETE FROM shared.inbox
WHERE (event_id, consumer_name) IN (
  SELECT event_id, consumer_name FROM shared.inbox
  WHERE processed_at < now() - make_interval(days => :inboxRetentionDays)   -- default 14, min 8 (D8)
  LIMIT :batchSize
);
```

**Config:** `OUTBOX_INLINE_DISPATCH_ENABLED` (default `true`), `OUTBOX_SWEEP_BATCH_SIZE` (default `100`), `OUTBOX_SWEEP_GRACE_SECONDS` (default `30`), `OUTBOX_RETENTION_DAYS` (default `14`), `INBOX_RETENTION_DAYS` (default `14`, startup check enforces ≥ 8 per D8), Terraform `var.outbox_relay_schedule` (default `*/5 * * * *`).

**Marking rule:** `published_at` is set **only after** a successful Pub/Sub publish. Never before.

### Failure matrix (why this closes the dual write)

| Failure | Outcome |
|---|---|
| Crash/error before commit | Business write and outbox row roll back together — consistent nothing-happened |
| Crash after commit, before inline dispatch | Row is durable with `published_at IS NULL` → next sweep publishes it. **Late, never lost** |
| Inline publish to Pub/Sub fails | Swallowed + logged; row stays unpublished → sweep retries |
| Publish succeeded but response timed out / crash before the `UPDATE` | Row stays unpublished → sweep republishes **the same `eventId`** → consumer inbox drops the duplicate |
| Sweep crashes mid-batch | Unmarked rows retried next tick; marked rows were published. Same-`eventId` duplicates possible, inbox absorbs |
| Cron job invoked twice (overlap/retry) | Second run's inserts hit `ON CONFLICT (dedup_key) DO NOTHING` → one row per business fact → **one email** |
| Cron job crashes mid-loop | Rows inserted so far are durable and will publish; the re-run re-inserts them as no-ops and continues with the rest. No silently-dropped remainder (the flaw that killed `cron_run_log`'s coarse gate) |

End-to-end: **at-least-once delivery, exactly-once effect** (dedup at both edges: `dedup_key` producer-side, `(event_id, consumer_name)` consumer-side).

### Deterministic dedup keys for cron-published events

The three publishing jobs set `dedupKey` to a business identity (exact formats + the timezone-of-day rule finalized in S03 discovery — a job straddling midnight must not mint two keys for one logical run):

| Event | dedup_key shape |
|---|---|
| `PointsExpiringSoon` | `PointsExpiringSoon:<tenantId>:<customerId>:<yyyy-mm-dd>` |
| `BookingReminderDue` / `BookingReminderDueToday` | `<EventName>:<tenantId>:<bookingId>:<yyyy-mm-dd>` |
| `AdminDailyScheduleReminder` | `AdminDailyScheduleReminder:<tenantId>:<yyyy-mm-dd>` |

### `shared.inbox`

```sql
CREATE TABLE "shared"."inbox" (
  "event_id"      UUID         NOT NULL,
  "consumer_name" VARCHAR(150) NOT NULL,
  "processed_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "PK_shared_inbox" PRIMARY KEY ("event_id", "consumer_name")
);

-- for the retention GC (D8)
CREATE INDEX "IDX_shared_inbox_processed_at" ON "shared"."inbox" ("processed_at");
```

- Shared port (`shared/ports/inbox.port.ts`): `hasBeenProcessed(eventId, consumerName)` / `markProcessed(eventId, consumerName)` — `markProcessed` must run **inside the consumer's business transaction** (the pattern loyalty already implements).
- Consumer names: loyalty `'COMPLETE_BOOKING_LOYALTY_EFFECTS'` (unchanged value, new table); notification `'<TRIGGER_EVENT>:<CHANNEL>'` (preserves today's `(event_id, notification_type, channel)` granularity in one string); staff `'CREATE_INITIAL_MANAGER'` (new coverage).
- Pre-production migration: `INSERT INTO shared.inbox SELECT …` from both old tables (composing notification's key), then `DROP` both. No dual-write/backfill choreography.

### Cost model (D3)

Fixed-rate by construction — independent of tenant/traffic volume: ~8,640 sweep ticks/month ≈ ~1,700 vCPU-s (free tier 180,000), 8,640 requests (free tier 2M), a few MB Pub/Sub (free tier 10 GiB), one Cloud Scheduler job ($0–0.10/mo). The wake-on-push pattern is the one M17 already accepted for the existing cron triggers and uptime checks.

---

## Stories (chronological — run `/story-discovery TD24-SNN` before each, per §0)

> **Sequencing rationale:** each story leaves `main` shippable. S01 ships dark (nothing writes to the outbox). S02 is the atomic cutover — after it, **every** `publish()` call (use cases AND jobs) already flows through the outbox, because the rebind intercepts all of them; jobs just run with the `eventId` fallback dedup key until S03 refines them. Consumers keep their existing dedup until S04 — it keeps working against relay-published events because `eventId`s are preserved verbatim end-to-end. S03 and S04 are independent of each other; keep this order because S03 closes the two motivating bugs (cron double-send, §12.3 lost re-emit) and S04 is consolidation.

---

### TD24-S01 — Outbox foundation (ships dark)

Nothing is rebound; no behavior changes. Everything is built and tested in isolation.

**Create:**
- Migration `AddSharedSchema` — `CREATE SCHEMA shared` + the `ikaro_app` grant block copied from `BootstrapSchemas` (new migration; never edit the applied one). ⚠️ Migration timestamps are global across contexts — pick the next free timestamp.
- Migration `CreateSharedOutbox` — table + partial index per §Design.
- `shared/infrastructure/entities/outbox-event.entity.ts` (TypeORM entity, `schema: 'shared'`).
- `shared/infrastructure/outbox-event-bus.ts` — implements `IEventBus` + `ITriggerBus` + `IPushableEventBus`; `publish()` = ambient-EM insert with `ON CONFLICT DO NOTHING RETURNING id` + `scheduleAfterCommit` hook; everything else delegates to an injected `GcpPubSubEventBusAdapter`.
- `shared/infrastructure/outbox-relay.service.ts` — `relay(rowIds?)`, sweep query (grace window, batch loop, `SKIP LOCKED`), retention GC (`OUTBOX_RETENTION_DAYS`, default 14), marking rule.
- Trigger wiring: `cron-outbox-relay` constant + trigger handler (mirror `booking/infrastructure/events/booking-reminder-trigger.handler.ts`) + thin `/cron/outbox-relay` controller (mirror `cron-booking.controller.ts`).
- `DomainEvent.dedupKey?: string` optional readonly field (default undefined; no subclass changes yet).
- Config wiring: `OUTBOX_INLINE_DISPATCH_ENABLED`, `OUTBOX_SWEEP_BATCH_SIZE`, `OUTBOX_SWEEP_GRACE_SECONDS`, `OUTBOX_RETENTION_DAYS` (default 14). (`INBOX_RETENTION_DAYS` + its ≥ 8 startup check arrive with the inbox in S04.)
- Test support: outbox entity builder (`src/test/builders/shared/`), in-memory outbox repo double if needed (`src/test/infrastructure/`).

**Modify:**
- `integration-global-setup.ts` + `test-datasource.ts` — register new entity + migrations (**same commit** as the migrations).
- `shared/infrastructure/event-bus.module.ts` — register `GcpPubSubEventBusAdapter` as an explicit class provider (so S02's rebind is a one-line change); `EVENT_BUS` still resolves to it.

**Tests (unit + integration):**
- publish inside `txManager.run()` → row rolls back with the business write; publish outside any tx → row committed standalone.
- `dedup_key` conflict → no row, no inline dispatch scheduled.
- relay marks `published_at` **only** on successful Pub/Sub publish; failed publish leaves row unpublished.
- sweep: respects grace window; `SKIP LOCKED` (two concurrent sweeps → each row published once); loops until empty; GC deletes only published rows older than `OUTBOX_RETENTION_DAYS`.

**Infra note:** the Cloud Scheduler job + topic (`var.outbox_relay_schedule`, default `*/5 * * * *`) lands in the M17 Terraform tree — add to the M17 scheduler module/story, not a parallel mechanism.

**Acceptance:** all new code merged, zero call-site behavior change; `EVENT_BUS` still the raw Pub/Sub adapter.

---

### TD24-S02 — Cutover: rebind + repository auto-flush (all aggregate events)

The atomic story: rebind, drain, delete the 16 loops, fix the test bus — these ship together because each half breaks without the other.

**Modify — DI (1 file):**
- `event-bus.module.ts`: `EVENT_BUS → useClass: OutboxEventBus`. The `TRIGGER_BUS`/`PUSHABLE_EVENT_BUS` aliases stay untouched (they now resolve to `OutboxEventBus`, which delegates those ports — verified design, §C2).

**Modify — repositories (3 files + 1 new helper):**
- `shared/infrastructure/drain-domain-events.ts` helper; call it at the end of `save()` in `booking/infrastructure/repositories/typeorm-booking.repository.ts`, `platform/infrastructure/repositories/typeorm-tenant.repository.ts`, `staff/infrastructure/repositories/typeorm-staff.repository.ts`. (NOT `caching-tenant.repository.ts`.)

**Modify — use cases (16 files, §A1 list):** delete the `clearDomainEvents()` publish loop (and the now-unused `EVENT_BUS` injection where nothing else uses it) from all 11 booking + 4 staff + 1 platform use cases. Each use case's event emission is now implicit in `repo.save()` inside its existing `txManager.run()`.

**Modify — test infrastructure:**
- `routing-in-memory-event-bus.ts`: defer handler dispatch via `scheduleAfterCommit()` when a transaction is ambient (per §C1 it dispatches immediately otherwise). Without this, repos draining inside the tx would trigger synchronous handler runs mid-transaction — handlers on separate connections can't see the uncommitted write, and nested `txManager.run()` calls risk deadlock. Keep the BFS nested-publish semantics.
- `in-memory-event-bus.ts`: same deferral if any integration app uses it transactionally; unit specs that asserted "published after use case" now assert via the routing/in-memory bus exactly as before (eventIds and envelopes are unchanged).
- Integration app helpers keep overriding `EVENT_BUS` with the routing bus (`useClass`, never `useExisting`) — flow tests bypass the outbox by design; outbox behavior is covered by S01's dedicated tests plus this story's crash tests below.

**Tests (these are TD08 AUD-003's executable spec — write first where practical):**
- Crash-between-commit-and-publish: with inline dispatch disabled, commit a booking approval → assert outbox row unpublished + no Pub/Sub message → run relay → exactly one message delivered.
- Inline publish failure (Pub/Sub double that throws) → use case still succeeds; row unpublished; sweep retries and delivers.
- Two concurrent relay attempts on the same row → exactly one Pub/Sub publish.
- Regression: every flow integration suite (booking/staff/platform → notification/loyalty) passes with only the routing-bus deferral change.

**Docs (same PR, per §7 DoD):** CLAUDE.md/§7 invariant + `docs/ENGINEERING_RULES.md` + `docs/03-DOMAIN_EVENTS.md` delivery-guarantees section + `docs/08-TESTING_STRATEGY.md` (routing-bus semantics changed).

**Acceptance:** grep proves no use case contains a `clearDomainEvents()` loop; `GcpPubSubEventBusAdapter.publish` is referenced only by `OutboxRelayService`; full CI green.

> **State after S02:** all 21 sites flow through the outbox (jobs included, via the rebind, with `eventId`-fallback dedup keys). Dual-write is closed everywhere. Still open: cron double-run (needs S03's deterministic keys) and the §12.3 re-emit ordering (needs S03).

---

### TD24-S03 — Cron dedup keys + the loyalty re-emit (the two motivating bugs)

**Modify — events (4 classes):** `BookingReminderDue`, `BookingReminderDueToday`, `AdminDailyScheduleReminder`, `PointsExpiringSoon` — accept/derive a deterministic `dedupKey` per §Design table. Finalize the timezone-of-day rule during story discovery (candidate: the tenant's timezone for tenant-scoped reminders, `America/Sao_Paulo` default per §1).

**Modify — jobs (3 files, §A2):** construct events with dedup keys; wrap each job's per-tenant publish batch in `txManager.run()` so a run's outbox rows commit atomically (one tx per tenant-batch, not one giant tx — a mid-run crash then retries only the un-committed tenants' facts as no-op conflicts + remainder).

**Modify — loyalty re-emit (1 file):** `complete-booking-loyalty-effects.use-case.ts` — move the `ServicePointsEarned` publish **inside** the existing `txManager.run()` that contains `markProcessed` (closes TD08 §12.3: the re-emit and the idempotency mark become one atomic fact).

**Tests:**
- Two overlapping runs of each job for the same business day → exactly one outbox row per business fact → one consumer effect (the M17-S03 acceptance test that `cron_run_log` failed).
- Mid-loop crash → re-run completes the remainder; no duplicates, no dropped facts.
- `BookingCompleted` redelivery after a simulated `ServicePointsEarned` outbox-write failure → effects roll back together and the redelivery completes both.

**Docs:** dedup-key recipe in `docs/ENGINEERING_RULES.md` ("adding a cron-published event"); update `plan/M17-CLOUD-DEPLOY.md` S03 note (the tracked fix now exists).

---

### TD24-S04 — Inbox consolidation (consumer side)

**Create:**
- Migration `CreateSharedInbox` — table per §Design; copy rows: `loyalty.processed_events` as-is; `notification.processed_events` with `consumer_name = notification_type || ':' || channel`; then `DROP` both old tables. Register in `integration-global-setup.ts`/`test-datasource.ts` same commit; **remove** the two dropped entities from both in the same commit.
- `shared/ports/inbox.port.ts` + `shared/infrastructure/entities/inbox-record.entity.ts` + `shared/infrastructure/typeorm-inbox.repository.ts` + in-memory double + builder.

**Modify:**
- loyalty: `complete-booking-loyalty-effects.use-case.ts` + `loyalty.module.ts` switch to the shared port (consumer name value unchanged).
- notification: `base-notification.use-case.ts` + `base-booking-reminder-notification.use-case.ts` swap `processedEventRepo` for the shared inbox port with composed consumer names; the 13 `send-*` use cases + `notification.module.ts` follow (mostly constructor wiring).
- staff: add the inbox check + `markProcessed` (inside the existing tx) to `create-initial-manager.use-case.ts` + `staff.module.ts` wiring — closes the uncovered `TenantProvisioned` path.

**Delete:** `loyalty/application/ports/processed-event-repository.port.ts`, `loyalty/infrastructure/entities/processed-event.entity.ts`, `loyalty/infrastructure/repositories/typeorm-processed-event.repository.ts`, `notification/application/ports/processed-event-repository.port.ts`, `notification/infrastructure/entities/processed-event.entity.ts`, `notification/infrastructure/repositories/typeorm-processed-event.repository.ts`, both in-memory doubles (`src/test/infrastructure/in-memory-processed-event.repository.ts`, `src/test/repositories/notification/in-memory-processed-event.repository.ts`), both builders (`src/test/builders/loyalty/processed-event-entity.builder.ts` + its `index.ts` export, `src/test/builders/notification/notification-processed-event-entity.builder.ts`); update `loyalty-integration-app.ts` / `notification-integration-app.ts` overrides.

**Modify — relay GC:** extend the sweep tick's GC with the inbox batched delete (D8; SQL in §Design) + `INBOX_RETENTION_DAYS` config with its ≥ 8 startup check. Also update the relay's GC tests.

**Tests:** duplicate `eventId` redelivery → single effect per consumer (loyalty, notification per template×channel, staff); migration copies existing dedup rows correctly (integration); inbox GC deletes only rows older than `INBOX_RETENTION_DAYS`; startup fails on `INBOX_RETENTION_DAYS < 8`.

**Docs:** `docs/13-DATABASE_SCHEMA.md` (both new tables, both drops); `docs/06-TENANT_ISOLATION_STRATEGY.md` — documented exemption: outbox/inbox are transport infrastructure keyed by `eventId`, not tenant-first business tables (outbox still carries `tenant_id` for observability).

---

### TD24-S05 — Observability, docs closure, backlog cross-off

- Metrics/logs: unpublished-row count + oldest-unpublished age (the queue-lag signal), relay publish failures, GC deletions; OTel span attrs carry `tenant.id`/`correlation.id` from the envelope (§2 invariant 8). Wire an alert on oldest-unpublished age > 3 sweep intervals into the M17 alerting story if available.
- Doc sweep completion check (stale-doc rule, §7 DoD): confirm every item in §Doc updates landed in its owning story; sweep `docs/*.md` + `plan/*_IMPLEMENTATION_DETAILS_IA.md` for any remaining description of the old publish-after-commit flow.
- `td/TD08-AUDIT-REMEDIATION-BACKLOG.md`: AUD-001 done; AUD-003 covered by S02/S03 tests (link them); AUD-004 re-scoped (largely absorbed by D5/D7); AUD-018 (ordering keys) remains open, now unblocked.
- `docs/11-ARCHITECTURE.md` + `docs/05-BOUNDED_CONTEXTS.md`: outbox/inbox as shared transport infrastructure (explicitly *not* a bounded context; same category as Pub/Sub).

---

## Table changes summary

| Table | Fate |
|---|---|
| `shared.outbox` | **new** (S01) |
| `shared.inbox` | **new** (S04) |
| `loyalty.processed_events` | **dropped** (S04) — replaced by `shared.inbox` |
| `notification.processed_events` | **dropped** (S04) — replaced by `shared.inbox`, granularity preserved in `consumer_name` |
| `notification.notification_logs` | **kept** — `NotificationLog` domain aggregate (audit/BI), not transport dedup |

## Doc updates required (owned by the story making each change — not deferred to S05)

| Doc | Change | Story |
|---|---|---|
| CLAUDE.md / `.copilot/context.md` §7 | Aggregate-events invariant: repo auto-flush inside tx replaces "flush after `txManager.run()`" | S02 |
| `docs/ENGINEERING_RULES.md` | Same invariant + "publish a new event" recipe (aggregate vs direct paths) + cron dedup-key recipe | S02/S03 |
| `docs/03-DOMAIN_EVENTS.md` | Delivery guarantees: at-least-once delivery, exactly-once effect; outbox/relay/inbox roles | S02 |
| `docs/08-TESTING_STRATEGY.md` | Routing-bus deferral semantics; outbox/inbox doubles; crash/concurrency test patterns | S02 |
| `docs/13-DATABASE_SCHEMA.md` | `shared` schema, new tables, dropped tables | S01/S04 |
| `docs/06-TENANT_ISOLATION_STRATEGY.md` | Transport-table exemption rationale | S04 |
| `docs/11-ARCHITECTURE.md` + `docs/05-BOUNDED_CONTEXTS.md` | Outbox/inbox as shared transport infra | S05 |
| `plan/M17-CLOUD-DEPLOY.md` | Relay scheduler job (S01); S03-note cross-reference update | S01/S03 |
| `td/TD08-AUDIT-REMEDIATION-BACKLOG.md` | AUD-001/003/004/018 statuses | S05 |

## Non-Goals

- **No CDC/Debezium, no broker replacement** — this TD makes `IEventBus.publish()`'s implied contract (each business fact reaches consumers exactly-once *in effect*) actually hold on Pub/Sub; it does not abstract over brokers.
- **No Pub/Sub ordering keys** — TD08 AUD-018, separate follow-up (relay is `SKIP LOCKED`, out-of-order-safe like today).
- **No changes to the trigger channel** — cron ticks are not domain events; `publishTrigger`/`registerTrigger` and the `/cron/*` thin controllers keep bypassing the outbox by design.
- **No retrofit of `cron_run_log`-style coarse gates** — superseded entirely by `dedup_key`.
- **No transactional email** — the notification consumer's dispatch→log sequence still can't span SMTP; sent-then-crash-before-log remains a rare, accepted duplicate-email window. Unchanged semantics.
- **No consumer/handler restructuring** — all 16 event handlers and 4 trigger handlers keep their exact shape (handle → one use case → rethrow).

## Acceptance Criteria (TD-level)

- [ ] No application code calls Pub/Sub publish directly for domain events — `GcpPubSubEventBusAdapter.publish` is referenced only by `OutboxRelayService`; `EVENT_BUS` resolves to `OutboxEventBus`.
- [ ] The 3 event-emitting aggregates' repositories drain domain events inside the save transaction; no use case contains a `clearDomainEvents()` publish loop (grep-verifiable).
- [ ] A test proves: crash between commit and publish loses nothing (sweep delivers exactly one message).
- [ ] A test proves: two concurrent publishes of the same business fact (same `dedup_key`) reach consumers as exactly one effect.
- [ ] A test proves: `ServicePointsEarned` survives a failed publish + `BookingCompleted` redelivery.
- [ ] `shared.inbox` is the only consumer dedup mechanism; both `processed_events` tables and all their ports/entities/repos/doubles/builders are gone; staff `TenantProvisioned` covered.
- [ ] Relay schedule is a Terraform variable; batch/grace/inline-toggle/retentions are env vars (both retentions default 14 days; inbox startup check enforces ≥ 8); sweep GC enforces retention on both tables via batched trickle-deletes — no partitioning (D10).
- [ ] Outbox lag observable (unpublished count + oldest-unpublished age) with an alert path.
- [ ] All doc-sweep items landed in their owning stories (§Doc updates table).

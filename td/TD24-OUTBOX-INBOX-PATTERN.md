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

The inverse problem exists for cron jobs: a retried/overlapping trigger invocation publishes the **same business fact twice as two distinct messages with two fresh `eventId`s** (`Envelope`'s constructor — the shared base every published message rides on, see §Design — calls `uuidv7()` unconditionally), so consumer-side `eventId` dedup never sees a duplicate — the customer gets two emails.

M17-S03's `cron_run_log` attempt failed because `markRun()` can never be atomic with a Pub/Sub publish — the exact dual-write this TD eliminates. See `plan/M17-CLOUD-DEPLOY.md` S03 discovery note (2026-07-10) for the full post-mortem.

---

## Investigation — verified inventory (2026-07-10 code sweep)

### A. Publish sites — 21 `eventBus.publish()` calls across 20 files (`booking-reminder.job.ts` has 2)

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

1. **Ambient transaction context** — `shared/infrastructure/transaction-context.ts` (AsyncLocalStorage): `getActiveEntityManager()` exposes the live transactional `EntityManager` anywhere under `txManager.run()`; `scheduleAfterCommit(cb)` runs `cb` after commit — **or immediately when no transaction is ambient** (verified: falls through to `callback()` directly). The outbox adapter relies on both behaviors. Two more verified behaviors the design MUST respect:
   - **After-commit callbacks are awaited *inside* `txManager.run()`** (`typeorm-transaction-manager.ts` flushes them before `run()` returns) — so after-commit work runs *before* the HTTP response is sent, not in the background.
   - **`flushAfterCommitCallbacks` has no try/catch** — a callback that throws propagates out of `txManager.run()` *after the commit already happened* AND aborts the remaining callbacks (they were already `splice(0)`'d off, so they are lost, not retried). Consequence: any callback the outbox schedules must swallow its own errors internally — see §Design's inline-dispatch rule.
2. **DI wiring** (`shared/infrastructure/event-bus.module.ts`): `EVENT_BUS → useClass: GcpPubSubEventBusAdapter`; **`TRIGGER_BUS` and `PUSHABLE_EVENT_BUS` are `useExisting: EVENT_BUS` aliases** — they resolve to whatever `EVENT_BUS` resolves to, including test overrides. ⚠️ **Superseded by D12** (revised post-S01-merge, 2026-07-11): the original plan had the outbox bus implement all three ports so `TRIGGER_BUS`/`PUSHABLE_EVENT_BUS` could keep riding on `EVENT_BUS` unchanged. D12 rejects that — see D12 for the ISP violation it caused and the corrected anchor-provider wiring.


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
| D4 | **Scope = all 21 publish sites**, phased across stories. | Two publishing paths with different reliability guarantees is worse than one unreliable path. ~~The DI rebind makes cutover mostly mechanical.~~ **Superseded by D14** (2026-07-11): "scope = all 21 sites" still holds, but the mechanism changed — callers depend on `OUTBOX_PUBLISHER` explicitly rather than an invisible `EVENT_BUS` rebind. |
| D5 | **`dedup_key` column with `UNIQUE` + `INSERT … ON CONFLICT DO NOTHING`.** Aggregate events use their `eventId`; cron jobs supply deterministic business keys. | The atomic, row-granular fix for the cron double-run that `cron_run_log` couldn't be: a mid-loop crash retries only un-inserted rows (no silently-dropped remainder), and two overlapping runs collapse to one row per business fact. |
| D6 | **Aggregate events reach the outbox automatically on repository `save()`** — the 3 event-emitting aggregates' repositories drain `clearDomainEvents()` through the injected `EVENT_BUS` inside `save()`. Use cases lose their publish loops entirely. | Not the use case's job; the ORM repository *is* the DDD repository, so persisting the aggregate and its pending events is one concern. Draining **via the `EVENT_BUS` port** (not by writing outbox rows directly) keeps test overrides working and keeps repos decoupled from outbox internals. Removes the "developer forgot to publish" failure class. |
| D7 | **`shared.inbox` `(event_id, consumer_name)` replaces both `processed_events` tables.** notification's granularity preserved via consumer-name composition (`<TRIGGER_EVENT>:<CHANNEL>`). `notification_logs` **stays** (domain aggregate, audit/BI). staff gains the coverage it lacks. | One physical table instead of per-context copies (the duplication that tripped SonarCloud in M17-S03); pre-production, so migration is a simple copy + drop. |
| D15 | **Refines D7: `IInboxRepository` gets a second access pattern — `tryClaim`/`unclaim` (atomic `INSERT ... ON CONFLICT DO NOTHING`/`DELETE`) — used only by notification; loyalty and staff keep `hasBeenProcessed`/`markProcessed`** (post-S04-merge follow-up, same PR, 2026-07-14). | `hasBeenProcessed`-then-later-`markProcessed` is safe for loyalty/staff because their actual writes are guarded by their own DB unique constraints (`UNIQUE(tenant_id, booking_line_id)`, `UNIQUE(tenant_id, email)`) — a race just costs a failed insert and a clean retry. Notification has no such guard: its side effect (the actual email/SMS send) happens *before* any DB write, so two concurrent redeliveries could both pass the check before either marks — a real, if narrow, production risk given Pub/Sub push-mode redelivery can land on a different backend replica. `tryClaim`'s `INSERT ... ON CONFLICT` makes the inbox row itself the atomic gate (only one concurrent caller ever gets `true`); `unclaim` reverses a claim whose send then failed, closing the "stuck forever" gap a naive claim-only design would introduce (see `docs/ANTI_PATTERNS.md`'s check-then-mark entry for that failure mode). Proved against a real Postgres instance, not the in-memory double — a synchronous `Set` check-then-add can't demonstrate genuine concurrency. |
| D16 | **Refines D7 further: migration history squashed instead of copy + drop.** `CreateNotificationProcessedEvents` deleted outright; `CreateLoyaltyLoyaltyEntries`'s `CREATE TABLE "loyalty"."processed_events"` block removed. `CreateSharedInbox` no longer copies rows or drops old tables — it's a bare `CREATE TABLE "shared"."inbox"` (post-S04-merge follow-up, same PR, 2026-07-14). | Pre-production — no environment has ever run the two migrations being edited, so "never edit an applied migration" doesn't apply; there's no real data to preserve via copy-then-drop. Rewriting history is simpler and leaves no dead migration/table churn in the schema's permanent record. The row-copy correctness integration test this superseded (`create-shared-inbox.migration.integration.spec.ts`) was deleted along with it — its premise (copying existing rows) no longer exists. |
| D8 | **Retention, both tables, enforced by the sweep tick — no separate cleanup job.** Both default to **14 days**, parameterized (`OUTBOX_RETENTION_DAYS`, `INBOX_RETENTION_DAYS`). Inbox retention must stay above Pub/Sub's 7-day max redelivery window or the dedup guarantee weakens — enforce with a startup config check (`INBOX_RETENTION_DAYS >= 8`). Deletes are batched (`DELETE WHERE id IN (SELECT … LIMIT :batchSize)`). | Debug/replay window without unbounded growth. Because the GC runs every tick, it's a continuous trickle (a few rows per tick), never a mass delete — autovacuum absorbs it. |
| D10 | **No table partitioning.** | Postgres requires UNIQUE/PK constraints on partitioned tables to include the partition key — partitioning by time would outlaw `UNIQUE(dedup_key)` and `PK(event_id, consumer_name)`, breaking the constraint-backed idempotency (`ON CONFLICT` stops working; dedup degrades to racy SELECT-then-INSERT). At current volumes the trickle-delete costs nothing; if volume ever makes retention genuinely expensive, revisit partitioning *together with* a side-table global-uniqueness design as its own TD. |
| D9 | **Ordering: out of scope.** Relay uses `SKIP LOCKED` (out-of-order-safe); no Pub/Sub ordering keys. | Matches current behavior (no ordering today). Ordering keys per booking remain TD08 AUD-018, a separate follow-up. |
| D11 | **`Command` is a sibling of `DomainEvent` under a shared `Envelope` base — not an optional `dedupKey?` field on `DomainEvent` itself** (revises the original S01 draft, decided mid-implementation 2026-07-11). `Envelope` carries the wire fields every published message needs (`eventId`, `tenantId`, `occurredAt`, `correlationId`, `eventName`); `DomainEvent extends Envelope` unchanged (a fact, no dedup concept); `Command extends Envelope` with a **required** `dedupKey: string`. | A domain event is a fact that happened at most once per business action — it never needed a dedup concept, so bolting an optional field onto it for the 4 cron classes' benefit left the other 17 classes carrying a field that's always `undefined` and easy to misread as "do I need to set this?". Modeling `Command` as a proper sibling (not `DomainEvent extends ... dedupKey?`) makes `instanceof Command` a compiler-enforced signal instead of a convention, at zero transport-layer cost — `Command extends Envelope`, so `IEventBus`/`OutboxPublisher`/`GcpPubSubEventBusAdapter` only ever needed widening from `DomainEvent` to `Envelope`, never a new parallel bus. The 4 classes (`BookingReminderDue`, `BookingReminderDueToday`, `AdminDailyScheduleReminder`, `PointsExpiringSoon`) and their 3 publishing jobs were migrated to `Command` with real computed `dedupKey`s in the same PR as S01's foundation (pulled forward from S03 — see S01/S03 story notes below); the transactional per-tenant-batch wrapping and the loyalty re-emit atomicity fix remain S03's job. |
| D12 | **The outbox class implements a publish-only `IOutboxPublisher` port, not `IEventBus`/`ITriggerBus`/`IPushableEventBus`** — renamed `OutboxEventBus` → `OutboxPublisher` (revises D-line 2 of §C, decided post-S01-merge, 2026-07-11). `shared/ports/outbox-publisher.port.ts` — `IOutboxPublisher { publish(event: Envelope): Promise<void> }`, one method. `OutboxPublisher` drops `subscribe()`, `registerTrigger()`, `publishTrigger()`, `dispatchPushMessage()` and the `innerBus: GcpPubSubEventBusAdapter` constructor dependency entirely (`publish()` never called it — only the deleted `subscribe()` did). `event-bus.module.ts` is restructured so `GcpPubSubEventBusAdapter` is the anchor bare provider (not an alias of `EVENT_BUS`), with `EVENT_BUS`, `TRIGGER_BUS`, and `PUSHABLE_EVENT_BUS` all `useExisting` pointing at it in S01 — unchanged externally observable behavior today, but `TRIGGER_BUS`/`PUSHABLE_EVENT_BUS` now permanently resolve to the real adapter regardless of what `EVENT_BUS` becomes. | The outbox's only job is durably recording an envelope in `shared.outbox` inside the caller's transaction — it has nothing to do with subscribing, cron triggers, or push dispatch. Forcing it to implement those three ports (because `TRIGGER_BUS`/`PUSHABLE_EVENT_BUS` happened to alias `EVENT_BUS`) was an ISP violation with no behavioral justification: nothing ever calls `registerTrigger`/`publishTrigger`/`dispatchPushMessage` through the `EVENT_BUS` token itself (only through the separate `TRIGGER_BUS`/`PUSHABLE_EVENT_BUS` tokens), so the outbox class carrying those methods bought nothing. `subscribe()` is different in kind, not degree: 16 handler files call it through the *same* `EVENT_BUS` token publish call sites use, so removing it from the outbox class requires splitting `EVENT_BUS` into separate publish/subscribe tokens — real production churn across those 16 files, correctly scoped to S02 (see S02 story notes), not retrofitted into S01. **Superseded by D14** (2026-07-11): the token split described here never ends up happening — `EVENT_BUS` turns out to never need rebinding to `OutboxPublisher` at all, so `subscribe()`'s exclusion from `IOutboxPublisher` needed no transitional justification beyond "the outbox was never going to sit behind `EVENT_BUS` in the first place." The conclusion (outbox implements only `IOutboxPublisher`) stands; this specific reasoning for why it was hard to achieve does not. |
| D14 | **`EVENT_BUS` is never rebound to `OutboxPublisher`. Callers that need outbox durability depend on `OUTBOX_PUBLISHER`/`IOutboxPublisher` explicitly** — supersedes D4's "the DI rebind makes cutover mostly mechanical" framing and retires the publish/subscribe token-split plan (`EVENT_SUBSCRIBER`) drafted earlier for S02 (decided post-S01-merge, 2026-07-11). `EVENT_BUS` stays `useClass: GcpPubSubEventBusAdapter` forever — untouched by any future story. The 3 event-emitting aggregates' repositories (via `drain-domain-events.ts`, S02) and the 3 cron jobs (S03) inject `OUTBOX_PUBLISHER` directly instead of `EVENT_BUS`. The 16 subscribing handlers are completely unaffected — no token change, ever. `OutboxRelayService` can now safely inject `EVENT_BUS`/`IEventBus` instead of the concrete `GcpPubSubEventBusAdapter` class (S01, this same PR) — the only reason it needed the concrete class was to survive `EVENT_BUS` potentially being rebound out from under it; since `EVENT_BUS` is now permanently stable, that risk doesn't exist. This also means `event-bus.module.ts`'s `GcpPubSubEventBusAdapter` class-token alias/export (added for that same now-obsolete reason) can be deleted. `event-bus.module.ts`, `gcp-pubsub-event-bus.adapter.ts`(`.spec.ts`), and `pubsub-push.controller.ts`(`.spec.ts`/`.integration.spec.ts`) are relocated into a new `shared/infrastructure/event-bus/` folder (post-merge cleanup, 2026-07-11, same convention as `shared/infrastructure/outbox/`) — `shared/ports/event-bus.port.ts` stays flat in `shared/ports/`, unchanged, matching how `outbox-publisher.port.ts`/`outbox-repository.port.ts` stay flat while their adapters moved into `outbox/`. | The original design conflated two different responsibilities under one token: "publish to the transport" (`EVENT_BUS`, unchanged contract) and "durably record then eventually deliver" (`OutboxPublisher`, a fundamentally different reliability/latency contract). Making `OutboxPublisher` a structural drop-in for `IEventBus` satisfied the type signature but violated the *behavioral* half of Liskov substitution — a caller reading `@Inject(EVENT_BUS) eventBus: IEventBus` has no signal that publish might now take up to ~5 minutes and carry retry/dedup semantics it never asked for. It also bought little in practice: D6 already independently planned to delete the use-case-level publish loops (moving that responsibility into 3 repositories), shrinking the "how many call sites would need to change" argument for hiding the swap from ~21 to ~6 (3 repos + 3 jobs) — at that scale, an honest, explicitly-named dependency costs almost nothing extra and removes an entire class of hidden-behavior-change risk. It also dissolves complexity the token-split plan would have introduced (a new `EVENT_SUBSCRIBER` token, dual-token overrides in every integration app, `OutboxRelayService`'s concrete-class dependency) — when the corrected design deletes work you were about to do to patch around the original one, that's a signal the original design was the workaround, not the correct fix. One real, named tradeoff, not eliminated: the old design made "forgetting to route through the outbox" *structurally impossible* (everything funneled through one always-durable token); this design reintroduces a human choice point for any *future* non-aggregate publish site (a new cron job could mistakenly inject `EVENT_BUS` instead of `OUTBOX_PUBLISHER`, or a new use case/repo could manually publish a `DomainEvent` through `EVENT_BUS` instead of relying on the repo auto-drain). **A type-level narrowing of `IEventBus.publish()` to `DomainEvent` (excluding `Command`) was tried and reverted same-day** — it closed the cron-job case at the compiler, but forced `OutboxRelayService`'s `asStoredEvent()` to mislabel a relayed `Command`'s payload as `DomainEvent` (dishonest typing for the one class that legitimately needs to handle both generically). The chosen mitigation instead is structural, not type-level: an ESLint import-boundary rule restricting which files may import `shared/ports/event-bus.port` at all (see S02/S03 acceptance criteria) — closes the same risk without asking the type system to lie about what a relayed payload actually is. |
| D13 | **All raw SQL/persistence is extracted from `OutboxPublisher` and `OutboxRelayService` into a proper repository** — new `shared/ports/outbox-repository.port.ts` (`IOutboxRepository`: `insert`, `findUnpublishedById`, `markPublished`, `claimUnpublished`, `runInTransaction`, `deleteOldPublished`) + `shared/infrastructure/outbox/typeorm-outbox.repository.ts` (`TypeOrmOutboxRepository`, the only class that knows `shared.outbox` is backed by raw SQL). Both `OutboxPublisher.publish()` and `OutboxRelayService`'s sweep/GC/inline-dispatch methods now depend on `IOutboxRepository` only — no `@InjectRepository`, no `Repository<OutboxEventEntity>`, no SQL string, no `EntityManager`-juggling in either class (decided post-S01-merge, 2026-07-11, same review pass as D12). `outbox.module.ts` registers `{ provide: OUTBOX_REPOSITORY, useClass: TypeOrmOutboxRepository }`. | Both classes had every raw `INSERT`/`SELECT ... FOR UPDATE SKIP LOCKED`/`UPDATE`/`DELETE` statement inlined directly, mixing business orchestration (which rows to claim, when to mark published, error isolation per row) with persistence mechanics (SQL, ambient-`EntityManager` vs. base-repo dispatch, transaction boundaries) in the same class — the same Repository-pattern violation the rest of the codebase avoids everywhere else (compare `TypeOrmTenantRepository`/`ITenantRepository`). Splitting them makes `OutboxPublisher`/`OutboxRelayService` unit-testable against a 6-method interface instead of mocking TypeORM's `Repository`/`EntityManager`/`manager.transaction` shape, and gives the outbox table's persistence details exactly one place to change (e.g. swapping `.query()` raw SQL for the query-builder alternative TypeORM's `ON CONFLICT`/`FOR UPDATE SKIP LOCKED` gaps already forced a workaround for). |

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

### `OutboxPublisher` (the automatic seam)

New `shared/infrastructure/outbox/outbox-publisher.ts`, implementing **only** `IOutboxPublisher` (`shared/ports/outbox-publisher.port.ts`) — one method, `publish()` (see D12: the outbox has nothing to do with subscribing, triggers, or push dispatch, so it carries no delegation methods and no `GcpPubSubEventBusAdapter` dependency). Per D13, it also carries no SQL and no TypeORM types at all — its constructor is `outboxRepo: IOutboxRepository`, `relay: OutboxRelayService`, `config: ConfigService`; the ambient-transaction-join logic and every raw SQL statement live in `TypeOrmOutboxRepository` (`shared/infrastructure/outbox/typeorm-outbox.repository.ts`), not here.

- `publish(event)` → dedup key = `event instanceof Command ? event.dedupKey : event.eventId` (see the Envelope/Command model below); calls `outboxRepo.insert(event, dedupKey)`, which joins the caller's ambient transaction if one is active (**this is the atomicity**) or runs standalone if not — see D13. On a successful insert (an id comes back — a dedup conflict returns `undefined`), registers the row id via `scheduleAfterCommit()` for inline dispatch (which, per §C1, runs immediately when no tx is ambient — so non-transactional publishes still get instant delivery).
- **Inline dispatch is awaited inside the after-commit callback** — it runs after the commit and before the HTTP response returns (adds ~10–100 ms to event-emitting endpoints; accepted). This is deliberate, not an accident of §C1: a fire-and-forget floating promise would race Cloud Run's request-based CPU allocation — CPU is throttled once the response is sent, so a background publish gets starved, fails silently, and every "happy path" quietly degrades to sweep latency (up to 5 min for customer-facing emails). Awaiting before the response is the only Cloud-Run-safe option without paying for always-allocated CPU.
- Inline dispatch **never throws into the caller**: the try/catch lives **inside the callback passed to `scheduleAfterCommit`** — this placement is mandatory, not stylistic. Per §C1, `flushAfterCommitCallbacks` has no try/catch: an escaping error would propagate out of `txManager.run()` *after* the commit (the use case would report failure for work that committed) and abort the remaining callbacks (other events' inline dispatch silently lost). Dispatch errors are logged and left to the sweep; the use case succeeded the moment the transaction committed.
- `OutboxRelayService` (the sweep/relay, unchanged by D12) is what actually holds a `GcpPubSubEventBusAdapter` reference and does real Pub/Sub delivery — `OutboxPublisher` only ever writes the row and asks `OutboxRelayService` to relay it.

### `Envelope` / `DomainEvent` / `Command` (D11)

**Superseded design note:** an earlier draft of this section gave `DomainEvent` an optional `dedupKey?: string` field, set only by cron-published events. Revised during S01 implementation to a proper sibling model instead — see D11 below for why.

- `shared/domain/envelope.ts` — the shared wire envelope every published message rides on: `eventId` (fresh `uuidv7()` per construction), `tenantId`, `occurredAt`, `correlationId`, `eventName`, plus the abstract `eventVersion`/`data`. This is what `IEventBus.publish(event: Envelope)`/`subscribe<T extends Envelope>()`, `GcpPubSubEventBusAdapter`, and the outbox are typed against.
- `shared/domain/domain-event.ts` — `DomainEvent extends Envelope {}`, unchanged in shape from before this revision. A fact that already happened to an aggregate (`BookingApproved`, `StaffInvited`, ...) — emitted at most once per business action, so its own `eventId` already identifies the fact uniquely. No dedup concept; never needed one.
- `shared/domain/command.ts` — `Command extends Envelope`, new. An idempotent *instruction* ("send this reminder," "warn this customer"), not a fact — only ever constructed by scheduled jobs, never by aggregate methods. Carries a **required** `readonly dedupKey: string` (not optional): a retried or overlapping cron tick can legitimately construct the *same* Command twice with two different `eventId`s, so the deterministic `dedupKey` is what the outbox's `UNIQUE(dedup_key)` collapses N such attempts down to one delivered message on.

`Command` deliberately extends `Envelope` (a sibling of `DomainEvent`, not a subtype of it) rather than a wholly separate hierarchy — this costs nothing at the transport layer (`IEventBus`, the outbox, `GcpPubSubEventBusAdapter` all already type against the shared envelope) while still making `instanceof Command` a reliable, compiler-enforced signal that dedup is required, instead of an easily-forgotten optional field on every event class.

### Repository auto-flush (D6)

The 3 event-emitting aggregates' TypeORM repositories inject `EVENT_BUS` and, as the last step of `save()` (inside the ambient transaction):

```ts
for (const event of aggregate.clearDomainEvents()) {
  await this.eventBus.publish(event); // = outbox row in the SAME transaction
}
```

(Extract as a tiny shared helper, `shared/infrastructure/outbox/drain-domain-events.ts`, to avoid three copies — SonarCloud duplication gate.)

- Exactly 3 repos now (§A3); the pattern becomes part of the "new aggregate" recipe in `docs/ENGINEERING_RULES.md`.
- For `Tenant`: the drain goes in `typeorm-tenant.repository.ts` (persistence adapter), **not** `caching-tenant.repository.ts` — the cache decorator keeps delegating `save()` and owning only cache invalidation.
- Events constructed outside aggregates (§A2) keep calling `eventBus.publish()` explicitly — which is now an outbox write.
- **Invariant change (doc sweep):** CLAUDE.md §7 currently says "flush `clearDomainEvents()` **after** `txManager.run()`". New invariant: *aggregate events are drained to the outbox by the repository inside the save transaction; use cases never flush aggregate events; direct `eventBus.publish()` is only for non-aggregate events (jobs, re-emits) and must run inside `txManager.run()` when it must be atomic with a business write.*

### Relay — one publication path, two triggers

`shared/infrastructure/outbox/outbox-relay.service.ts` — a single `relay(rowIds?)` used by both:

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

**The loop drains the whole backlog per tick, not one batch.** `OutboxRelayService.sweep()`'s `while (more)` only stops once a batch comes back smaller than `OUTBOX_SWEEP_BATCH_SIZE` — a single tick keeps claiming/publishing/marking 100-row batches until it's caught up to (approximately) real time minus the grace window, not just the first 100 rows. Rows younger than the grace window are deliberately excluded from *this* tick (avoids racing the inline path) but are never dropped — they simply become eligible on a later tick, bounded by the sweep interval (D3's accepted worst-case delay), not lost.

⚠️ **Interaction with the push subscription's `ack_deadline_seconds=60`** (`plan/M17-CLOUD-DEPLOY.md`): if a real backlog builds up (e.g. a sustained Pub/Sub outage failing many inline dispatches) and draining it takes the sweep longer than 60s, Pub/Sub considers that push delivery failed and retries (`minimum_backoff=10s`) — spawning a second, concurrent sweep invocation while the first may still be mid-drain. `SKIP LOCKED` makes this safe (no double-processing, proven by the S01 SKIP LOCKED integration test), so recovery just becomes multiple overlapping invocations draining the backlog together rather than one clean sequential pass — not a correctness issue, but worth knowing as the actual mechanism. The genuine failure mode this can't self-heal from is *sustained* backlog growth outpacing drain capacity across many consecutive ticks — S05's "outbox lag observable (unpublished count + oldest-unpublished age) with an alert path" acceptance criterion is the safety net for detecting that in production, since it isn't something to statically rule out here.

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

**Resolved** (originally deferred to S03 discovery, decided during S01 implementation 2026-07-11 alongside the `Command` migration — see D11). The three publishing jobs set `dedupKey` to a business identity:

| Event | dedup_key shape | Date source |
|---|---|---|
| `PointsExpiringSoon` | `PointsExpiringSoon:<tenantId>:<customerId>:<yyyy-mm-dd>` | **UTC** run date (`utcDateString(now)`, computed once per `run()`) |
| `BookingReminderDue` / `BookingReminderDueToday` | `<EventName>:<tenantId>:<bookingId>:<yyyy-mm-dd>` | **Tenant-local** date (`localTomorrow`/`localToday`, already computed once per tenant by `BookingReminderJob` for its own query window) |
| `AdminDailyScheduleReminder` | `AdminDailyScheduleReminder:<tenantId>:<yyyy-mm-dd>` | **Tenant-local** date (`data.localDate`, already part of the event's own payload — no extra constructor param needed) |

**The timezone-of-day rule, resolved per job, not globally:** the two booking jobs (`BookingReminderJob`, `AdminScheduleReminderJob`) already compute a tenant-local calendar date once per tenant, before their own query-window logic — the dedup key reuses that exact value, so a job straddling midnight can't mint two keys for one logical run (no new computation, no new midnight-boundary risk). `NotifyExpiringPointsJob` uses the **UTC** date instead: unlike the booking jobs, it has no existing per-tenant timezone lookup (it iterates `LoyaltyEntry` rows grouped by `tenantId`, not `Tenant` records with a `.timezone` field), and at this job's weekly cadence the UTC-vs-tenant-local midnight boundary is immaterial to what the key protects against (a retry landing on the same calendar day as the original attempt, not a customer-facing "which day is this for" distinction). Adding tenant-timezone plumbing to this job solely for dedup-key purposes was judged out of proportion to the benefit — revisit only if this job's cadence ever tightens to daily or sub-daily.

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

> **Sequencing rationale:** each story leaves `main` shippable. S01 ships dark (nothing writes to the outbox). S02 cuts over all 18 aggregate-driven publish sites (11 booking + 4 staff + 1 platform use cases, via the 3 repos' `OUTBOX_PUBLISHER`-backed drain) — the 3 cron jobs still call `EVENT_BUS` directly until S03 switches them to `OUTBOX_PUBLISHER` alongside their transactional batching (D14: there's no DI rebind to "intercept" jobs for free anymore, so their cutover is an explicit part of S03, not a side effect of S02). Consumers keep their existing dedup until S04 — it keeps working against relay-published events because `eventId`s are preserved verbatim end-to-end. S03 and S04 are independent of each other; keep this order because S03 closes the two motivating bugs (cron double-send, §12.3 lost re-emit) and S04 is consolidation.

---

### TD24-S01 — Outbox foundation (ships dark) ✅ Done

Nothing is rebound; no *observable* behavior changes (`EVENT_BUS` still resolves to the raw `GcpPubSubEventBusAdapter`, unaffected by anything below). Everything is built and tested in isolation.

**Scope pulled forward from S03 (decided mid-implementation, 2026-07-11 — see D11):** the `Command`/`Envelope` model was introduced here instead of shipping `DomainEvent.dedupKey?` as originally drafted, and — since `Command` needed at least one real consumer to prove the type out — the 4 cron event classes' migration and the timezone-of-day rule (originally S03's job) were completed in this same story. **What remains genuinely S03's job:** wrapping each job's per-tenant publish batch in `txManager.run()` (transactional atomicity across a tenant's outbox rows) and the loyalty re-emit atomicity fix (`ServicePointsEarned` inside `txManager.run()` with `markProcessed`) — see the shrunk S03 section below.

**Create:**
- Migration `AddSharedSchema` — `CREATE SCHEMA shared` + the `ikaro_app` grant block copied from `BootstrapSchemas` (new migration; never edit the applied one). ⚠️ Migration timestamps are global across contexts — pick the next free timestamp.
- Migration `CreateSharedOutbox` — table + partial index per §Design.
- `shared/infrastructure/outbox/outbox-event.entity.ts` (TypeORM entity, `schema: 'shared'`). **Folder convention (mirrors `shared/infrastructure/cache/`):** every new outbox file lands in `shared/infrastructure/outbox/`, flat inside that folder — entity, bus, relay, trigger handler, controller, module. Do not scatter these across the top level of `shared/infrastructure/` (existing flat files there — `event-bus.module.ts`, `gcs-signed-url.adapter.ts`, etc. — are pre-existing and out of scope for this TD; a retroactive reorg is a separate follow-up chore, not part of TD24).
- `shared/ports/outbox-repository.port.ts` (`IOutboxRepository`, D13) + `shared/infrastructure/outbox/typeorm-outbox.repository.ts` (`TypeOrmOutboxRepository`) — the only class that knows `shared.outbox` is backed by raw SQL: `insert()` (ambient-EM join if a transaction is active, else standalone; `ON CONFLICT DO NOTHING RETURNING id`), `findUnpublishedById()`, `markPublished(id, manager?)`, `claimUnpublished(manager, ...)` (`FOR UPDATE SKIP LOCKED`), `runInTransaction()`, `deleteOldPublished()`. ⚠️ TypeORM's `repository.save()` cannot express `ON CONFLICT DO NOTHING RETURNING` or `FOR UPDATE SKIP LOCKED` — use the query builder (`.insert().orIgnore().returning('id')`) or raw SQL through the ambient `EntityManager`; do not detour through `save()`.
- `shared/infrastructure/outbox/outbox-publisher.ts` (renamed from `outbox-event-bus.ts` — see D12) — implements only `IOutboxPublisher` (`shared/ports/outbox-publisher.port.ts`); `publish()` computes the dedup key and delegates persistence to `IOutboxRepository.insert()` (D13), then a `scheduleAfterCommit` hook for inline dispatch (dispatch awaited + errors swallowed *inside* the callback, per §Design). No `GcpPubSubEventBusAdapter` dependency, no SQL — dispatch is handed off to the injected `OutboxRelayService`.
- `shared/infrastructure/outbox/outbox-relay.service.ts` — `relay(rowIds?)`, orchestrating sweep (grace window, batch loop via `IOutboxRepository.runInTransaction`/`claimUnpublished`), retention GC (`OUTBOX_RETENTION_DAYS`, default 14) via `deleteOldPublished()`, and the marking rule via `markPublished()` — no SQL in this class either (D13).
- Trigger wiring, all in `shared/infrastructure/outbox/`: `cron-outbox-relay` trigger-name constant + trigger handler (mirror `booking/infrastructure/events/booking-reminder-trigger.handler.ts`) + thin `/cron/outbox-relay` controller (mirror `cron-booking.controller.ts`).
- `shared/infrastructure/outbox/outbox.module.ts` — **new module, required** (verified gap: no existing module is positioned to host these providers). Registers `TypeOrmModule.forFeature([OutboxEventEntity])`, `{ provide: OUTBOX_REPOSITORY, useClass: TypeOrmOutboxRepository }`, `{ provide: OUTBOX_PUBLISHER, useClass: OutboxPublisher }`, `OutboxRelayService`, the trigger handler, and the `/cron/outbox-relay` controller. Not `@Global()` — nothing outside this module needs to inject outbox internals yet (per D14, `OUTBOX_PUBLISHER` has no consumers until S02/S03's repos and jobs are wired to it). Mirrors `event-bus.module.ts`'s style (one module per shared concern, imported directly in `app.module.ts` — there is no catch-all `SharedModule` to drop into).
- `shared/domain/envelope.ts` — `Envelope` (the shared wire base, renamed content of what was `domain-event.ts`), `shared/domain/domain-event.ts` — `DomainEvent extends Envelope {}` (thin, unchanged shape for all 17 existing subclasses), `shared/domain/command.ts` — `Command extends Envelope` with a **required** `readonly dedupKey: string` (see D11 — supersedes the originally-drafted optional field on `DomainEvent`).
- **4 cron event classes migrated `DomainEvent` → `Command`** (pulled forward from S03): `booking/domain/commands/booking-reminder-due.command.ts`, `booking-reminder-due-today.command.ts`, `admin-daily-schedule-reminder.command.ts`, `loyalty/domain/commands/points-expiring-soon.command.ts` — each now computes a real `dedupKey` per the §Design table (`BookingReminderDue`/`BookingReminderDueToday` take an extra `localDate` constructor param; `AdminDailyScheduleReminder` derives it from its own `data.localDate`; `PointsExpiringSoon` takes an extra `runDate` param). Relocated from `domain/events/` into a new sibling `domain/commands/` folder with a `.command.ts` suffix (post-merge cleanup, 2026-07-11) — the file layout now matches the `Command`/`DomainEvent` split at the class level, not just the type level.
- **3 publishing jobs updated** to supply the new constructor args: `booking/application/jobs/booking-reminder.job.ts` passes its already-computed `localTomorrow`/`localToday`; `admin-schedule-reminder.job.ts` needs no change (dedupKey derives from existing payload data); `loyalty/application/jobs/notify-expiring-points.job.ts` computes `utcDateString(now)` once per run and passes it through. Per-tenant `txManager.run()` batching (transactional atomicity across a tenant's rows within one job run) is **not** part of this — remains S03.
- Transport layer widened from `DomainEvent` to `Envelope`: `shared/ports/event-bus.port.ts` (`IEventBus.publish`/`subscribe<T>`), `shared/infrastructure/gcp-pubsub-event-bus.adapter.ts`, `contexts/notification/infrastructure/events/dead-letter.handler.ts` (the DLQ can receive a dead-lettered `Command` as easily as a `DomainEvent`), `test/infrastructure/in-memory-event-bus.ts` + `routing-in-memory-event-bus.ts`. `shared/domain/aggregate-root.ts` stays typed `DomainEvent[]` unchanged — aggregates never emit `Command`s.
- Config wiring: `OUTBOX_INLINE_DISPATCH_ENABLED`, `OUTBOX_SWEEP_BATCH_SIZE`, `OUTBOX_SWEEP_GRACE_SECONDS`, `OUTBOX_RETENTION_DAYS` (default 14). (`INBOX_RETENTION_DAYS` + its ≥ 8 startup check arrive with the inbox in S04.)
- Test support: outbox entity builder (`src/test/builders/shared/`), shared `fake-config-service.ts` test double (`src/test/infrastructure/` — consolidates what would otherwise be 4 duplicated hand-rolled fakes across the outbox specs).

**Modify:**
- `integration-global-setup.ts` + `test-datasource.ts` — register new entity + migrations (**same commit** as the migrations).
- `shared/infrastructure/event-bus/event-bus.module.ts` (relocated from flat `shared/infrastructure/`, D14) — per D14, this file ends up with **zero net diff** in its actual bindings from the outbox work: no rebind is ever coming, so no class-token alias for `GcpPubSubEventBusAdapter` is needed. `OutboxRelayService` injects `EVENT_BUS`/`IEventBus` directly instead of the concrete adapter class (safe precisely because `EVENT_BUS` is permanently stable — see D14's rationale). `gcp-pubsub-event-bus.adapter.ts`(`.spec.ts`) and `pubsub-push.controller.ts`(`.spec.ts`/`.integration.spec.ts`) move into the same new folder.
- `app.module.ts` — **required, verified gap:** import the new `OutboxModule`. Also broaden `TypeOrmModule.forRootAsync`'s `entities` option from a single glob string to an array: `[__dirname + '/contexts/**/infrastructure/entities/*.entity{.ts,.js}', __dirname + '/shared/infrastructure/**/*.entity{.ts,.js}']`. The current glob only scans `contexts/**` — the new outbox entity lives under `shared/infrastructure/outbox/` and would silently fail to load in the real running app without this (test datasources already use explicit entity arrays, so this gap is invisible in tests — it only bites at runtime).

**Tests (unit + integration):**
- publish inside `txManager.run()` → row rolls back with the business write; publish outside any tx → row committed standalone.
- `dedup_key` conflict → no row, no inline dispatch scheduled.
- **after-commit error isolation:** two publishes in one `txManager.run()`, inner adapter throws on the first inline dispatch → `run()` resolves normally (no error into the caller), the second event still dispatches, the first row stays unpublished for the sweep.
- relay marks `published_at` **only** on successful Pub/Sub publish; failed publish leaves row unpublished.
- **transport round-trip (emulator):** relay publishes the stored envelope through the real `GcpPubSubEventBusAdapter` against the Pub/Sub emulator → received message is byte-identical to the pre-outbox envelope (`eventId`/`correlationId`/`occurredAt` survive the JSONB round-trip verbatim — this is what keeps consumer dedup working).
- sweep: respects grace window; `SKIP LOCKED` (two concurrent sweeps → each row published once); loops until empty; GC deletes only published rows older than `OUTBOX_RETENTION_DAYS`.
- `Envelope`/`Command` unit specs: fresh `eventId` per construction, envelope fields pass through, `Command.dedupKey` required and serializes into JSON.
- Each of the 4 migrated event classes' owning job spec: dedup key shape assertion (`<EventName>:<tenantId>:...:<date>`), and — using `InMemoryEventBus` (no real dedup at this layer) — two calls to `job.run()` with the same `now` produce *matching* `dedupKey`s on the two resulting events, proving the key is deterministic across repeated runs (the outbox is what actually collapses them to one row/message — that guarantee is proved by the `OutboxPublisher`/`OutboxRelayService` specs above, not re-proved per job).

**Infra note:** the Cloud Scheduler job + topic (`var.outbox_relay_schedule`, default `*/5 * * * *`) lands in the M17 Terraform tree — specifically `M17-S21` (Cloud Scheduler module, currently unimplemented) as its 4th job, and `M17-S19` (Pub/Sub module) auto-discovers the 4th topic via its scanner. Both stories already cross-reference this TD (updated 2026-07-11). Not a parallel mechanism.

**Acceptance:** all new code merged, zero call-site behavior change; `EVENT_BUS` still the raw Pub/Sub adapter.

---

### TD24-S02 — Cutover: repository auto-flush through OutboxPublisher (all aggregate events) ✅ Done

**Rescoped 2026-07-11 (D14):** no DI rebind, no publish/subscribe token split. `EVENT_BUS` is never touched by this story — it stays pointed at `GcpPubSubEventBusAdapter` forever. `OutboxPublisher` (built in S01, D12/D13) is wired to its own token, `OUTBOX_PUBLISHER`, which the 3 repos' drain helper depends on explicitly. The 16 subscribing handlers are completely unaffected — they keep injecting `EVENT_BUS`/`IEventBus` exactly as today, no migration needed.

**Modify — DI (1 file):**
- `outbox.module.ts`: register `{ provide: OUTBOX_PUBLISHER, useClass: OutboxPublisher }` (if not already done in S01 — check first). `event-bus.module.ts` is **not modified** by this story.

**Modify — repositories (3 files + 1 new helper):**
- `shared/infrastructure/outbox/drain-domain-events.ts` helper, injecting `IOutboxPublisher`/`OUTBOX_PUBLISHER` (not `EVENT_BUS`); call it at the end of `save()` in `booking/infrastructure/repositories/typeorm-booking.repository.ts`, `platform/infrastructure/repositories/typeorm-tenant.repository.ts`, `staff/infrastructure/repositories/typeorm-staff.repository.ts`. (NOT `caching-tenant.repository.ts`.)

**Modify — use cases, all 16 (§A1 list):** delete the `clearDomainEvents()` publish loop *and* the now-unused `EVENT_BUS` injection from all 11 booking + 4 staff + 1 platform use cases (e.g. `invite-staff.use-case.ts` loses `@Inject(EVENT_BUS) private readonly eventBus: IEventBus` and its trailing publish loop entirely — `EVENT_BUS` disappears from these files, it is not replaced by `OUTBOX_PUBLISHER` here). Each use case's event emission is now implicit in `repo.save()` inside its existing `txManager.run()`.

**Modify — unit-test repository doubles (3 files) — REQUIRED, or ~16 unit suites go red:**
- `src/test/repositories/booking/in-memory-booking.repository.ts`, `src/test/repositories/staff/in-memory-staff.repository.ts`, `src/test/repositories/platform/in-memory-tenant.repository.ts` — accept an `IOutboxPublisher` double and drain `clearDomainEvents()` in `save()`, mirroring production (reuse the same `drain-domain-events.ts` helper so the doubles can't drift). Unit specs wire `InMemoryXxxRepository` and `InMemoryEventBus` as two *unconnected* doubles today (verified: `approve-booking.use-case.spec.ts`) — once this story deletes the use-case publish loops, nothing feeds `.published` unless the doubles drain. All 16 use-case unit specs asserting on `.published` then pass with unchanged assertions. ⚠️ If those specs are red mid-story, the fix is this drain wiring — **never delete the event assertions.**

**Modify — test infrastructure:**
- `routing-in-memory-event-bus.ts`: defer handler dispatch via `scheduleAfterCommit()` when a transaction is ambient (per §C1 it dispatches immediately otherwise). Without this, repos draining inside the tx would trigger synchronous handler runs mid-transaction — handlers on separate connections can't see the uncommitted write, and nested `txManager.run()` calls risk deadlock. This is unrelated to which token drives the publish — it's about *when* `publish()` is called relative to the transaction boundary, so it applies whether the caller went through `EVENT_BUS` or `OUTBOX_PUBLISHER`.
- ⚠️ **The deferral must compose with the BFS queue — the trickiest work in this story.** The deferred after-commit callback must *enqueue* into the existing BFS queue when a dispatch cycle is active, never dispatch directly — otherwise the ordering race BFS exists to prevent resurfaces: `TenantProvisioned` → staff handler's nested tx commits and would fire `StaffInvited` *before* the notification handler has seeded templates. Regression signal: the `staff-invitation` assertion in `booking-full-workflow.handler.integration.spec.ts` — if it goes red, the BFS composition is wrong; do not "fix" it by reordering handlers.
- Because §C1 flushes after-commit callbacks *before* `txManager.run()` returns, dispatch still completes before each HTTP response — integration specs' "everything dispatched when the HTTP call resolves" assumption holds unchanged. Update the two comments in `booking-full-workflow.handler.integration.spec.ts` (~L90, ~L280) that say "RoutingInMemoryEventBus is synchronous" → "dispatched after commit, before the HTTP call resolves".
- `in-memory-event-bus.ts`: no deferral needed for unit specs — `InMemoryTransactionManager` creates no ambient context, so `scheduleAfterCommit` falls through to immediate dispatch; add the deferral only if an integration app turns out to use this bus under a real transaction.
- **Integration app helpers must override *both* `EVENT_BUS` and `OUTBOX_PUBLISHER` with the same routing-bus instance** (`useClass`, never `useExisting`) — the 16 handlers still subscribe via `EVENT_BUS`; repos now publish via `OUTBOX_PUBLISHER`. Since `RoutingInMemoryEventBus` already satisfies `IOutboxPublisher`'s one-method shape (it has `publish()`), binding one instance to both tokens is enough for a flow test's publish and subscribe sides to still observably connect. Flow tests still bypass the *real* outbox table by design; outbox persistence itself is covered by S01's dedicated tests plus this story's crash tests below.

**Tests (these are TD08 AUD-003's executable spec — write first where practical):**
- Crash-between-commit-and-publish: with inline dispatch disabled, commit a booking approval → assert outbox row unpublished + no Pub/Sub message → run relay → exactly one message delivered.
- Inline publish failure (Pub/Sub double that throws) → use case still succeeds; row unpublished; sweep retries and delivers.
- Two concurrent relay attempts on the same row → exactly one Pub/Sub publish.
- **Full-topology test (one, new):** an integration app where `OUTBOX_PUBLISHER` is the real `OutboxPublisher` and both `EVENT_BUS`/`OUTBOX_PUBLISHER` test overrides point at the same routing bus for the transport/subscribe side, driving one booking approval end-to-end: use case → repo.save() drains via `OUTBOX_PUBLISHER` → outbox row → relay → dispatch → notification handler → email log. This is the only test that exercises the *production* pipeline shape (flow suites bypass the outbox; S01 tests it in isolation) — it catches envelope-serialization drift through the JSONB round-trip that neither covers.
- Regression: every flow integration suite (booking/staff/platform → notification/loyalty) passes with only the routing-bus deferral + dual-token-override change.

**Docs (same PR, per §7 DoD):** CLAUDE.md/§7 invariant + `docs/ENGINEERING_RULES.md` + `docs/03-DOMAIN_EVENTS.md` delivery-guarantees section + `docs/08-TESTING_STRATEGY.md` (routing-bus semantics + dual-token override changed).

**Acceptance:** grep proves no use case contains a `clearDomainEvents()` loop or an `EVENT_BUS` injection; `OUTBOX_PUBLISHER` is the only thing the 3 repos' drain helper depends on; `event-bus.module.ts` has zero diff from this story; full CI green.

> **State after S02:** all aggregate-driven events (18 of the 21 original sites) flow through the outbox via explicit `OUTBOX_PUBLISHER` dependency. Dual-write is closed for aggregates. The 3 cron jobs still call `EVENT_BUS` directly (unchanged, still bypassing the outbox) until S03 switches them to `OUTBOX_PUBLISHER` alongside their transactional batching — see S03's job-modification bullet. Still open: cron double-run (needs S03) and the §12.3 re-emit ordering (needs S03).

---

### TD24-S03 — Cron transactional batching + the loyalty re-emit (the two motivating bugs) ✅ Done

**Scope shrunk 2026-07-11:** this story's original "accept/derive a deterministic `dedupKey`" work for the 4 cron event classes — including resolving the timezone-of-day rule — was pulled forward into S01 alongside the `Command`/`Envelope` model (see D11 and S01's story notes). Confirm at story-discovery time that `git log`/the current event class files still show `extends Command` with a real `dedupKey` before starting — if a future revert or rebase ever undid that, this story would need to re-absorb it.

**What's left:**

**Modify — jobs (3 files, §A2), token swap + transactional wrapping together (per D14):** switch each job's `@Inject(EVENT_BUS) private readonly eventBus: IEventBus` to `@Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher` (mechanical — `EVENT_BUS` was never rebound, so jobs calling it directly bypassed the outbox entirely until this line changes), and wrap each job's per-tenant publish batch in `txManager.run()` so a run's outbox rows commit atomically (one tx per tenant-batch, not one giant tx — a mid-run crash then retries only the un-committed tenants' facts as no-op conflicts + remainder). The `dedupKey`-bearing constructor calls already exist (S01) — this story adds the token swap and the transactional wrapping around them, together, in the same commit (see the ambient-transaction bullet below for why they can't land separately).

**Modify — job unit specs (3 files):** the publishing jobs gain a `txManager` constructor dependency and swap their `IEventBus`/`InMemoryEventBus` double for an `IOutboxPublisher` double — wire the existing `src/test/infrastructure/in-memory-transaction-manager.ts` double (it runs the work directly with no ambient context; `expire-points.job.spec.ts` shows the pattern). Assertions on `.published` and on `dedupKey` (added in S01) are otherwise unchanged, just asserted against the new double.

**Modify — loyalty re-emit (1 file):** `complete-booking-loyalty-effects.use-case.ts` — move the `ServicePointsEarned` publish **inside** the existing `txManager.run()` that contains `markProcessed` (closes TD08 §12.3: the re-emit and the idempotency mark become one atomic fact). This use case already publishes via whatever it's wired to — confirm at story-discovery time whether it needs the same `EVENT_BUS` → `OUTBOX_PUBLISHER` swap or already goes through repo auto-flush (S02).

**Modify — enforce the ambient-transaction invariant (2 files):** once the jobs bullet above lands, *every* call to `OutboxPublisher.publish()` in the codebase runs inside `txManager.run()` — the 3 jobs for batch atomicity (this story), the 3 aggregate repos already (S02's D6 drain via `OUTBOX_PUBLISHER`). The "standalone" fallback `OutboxPublisher`/`TypeOrmOutboxRepository` support since S01 (D13; see the "commits the outbox row standalone when published outside any transaction" test) stops being a legitimate path and becomes a signal that a future call site forgot to wrap itself. Add a hard check to `TypeOrmOutboxRepository.insert()`: throw (e.g. `OutboxPublishedOutsideTransactionError` or similar — a startup/programmer-error class, not a domain error) when `getActiveEntityManager()` is undefined, and delete the standalone `this.repo.query(...)` fallback branch entirely. **Do not add this check before the jobs bullet above lands in the same commit** — since `EVENT_BUS` is never rebound (D14), jobs don't reach `OutboxPublisher` at all until they're switched to `OUTBOX_PUBLISHER`; but within *this* story, doing the token swap and the tx-wrap as two separate commits would leave a window where the jobs call `OutboxPublisher.publish()` unwrapped and this check would break them.

**Tests:**
- Two overlapping runs of each job for the same business day → exactly one outbox row per business fact → one consumer effect (the M17-S03 acceptance test that `cron_run_log` failed) — this is the first point in the TD where the dedup-key determinism proved at the domain level in S01 is actually exercised end-to-end through the real outbox.
- Mid-loop crash → re-run completes the remainder; no duplicates, no dropped facts.
- `BookingCompleted` redelivery after a simulated `ServicePointsEarned` outbox-write failure → effects roll back together and the redelivery completes both.
- `OutboxPublisher.publish()` (or `TypeOrmOutboxRepository.insert()`) throws when called with no ambient transaction — replaces/updates the S01 "commits the outbox row standalone" test, which no longer describes supported behavior once this story lands.

**Add — ESLint import-boundary rule (per D14):** once this story lands, *every* one of the original 21 publish sites (18 aggregate-driven via S02's repo drain + 3 jobs via this story) no longer imports `shared/ports/event-bus.port` at all. At that point, grep-verify zero remaining imports of it from `contexts/**/application/**` and `contexts/**/infrastructure/repositories/**`, then add a `no-restricted-imports` override (`eslint.config.js`) forbidding those two globs from importing `event-bus.port` — allow-list stays: the 16 handler files (`contexts/**/infrastructure/events/*.handler.ts`, need `subscribe()`), `shared/infrastructure/outbox/outbox-relay.service.ts` (needs `publish()`), `shared/infrastructure/event-bus/**` (owns the port), test doubles (`src/test/infrastructure/{in-memory,routing-in-memory}-event-bus.ts`) and the 5 `*-integration-app.ts` test helpers. **Do not add this rule before this story lands** — S02 alone still leaves the 3 jobs importing `event-bus.port` legitimately (D14's own "State after S02" note), so the rule would break them until this story's job token-swap bullet above also lands in the same PR.

**Docs:** dedup-key recipe in `docs/ENGINEERING_RULES.md` ("adding a cron-published event"); update `plan/M17-CLOUD-DEPLOY.md` S03 note (the tracked fix now exists).

---

### TD24-S04 — Inbox consolidation (consumer side)

**Create:**
- Migration `CreateSharedInbox` — table per §Design. **Shipped as a migration-history squash, not copy + drop** (D16, post-merge follow-up): `CreateNotificationProcessedEvents` deleted outright, `CreateLoyaltyLoyaltyEntries`'s `processed_events` block removed, so `CreateSharedInbox` is a bare `CREATE TABLE`. Register in `integration-global-setup.ts`/`test-datasource.ts` same commit; **remove** the two dropped entities from both in the same commit.
- `shared/ports/inbox.port.ts` (flat in `shared/ports/`, matching `event-bus.port.ts`/`trigger-bus.port.ts`) + `shared/infrastructure/inbox/inbox-record.entity.ts` + `shared/infrastructure/inbox/typeorm-inbox.repository.ts` (new `shared/infrastructure/inbox/` folder, same convention as `outbox/`) + in-memory double + builder.

**Modify:**
- loyalty: `complete-booking-loyalty-effects.use-case.ts` + `loyalty.module.ts` switch to the shared port (consumer name value unchanged).
- notification: `base-notification.use-case.ts` + `base-booking-reminder-notification.use-case.ts` swap `processedEventRepo` for the shared inbox port with composed consumer names; the 13 `send-*` use cases + `notification.module.ts` follow (mostly constructor wiring).
- staff: add the inbox check + `markProcessed` (inside the existing tx) to `create-initial-manager.use-case.ts` + `staff.module.ts` wiring — closes the uncovered `TenantProvisioned` path.

**Delete:** `loyalty/application/ports/processed-event-repository.port.ts`, `loyalty/infrastructure/entities/processed-event.entity.ts`, `loyalty/infrastructure/repositories/typeorm-processed-event.repository.ts`, `notification/application/ports/processed-event-repository.port.ts`, `notification/infrastructure/entities/processed-event.entity.ts`, `notification/infrastructure/repositories/typeorm-processed-event.repository.ts`, both in-memory doubles (`src/test/infrastructure/in-memory-processed-event.repository.ts`, `src/test/repositories/notification/in-memory-processed-event.repository.ts`), both builders (`src/test/builders/loyalty/processed-event-entity.builder.ts` + its `index.ts` export, `src/test/builders/notification/notification-processed-event-entity.builder.ts`); update `loyalty-integration-app.ts` / `notification-integration-app.ts` overrides. **Then grep `ProcessedEventEntity` and `NotificationProcessedEventEntity` across all `*.spec.ts` and `src/test/utils/**`** — specs embed the dropped entities in their `extraEntities` arrays (e.g. `booking-full-workflow.handler.integration.spec.ts` L25/L44) and must swap in the shared inbox entity; the delete list above is not the full blast radius.

**Modify — relay GC:** extend the sweep tick's GC with the inbox batched delete (D8; SQL in §Design) + `INBOX_RETENTION_DAYS` config with its ≥ 8 startup check. Also update the relay's GC tests.

**Tests:** duplicate `eventId` redelivery → single effect per consumer (loyalty, notification per template×channel, staff); migration copies existing dedup rows correctly (integration); inbox GC deletes only rows older than `INBOX_RETENTION_DAYS`; startup fails on `INBOX_RETENTION_DAYS < 8`.

**Docs:** `docs/13-DATABASE_SCHEMA.md` (both new tables, both drops); `docs/06-TENANT_ISOLATION_STRATEGY.md` — documented exemption: outbox/inbox are transport infrastructure keyed by `eventId`, not tenant-first business tables (outbox still carries `tenant_id` for observability). Include one LGPD data-inventory line: `outbox.payload` persists full event envelopes (customer names, emails, phones) in Postgres for `OUTBOX_RETENTION_DAYS` (14 days) — not a new *class* of exposure (Pub/Sub already retains the same data up to 7 days), but a new *store* that belongs in the inventory.

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
| `loyalty.processed_events` | **never existed** (S04, migration history squashed — D16) — replaced by `shared.inbox` |
| `notification.processed_events` | **never existed** (S04, migration history squashed — D16) — replaced by `shared.inbox`, granularity preserved in `consumer_name` |
| `notification.notification_logs` | **kept** — `NotificationLog` domain aggregate (audit/BI), not transport dedup |

## Doc updates required (owned by the story making each change — not deferred to S05)

| Doc | Change | Story |
|---|---|---|
| CLAUDE.md / `.copilot/context.md` §7 | Aggregate-events invariant: repo auto-flush inside tx replaces "flush after `txManager.run()`" | S02 |
| `docs/ENGINEERING_RULES.md` | Same invariant + "publish a new event" recipe (aggregate vs direct paths) + cron dedup-key recipe | S02/S03 |
| `docs/03-DOMAIN_EVENTS.md` | Delivery guarantees: at-least-once delivery, exactly-once effect; outbox/relay/inbox roles | S02 |
| `docs/08-TESTING_STRATEGY.md` | Routing-bus deferral semantics; outbox/inbox doubles; crash/concurrency test patterns | S02 |
| `docs/13-DATABASE_SCHEMA.md` | `shared` schema, new tables, dropped tables | S01/S04 |
| `docs/06-TENANT_ISOLATION_STRATEGY.md` | Transport-table exemption rationale + LGPD note (event payloads with PII persist 14 days in `outbox.payload`) | S04 |
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

- [ ] No application code calls Pub/Sub publish directly for domain events — `GcpPubSubEventBusAdapter.publish` is referenced only by `OutboxRelayService` (via `EVENT_BUS`, per D14); every aggregate repo and cron job depends on `OUTBOX_PUBLISHER` explicitly, not `EVENT_BUS`.
- [ ] The 3 event-emitting aggregates' repositories drain domain events inside the save transaction; no use case contains a `clearDomainEvents()` publish loop (grep-verifiable).
- [ ] `event-bus.module.ts`'s `EVENT_BUS`/`TRIGGER_BUS`/`PUSHABLE_EVENT_BUS` bindings have zero diff across S02/S03 (D14) — `EVENT_BUS` still resolves to `GcpPubSubEventBusAdapter` after the whole TD lands, exactly as before TD24 started.
- [ ] A test proves: crash between commit and publish loses nothing (sweep delivers exactly one message).
- [ ] A test proves: two concurrent publishes of the same business fact (same `dedup_key`) reach consumers as exactly one effect.
- [ ] A test proves: `ServicePointsEarned` survives a failed publish + `BookingCompleted` redelivery.
- [ ] (S03) `OutboxPublisher`/`TypeOrmOutboxRepository` reject a `publish()`/`insert()` call with no ambient transaction — the S01 standalone fallback is removed once every call site (repos + jobs) always runs inside `txManager.run()`.
- [ ] `shared.inbox` is the only consumer dedup mechanism; both `processed_events` tables and all their ports/entities/repos/doubles/builders are gone; staff `TenantProvisioned` covered.
- [ ] Relay schedule is a Terraform variable; batch/grace/inline-toggle/retentions are env vars (both retentions default 14 days; inbox startup check enforces ≥ 8); sweep GC enforces retention on both tables via batched trickle-deletes — no partitioning (D10).
- [ ] Outbox lag observable (unpublished count + oldest-unpublished age) with an alert path.
- [ ] All doc-sweep items landed in their owning stories (§Doc updates table).

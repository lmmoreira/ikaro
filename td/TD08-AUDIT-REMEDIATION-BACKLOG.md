# TD08 — Audit Remediation Backlog (Prioritized, Story-Structured)

**Status:** Open — drain incrementally as tech debt (no big-bang; see §0 "How to use")
**Scope:** whole repo — `apps/backend`, `apps/bff`, `apps/web`, `packages/*`, CI/CD, supply-chain, infra
**Derived from:** `OPUS_AUDITORY.md` (full senior audit of Ikaro, 2026-06-21 — architecture, events, frontend, CI/CD, supply-chain, QA, operability)
**Last updated:** 2026-06-21

> **Purpose:** Turn every audit finding into a **discrete, self-contained story** you can implement one at a time, ordered by **risk/urgency first, effort second**.
> **Audience:** This document is written to be read by **AI coding agents**. Each story is self-contained — problem, evidence, why it's wrong, the fix, and acceptance criteria — so a future agent can plan and implement it without re-reading the whole audit. Always cross-reference the cited `OPUS_AUDITORY.md §x.y` for the long-form rationale.
> **Note on scope vs. other TDs:** unlike TD01–TD07 (each a single focused debt), TD08 is an **umbrella backlog** of 43 stories spanning the whole audit. Treat each `AUD-NNN` story as an independently shippable unit; this file is the index and the context, not a single PR.

---

## 0. How to use this document

1. **Work top-down by priority tier** (P0 → P3). Within a tier, respect the `Depends on` field — some stories are prerequisites for others.
2. **Each story is a unit of work.** Create a feature branch per story (per `CLAUDE.md §9`), implement, test, PR, merge, then move to the next.
3. **For a future planning agent:** treat each story's `#### What needs to be fixed` as the *intent*, not a rigid spec — verify the cited `file:line` still matches before implementing (the audit is a snapshot). Expand the story into a full implementation plan (files to touch, tests to write) using the context provided.
4. **Severity badges reflect *production risk*, not always *current urgency*** — the Phase field tells you when to do it. Most of §13 (infra) is deliberately `Phase: Infra/Deploy`.

### Prioritization methodology

- **Primary sort — Risk/Urgency:** 🔴 Critical (data loss / corruption / double-booking / security) > 🟠 High (reliability, security hardening, duplicate sends, supply-chain) > 🟡 Medium (perf, quality, test depth) > 🔵 Low (polish).
- **Secondary sort — Effort & leverage:** quick wins (XS/S) that remove real risk are pulled up; a few high-leverage Large items (the outbox) lead despite size because everything else depends on them.
- **Phase gate:** `Now` = pre-deploy, code-level, do soon. `Pre-deploy` = needed before first production deploy. `Infra/Deploy` = deferred to the GCP infrastructure phase (see `OPUS_AUDITORY.md §13` deferral banner).

### Effort key
`XS` ≤ half day · `S` ~1 day · `M` 2–4 days · `L` 1–2 weeks.

---

## 1. Master Priority Table

| ID | Title | Risk | Effort | Phase | Depends on | Audit ref |
|---|---|---|---|---|---|---|
| **AUD-001** | Transactional outbox for all domain events ✅ | 🔴 Critical | L | Now | — | §4.1, §12.2, §12.3 |
| **AUD-002** | Fix booking slot-conflict race + prove optimistic lock | ✅ Done | M | Now | — | §4.2, §4.3 |
| **AUD-003** | Adversarial concurrency + event-failure test suite 🟡 4/5 | 🔴 Critical | M | Now | AUD-001, AUD-002 | §11.1, §11.2 |
| **AUD-004** | Event idempotency & duplicate-send prevention (crons + notifications) 🟡 2/3 | 🟠 High | M | Now | AUD-001 | §12.4, §12.5 |
| **AUD-005** | Graceful shutdown hooks (backend + BFF) ✅ | 🟠 High | XS | Now | — | §5.2 |
| **AUD-006** | Helmet / security headers on BFF ✅ | 🟠 High | XS | Now | — | §5.6 |
| **AUD-007** | CSP + security headers across apps/web ✅ | 🟠 High | S | Now | — | §8.3 |
| **AUD-008** | Isolate BFF HTTP-client auth state (`client-only` guard) ✅ | 🟠 High | XS | Now | — | §8.4 |
| **AUD-009** | Supply-chain CI hardening (pin actions, Dependabot, digests, concurrency, permissions) ✅ | 🟠 High | M | Now | — | §9.1, §9.2, §9.5, §10.1–10.3 |
| **AUD-010** | Fix the brittle `multer` override (real CVE) ✅ | 🟠 High | S | Now | — | §10.6 |
| **AUD-011** | Tenant-settings cache (in-memory LRU + TTL) ✅ | 🟡 Medium | S | Now | — | §5.1 |
| **AUD-012** | Prototype-pollution guard in `deepMerge` ✅ | 🟡 Medium | XS | Now | — | §5.7 |
| **AUD-013** | Per-tenant font loading (LCP) ✅ | 🟡 Medium | S | Now | — | §8.1 |
| **AUD-014** | Coverage floor in test runners ✅ | 🟡 Medium | XS | Now | — | §11.3 |
| **AUD-015** | Playwright E2E in CI + expand booking flows ✅ | 🟡 Medium | M | Now | — | §9.4, §11.4 |
| **AUD-016** | API idempotency-key on mutating endpoints | 🟡 Medium | M | Pre-deploy | — | §13.9 |
| **AUD-017** | Manifest module `safeParse` fail-soft ✅ | 🟡 Medium | S | Now | — | §8.6 |
| **AUD-018** | Pub/Sub ordering keys per booking (unblocked) | 🟡 Medium | S | Now | AUD-001 | §12.6 |
| **AUD-019** | DLQ replay runbook + endpoint + depth alert | 🟡 Medium | M | Pre-deploy | — | §12.7 |
| **AUD-020** | Slim the `Booking` aggregate (event-payload factories) | 🟡 Medium | M | Now | — | §5.3 |
| **AUD-021** | Edge-case tests: timezone/DST, money, idempotency replay | 🟡 Medium | M | Now | — | §11.8 |
| **AUD-022** | Contract tests at BFF↔backend seam | 🟡 Medium | M | Now | — | §11.5 |
| **AUD-023** | Runtime accessibility tests (axe) ✅ | 🟡 Medium | S | Now | — | §11.7 |
| **AUD-024** | CI efficiency: dedupe test runs, docker cache, trivy ✅ | 🟡 Medium | S | Now | — | §9.3, §9.6 |
| **AUD-025** | Public-image CDN delivery vs signed URLs | 🟡 Medium | S | Pre-deploy | — | §8.5 |
| **AUD-026** | Reconsider `BackendHttpService` request scope | 🟡 Medium | M | Now | — | §5.4 |
| **AUD-027** | Booking-lines diff-upsert (drop delete-all) ✅ | 🔵 Low | S | Now | — | §5.5 |
| **AUD-028** | Polish bundle (VO error mapping, default params, minor) | 🔵 Low | S | Now | — | §6, §8.7, §10.7 |
| **AUD-029** | Mutation testing on domain layer (Stryker) | 🔵 Low | S | Now | — | §11.9 |
| — | **DEFERRED TO INFRA/DEPLOY PHASE** ↓ | | | | | |
| **AUD-030** | DB connection pool + PgBouncer + SSL | 🔴 Critical | M | Infra/Deploy | — | §13.1 |
| **AUD-031** | Introduce Redis (unlocks 032/034/016/011) | 🟠 High | M | Infra/Deploy | — | §13.2 |
| **AUD-032** | Distributed rate limiting + trust proxy + per-tenant | 🟠 High | S | Infra/Deploy | AUD-031 | §13.2 |
| **AUD-033** | Readiness probe checks dependencies | ✅ Done | S | Infra/Deploy | M17-S04 | §13.3 |
| **AUD-034** | Wire OpenTelemetry tracing + metrics | 🟠 High | M | Infra/Deploy | — | §13.4 |
| **AUD-035** | LGPD / PII data-protection plan (design early) | 🟠 High | L | Pre-deploy | — | §13.5 |
| **AUD-036** | Resilience: retry/backoff + circuit breaker (BFF→backend) | 🟡 Medium | M | Infra/Deploy | — | §13.6 |
| **AUD-037** | Auth lifecycle: JWT revocation/refresh/rotation | 🟡 Medium | M | Infra/Deploy | AUD-031 | §13.7 |
| **AUD-038** | CD pipeline + migration job + IaC + DR | 🟡 Medium | L | Infra/Deploy | — | §13.8, §9.6 |
| **AUD-039** | SBOM generation + image signing (cosign) | 🟡 Medium | S | Infra/Deploy | — | §10.5 |
| **AUD-040** | Abuse/bot protection on public booking | 🟡 Medium | S | Infra/Deploy | AUD-032 | §13.10 |
| **AUD-041** | Load / throughput regression tests (k6) | 🟡 Medium | M | Infra/Deploy | AUD-030 | §11.6 |
| **AUD-042** | RUM / Core Web Vitals field monitoring | 🔵 Low | S | Infra/Deploy | — | §13.10 |
| **AUD-043** | Rename `apps/web/middleware.ts` → `proxy.ts` (Next.js 16 deprecation) | 🔵 Low | XS | Now | — | (not in original audit — found during AUD-007) |

### Suggested execution order (the critical path)

**Wave 1 (correctness foundation):** AUD-001 → AUD-002 → AUD-003 → AUD-004. *Do not reorder — 003 is the executable spec that proves 001/002, and 004 builds on the outbox.*
**Wave 2 (quick-win hardening, parallelizable):** AUD-005, AUD-006, AUD-007, AUD-008, AUD-012, AUD-014 (all XS/S, independent).
**Wave 3 (supply-chain + perf + cache):** AUD-009, AUD-010, AUD-011, AUD-013.
**Wave 4 (quality & depth):** AUD-015 → AUD-029 as capacity allows.
**Wave 5 (infra phase):** AUD-030 → AUD-042 when GCP infrastructure work begins; AUD-035 (LGPD) should be *designed* during Wave 1–2 even though implemented later.

---

## 2. Stories — P0 (Critical, do first)

### AUD-001 — Transactional outbox for all domain events
**Risk:** 🔴 Critical · **Effort:** L · **Phase:** Now · **Depends on:** — · **Audit ref:** `OPUS_AUDITORY.md` §4.1, §12.2, §12.3
**Status:** ✅ Done — `td/TD24-OUTBOX-INBOX-PATTERN.md` (TD24-S01 through S04)

**Implemented notes**
- `shared.outbox` (S01) — every aggregate-driven publish site writes an envelope row inside the same transaction as the state change, via `OUTBOX_PUBLISHER`/`IOutboxPublisher`; `OutboxRelayService`'s scheduled sweep (`SKIP LOCKED`, grace window) delivers unpublished rows to Pub/Sub, with an inline-dispatch fast path after commit.
- The 3 event-emitting aggregates' repositories (`Booking`/`Staff`/`Tenant`) auto-drain domain events inside `save()` (S02) — no use case writes a publish loop anymore.
- The 4 cron-published `Command` events + the loyalty re-emit (`ServicePointsEarned`, the exact §12.3 "worst case" this item called out) were migrated onto the same durable path, with deterministic `dedup_key`s for the crons and in-transaction publish for the loyalty re-emit (S03) — closing the crash-between-commit-and-publish window this item's audit finding described.
- `shared.inbox` (S04) generalizes consumer-side idempotency (replacing the ad-hoc `processed_events` tables this item's finding referenced).

#### What's wrong
Domain events are published to Pub/Sub **after** the DB transaction commits, in a separate step — a classic dual-write with no atomicity.
- Use cases: `apps/backend/src/contexts/booking/application/use-cases/approve-booking.use-case.ts:56-62` — `txManager.run(save)` then `for (e of booking.clearDomainEvents()) await eventBus.publish(e)`. Same shape in all 14 publishing use cases (booking ×10, staff ×3, platform provision-tenant).
- Cron/direct publishers are worse (no transaction at all): `booking-reminder.job.ts:70-101`, `admin-schedule-reminder.job.ts`, `notify-expiring-points.use-case.ts`.
- **Worst case (§12.3):** `record-loyalty-entries.use-case.ts:98-123` commits `markProcessed` inside the txn, then publishes `ServicePointsEarned` *after*. If the process dies between, the event is lost **and** redelivery short-circuits on `hasBeenProcessed` (line 67) so it can **never** re-publish — a permanently lost downstream event.

#### Why it matters (risk/impact)
A crash, SIGTERM (Cloud Run scale-down), or Pub/Sub blip between commit and publish **silently drops events**. Loyalty points, notifications, and reminders are driven *only* by these events, so a dropped `BookingCompleted`/`ServicePointsEarned` means the customer silently earns nothing and gets no email — with no error and no recovery. The consumer side is built for at-least-once (DLQ, idempotency), but the **producer side is at-most-once**, defeating all of it. For a product whose future is "a BI layer over collected data," silent event loss corrupts the source of truth.

#### What needs to be fixed (solution)
Implement the **transactional outbox** pattern:
1. Add an `outbox_events` table (shared or per-context) holding the full event envelope + `tenant_id`, `published_at TIMESTAMPTZ NULL`, `created_at`, indexed on `(published_at NULL) , created_at`.
2. Change the publish seam: instead of `eventBus.publish(e)` after the txn, **write event rows into `outbox_events` inside the same `txManager.run()`** as the aggregate save (and inside the same txn as `markProcessed` for consumer re-emits — fixes §12.3).
3. Add a **relay**: a poller (`setInterval`, or Postgres `LISTEN/NOTIFY`, or CDC later) that reads unpublished rows, publishes to Pub/Sub, marks `published_at`. At-least-once to the bus; consumers already dedupe by `eventId`.
4. Make the relay idempotent and crash-safe (claim rows with `FOR UPDATE SKIP LOCKED` if multi-instance).
5. Keep the `AggregateRoot.clearDomainEvents()` API — just route the flush into the outbox repo instead of the bus.

#### Acceptance criteria
- [x] No use case, cron, or consumer calls `eventBus.publish()` directly outside the relay; all emit via the outbox written in the same transaction as their state change.
- [x] `record-loyalty-entries` (now `complete-booking-loyalty-effects`) writes `ServicePointsEarned` to the outbox inside the same transaction as its inbox mark.
- [x] Relay publishes unsent rows and marks them; survives restart without duplicating (or duplicates are absorbed by consumer dedup).
- [x] Integration test: commit a state change, kill before relay runs, restart relay → event is delivered exactly once (see AUD-003).
- [x] Migration registered in `integration-global-setup.ts` in the same commit (per `CLAUDE.md §7`).

#### Affected areas
`shared/` (new outbox port + adapter + relay), every publishing use case, the cron jobs, `record-loyalty-entries`, new migration. This is the single highest-leverage change in the audit — it closes §4.1, §12.2, and §12.3 together.

#### Notes for the implementing agent
Respect the aggregate-driven event rule (`CLAUDE.md §7`): events are still recorded via `addDomainEvent()` in the aggregate; only the *flush target* changes. Keep `correlationId` from `RequestContext`/event, never regenerate. Consider whether the relay is a separate process or an in-app scheduled task for MVP (in-app is fine to start; design the table so a separate relay can take over later).

---

### AUD-002 — Fix booking slot-conflict race + prove optimistic locking
**Risk:** 🔴 Critical · **Effort:** M · **Phase:** Now · **Depends on:** — · **Audit ref:** §4.2, §4.3
**Status:** ✅ Done — fixed in `feat/td08-aud-002-booking-slot-race`

#### What's wrong
- **Slot race (§4.2):** `booking-slot-conflict.service.ts:18-34` reads approved bookings and checks overlap, but it's called *before* and *outside* the transaction (`approve-booking.use-case.ts:48-52`). Two concurrent approvals (or guest-create + approve) for overlapping times can both pass and both commit → **double-booking**. The `@VersionColumn` on `booking.entity.ts:117` only guards single-row lost-update, not the cross-row "no overlap" invariant.
- **Optimistic lock unproven (§4.3):** `typeorm-booking.repository.ts:215-258` builds a fresh `new BookingEntity()` and calls `manager.save()`. TypeORM's version check is reliable for *loaded* entities; for a detached hand-built entity it may resolve to an upsert that increments version without a version-guarded `WHERE`. Needs proof.

#### Why it matters (risk/impact)
Double-booking a physical service slot (one wash bay) is a real-world operational failure, not cosmetic — it surfaces directly to staff and customers. It is exactly the failure that appears under production concurrency and never in single-threaded tests.

#### What needs to be fixed (solution)
1. **Enforce no-overlap at the database** (preferred): add a Postgres exclusion constraint, e.g. `EXCLUDE USING gist (tenant_id WITH =, tstzrange(scheduled_at, scheduled_at + (total_duration_mins * interval '1 minute')) WITH &&) WHERE (status = 'APPROVED')`. The DB makes overlap impossible; the app catches the violation and maps it to `BookingSlotUnavailableError`.
   - *Alternative if a constraint is impractical:* `pg_advisory_xact_lock(hashtext(tenant_id || local_date))` at the top of the transaction, then re-check inside it.
2. **Move the conflict re-check inside the transaction** regardless of approach.
3. **Prove/repair the optimistic lock:** add a concurrency test (load twice, save both, assert second throws `OptimisticLockVersionMismatchError`); if it doesn't fire, switch to explicit `manager.update(BookingEntity, { id, tenantId, version }, …)` checking `affected === 1`.

#### Acceptance criteria
- [ ] Two concurrent approvals for the same/overlapping slot → exactly one succeeds, the other gets `BookingSlotUnavailableError` (test in AUD-003).
- [ ] Conflict check runs inside the transaction.
- [ ] Optimistic-lock behavior is asserted by a test (passes, or the write path is repaired so it does).
- [ ] Exclusion-constraint migration registered in `integration-global-setup.ts` same commit.

**Implemented notes**
- The write paths now re-check slot conflicts inside `txManager.run(...)`.
- Booking slot decisions are serialized per tenant/local day with `pg_advisory_xact_lock(...)` before the overlap check.
- Postgres now enforces approved-slot exclusivity via an exclusion constraint over `tstzrange(scheduled_at, scheduled_end_at, '[)')`.
- The booking repository now uses a version-guarded update for persisted bookings, and integration coverage asserts stale writes raise `OptimisticLockVersionMismatchError`.

#### Affected areas
`booking-slot-conflict.service.ts`, `approve-booking.use-case.ts`, `request-booking`/`request-authenticated-booking` (guest path can also create overlaps), `reschedule-booking.use-case.ts`, `typeorm-booking.repository.ts`, new migration, `booking-error.mapper.ts` (map the constraint violation).

#### Notes for the implementing agent
The exclusion constraint is the robust primitive — prefer it. Brazil tenants have no DST, but the range math must use the booking's UTC `scheduled_at`; keep it UTC end-to-end. Check every path that can create/approve/reschedule an APPROVED booking, not just `approve`.

---

### AUD-003 — Adversarial concurrency + event-failure test suite
**Risk:** 🔴 Critical · **Effort:** M · **Phase:** Now · **Depends on:** AUD-001, AUD-002 · **Audit ref:** §11.1, §11.2
**Status:** 🟡 4 of 5 scenarios done — see AUD-002 for its own concurrency proofs, TD24-S01–S05 for the outbox/inbox ones; DLQ routing (scenario 5) is out of TD24's scope

**Implemented notes** — cross-referencing the 5 scenarios this item lists:
1. **Concurrent approvals on one slot** — proven by AUD-002's own concurrency test (`typeorm-booking.repository.spec.ts`), not TD24.
2. **Stale write → optimistic-lock failure** — same, AUD-002.
3. **Crash-between-commit-and-publish, exactly-once delivery** — `typeorm-booking.repository.outbox-cutover.integration.spec.ts`'s `'crash-between-commit-and-publish: ...'` and `'two concurrent sweeps on the same booking-approval row (SKIP LOCKED) → exactly one Pub/Sub publish'` tests; `ServicePointsEarned` specifically covered by `complete-booking-loyalty-effects.use-case.integration.spec.ts`'s idempotency test (TD24-S03/S04).
4. **Duplicate delivery of the same eventId → exactly one effect** — `outbox-publisher.integration.spec.ts`'s `'is a no-op on a conflicting dedup_key — no new row, no dispatch for the losing attempt'` test (producer side); `send-booking-approved-notification.use-case.integration.spec.ts`'s `'two concurrent deliveries of the same eventId dispatch exactly once'` test against a real Postgres instance (consumer side, TD24-S05 atomic-claim follow-up).
5. **DLQ routing after max attempts** — out of TD24's scope; this is Pub/Sub subscription dead-letter policy, an M17 infra concern (see M17-S19's DLQ catalog, M17-S35's DLQ-depth alert). Not closed by this TD.

#### What's wrong
The two most dangerous code paths have **zero adversarial coverage**. Existing "slot conflict" specs test single-threaded math, not races. No test fires concurrent operations, asserts an optimistic-lock failure, or exercises event-delivery failure modes (publish-throws-after-commit, partial publish, duplicate delivery).

#### Why it matters (risk/impact)
The code most likely to corrupt production state is the code with no test. These tests are also the **executable specification** for AUD-001 and AUD-002 — write them alongside (ideally first).

#### What needs to be fixed (solution)
Add integration tests (Testcontainers, real Postgres):
1. **Concurrent approvals** on one slot via `Promise.all` → assert exactly one commits.
2. **Stale write** → assert optimistic-lock failure.
3. **Crash-between-commit-and-publish** → with the outbox: commit, run relay after a simulated restart, assert exactly-once delivery; assert `ServicePointsEarned` is *not* lost when `BookingCompleted` is redelivered.
4. **Duplicate delivery** of the same `eventId` → assert exactly one `LoyaltyEntry` and one email.
5. **DLQ routing** after max attempts.

#### Acceptance criteria
- [ ] All five scenarios above have passing integration tests — **4 of 5** (scenarios 1–4, see Implemented notes above); scenario 5 (DLQ routing) is out of TD24's scope, deferred to M17.
- [ ] Tests fail against the *current* code (proving they catch the bug) and pass after AUD-001/002 — not independently re-verified retroactively; the tests exist and pass now.
- [x] No `.skip`/`.only`, builders + in-memory doubles where applicable (`CLAUDE.md §7`) — verified across the referenced test files.

#### Notes for the implementing agent
These are the "write the test first" cases. Use unique inline tenant UUIDs for isolation (`CLAUDE.md §7`). For concurrency, real DB transactions are required — do not mock the repo.

---

## 3. Stories — P1 (High)

### AUD-004 — Event idempotency & duplicate-send prevention (crons + notifications)
**Risk:** 🟠 High · **Effort:** M · **Phase:** Now · **Depends on:** AUD-001 · **Audit ref:** §12.4, §12.5
**Status:** 🟡 Re-scoped, largely absorbed by TD24 (D5/D7/D15) — items 1 and 2 closed, item 3 remains open

**Implemented notes**
- **Item 1 (cron determinism)** — closed differently than proposed, same guarantee: instead of a deterministic `uuidv5` `eventId`, the 4 cron-published events became `Command`s with a real deterministic `dedup_key` (`<EventName>:<tenantId>:<bookingId|customerId>:<yyyy-mm-dd>`), enforced by `shared.outbox`'s `UNIQUE(dedup_key)` constraint — a scheduler retry or double-invocation within the window collapses to one outbox row (TD24-S01/S03, D5/D11).
- **Item 2 (notification crash/concurrent-delivery idempotency)** — closed via `shared.inbox`'s atomic claim protocol (`tryClaim`/`unclaim`) rather than a provider-level idempotency key: `BaseNotificationUseCase.dispatchTemplates()`/`dispatchTemplatesToMany()` claim the `(eventId, consumerName)` pair *before* dispatching, so two concurrent redeliveries can't both send — only one ever wins the claim (TD24-S04/S05, D15; proven against real Postgres in `send-booking-approved-notification.use-case.integration.spec.ts`).
- **Item 3 (multi-recipient partial-failure tracking) — NOT closed.** `dispatchTemplatesToMany()` still wraps the whole recipient batch in one `Promise.all` — if any one recipient's dispatch fails, the claim is released (`unclaim`) and a retry re-sends to *every* recipient in the batch, including the ones that already succeeded. This is a real, still-open gap; fixing it means tracking per-recipient success/failure instead of an all-or-nothing `Promise.all`. Left open — no story currently owns it.

#### What's wrong
- **Cron reminders (§12.4):** `booking-reminder.job.ts` mints a new `eventId` per run and self-gates on a local `06:00–06:29` window (lines 13-14, 30). There is **no per-(booking, reminderType, date) sent-marker**, and the consumer dedups on `eventId` — so a scheduler retry or a second invocation inside the window → **duplicate reminder emails**.
- **Notifications (§12.5):** `base-notification.use-case.ts:94-107` dispatches the email **then** marks processed. Crash-between, concurrent delivery, or `Promise.all` partial failure in `dispatchTemplatesToMany` (`:134-145`) all cause **duplicate sends** (the multi-recipient path re-sends to everyone on retry).

#### Why it matters (risk/impact)
Duplicate booking confirmations and daily reminders to customers/staff are a visible, trust-eroding UX problem at worldwide scale — and SMTP/dispatch is not idempotent, so the duplicates are real emails.

#### What needs to be fixed (solution)
1. **Cron determinism:** make reminder `eventId` deterministic — `uuidv5(bookingId + reminderType + localDate)` — so the existing consumer dedup absorbs re-runs. (Smaller change than a new sent-marker table, reuses `processed_events`.)
2. **Notification provider idempotency:** pass a provider-level idempotency key derived from `(eventId, notificationType, channel, recipient)` to the dispatcher; most ESPs honor it.
3. **Multi-recipient partial failure:** track per-recipient success so a retry only re-sends the failures (don't `Promise.all`-reject the whole batch and re-send all).

#### Acceptance criteria
- [x] Re-running the reminder cron twice in a window produces no duplicate reminders — via deterministic `dedup_key` + `shared.outbox`'s `UNIQUE` constraint, not a new sent-marker table as originally proposed (item 1, see Implemented notes above).
- [x] Concurrent delivery of one notification event → at most one email per recipient — via `shared.inbox`'s atomic claim (item 2); proven against real Postgres in `send-booking-approved-notification.use-case.integration.spec.ts`.
- [ ] Multi-recipient send with one failing recipient → on retry, only the failed recipient is re-emailed — **still open** (item 3, see Implemented notes above): `dispatchTemplatesToMany` remains all-or-nothing.

#### Affected areas
`booking-reminder.job.ts`, `admin-schedule-reminder.job.ts`, `base-notification.use-case.ts`, the dispatcher port/adapter, notification `processed_events` usage.

---

### AUD-005 — Graceful shutdown hooks (backend + BFF)
**Risk:** 🟠 High · **Effort:** XS · **Phase:** Now · **Depends on:** — · **Audit ref:** §5.2
**Status:** ✅ Done

#### What's wrong
`apps/backend/src/main.ts` (and BFF `main.ts`) call `app.listen()` without `app.enableShutdownHooks()`. So `OnModuleDestroy` (Pub/Sub `subscription.close()` in `gcp-pubsub-event-bus.adapter.ts:77`) never fires on SIGTERM.

#### Why it matters (risk/impact)
On Cloud Run scale-in, subscriptions aren't closed cleanly, in-flight handlers are torn down mid-execution, and the HTTP server doesn't drain — amplifying the event-loss window and causing redundant redeliveries.

#### What needs to be fixed (solution)
Add `app.enableShutdownHooks()` in both bootstraps; ensure SIGTERM drains the HTTP server before exit. Verify the Pub/Sub adapter's `onModuleDestroy` actually runs on shutdown.

#### Acceptance criteria
- [ ] Both apps call `enableShutdownHooks()`.
- [ ] On SIGTERM, Pub/Sub subscriptions close and the server stops accepting new requests before exit (manually verifiable via logs).

---

### AUD-006 — Helmet / security headers on BFF
**Risk:** 🟠 High · **Effort:** XS · **Phase:** Now · **Depends on:** — · **Audit ref:** §5.6
**Status:** ✅ Done

#### What's wrong
`apps/bff/src/main.ts` sets CORS + body limits but no `helmet()` — the public-facing API ships no security headers (HSTS, `X-Content-Type-Options`, frame options, etc.).

#### What needs to be fixed (solution)
Add `helmet()` to the BFF bootstrap. Tune as needed (the BFF serves JSON, so defaults are largely fine).

#### Acceptance criteria
- [x] `helmet()` is applied; responses carry standard security headers (verify with a request).

---

### AUD-007 — CSP + security headers across apps/web
**Risk:** 🟠 High · **Effort:** S · **Phase:** Now · **Depends on:** — · **Audit ref:** §8.3
**Status:** ✅ Done

#### What's wrong
`apps/web/next.config.ts` defines no `headers()` and `middleware.ts` sets none either — every route in `apps/web` (public hotsite `app/[slug]/`, authenticated `app/dashboard/`, authenticated customer `my-account`) ships with no CSP, HSTS, `frame-ancestors`, `X-Content-Type-Options`, or `Referrer-Policy`. The public hotsite is the sharper edge (renders tenant markdown, tenant image URLs, an inline JSON-LD `<script>`), but the gap is app-wide, not hotsite-only.

#### Why it matters (risk/impact)
XSS is mitigated at the React layer (`rehype-sanitize`, JSON-LD `<` escaping) and there is no `dangerouslySetInnerHTML` anywhere in `apps/web`, but CSP is the defense-in-depth that catches the *next* injection bug plus clickjacking. Scoping the fix to hotsite only would leave the authenticated dashboard/customer surfaces — which also render tenant- and customer-supplied text — without the same backstop, for no real savings in effort.

#### What needs to be fixed (solution)
Extend `middleware.ts` (which already runs on every non-`api`/`_next`/favicon path via its existing matcher, and already branches on `pathname` for the staff/customer auth checks) to also set CSP + security headers on every response:
- **Baseline policy (all routes):** HSTS, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`, `style-src 'self' 'unsafe-inline'` (inline `style={{}}` props appear repo-wide — e.g. `shells/dashboard/components/BottomNav.tsx`'s `env(safe-area-inset-bottom, 0)` — and CSP nonces don't apply to inline `style` attributes at all, only to `<script>`/`<style>` elements), `script-src 'self' 'unsafe-inline'` on every route (see rationale below — this is **not** hotsite-only), `connect-src 'self' <NEXT_PUBLIC_BFF_URL origin>` (both the dashboard/customer `bffClient` hooks **and** the public guest-booking client components — `BookingForm.tsx`, `SlotPicker.tsx`, `AvailabilityCarousel.tsx` — call the BFF origin directly from the browser; a same-origin-only `connect-src` breaks the entire guest booking flow, not just an API call), `img-src 'self' blob: <NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL origin>` (dashboard's booking-photo review — `BookingDetailMain.tsx`, `MarkCompleteBookingPage.tsx` — uses raw `<img src={signedUrl}>`, not `next/image`, and both dashboard and public photo upload — `AfterServicePhotoUpload.tsx`, `PhotoUpload.tsx` — preview via `URL.createObjectURL()`/`blob:`, so this needs to be baseline; the storage-origin env var covers both public hotsite images and signed booking-photo URLs since they're the same GCS/S3-compatible backend).
- **Hotsite-only relaxation (`app/[slug]/` tree — home, `/booking`, `/login`, `/my-account`):** `frame-src https://maps.google.com` for `ContactModule.tsx`'s address-map `<iframe>` (baseline elsewhere is `frame-src 'none'`, this is the only `<iframe>` in the app).
- **Why `script-src 'unsafe-inline'` is universal, not just a hotsite carve-out for the JSON-LD script:** Next.js injects its own inline hydration/RSC-payload `<script>` tags into **every** server-rendered page, not just the hotsite's `JsonLdScript.tsx`. Live-browser verification (Playwright against a running dev stack) confirmed real CSP violations blocking `/dashboard/login` once `'unsafe-inline'` was scoped to hotsite only — dashboard has no *developer-authored* inline script, but Next's own internal ones still need the same allowance. A per-request nonce was considered for both cases: the hotsite home page is ISR-cached (`export const revalidate = 300`, documented in `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`) and meant to be CDN-cacheable in a future deploy, so a nonce there would require reading `headers()`, forcing the route dynamic and silently disabling that cache (the same class of problem that doc already documents for `cookies()`); dashboard/auth/customer routes aren't provably dynamic either (most don't call `cookies()`/`headers()` in their own render tree), so a nonce there risks the identical staleness bug without auditing every route's rendering mode — a much bigger undertaking than this story's scope. A hash-based exception doesn't work for the hotsite case since the JSON-LD content is per-tenant and can't be known by `middleware.ts` (which runs pre-render) without a precomputed hash store (KV/Redis, keyed by slug, refreshed on publish) — real infrastructure beyond this story; worth a follow-up TD item if stronger script-src protection is wanted later. `'unsafe-inline'` universally is the pragmatic, verified-working baseline instead.
- **Dev-mode carve-out:** `script-src` gets `'unsafe-eval'`, `connect-src` gets the HMR websocket origin, when `NODE_ENV !== 'production'` — or `pnpm dev` breaks under the new policy.
- Ships enforcing (`Content-Security-Policy`, not `-Report-Only`) — no live prod traffic yet at this phase, nothing to hedge against.
- `apps/bff` is a separate service and already covered by **AUD-006** (helmet) — out of scope here.

#### Acceptance criteria
- [x] All `apps/web` responses (hotsite, dashboard, customer `my-account`) carry HSTS/nosniff/referrer-policy/frame-ancestors. Verified via `curl -D-` against a running dev stack.
- [x] Hotsite responses additionally carry a CSP that permits the JSON-LD script, tenant images, and the Google Maps iframe; dashboard responses do not relax `frame-src`.
- [x] `connect-src`/`img-src` allow the configured BFF origin and storage origin (plus `blob:`) on every route group.
- [x] The guest booking flow (service selection step) renders and loads services from the BFF end-to-end in a real headless-browser check — not just a `middleware.spec.ts` unit-test pass.
- [x] The hotsite page and a dashboard page were loaded in a real browser (Playwright) with zero CSP console violations after the `script-src` fix above; `frame-src` origin for the Maps iframe verified to not redirect cross-origin.
- [x] `pnpm dev` still works — the entire live browser verification above ran against `pnpm --filter @ikaro/web dev` (Turbopack), which serves the dev-mode CSP (`'unsafe-eval'` + `ws://localhost:*`) and rendered every page correctly; HMR's websocket reconnect specifically wasn't exercised (no file edit was made while the dev server was running against a loaded page).

#### Affected areas
`middleware.ts` (CSP + header injection, branching on route group).

---

### AUD-008 — Isolate BFF HTTP-client auth state (`client-only` guard) ✅
**Risk:** 🟠 High (latent) · **Effort:** XS · **Phase:** Now (before dashboard) · **Depends on:** — · **Audit ref:** §8.4
**Status:** ✅ Done

#### What's wrong
`apps/web/lib/api/bff-client.ts` holds `_token`/`_tenantId`/`_tenantSlug` in **module scope** (set via `configureBffClient`). In a Node server process, module scope is shared across all concurrent requests — if a dashboard fetcher is ever called from a Server Component, two users race on `_token` → cross-tenant token leak. Currently latent (dashboard is a client-rendered stub), but a loaded gun.

#### What needs to be fixed (solution)
Either (a) add `import 'client-only'` at the top of `bff-client.ts` so any accidental Server-Component import fails the build, or (b) make the client per-call/per-request (pass token in, or read `cookies()` in each server fetcher and build a request-scoped client). Given the React Query direction, (a) is the cheap lock. Document the rule in `CLAUDE.md`.

#### Acceptance criteria
- [x] `bff-client.ts` cannot be imported into a Server Component (build fails if attempted), OR the client no longer holds cross-request mutable auth state.
- [x] A short note added to `CLAUDE.md` codifying the rule (with permission per §0).

---

### AUD-009 — Supply-chain CI hardening ✅ Done

**Risk:** 🟠 High · **Effort:** M · **Phase:** Now · **Depends on:** — · **Audit ref:** §9.1, §9.2, §9.5, §10.1, §10.2, §10.3
**Status:** ✅ Done

#### What's wrong
- Third-party actions pinned to `@master` (`sonarcloud-github-action`, `trivy-action`, `checkov-action`, `snyk/actions/node`) run in CI with `SONAR_TOKEN`/`SNYK_TOKEN`/`GITHUB_TOKEN` — arbitrary upstream code execution (§9.1/§10.3).
- No `concurrency:` group on PR workflows → redundant overlapping runs (§9.2).
- No least-privilege `permissions:` on most workflows (§9.5).
- No Dependabot/Renovate (§10.1).
- Base images on floating `node:22-alpine` tags, not digests (§10.2).

#### What needs to be fixed (solution)
1. Pin every third-party action to a **full commit SHA** (comment the version).
2. Add `.github/dependabot.yml` for `npm` (grouped weekly), `docker`, and `github-actions` ecosystems.
3. Add `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` to each PR workflow.
4. Add `permissions: { contents: read }` at the top of each workflow (elevate per-job where needed).
5. Pin Dockerfile base images to `node:22-alpine@sha256:<digest>` (builder + runner).

#### Acceptance criteria
- [ ] No `@master` (or floating major) third-party action remains; all on SHAs.
- [ ] Dependabot config covers all three ecosystems.
- [ ] PR workflows cancel superseded runs.
- [ ] Default token scope is `contents: read` unless a job needs more.
- [ ] Dockerfiles pin base image digests.

#### Affected areas
`.github/workflows/*.yml`, new `.github/dependabot.yml`, all three `Dockerfile`s.

---

### AUD-010 — Fix the brittle `multer` override (real CVE)
**Risk:** 🟠 High · **Effort:** S · **Phase:** Now · **Depends on:** — · **Audit ref:** §10.6
**Status:** ✅ Done

#### What's wrong
`pnpm-workspace.yaml` pins `multer 2.2.0` via `overrides`, yet both `apps/backend/Dockerfile` and `apps/bff/Dockerfile` still `rm -rf /standalone/node_modules/.pnpm/multer@2.1.1` after deploy. That means a vulnerable `multer 2.1.1` still resolves into the tree and is only kept out by a hardcoded path string — a future bump silently breaks the `rm` and re-ships the CVE.

#### What needs to be fixed (solution)
Run `pnpm why multer` to find the path that still resolves `2.1.1`; fix the override (or the offending dependency) so the tree dedupes to a single safe version; remove the brittle `rm` lines.

#### Acceptance criteria
- [x] `pnpm why multer` shows only the safe version.
- [x] The `rm -rf …multer@2.1.1` lines are removed from both Dockerfiles.
- [ ] Trivy scan stays clean (verified in CI).

---

### AUD-011 — Tenant-settings cache (in-memory LRU + TTL)
**Risk:** 🟡 Medium · **Effort:** S · **Phase:** Now · **Depends on:** — · **Audit ref:** §5.1
**Status:** ✅ Done

#### What's wrong
Every request loads tenant settings from the DB at least twice — `request.interceptor.ts:49` then again in each repository read (`typeorm-booking.repository.ts:38,69,109`; `typeorm-service.repository.ts:25,32,39`) — via `PlatformTenantSettingsAdapter` → `GetTenantByIdUseCase` → raw `findById`. No cache.

#### Why it matters (risk/impact)
Avoidable, repeated load on the hot `tenants` table on the critical path of every authenticated request — a real cost at scale.

#### What needs to be fixed (solution)
Put a shared cache port behind a `CachingTenantRepository` decorator in front of `TypeOrmTenantRepository`: use Nest's cache-manager stack for an in-memory LRU-style cache with a short TTL (30–60s) keyed by `tenantId`. (A distributed Redis cache is AUD-031, deferred — in-memory is fine now and still a big win per instance.) Invalidate the tenant entry on `save(tenant)` and keep the existing port path for cron/event contexts (no `RequestContext` there).

#### Acceptance criteria
- [x] Repeated settings reads within the TTL hit the cache, not the DB (verify via a spy/integration assertion).
- [x] Settings update is reflected within the TTL (or eagerly invalidated).
- [x] Cron/event-handler paths still resolve settings correctly.

---

### AUD-012 — Prototype-pollution guard in `deepMerge`
**Risk:** 🟡 Medium · **Effort:** XS · **Phase:** Now · **Depends on:** — · **Audit ref:** §5.7
**Status:** ✅ Done

#### What's wrong
`shared/utils/deep-merge.ts` merges admin-supplied settings JSON (`override`) into base settings via the `deepmerge` library, trusting its internals on a user-controlled merge (UC-026 makes settings admin-editable).

#### What needs to be fixed (solution)
Add an explicit guard that strips/rejects `__proto__`, `constructor`, and `prototype` keys from `override` before merging; add a unit test with a malicious payload.

#### Acceptance criteria
- [x] A merge with `__proto__`/`constructor`/`prototype` keys does not pollute `Object.prototype` (test).

---

## 4. Stories — P2 (Medium)

### AUD-013 — Per-tenant font loading (LCP)
**Risk:** 🟡 Medium · **Effort:** S · **Phase:** Now · **Audit ref:** §8.1
**Status:** ✅ Done

**What's wrong:** `lib/hotsite/font-config.ts` instantiates 8 Google font families and `[slug]/layout.tsx:38` attaches all of `FONT_VARIABLES` to the root, so Next preloads all 8 (several with multiple weights) on every hotsite — but each tenant uses only `headingFontFamily` + `bodyFontFamily`. Direct LCP regression on the highest-conversion page.
**Fix:** Load only the 1–2 fonts the tenant's branding selects (dynamic map keyed by branding), or set `preload: false` on non-selected families.
**Acceptance:** ✅ A rendered hotsite preloads only the tenant's selected fonts; verify via the emitted `<link rel=preload>` set / Lighthouse.

### AUD-014 — Coverage floor in test runners
**Risk:** 🟡 Medium · **Effort:** XS · **Phase:** Now · **Audit ref:** §11.3
**Status:** ✅ Done

**What's wrong:** Neither `apps/backend/jest.config.ts` (`coverageThreshold` absent) nor `apps/web/vitest.config.ts` (`coverage.thresholds` absent) sets a floor — SonarCloud's differential gate is the only enforcement, so global decay is invisible.
**Fix:** Add a `coverageThreshold`/`thresholds` block (e.g. 80/75/80/80) to jest and vitest (and BFF jest). Tune to current levels so it doesn't break the build, then ratchet up.
**Acceptance:** ✅ Test runners fail locally/CI if coverage drops below the floor.

### AUD-015 — Playwright E2E in CI + expand booking flows
**Risk:** 🟡 Medium · **Effort:** M · **Phase:** Now · **Audit ref:** §9.4, §11.4
**Status:** ✅ Done

**What's wrong:** Playwright suite exists but no workflow runs it; `guest-booking.spec.ts` is one 37-line golden path. The revenue flow has no coverage of validation errors, required-pickup-address, authenticated booking (UC-002), slot-becomes-unavailable mid-flow, photo upload, back-navigation, or login/tenant-selection (UC-021/022/023).
**Fix:** Add a Playwright CI job (sharded or nightly + on-PR smoke). Expand specs to the error/edge branches and auth/tenant journeys. Selector rule: assert translated text as content, never use it as the selector (`CLAUDE.md`).
**Acceptance:** ☐ A Playwright job runs in CI on PRs; booking error/edge branches and auth flows are covered.

### AUD-016 — API idempotency-key on mutating endpoints
**Risk:** 🟡 Medium · **Effort:** M · **Phase:** Pre-deploy · **Audit ref:** §13.9
**Status:** ☐ Not started

**What's wrong:** No `Idempotency-Key` handling on `POST /bookings` (or other mutations). A guest double-click or a retried POST creates duplicate bookings (distinct from the §4.2 slot race — this is request-level duplication).
**Fix:** Accept a client-supplied `Idempotency-Key`, persist first-seen key→result, return the original result on replay. Storage can be the DB now (or Redis once AUD-031 lands).
**Acceptance:** ☐ Replaying a POST with the same idempotency key returns the original result without creating a second booking.
**Note:** App-code change, so do it pre-deploy even though related infra (Redis) is deferred.

### AUD-017 — Manifest module `safeParse` fail-soft
**Risk:** 🟡 Medium · **Effort:** S · **Phase:** Now · **Audit ref:** §8.6
**Status:** ✅ Done

**What's wrong:** `app/[slug]/page.tsx` pre-filters with `isValidModuleData` then calls `Schema.parse()` in render; if they diverge, `.parse()` throws and the whole hotsite 500s instead of dropping one section.
**Fix:** Use `safeParse` per module; silently skip any failing module so one bad section cannot 500 the page.
**Acceptance:** ✅ A malformed module is silently skipped from the render plan — the rest of the hotsite renders normally, not a 500-page (test).

### AUD-018 — Pub/Sub ordering keys per booking
**Risk:** 🟡 Medium · **Effort:** S · **Phase:** Now · **Depends on:** AUD-001 · **Audit ref:** §12.6
**Status:** ☐ Not started — dependency (AUD-001) now satisfied, unblocked. Explicitly out of scope for TD24 itself (`td/TD24-OUTBOX-INBOX-PATTERN.md` §Non-Goals: "No Pub/Sub ordering keys — TD08 AUD-018, separate follow-up. Relay is `SKIP LOCKED`, out-of-order-safe like today."). Remains a genuine open item for whoever picks it up next.

**What's wrong:** `gcp-pubsub-event-bus.adapter.ts` publishes with no `orderingKey`; a fast approve→reschedule/complete sequence can be consumed out of order (e.g. "approved" email after "completed").
**Fix:** Publish booking-related events with `orderingKey = bookingId` and enable ordered delivery on those subscriptions. Accept the per-key throughput tradeoff.
**Acceptance:** ☐ Events for one booking are delivered in publish order.

### AUD-019 — DLQ replay runbook + endpoint + depth alert
**Risk:** 🟡 Medium · **Effort:** M · **Phase:** Pre-deploy · **Audit ref:** §12.7
**Status:** ☐ Not started

**What's wrong:** `dead-letter.handler.ts` only logs; dead-lettered events have no path back into processing — recovery is a manual DB/Pub/Sub exercise.
**Fix:** A guarded admin/cron endpoint to re-drive DLQ messages (re-publish to the original topic) after a fix is deployed; alert on DLQ depth; at least one test that drives an event to the DLQ and replays it.
**Acceptance:** ☐ A DLQ'd event can be replayed through a guarded endpoint and is processed idempotently; DLQ depth is observable.

### AUD-020 — Slim the `Booking` aggregate (event-payload factories)
**Risk:** 🟡 Medium · **Effort:** M · **Phase:** Now · **Audit ref:** §5.3
**Status:** ☐ Not started

**What's wrong:** `booking.aggregate.ts` is 615 lines (largest source file), well over the project's ≤200-line class rule, mostly inline event-payload serialization (`lineSummaryPayload`, `toAddressPayload`, large literal payloads in `complete()`/`approve()`).
**Fix:** Extract event-payload assembly into dedicated factories/mappers (`BookingEventPayloadFactory`), leaving the aggregate with state-transition logic.
**Acceptance:** ☐ `Booking` aggregate ≤ ~200 lines; event payloads built by a separate, unit-tested factory; behavior unchanged (tests green).

### AUD-021 — Edge-case tests: timezone/DST, money, idempotency replay
**Risk:** 🟡 Medium · **Effort:** M · **Phase:** Now · **Audit ref:** §11.8
**Status:** ☐ Not started

**What's wrong:** Thin edge coverage in time/money/idempotency. Notably no DST-boundary tests for non-Brazil tenants, no cancellation-window exact-boundary test, no money-precision-at-rounding test, no explicit idempotency-replay assertion. Customer & Notification contexts are integration-light (3 specs each vs booking's 10).
**Fix:** Add cases for DST transitions in availability/slot math, the 48h cancellation exact boundary, summing many money lines at the `numeric(10,2)` boundary, and same-`eventId`-twice → one effect. Add integration coverage for notification senders (template render, idempotency, delivery-channel failure).
**Acceptance:** ☐ The above edge cases have tests; notification/customer integration coverage raised.

### AUD-022 — Contract tests at BFF↔backend seam
**Risk:** 🟡 Medium · **Effort:** M · **Phase:** Now · **Audit ref:** §11.5
**Status:** ☐ Not started

**What's wrong:** BFF component tests mock the backend; backend tests don't know the BFF. `@ikaro/types` shares compile-time shape but nothing catches runtime drift (a backend mapping diverging from the typed contract, especially the Problem-Details envelope and money/date shapes).
**Fix:** Consumer-driven contract tests (Pact), or lighter: shared response-shape fixtures validated on both sides (backend asserts it produces them; BFF asserts it consumes them).
**Acceptance:** ☐ A contract/fixture suite fails if backend response shapes drift from BFF expectations.

### AUD-023 — Runtime accessibility tests (axe)
**Risk:** 🟡 Medium · **Effort:** S · **Phase:** Now · **Audit ref:** §11.7
**Status:** ✅ Done

**What's wrong:** `eslint-plugin-jsx-a11y` is static only; no `jest-axe`/axe-core in component specs and no Playwright a11y scan. The branding contrast math (`apply-branding.ts`) is computed but not test-verified.
**Fix:** Add `jest-axe` assertions to hotsite module-component specs and an axe scan to the booking E2E; assert contrast-derivation against known good/bad color pairs.
**Acceptance:** ☐ Module components pass axe checks; contrast logic has explicit assertions.

### AUD-024 — CI efficiency: dedupe test runs, docker cache, trivy
**Risk:** 🟡 Medium · **Effort:** S · **Phase:** Now · **Audit ref:** §9.3, §9.6
**Status:** ✅ Done — PR #46

**What's wrong:** Backend/bff/web coverage suites run **twice** per PR (test gate + Sonar job). No Docker layer caching (3 images built from scratch). `trivy ignore-unfixed: true` ships unpatched vulns silently. Node/pnpm versions drift between root `engines` and CI.
**Fix:** Generate coverage once, pass via artifacts to the Sonar job. Add `buildx` + `cache-from: type=gha` to image builds. Track unfixed-vuln exceptions on a schedule. Pin node/pnpm once (`.nvmrc` + `packageManager`).
**Acceptance:** ✅ Each coverage suite runs once per PR; Docker builds use layer cache; versions are single-sourced.

### AUD-025 — Public-image CDN delivery vs signed URLs
**Risk:** 🟡 Medium · **Effort:** S · **Phase:** Pre-deploy · **Audit ref:** §8.5
**Status:** ☐ Not started

**What's wrong:** Public hotsite images (hero/gallery/about) appear to use per-request signed URLs (`generateHotsiteImageSignedUrl`), which defeat Next/CDN image caching (URL changes each request). Signed URLs are correct only for *private* booking photos.
**Fix:** Serve public hotsite images from a public, CDN-backed bucket with stable URLs; reserve signed URLs for private/after-service photos. Confirm which path gallery/hero use first.
**Acceptance:** ☐ Public hotsite images use stable, cacheable URLs; private photos remain signed.

### AUD-026 — Reconsider `BackendHttpService` request scope
**Risk:** 🟡 Medium · **Effort:** M · **Phase:** Now (measure first) · **Audit ref:** §5.4
**Status:** ☐ Not started

**What's wrong:** `backend-http.service.ts` is `Scope.REQUEST`, which bubbles request scope to consuming controllers/modules → per-request instantiation of a chunk of the BFF DI graph at high RPS.
**Fix:** Make it a singleton that reads request headers from an `AsyncLocalStorage` correlation context (like the backend) or takes them per-call. **Measure** the actual overhead before investing.
**Acceptance:** ☐ Either a benchmark shows it's negligible (close with a note), or the hot client is no longer request-scoped.

---

## 5. Stories — P3 (Low / Polish)

### AUD-027 — Booking-lines diff-upsert (drop delete-all)
**Risk:** 🔵 Low · **Effort:** S · **Phase:** Now · **Audit ref:** §5.5
**What's wrong:** `typeorm-booking.repository.ts:122-131` deletes all lines and re-inserts on every modifying save — write amplification, index churn, discards line identity.
**Fix:** Diff-and-upsert (insert new, update changed, delete removed) when justified. Low urgency at MVP volumes.
**Acceptance:** ☑ Line saves no longer delete-all unless the line set actually changed.

### AUD-028 — Polish bundle (VO error mapping, default params, minor notes)
**Risk:** 🔵 Low · **Effort:** S · **Phase:** Now · **Audit ref:** §6, §8.7, §10.7
**What's wrong:** Assorted: `Money` VO throws plain `Error` (`money.ts:18,23,41`) — confirm every error mapper maps it to 400 not 500; middleware auth gate only checks cookie presence (fine, document it); error-detail leakage check on 4xx; `.npmrc` registry pin; `ENABLE_DEV_AUTH` hard-fail in prod (also see AUD-037).
**Fix:** Address each as a small cleanup; add `instanceof` branches / typed VO errors where missing.
**Acceptance:** ☐ Each sub-item resolved or consciously deferred with a note.

### AUD-029 — Mutation testing on domain layer (Stryker)
**Risk:** 🔵 Low · **Effort:** S · **Phase:** Now · **Audit ref:** §11.9
**What's wrong:** Coverage % proves lines ran, not that assertions catch regressions.
**Fix:** Periodic Stryker run on aggregates/VOs/availability service (occasional, not per-PR) to surface assertion-free coverage.
**Acceptance:** ☐ A Stryker config exists and a baseline mutation score is recorded.

---

## 6. Stories — DEFERRED (Infra / Deploy phase)

> ⏸️ Per `OPUS_AUDITORY.md §13` deferral banner: these are addressed when the GCP infrastructure is stood up. Severity badges reflect production impact, not current urgency. **Exception:** AUD-035 (LGPD) should be *designed* during P0/P1 even if implemented here.

### AUD-030 — DB connection pool + PgBouncer + SSL
**Risk:** 🔴 Critical (in prod) · **Effort:** M · **Phase:** Infra/Deploy · **Audit ref:** §13.1
**What's wrong:** `TypeOrmModule.forRootAsync` (`app.module.ts`) sets no `extra.max`/`poolSize`/`ssl`; node-postgres defaults to 10 conns/instance → `~10×N` connections exhaust Postgres (~100 max) at ~10 instances during a spike.
**Fix:** Explicit small per-instance pool (`extra:{max:5}`), PgBouncer/Cloud SQL pooler, cap Cloud Run `max-instances` so `max×poolSize < Postgres max × safety`, enable `ssl`. Load-test to the cap (AUD-041).
**Acceptance:** ☐ Pool sized + pooler in place + SSL on; sustained load at instance cap doesn't exhaust DB connections.

### AUD-031 — Introduce Redis
**Risk:** 🟠 High (enabler) · **Effort:** M · **Phase:** Infra/Deploy · **Audit ref:** §13.2 (and unlocks AUD-011 dist, AUD-016, AUD-032, AUD-034)
**What's wrong:** No shared cache/coordination layer exists; rate limiting, settings cache, token revocation, and API idempotency all need one.
**Fix:** Provision managed Redis (Memorystore); add a cache/store abstraction. This is the keystone that unblocks several deferred stories.
**Acceptance:** ☐ Redis reachable from backend/BFF; a thin port/adapter exists for cache + atomic counters.

### AUD-032 — Distributed rate limiting + trust proxy + per-tenant
**Risk:** 🟠 High · **Effort:** S · **Phase:** Infra/Deploy · **Depends on:** AUD-031 · **Audit ref:** §13.2
**What's wrong:** `ThrottlerModule.forRoot` (BFF `app.module.ts`) uses the in-memory store (per-instance counters → ineffective across instances); BFF `main.ts` doesn't set `trust proxy` (IP keying is wrong behind the LB); no per-tenant limit.
**Fix:** `@nest-lab/throttler-storage-redis`, `app.set('trust proxy', …)` keying on real client IP, add a per-tenant tier.
**Acceptance:** ☐ Rate limits hold across instances; per-tenant throttling works; correct client IP is used.

### AUD-033 — Readiness probe checks dependencies
**Status:** ✅ Resolved by **M17-S04 — Real readiness checks (`/health/ready`) on all 3 services**

**What changed:** Backend `/health/ready` now performs a real database readiness check via Terminus/TypeORM, BFF `/health/ready` chains to backend `/health/ready`, and web `/api/health/ready` chains to BFF `/health/ready`. `/health/live` remains shallow on all services.

**Why Pub/Sub is intentionally excluded:** In the current Cloud Run architecture, readiness gates the synchronous REST serving path (`web → BFF → backend → Postgres`). Pub/Sub is an asynchronous integration path, not a prerequisite for serving normal HTTP requests, so it should not take instances out of rotation for readiness/startup purposes.

**Acceptance:** ☑ `/ready` fails when the serving dependency chain is unavailable; `/live` remains unaffected.

### AUD-034 — Wire OpenTelemetry tracing + metrics
**Risk:** 🟠 High · **Effort:** M · **Phase:** Infra/Deploy · **Audit ref:** §13.4
**What's wrong:** OTel/Prometheus/Grafana/Loki are documented but `packages/observability` exports only a logger; no `NodeSDK`/instrumentation/exporter anywhere. No distributed tracing or app metrics.
**Fix:** Initialize the OTel Node SDK (auto-instrument HTTP/PG/Pub/Sub) with an OTLP exporter to the Collector; emit metrics for handler latency, Pub/Sub backlog + DLQ depth (AUD-019), DB pool utilization (AUD-030), per-tenant request rates.
**Acceptance:** ☐ A request produces an end-to-end trace BFF→backend→Pub/Sub→consumer; key metrics are scraped.

### AUD-035 — LGPD / PII data-protection plan
**Risk:** 🟠 High (compliance) · **Effort:** L · **Phase:** Pre-deploy (design early) · **Audit ref:** §13.5
**What's wrong:** Raw PII (`contactEmail`/`contactName`/`contactPhone`/addresses) flows through events → the enriched `dead-letter` topic → logs; photos in GCS; loyalty entries append-only. No scrubbing, retention, encryption, or erasure workflow — a Brazil/LGPD liability.
**Fix:** PII inventory + plan: minimize PII in event payloads (reference IDs or field-level encryption), set DLQ + log/notification retention/TTL, scrub PII from logs, encrypt sensitive columns at rest, design an erasure/anonymization workflow respecting append-only invariants, list sub-processors.
**Acceptance:** ☐ A documented PII map + retention + erasure design; high-risk leaks (DLQ/logs) mitigated. *Design during Wave 1–2; implement here.*

### AUD-036 — Resilience: retry/backoff + circuit breaker (BFF→backend)
**Risk:** 🟡 Medium · **Effort:** M · **Phase:** Infra/Deploy · **Audit ref:** §13.6
**What's wrong:** `backend-http.service.ts` has a 10s timeout but no retry/backoff, circuit breaker, or bulkhead — a backend blip becomes user-facing 5xx, and a slow backend can exhaust BFF capacity.
**Fix:** Bounded jittered retries for idempotent GETs, a circuit breaker (`opossum`) around the backend client, a graceful fallback for the hotsite read path.
**Acceptance:** ☐ Transient backend failures recover automatically for idempotent reads; the breaker opens under sustained failure; hotsite degrades gracefully.

### AUD-037 — Auth lifecycle: JWT revocation/refresh/rotation
**Risk:** 🟡 Medium · **Effort:** M · **Phase:** Infra/Deploy · **Depends on:** AUD-031 · **Audit ref:** §13.7
**What's wrong:** Stateless HS256 JWTs with no revocation/denylist or refresh-token rotation; rotating `JWT_SECRET` kills all sessions; `ENABLE_DEV_AUTH` bypass needs a prod guard.
**Fix:** Short-lived access token + refresh token with a revocation list (Redis), `kid`-based key rotation, and env validation that hard-fails if `ENABLE_DEV_AUTH` is set under `NODE_ENV=production`.
**Acceptance:** ☐ Tokens can be revoked server-side; key rotation doesn't drop all sessions; dev-auth is impossible in prod.

### AUD-038 — CD pipeline + migration job + IaC + DR
**Risk:** 🟡 Medium · **Effort:** L · **Phase:** Infra/Deploy · **Audit ref:** §13.8, §9.6
**What's wrong:** No CD workflow, no migration job (despite the documented "separate job before deploy"), and the Checkov job scans `infrastructure/terraform/**` which **doesn't exist** (dead scan, no IaC). Backups/DR are doc-only.
**Fix:** Add a migration CI job gating deploys; commit the Terraform the Checkov job expects (or remove the dead scan); define canary/rollback + zero-downtime (expand/contract) migration discipline; document + drill backups/RTO/RPO.
**Acceptance:** ☐ Deploys run migrations first and abort on failure; IaC exists and is scanned; a restore drill is documented/tested.

### AUD-039 — SBOM generation + image signing (cosign)
**Risk:** 🟡 Medium · **Effort:** S · **Phase:** Infra/Deploy · **Audit ref:** §10.5
**What's wrong:** No SBOM (CycloneDX/SPDX); deployed images unsigned with no provenance.
**Fix:** Emit an SBOM in CI (Trivy/syft), attach to releases; sign images with cosign/Sigstore and verify at deploy (Binary Authorization).
**Acceptance:** ☐ Each release has an SBOM; images are signed and verified at deploy.

### AUD-040 — Abuse/bot protection on public booking
**Risk:** 🟡 Medium · **Effort:** S · **Phase:** Infra/Deploy · **Depends on:** AUD-032 · **Audit ref:** §13.10
**What's wrong:** The public guest-booking endpoint has no CAPTCHA/Turnstile/bot mitigation — booking spam is trivial.
**Fix:** Add a CAPTCHA/Turnstile challenge (or equivalent) to guest booking + per-IP/per-tenant throttling.
**Acceptance:** ☐ Automated booking spam is blocked without harming legitimate guests.

### AUD-041 — Load / throughput regression tests (k6)
**Risk:** 🟡 Medium · **Effort:** M · **Phase:** Infra/Deploy · **Depends on:** AUD-030 · **Audit ref:** §11.6
**What's wrong:** No k6/artillery/autocannon — no latency/throughput baseline; N+1 regressions (e.g. settings amplification) are invisible.
**Fix:** A k6 smoke suite over hot read paths (hotsite manifest, availability summary, booking list) with p95 latency + query-count budgets, run nightly.
**Acceptance:** ☐ A load suite establishes baselines and fails on budget regressions.

### AUD-042 — RUM / Core Web Vitals field monitoring
**Risk:** 🔵 Low · **Effort:** S · **Phase:** Infra/Deploy · **Audit ref:** §13.10
**What's wrong:** Only build-time perf is covered; no real-user field data (LCP/INP by region) for worldwide hotsites.
**Fix:** Add a RUM/Web-Vitals beacon (Next's `useReportWebVitals` → analytics) segmented by region/tenant.
**Acceptance:** ☐ Field Web Vitals are collected and viewable by region.

---

### AUD-043 — Rename `apps/web/middleware.ts` → `proxy.ts` (Next.js 16 deprecation)
**Risk:** 🔵 Low · **Effort:** XS · **Phase:** Now · **Depends on:** — · **Audit ref:** not in the original audit — noticed incidentally in `pnpm dev` output while verifying AUD-007 live
**Status:** ☐ Not started

**What's wrong:** Every `pnpm --filter @ikaro/web dev`/build run logs: `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.` The file already carries real logic — staff/customer auth guards and (after AUD-007) CSP/security headers — that needs to keep working once the old convention is removed in a future Next.js major version.
**Fix:** Rename `apps/web/middleware.ts` → `apps/web/proxy.ts` (and `middleware.spec.ts` → `proxy.spec.ts`) per Next.js's migration guidance, adjusting exported names/config if the new convention requires it. Update every doc reference to `middleware.ts` (`docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/CI_TRAPS.md`, this file's AUD-007/AUD-008 entries) in the same change.
**Acceptance:** ☐ No deprecation warning on `pnpm dev`/`pnpm build` for `apps/web`. ☐ All existing test cases pass unchanged (behavior-preserving rename, not a rewrite). ☐ Every doc reference to `middleware.ts` updated to the new file name.

---

## 7. Notes for future planning agents

- **Each story is intentionally self-contained.** When you pick one up, re-verify the cited `file:line` against the current code (the audit is a snapshot dated 2026-06-21), then expand the `#### What needs to be fixed` into a concrete implementation plan (files, tests, migration registration).
- **Respect `CLAUDE.md`** — the feature-branch workflow (§9), permission gate for docs/config (§0), aggregate-driven events, transaction scoping, tenant-isolation tests, and the `/pre-pr` gate all still apply to every story here.
- **The outbox (AUD-001) is load-bearing** for AUD-003, AUD-004, and AUD-018 — sequence accordingly.
- **Redis (AUD-031) is the infra keystone** for AUD-032, AUD-034 (metrics store optional), AUD-037, and the distributed version of AUD-011/AUD-016.
- **Where a story says "measure first" (AUD-026)** or "design early" (AUD-035), honor that — don't over-build without the signal.

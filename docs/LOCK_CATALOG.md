# 28 — Lock Catalog

> **When to load:** adding, changing or debugging a lock, a transaction that writes shared rows, a deadlock or a stuck request: every lock, its key, call sites, the required acquisition order and known hazards; why to pick each primitive is in `docs/ENGINEERING_RULES_BACKEND.md`.
> **Tags:** backend, database

**Audience:** any engineer or AI agent touching a transaction that writes shared rows, and anyone debugging a stuck request, a `40P01` deadlock or a duplicate/stale row.
**Scope:** every mechanism the backend uses to serialize concurrent work. BFF and web were searched too (`mutex`, `semaphore`, `redlock`, advisory/`FOR UPDATE` patterns) and hold none.
**Verified against the code** (docs-audit re-check of every lock, key, call site and §4 order, after M23-S49; read from the source, not reproduced in a running system; items marked **unverified** are reasoning from the code and need a concurrent test before anyone relies on them).
**How to keep it true:** a change that adds, removes or reorders a lock updates this file in the same commit (§7).

The *why* of choosing a primitive lives in `docs/ENGINEERING_RULES_BACKEND.md` § Choosing a race-condition primitive and § A lock only orders callers who both acquire it. This file is the *inventory*: what exists, what each one protects, and the order they may be combined in.

---

## 1. The mechanisms

| # | Mechanism | Shape of the race | Where it lives |
|---|---|---|---|
| M1 | Advisory lock, `pg_advisory_xact_lock(hashtextextended(key, 0))`, transaction-scoped | No row exists yet (or the invariant spans tables); purely cooperative, blocks only callers that take the same key | `ITenantLockPort` (`booking/application/ports/tenant-lock.port.ts`), adapter `typeorm-tenant-lock.adapter.ts` |
| M2 | Row lock, `SELECT … FOR UPDATE` / TypeORM `pessimistic_write` | The row exists and is read then written | repository methods named `…ForUpdate`, `lockBookingModels`, `findOpenBySourceForUpdate`, `countActiveManagersByTenant` |
| M3 | `FOR UPDATE SKIP LOCKED` plus a lease | Several workers draining one queue | `shared/infrastructure/outbox/typeorm-outbox.repository.ts` |
| M4 | Database constraint as the authoritative backstop | Two rows must never collide | migrations (`EX_…` exclusion, `UQ_…` unique) |
| M5 | Idempotency key | At-least-once delivery, the same work twice | inbox `ON CONFLICT (event_id, consumer_name) DO NOTHING`, outbox `UQ_shared_outbox_dedup_key`, and the null-safe occupancy-assignment insert (`ON CONFLICT … DO NOTHING`, see the constraints table below) |
| M6 | Optimistic concurrency (`version` column) | Two writers load the same aggregate and both save; no lock is held between read and write | `@VersionColumn` on `bookings`, `recurring_booking_schedules`, `availability_alerts`, `lead_form_configs` and `hotsite_configs` (the entity classes under `contexts/*/infrastructure/entities/`); the aggregate carries `version` and the repository's `save` UPDATE is version-checked |

The M1 adapter (`Tenant lock requires an active transaction`) and the M2 `…ForUpdate` / `lockBookingModels` methods (an error naming the method) throw when no transaction is open, and all of them are released on commit or rollback. **Exception: `countActiveManagersByTenant` (R5) does not throw — outside a transaction it silently falls back to an unlocked `repo.count`.** Every transaction opened by `runInNewTransaction` sets a transaction-local `lock_timeout` of 2s (`DB_LOCK_TIMEOUT_MS`, `shared/infrastructure/run-in-new-transaction.ts`; M23-S49, §5 H5), so a wait for any M1 or M2 lock (and for an uncommitted conflicting row under M4) that lasts longer than 2s fails with `TransactionContentionError`, which the caller sees as a retryable 503 `AUTH_TRANSACTION_CONTENTION` with `Retry-After: 1`; a deadlock victim (`40P01`) gets the same error. The timeout bounds **each** wait, not the whole transaction. M3 (`SKIP LOCKED`) never waits.

---

## 2. The order locks are taken in

A deadlock needs a cycle, so every transaction must take locks in the same order. This is the order the code follows **today**; take locks only downward and add a new lock at a stated level.

| Level | Lock | Notes |
|---|---|---|
| L0 | Tenant row (R3) | Only the settings and opening paths |
| L1 | Entity keys: `lockTenantDay`, `lockTenantStaff`, `lockCustomerAlerts`, `lockService` (A1, A2, A4, A5) | Never combined with each other in one transaction today |
| L2 | Service rows (R1, R2) | R2 batched and ordered by id |
| L3 | Resource advisory locks, `lockResources` (A3) | One call, ids sorted by the adapter |
| L4 | Future-commitment exception rows (R4) | Batched and ordered by id |
| L5 | Booking row | Taken implicitly by the `UPDATE` in `bookingRepo.save()`; no explicit lock exists |
| L6 | Occupancy rows | `release`, `assign`, `move`; the exclusion constraint M4 waits on a conflicting uncommitted row |

**Rules that follow from the order**
- Several locks of one kind are taken in **one** call with a deterministic order, never one at a time in a loop.
- A lock orders only callers that also take it; after acquiring it, re-read the state it protects (a snapshot read before the lock is stale).
- No network I/O inside a lock-holding transaction (CI-enforced `transactional-io`).
- A lock holder must finish well inside the 2s lock timeout, because every waiter fails after it. A path that legitimately holds a lock longer (a raise over a resource with many bookings, a long `end-recurring`) has to be made shorter or split before it ships; raising `DB_LOCK_TIMEOUT_MS` is the last resort, because the web gives up on the BFF at 8s and two waits must fit inside that.

**Known deviations from this order** are listed in §5 as hazards, not as accepted design.

---

## 3. Catalog

Each entry: what is locked, who takes it, the business case, why this primitive, where it sits in §2.

### Advisory locks (M1)

#### A1 — `lockTenantDay(tenantId, date)` — key `{tenantId}:{date}`
- **Taken by:** `OpenScheduleUseCase` (only when the opening is resource-scoped), `CloseScheduleUseCase`, `RemoveScheduleOpeningUseCase` (only when removing a tenant-wide opening).
- **Protects:** (1) two closures for overlapping windows on one date cannot both pass the overlap check (no DB constraint can express a time-range overlap here); (2) a resource-scoped opening cannot be created while its prerequisite tenant-wide opening is being removed.
- **Why advisory:** nothing to row-lock; the second use is a check-then-write across two tables.
- **Level:** L1 (taken after R3 in `OpenSchedule`).
- **Precedent:** M21-S03. **The key has no namespace prefix and cannot change:** a rolling deploy would run old and new keys side by side and silently stop serializing (`docs/ENGINEERING_RULES_BACKEND.md`).

#### A2 — `lockTenantStaff(tenantId, staffId)` — key `tenantstaff:{tenantId}:{staffId}`
- **Taken by:** `CreateResourceUseCase`, `UpdateResourceUseCase`, `ReactivateResourceUseCase`, `CascadeStaffDeactivationUseCase`.
- **Protects:** a STAFF-type Resource is never created, updated or reactivated against a staff member that a concurrent `StaffDeactivated` cascade is deactivating. Whichever side takes the lock first fully decides what the other sees.
- **Level:** L1. In the cascade and in reactivate it is followed by A3.
- **Precedent:** M21-S06.

#### A3 — `lockResources(tenantId, resourceIds)` — key `resource:{tenantId}:{resourceId}` per id
- **Taken by:** booking creation (`booking-request.helpers.ts` → `resolveAndCheckCandidates`), `DeactivateResourceUseCase` (through the raise below, after the resource `save()`), `ApproveBookingUseCase`, reschedule (`reschedule-quote.helpers.ts`), reassign (`resource-reassignment.helpers.ts`), `ReactivateResourceUseCase`, `RaiseFutureCommitmentExceptionsForResourceService`, the recurring request and approval (`recurring-considered-resources.helpers.ts`), `BookingSlotConflictService.assertSlotFree` and `lockResources`.
- **Protects:** the read-then-insert of resource occupancy. Two requests that both read a unit as free must not both take it, and a request choosing among interchangeable units must lock every candidate before reading (`resource-candidate-locking.helpers.ts`, M23-S32). Also orders a deactivation's impact read against a booking inserting occupancy on that resource.
- **Why advisory + a constraint:** the ids are sorted by the adapter (so overlapping sets cannot cross); the GIST exclusion M4-1 remains the authoritative backstop.
- **Level:** L3.
- **Also taken by (M23-S48):** every change that frees or moves a booking's occupancy — cancel (customer, staff), reject, end of a recurring schedule, the worklist's CANCEL (`saveTerminalBookingsInTransaction`), and approve and both reschedules, which add the resources the booking holds before the move to the same single call. A deactivation's raise and a cancel therefore meet on this lock.
- **Precedent:** M22-S03, M23-S32.

#### A4 — `lockService(tenantId, serviceId)` — key `service:{tenantId}:{serviceId}`
- **Taken by:** `RequestRecurringBookingScheduleUseCase`, `ApproveRecurringBookingScheduleUseCase`.
- **Protects:** the per-service cap on active `RESOLVE_PER_OCCURRENCE` schedules (count then insert), which has no concrete resource to lock yet.
- **Level:** L1, then R1, then A3 (see §4).
- **Precedent:** M23-S04.

#### A5 — `lockCustomerAlerts(tenantId, customerId)` — key `availability-alerts:{tenantId}:{customerId}`
- **Taken by:** `CreateAvailabilityAlertUseCase`.
- **Protects:** the per-customer active-alert cap (count then insert; no alert row exists yet).
- **Level:** L1, then R1.
- **Precedent:** M23-S06.

### Row locks (M2)

#### R1 — Service row, `serviceRepo.findByIdForUpdate`
- **Taken by:** `ActivateService`, `DeactivateService`, `UpdateService`, `UpdateServiceLegs`, `UpdateServiceResourceRequirements`, `UpdateServiceBookingPolicy`, `UpdateServicePublicPage` (TD56-S03; it also reads other services' slugs while holding the row, but two first publishes of different services hold different rows, so cross-service slug uniqueness rests on the partial unique index `UQ_booking_services_tenant_public_slug`, not on this lock), `PublishServiceIntakeSchema`, `CreateAvailabilityAlert`, `RequestRecurringBookingSchedule` (inside `prepareRequest`).
- **Protects:** lost updates, because `save()` wholesale-replaces the service's child tables; and a stale eligibility or policy read in a request that depends on it.
- **Level:** L2.

#### R2 — Service rows, batched, `serviceRepo.lockBookingModels(ids)` (`ORDER BY id`)
- **Taken by:** one-off booking creation (`lockAndVerifyServiceModels` in `booking-request.helpers.ts`).
- **Protects:** a service's `bookingModel` cannot change while its first booking is being created (UC-056 immutable-after-history). Re-checks the fresh model against the pre-transaction snapshot.
- **Level:** L2. Booking creation takes it before A3, the same order as the recurring request (M23-S48, was the reverse: hazard H1).
- **Precedent:** M22-S01, PR #479 (the first version lacked `ORDER BY` and was caught in review).

#### R3 — Tenant row, `tenantRepo.findByIdForUpdate` (bypasses `CachingTenantRepository`)
- **Taken by:** `UpdateTenantSettingsUseCase`, `UpdateHotsiteContentUseCase`, `GetTenantBusinessHoursForUpdateUseCase` (reached from `OpenScheduleUseCase` through `BookingPlatformPort.getBusinessHoursAndLocaleForUpdate`).
- **Protects:** narrowing `businessHours` while `OpenSchedule` validates against it; lost updates of hotsite content.
- **Why a row lock, not advisory:** the row exists, and an advisory lock still reads through the cache regardless of order.
- **Level:** L0.
- **Precedent:** M21-S03 PR #460 (an advisory-lock design was walked back).

#### R4 — Future-commitment exception rows
- **`findByIdForUpdate`:** `ResolveFutureCommitmentExceptionsUseCase.lockOpenEntry`, `DismissFutureCommitmentExceptionsUseCase`. Two managers acting on one entry: the second waits, then sees it closed.
- **`findOpenBySourceForUpdate`:** `ReactivateResourceUseCase`. Batched, `ORDER BY id`. A reactivation closing a resource's own entries cannot race a manager resolving one.
- **`findOpenByAffectedForUpdate` (M23-S48):** the terminal helper (`saveTerminalBookingsInTransaction`) and approve/reschedule. One batched query for the booking(s), `ORDER BY id`. A cancel closing a booking's entries cannot race a manager resolving one.
- **Level:** L4. The worklist's resolve takes A3 before it for CANCEL and RESCHEDULE; REASSIGN takes no A3 first because its lock set (the candidate targets) never contains the deactivated source (H2).
- **Precedent:** M23-S08, M23-S45.

#### R5 — Active managers of a tenant, `countActiveManagersByTenant`
- **Taken by:** `DeactivateStaffUseCase`, `UpdateStaffProfileUseCase`.
- **Protects:** the last-active-manager guard. Locks every active MANAGER row of the tenant (`FOR UPDATE` cannot be combined with `COUNT`, so ids are selected and counted in code).
- **Level:** none of the above; it only touches `staff.staff`. The query has `ORDER BY id` since M23-S48 (H3).
- **Only locks inside a transaction:** outside one, the repository falls back to an unlocked `repo.count`, with no error. Both callers run inside `txManager.run` today; a new caller must too.

### Queue lease (M3)

#### Q1 — Outbox claim
- `shared.outbox` rows are claimed with `FOR UPDATE SKIP LOCKED` plus `lease_token` / `lease_expires_at`; a worker that dies releases the claim when the lease expires. Several relay instances can run side by side.
- A second claim path exists: the inline per-id claim (`CLAIM_UNPUBLISHED_BY_ID_SQL` in the same repository) is a plain conditional `UPDATE` guarded only by `lease_expires_at IS NULL OR < now()`, with no `SKIP LOCKED`. Only the sweep uses `SKIP LOCKED`.

### Constraints and idempotency (M4, M5); optimistic concurrency (M6)

| Name | Table | Backstop for |
|---|---|---|
| `EX_booking_resource_occupancy_locked_window` | `booking.resource_occupancy` | **Live, authoritative:** no two `HOLD`/`COMMITTED` windows on one resource overlap (GIST on `tenant_id`, `resource_id`, `tstzrange(starts_at, ends_at)`) |
| `EX_booking_bookings_approved_slot` | `booking.bookings` | Dropped by migration `1748500000014`; the name still appears in comments and error-mapping helpers, so check before trusting a reference |
| `UQ_booking_fce_open_impact` | `booking.future_commitment_exceptions` | One open entry per `(tenant, source, affected)` |
| `UQ_booking_resources_tenant_ref_id`, `UQ_booking_resources_tenant_location` | `booking.resources` | One Resource per staff member; one location per tenant |
| `UQ_booking_resources_tenant_id`, `UQ_booking_resources_tenant_id_type` | `booking.resources` | The `(tenant_id, id)` and `(tenant_id, id, type)` targets that composite foreign keys point at (cross-tenant references blocked at DB level) |
| `UQ_booking_schedule_openings_tenant_date_no_resource`, `UQ_booking_schedule_openings_tenant_resource_date` | `booking.schedule_openings` | One opening per tenant, date and resource scope: partial unique indexes on `(tenant_id, date) WHERE resource_id IS NULL` and `(tenant_id, resource_id, date) WHERE resource_id IS NOT NULL` (M21 replaced the earlier `UQ_booking_schedule_openings_tenant_date`) |
| `UQ_booking_bkg_line_res_assign_null_safe` | `booking.booking_line_resource_assignments` | The conflict target of the null-safe occupancy-assignment insert: `(tenant_id, booking_line_id, resource_id, COALESCE(leg_index,-1), COALESCE(quantity_position,-1))`, so a retried insert (`ON CONFLICT … DO NOTHING` in `typeorm-resource-occupancy.write-queries.ts`) does not duplicate an assignment |
| `UQ_service_booking_intake_schema_active`, `UQ_service_booking_intake_schema_version` | `booking.service_booking_intake_schema` | Partial unique index: at most one `is_active` schema per `(tenant_id, service_id)`; `_version` keeps one row per version number |
| `UQ_booking_bkg_quote_revisions_booking_revision` | booking quote revisions | One revision number per booking |
| `UQ_booking_availability_alert_attempts_window_channel` | availability alert attempts | One attempt per `(tenant_id, alert_id, matching_window, channel)` |
| `UQ_notification_templates_global`, `UQ_notification_templates_tenant` | `notification.notification_templates` | Partial unique indexes: one global template (`tenant_id IS NULL`) per trigger event, channel and locale; `_tenant` allows one override per `(tenant_id, trigger_event, channel)` |
| `UQ_platform_tenants_slug` | `platform.tenants` | Tenant slug is unique |
| `UQ_booking_bookings_recurring_schedule_occurrence` | `booking.bookings` | One booking per schedule occurrence (the exceptions table and its constraint were dropped by M23-S24) |
| `UQ_staff_tenant_google_oauth_id`, `UQ_staff_tenant_email`, `UQ_customer_customers_tenant_oauth` | `staff.staff`, `customer.customers` | Per-tenant identity (multi-tenancy invariants 5 and 6) |
| `UQ_notification_logs_event_type_channel` (unique index; the earlier `UQ_notification_logs_event_channel` constraint was dropped by migration `1748200000010`), `UQ_loyalty_entries_tenant_booking_line` | notification and loyalty | A redelivered event does not send twice or earn twice |
| inbox `(event_id, consumer_name)`, outbox `UQ_shared_outbox_dedup_key` | `shared.*` | Consumer idempotency, publish dedup |

The meaning of the unique constraints is taken from their names and `docs/DATABASE_SCHEMA.md`; confirm there before relying on one for a new design.

### 3.1 Which test proves each lock

A test counts as coverage for a lock only if **removing the lock makes it fail** (the mutation check in `docs/ENGINEERING_RULES_TESTING.md` § Concurrency tests). Kinds: **contract** = hold the lock, start the use case, prove it waits (and, for a resource lock, that it does not already own the worklist entry row); **outcome** = assert the data the lock protects; **race** = two real operations at once, a few rounds, assert the invariant. All files are `*.integration.spec.ts` under `apps/backend/src`, each scenario on its own tenant.

| Lock | Test (file › scenario) | Kind | Fails without the lock? |
|---|---|---|---|
| A1 tenant day | `booking-context-locks` › closing a day waits; removing a tenant-wide opening waits; two overlapping closures of the same day: exactly one is created | contract, outcome | Yes for closing (contract and outcome); the removal case was not mutated |
| A2 staff | `booking-context-locks` › creating, reactivating and updating a staff member's resource, and the staff-deactivated cascade, each wait for the staff lock | contract | Yes, all four |
| A3 resources | `booking-lock-order` › eleven paths wait for the resource lock without owning the entry row (staff cancel, customer cancel, reject, end-recurring, the hold-expiry job, the worklist's CANCEL and RESCHEDULE, staff reschedule, customer reschedule, a reschedule overriding a customer-chosen room, approve) and four bounded races; `booking-context-locks` › deactivating a resource waits, then raises the entry; `recurring-booking-schedule-approval` › a request and an approval each wait for the lock on the room they consider; the slot-conflict races in `booking.controller`, `booking-by-staff`, `recurring-booking-schedule` | contract, race, outcome | Yes (terminal helper, old-resources lock, deactivation raise mutated) |
| A4 service key | `recurring-booking-schedule-approval` › a request waits for the service key; an approval waits for the service key | contract | Yes, both. The existing cap race test (`recurring-booking-schedule.controller`) passes without the key, because the resource lock serializes it, so it is not counted |
| A5 customer alerts | `availability-alert.controller` › a create waits for the customer's alert key, then succeeds | contract | Yes. The existing cap race test passes without the key, because the service row lock serializes those creates too, so it is not counted |
| Lock timeout (`lock_timeout`, 2s, every transaction) | `run-in-new-transaction.integration` › an advisory lock held longer than the timeout makes the waiter fail fast and the holder commits; the same for a service row `FOR UPDATE`; two transactions taking two advisory keys in opposite orders: exactly one is a deadlock victim (`40P01`), the other commits; the timeout does not leak to the next transaction on a pooled connection (a one-connection pool); a unique violation is not mapped to contention. `error.filter.integration` › the 503, `Retry-After` and no SQL or tenant identifier in the body | contract, race | Yes: with the `set_config` call removed, the two "waits" tests and the leak test fail (mutation-checked in M23-S49) |
| R1 service row | **None that discriminates.** | — | A held `FOR UPDATE` row blocks the writer's `UPDATE` anyway, and for the pairs tried (deactivate vs change requirements) the aggregate rewrite does not conflict, so removing the read lock changed no result. Do not add a test that passes either way |
| R2 booking models | `booking-lock-order` › a one-off booking waits behind a held service row without having taken the candidate resource locks | contract, race | Yes (restoring the old order fails both the contract test and the one-off-vs-recurring race) |
| R3 tenant row | `schedule-opening.controller` › opening a day waits for an uncommitted change to the tenant's business hours, then refuses (422) | contract | Yes (the plain read lets the opening through at once) |
| R4 exception rows | `typeorm-future-commitment-exception.repository` (a resolver, then a reactivation or a cancel, sees the entry closed); `booking-lock-order` (the entry row is free while the operation waits on the resource lock) | contract | Yes |
| R5 managers | `staff.controller` › the last-manager guard waits for an uncommitted manager deactivation, then refuses | contract | Yes (the earlier two-request HTTP race passed without the lock and was replaced) |
| Q1 outbox | `outbox-relay.service`, `typeorm-booking.repository.outbox-cutover` › two concurrent sweeps (`SKIP LOCKED`) | outcome | Existing tests |
| M4 constraints | the same slot-conflict races as A3 (the exclusion constraint is what makes them safe) | outcome | Existing tests |
| M5 idempotency | `send-booking-approved-notification` › two concurrent deliveries of the same event | outcome | Existing test |

Known gaps: R1 (no test can tell the read lock from the writer's own `UPDATE`), and the removal path of A1 (not mutation-checked). Q1, M4 and M5 rely on existing tests that were not re-checked here; the A4 and A5 race tests turned out not to prove their locks, so those three may be the same.

---

## 4. Use cases that take several locks, in the order they take them

| Use case | Sequence |
|---|---|
| `OpenScheduleUseCase` | R3 → A1 (resource-scoped openings only) |
| `CloseScheduleUseCase`, `RemoveScheduleOpeningUseCase` | A1 |
| One-off booking creation | R2 → A3 (candidates, one call) → booking `save` |
| `ApproveBookingUseCase` | A3 (candidates + the resources it holds now, one call) → R4 → booking `save` → occupancy → dismiss stale entries |
| Reschedule, staff or customer | A3 (candidates + the resources it holds now, one call) → R4 → booking `save` → occupancy → dismiss stale entries |
| Reassign (worklist) | R4 → A3 (candidate targets only) → occupancy |
| Resolve CANCEL (worklist) | A3 (the booking's resources) → R4 → booking `save` → occupancy release → dismiss sibling entries |
| Resolve RESCHEDULE (worklist) | A3 (the booking's resources, the entry's source and the candidates, one call) → R4 → booking `save` → occupancy → dismiss stale entries |
| `ReactivateResourceUseCase` | A2 → A3 → R4 → resource `save` |
| `CascadeStaffDeactivationUseCase` | A2 → resource `save` → raise (A3 → impact read → entry inserts) |
| `DeactivateResourceUseCase` | resource `save` → raise (A3 → impact read → entry inserts); the resource row is written before A3, unlike the cancel paths |
| Raise (`RaiseFutureCommitmentExceptionsForResource`) | A3 → impact read |
| `RequestRecurringBookingScheduleUseCase` | A4 → R1 → A3 (considered resources, one call) → cap check |
| `ApproveRecurringBookingScheduleUseCase` | A4 → A3 |
| `CreateAvailabilityAlertUseCase` | A5 → R1 |
| `DeactivateStaffUseCase`, `UpdateStaffProfileUseCase` | R5 → staff `save` |
| Cancel (customer, staff), reject, end-recurring | A3 (everything the booking(s) hold, read again after the lock) → R4 (one batched query) → booking `save` → occupancy release → dismiss every entry |
| `ExpireBookingHoldsJob` (TD51, one transaction per booking) | booking read → A3 (everything the booking holds, read again after the lock) → R4 (one batched query) → booking `save` → occupancy release → dismiss every entry. It reuses the cancel path's helper, so the order is the cancel row's; the booking is read before the lock and the optimistic version check turns a lost race into a skip |
| `SubmitBookingInfoUseCase`, `SubmitGuestBookingInfoUseCase` (TD51) | booking `save` → occupancy hold restart. Takes no resource lock: it only moves `hold_expires_at` on rows the booking already owns, after the booking row, the same order approve reaches them in (booking `save` → occupancy), so it cannot form a cycle with approve |

---

## 5. Known hazards (each one is reading, not a reproduced incident)

| ID | Hazard | Status |
|---|---|---|
| H1 | **Service row versus resource order is inverted.** One-off booking creation takes A3 then R2; the recurring request takes A4 → R1 → A3. A one-off booking holding resource R and waiting on service row S can deadlock with a recurring request holding S and waiting on R. Postgres aborts one with `40P01`. | **Closed in M23-S48:** one-off creation locks the service rows before it resolves candidates (call order pinned by a unit test). A race test (`recurring-booking-schedule-approval` › a one-off booking and a recurring request on the same service and room never deadlock) fails when the old order is restored, so the deadlock was real. |
| H2 | **Resolve versus reactivate.** Resolve REASSIGN/RESCHEDULE take the entry (R4) then resource locks (A3); reactivate takes A3 then R4. The cycle needs the failing resolve case (a `CUSTOMER_CHOICE` pinned to the deactivated resource); reassign locks only candidate targets. | **Closed in M23-S48:** RESCHEDULE locks the full resource set before the entry row; an integration test shows it waits for a held source-resource lock without holding the entry row, and a unit test pins that REASSIGN never asks for the source. The reschedule resolves from the same snapshot of the tenant's resources that the pre-lock read (`ResolutionSnapshot`), so a resource that becomes eligible in between is neither chosen nor locked; a unit test adds a room between the resource locks and the entry lock and checks that no later lock request leaves the held set. |
| H3 | `countActiveManagersByTenant` locks manager rows with no `ORDER BY`; two concurrent deactivations rely on identical scan order. | **Closed in M23-S48** (`ORDER BY id`). A lock-contract test holds an uncommitted manager deactivation and checks that the last-manager guard waits for it, then refuses with `LastActiveManagerError` (the earlier two-request race passed without the lock and was replaced). |
| H4 | Cancel, reject and end-recurring take no resource lock, so a stale future-commitment entry can be inserted by a concurrent raise. | **Closed in M23-S48** (A3 → R4 → booking `save`); cancel racing a deactivation, and cancel racing the worklist's CANCEL, are covered by integration tests. |
| H5 | **No `lock_timeout` or `statement_timeout` anywhere in the backend** (before M23-S49) (search over `*.ts` and infra found none). A deadlock is detected by Postgres after `deadlock_timeout` and one side fails with `40P01`, which no code maps; a merely slow holder (a raise over a resource with many bookings, a long `end-recurring`) makes others wait without bound. | **Closed in M23-S49** (design, why 2s and the retry contract: the "Lock waits are bounded (M23-S49)" paragraph in `docs/ENGINEERING_RULES_BACKEND.md`, near the top). A `40P01` deadlock is still a real defect to fix by ordering (§2); the 503 only makes it visible and retryable instead of a 500. |

---

## 6. Debugging a stuck request or a deadlock

- **`40P01 deadlock detected`**: the Postgres log names both statements and the two lock targets. Find the two use cases in §4 and compare their sequences with §2.
- **A request returns 503 `AUTH_TRANSACTION_CONTENTION`** (with `Retry-After: 1`): it waited longer than 2s for a lock, or Postgres chose it as a deadlock victim; nothing was written. The backend logged a `warn` "Transaction aborted by lock contention" with the `sqlState` (`55P03` timeout, `40P01` deadlock) and, inside an HTTP request, the tenant and correlation ids. Find the holder with the query below while it is still running; for a `40P01` the Postgres log names both statements.
- **A request hangs**: no single lock wait lasts more than 2s (H5 closed), but a request that waits on several locks in turn can still exceed 2s in total, and a long wait can also be a slow statement or an exhausted pool; find the blocked and blocking sessions.
  ```sql
  SELECT l.pid, l.locktype, l.classid, l.objid, l.granted, a.state, a.query_start, a.query
  FROM pg_locks l JOIN pg_stat_activity a USING (pid)
  WHERE l.locktype = 'advisory' OR (l.locktype = 'transactionid' AND NOT l.granted);
  ```
- **Which advisory key is it?** The key is `hashtextextended('<key>', 0)`, a bigint split into `classid` (high 32 bits) and `objid` (low 32 bits). Compute `SELECT hashtextextended('resource:<tenantId>:<resourceId>', 0)` and compare with `(classid::bigint << 32) | objid`. Key formats are in §3.
- **A duplicate or stale row**: check which constraint in §3 should have stopped it and which use case in §4 should have taken the lock; a path that releases or writes without taking the lock is the usual cause.

---

## 7. Adding or changing a lock

1. Pick the primitive by the shape of the race (`docs/ENGINEERING_RULES_BACKEND.md`): a constraint if the rows can express it, a row lock if the row exists, an advisory lock if nothing exists yet.
2. Choose its level in §2. If it must be taken against the order, say why in the PR and add the concurrent test that proves no cycle.
3. Batch several locks of one kind into one call with a deterministic order.
4. After acquiring, re-read the state the lock protects.
5. A new advisory key is free to namespace; an existing live key never changes.
6. Add the entry to §3, the sequence to §4, and any hazard to §5, in the same commit. `pnpm architecture-check` (`lock-catalog-coverage`) fails when a port's `lock*()` or `*ForUpdate()` method is not named in this file; it checks the name only, so the order and the test are still yours.
7. Ship a concurrent integration test; a unit test with an in-memory double proves nothing about ordering.
8. Name the test in § 3.1 and run the mutation check on it: remove the lock and watch it fail. A test that passes without the lock is not coverage (R1 is the example); if no test can tell, record that in § 3.1 and say why.

# 28 — Lock Catalog

**Audience:** any engineer or AI agent touching a transaction that writes shared rows, and anyone debugging a stuck request, a `40P01` deadlock or a duplicate/stale row.
**Scope:** every mechanism the backend uses to serialize concurrent work. BFF and web were searched too (`mutex`, `semaphore`, `redlock`, advisory/`FOR UPDATE` patterns) and hold none.
**Last verified against the code:** 2026-10-15 (read from the source, not reproduced in a running system; items marked **unverified** are reasoning from the code and need a concurrent test before anyone relies on them).
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
| M5 | Idempotency key | At-least-once delivery, the same work twice | inbox `ON CONFLICT (event_id, consumer_name) DO NOTHING`, outbox `UQ_shared_outbox_dedup_key` |

All M1 and M2 locks throw `Error('… must be called inside an active transaction')` when no transaction is open, and are released on commit or rollback. None of them has a timeout (§5, H2).

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
- **Taken by:** booking creation (`booking-request.helpers.ts` → `resolveAndCheckCandidates`), `ApproveBookingUseCase`, reschedule (`reschedule-quote.helpers.ts`), reassign (`resource-reassignment.helpers.ts`), `ReactivateResourceUseCase`, `RaiseFutureCommitmentExceptionsForResourceUseCase`, the recurring request and approval (`recurring-considered-resources.helpers.ts`), `BookingSlotConflictService.assertSlotFree` and `lockResources`.
- **Protects:** the read-then-insert of resource occupancy. Two requests that both read a unit as free must not both take it, and a request choosing among interchangeable units must lock every candidate before reading (`resource-candidate-locking.helpers.ts`, M23-S32). Also orders a deactivation's impact read against a booking inserting occupancy on that resource.
- **Why advisory + a constraint:** the ids are sorted by the adapter (so overlapping sets cannot cross); the GIST exclusion M4-1 remains the authoritative backstop.
- **Level:** L3.
- **Not taken today by:** cancel, reject and end-recurring (they only release occupancy). See H4.
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
- **Taken by:** `ActivateService`, `DeactivateService`, `UpdateService`, `UpdateServiceLegs`, `UpdateServiceResourceRequirements`, `UpdateServiceBookingPolicy`, `PublishServiceIntakeSchema`, `CreateAvailabilityAlert`, `RequestRecurringBookingSchedule` (inside `prepareRequest`).
- **Protects:** lost updates, because `save()` wholesale-replaces the service's child tables; and a stale eligibility or policy read in a request that depends on it.
- **Level:** L2.

#### R2 — Service rows, batched, `serviceRepo.lockBookingModels(ids)` (`ORDER BY id`)
- **Taken by:** one-off booking creation (`lockAndVerifyServiceModels` in `booking-request.helpers.ts`).
- **Protects:** a service's `bookingModel` cannot change while its first booking is being created (UC-056 immutable-after-history). Re-checks the fresh model against the pre-transaction snapshot.
- **Level:** L2. **In booking creation it runs after A3** (`booking-request.helpers.ts:276` then `:286`), the reverse of the recurring request (see H1).
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
- **Level:** L4. **`resolve` takes it before A3 in its REASSIGN and RESCHEDULE branches, the reverse of reactivate (H2).**
- **Precedent:** M23-S08, M23-S45.

#### R5 — Active managers of a tenant, `countActiveManagersByTenant`
- **Taken by:** `DeactivateStaffUseCase`, `UpdateStaffProfileUseCase`.
- **Protects:** the last-active-manager guard. Locks every active MANAGER row of the tenant (`FOR UPDATE` cannot be combined with `COUNT`, so ids are selected and counted in code).
- **Level:** none of the above; it only touches `staff.staff`. **The query has no `ORDER BY`** (H3).

### Queue lease (M3)

#### Q1 — Outbox claim
- `shared.outbox` rows are claimed with `FOR UPDATE SKIP LOCKED` plus `lease_token` / `lease_expires_at`; a worker that dies releases the claim when the lease expires. Several relay instances can run side by side.

### Constraints and idempotency (M4, M5)

| Name | Table | Backstop for |
|---|---|---|
| `EX_booking_resource_occupancy_locked_window` | `booking.resource_occupancy` | **Live, authoritative:** no two `HOLD`/`COMMITTED` windows on one resource overlap (GIST on `tenant_id`, `resource_id`, `tstzrange(starts_at, ends_at)`) |
| `EX_booking_bookings_approved_slot` | `booking.bookings` | Dropped by migration `1748500000014`; the name still appears in comments and error-mapping helpers, so check before trusting a reference |
| `UQ_booking_fce_open_impact` | `booking.future_commitment_exceptions` | One open entry per `(tenant, source, affected)` |
| `UQ_booking_resources_tenant_ref_id`, `UQ_booking_resources_tenant_location` | `booking.resources` | One Resource per staff member; one location per tenant |
| `UQ_booking_schedule_openings_*` | `booking.schedule_openings` | One opening per tenant, date and resource scope |
| `UQ_booking_bookings_recurring_schedule_occurrence`, `UQ_booking_rbs_exceptions_schedule_occurrence` | `booking.bookings`, schedule exceptions | One booking or exception per schedule occurrence |
| `UQ_staff_tenant_google_oauth_id`, `UQ_staff_tenant_email`, `UQ_customer_customers_tenant_oauth` | `staff.staff`, `customer.customers` | Per-tenant identity (multi-tenancy invariants 5 and 6) |
| `UQ_notification_logs_event_channel`, `UQ_loyalty_entries_tenant_booking_line` | notification and loyalty | A redelivered event does not send twice or earn twice |
| inbox `(event_id, consumer_name)`, outbox `UQ_shared_outbox_dedup_key` | `shared.*` | Consumer idempotency, publish dedup |

The meaning of the unique constraints is taken from their names and `docs/13-DATABASE_SCHEMA.md`; confirm there before relying on one for a new design.

---

## 4. Use cases that take several locks, in the order they take them

| Use case | Sequence |
|---|---|
| `OpenScheduleUseCase` | R3 → A1 (resource-scoped openings only) |
| `CloseScheduleUseCase`, `RemoveScheduleOpeningUseCase` | A1 |
| One-off booking creation | A3 (candidates, one call) → R2 |
| `ApproveBookingUseCase` | A3 → booking `save` → occupancy |
| Reschedule (`rescheduleBookingInTransaction`) | A3 → booking `save` → occupancy |
| Reassign (worklist) | R4 → A3 → occupancy |
| Resolve CANCEL (worklist) | R4 → booking `save` → occupancy release |
| `ReactivateResourceUseCase` | A2 → A3 → R4 → resource `save` |
| `CascadeStaffDeactivationUseCase` | A2 → resource `save` → raise (A3 → impact read → entry inserts) |
| Raise (`RaiseFutureCommitmentExceptionsForResource`) | A3 → impact read |
| `RequestRecurringBookingScheduleUseCase` | A4 → R1 → A3 (considered resources, one call) → cap check |
| `ApproveRecurringBookingScheduleUseCase` | A4 → A3 |
| `CreateAvailabilityAlertUseCase` | A5 → R1 |
| `DeactivateStaffUseCase`, `UpdateStaffProfileUseCase` | R5 → staff `save` |
| Cancel, reject, end-recurring | booking `save` → occupancy release (**no lock yet**, see H4) |

---

## 5. Known hazards (each one is reading, not a reproduced incident)

| ID | Hazard | Status |
|---|---|---|
| H1 | **Service row versus resource order is inverted.** One-off booking creation takes A3 then R2; the recurring request takes A4 → R1 → A3. A one-off booking holding resource R and waiting on service row S can deadlock with a recurring request holding S and waiting on R. Postgres aborts one with `40P01`. | **Unverified**, open; to be fixed in M23-S48 (service rows before resources in one-off creation, with a concurrent test). |
| H2 | **Resolve versus reactivate.** Resolve REASSIGN/RESCHEDULE take the entry (R4) then resource locks (A3); reactivate takes A3 then R4. The cycle needs the failing resolve case (a `CUSTOMER_CHOICE` pinned to the deactivated resource); reassign locks only candidate targets. | **Unverified**, open; to be fixed in M23-S48 (resolve RESCHEDULE locks the full resource set before the entry). |
| H3 | `countActiveManagersByTenant` locks manager rows with no `ORDER BY`; two concurrent deactivations rely on identical scan order. | Low; open; to be fixed in M23-S48 (`ORDER BY id`). |
| H4 | Cancel, reject and end-recurring take no resource lock, so a stale future-commitment entry can be inserted by a concurrent raise. | Open; to be fixed in M23-S48 (A3 → R4 → booking `save`). Update this row and §4 when it merges. |
| H5 | **No `lock_timeout` or `statement_timeout` anywhere in the backend** (search over `*.ts` and infra found none). A deadlock is detected by Postgres after `deadlock_timeout` and one side fails with `40P01`, which no code maps; a merely slow holder (a raise over a resource with many bookings, a long `end-recurring`) makes others wait without bound. | Open; tracked as story M23-S49 (`SET LOCAL lock_timeout` in the lock adapter and a `40P01` mapping). |

---

## 6. Debugging a stuck request or a deadlock

- **`40P01 deadlock detected`**: the Postgres log names both statements and the two lock targets. Find the two use cases in §4 and compare their sequences with §2.
- **A request hangs**: find the blocked and blocking sessions.
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
6. Add the entry to §3, the sequence to §4, and any hazard to §5, in the same commit.
7. Ship a concurrent integration test; a unit test with an in-memory double proves nothing about ordering.

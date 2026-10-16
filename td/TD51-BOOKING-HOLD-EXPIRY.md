# TD51 — A manual-approval booking's HOLD never expires

## Status
- **Type**: Technical Debt / Correctness (Booking — approval lifecycle)
- **Priority**: Medium (a request nobody decides blocks a real resource's slot indefinitely and the customer is never told; it affects only resource-scoped services with `MANUAL_APPROVAL`, not the car-wash degenerate services, which use the non-blocking `REQUESTED` state)
- **Context**: apps/backend — booking and notification contexts; apps/bff — booking detail mapper; apps/web — booking detail termination card and status history; packages/types, packages/i18n
- **Created**: 2026-10-16
- **Discovered**: closing M23 — writing `docs/27`'s `lock_state` lifecycle from the code showed that `hold_expires_at` is written and never read
- **Decision status**: Ready for discovery. One story; `/story-discovery` may split the customer-facing detail wording (web) from the backend if the PR gets too large.
- **Related**: M23-S05 (the recurring-schedule expiry job this mirrors), M23-S28 (its customer email), M23-S33/TD50 (approve-time checks), M23-S47 (booking detail shows who cancelled and why), `docs/27-BUSINESS_LOGIC_REFERENCE.md` § `lock_state` lifecycle, `docs/28-LOCK_CATALOG.md`, UC-070 A5, UC-004/UC-005, `docs/discovery/multivertical-booking/multivertical-booking.md` (the design: "expires after its snapshotted hold duration", `CANCELLED` with `APPROVAL_EXPIRED`, never a new status)

## Problem

A booking on a resource-scoped `MANUAL_APPROVAL` service starts `PENDING` with `resource_occupancy` rows in `lock_state = 'HOLD'` and `hold_expires_at = now + bookingPolicy.manualHoldMinutes` (default 30) — `booking-request.helpers.ts` (`DEFAULT_MANUAL_HOLD_MINUTES`, `resolveHoldExpiresAt`). Nothing reads that timestamp:

- no job in `application/jobs/` handles it (the only approval-expiry job is `expire-recurring-schedule-approvals.job.ts`, for `RecurringBookingSchedule`);
- no read query treats an expired `HOLD` as free (`typeorm-resource-occupancy.read-queries.ts` filters on `lock_state IN ('HOLD','COMMITTED')` only), and the exclusion constraint cannot, because a constraint cannot depend on `now()`;
- `ApproveBookingUseCase` does not check the deadline;
- `APPROVAL_EXPIRED` exists only as a recurring-schedule cancellation reason.

So a request nobody decides keeps its slot blocked until staff approve or reject it or the customer cancels, however long that takes, and the customer is never told. `docs/discovery/multivertical-booking/multivertical-booking.md` and UC-070 A5 ("same mechanic as an expired manual-approval appointment hold") both assume the booking-side expiry exists. `docs/13` said "expiry cancels and releases it"; `docs/27`, `docs/13` and UC-070 A5 were corrected on 2026-10-16 to say it is not built.

### Why this matters

A manager who ignores one request can keep a room or a staff member's slot unbookable for any number of days, and the availability read still shows it taken. The customer waits on a request that will never be answered and cannot tell. Recurring schedules do not have the problem (their own job cancels an unanswered request and emails the customer), which makes the gap easy to miss.

## Chosen approach (decided in the drafting session, 2026-10-16 — story-discovery has not yet run)

Candidates considered for "can the recurrence job and handler be reused?":

1. **Extend `ExpireRecurringBookingScheduleApprovalsJob` and its trigger handler to also expire bookings.** One job, one handler. Rejected: the job already does two things on one aggregate (expire a request, mark a term ended) and its constructor carries only schedule dependencies; a booking expiry needs the booking repository, the occupancy repository, the future-commitment exception repository, the tenant lock port and an event-publishing cancel — a different dependency set and failure profile. The handler nacks the whole trigger on any error, so a booking failure would also re-run the schedule work (idempotent, but coupled), and one consumer name would mean one inbox dedup key for two unrelated pieces of work.
2. **A sibling job and handler, same trigger, same shape. Chosen.** `ExpireBookingHoldsJob` + `ExpireBookingHoldsTriggerHandler` on `CRON_REMINDERS_TRIGGER` (every 30 minutes, no new Cloud Scheduler job), exactly as the four existing handlers each own one job. The job copies the *structure* the recurrence job proved — iterate active tenants, query each tenant-scoped, one transaction per item, sequential (`mapSequentially`), a failure is logged and retried by the next run — and reuses the *terminal-booking machinery*, not new code: `saveTerminalBookingsInTransaction` (`booking-exception-closing.helpers.ts`) already locks the occupied resources, locks and dismisses the booking's open future-commitment entries, saves the booking and releases its occupancy in the right lock order. No local-time window is needed (`WindowedTenantJob` is for jobs that must run in a tenant's local hours; expiry runs all day), so the job does not extend it.
3. **Lazy expiry — treat an expired `HOLD` as free at read time and let the next approve or booking request clean it up.** Rejected: the GIST exclusion constraint still counts the row, so a new booking on the slot would fail at the database anyway; the booking would stay `PENDING` in staff's queue; and the customer would still never be told. It is the "keep adding safeguards" shape CLAUDE.md §7 warns about.

Decisions baked in:
- **The state change is a domain method**, `Booking.expireApproval(correlationId)`, not `cancel()` with a magic reason: `cancel()` takes an identified actor and free-text reason, and the recurrence precedent has its own `expire()` on the aggregate. It transitions `PENDING → CANCELLED` through `transitionTo()` with a `SYSTEM` actor (so the `booking_status_transitions` audit row exists), sets `cancelledAt`, leaves `cancelledBy` null, and records the reason as the constant `APPROVAL_EXPIRED`. It raises `BookingCancelled` so the existing consumers still run — notably the availability-alert matcher, since the slot is genuinely freed.
- **The generic "cancelled by the establishment" email must not also go out.** `BookingCancelled` already carries `cancelledByScheduleEnd` for exactly this (a dedicated email replaces the generic one). The same shape is used here: a second flag, `cancelledByHoldExpiry`, and a dedicated template `BOOKING_APPROVAL_EXPIRED_CUSTOMER`. If a third flag is ever needed, replace the booleans with one `cancellationOrigin` enum then (event version bump) — not now.
- **Races** are settled by the lock, not the clock: the job reads the candidate bookings, then inside the transaction re-reads each under `findByIdForUpdate`-style locking and re-checks `status = PENDING` and that its hold is still past before expiring it. Approve, reject and cancel take the same resource locks first (`docs/28` §2), so exactly one wins; the loser sees a booking that is no longer `PENDING` and does nothing (job) or refuses (the use case's existing transition error).
- **Approve refuses a booking whose hold has passed even if the job has not run**, with a new `409` `BOOKING_APPROVAL_HOLD_EXPIRED` — the recurrence precedent (UC-071 A2: "the worker's schedule only delays the cleanup").
- **One partial index** supports the per-tenant sweep: `(tenant_id, hold_expires_at) WHERE lock_state = 'HOLD'` on `resource_occupancy`, tenant first. There is no cross-tenant query, so no standalone index.
- **Out of scope:** `REQUESTED` rows (degenerate services; no `hold_expires_at`, they never block); `AUTO_CONFIRM` bookings (created `COMMITTED`).

Decisions left for `/story-discovery` (business, not technical — ask the user):
1. **`INFO_REQUESTED`.** Staff asked the customer for more information, so the booking still holds its slot. Should the hold expire while the customer has the question, or should asking for information pause or extend the deadline? Recommendation: expire only `PENDING`; an `INFO_REQUESTED` booking keeps its hold until the customer responds or staff decide (matching "waiting on the customer is not staff silence") — but then the same indefinite-block problem exists for that state, so the discovery should either bound it separately or accept it explicitly.
2. **Late approve.** Refuse (recurrence precedent, recommended) or allow when the slot is still free?
3. **What the customer sees on the booking afterwards** (M23-S47 shows who cancelled and why): "A solicitação expirou sem resposta" rather than "O estabelecimento" — wording to confirm in both locales.

## Non-goals

- Making the hold duration configurable per tenant (it is per service already: `bookingPolicy.manualHoldMinutes`).
- Any change to recurring-schedule expiry.
- Retrying or re-requesting for the customer.

### Story 0 — Expire an unanswered manual-approval booking: job, domain transition, approve guard and customer email

**Agent:** backend-ts (small bff-ts / web-ts touches for the detail wording)
**Complexity:** L
**Docs to load:** `docs/27-BUSINESS_LOGIC_REFERENCE.md` § `lock_state` lifecycle and § Recurring Reservations (expiry job), `docs/28-LOCK_CATALOG.md` §2, `docs/04-USE_CASES.md` UC-001/UC-004/UC-005 and UC-070 A5, `docs/02-DOMAIN_MODEL.md` § `Booking`, `docs/03-DOMAIN_EVENTS.md` § `BookingCancelled`, `docs/ENGINEERING_RULES_BACKEND.md` § Transactions, § Event Handlers, § Adding a new notification type, § Choosing a race-condition primitive, `docs/ENGINEERING_RULES_SHARED.md` § Adding a new error — checklist
**Dependencies:** none
**Pattern:** plain composition — a sibling cron job mirroring `ExpireRecurringBookingScheduleApprovalsJob`, reusing `saveTerminalBookingsInTransaction`; no new named pattern applies

**Discovered:** 2026-10-16, closing M23 (reading `lock_state` for `docs/27`)
**Root cause:** `hold_expires_at` is written at `booking-request.helpers.ts` (`resolveHoldExpiresAt`) and never read — no consumer in `application/jobs/`, `typeorm-resource-occupancy.read-queries.ts` or `approve-booking.use-case.ts`.

**Description:**
Add the missing expiry for a single booking, following the decisions above. `ExpireBookingHoldsJob.run()` lists active tenants and, for each, queries the `PENDING` bookings that have at least one `HOLD` occupancy row with `hold_expires_at <= now` (a new `IBookingRepository` method, tenant-scoped). For each booking, in its own `txManager.run()`: lock via `saveTerminalBookingsInTransaction`'s sequence, re-check the booking is still `PENDING` and still past its hold, call `booking.expireApproval(correlationId)`, and persist/release through the shared helper (which also dismisses the booking's open future-commitment entries). A failure is logged and the next 30-minute run retries it. A `ExpireBookingHoldsTriggerHandler` registers the job on `CRON_REMINDERS_TRIGGER` with its own consumer name and nacks on error. `ApproveBookingUseCase` refuses a booking whose hold has passed (`BOOKING_APPROVAL_HOLD_EXPIRED`, 409). `BookingCancelled` gains `cancelledByHoldExpiry`; the notification handler sends `BOOKING_APPROVAL_EXPIRED_CUSTOMER` (says the request expired unanswered, nothing was booked, and they can request again; no staff name) instead of the generic cancelled email. The booking detail (M23-S47) and the status history show the system expiry rather than "O estabelecimento".

**Backend use case steps:**
1. `ExpireBookingHoldsJob.run(now)`: `tenantPort.findAllActive()`; per tenant, `bookingRepo.findPendingWithExpiredHold(tenantId, now)`; per booking, `mapSequentially` → `expireOne`.
2. `expireOne`: `txManager.run()` → reload the booking under lock, skip unless `status === PENDING` and its HOLD rows are still expired → `booking.expireApproval(correlationId)` → `saveTerminalBookingsInTransaction(deps, { tenantId, bookings: [booking], correlationId })`.
3. `Booking.expireApproval()`: `PENDING → CANCELLED` through `transitionTo()` with `{ type: 'SYSTEM', id: null }`, `cancelledAt = now`, `cancellationReason = 'APPROVAL_EXPIRED'`, raises `BookingCancelled` with `cancelledByHoldExpiry: true`.
4. `ApproveBookingUseCase`: before converting `HOLD → COMMITTED`, throw `BookingApprovalHoldExpiredError` when the booking's hold has passed.
5. Notification: `SendBookingCancelledNotificationUseCase` returns early for `cancelledByHoldExpiry`; a new use case sends `BOOKING_APPROVAL_EXPIRED_CUSTOMER` (pt-BR and en, escaped, formatted dates — the S37 correctness guard must render the real copy).

**Backend HTTP surface:** none new — a cron job; `POST /bookings/:id/approve` gains the new 409.
**BFF endpoint spec:** none new; the booking detail mappers pass through the new cancellation kind.
**Prototype references:** none — wording only on existing cards (`BookingTerminationCard`); confirm copy with the user at discovery.
**New migration / i18n keys / env vars / feature flags:** migration — partial index on `resource_occupancy (tenant_id, hold_expires_at) WHERE lock_state = 'HOLD'` (the discovery checks `docs/ANTI_PATTERNS.md` for how to create an index on a live table); notification-template migration for `BOOKING_APPROVAL_EXPIRED_CUSTOMER`; new error code `BOOKING_APPROVAL_HOLD_EXPIRED` in `@ikaro/types` with entries in **both** `packages/i18n/locales/{pt-BR,en}/errors.json`; web copy in both `web.json` locales; no env var, no flag.

**Files to create/modify:** (paths verified against siblings; the discovery re-verifies)
- `apps/backend/src/contexts/booking/application/jobs/expire-booking-holds.job.ts` (+ `.spec.ts`) (new)
- `apps/backend/src/contexts/booking/infrastructure/events/expire-booking-holds-trigger.handler.ts` (+ `.spec.ts`) (new)
- `apps/backend/src/contexts/booking/infrastructure/events/cron-trigger-names.constants.ts` (no change expected — reuses `CRON_REMINDERS_TRIGGER`)
- `apps/backend/src/contexts/booking/domain/booking.aggregate.ts` (+ `.spec.ts`) (modify — `expireApproval()`)
- `apps/backend/src/contexts/booking/domain/events/booking-cancelled.event.ts` (modify — `cancelledByHoldExpiry`)
- `apps/backend/src/contexts/booking/domain/errors/booking-domain.error.ts`, `infrastructure/http/booking-error.mapper.ts` (modify — `BookingApprovalHoldExpiredError` → 409)
- `apps/backend/src/contexts/booking/application/use-cases/approve-booking.use-case.ts` (+ `.spec.ts`) (modify)
- `apps/backend/src/contexts/booking/application/ports/booking-repository.port.ts`, `infrastructure/repositories/typeorm-booking.repository.ts` (modify — `findPendingWithExpiredHold`)
- `apps/backend/src/contexts/booking/booking.module-providers.ts` (modify — register job and handler)
- `apps/backend/src/contexts/booking/infrastructure/migrations/<timestamp>-AddResourceOccupancyHoldExpiryIndex.ts` (new)
- `apps/backend/src/contexts/notification/application/use-cases/send-booking-approval-expired-notification/` (+ `.spec.ts`), `.../send-booking-cancelled-notification/*.use-case.ts`, `infrastructure/events/booking-cancelled.handler.ts` (modify), notification-template migration (new), `notification/domain/notification-template-key.enum.ts` (modify)
- `packages/types/src/error-codes.ts`, `packages/i18n/locales/{pt-BR,en}/errors.json`, `{pt-BR,en}/web.json` (modify)
- `apps/bff/src/features/booking/bookings-detail.mapper.ts` (+ `.spec.ts`) (modify, if the cancellation kind must be exposed)
- `apps/web/features/booking/components/booking-detail/BookingTerminationCard.tsx` (+ `.spec.tsx`) and the status-history actor label (modify)
- `apps/backend/test/` builders and integration spec (modify), `apps/web/e2e/` (only if the card wording needs an end-to-end pin)
- Docs in the same change: `docs/27` (`lock_state` lifecycle: HOLD expires), `docs/13` (the `resource_occupancy` index, the `APPROVAL_EXPIRED` reason), `docs/04` (UC-001/004/005 expiry flow, UC-070 A5 wording), `docs/02`, `docs/03` (`BookingCancelled.cancelledByHoldExpiry`, new notification), `docs/28` (no new lock; confirm the order)
- `apps/backend/http/booking/bookings.http` (modify — the approve block gains the 409 sample)

**Acceptance criteria — product:**
- [ ] A `PENDING` booking on a resource-scoped `MANUAL_APPROVAL` service that nobody decides within its `manualHoldMinutes` becomes `CANCELLED` (reason `APPROVAL_EXPIRED`), its slot is bookable again, and the customer receives one email saying it expired unanswered and they may ask again.
- [ ] The customer does not also receive the generic "cancelled by the establishment" email.
- [ ] Staff approving a booking whose hold has passed (job not yet run) is refused with a clear message and the slot is not committed.
- [ ] An approved, rejected or customer-cancelled booking is never expired afterwards, and an approval that wins the race is never undone.
- [ ] The booking detail and the status history say the request expired without an answer (not "the establishment cancelled").
- [ ] A degenerate (`REQUESTED`) booking and an `AUTO_CONFIRM` booking are never touched.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `Booking.expireApproval()`: `PENDING → CANCELLED`, `SYSTEM` actor, audit transition, event flag; refuses from any other status
  - [ ] `ExpireBookingHoldsJob`: expires only expired `PENDING` holds; skips a booking that is no longer `PENDING` or whose hold is not past; one failure does not stop the rest; tenants iterated, each query tenant-scoped *(negative guarantee, own test: a still-valid hold is untouched)*
  - [ ] `ApproveBookingUseCase`: refuses a passed hold with `BOOKING_APPROVAL_HOLD_EXPIRED`; an unexpired hold still approves
  - [ ] Notification: expiry email sent once with the real pt-BR/en copy; generic cancelled email suppressed for `cancelledByHoldExpiry` *(negative guarantee, own test)*
  - [ ] Trigger handler registers on `cron-reminders` with its own consumer name and rethrows on failure
- Integration:
  - [ ] Real database: expiry releases the occupancy rows, the slot is bookable again, the `booking_status_transitions` row has a `SYSTEM` actor, open future-commitment entries are dismissed
  - [ ] Race: concurrent approve and expiry on one booking leaves exactly one outcome; no `40P01` (locks in `docs/28` order)
  - [ ] A `COMMITTED`, `REQUESTED` and `INFO_REQUESTED` (per the discovery decision) booking is not expired
- Tenant isolation:
  - [ ] Tenant B's expired hold is not expired by tenant A's pass, and tenant A's job never reads tenant B's bookings
- E2E:
  - [ ] none — a cron path; the approve refusal and the detail wording are covered by unit/integration (add one Playwright pin only if discovery changes the screen)
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

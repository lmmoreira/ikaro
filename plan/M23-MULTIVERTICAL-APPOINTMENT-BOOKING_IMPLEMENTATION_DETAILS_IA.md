# M23 — Multi-Vertical Scheduling: Appointment Booking & Extensions — Implementation Details (IA)

49 stories shipped 2026-09-01 → 2026-10-16 (PRs #515–#622). S10 (onboarding bootstrap) and S15 (wizard) moved to `M24-S21`/`M24-S22`. Rules and algorithms live in `docs/BUSINESS_LOGIC_REFERENCE.md`; locks in `docs/LOCK_CATALOG.md`; this file is the map.

## Artifacts

### Backend — booking context (`apps/backend/src/contexts/booking/`)

| Area | Artifacts |
|---|---|
| Aggregates | `RecurringBookingSchedule` (`PENDING_APPROVAL`/`ACTIVE`/`CANCELLED`/`ENDED`; no `PAUSED`), `AvailabilityAlert`, `FutureCommitmentException`; `Booking` gained `NO_SHOW`, `participantCount`, `attendees`, `intake`, `recurringScheduleId`, `createdByStaffId`, `cancelledAt/By`, `rejectedAt/By`; status changes only through `transitionTo()` (S26) |
| Resource resolution (S01, S32) | `selectionMode`-aware resolver: `CUSTOMER_CHOICE` / `AUTO_ANY` / `AUTO_FUNGIBLE_POOL` (a free unit, not the first eligible) / bundle / leg; approve and reschedule replay the whole resolution (and, since TD50, are held to the business hours and closures like creation) |
| Duration, intake (S02, S29) | `quote-service-duration`, `list-service-resource-options`; versioned intake labels resolved by booked version |
| Reschedule (S03, S30) | `reschedule-booking.use-case`, `reschedule-booking-as-customer.use-case`, `reschedule-quote.helpers`, `reschedule-booking-in-transaction.helpers`, `booking-reschedule-options.helpers`; `booking_quote_revisions` is append-only |
| Booking window (S33, S35) | one effective-window helper (per-service override never looser than the tenant, tenant-timezone dates); called by create, authenticated create, customer reschedule, recurring first occurrence, alert sweep |
| Recurring (S04, S05, S18, S20, S21, S28, S35) | `request-`, `approve-`, `reject-`, `end-`, `get-`, `list-recurring-booking-schedule(s)` use cases; `recurring-booking-schedule-request.helpers` (`assertPatternConflictFree()`, `enumerateRecurrenceOccurrences()`); `Booking.materializeRecurringOccurrence()` creates every occurrence `APPROVED` once, at creation or approval; fixed term, `endsOn` required and capped by `recurringHorizonDays` (default 90) |
| Worklist (S08, S14, S45, S46, S48) | `raise-/list-/count-/resolve-/dismiss-future-commitment-exceptions`, `raise-future-commitment-exceptions-for-resource`; stale/sibling entries closed in the cancel/reject/reschedule/end transaction (S48); reactivating a resource closes its entries (S45) |
| Alerts (S06, S07, S31, S34, S38, S44) | `create-/get-/list-/update-/cancel-availability-alert`, `match-availability-alerts(-for-booking)`, `record-availability-alert-outcome`; matched on freed capacity (cancel, reject, reschedule) plus a daily sweep |
| No-show (S09, S25, S27) | `mark-booking-no-show`, `correct-booking-no-show` (manager only, `NO_SHOW → COMPLETED`) |
| Staff booking (S39, S40, S19) | `create-booking-by-staff` (created `APPROVED`; customer or guest); staff recurring create skips approval |
| Detail read (S47) | `get-booking-by-id` + `booking-detail-resources.helpers` / `booking-detail-extras.helpers`; opt-in `includeDetailExtras` (off by default — the loyalty adapter calls this use case); `findLatestResourceAssignments` on `IBookingRepository` |

### Backend — controllers (booking context)

`availability-alert.controller.ts`, `recurring-booking-schedule.controller.ts`, `scheduling-exception.controller.ts`, `service-public.controller.ts` (new); `booking.controller.ts` gained `/no-show`, `/no-show/correct`, `/staff`, customer reschedule, the extended `GET /:id`.

### Backend — shared (S36, S49)

`LogDomainEventUseCase` + one thin `<Context>AuditLogHandler` per context (every event needs a `subscribe(…, LogDomainEventUseCase.CONSUMER_NAME)` line — CI `domain-event-audit-coverage`); `run-in-new-transaction.ts` sets a 2s transaction-local `lock_timeout`; `transaction-contention.error.ts` + `error.filter.ts` map lock timeout / `40P01` to a retryable 503 `AUTH_TRANSACTION_CONTENTION` with `Retry-After: 1`.

### BFF (`apps/bff/src/features/booking/`)

`availability-alerts.controller.ts`, `bookings-no-show.controller.ts`, `recurring-booking-schedules.controller.ts`, `scheduling-exceptions.controller.ts`; `bookings-detail.mapper.ts` (staff and customer subsets of the by-id read; the customer mapper never carries `adminNotes`, `createdByStaffId`/`createdByName`, `consentVersion` or the cancel/reject actor id).

### Web — routes (new)

| Audience | Routes |
|---|---|
| Customer | `/[slug]/booking/availability-alert`; `/[slug]/my-account/alerts[/id[/cancel]]`; `/[slug]/my-account/recurring-schedules[/new|/id[/end]]`; `/[slug]/my-account/bookings/[id]/reschedule` |
| Staff | `/dashboard/bookings/new[/booking]`; `/dashboard/bookings/recurring/[id]` and `/new`; `/dashboard/scheduling-exceptions[/exceptionId/reschedule]` |

Shared read-only detail cards: `apps/web/features/booking/components/booking-detail/` (`BookingResourcesCard`, `BookingItineraryCard`, `BookingParticipantsCard`, `BookingIntakeCard`, `BookingAddressesCard`, `BookingOriginCard`, `BookingTerminationCard`, `BookingTextCard`); staff `StaffBookingExtras`, customer `CustomerBookingExtras`.

## DB Schema (`booking` schema; migrations `1748500000016`–`035`)

| Migration | Change |
|---|---|
| 016 | `booking_quote_revisions` (append-only) |
| 017, 018, 022, 028 | `recurring_booking_schedules`; `endsOn` required; `ENDED` status; `STAFF_CANCELLED` reason |
| 019 | `PAUSED` removed (rows became `CANCELLED` / `CUSTOMER_CANCELLED`) — S20 |
| 020 | `future_commitment_exceptions` |
| 021 | drop `recurring_booking_schedule_exceptions` — S24, after S08 stopped using it |
| 023, 027 | `booking_status_transitions` (no backfill), reason widened to TEXT |
| 024 | legged service duration backfilled to its leg span |
| 025 | `gap_minutes` / `gap_source` on `resource_occupancy` |
| 026, 030 | `availability_alerts`; attempt tracking |
| 033 | `bookings.created_by_staff_id` |
| notification 029, 031, 032, 034, 035 | templates: recurring lifecycle, alert matched, no-show, renewal due, worklist |

## Domain events (15 new)

`AvailabilityAlert{Created,Updated,Cancelled,Expired,Matched}`, `BookingNoShow`, `BookingResourceReassigned`, `FutureCommitmentException{Raised,Resolved,Dismissed}`, `RecurringBookingSchedule{Created,ApprovalRequested,Rejected,Ended}`, `ResourceDeactivationImpactRaised`. Raised has **no** Notification consumer by design (one email per booking); the manager alert hangs on `ResourceDeactivationImpactRaised`.

## Cron

All ride the existing `cron-reminders` trigger (every 30 min, no new Scheduler job): `AvailabilityAlertSweep`, `ExpireAvailabilityAlerts`, `ExpireRecurringScheduleApprovals`, `RecurringScheduleRenewalReminder`; one shared windowed-tenant runner (#594) drives the cron jobs, and the renewal reminder retries on failure.

## Structural Decisions / Gotchas

- **Recurrence is materialize-once.** No rolling generation, no `PAUSED`, no per-occurrence exception table: an occurrence is its linked booking, so skip = that booking's cancel and reschedule = its reschedule, under the tenant's normal windows. Availability sees occurrences as ordinary bookings (`docs/USE_CASES` § resource availability was corrected after the milestone).
- **Nothing moves a booking silently.** Deactivation only records a `FutureCommitmentException`; a manager keeps, reassigns, reschedules or cancels (bulk, one request).
- **`booking_line_resource_assignments` is the durable record; `resource_occupancy` is not** — cancel/reject delete occupancy rows. The detail read takes the *latest* assignment per slot, and leg times only while occupancy rows exist (`null` otherwise).
- **Cross-actor disclosure:** a customer's own cancel stores no reason; the customer sees `Você` / `O estabelecimento` as a role label only. A leg's resource name is revealed to the customer whatever its selection mode (UC-065); a flat resource whose requirement was later removed is hidden.
- **Lock order** (`docs/LOCK_CATALOG` §2): tenant row → entity keys → service rows → resource advisory locks → exception rows → booking → occupancy. S48 closes entries inside the same transaction under that order.
- **New Pub/Sub topic = a Foundation apply step**, otherwise the topic exists but is not publishable (#537; M23-S04 precedent: three topics shipped ungranted).
- **`includeDetailExtras` defaults off.** Any caller that doesn't need the extras (loyalty adapter) must not pay for them.
- **Customer vs staff `GET /bookings/:id`:** one backend read, two BFF subsets; guard any new field with a negative mapper test.
- **Error codes:** `BOOKING_RECURRING_SCHEDULE_*` (cap, conflict, forbidden, ineligible service, invalid date range, not active, not found, not pending approval, no occurrences, term exceeded), `BOOKING_ALERT_*`, `BOOKING_EXCEPTION_*`, `BOOKING_TOO_SOON` / `BOOKING_TOO_FAR_AHEAD`, `BOOKING_RESCHEDULE_WINDOW_EXPIRED`, `BOOKING_NOT_YET_ENDED`, `BOOKING_ALREADY_TERMINAL`, `BOOKING_RESOURCE_SELECTION_REQUIRED`, `BOOKING_LEG_UNAVAILABLE`, `BOOKING_BUNDLE_PARTIALLY_UNAVAILABLE`, `BOOKING_DURATION_OUT_OF_RANGE`; each has a translation in both `errors.json` locales.

## Auth Model

Customer: own schedules/alerts/bookings. STAFF|MANAGER: all in tenant; approve/reject recurrence, no-show. MANAGER only: no-show correction, the worklist (`/scheduling-exceptions`). Staff skip recurrence approval (they are the approver, as in UC-108). Staff are exempt from the booking window (UC-070 A10).

## Test Infrastructure

Builders in `src/test/builders/booking/` for every new entity; `InMemory*` doubles, never `jest.fn()` port stubs; E2E helpers under `apps/web/e2e/helpers/booking/` (`detail-seed.ts`). Real-database tests cover alert sweep, window DST, cross-tenant openings, lock timeout (`run-in-new-transaction.integration`).

## Follow-ups tracked, not dropped

- A cancelled recurring schedule can't say whether it was rejected, expired or ended by someone (the read carries no `cancellationReason`).
- **`hold_expires_at` is enforced since TD51, not by an M23 story** (`docs/BUSINESS_LOGIC_REFERENCE` § `lock_state` lifecycle): `ExpireBookingHoldsJob` (consumer `booking-hold-expiry` on `cron-reminders`) cancels a `PENDING` request past its hold as the system; `INFO_REQUESTED` is never expired and a customer's answer restarts the hold; approve refuses a passed deadline (`BOOKING_APPROVAL_HOLD_EXPIRED`).

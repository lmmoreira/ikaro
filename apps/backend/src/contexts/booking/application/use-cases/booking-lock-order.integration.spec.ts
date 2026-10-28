import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TRANSACTION_MANAGER } from '../../../../shared/ports/transaction-manager.port';
import { BookingBuilder, BookingLineBuilder } from '../../../../test/builders/booking/index';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import {
  bookingStatus,
  createLockRaceWorld,
  databaseNow,
  entryRowIsFree,
  entryStatus,
  holdResourceLocks,
  holdTransaction,
  LockRaceEnv,
  LockRaceWorld,
  LockRaceWorldOptions,
  openEntriesOf,
  resourceLockIsFree,
  waitForBlockedLock,
} from '../../../../test/utils/booking-lock-race-world';
import { openSlot } from '../../../../test/utils/date-helpers';
import { DEFAULT_TEST_BUSINESS_HOURS } from '../../../../test/utils/business-hours-fixtures';
import { occupiedResourceIds } from '../../../../test/utils/future-commitment-db-fixture';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ExpireBookingHoldsJob } from '../jobs/expire-booking-holds.job';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { RESOURCE_OCCUPANCY_REPOSITORY } from '../ports/resource-occupancy-repository.port';
import { BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { SCHEDULE_CLOSURE_REPOSITORY } from '../ports/schedule-closure-repository.port';
import { SCHEDULE_OPENING_REPOSITORY } from '../ports/schedule-opening-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { persistRequestedBooking } from './booking-request.helpers';
import { ApproveBookingUseCase } from './approve-booking.use-case';
import { CancelBookingAsAdminUseCase } from './cancel-booking-as-admin.use-case';
import { CancelBookingAsCustomerUseCase } from './cancel-booking-as-customer.use-case';
import { DeactivateResourceUseCase } from './deactivate-resource.use-case';
import { EndRecurringBookingScheduleUseCase } from './end-recurring-booking-schedule.use-case';
import { RejectBookingUseCase } from './reject-booking.use-case';
import { RescheduleBookingAsCustomerUseCase } from './reschedule-booking-as-customer.use-case';
import { RescheduleBookingUseCase } from './reschedule-booking.use-case';
import { ResolveFutureCommitmentExceptionsUseCase } from './resolve-future-commitment-exceptions.use-case';

const STAFF_ID = '20000000-0000-4000-8000-0000000000d1';
const TIMEZONE = 'America/Sao_Paulo';

// docs/LOCK_CATALOG.md § 2 and docs/TESTING_STRATEGY.md § Concurrency tests. Two kinds of
// test, both with a tenant of their own per scenario:
//  - lock contract (deterministic): hold the resource lock of a booking's resource, start the
//    operation, and prove it waits for that lock without already owning the booking's worklist
//    entry. That is the lock order which makes a deadlock impossible, and it holds on every run.
//  - race (bounded): run two real operations at once a few times and assert the invariant. It can
//    find a regression, it cannot prove there is none.
describe('booking lock order (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let env: LockRaceEnv;
  let cancelAsAdmin: CancelBookingAsAdminUseCase;
  let cancelAsCustomer: CancelBookingAsCustomerUseCase;
  let reject: RejectBookingUseCase;
  let endRecurring: EndRecurringBookingScheduleUseCase;
  let rescheduleAsStaff: RescheduleBookingUseCase;
  let rescheduleAsCustomer: RescheduleBookingAsCustomerUseCase;
  let approve: ApproveBookingUseCase;
  let expireHolds: ExpireBookingHoldsJob;
  let resolve: ResolveFutureCommitmentExceptionsUseCase;
  let deactivate: DeactivateResourceUseCase;

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
    env = {
      ds,
      txManager: app.get(TRANSACTION_MANAGER),
      occupancyRepo: app.get(RESOURCE_OCCUPANCY_REPOSITORY),
      tenantLock: app.get(TENANT_LOCK_PORT),
    };
    cancelAsAdmin = app.get(CancelBookingAsAdminUseCase);
    cancelAsCustomer = app.get(CancelBookingAsCustomerUseCase);
    reject = app.get(RejectBookingUseCase);
    endRecurring = app.get(EndRecurringBookingScheduleUseCase);
    rescheduleAsStaff = app.get(RescheduleBookingUseCase);
    rescheduleAsCustomer = app.get(RescheduleBookingAsCustomerUseCase);
    approve = app.get(ApproveBookingUseCase);
    expireHolds = app.get(ExpireBookingHoldsJob);
    resolve = app.get(ResolveFutureCommitmentExceptionsUseCase);
    deactivate = app.get(DeactivateResourceUseCase);
  });

  afterAll(async () => {
    await app.close();
  });

  const newSlot = () => openSlot(9);

  // A scenario seeds its own world and returns what to run and what must be true afterwards.
  interface Prepared {
    entryId: string;
    tenantId: string;
    start: () => Promise<unknown>;
    verify: () => Promise<void>;
  }
  type Scenario = [
    name: string,
    prepare: (world: LockRaceWorld) => Promise<Prepared>,
    worldOptions?: LockRaceWorldOptions,
  ];

  const onRoomA = async (world: LockRaceWorld, status: 'APPROVED' | 'PENDING' = 'APPROVED') =>
    world.seedBooking({ resources: [world.roomA], status });

  const scenarios: Scenario[] = [
    [
      'a staff cancel',
      async (world) => {
        const { bookingId, entryIds } = await onRoomA(world);
        return {
          entryId: entryIds[0],
          tenantId: world.tenantId,
          start: () =>
            cancelAsAdmin.execute({
              bookingId,
              tenantId: world.tenantId,
              staffId: STAFF_ID,
              actorRole: 'STAFF',
              correlationId: uuidv7(),
            }),
          verify: async () => {
            expect(await entryStatus(ds, world.tenantId, entryIds[0])).toBe('DISMISSED');
            expect(await bookingStatus(ds, world.tenantId, bookingId)).toBe('CANCELLED');
          },
        };
      },
    ],
    [
      'a customer cancel',
      async (world) => {
        const customerId = uuidv7();
        const { bookingId, entryIds } = await world.seedBooking({
          resources: [world.roomA],
          customerId,
        });
        return {
          entryId: entryIds[0],
          tenantId: world.tenantId,
          start: () =>
            cancelAsCustomer.execute({
              bookingId,
              tenantId: world.tenantId,
              customerId,
              correlationId: uuidv7(),
              cancellationWindowHours: 48,
            }),
          verify: async () => {
            expect(await entryStatus(ds, world.tenantId, entryIds[0])).toBe('DISMISSED');
            expect(await bookingStatus(ds, world.tenantId, bookingId)).toBe('CANCELLED');
          },
        };
      },
    ],
    [
      'rejecting a pending booking',
      async (world) => {
        const { bookingId, entryIds } = await onRoomA(world, 'PENDING');
        return {
          entryId: entryIds[0],
          tenantId: world.tenantId,
          start: () =>
            reject.execute({
              bookingId,
              tenantId: world.tenantId,
              staffId: STAFF_ID,
              actorRole: 'STAFF',
              correlationId: uuidv7(),
              reason: 'no capacity for that day',
            }),
          verify: async () => {
            expect(await entryStatus(ds, world.tenantId, entryIds[0])).toBe('DISMISSED');
            expect(await bookingStatus(ds, world.tenantId, bookingId)).toBe('REJECTED');
          },
        };
      },
    ],
    [
      'ending a recurring schedule',
      async (world) => {
        const customerId = uuidv7();
        const scheduleId = await world.seedSchedule(customerId);
        const { bookingId, entryIds } = await world.seedBooking({
          resources: [world.roomA],
          customerId,
          recurringScheduleId: scheduleId,
        });
        return {
          entryId: entryIds[0],
          tenantId: world.tenantId,
          start: () =>
            endRecurring.execute({
              scheduleId,
              tenantId: world.tenantId,
              correlationId: uuidv7(),
              actorId: customerId,
              actorRole: 'CUSTOMER',
            }),
          verify: async () => {
            expect(await entryStatus(ds, world.tenantId, entryIds[0])).toBe('DISMISSED');
            expect(await bookingStatus(ds, world.tenantId, bookingId)).toBe('CANCELLED');
          },
        };
      },
    ],
    [
      "the worklist's CANCEL",
      async (world) => {
        const { bookingId, entryIds } = await onRoomA(world);
        return {
          entryId: entryIds[0],
          tenantId: world.tenantId,
          start: () =>
            resolve.execute({
              tenantId: world.tenantId,
              staffId: STAFF_ID,
              actorRole: 'MANAGER',
              correlationId: uuidv7(),
              timezone: TIMEZONE,
              businessHours: DEFAULT_TEST_BUSINESS_HOURS,
              tenantServiceBufferMinutes: 60,
              exceptionIds: [entryIds[0]],
              resolutionType: 'CANCEL',
            }),
          verify: async () => {
            expect(await entryStatus(ds, world.tenantId, entryIds[0])).toBe('RESOLVED');
            expect(await bookingStatus(ds, world.tenantId, bookingId)).toBe('CANCELLED');
          },
        };
      },
    ],
    [
      "the worklist's RESCHEDULE",
      async (world) => {
        const { bookingId, entryIds } = await onRoomA(world);
        await world.deactivate(world.roomA);
        return {
          entryId: entryIds[0],
          tenantId: world.tenantId,
          start: () =>
            resolve.execute({
              tenantId: world.tenantId,
              staffId: STAFF_ID,
              actorRole: 'MANAGER',
              correlationId: uuidv7(),
              timezone: TIMEZONE,
              businessHours: DEFAULT_TEST_BUSINESS_HOURS,
              tenantServiceBufferMinutes: 60,
              exceptionIds: [entryIds[0]],
              resolutionType: 'RESCHEDULE',
              scheduledAt: newSlot(),
            }),
          verify: async () => {
            expect(await entryStatus(ds, world.tenantId, entryIds[0])).toBe('RESOLVED');
            expect(await occupiedResourceIds(ds, world.tenantId, bookingId)).toEqual([
              world.roomB.id,
            ]);
          },
        };
      },
    ],
    [
      'a staff reschedule off a deactivated resource',
      async (world) => {
        const { bookingId, entryIds } = await onRoomA(world);
        await world.deactivate(world.roomA);
        return {
          entryId: entryIds[0],
          tenantId: world.tenantId,
          start: () =>
            rescheduleAsStaff.execute({
              bookingId,
              scheduledAt: newSlot(),
              tenantId: world.tenantId,
              staffId: STAFF_ID,
              correlationId: uuidv7(),
              timezone: TIMEZONE,
              businessHours: DEFAULT_TEST_BUSINESS_HOURS,
              tenantServiceBufferMinutes: 60,
            }),
          verify: async () => {
            expect(await entryStatus(ds, world.tenantId, entryIds[0])).toBe('DISMISSED');
            expect(await occupiedResourceIds(ds, world.tenantId, bookingId)).toEqual([
              world.roomB.id,
            ]);
          },
        };
      },
    ],
    [
      "a staff reschedule that overrides the customer's chosen room",
      async (world) => {
        // Every requirement is customer-chosen, so the candidate step locks nothing by itself and
        // the replayed pick is replaced by the override: only the lock on the resources the
        // booking holds now keeps a deactivation of the old room ordered against the move.
        const { bookingId, entryIds } = await onRoomA(world);
        return {
          entryId: entryIds[0],
          tenantId: world.tenantId,
          start: () =>
            rescheduleAsStaff.execute({
              bookingId,
              scheduledAt: newSlot(),
              tenantId: world.tenantId,
              staffId: STAFF_ID,
              correlationId: uuidv7(),
              timezone: TIMEZONE,
              businessHours: DEFAULT_TEST_BUSINESS_HOURS,
              tenantServiceBufferMinutes: 60,
              resourceSelections: [
                { serviceId: world.serviceId, resourceType: 'ROOM', resourceId: world.roomB.id },
              ],
            }),
          verify: async () => {
            expect(await entryStatus(ds, world.tenantId, entryIds[0])).toBe('DISMISSED');
            expect(await occupiedResourceIds(ds, world.tenantId, bookingId)).toEqual([
              world.roomB.id,
            ]);
          },
        };
      },
      { selectionMode: 'CUSTOMER_CHOICE' },
    ],
    [
      'a customer reschedule off a deactivated resource',
      async (world) => {
        const customerId = uuidv7();
        const { bookingId, entryIds } = await world.seedBooking({
          resources: [world.roomA],
          customerId,
        });
        await world.deactivate(world.roomA);
        return {
          entryId: entryIds[0],
          tenantId: world.tenantId,
          start: () =>
            rescheduleAsCustomer.execute({
              bookingId,
              scheduledAt: newSlot(),
              tenantId: world.tenantId,
              customerId,
              correlationId: uuidv7(),
              timezone: TIMEZONE,
              businessHours: DEFAULT_TEST_BUSINESS_HOURS,
              tenantServiceBufferMinutes: 60,
              tenantDefaultRescheduleWindowHours: 48,
              tenantBookingWindow: { minBookingAdvanceHours: 0, maxBookingAdvanceDays: 90 },
            }),
          verify: async () => {
            expect(await entryStatus(ds, world.tenantId, entryIds[0])).toBe('DISMISSED');
            expect(await occupiedResourceIds(ds, world.tenantId, bookingId)).toEqual([
              world.roomB.id,
            ]);
          },
        };
      },
    ],
    [
      'the hold-expiry job cancelling a request nobody answered',
      async (world) => {
        const { bookingId, entryIds } = await world.seedBooking({
          resources: [world.roomA],
          status: 'PENDING',
          holdExpiresAt: new Date(Date.now() - 60_000),
        });
        return {
          entryId: entryIds[0],
          tenantId: world.tenantId,
          start: () => expireHolds.expireForTenant(world.tenantId),
          verify: async () => {
            expect(await entryStatus(ds, world.tenantId, entryIds[0])).toBe('DISMISSED');
            expect(await bookingStatus(ds, world.tenantId, bookingId)).toBe('CANCELLED');
            expect(await occupiedResourceIds(ds, world.tenantId, bookingId)).toEqual([]);
          },
        };
      },
    ],
    [
      'approving a pending booking whose resource was deactivated',
      async (world) => {
        const { bookingId, entryIds } = await onRoomA(world, 'PENDING');
        await world.deactivate(world.roomA);
        return {
          entryId: entryIds[0],
          tenantId: world.tenantId,
          start: () =>
            approve.execute({
              bookingId,
              tenantId: world.tenantId,
              staffId: STAFF_ID,
              actorRole: 'STAFF',
              correlationId: uuidv7(),
              timezone: TIMEZONE,
              businessHours: DEFAULT_TEST_BUSINESS_HOURS,
              tenantServiceBufferMinutes: 60,
            }),
          verify: async () => {
            expect(await entryStatus(ds, world.tenantId, entryIds[0])).toBe('DISMISSED');
            expect(await occupiedResourceIds(ds, world.tenantId, bookingId)).toEqual([
              world.roomB.id,
            ]);
          },
        };
      },
    ],
  ];

  describe('lock contract: waits for the resource lock without owning the entry row', () => {
    // One object per row, never the row itself: jest spreads a tuple into arguments, and a row
    // shorter than the callback's parameter list makes it pass `done`, so the test then waits for
    // a callback that never comes and only fails when its timeout runs out.
    it.each(scenarios.map(([name, prepare, worldOptions]) => ({ name, prepare, worldOptions })))(
      '$name',
      async ({ prepare, worldOptions }) => {
        const world = await createLockRaceWorld(env, worldOptions);
        const run = await prepare(world);
        const held = await holdResourceLocks(env, world.tenantId, [world.roomA.id]);
        try {
          const since = await databaseNow(ds);
          let finished = false;
          const operation = run.start().then((result) => {
            finished = true;
            return result;
          });
          await Promise.race([
            waitForBlockedLock(ds, 'advisory', since),
            operation.then(() => {
              throw new Error('the operation finished without ever waiting for the resource lock');
            }),
          ]);
          expect(finished).toBe(false);
          expect(await entryRowIsFree(ds, run.tenantId, run.entryId)).toBe(true);

          await held.release();
          await operation;
          await run.verify();
        } finally {
          await held.release();
        }
      },
    );
  });

  describe('lock contract: a one-off booking takes the service row before any resource lock', () => {
    it('waits behind a held service row without having taken the candidate resource locks', async () => {
      const world = await createLockRaceWorld(env);
      const serviceRepo = app.get<IServiceRepository>(SERVICE_REPOSITORY);
      const held = await holdTransaction(env, () =>
        serviceRepo.findByIdForUpdate(world.serviceId, world.tenantId),
      );
      try {
        const service = (await serviceRepo.findByIds([world.serviceId], world.tenantId))[0];
        const booking = new BookingBuilder()
          .withTenantId(world.tenantId)
          .withLines([new BookingLineBuilder().withServiceId(world.serviceId).build()])
          .build();
        const since = await databaseNow(ds);
        let finished = false;
        const persisted = persistRequestedBooking(
          {
            txManager: env.txManager,
            slotConflictService: app.get(BookingSlotConflictService),
            bookingRepo: app.get(BOOKING_REPOSITORY),
            photoExistenceService: app.get(PhotoExistenceService),
            serviceRepo,
            resourceRepo: app.get(RESOURCE_REPOSITORY),
            occupancyRepo: env.occupancyRepo,
            availabilityService: app.get(AvailabilityService),
            hoursRepos: {
              closureRepo: app.get(SCHEDULE_CLOSURE_REPOSITORY),
              openingRepo: app.get(SCHEDULE_OPENING_REPOSITORY),
            },
          },
          {
            booking,
            tenantId: world.tenantId,
            scheduledAt: new Date(newSlot()),
            timezone: TIMEZONE,
            businessHours: DEFAULT_TEST_BUSINESS_HOURS,
            tenantServiceBufferMinutes: 60,
            operations: [],
            serviceMap: new Map([[service.id, service]]),
            resourceSelections: [],
          },
        ).then((result) => {
          finished = true;
          return result;
        });
        await Promise.race([
          waitForBlockedLock(ds, 'row', since),
          persisted.then(() => {
            throw new Error('the booking was created without waiting for the service row');
          }),
        ]);

        expect(finished).toBe(false);
        expect(await resourceLockIsFree(ds, world.tenantId, world.roomA.id)).toBe(true);
        expect(await resourceLockIsFree(ds, world.tenantId, world.roomB.id)).toBe(true);

        await held.release();
        await persisted;
      } finally {
        await held.release();
      }
    });
  });

  // A deadlock abort (SQLSTATE 40P01) must never be how a race ends.
  function expectNoDeadlock(results: PromiseSettledResult<unknown>[]): void {
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(
          JSON.stringify(result.reason, Object.getOwnPropertyNames(result.reason)),
        ).not.toMatch(/40P01|deadlock/i);
      }
    }
  }

  describe('races: no deadlock, and no open entry on a booking that no longer needs a decision', () => {
    it('a staff cancel racing the worklist cancelling the same booking', async () => {
      for (let round = 0; round < 3; round++) {
        const world = await createLockRaceWorld(env);
        const { bookingId, entryIds } = await world.seedBooking({
          resources: [world.roomA, world.roomB],
        });

        const results = await Promise.allSettled([
          cancelAsAdmin.execute({
            bookingId,
            tenantId: world.tenantId,
            staffId: STAFF_ID,
            actorRole: 'STAFF',
            correlationId: uuidv7(),
          }),
          resolve.execute({
            tenantId: world.tenantId,
            staffId: STAFF_ID,
            actorRole: 'MANAGER',
            correlationId: uuidv7(),
            timezone: TIMEZONE,
            businessHours: DEFAULT_TEST_BUSINESS_HOURS,
            tenantServiceBufferMinutes: 60,
            exceptionIds: [entryIds[0]],
            resolutionType: 'CANCEL',
          }),
        ]);

        expectNoDeadlock(results);
        expect(await bookingStatus(ds, world.tenantId, bookingId)).toBe('CANCELLED');
        expect(await openEntriesOf(ds, world.tenantId, bookingId)).toEqual([]);
      }
    });

    it('a cancel racing the deactivation that raises its entry', async () => {
      for (let round = 0; round < 6; round++) {
        const world = await createLockRaceWorld(env);
        const { bookingId } = await world.seedBooking({ resources: [world.roomA] });
        await ds.query(`DELETE FROM booking.future_commitment_exceptions WHERE tenant_id = $1`, [
          world.tenantId,
        ]);

        const results = await Promise.allSettled([
          cancelAsAdmin.execute({
            bookingId,
            tenantId: world.tenantId,
            staffId: STAFF_ID,
            actorRole: 'STAFF',
            correlationId: uuidv7(),
          }),
          deactivate.execute({
            id: world.roomA.id,
            tenantId: world.tenantId,
            correlationId: uuidv7(),
          }),
        ]);

        expectNoDeadlock(results);
        expect(await bookingStatus(ds, world.tenantId, bookingId)).toBe('CANCELLED');
        expect(await openEntriesOf(ds, world.tenantId, bookingId)).toEqual([]);
      }
    });

    it('ending a recurring schedule racing the deactivation of a resource its occurrences hold', async () => {
      for (let round = 0; round < 3; round++) {
        const world = await createLockRaceWorld(env);
        const customerId = uuidv7();
        const scheduleId = await world.seedSchedule(customerId);
        const { bookingId } = await world.seedBooking({
          resources: [world.roomA],
          customerId,
          recurringScheduleId: scheduleId,
        });
        await ds.query(`DELETE FROM booking.future_commitment_exceptions WHERE tenant_id = $1`, [
          world.tenantId,
        ]);

        const results = await Promise.allSettled([
          endRecurring.execute({
            scheduleId,
            tenantId: world.tenantId,
            correlationId: uuidv7(),
            actorId: customerId,
            actorRole: 'CUSTOMER',
          }),
          deactivate.execute({
            id: world.roomA.id,
            tenantId: world.tenantId,
            correlationId: uuidv7(),
          }),
        ]);

        expectNoDeadlock(results);
        expect(await bookingStatus(ds, world.tenantId, bookingId)).toBe('CANCELLED');
        expect(await openEntriesOf(ds, world.tenantId, bookingId)).toEqual([]);
      }
    });

    it('a reschedule racing the deactivation of the resource it moves away from', async () => {
      for (let round = 0; round < 3; round++) {
        const world = await createLockRaceWorld(env);
        const { bookingId } = await world.seedBooking({ resources: [world.roomA] });
        await ds.query(`DELETE FROM booking.future_commitment_exceptions WHERE tenant_id = $1`, [
          world.tenantId,
        ]);

        const results = await Promise.allSettled([
          rescheduleAsStaff.execute({
            bookingId,
            scheduledAt: newSlot(),
            tenantId: world.tenantId,
            staffId: STAFF_ID,
            correlationId: uuidv7(),
            timezone: TIMEZONE,
            businessHours: DEFAULT_TEST_BUSINESS_HOURS,
            tenantServiceBufferMinutes: 60,
          }),
          deactivate.execute({
            id: world.roomA.id,
            tenantId: world.tenantId,
            correlationId: uuidv7(),
          }),
        ]);

        expectNoDeadlock(results);
        const occupied = await occupiedResourceIds(ds, world.tenantId, bookingId);
        const open = await openEntriesOf(ds, world.tenantId, bookingId);
        // An entry stays open only for a resource the booking still holds.
        for (const entry of open) expect(occupied).toContain(entry.sourceId);
      }
    });
  });
});

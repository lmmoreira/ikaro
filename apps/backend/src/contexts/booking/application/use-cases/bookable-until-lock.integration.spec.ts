import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  BOOKABLE_UNTIL_LOCK_PORT,
  type BookableUntilLockPort,
} from '../../../../shared/ports/bookable-until-lock.port';
import { TENANT_ACCESS_PORT } from '../../../../shared/ports/tenant-access.port';
import { TRANSACTION_MANAGER } from '../../../../shared/ports/transaction-manager.port';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { BookingBuilder, BookingLineBuilder } from '../../../../test/builders/booking/index';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import {
  createLockRaceWorld,
  databaseNow,
  holdTransaction,
  LockRaceEnv,
  LockRaceWorld,
  waitForBlockedLock,
} from '../../../../test/utils/booking-lock-race-world';
import { DEFAULT_TEST_BUSINESS_HOURS } from '../../../../test/utils/business-hours-fixtures';
import { openSlot } from '../../../../test/utils/date-helpers';
import { BookingTooFarAheadError } from '../../domain/errors/booking-domain.error';
import { AvailabilityService } from '../../domain/services/availability.service';
import { BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { RESOURCE_OCCUPANCY_REPOSITORY } from '../ports/resource-occupancy-repository.port';
import { RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { SCHEDULE_CLOSURE_REPOSITORY } from '../ports/schedule-closure-repository.port';
import { SCHEDULE_OPENING_REPOSITORY } from '../ports/schedule-opening-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { BookableUntilGuard } from '../services/bookable-until.guard';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { persistRequestedBooking } from './booking-request.helpers';

const TIMEZONE = 'America/Sao_Paulo';

// docs/LOCK_CATALOG.md B-U1 (M26-S18b). The plan save of S19 does not exist yet, so its side is
// driven directly: a transaction holding the lock in exclusive mode, exactly what S19 takes. Each
// scenario seeds a tenant of its own. Three contract tests, mutation-checked: remove the lock from
// `BookableUntilGuard.acquire` and the first one never sees a blocked session; make the Booking
// side exclusive and the third one waits for the lock timeout.
describe('the bookable-until lock (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let env: LockRaceEnv;
  let lock: BookableUntilLockPort;
  let access: InMemoryTenantAccessPort;

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
    env = {
      ds,
      txManager: app.get(TRANSACTION_MANAGER),
      occupancyRepo: app.get(RESOURCE_OCCUPANCY_REPOSITORY),
      tenantLock: app.get(TENANT_LOCK_PORT),
    };
    lock = app.get(BOOKABLE_UNTIL_LOCK_PORT);
    access = app.get(TENANT_ACCESS_PORT);
  });

  afterAll(async () => {
    await app.close();
  });

  const slot = () => openSlot(9);

  // The booking route's write path: the one transaction that takes the guard first.
  async function requestBooking(world: LockRaceWorld) {
    const serviceRepo = app.get<IServiceRepository>(SERVICE_REPOSITORY);
    const service = (await serviceRepo.findByIds([world.serviceId], world.tenantId))[0];
    const booking = new BookingBuilder()
      .withTenantId(world.tenantId)
      .withLines([new BookingLineBuilder().withServiceId(world.serviceId).build()])
      .build();
    return persistRequestedBooking(
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
        bookableUntilGuard: app.get(BookableUntilGuard),
      },
      {
        booking,
        tenantId: world.tenantId,
        scheduledAt: new Date(slot()),
        timezone: TIMEZONE,
        businessHours: DEFAULT_TEST_BUSINESS_HOURS,
        tenantServiceBufferMinutes: 60,
        operations: [],
        serviceMap: new Map([[service.id, service]]),
        resourceSelections: [],
      },
    );
  }

  async function bookingCount(tenantId: string): Promise<number> {
    const [{ count }] = await ds.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM booking.bookings WHERE tenant_id = $1`,
      [tenantId],
    );
    return count;
  }

  function seedCap(tenantId: string, bookableUntil: string | null): void {
    access.seed(tenantId, {
      status: 'ACTIVE',
      suspensionReason: null,
      operational: true,
      features: [{ key: 'BOOKING', tier: 'STANDARD' }],
      bookableUntil,
    });
  }

  it('a booking waits for the exclusive holder (the plan save), then reads the committed cap and is refused', async () => {
    const world = await createLockRaceWorld(env);
    const held = await holdTransaction(env, () => lock.lockCommitmentsExclusive(world.tenantId));
    try {
      const since = await databaseNow(ds);
      let finished = false;
      const settled = requestBooking(world).then(
        () => {
          finished = true;
          return 'created' as const;
        },
        (err: unknown) => {
          finished = true;
          return err;
        },
      );
      await Promise.race([
        waitForBlockedLock(ds, 'advisory', since),
        settled.then(() => {
          throw new Error('the booking ran without waiting for the bookable-until lock');
        }),
      ]);
      expect(finished).toBe(false);

      // The plan save commits the removal (the cap) and lets go; only then may the booking read it.
      seedCap(world.tenantId, utcDateToLocalDate(new Date(slot()), TIMEZONE));
      await held.release();

      expect(await settled).toBeInstanceOf(BookingTooFarAheadError);
      expect(await bookingCount(world.tenantId)).toBe(0);
    } finally {
      await held.release();
    }
  });

  it('the plan save waits for a booking in flight (the shared holder) and starts only after it commits', async () => {
    const world = await createLockRaceWorld(env);
    const held = await holdTransaction(env, () => lock.lockCommitmentsShared(world.tenantId));
    try {
      const since = await databaseNow(ds);
      let finished = false;
      const planSave = env.txManager
        .run(() => lock.lockCommitmentsExclusive(world.tenantId))
        .then(() => {
          finished = true;
        });
      await Promise.race([
        waitForBlockedLock(ds, 'advisory', since),
        planSave.then(() => {
          throw new Error('the plan save ran while a booking held the shared lock');
        }),
      ]);
      expect(finished).toBe(false);

      await held.release();
      await planSave;

      expect(finished).toBe(true);
    } finally {
      await held.release();
    }
  });

  it('two bookings hold the shared lock together and never wait for each other', async () => {
    const world = await createLockRaceWorld(env);
    const held = await holdTransaction(env, () => lock.lockCommitmentsShared(world.tenantId));
    try {
      // A second booking takes the shared lock and commits while the first still holds it. An
      // exclusive lock here would wait for the 2 s lock timeout and fail instead.
      await expect(
        env.txManager.run(() => lock.lockCommitmentsShared(world.tenantId)),
      ).resolves.toBeUndefined();
    } finally {
      await held.release();
    }
  });

  it("is scoped by tenant: one tenant's plan save never blocks another tenant's booking", async () => {
    const [worldA, worldB] = [await createLockRaceWorld(env), await createLockRaceWorld(env)];
    const held = await holdTransaction(env, () => lock.lockCommitmentsExclusive(worldA.tenantId));
    try {
      await expect(
        env.txManager.run(() => lock.lockCommitmentsShared(worldB.tenantId)),
      ).resolves.toBeUndefined();
    } finally {
      await held.release();
    }
  });

  it('throws outside a transaction, like every other advisory lock', async () => {
    await expect(lock.lockCommitmentsShared(uuidv7())).rejects.toThrow(/active transaction/);
    await expect(lock.lockCommitmentsExclusive(uuidv7())).rejects.toThrow(/active transaction/);
  });
});

import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TRANSACTION_MANAGER } from '../../../../shared/ports/transaction-manager.port';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import {
  bookingStatus,
  createLockRaceWorld,
  entryStatus,
  LockRaceEnv,
  openEntriesOf,
} from '../../../../test/utils/booking-lock-race-world';
import { occupiedResourceIds } from '../../../../test/utils/future-commitment-db-fixture';
import { BookingEntity } from '../../infrastructure/entities/booking.entity';
import { BookingStatusTransitionEntity } from '../../infrastructure/entities/booking-status-transition.entity';
import { ResourceOccupancyEntity } from '../../infrastructure/entities/resource-occupancy.entity';
import { BookingApprovalHoldExpiredError } from '../../domain/errors/booking-domain.error';
import { RESOURCE_OCCUPANCY_REPOSITORY } from '../ports/resource-occupancy-repository.port';
import { TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { ApproveBookingUseCase } from '../use-cases/approve-booking.use-case';
import { CancelBookingAsAdminUseCase } from '../use-cases/cancel-booking-as-admin.use-case';
import { SubmitBookingInfoUseCase } from '../use-cases/submit-booking-info.use-case';
import { ExpireBookingHoldsJob } from './expire-booking-holds.job';

const STAFF_ID = '20000000-0000-4000-8000-0000000000e1';
const TIMEZONE = 'America/Sao_Paulo';
const OVERDUE = () => new Date(Date.now() - 60_000);

// TD51 against a real database: the sweep query, the terminal helper's locks and release, the
// SYSTEM audit row and the optimistic-version race. Every scenario builds its own tenant.
describe('ExpireBookingHoldsJob (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let env: LockRaceEnv;
  let job: ExpireBookingHoldsJob;

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
    env = {
      ds,
      txManager: app.get(TRANSACTION_MANAGER),
      occupancyRepo: app.get(RESOURCE_OCCUPANCY_REPOSITORY),
      tenantLock: app.get(TENANT_LOCK_PORT),
    };
    job = app.get(ExpireBookingHoldsJob);
  });

  afterAll(async () => {
    await app.close();
  });

  const bookingRow = (tenantId: string, bookingId: string) =>
    ds.getRepository(BookingEntity).findOneByOrFail({ id: bookingId, tenantId });

  const transitionsOf = (tenantId: string, bookingId: string) =>
    ds.getRepository(BookingStatusTransitionEntity).find({ where: { tenantId, bookingId } });

  const holdDeadlinesOf = async (tenantId: string, resourceId: string) =>
    (await ds.getRepository(ResourceOccupancyEntity).find({ where: { tenantId, resourceId } })).map(
      (row) => row.holdExpiresAt,
    );

  it('cancels an unanswered PENDING request as the system, frees its slot and closes its worklist entry', async () => {
    const world = await createLockRaceWorld(env);
    const { bookingId, entryIds } = await world.seedBooking({
      resources: [world.roomA],
      status: 'PENDING',
      holdExpiresAt: OVERDUE(),
    });

    const expired = await job.expireForTenant(world.tenantId);

    expect(expired).toBe(1);
    const row = await bookingRow(world.tenantId, bookingId);
    expect(row.status).toBe('CANCELLED');
    expect(row.cancelledBy).toBeNull();
    expect(row.cancellationReason).toBe('APPROVAL_EXPIRED');
    expect(row.cancelledAt).toBeInstanceOf(Date);
    expect(await occupiedResourceIds(ds, world.tenantId, bookingId)).toEqual([]);
    expect(await entryStatus(ds, world.tenantId, entryIds[0])).toBe('DISMISSED');
    expect(await transitionsOf(world.tenantId, bookingId)).toMatchObject([
      { fromStatus: 'PENDING', toStatus: 'CANCELLED', actorType: 'SYSTEM', actorId: null },
    ]);
  });

  it('leaves a hold that has not run out, a committed booking and an INFO_REQUESTED booking alone', async () => {
    const world = await createLockRaceWorld(env);
    const valid = await world.seedBooking({
      resources: [world.roomA],
      status: 'PENDING',
      holdExpiresAt: new Date(Date.now() + 3_600_000),
      startsInDays: 5,
    });
    const committed = await world.seedBooking({
      resources: [world.roomB],
      status: 'APPROVED',
      startsInDays: 6,
    });
    const waitingOnCustomer = await world.seedBooking({
      resources: [world.roomA],
      status: 'INFO_REQUESTED',
      holdExpiresAt: OVERDUE(),
      startsInDays: 7,
    });

    const expired = await job.expireForTenant(world.tenantId);

    expect(expired).toBe(0);
    expect(await bookingStatus(ds, world.tenantId, valid.bookingId)).toBe('PENDING');
    expect(await bookingStatus(ds, world.tenantId, committed.bookingId)).toBe('APPROVED');
    expect(await bookingStatus(ds, world.tenantId, waitingOnCustomer.bookingId)).toBe(
      'INFO_REQUESTED',
    );
    expect(await occupiedResourceIds(ds, world.tenantId, waitingOnCustomer.bookingId)).toEqual([
      world.roomA.id,
    ]);
  });

  it("tenant isolation: tenant A's pass never expires tenant B's overdue request", async () => {
    const tenantA = await createLockRaceWorld(env);
    const tenantB = await createLockRaceWorld(env);
    const overdueA = await tenantA.seedBooking({
      resources: [tenantA.roomA],
      status: 'PENDING',
      holdExpiresAt: OVERDUE(),
    });
    const overdueB = await tenantB.seedBooking({
      resources: [tenantB.roomA],
      status: 'PENDING',
      holdExpiresAt: OVERDUE(),
    });

    const expired = await job.expireForTenant(tenantA.tenantId);

    expect(expired).toBe(1);
    expect(await bookingStatus(ds, tenantA.tenantId, overdueA.bookingId)).toBe('CANCELLED');
    expect(await bookingStatus(ds, tenantB.tenantId, overdueB.bookingId)).toBe('PENDING');
    expect(await occupiedResourceIds(ds, tenantB.tenantId, overdueB.bookingId)).toEqual([
      tenantB.roomA.id,
    ]);
  });

  it('approve refuses a request whose deadline passed before the job ran, and commits nothing', async () => {
    const world = await createLockRaceWorld(env);
    const { bookingId } = await world.seedBooking({
      resources: [world.roomA],
      status: 'PENDING',
      holdExpiresAt: OVERDUE(),
    });

    await expect(
      app.get(ApproveBookingUseCase).execute({
        bookingId,
        tenantId: world.tenantId,
        staffId: STAFF_ID,
        actorRole: 'STAFF',
        correlationId: uuidv7(),
        timezone: TIMEZONE,
      }),
    ).rejects.toThrow(BookingApprovalHoldExpiredError);

    expect(await bookingStatus(ds, world.tenantId, bookingId)).toBe('PENDING');
    const [row] = await ds
      .getRepository(ResourceOccupancyEntity)
      .find({ where: { tenantId: world.tenantId, resourceId: world.roomA.id } });
    expect(row.lockState).toBe('HOLD');
  });

  it("a customer's answer restarts the hold, so the next run does not expire the answered booking", async () => {
    const world = await createLockRaceWorld(env);
    const customerId = uuidv7();
    const { bookingId } = await world.seedBooking({
      resources: [world.roomA],
      status: 'INFO_REQUESTED',
      customerId,
      holdExpiresAt: OVERDUE(),
    });

    await app.get(SubmitBookingInfoUseCase).execute({
      bookingId,
      response: 'Aqui estão as informações que vocês pediram',
      tenantId: world.tenantId,
      customerId,
      correlationId: uuidv7(),
    });
    const expired = await job.expireForTenant(world.tenantId);

    expect(expired).toBe(0);
    expect(await bookingStatus(ds, world.tenantId, bookingId)).toBe('PENDING');
    const [deadline] = await holdDeadlinesOf(world.tenantId, world.roomA.id);
    expect(deadline!.getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
  });

  it('a staff cancel racing the expiry of the same request leaves one closed booking, one transition and no deadlock', async () => {
    for (let round = 0; round < 3; round++) {
      const world = await createLockRaceWorld(env);
      const { bookingId } = await world.seedBooking({
        resources: [world.roomA, world.roomB],
        status: 'PENDING',
        holdExpiresAt: OVERDUE(),
      });

      const results = await Promise.allSettled([
        app.get(CancelBookingAsAdminUseCase).execute({
          bookingId,
          tenantId: world.tenantId,
          staffId: STAFF_ID,
          actorRole: 'STAFF',
          correlationId: uuidv7(),
        }),
        job.expireForTenant(world.tenantId),
      ]);

      for (const result of results) {
        if (result.status === 'rejected') {
          expect(
            JSON.stringify(result.reason, Object.getOwnPropertyNames(result.reason)),
          ).not.toMatch(/40P01|deadlock/i);
        }
      }
      expect(await bookingStatus(ds, world.tenantId, bookingId)).toBe('CANCELLED');
      expect(await occupiedResourceIds(ds, world.tenantId, bookingId)).toEqual([]);
      expect(await openEntriesOf(ds, world.tenantId, bookingId)).toEqual([]);
      const transitions = await transitionsOf(world.tenantId, bookingId);
      expect(transitions).toHaveLength(1);
      expect(['STAFF', 'SYSTEM']).toContain(transitions[0].actorType);
    }
  });

  it('an approval racing the expiry of the same request leaves exactly one outcome, consistent occupancy and no deadlock', async () => {
    for (let round = 0; round < 3; round++) {
      const world = await createLockRaceWorld(env);
      // The deadline is still ahead for the approval's own guard, while the job is run "later".
      const { bookingId } = await world.seedBooking({
        resources: [world.roomA],
        status: 'PENDING',
        holdExpiresAt: new Date(Date.now() + 60 * 60_000),
      });

      const results = await Promise.allSettled([
        app.get(ApproveBookingUseCase).execute({
          bookingId,
          tenantId: world.tenantId,
          staffId: STAFF_ID,
          actorRole: 'STAFF',
          correlationId: uuidv7(),
          timezone: TIMEZONE,
        }),
        job.expireForTenant(world.tenantId, new Date(Date.now() + 2 * 3_600_000)),
      ]);

      for (const result of results) {
        if (result.status === 'rejected') {
          expect(
            JSON.stringify(result.reason, Object.getOwnPropertyNames(result.reason)),
          ).not.toMatch(/40P01|deadlock/i);
        }
      }
      const status = await bookingStatus(ds, world.tenantId, bookingId);
      expect(['APPROVED', 'CANCELLED']).toContain(status);
      // An approval that wins is never undone; an expiry that wins leaves nothing held.
      expect(await occupiedResourceIds(ds, world.tenantId, bookingId)).toEqual(
        status === 'APPROVED' ? [world.roomA.id] : [],
      );
      expect(await transitionsOf(world.tenantId, bookingId)).toHaveLength(1);
    }
  });
});

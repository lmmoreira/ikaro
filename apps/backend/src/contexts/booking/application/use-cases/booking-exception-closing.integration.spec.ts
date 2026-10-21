import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TRANSACTION_MANAGER } from '../../../../shared/ports/transaction-manager.port';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import {
  occupiedResourceIds,
  seedResource,
} from '../../../../test/utils/future-commitment-db-fixture';
import {
  bookingStatus,
  createLockRaceWorld,
  LockRaceEnv,
} from '../../../../test/utils/booking-lock-race-world';
import { FutureCommitmentExceptionEntity } from '../../infrastructure/entities/future-commitment-exception.entity';
import { RESOURCE_OCCUPANCY_REPOSITORY } from '../ports/resource-occupancy-repository.port';
import { TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { CancelBookingAsAdminUseCase } from './cancel-booking-as-admin.use-case';
import { RejectBookingUseCase } from './reject-booking.use-case';
import { ResolveFutureCommitmentExceptionsUseCase } from './resolve-future-commitment-exceptions.use-case';

const STAFF_ID = '20000000-0000-4000-8000-0000000000c1';

// What closing does to the data, against Postgres. The lock order is in
// booking-lock-order.integration.spec.ts. Every test builds its own tenant world.
describe('closing a booking’s worklist entries (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let env: LockRaceEnv;
  let cancelAsAdmin: CancelBookingAsAdminUseCase;
  let reject: RejectBookingUseCase;
  let resolve: ResolveFutureCommitmentExceptionsUseCase;

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
    env = {
      ds,
      txManager: app.get(TRANSACTION_MANAGER),
      occupancyRepo: app.get(RESOURCE_OCCUPANCY_REPOSITORY),
      tenantLock: app.get(TENANT_LOCK_PORT),
    };
    cancelAsAdmin = app.get(CancelBookingAsAdminUseCase);
    reject = app.get(RejectBookingUseCase);
    resolve = app.get(ResolveFutureCommitmentExceptionsUseCase);
  });

  afterAll(async () => {
    await app.close();
  });

  const loadEntry = (tenantId: string, id: string) =>
    ds.getRepository(FutureCommitmentExceptionEntity).findOneByOrFail({ id, tenantId });

  it('a staff cancel closes every open entry of a two-resource booking, with no manager action', async () => {
    const world = await createLockRaceWorld(env);
    const { bookingId, entryIds } = await world.seedBooking({
      resources: [world.roomA, world.roomB],
    });

    await cancelAsAdmin.execute({
      bookingId,
      tenantId: world.tenantId,
      staffId: STAFF_ID,
      actorRole: 'STAFF',
      correlationId: uuidv7(),
    });

    for (const id of entryIds) {
      const row = await loadEntry(world.tenantId, id);
      expect(row.status).toBe('DISMISSED');
      expect(row.resolutionReason).toBe('BOOKING_NO_LONGER_ACTIVE');
      expect(row.resolvedByStaffId).toBeNull();
    }
  });

  it('rejecting a pending booking closes every open entry of a two-resource booking', async () => {
    const world = await createLockRaceWorld(env);
    const { bookingId, entryIds } = await world.seedBooking({
      resources: [world.roomA, world.roomB],
      status: 'PENDING',
    });

    await reject.execute({
      bookingId,
      tenantId: world.tenantId,
      staffId: STAFF_ID,
      actorRole: 'STAFF',
      correlationId: uuidv7(),
      reason: 'no capacity for that day',
    });

    expect(await bookingStatus(ds, world.tenantId, bookingId)).toBe('REJECTED');
    for (const id of entryIds) {
      expect((await loadEntry(world.tenantId, id)).status).toBe('DISMISSED');
    }
  });

  // Only the entry a manager resolves closes. The booking still holds its other resource, so that
  // resource's entry is still a decision to make (docs/BUSINESS_LOGIC_REFERENCE § Close with the booking change).
  it('reassigning one resource of a two-resource booking leaves the other resource’s entry open', async () => {
    const world = await createLockRaceWorld(env);
    const target = await seedResource(ds, world.tenantId, 'Sala C');
    const { bookingId, entryIds } = await world.seedBooking({
      resources: [world.roomA, world.roomB],
    });
    await world.deactivate(world.roomA);
    await world.deactivate(world.roomB);

    const { results } = await resolve.execute({
      tenantId: world.tenantId,
      staffId: STAFF_ID,
      actorRole: 'MANAGER',
      correlationId: uuidv7(),
      timezone: 'America/Sao_Paulo',
      exceptionIds: [entryIds[0]],
      resolutionType: 'REASSIGN',
      target: { resourceId: target.id },
    });

    expect(results).toEqual([{ exceptionId: entryIds[0], outcome: 'RESOLVED' }]);
    expect((await loadEntry(world.tenantId, entryIds[0])).status).toBe('RESOLVED');
    expect((await loadEntry(world.tenantId, entryIds[1])).status).toBe('OPEN');
    expect((await occupiedResourceIds(ds, world.tenantId, bookingId)).sort()).toEqual(
      [world.roomB.id, target.id].sort(),
    );
  });

  it("a cancel in one tenant never closes another tenant's entry (tenant isolation)", async () => {
    const mine = await createLockRaceWorld(env);
    const theirs = await createLockRaceWorld(env);
    const mineSeed = await mine.seedBooking({ resources: [mine.roomA] });
    const theirsSeed = await theirs.seedBooking({ resources: [theirs.roomA] });

    await cancelAsAdmin.execute({
      bookingId: mineSeed.bookingId,
      tenantId: mine.tenantId,
      staffId: STAFF_ID,
      actorRole: 'STAFF',
      correlationId: uuidv7(),
    });

    expect((await loadEntry(mine.tenantId, mineSeed.entryIds[0])).status).toBe('DISMISSED');
    expect((await loadEntry(theirs.tenantId, theirsSeed.entryIds[0])).status).toBe('OPEN');
  });
});

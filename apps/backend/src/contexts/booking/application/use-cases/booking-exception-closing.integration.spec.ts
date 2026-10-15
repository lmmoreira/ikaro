import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  BookingEntityBuilder,
  BookingLineEntityBuilder,
  FutureCommitmentExceptionEntityBuilder,
  ResourceEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { futureDate } from '../../../../test/utils/date-helpers';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { PlatformModule } from '../../../platform/platform.module';
import { ResourceType } from '../../domain/resource.types';
import { BookingEntity } from '../../infrastructure/entities/booking.entity';
import { BookingLineEntity } from '../../infrastructure/entities/booking-line.entity';
import { FutureCommitmentExceptionEntity } from '../../infrastructure/entities/future-commitment-exception.entity';
import { ResourceEntity } from '../../infrastructure/entities/resource.entity';
import { ServiceEntity } from '../../infrastructure/entities/service.entity';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { CancelBookingAsAdminUseCase } from './cancel-booking-as-admin.use-case';
import { DeactivateResourceUseCase } from './deactivate-resource.use-case';
import { RejectBookingUseCase } from './reject-booking.use-case';
import { ResolveFutureCommitmentExceptionsUseCase } from './resolve-future-commitment-exceptions.use-case';

const TEST_KEY = 'booking-integ-test-key-closing-xxx'; // 35 chars
const STAFF_ID = '20000000-0000-4000-8000-0000000000c1';

describe('booking exception closing (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let txManager: ITransactionManager;
  let occupancyRepo: IResourceOccupancyRepository;
  let tenantLock: ITenantLockPort;
  let cancelAsAdmin: CancelBookingAsAdminUseCase;
  let reject: RejectBookingUseCase;
  let resolve: ResolveFutureCommitmentExceptionsUseCase;
  let deactivate: DeactivateResourceUseCase;
  let tenantA: string;
  let tenantB: string;
  let serviceIdA: string;
  let serviceIdB: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({ extraModules: [PlatformModule] }));
    txManager = app.get(TRANSACTION_MANAGER);
    occupancyRepo = app.get(RESOURCE_OCCUPANCY_REPOSITORY);
    tenantLock = app.get(TENANT_LOCK_PORT);
    cancelAsAdmin = app.get(CancelBookingAsAdminUseCase);
    reject = app.get(RejectBookingUseCase);
    resolve = app.get(ResolveFutureCommitmentExceptionsUseCase);
    deactivate = app.get(DeactivateResourceUseCase);

    const createTenant = async (slug: string): Promise<string> => {
      const { body } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Platform-Admin-Key', TEST_KEY)
        .send({ name: slug, slug, adminEmail: `a@${slug}.test`, country_code: 'BR' })
        .expect(201);
      return body.tenantId as string;
    };
    tenantA = await createTenant('closing-tenant-a');
    tenantB = await createTenant('closing-tenant-b');
    serviceIdA = await seedService(tenantA);
    serviceIdB = await seedService(tenantB);
    await ensureLocation(tenantA);
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  async function seedService(tenantId: string): Promise<string> {
    const service = new ServiceEntityBuilder()
      .withTenantId(tenantId)
      .withName('Lavagem Simples')
      .withPriceAmount('100.00')
      .withDurationMinutes(30)
      .withIsActive(true)
      .build();
    await ds.getRepository(ServiceEntity).save(service);
    return service.id;
  }

  // A service with no resource requirement resolves against the tenant's LOCATION.
  async function ensureLocation(tenantId: string): Promise<void> {
    const existing = await ds
      .getRepository(ResourceEntity)
      .findOne({ where: { tenantId, type: ResourceType.LOCATION } });
    if (existing) return;
    await ds
      .getRepository(ResourceEntity)
      .save(
        new ResourceEntityBuilder()
          .withTenantId(tenantId)
          .withType(ResourceType.LOCATION)
          .withName('Localização Principal')
          .build(),
      );
  }

  // True when nobody holds a row lock on the entry: SELECT ... FOR UPDATE NOWAIT fails otherwise.
  async function entryRowIsFree(id: string, tenantId: string): Promise<boolean> {
    try {
      await ds.transaction((manager) =>
        manager.query(
          `SELECT id FROM booking.future_commitment_exceptions WHERE id = $1 AND tenant_id = $2 FOR UPDATE NOWAIT`,
          [id, tenantId],
        ),
      );
      return true;
    } catch {
      return false;
    }
  }

  async function seedResource(tenantId: string): Promise<string> {
    const resource = new ResourceEntityBuilder()
      .withTenantId(tenantId)
      .withType(ResourceType.ROOM)
      .withName(`Sala ${uuidv7().slice(-6)}`)
      .build();
    await ds.getRepository(ResourceEntity).save(resource);
    return resource.id;
  }

  // An APPROVED (or PENDING) booking that occupies every given resource, with one open entry per
  // resource, as a deactivation of each would have raised them.
  async function seedBooking(
    tenantId: string,
    resourceIds: string[],
    status = 'APPROVED',
  ): Promise<{ bookingId: string; entryIds: string[] }> {
    const scheduledAt = new Date(`${futureDate(5)}T13:00:00.000Z`);
    const booking = new BookingEntityBuilder()
      .withTenantId(tenantId)
      .withStatus(status)
      .withScheduledAt(scheduledAt)
      .withTotalDurationMins(30)
      .withTotalPriceAmount('100.00')
      .build();
    await ds.getRepository(BookingEntity).save(booking);
    const line = new BookingLineEntityBuilder()
      .withBookingId(booking.id)
      .withTenantId(tenantId)
      .withServiceId(tenantId === tenantA ? serviceIdA : serviceIdB)
      .withPriceAtBookingAmount('100.00')
      .withDurationMinsAtBooking(30)
      .build();
    await ds.getRepository(BookingLineEntity).save(line);
    await txManager.run(() =>
      occupancyRepo.assign(
        tenantId,
        line.lineId,
        resourceIds.map((resourceId, index) => ({
          resourceId,
          resourceType: ResourceType.ROOM,
          resourceName: 'Sala',
          legIndex: null,
          quantityPosition: index,
          selectionMode: 'NONE' as const,
          isBundleMember: false,
          gapMinutes: null,
          gapSource: null,
          startsAt: scheduledAt,
          endsAt: new Date(scheduledAt.getTime() + 30 * 60_000),
        })),
        'COMMITTED',
        null,
      ),
    );
    const entryIds: string[] = [];
    for (const resourceId of resourceIds) {
      const entry = new FutureCommitmentExceptionEntityBuilder()
        .withTenantId(tenantId)
        .withSourceId(resourceId)
        .withAffectedId(booking.id)
        .build();
      await ds.getRepository(FutureCommitmentExceptionEntity).save(entry);
      entryIds.push(entry.id);
    }
    return { bookingId: booking.id, entryIds };
  }

  const entryStatus = async (id: string, tenantId: string): Promise<string | undefined> =>
    (await ds.getRepository(FutureCommitmentExceptionEntity).findOne({ where: { id, tenantId } }))
      ?.status;

  const openEntriesOf = (bookingId: string, tenantId: string) =>
    ds
      .getRepository(FutureCommitmentExceptionEntity)
      .find({ where: { tenantId, affectedId: bookingId, status: 'OPEN' } });

  const cancelInput = (bookingId: string, tenantId = tenantA) => ({
    bookingId,
    tenantId,
    staffId: STAFF_ID,
    actorRole: 'STAFF' as const,
    correlationId: uuidv7(),
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

  async function waitForBlockedLock(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const [{ waiting }] = await ds.query<{ waiting: number }[]>(
        `SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted`,
      );
      if (waiting > 0) return;
      await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    }
    throw new Error('no session ever blocked on a lock');
  }

  describe('cancel and reject', () => {
    it('a staff cancel closes every open entry of a two-resource booking, with no manager action', async () => {
      const resources = [await seedResource(tenantA), await seedResource(tenantA)];
      const { bookingId, entryIds } = await seedBooking(tenantA, resources);

      await cancelAsAdmin.execute(cancelInput(bookingId));

      for (const id of entryIds) {
        const row = await ds
          .getRepository(FutureCommitmentExceptionEntity)
          .findOneByOrFail({ id, tenantId: tenantA });
        expect(row.status).toBe('DISMISSED');
        expect(row.resolutionReason).toBe('BOOKING_NO_LONGER_ACTIVE');
        expect(row.resolvedByStaffId).toBeNull();
      }
    });

    it('rejecting a pending booking closes its open entries', async () => {
      const resources = [await seedResource(tenantA), await seedResource(tenantA)];
      const { bookingId, entryIds } = await seedBooking(tenantA, resources, 'PENDING');

      await reject.execute({
        ...cancelInput(bookingId),
        reason: 'no capacity for that day',
      });

      for (const id of entryIds) expect(await entryStatus(id, tenantA)).toBe('DISMISSED');
    });

    it("a cancel in tenant B never closes tenant A's entry (tenant isolation)", async () => {
      const a = await seedBooking(tenantA, [await seedResource(tenantA)]);
      const b = await seedBooking(tenantB, [await seedResource(tenantB)]);

      await cancelAsAdmin.execute(cancelInput(b.bookingId, tenantB));

      expect(await entryStatus(a.entryIds[0], tenantA)).toBe('OPEN');
      expect(await entryStatus(b.entryIds[0], tenantB)).toBe('DISMISSED');
    });

    it('waits for whoever holds the resource lock before it frees the booking', async () => {
      const resourceId = await seedResource(tenantA);
      const { bookingId, entryIds } = await seedBooking(tenantA, [resourceId]);
      let holderHasLock!: () => void;
      const locked = new Promise<void>((resolveLock) => (holderHasLock = resolveLock));
      let releaseHolder!: () => void;
      const released = new Promise<void>((resolveRelease) => (releaseHolder = resolveRelease));
      const holder = txManager.run(async () => {
        await tenantLock.lockResources(tenantA, [resourceId]);
        holderHasLock();
        await released;
      });
      await locked;

      let cancelled = false;
      const cancel = cancelAsAdmin.execute(cancelInput(bookingId)).then(() => (cancelled = true));
      await waitForBlockedLock();
      expect(cancelled).toBe(false);
      expect(await entryStatus(entryIds[0], tenantA)).toBe('OPEN');
      expect(await entryRowIsFree(entryIds[0], tenantA)).toBe(true);

      releaseHolder();
      await Promise.all([holder, cancel]);

      expect(cancelled).toBe(true);
      expect(await entryStatus(entryIds[0], tenantA)).toBe('DISMISSED');
    });
  });

  describe('worklist reschedule lock order (docs/28 H2)', () => {
    it('waits for a holder of the source resource lock without holding the entry row lock', async () => {
      const resourceId = await seedResource(tenantA);
      const { bookingId, entryIds } = await seedBooking(tenantA, [resourceId]);
      let holderHasLock!: () => void;
      const locked = new Promise<void>((resolveLock) => (holderHasLock = resolveLock));
      let releaseHolder!: () => void;
      const released = new Promise<void>((resolveRelease) => (releaseHolder = resolveRelease));
      // What a reactivation of the source resource does first.
      const holder = txManager.run(async () => {
        await tenantLock.lockResources(tenantA, [resourceId]);
        holderHasLock();
        await released;
      });
      await locked;

      let finished = false;
      const reschedule = resolve
        .execute({
          tenantId: tenantA,
          staffId: STAFF_ID,
          actorRole: 'MANAGER',
          correlationId: uuidv7(),
          timezone: 'America/Sao_Paulo',
          exceptionIds: [entryIds[0]],
          resolutionType: 'RESCHEDULE',
          scheduledAt: new Date(`${futureDate(8)}T15:00:00.000Z`).toISOString(),
        })
        .then((result) => {
          finished = true;
          return result;
        });
      await waitForBlockedLock();
      expect(finished).toBe(false);
      expect(await entryRowIsFree(entryIds[0], tenantA)).toBe(true);

      releaseHolder();
      const [, result] = await Promise.all([holder, reschedule]);

      expect(result.results).toEqual([{ exceptionId: entryIds[0], outcome: 'RESOLVED' }]);
      expect(await entryStatus(entryIds[0], tenantA)).toBe('RESOLVED');
      expect(await openEntriesOf(bookingId, tenantA)).toEqual([]);
    });
  });

  describe('concurrency', () => {
    it('a staff cancel racing a manager cancelling the same booking from the worklist ends with no deadlock and nothing open', async () => {
      for (let round = 0; round < 3; round++) {
        const resources = [await seedResource(tenantA), await seedResource(tenantA)];
        const { bookingId, entryIds } = await seedBooking(tenantA, resources);

        const results = await Promise.allSettled([
          cancelAsAdmin.execute(cancelInput(bookingId)),
          resolve.execute({
            tenantId: tenantA,
            staffId: STAFF_ID,
            actorRole: 'MANAGER',
            correlationId: uuidv7(),
            timezone: 'America/Sao_Paulo',
            exceptionIds: [entryIds[0]],
            resolutionType: 'CANCEL',
          }),
        ]);

        expectNoDeadlock(results);
        expect(
          (await ds.getRepository(BookingEntity).findOneByOrFail({ id: bookingId })).status,
        ).toBe('CANCELLED');
        expect(await openEntriesOf(bookingId, tenantA)).toEqual([]);
      }
    });

    it('a cancel racing the deactivation that raises its entry never leaves an open entry on a cancelled booking', async () => {
      for (let round = 0; round < 6; round++) {
        const resourceId = await seedResource(tenantA);
        const { bookingId, entryIds } = await seedBooking(tenantA, [resourceId]);
        await ds
          .getRepository(FutureCommitmentExceptionEntity)
          .delete({ id: entryIds[0], tenantId: tenantA });

        const results = await Promise.allSettled([
          cancelAsAdmin.execute(cancelInput(bookingId)),
          deactivate.execute({ id: resourceId, tenantId: tenantA, correlationId: uuidv7() }),
        ]);

        expectNoDeadlock(results);
        expect(
          (await ds.getRepository(BookingEntity).findOneByOrFail({ id: bookingId })).status,
        ).toBe('CANCELLED');
        expect(await openEntriesOf(bookingId, tenantA)).toEqual([]);
      }
    });
  });
});

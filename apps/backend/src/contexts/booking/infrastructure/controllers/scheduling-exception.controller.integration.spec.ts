import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TenantEntityBuilder } from '../../../../test/builders/platform/tenant-entity.builder';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import {
  cleanupFutureCommitmentTenant,
  occupiedResourceIds,
  seedFutureBooking,
  seedResource,
  seedService,
} from '../../../../test/utils/future-commitment-db-fixture';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingStatusTransitionEntity } from '../entities/booking-status-transition.entity';
import { FutureCommitmentExceptionEntity } from '../entities/future-commitment-exception.entity';
import { ResourceEntity } from '../entities/resource.entity';

const TENANT_A = '10000000-0000-4000-8000-000000000710';
const TENANT_B = '10000000-0000-4000-8000-000000000711';
const MANAGER_ID = '20000000-0000-4000-8000-000000000710';

describe('SchedulingExceptionController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
    // The booking repository reads the tenant's currency from the real tenant row.
    await ds
      .getRepository(TenantEntity)
      .save([
        new TenantEntityBuilder().withId(TENANT_A).withSlug(`fce-tenant-a-${TENANT_A}`).build(),
        new TenantEntityBuilder().withId(TENANT_B).withSlug(`fce-tenant-b-${TENANT_B}`).build(),
      ]);
  });

  afterEach(async () => {
    await cleanupFutureCommitmentTenant(ds, [TENANT_A, TENANT_B]);
  });

  afterAll(async () => {
    await ds.getRepository(TenantEntity).delete({ id: TENANT_A });
    await ds.getRepository(TenantEntity).delete({ id: TENANT_B });
    await app.close();
  });

  const as = (tenantId = TENANT_A, role: 'MANAGER' | 'STAFF' = 'MANAGER') =>
    actorHeaders(tenantId, MANAGER_ID, role);

  async function deactivate(resourceId: string, tenantId = TENANT_A): Promise<void> {
    await request(app.getHttpServer())
      .delete(`/resources/${resourceId}`)
      .set(as(tenantId))
      .expect(204);
  }

  async function openEntries(tenantId = TENANT_A) {
    const { body } = await request(app.getHttpServer())
      .get('/scheduling-exceptions?status=OPEN')
      .set(as(tenantId))
      .expect(200);
    return body.items as {
      id: string;
      affectedId: string;
      sourceId: string;
      alternatives: { resourceId: string; resourceName: string }[];
      booking: { contactName: string; resourceName: string | null; serviceNames: string[] } | null;
    }[];
  }

  const resolve = (body: Record<string, unknown>, tenantId = TENANT_A) =>
    request(app.getHttpServer())
      .post('/scheduling-exceptions/resolve')
      .set(as(tenantId))
      .send(body);

  describe('raising through a real resource deactivation (UC-047 → UC-073)', () => {
    it('creates one OPEN entry per future booking, with booking summary and free alternatives', async () => {
      const source = await seedResource(ds, TENANT_A, 'Sala 1');
      const free = await seedResource(ds, TENANT_A, 'Sala 2');
      const service = await seedService(ds, TENANT_A);
      const first = await seedFutureBooking(ds, {
        tenantId: TENANT_A,
        serviceId: service.id,
        resource: source,
        startsInHours: 24,
        contactName: 'Ana Souza',
      });
      const second = await seedFutureBooking(ds, {
        tenantId: TENANT_A,
        serviceId: service.id,
        resource: source,
        startsInHours: 72,
        status: 'PENDING',
        lockState: 'HOLD',
        contactName: 'Bruno Alves',
      });
      await seedFutureBooking(ds, {
        tenantId: TENANT_A,
        serviceId: service.id,
        resource: source,
        startsInHours: -48,
      });

      await deactivate(source.id);

      const entries = await openEntries();
      expect(entries.map((e) => e.affectedId)).toEqual([first.bookingId, second.bookingId]);
      expect(entries[0].booking).toMatchObject({
        contactName: 'Ana Souza',
        resourceName: 'Sala 1',
        serviceNames: ['Sessão'],
      });
      expect(entries[0].alternatives).toEqual([{ resourceId: free.id, resourceName: 'Sala 2' }]);
    });

    it('raises nothing for a resource with no future bookings', async () => {
      const source = await seedResource(ds, TENANT_A, 'Sala 1');

      await deactivate(source.id);

      expect(await openEntries()).toEqual([]);
    });
  });

  describe('bulk REASSIGN', () => {
    it('keeps each booking’s time, changes its resource, and leaves the conflicting one OPEN', async () => {
      const source = await seedResource(ds, TENANT_A, 'Sala 1');
      const target = await seedResource(ds, TENANT_A, 'Sala 2');
      const service = await seedService(ds, TENANT_A);
      const bookings = [
        await seedFutureBooking(ds, {
          tenantId: TENANT_A,
          serviceId: service.id,
          resource: source,
          startsInHours: 24,
        }),
        await seedFutureBooking(ds, {
          tenantId: TENANT_A,
          serviceId: service.id,
          resource: source,
          startsInHours: 48,
        }),
        await seedFutureBooking(ds, {
          tenantId: TENANT_A,
          serviceId: service.id,
          resource: source,
          startsInHours: 72,
        }),
      ];
      // Sala 2 is busy exactly when the middle booking happens.
      await seedFutureBooking(ds, {
        tenantId: TENANT_A,
        serviceId: service.id,
        resource: target,
        startsInHours: 48,
      });
      await deactivate(source.id);
      const entries = await openEntries();

      const { body } = await resolve({
        exceptionIds: entries.map((e) => e.id),
        resolutionType: 'REASSIGN',
        target: { resourceId: target.id },
      }).expect(200);

      const byBooking = new Map(entries.map((e) => [e.affectedId, e.id]));
      const outcome = (bookingId: string) =>
        body.results.find(
          (r: { exceptionId: string }) => r.exceptionId === byBooking.get(bookingId),
        );
      expect(outcome(bookings[0].bookingId).outcome).toBe('RESOLVED');
      expect(outcome(bookings[2].bookingId).outcome).toBe('RESOLVED');
      expect(outcome(bookings[1].bookingId)).toMatchObject({
        outcome: 'STILL_OPEN',
        errorCode: 'BOOKING_EXCEPTION_REASSIGN_TARGET_INVALID',
      });

      expect(await occupiedResourceIds(ds, TENANT_A, bookings[0].bookingId)).toEqual([target.id]);
      expect(await occupiedResourceIds(ds, TENANT_A, bookings[1].bookingId)).toEqual([source.id]);
      expect(await occupiedResourceIds(ds, TENANT_A, bookings[2].bookingId)).toEqual([target.id]);
      // Times untouched.
      for (const seeded of [bookings[0], bookings[2]]) {
        const stored = await ds
          .getRepository(BookingEntity)
          .findOneByOrFail({ id: seeded.bookingId });
        expect(stored.scheduledAt.getTime()).toBe(seeded.startsAt.getTime());
        expect(stored.status).toBe('APPROVED');
      }
      const stillOpen = await openEntries();
      expect(stillOpen.map((e) => e.affectedId)).toEqual([bookings[1].bookingId]);
    });

    it('with AUTO gives each booking a free resource of the same type', async () => {
      const source = await seedResource(ds, TENANT_A, 'Sala 1');
      await seedResource(ds, TENANT_A, 'Sala 2');
      const service = await seedService(ds, TENANT_A);
      const seeded = await seedFutureBooking(ds, {
        tenantId: TENANT_A,
        serviceId: service.id,
        resource: source,
        startsInHours: 24,
      });
      await deactivate(source.id);
      const [entry] = await openEntries();

      const { body } = await resolve({
        exceptionIds: [entry.id],
        resolutionType: 'REASSIGN',
        target: { mode: 'AUTO' },
      }).expect(200);

      expect(body.results).toEqual([{ exceptionId: entry.id, outcome: 'RESOLVED' }]);
      expect(await occupiedResourceIds(ds, TENANT_A, seeded.bookingId)).not.toEqual([source.id]);
    });
  });

  describe('CANCEL and RESCHEDULE', () => {
    it('CANCEL cancels the booking and releases its real occupancy row', async () => {
      const source = await seedResource(ds, TENANT_A, 'Sala 1');
      const service = await seedService(ds, TENANT_A);
      const seeded = await seedFutureBooking(ds, {
        tenantId: TENANT_A,
        serviceId: service.id,
        resource: source,
        startsInHours: 24,
      });
      await deactivate(source.id);
      const [entry] = await openEntries();

      const { body } = await resolve({
        exceptionIds: [entry.id],
        resolutionType: 'CANCEL',
        reason: 'room closed',
      }).expect(200);

      expect(body.results[0].outcome).toBe('RESOLVED');
      const stored = await ds
        .getRepository(BookingEntity)
        .findOneByOrFail({ id: seeded.bookingId });
      expect(stored.status).toBe('CANCELLED');
      expect(await occupiedResourceIds(ds, TENANT_A, seeded.bookingId)).toEqual([]);
      expect(
        await ds
          .getRepository(BookingStatusTransitionEntity)
          .find({ where: { tenantId: TENANT_A, bookingId: seeded.bookingId } }),
      ).toMatchObject([
        {
          fromStatus: 'APPROVED',
          toStatus: 'CANCELLED',
          actorType: 'MANAGER',
          actorId: MANAGER_ID,
          reason: 'room closed',
        },
      ]);
      const closed = await ds
        .getRepository(FutureCommitmentExceptionEntity)
        .findOneByOrFail({ id: entry.id });
      expect(closed).toMatchObject({ status: 'RESOLVED', resolutionType: 'CANCEL' });
    });

    it('RESCHEDULE moves an APPROVED booking to the new time and its occupancy row with it', async () => {
      const source = await seedResource(ds, TENANT_A, 'Sala 1');
      const replacement = await seedResource(ds, TENANT_A, 'Sala 2');
      const service = await seedService(ds, TENANT_A);
      const seeded = await seedFutureBooking(ds, {
        tenantId: TENANT_A,
        serviceId: service.id,
        resource: source,
        startsInHours: 24,
      });
      await deactivate(source.id);
      const [entry] = await openEntries();
      const newTime = new Date(Date.now() + 120 * 3_600_000).toISOString();

      const { body } = await resolve({
        exceptionIds: [entry.id],
        resolutionType: 'RESCHEDULE',
        scheduledAt: newTime,
      }).expect(200);

      expect(body.results).toEqual([{ exceptionId: entry.id, outcome: 'RESOLVED' }]);
      const stored = await ds
        .getRepository(BookingEntity)
        .findOneByOrFail({ id: seeded.bookingId });
      expect(stored.scheduledAt.toISOString()).toBe(newTime);
      expect(await occupiedResourceIds(ds, TENANT_A, seeded.bookingId)).toEqual([replacement.id]);
    });

    it('RESCHEDULE refuses a PENDING booking and keeps the entry OPEN', async () => {
      const source = await seedResource(ds, TENANT_A, 'Sala 1');
      await seedResource(ds, TENANT_A, 'Sala 2');
      const service = await seedService(ds, TENANT_A);
      await seedFutureBooking(ds, {
        tenantId: TENANT_A,
        serviceId: service.id,
        resource: source,
        startsInHours: 24,
        status: 'PENDING',
        lockState: 'HOLD',
      });
      await deactivate(source.id);
      const [entry] = await openEntries();

      const { body } = await resolve({
        exceptionIds: [entry.id],
        resolutionType: 'RESCHEDULE',
        scheduledAt: new Date(Date.now() + 120 * 3_600_000).toISOString(),
      }).expect(200);

      expect(body.results[0]).toMatchObject({
        outcome: 'STILL_OPEN',
        errorCode: 'BOOKING_INVALID_TRANSITION',
      });
      expect((await openEntries()).map((e) => e.id)).toEqual([entry.id]);
    });
  });

  describe('dismiss and KEEP', () => {
    it('dismisses entries with a reason and removes them from the open list', async () => {
      const source = await seedResource(ds, TENANT_A, 'Sala 1');
      const service = await seedService(ds, TENANT_A);
      await seedFutureBooking(ds, {
        tenantId: TENANT_A,
        serviceId: service.id,
        resource: source,
        startsInHours: 24,
      });
      await deactivate(source.id);
      const [entry] = await openEntries();

      const { body } = await request(app.getHttpServer())
        .post('/scheduling-exceptions/dismiss')
        .set(as())
        .send({ exceptionIds: [entry.id], reason: 'handled by phone' })
        .expect(200);

      expect(body.results).toEqual([{ exceptionId: entry.id, outcome: 'RESOLVED' }]);
      expect(await openEntries()).toEqual([]);
      const stored = await ds
        .getRepository(FutureCommitmentExceptionEntity)
        .findOneByOrFail({ id: entry.id });
      expect(stored).toMatchObject({ status: 'DISMISSED', resolutionReason: 'handled by phone' });
    });

    it('KEEP resolves without touching the booking or its occupancy', async () => {
      const source = await seedResource(ds, TENANT_A, 'Sala 1');
      const service = await seedService(ds, TENANT_A);
      const seeded = await seedFutureBooking(ds, {
        tenantId: TENANT_A,
        serviceId: service.id,
        resource: source,
        startsInHours: 24,
      });
      await deactivate(source.id);
      const [entry] = await openEntries();

      await resolve({ exceptionIds: [entry.id], resolutionType: 'KEEP' }).expect(200);

      expect(await occupiedResourceIds(ds, TENANT_A, seeded.bookingId)).toEqual([source.id]);
    });
  });

  describe('concurrency', () => {
    it('two managers resolving the same entry at once: exactly one wins, the other is told it is closed', async () => {
      const source = await seedResource(ds, TENANT_A, 'Sala 1');
      const service = await seedService(ds, TENANT_A);
      await seedFutureBooking(ds, {
        tenantId: TENANT_A,
        serviceId: service.id,
        resource: source,
        startsInHours: 24,
      });
      await deactivate(source.id);
      const [entry] = await openEntries();

      const [first, second] = await Promise.all([
        resolve({ exceptionIds: [entry.id], resolutionType: 'KEEP' }),
        resolve({ exceptionIds: [entry.id], resolutionType: 'KEEP' }),
      ]);

      const outcomes = [first.body.results[0], second.body.results[0]];
      expect(outcomes.filter((r) => r.outcome === 'RESOLVED')).toHaveLength(1);
      expect(outcomes.find((r) => r.outcome === 'STILL_OPEN')).toMatchObject({
        errorCode: 'BOOKING_EXCEPTION_ALREADY_RESOLVED',
      });
    });
  });

  describe('access and validation', () => {
    it('returns 403 for STAFF on every route', async () => {
      const list = await request(app.getHttpServer())
        .get('/scheduling-exceptions')
        .set(as(TENANT_A, 'STAFF'));
      const resolved = await request(app.getHttpServer())
        .post('/scheduling-exceptions/resolve')
        .set(as(TENANT_A, 'STAFF'))
        .send({ exceptionIds: [MANAGER_ID], resolutionType: 'KEEP' });
      const dismissed = await request(app.getHttpServer())
        .post('/scheduling-exceptions/dismiss')
        .set(as(TENANT_A, 'STAFF'))
        .send({ exceptionIds: [MANAGER_ID], reason: 'x' });

      expect([list.status, resolved.status, dismissed.status]).toEqual([403, 403, 403]);
    });

    it('returns 400 when REASSIGN has no target', async () => {
      const res = await resolve({ exceptionIds: [MANAGER_ID], resolutionType: 'REASSIGN' });

      expect(res.status).toBe(400);
    });

    it('never exposes the retired per-id routes', async () => {
      const res = await request(app.getHttpServer())
        .post(`/scheduling-exceptions/${MANAGER_ID}/resolve`)
        .set(as())
        .send({ resolutionType: 'KEEP' });

      expect(res.status).toBe(404);
    });
  });

  describe('tenant isolation', () => {
    it('never lists, resolves or dismisses another tenant’s entry', async () => {
      const source = await seedResource(ds, TENANT_A, 'Sala 1');
      const service = await seedService(ds, TENANT_A);
      await seedFutureBooking(ds, {
        tenantId: TENANT_A,
        serviceId: service.id,
        resource: source,
        startsInHours: 24,
      });
      await deactivate(source.id);
      const [entry] = await openEntries();

      expect(await openEntries(TENANT_B)).toEqual([]);
      const resolved = await resolve(
        { exceptionIds: [entry.id], resolutionType: 'CANCEL' },
        TENANT_B,
      ).expect(200);
      expect(resolved.body.results[0]).toMatchObject({
        outcome: 'STILL_OPEN',
        errorCode: 'BOOKING_EXCEPTION_NOT_FOUND',
      });
      const dismissed = await request(app.getHttpServer())
        .post('/scheduling-exceptions/dismiss')
        .set(as(TENANT_B))
        .send({ exceptionIds: [entry.id], reason: 'x' })
        .expect(200);
      expect(dismissed.body.results[0].errorCode).toBe('BOOKING_EXCEPTION_NOT_FOUND');

      const untouched = await ds
        .getRepository(FutureCommitmentExceptionEntity)
        .findOneByOrFail({ id: entry.id });
      expect(untouched.status).toBe('OPEN');
      const resource = await ds.getRepository(ResourceEntity).findOneByOrFail({ id: source.id });
      expect(resource.isActive).toBe(false);
    });
  });
});

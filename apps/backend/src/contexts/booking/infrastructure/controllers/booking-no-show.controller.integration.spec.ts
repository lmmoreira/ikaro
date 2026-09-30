import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  BookingEntityBuilder,
  BookingLineEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { futureDate, pastDate } from '../../../../test/utils/date-helpers';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { PlatformModule } from '../../../platform/platform.module';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { BookingStatusTransitionEntity } from '../entities/booking-status-transition.entity';
import { ServiceEntity } from '../entities/service.entity';

const TEST_KEY = 'booking-integ-test-key-no-show-xxx'; // 35 chars
const STAFF_ID = '20000000-0000-4000-8000-0000000000a2';
const MANAGER_ID = '20000000-0000-4000-8000-0000000000a3';

describe('BookingCompletionController no-show routes (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantAId: string;
  let tenantBId: string;
  let serviceId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({ extraModules: [PlatformModule] }));

    const createTenant = async (slug: string): Promise<string> => {
      const { body } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Platform-Admin-Key', TEST_KEY)
        .send({ name: slug, slug, adminEmail: `a@${slug}.test`, country_code: 'BR' })
        .expect(201);
      return body.tenantId as string;
    };
    tenantAId = await createTenant('noshow-tenant-a');
    tenantBId = await createTenant('noshow-tenant-b');

    const svc = new ServiceEntityBuilder()
      .withTenantId(tenantAId)
      .withName('Lavagem Simples')
      .withPriceAmount('100.00')
      .withDurationMinutes(30)
      .withIsActive(true)
      .build();
    await ds.getRepository(ServiceEntity).save(svc);
    serviceId = svc.id;
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  async function seedBooking(status: string, scheduledAt: Date, tenantId = tenantAId) {
    const booking = new BookingEntityBuilder()
      .withTenantId(tenantId)
      .withStatus(status)
      .withScheduledAt(scheduledAt)
      .withTotalDurationMins(30)
      .withTotalPriceAmount('100.00')
      .build();
    await ds.getRepository(BookingEntity).save(booking);
    await ds
      .getRepository(BookingLineEntity)
      .save(
        new BookingLineEntityBuilder()
          .withBookingId(booking.id)
          .withTenantId(tenantId)
          .withServiceId(serviceId)
          .withPriceAtBookingAmount('100.00')
          .withDurationMinsAtBooking(30)
          .build(),
      );
    return booking;
  }

  const past = () => new Date(`${pastDate(3)}T13:00:00.000Z`);
  const future = () => new Date(`${futureDate(3)}T13:00:00.000Z`);
  const rowsFor = (bookingId: string) =>
    ds
      .getRepository(BookingStatusTransitionEntity)
      .find({ where: { tenantId: tenantAId, bookingId }, order: { occurredAt: 'ASC' } });

  describe('POST /bookings/:id/no-show', () => {
    it('lets STAFF mark an ended APPROVED booking and records the audit row', async () => {
      const booking = await seedBooking('APPROVED', past());

      const { body } = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/no-show`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'STAFF', uuidv7()))
        .send({ reason: 'Cliente não atendeu o telefone.' })
        .expect(200);

      expect(body).toEqual({ bookingId: booking.id, status: 'NO_SHOW' });
      const row = await ds
        .getRepository(BookingEntity)
        .findOneByOrFail({ id: booking.id, tenantId: tenantAId });
      expect(row.status).toBe('NO_SHOW');
      const rows = await rowsFor(booking.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        fromStatus: 'APPROVED',
        toStatus: 'NO_SHOW',
        actorType: 'STAFF',
        actorId: STAFF_ID,
        reason: 'Cliente não atendeu o telefone.',
      });
    });

    it('returns 422 BOOKING_NOT_YET_ENDED for an appointment in the future and records nothing', async () => {
      const booking = await seedBooking('APPROVED', future());

      const { body } = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/no-show`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'STAFF', uuidv7()))
        .send({})
        .expect(422);

      expect(body.code).toBe('BOOKING_NOT_YET_ENDED');
      expect(await rowsFor(booking.id)).toHaveLength(0);
    });

    it('returns 409 BOOKING_ALREADY_TERMINAL for a COMPLETED booking', async () => {
      const booking = await seedBooking('COMPLETED', past());

      const { body } = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/no-show`)
        .set(actorHeaders(tenantAId, MANAGER_ID, 'MANAGER', uuidv7()))
        .send({})
        .expect(409);

      expect(body.code).toBe('BOOKING_ALREADY_TERMINAL');
    });

    it('returns 403 for a CUSTOMER caller', async () => {
      const booking = await seedBooking('APPROVED', past());

      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/no-show`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'CUSTOMER', uuidv7()))
        .send({})
        .expect(403);
    });

    it("tenant isolation: tenant B cannot mark tenant A's booking (404)", async () => {
      const booking = await seedBooking('APPROVED', past());

      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/no-show`)
        .set(actorHeaders(tenantBId, STAFF_ID, 'MANAGER', uuidv7()))
        .send({})
        .expect(404);

      const row = await ds
        .getRepository(BookingEntity)
        .findOneByOrFail({ id: booking.id, tenantId: tenantAId });
      expect(row.status).toBe('APPROVED');
    });
  });

  describe('POST /bookings/:id/no-show/correct', () => {
    const body = {
      correctedStatus: 'COMPLETED',
      reason: 'Cliente chegou atrasado e foi atendido.',
    };

    it('lets a MANAGER correct a NO_SHOW booking to COMPLETED and records the correction row', async () => {
      const booking = await seedBooking('NO_SHOW', past());

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/no-show/correct`)
        .set(actorHeaders(tenantAId, MANAGER_ID, 'MANAGER', uuidv7()))
        .send(body)
        .expect(200);

      expect(res.body.status).toBe('COMPLETED');
      const rows = await rowsFor(booking.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        fromStatus: 'NO_SHOW',
        toStatus: 'COMPLETED',
        actorType: 'MANAGER',
        actorId: MANAGER_ID,
        reason: body.reason,
      });
      const lines = await ds.getRepository(BookingLineEntity).find({
        where: { tenantId: tenantAId, bookingId: booking.id },
      });
      expect(lines).toHaveLength(1);
      expect(lines.map((l) => Number(l.actualPriceChargedAmount))).toEqual(
        lines.map((l) => Number(l.priceAtBookingAmount)),
      );
    });

    it('returns 403 for STAFF and leaves the booking NO_SHOW', async () => {
      const booking = await seedBooking('NO_SHOW', past());

      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/no-show/correct`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'STAFF', uuidv7()))
        .send(body)
        .expect(403);

      const row = await ds
        .getRepository(BookingEntity)
        .findOneByOrFail({ id: booking.id, tenantId: tenantAId });
      expect(row.status).toBe('NO_SHOW');
    });

    it('returns 422 BOOKING_INVALID_TRANSITION when the booking is not NO_SHOW', async () => {
      const booking = await seedBooking('APPROVED', past());

      const res = await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/no-show/correct`)
        .set(actorHeaders(tenantAId, MANAGER_ID, 'MANAGER', uuidv7()))
        .send(body)
        .expect(422);

      expect(res.body.code).toBe('BOOKING_INVALID_TRANSITION');
    });

    it('returns 400 for a too-short reason or a target other than COMPLETED', async () => {
      const booking = await seedBooking('NO_SHOW', past());
      const call = (payload: object) =>
        request(app.getHttpServer())
          .post(`/bookings/${booking.id}/no-show/correct`)
          .set(actorHeaders(tenantAId, MANAGER_ID, 'MANAGER', uuidv7()))
          .send(payload);

      await call({ correctedStatus: 'COMPLETED', reason: 'curto' }).expect(400);
      await call({ correctedStatus: 'CANCELLED', reason: body.reason }).expect(400);
    });

    it("tenant isolation: tenant B cannot correct tenant A's no-show (404)", async () => {
      const booking = await seedBooking('NO_SHOW', past());

      await request(app.getHttpServer())
        .post(`/bookings/${booking.id}/no-show/correct`)
        .set(actorHeaders(tenantBId, MANAGER_ID, 'MANAGER', uuidv7()))
        .send(body)
        .expect(404);
    });
  });
});

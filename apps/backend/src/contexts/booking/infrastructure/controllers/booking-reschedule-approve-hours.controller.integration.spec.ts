import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  ScheduleClosureEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { DEFAULT_TEST_BUSINESS_HOURS } from '../../../../test/utils/business-hours-fixtures';
import { openSlotAt } from '../../../../test/utils/date-helpers';
import { PlatformModule } from '../../../platform/platform.module';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { BookingEntity } from '../entities/booking.entity';
import { ScheduleClosureEntity } from '../entities/schedule-closure.entity';
import { ServiceEntity } from '../entities/service.entity';

// TD50 Story 1: the customer reschedule, the admin reschedule and the approval refuse a time the
// business is closed for, against a real database. The default tenant is open Monday–Saturday
// 09:00–18:00 (17:00 on Saturday) in America/Sao_Paulo; the service takes 30 minutes.
const TEST_KEY = 'booking-integ-test-key-resched-hrs-x'; // 36 chars
const STAFF_ID = '20000000-0000-4000-8000-000000000601';
const CORRELATION_ID = '01980000-0000-7000-8000-0000000000e1';

describe('reschedule and approve honour hours and closures (integration, TD50-S01)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantAId: string;
  let tenantBId: string;
  let serviceId: string;
  let customerId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({ extraModules: [PlatformModule] }));

    const createTenant = async (slug: string): Promise<string> => {
      const { body } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Platform-Admin-Key', TEST_KEY)
        .send({ name: slug, slug, adminEmail: `admin@${slug}.test`, country_code: 'BR' })
        .expect(201);
      return body.tenantId as string;
    };
    tenantAId = await createTenant('booking-resched-hours-a');
    tenantBId = await createTenant('booking-resched-hours-b');

    const service = new ServiceEntityBuilder()
      .withTenantId(tenantAId)
      .withName('Lavagem Simples')
      .withDurationMinutes(30)
      .withBufferAfterMinutes(null)
      .withIsActive(true)
      .build();
    await ds.getRepository(ServiceEntity).save(service);
    serviceId = service.id;

    const customer = new CustomerEntityBuilder()
      .withTenantId(tenantAId)
      .withGoogleOAuthId('sub-td50-s01-customer')
      .withEmail('cliente@resched-hours.test')
      .withName('Cliente Reagenda')
      .withPhone('+5531988888888')
      .build();
    await ds.getRepository(CustomerEntity).save(customer);
    customerId = customer.id;
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  const staff = () => actorHeaders(tenantAId, STAFF_ID, 'MANAGER', CORRELATION_ID);
  const customer = () => actorHeaders(tenantAId, customerId, 'CUSTOMER', CORRELATION_ID);

  const localDateOf = (instant: string) =>
    utcDateToLocalDate(new Date(instant), DEFAULT_TEST_BUSINESS_HOURS.timezone);

  const closeDayOf = (tenantId: string, instant: string) =>
    ds
      .getRepository(ScheduleClosureEntity)
      .save(
        new ScheduleClosureEntityBuilder()
          .withTenantId(tenantId)
          .withDate(localDateOf(instant))
          .build(),
      );

  // A PENDING booking made by the customer (so the customer owns it) at an open slot.
  async function pendingBooking(scheduledAt: string): Promise<string> {
    const { body } = await request(app.getHttpServer())
      .post('/bookings/authenticated')
      .set(customer())
      .send({ scheduledAt, serviceIds: [serviceId] })
      .expect(201);
    return body.bookingId as string;
  }

  async function approvedBooking(scheduledAt: string): Promise<string> {
    const bookingId = await pendingBooking(scheduledAt);
    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/approve`)
      .set(staff())
      .expect(200);
    return bookingId;
  }

  const stored = (bookingId: string) =>
    ds.getRepository(BookingEntity).findOneByOrFail({ id: bookingId, tenantId: tenantAId });

  describe('PATCH /bookings/:id/approve', () => {
    it('refuses an approval at the original time once that day is closed, and the booking stays PENDING', async () => {
      const at = openSlotAt(10, 10);
      const bookingId = await pendingBooking(at);
      await closeDayOf(tenantAId, at);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/approve`)
        .set(staff())
        .expect(409);

      expect(body.code).toBe('BOOKING_SLOT_CLOSED');
      expect((await stored(bookingId)).status).toBe('PENDING');
    });

    it('refuses an approval at a new time on a closed day', async () => {
      const bookingId = await pendingBooking(openSlotAt(11, 10));
      const newAt = openSlotAt(12, 10);
      await closeDayOf(tenantAId, newAt);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/approve`)
        .set(staff())
        .send({ scheduledAt: newAt })
        .expect(409);

      expect(body.code).toBe('BOOKING_SLOT_CLOSED');
      expect((await stored(bookingId)).status).toBe('PENDING');
    });

    it('refuses an approval at a new time outside the working hours', async () => {
      const bookingId = await pendingBooking(openSlotAt(13, 10));

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/approve`)
        .set(staff())
        .send({ scheduledAt: openSlotAt(14, 20) })
        .expect(409);

      expect(body.code).toBe('BOOKING_OUTSIDE_BUSINESS_HOURS');
    });

    it('approves with a new open time when the original day has been closed', async () => {
      const at = openSlotAt(15, 10);
      const bookingId = await pendingBooking(at);
      await closeDayOf(tenantAId, at);
      const newAt = openSlotAt(16, 10);

      await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/approve`)
        .set(staff())
        .send({ scheduledAt: newAt })
        .expect(200);

      const row = await stored(bookingId);
      expect(row.status).toBe('APPROVED');
      expect(row.scheduledAt.toISOString()).toBe(new Date(newAt).toISOString());
    });

    it("tenant isolation: another tenant's closure does not refuse the approval", async () => {
      const at = openSlotAt(17, 10);
      const bookingId = await pendingBooking(at);
      await closeDayOf(tenantBId, at);

      await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/approve`)
        .set(staff())
        .expect(200);
    });
  });

  describe.each([
    ['reschedule-admin', () => staff(), (newAt: string) => ({ scheduledAt: newAt }), 20],
    ['reschedule-customer', () => customer(), (newAt: string) => ({ scheduledAt: newAt }), 30],
  ])('PATCH /bookings/:id/%s', (route, headers, body, base) => {
    const send = (bookingId: string, newAt: string) =>
      request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/${route}`)
        .set(headers())
        .send(body(newAt));

    it('refuses a closed day with 409 BOOKING_SLOT_CLOSED and keeps the booking where it was', async () => {
      const at = openSlotAt(base, 10);
      const bookingId = await approvedBooking(at);
      const newAt = openSlotAt(base + 1, 10);
      await closeDayOf(tenantAId, newAt);

      const { body: problem } = await send(bookingId, newAt).expect(409);

      expect(problem.code).toBe('BOOKING_SLOT_CLOSED');
      expect((await stored(bookingId)).scheduledAt.toISOString()).toBe(new Date(at).toISOString());
    });

    it('refuses a time outside the working hours with 409 BOOKING_OUTSIDE_BUSINESS_HOURS', async () => {
      const bookingId = await approvedBooking(openSlotAt(base + 2, 10));

      const { body: problem } = await send(bookingId, openSlotAt(base + 3, 20)).expect(409);

      expect(problem.code).toBe('BOOKING_OUTSIDE_BUSINESS_HOURS');
    });

    it('moves the booking to an open time', async () => {
      const bookingId = await approvedBooking(openSlotAt(base + 4, 10));
      const newAt = openSlotAt(base + 5, 11);

      await send(bookingId, newAt).expect(200);

      expect((await stored(bookingId)).scheduledAt.toISOString()).toBe(
        new Date(newAt).toISOString(),
      );
    });

    it("tenant isolation: another tenant's closure does not refuse the reschedule", async () => {
      const bookingId = await approvedBooking(openSlotAt(base + 6, 10));
      const newAt = openSlotAt(base + 7, 10);
      await closeDayOf(tenantBId, newAt);

      await send(bookingId, newAt).expect(200);
    });
  });

  describe('a closure created later never acts on an existing booking', () => {
    it('leaves an APPROVED booking in a newly closed day untouched, and staff can still cancel it', async () => {
      const at = openSlotAt(40, 10);
      const bookingId = await approvedBooking(at);

      await closeDayOf(tenantAId, at);

      const row = await stored(bookingId);
      expect(row.status).toBe('APPROVED');
      expect(row.scheduledAt.toISOString()).toBe(new Date(at).toISOString());
      await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/cancel-admin`)
        .set(staff())
        .send({})
        .expect(200);
    });

    it('lets staff reject a PENDING request that sits in a newly closed day', async () => {
      const at = openSlotAt(41, 10);
      const bookingId = await pendingBooking(at);
      await closeDayOf(tenantAId, at);

      await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/reject`)
        .set(staff())
        .send({ reason: 'Fechado nesse dia' })
        .expect(200);

      expect((await stored(bookingId)).status).toBe('REJECTED');
    });
  });
});

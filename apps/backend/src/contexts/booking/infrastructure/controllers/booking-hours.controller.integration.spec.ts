import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  ScheduleClosureEntityBuilder,
  ScheduleOpeningEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { getUtcWeekDayName, localDateTimeToUTCIso } from '../../../../shared/utils/calendar-date';
import { DEFAULT_TEST_BUSINESS_HOURS } from '../../../../test/utils/business-hours-fixtures';
import { nextWeekday, openDate, openSlotAt } from '../../../../test/utils/date-helpers';
import { PlatformModule } from '../../../platform/platform.module';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { BookingEntity } from '../entities/booking.entity';
import { ResourceEntity } from '../entities/resource.entity';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';
import { ScheduleClosureEntity } from '../entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from '../entities/schedule-opening.entity';
import { ServiceEntity } from '../entities/service.entity';

// the three booking-creating routes refuse a start the business is closed for, against a
// real database. The default tenant is open Monday–Friday 09:00–18:00 and Saturday 09:00–17:00 in
// America/Sao_Paulo; the service takes 30 minutes with no trailing buffer unless a case says so.
const TEST_KEY = 'booking-integ-test-key-hours-xxxxx'; // 36 chars
const STAFF_ID = '20000000-0000-4000-8000-000000000501';
const CORRELATION_ID = '01980000-0000-7000-8000-0000000000d1';

interface Route {
  name: string;
  // The nth open day to use for this route's own bookings, so routes never share a slot.
  index: number;
  send: (scheduledAt: string, serviceId?: string) => request.Test;
}

describe('booking creation honours hours, closures and openings (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantAId: string;
  let tenantBId: string;
  let serviceId: string;
  let bufferedServiceId: string;
  let inheritingServiceId: string;
  let customerId: string;
  let locationId: string;

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
    tenantAId = await createTenant('booking-hours-tenant-a');
    tenantBId = await createTenant('booking-hours-tenant-b');

    const plain = new ServiceEntityBuilder()
      .withTenantId(tenantAId)
      .withName('Lavagem Simples')
      .withDurationMinutes(30)
      .withBufferAfterMinutes(0)
      .withIsActive(true)
      .build();
    const inheriting = new ServiceEntityBuilder()
      .withTenantId(tenantAId)
      .withName('Lavagem Herdada')
      .withDurationMinutes(30)
      .withBufferAfterMinutes(null)
      .withIsActive(true)
      .build();
    const buffered = new ServiceEntityBuilder()
      .withTenantId(tenantAId)
      .withName('Lavagem com Intervalo')
      .withDurationMinutes(30)
      .withBufferAfterMinutes(60)
      .withIsActive(true)
      .build();
    await ds.getRepository(ServiceEntity).save([plain, inheriting, buffered]);
    serviceId = plain.id;
    bufferedServiceId = buffered.id;
    inheritingServiceId = inheriting.id;

    const customer = new CustomerEntityBuilder()
      .withTenantId(tenantAId)
      .withGoogleOAuthId('sub-td50-hours-customer')
      .withEmail('cliente@hours.test')
      .withName('Cliente Horário')
      .withPhone('+5531988888888')
      .build();
    await ds.getRepository(CustomerEntity).save(customer);
    customerId = customer.id;

    locationId = (
      await ds
        .getRepository(ResourceEntity)
        .findOneByOrFail({ tenantId: tenantAId, type: 'LOCATION' as ResourceEntity['type'] })
    ).id;
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  const guest = (tenantId: string) => ({
    'x-tenant-id': tenantId,
    'x-correlation-id': CORRELATION_ID,
  });

  const routes = (): Route[] => [
    {
      name: 'POST /bookings (guest)',
      index: 0,
      send: (scheduledAt, id = serviceId) =>
        request(app.getHttpServer())
          .post('/bookings')
          .set(guest(tenantAId))
          .send({
            contactEmail: 'joao@hours.test',
            contactName: 'João Silva',
            contactPhone: '+5531999999999',
            scheduledAt,
            serviceIds: [id],
          }),
    },
    {
      name: 'POST /bookings/authenticated (customer)',
      index: 1,
      send: (scheduledAt, id = serviceId) =>
        request(app.getHttpServer())
          .post('/bookings/authenticated')
          .set(actorHeaders(tenantAId, customerId, 'CUSTOMER', CORRELATION_ID))
          .send({ scheduledAt, serviceIds: [id] }),
    },
    {
      name: 'POST /bookings/staff (staff)',
      index: 2,
      send: (scheduledAt, id = serviceId) =>
        request(app.getHttpServer())
          .post('/bookings/staff')
          .set(actorHeaders(tenantAId, STAFF_ID, 'STAFF', CORRELATION_ID))
          .send({ customerId, scheduledAt, serviceIds: [id] }),
    },
  ];

  const closeDay = (
    tenantId: string,
    date: string,
    extra?: (b: ScheduleClosureEntityBuilder) => void,
  ) => {
    const builder = new ScheduleClosureEntityBuilder().withTenantId(tenantId).withDate(date);
    extra?.(builder);
    return ds.getRepository(ScheduleClosureEntity).save(builder.build());
  };

  describe.each(routes())('$name', (route) => {
    const at = (nth: number, hour: number) => openSlotAt(nth + route.index, hour);

    it('creates the booking inside open hours (control)', async () => {
      const { body } = await route.send(at(10, 10)).expect(201);
      expect(body.bookingId).toEqual(expect.any(String));
    });

    it('refuses a normally-closed weekday with 409 BOOKING_SLOT_CLOSED', async () => {
      const sunday = `${nextWeekday(0, 1 + route.index)}T13:00:00.000Z`;
      const { body } = await route.send(sunday).expect(409);
      expect(body.code).toBe('BOOKING_SLOT_CLOSED');
    });

    it.each([
      ['before opening', 6],
      ['after closing', 20],
    ])('refuses a start %s with 409 BOOKING_OUTSIDE_BUSINESS_HOURS', async (_label, hour) => {
      const { body } = await route.send(at(14, hour)).expect(409);
      expect(body.code).toBe('BOOKING_OUTSIDE_BUSINESS_HOURS');
    });

    it("counts the service's trailing buffer: the last start whose buffer ends by closing is accepted", async () => {
      const day = openDate(60 + route.index);
      // The 30-minute service plus its 60-minute buffer must end by closing, which is earlier on a
      // Saturday (17:00) than on a weekday (18:00).
      const closing = DEFAULT_TEST_BUSINESS_HOURS[getUtcWeekDayName(day)]!.close;
      const [closeHour, closeMinute] = closing.split(':').map(Number);
      const lastStart = closeHour * 60 + closeMinute - 90;
      const startAt = (minutes: number) =>
        localDateTimeToUTCIso(
          day,
          `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
          DEFAULT_TEST_BUSINESS_HOURS.timezone,
        );
      const { body } = await route.send(startAt(lastStart + 30), bufferedServiceId).expect(409);
      expect(body.code).toBe('BOOKING_OUTSIDE_BUSINESS_HOURS');
      const { body: created } = await route.send(startAt(lastStart), bufferedServiceId).expect(201);
      expect(created.bookingId).toEqual(expect.any(String));
    });

    it("counts the tenant's default buffer for a service with no override of its own, and persists that same gap (TD51-S00)", async () => {
      const day = openDate(70 + route.index);
      const closing = DEFAULT_TEST_BUSINESS_HOURS[getUtcWeekDayName(day)]!.close;
      const [closeHour, closeMinute] = closing.split(':').map(Number);
      // 30 minutes of service plus the tenant's default 60-minute buffer must end by closing.
      const lastStart = closeHour * 60 + closeMinute - 90;
      const startAt = (minutes: number) =>
        localDateTimeToUTCIso(
          day,
          `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
          DEFAULT_TEST_BUSINESS_HOURS.timezone,
        );
      const { body } = await route.send(startAt(lastStart + 30), inheritingServiceId).expect(409);
      expect(body.code).toBe('BOOKING_OUTSIDE_BUSINESS_HOURS');

      await route.send(startAt(lastStart), inheritingServiceId).expect(201);

      const row = await ds.getRepository(ResourceOccupancyEntity).findOneByOrFail({
        tenantId: tenantAId,
        resourceId: locationId,
        startsAt: new Date(startAt(lastStart)),
      });
      expect(row.gapMinutes).toBe(60);
      expect(row.endsAt.getTime() - row.startsAt.getTime()).toBe(90 * 60_000);
    });

    it('adds no trailing gap for an explicit zero override even though the tenant default is larger (TD51-S00)', async () => {
      const { body } = await route.send(at(65, 10)).expect(201);
      expect(body.bookingId).toEqual(expect.any(String));
      const row = await ds.getRepository(ResourceOccupancyEntity).findOneByOrFail({
        tenantId: tenantAId,
        resourceId: locationId,
        startsAt: new Date(at(65, 10)),
      });
      expect(row.gapMinutes).toBeNull();
      expect(row.endsAt.getTime() - row.startsAt.getTime()).toBe(30 * 60_000);
    });

    it('refuses a full-day closure with 409 BOOKING_SLOT_CLOSED', async () => {
      await closeDay(tenantAId, openDate(20 + route.index));
      const { body } = await route.send(at(20, 10)).expect(409);
      expect(body.code).toBe('BOOKING_SLOT_CLOSED');
    });

    it('refuses a start inside a partial closure and accepts one outside it', async () => {
      await closeDay(tenantAId, openDate(30 + route.index), (b) =>
        b.withStartTime('10:00').withEndTime('12:00'),
      );
      const { body } = await route.send(at(30, 10)).expect(409);
      expect(body.code).toBe('BOOKING_SLOT_CLOSED');
      await route.send(at(30, 14)).expect(201);
    });

    it('refuses a start on a resource closure of the resource it needs', async () => {
      await closeDay(tenantAId, openDate(40 + route.index), (b) => b.withResourceId(locationId));
      const { body } = await route.send(at(40, 10)).expect(409);
      expect(body.code).toBe('BOOKING_SLOT_CLOSED');
    });

    it('lets a start inside an opening on a closed day in, and refuses one outside it', async () => {
      const sunday = nextWeekday(0, 5 + route.index);
      await ds
        .getRepository(ScheduleOpeningEntity)
        .save(
          new ScheduleOpeningEntityBuilder()
            .withTenantId(tenantAId)
            .withDate(sunday)
            .withStartTime('09:00')
            .withEndTime('12:00')
            .build(),
        );
      await route.send(`${sunday}T13:00:00.000Z`).expect(201); // 10:00 local
      const { body } = await route.send(`${sunday}T18:00:00.000Z`).expect(409); // 15:00 local
      expect(body.code).toBe('BOOKING_OUTSIDE_BUSINESS_HOURS');
    });
  });

  it("tenant isolation: another tenant's closure on the same date does not refuse the booking", async () => {
    const date = openDate(50);
    await closeDay(tenantBId, date);
    const { body } = await routes()[0].send(`${date}T13:00:00.000Z`).expect(201);
    expect(body.bookingId).toEqual(expect.any(String));
  });

  it('leaves a booking made before a closure untouched when the closure is added later', async () => {
    const [route] = routes();
    const date = openDate(55);
    const { body } = await route.send(`${date}T13:00:00.000Z`).expect(201);

    await closeDay(tenantAId, date);

    const row = await ds
      .getRepository(BookingEntity)
      .findOneByOrFail({ id: body.bookingId, tenantId: tenantAId });
    expect(row).toMatchObject({ id: body.bookingId, status: 'PENDING' });
    const { body: refused } = await route.send(`${date}T15:00:00.000Z`).expect(409);
    expect(refused.code).toBe('BOOKING_SLOT_CLOSED');
  });
});

import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { BillingErrorCode } from '@ikaro/types';
import { ErrorFilter } from '../../../../shared/filters/error.filter';
import { TenantAccessGuard } from '../../../../shared/guards/tenant-access.guard';
import { TENANT_ACCESS_PORT } from '../../../../shared/ports/tenant-access.port';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import {
  BookingEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { openSlotAt } from '../../../../test/utils/date-helpers';
import { TEST_REGISTRATION_ID } from '../../../../test/utils/test-registration-id';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { PlatformModule } from '../../../platform/platform.module';
import { BookingEntity } from '../entities/booking.entity';
import { ServiceEntity } from '../entities/service.entity';

const TEST_KEY = 'booking-access-integ-key-booking-xx'; // 36 chars
const STAFF_ID = '20000000-0000-4000-8000-0000000000a1';
const SOME_ID = '20000000-0000-4000-8000-0000000000c3';
const ALL_FEATURES = ['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'] as const;

type Method = 'get' | 'post' | 'patch';
type Role = 'CUSTOMER' | 'MANAGER' | 'STAFF';

interface BookingRoute {
  method: Method;
  path: string;
  /** The caller's role; omitted on the public (guest) routes. */
  role?: Role;
}

// Every in-scope backend booking and lifecycle route. A request the guard refuses never reaches a
// pipe or a use case, so the denial matrix needs no valid body.
const ROUTES: BookingRoute[] = [
  { method: 'get', path: '/bookings', role: 'CUSTOMER' },
  { method: 'get', path: `/bookings/${SOME_ID}`, role: 'CUSTOMER' },
  { method: 'post', path: '/bookings' },
  { method: 'post', path: '/bookings/authenticated', role: 'CUSTOMER' },
  { method: 'post', path: '/bookings/staff', role: 'MANAGER' },
  { method: 'patch', path: `/bookings/${SOME_ID}/approve`, role: 'MANAGER' },
  { method: 'patch', path: `/bookings/${SOME_ID}/reject`, role: 'MANAGER' },
  { method: 'patch', path: `/bookings/${SOME_ID}/request-info`, role: 'MANAGER' },
  { method: 'patch', path: `/bookings/${SOME_ID}/submit-info`, role: 'CUSTOMER' },
  { method: 'patch', path: `/bookings/${SOME_ID}/submit-info/guest` },
  { method: 'patch', path: `/bookings/${SOME_ID}/cancel-customer`, role: 'CUSTOMER' },
  { method: 'patch', path: `/bookings/${SOME_ID}/cancel-admin`, role: 'MANAGER' },
  { method: 'patch', path: `/bookings/${SOME_ID}/reschedule-customer`, role: 'CUSTOMER' },
  { method: 'patch', path: `/bookings/${SOME_ID}/reschedule-admin`, role: 'MANAGER' },
  { method: 'patch', path: `/bookings/${SOME_ID}/complete`, role: 'MANAGER' },
  { method: 'post', path: `/bookings/${SOME_ID}/no-show`, role: 'MANAGER' },
  { method: 'post', path: `/bookings/${SOME_ID}/no-show/correct`, role: 'MANAGER' },
  { method: 'post', path: '/bookings/attachments/signed-url', role: 'CUSTOMER' },
];

// What UC-121 leaves reachable while suspended (CUSTOMER_HISTORY, customer role only). Every other
// route above is refused with BILLING_TENANT_SUSPENDED.
const HISTORY_ROUTES = new Set(['get /bookings', `patch /bookings/${SOME_ID}/cancel-customer`]);
const routeKey = (route: BookingRoute) => `${route.method} ${route.path}`;
const SUSPENDED_ROUTES = ROUTES.filter((route) => !HISTORY_ROUTES.has(routeKey(route)));

const withoutBooking = () =>
  ALL_FEATURES.filter((key) => key !== 'BOOKING').map((key) => ({
    key,
    tier: 'STANDARD' as const,
  }));

// M25-S18a — the real booking controllers behind the real `TenantAccessGuard`, with only the
// access answer faked. Existing per-controller specs stay unchanged (they run without the guard,
// which is the non-regression proof for an entitled or exempt tenant).
describe('Booking routes — tenant access (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let access: InMemoryTenantAccessPort;
  let tenantA: string;
  let tenantB: string;
  let serviceA: string;
  let customerA: string;

  async function provisionTenant(label: string): Promise<string> {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({
        name: `Booking Access ${label}`,
        slug: `booking-access-${label}`,
        adminEmail: `${label}@booking-access.test`,
        country_code: 'BR',
        registrationId: TEST_REGISTRATION_ID,
      })
      .expect(201);
    return body.tenantId as string;
  }

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    access = new InMemoryTenantAccessPort();
    ({ app, ds } = await createBookingIntegrationApp({
      extraModules: [PlatformModule],
      extraProviders: [
        { provide: APP_FILTER, useClass: ErrorFilter },
        { provide: APP_GUARD, useClass: TenantAccessGuard },
      ],
      overrideProviders: [{ provide: TENANT_ACCESS_PORT, useValue: access }],
    }));

    tenantA = await provisionTenant('a');
    tenantB = await provisionTenant('b');

    const service = new ServiceEntityBuilder()
      .withTenantId(tenantA)
      .withName('Lavagem Completa')
      .withPriceAmount('100.00')
      .withDurationMinutes(30)
      .withIsActive(true)
      .build();
    await ds.getRepository(ServiceEntity).save(service);
    serviceA = service.id;

    const customer = new CustomerEntityBuilder()
      .withTenantId(tenantA)
      .withGoogleOAuthId('google-sub-booking-access')
      .withEmail('customer@booking-access.test')
      .withName('Access Customer')
      .withPhone('+5531944444444')
      .build();
    await ds.getRepository(CustomerEntity).save(customer);
    customerA = customer.id;
  });

  afterEach(() => {
    access.reactivate(tenantA);
    access.reactivate(tenantB);
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  function call(route: BookingRoute, tenantId: string, actorId = customerA) {
    const req = request(app.getHttpServer())[route.method](route.path);
    return route.role
      ? req.set(actorHeaders(tenantId, actorId, route.role))
      : req.set('x-tenant-id', tenantId);
  }

  const createBooking = async (): Promise<string> => {
    const { body } = await request(app.getHttpServer())
      .post('/bookings/authenticated')
      .set(actorHeaders(tenantA, customerA, 'CUSTOMER'))
      .send({ scheduledAt: openSlotAt(10, 9), serviceIds: [serviceA] })
      .expect(201);
    return body.bookingId as string;
  };

  describe('a tenant without BOOKING', () => {
    it.each(ROUTES.map((route) => ({ route, label: routeKey(route) })))(
      'refuses $label with BILLING_FEATURE_NOT_ENTITLED',
      async ({ route }) => {
        access.seed(tenantA, {
          status: 'ACTIVE',
          suspensionReason: null,
          operational: true,
          features: withoutBooking(),
        });

        const res = await call(route, tenantA);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
      },
    );

    it('resumes exactly as left once the entitlement returns', async () => {
      const bookingId = await createBooking();
      access.seed(tenantA, {
        status: 'ACTIVE',
        suspensionReason: null,
        operational: true,
        features: withoutBooking(),
      });
      const refused = await request(app.getHttpServer())
        .get(`/bookings/${bookingId}`)
        .set(actorHeaders(tenantA, customerA, 'CUSTOMER'));
      access.reactivate(tenantA);

      const resumed = await request(app.getHttpServer())
        .get(`/bookings/${bookingId}`)
        .set(actorHeaders(tenantA, customerA, 'CUSTOMER'));

      expect(refused.status).toBe(403);
      expect(resumed.status).toBe(200);
      expect(resumed.body.id ?? resumed.body.bookingId).toBe(bookingId);
    });
  });

  describe('a suspended tenant', () => {
    it.each(SUSPENDED_ROUTES.map((route) => ({ route, label: routeKey(route) })))(
      'refuses $label with BILLING_TENANT_SUSPENDED',
      async ({ route }) => {
        access.seedSuspended(tenantA);

        const res = await call(route, tenantA);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      },
    );

    it("lets the customer read their booking list (UC-121 'CUSTOMER_HISTORY')", async () => {
      const bookingId = await createBooking();
      access.seedSuspended(tenantA);

      const res = await request(app.getHttpServer())
        .get('/bookings')
        .set(actorHeaders(tenantA, customerA, 'CUSTOMER'));

      expect(res.status).toBe(200);
      expect((res.body.items as { id: string }[]).map((item) => item.id)).toContain(bookingId);
    });

    it('lets the customer cancel a future booking', async () => {
      const bookingId = await createBooking();
      access.seedSuspended(tenantA);

      const res = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/cancel-customer`)
        .set(actorHeaders(tenantA, customerA, 'CUSTOMER'));

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('refuses a staff caller the booking list and both cancels (CUSTOMER_HISTORY is customer-only)', async () => {
      const bookingId = await createBooking();
      access.seedSuspended(tenantA);

      const list = await request(app.getHttpServer())
        .get('/bookings')
        .set(actorHeaders(tenantA, STAFF_ID, 'STAFF'));
      const cancelCustomerRoute = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/cancel-customer`)
        .set(actorHeaders(tenantA, STAFF_ID, 'MANAGER'));
      const cancelAdmin = await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/cancel-admin`)
        .set(actorHeaders(tenantA, STAFF_ID, 'MANAGER'))
        .send({ reason: 'x' });

      for (const res of [list, cancelCustomerRoute, cancelAdmin]) {
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      }
    });

    it('leaves the record-level rule to the use case: a past approved booking is still refused with 422', async () => {
      const past = new BookingEntityBuilder()
        .withTenantId(tenantA)
        .withCustomerId(customerA)
        .withStatus('APPROVED')
        .withScheduledAt(new Date(Date.now() - 24 * 60 * 60 * 1000))
        .build();
      await ds.getRepository(BookingEntity).save(past);
      access.seedSuspended(tenantA);

      const res = await request(app.getHttpServer())
        .patch(`/bookings/${past.id}/cancel-customer`)
        .set(actorHeaders(tenantA, customerA, 'CUSTOMER'));

      expect(res.status).toBe(422);
    });
  });

  describe('an entitled tenant', () => {
    it('reaches the controller of an authenticated and of a guest route', async () => {
      const list = await call({ method: 'get', path: '/bookings', role: 'MANAGER' }, tenantA);
      const guest = await request(app.getHttpServer())
        .post('/bookings')
        .set('x-tenant-id', tenantA)
        .send({
          contactEmail: 'guest@booking-access.test',
          contactName: 'Guest',
          contactPhone: '+5531999999999',
          scheduledAt: openSlotAt(11, 9),
          serviceIds: [serviceA],
        });

      expect(list.status).toBe(200);
      expect(guest.status).toBe(201);
    });
  });

  describe('tenant isolation', () => {
    it("denies only the suspended caller's own tenant", async () => {
      access.seedSuspended(tenantA);

      const own = await call({ method: 'post', path: '/bookings/staff', role: 'MANAGER' }, tenantA);
      const other = await call({ method: 'get', path: '/bookings', role: 'MANAGER' }, tenantB);

      expect(own.status).toBe(403);
      expect(own.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      expect(other.status).toBe(200);
    });
  });
});

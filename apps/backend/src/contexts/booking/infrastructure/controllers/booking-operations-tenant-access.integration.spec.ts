import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { BillingErrorCode } from '@ikaro/types';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ErrorFilter } from '../../../../shared/filters/error.filter';
import { TenantAccessGuard } from '../../../../shared/guards/tenant-access.guard';
import { TENANT_ACCESS_PORT } from '../../../../shared/ports/tenant-access.port';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { ServiceEntityBuilder } from '../../../../test/builders/booking/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { TEST_REGISTRATION_ID } from '../../../../test/utils/test-registration-id';
import { PlatformModule } from '../../../platform/platform.module';
import { ServiceEntity } from '../entities/service.entity';

const TEST_KEY = 'booking-ops-access-integ-key-bookin'; // 36 chars
const SOME_ID = '20000000-0000-4000-8000-0000000000d4';
const ACTOR_ID = '20000000-0000-4000-8000-0000000000a2';
const ALL_FEATURES = ['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'] as const;

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
type Role = 'CUSTOMER' | 'MANAGER' | 'STAFF';

interface OperationsRoute {
  method: Method;
  path: string;
  /** The caller's role; omitted on the public routes, which carry no actor. */
  role?: Role;
}

const route = (method: Method, path: string, role?: Role): OperationsRoute => ({
  method,
  path,
  role,
});

// Every in-scope backend route of the Booking operations half: services, resources, the schedule,
// recurring schedules, availability alerts and the worklist. A request the guard refuses never
// reaches a pipe or a use case, so the denial matrices need no valid body.
const ROUTES: OperationsRoute[] = [
  route('get', '/services', 'MANAGER'),
  route('get', `/services/${SOME_ID}`, 'MANAGER'),
  route('post', '/services', 'MANAGER'),
  route('patch', `/services/${SOME_ID}`, 'MANAGER'),
  route('patch', `/services/${SOME_ID}/resource-requirements`, 'MANAGER'),
  route('put', `/services/${SOME_ID}/legs`, 'MANAGER'),
  route('patch', `/services/${SOME_ID}/booking-policy`, 'MANAGER'),
  route('post', `/services/${SOME_ID}/intake-schema`, 'MANAGER'),
  route('get', `/services/${SOME_ID}/intake-schema`, 'MANAGER'),
  route('get', `/services/${SOME_ID}/intake-schema/public`),
  route('patch', `/services/${SOME_ID}/activate`, 'MANAGER'),
  route('delete', `/services/${SOME_ID}`, 'MANAGER'),
  route('patch', `/services/${SOME_ID}/public-page`, 'MANAGER'),
  route('get', '/services/by-slug/some-service'),
  route('get', `/services/${SOME_ID}/resource-options`),
  route('get', `/services/${SOME_ID}/quote`),
  route('get', '/resources', 'MANAGER'),
  route('get', `/resources/${SOME_ID}`, 'MANAGER'),
  route('post', '/resources', 'MANAGER'),
  route('patch', `/resources/${SOME_ID}`, 'MANAGER'),
  route('delete', `/resources/${SOME_ID}`, 'MANAGER'),
  route('post', `/resources/${SOME_ID}/reactivate`, 'MANAGER'),
  route('get', '/schedule/availability'),
  route('get', '/schedule/availability/summary'),
  route('get', '/schedule/day-grid', 'MANAGER'),
  route('get', '/schedule/closures', 'STAFF'),
  route('post', '/schedule/closures', 'STAFF'),
  route('delete', `/schedule/closures/${SOME_ID}`, 'STAFF'),
  route('get', '/schedule/openings', 'STAFF'),
  route('post', '/schedule/openings', 'STAFF'),
  route('delete', `/schedule/openings/${SOME_ID}`, 'STAFF'),
  route('get', '/recurring-booking-schedules', 'CUSTOMER'),
  route('get', `/recurring-booking-schedules/${SOME_ID}`, 'CUSTOMER'),
  route('post', '/recurring-booking-schedules', 'CUSTOMER'),
  route('post', `/recurring-booking-schedules/${SOME_ID}/end`, 'CUSTOMER'),
  route('post', `/recurring-booking-schedules/${SOME_ID}/approve`, 'MANAGER'),
  route('post', `/recurring-booking-schedules/${SOME_ID}/reject`, 'MANAGER'),
  route('post', '/availability-alerts', 'CUSTOMER'),
  route('get', '/availability-alerts', 'CUSTOMER'),
  route('get', `/availability-alerts/${SOME_ID}`, 'CUSTOMER'),
  route('patch', `/availability-alerts/${SOME_ID}`, 'CUSTOMER'),
  route('delete', `/availability-alerts/${SOME_ID}`, 'CUSTOMER'),
  route('get', '/scheduling-exceptions', 'MANAGER'),
  route('get', '/scheduling-exceptions/count', 'MANAGER'),
  route('get', `/scheduling-exceptions/by-booking/${SOME_ID}`, 'MANAGER'),
  route('post', '/scheduling-exceptions/resolve', 'MANAGER'),
  route('post', '/scheduling-exceptions/dismiss', 'MANAGER'),
];

// One read per family that works against an empty tenant: the normal result an entitled or exempt
// tenant must keep getting.
const FAMILY_READS: OperationsRoute[] = [
  route('get', '/services', 'MANAGER'),
  route('get', '/resources', 'MANAGER'),
  route('get', '/schedule/closures?from=2026-01-01&to=2026-01-31', 'STAFF'),
  route('get', '/schedule/openings?from=2026-01-01&to=2026-01-31', 'STAFF'),
  route('get', '/scheduling-exceptions/count', 'MANAGER'),
  route('get', '/recurring-booking-schedules', 'CUSTOMER'),
  route('get', '/availability-alerts', 'CUSTOMER'),
];

const routeKey = (entry: OperationsRoute) => `${entry.method} ${entry.path}`;

const withoutBooking = () =>
  ALL_FEATURES.filter((key) => key !== 'BOOKING').map((key) => ({
    key,
    tier: 'STANDARD' as const,
  }));

const allFeatures = () => ALL_FEATURES.map((key) => ({ key, tier: 'STANDARD' as const }));

// M25-S18b — the real booking operations controllers behind the real `TenantAccessGuard`, with only
// the access answer faked. Existing per-controller specs stay unchanged (they run without the
// guard, which is the non-regression proof for "no behaviour change").
describe('Booking operations routes — tenant access (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let access: InMemoryTenantAccessPort;
  let tenantA: string;
  let tenantB: string;

  async function provisionTenant(label: string): Promise<string> {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({
        name: `Booking Ops Access ${label}`,
        slug: `booking-ops-access-${label}-${uuidv7().slice(-12)}`,
        adminEmail: `${label}@booking-ops-access.test`,
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
  });

  afterEach(() => {
    access.reactivate(tenantA);
    access.reactivate(tenantB);
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  function call(entry: OperationsRoute, tenantId: string) {
    const req = request(app.getHttpServer())[entry.method](entry.path);
    return entry.role
      ? req.set(actorHeaders(tenantId, ACTOR_ID, entry.role))
      : req.set('x-tenant-id', tenantId);
  }

  describe('a tenant without BOOKING', () => {
    it.each(ROUTES.map((entry) => ({ entry, label: routeKey(entry) })))(
      'refuses $label with BILLING_FEATURE_NOT_ENTITLED',
      async ({ entry }) => {
        access.seed(tenantA, {
          status: 'ACTIVE',
          suspensionReason: null,
          operational: true,
          features: withoutBooking(),
        });

        const res = await call(entry, tenantA);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
      },
    );

    it('resumes exactly as left once the entitlement returns', async () => {
      const service = new ServiceEntityBuilder()
        .withTenantId(tenantA)
        .withName('Lavagem Preservada')
        .withIsActive(true)
        .build();
      await ds.getRepository(ServiceEntity).save(service);
      access.seed(tenantA, {
        status: 'ACTIVE',
        suspensionReason: null,
        operational: true,
        features: withoutBooking(),
      });
      const refused = await call(route('get', `/services/${service.id}`, 'MANAGER'), tenantA);
      access.reactivate(tenantA);

      const resumed = await call(route('get', `/services/${service.id}`, 'MANAGER'), tenantA);

      expect(refused.status).toBe(403);
      expect(resumed.status).toBe(200);
      expect(resumed.body.name).toBe('Lavagem Preservada');
    });
  });

  describe('a suspended tenant', () => {
    it.each(ROUTES.map((entry) => ({ entry, label: routeKey(entry) })))(
      'refuses $label with BILLING_TENANT_SUSPENDED, the public routes included',
      async ({ entry }) => {
        access.seedSuspended(tenantA);

        const res = await call(entry, tenantA);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      },
    );
  });

  // The negative guarantee: an `exempt` subscription answers ACTIVE, operational, with every
  // feature, so the real guard must change nothing for it on any route.
  describe('an exempt tenant behaves exactly as before', () => {
    const seedExempt = (tenantId: string) =>
      access.seed(tenantId, {
        status: 'ACTIVE',
        suspensionReason: null,
        operational: true,
        features: allFeatures(),
      });

    it.each(ROUTES.map((entry) => ({ entry, label: routeKey(entry) })))(
      'never refuses $label with a billing denial',
      async ({ entry }) => {
        seedExempt(tenantA);

        const res = await call(entry, tenantA);

        expect(res.body?.code).not.toBe(BillingErrorCode.FEATURE_NOT_ENTITLED);
        expect(res.body?.code).not.toBe(BillingErrorCode.TENANT_SUSPENDED);
      },
    );

    it.each(FAMILY_READS.map((entry) => ({ entry, label: routeKey(entry) })))(
      'serves $label with its normal result',
      async ({ entry }) => {
        seedExempt(tenantA);

        const res = await call(entry, tenantA);

        expect(res.status).toBe(200);
      },
    );
  });

  describe('an entitled tenant', () => {
    it.each(FAMILY_READS.map((entry) => ({ entry, label: routeKey(entry) })))(
      'reaches $label',
      async ({ entry }) => {
        const res = await call(entry, tenantA);

        expect(res.status).toBe(200);
      },
    );
  });

  describe('tenant isolation', () => {
    it("denies only the suspended caller's own tenant", async () => {
      access.seedSuspended(tenantA);

      const own = await call(route('get', '/resources', 'MANAGER'), tenantA);
      const other = await call(route('get', '/resources', 'MANAGER'), tenantB);

      expect(own.status).toBe(403);
      expect(own.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      expect(other.status).toBe(200);
    });
  });
});

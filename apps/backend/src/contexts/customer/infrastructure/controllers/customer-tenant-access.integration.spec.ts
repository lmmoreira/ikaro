import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { BillingErrorCode } from '@ikaro/types';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ErrorFilter } from '../../../../shared/filters/error.filter';
import { TenantAccessGuard } from '../../../../shared/guards/tenant-access.guard';
import { TENANT_ACCESS_PORT } from '../../../../shared/ports/tenant-access.port';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createCustomerIntegrationApp } from '../../../../test/utils/customer-integration-app';
import { TEST_REGISTRATION_ID } from '../../../../test/utils/test-registration-id';
import { CustomerEntity } from '../entities/customer.entity';

const TEST_KEY = 'customer-access-integ-key-customer'; // 35 chars, above the admin key minimum
const CUSTOMER_ID = '20000000-0000-4000-8000-0000000000c2';
const CUSTOMER_B_ID = '20000000-0000-4000-8000-0000000000c3';
const STAFF_ID = '20000000-0000-4000-8000-0000000000a4';
const ALL_FEATURES = ['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'] as const;

type Method = 'get' | 'patch';
type Role = 'CUSTOMER' | 'MANAGER' | 'STAFF';
/** What a suspended tenant gets: refused, or still served (sign-in and the switch list). */
type WhileSuspended = 'DENIED' | 'REACHABLE';

interface CustomerRoute {
  method: Method;
  path: string;
  role: Role;
  whileSuspended: WhileSuspended;
  body?: Record<string, unknown>;
}

const route = (
  method: Method,
  path: string,
  role: Role,
  whileSuspended: WhileSuspended,
  body?: Record<string, unknown>,
): CustomerRoute => ({ method, path, role, whileSuspended, body });

// Every backend route of the Customer controller. A request the guard refuses never reaches a pipe
// or a use case, so the denial matrices need no valid body.
const ROUTES: CustomerRoute[] = [
  route('get', '/customers', 'MANAGER', 'DENIED'),
  route('get', '/customers/me', 'CUSTOMER', 'REACHABLE'),
  route('get', '/customers/me/tenants', 'CUSTOMER', 'REACHABLE'),
  route('get', `/customers/${CUSTOMER_ID}`, 'MANAGER', 'DENIED'),
  route('patch', '/customers/me', 'CUSTOMER', 'DENIED', { name: 'Renamed Customer' }),
];

const routeKey = (entry: CustomerRoute) => `${entry.method} ${entry.path}`;
const asCases = (entries: CustomerRoute[]) =>
  entries.map((entry) => ({ entry, label: routeKey(entry) }));

const DENIED = ROUTES.filter((entry) => entry.whileSuspended === 'DENIED');
const REACHABLE = ROUTES.filter((entry) => entry.whileSuspended === 'REACHABLE');
// Every route works for the seeded customer: the normal result an entitled or exempt tenant must
// keep getting.
const READS = ROUTES.filter((entry) => entry.method === 'get');

const withoutHotsite = () =>
  ALL_FEATURES.filter((key) => key !== 'HOTSITE').map((key) => ({
    key,
    tier: 'STANDARD' as const,
  }));

const allFeatures = () => ALL_FEATURES.map((key) => ({ key, tier: 'STANDARD' as const }));

// M25-S19 — the real Customer controller behind the real `TenantAccessGuard`, with only the access
// answer faked. The existing customer specs stay unchanged (they run without the guard, which is
// the non-regression proof for "no behaviour change").
describe('Customer routes — tenant access (integration)', () => {
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
        name: `Customer Access ${label}`,
        slug: `customer-access-${label}-${uuidv7().slice(-12)}`,
        adminEmail: `${label}@customer-access.test`,
        country_code: 'BR',
        registrationId: TEST_REGISTRATION_ID,
      })
      .expect(201);
    return body.tenantId as string;
  }

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createCustomerIntegrationApp({
      extraProviders: [
        { provide: APP_FILTER, useClass: ErrorFilter },
        { provide: APP_GUARD, useClass: TenantAccessGuard },
      ],
    }));
    access = app.get<InMemoryTenantAccessPort>(TENANT_ACCESS_PORT);

    tenantA = await provisionTenant('a');
    tenantB = await provisionTenant('b');
    await ds
      .getRepository(CustomerEntity)
      .save([
        new CustomerEntityBuilder()
          .withId(CUSTOMER_ID)
          .withTenantId(tenantA)
          .withGoogleOAuthId('google-sub-customer-access-integ')
          .build(),
        new CustomerEntityBuilder()
          .withId(CUSTOMER_B_ID)
          .withTenantId(tenantB)
          .withGoogleOAuthId('google-sub-customer-access-integ')
          .build(),
      ]);
  });

  afterEach(() => {
    access.reactivate(tenantA);
    access.reactivate(tenantB);
  });

  afterAll(async () => {
    await ds.getRepository(CustomerEntity).delete({ tenantId: tenantA });
    await ds.getRepository(CustomerEntity).delete({ tenantId: tenantB });
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  function call(entry: CustomerRoute, tenantId: string, customerId = CUSTOMER_ID) {
    const actorId = entry.role === 'CUSTOMER' ? customerId : STAFF_ID;
    const req = request(app.getHttpServer())[entry.method](entry.path);
    const withActor = req.set(actorHeaders(tenantId, actorId, entry.role));
    return entry.body ? withActor.send(entry.body) : withActor;
  }

  describe('a tenant without HOTSITE', () => {
    it.each(asCases(ROUTES))(
      'refuses $label with BILLING_FEATURE_NOT_ENTITLED',
      async ({ entry }) => {
        access.seed(tenantA, {
          status: 'ACTIVE',
          suspensionReason: null,
          operational: true,
          features: withoutHotsite(),
        });

        const res = await call(entry, tenantA);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
      },
    );
  });

  describe('a suspended tenant', () => {
    it.each(asCases(DENIED))('refuses $label with BILLING_TENANT_SUSPENDED', async ({ entry }) => {
      access.seedSuspended(tenantA);

      const res = await call(entry, tenantA);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
    });

    // `/auth/session` calls `GET /customers/me` for a customer, and the switch list calls
    // `GET /customers/me/tenants`: both must keep answering for a customer of a suspended tenant.
    it.each(asCases(REACHABLE))('still serves $label', async ({ entry }) => {
      access.seedSuspended(tenantA);

      const res = await call(entry, tenantA);

      expect(res.status).toBe(200);
    });
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

    it.each(asCases(ROUTES))('never refuses $label with a billing denial', async ({ entry }) => {
      seedExempt(tenantA);

      const res = await call(entry, tenantA);

      expect(res.body?.code).not.toBe(BillingErrorCode.FEATURE_NOT_ENTITLED);
      expect(res.body?.code).not.toBe(BillingErrorCode.TENANT_SUSPENDED);
    });

    it.each(asCases(READS))('serves $label with its normal result', async ({ entry }) => {
      seedExempt(tenantA);

      const res = await call(entry, tenantA);

      expect(res.status).toBe(200);
    });
  });

  describe('an entitled tenant', () => {
    it.each(asCases(ROUTES))('reaches $label', async ({ entry }) => {
      const res = await call(entry, tenantA);

      expect(res.status).toBe(200);
    });
  });

  describe('tenant isolation', () => {
    it("denies only the suspended caller's own tenant", async () => {
      access.seedSuspended(tenantA);
      const patch = route('patch', '/customers/me', 'CUSTOMER', 'DENIED', { name: 'Isolated' });

      const own = await call(patch, tenantA);
      const other = await call(patch, tenantB, CUSTOMER_B_ID);

      expect(own.status).toBe(403);
      expect(own.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      expect(other.status).toBe(200);
    });
  });
});

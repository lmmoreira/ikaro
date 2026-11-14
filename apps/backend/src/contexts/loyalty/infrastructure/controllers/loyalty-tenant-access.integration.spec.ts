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
import { LoyaltyBalanceEntityBuilder } from '../../../../test/builders/loyalty/index';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createLoyaltyIntegrationApp } from '../../../../test/utils/loyalty-integration-app';
import { TEST_REGISTRATION_ID } from '../../../../test/utils/test-registration-id';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { LoyaltyBalanceEntity } from '../entities/loyalty-balance.entity';
import { LoyaltyRedemptionEntity } from '../entities/loyalty-redemption.entity';

const TEST_KEY = 'loyalty-access-integ-key-loyaltyx'; // 33 chars, above the admin key minimum
const CUSTOMER_ID = '20000000-0000-4000-8000-0000000000c1';
const STAFF_ID = '20000000-0000-4000-8000-0000000000a3';
const ALL_FEATURES = ['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'] as const;

type Method = 'get' | 'post';
type Role = 'CUSTOMER' | 'MANAGER' | 'STAFF';
/** What a suspended tenant gets: refused, or still served (the customer's own history). */
type WhileSuspended = 'DENIED' | 'REACHABLE';

interface LoyaltyRoute {
  method: Method;
  path: string;
  role: Role;
  /** `false` is the one route behind `@NoFeatureGate()`: no feature owns it. */
  featureGated: boolean;
  whileSuspended: WhileSuspended;
}

const route = (
  method: Method,
  path: string,
  role: Role,
  whileSuspended: WhileSuspended,
  featureGated = true,
): LoyaltyRoute => ({ method, path, role, featureGated, whileSuspended });

// Every backend route of the Loyalty controller. A request the guard refuses never reaches a pipe
// or a use case, so the denial matrices need no valid body.
const ROUTES: LoyaltyRoute[] = [
  route('get', '/loyalty/balance', 'CUSTOMER', 'REACHABLE'),
  route('get', '/loyalty/entries', 'CUSTOMER', 'REACHABLE'),
  route('get', '/loyalty/redemptions', 'CUSTOMER', 'REACHABLE'),
  route('get', '/loyalty/balances/own', 'CUSTOMER', 'REACHABLE', false),
  route('post', '/loyalty/redeem', 'MANAGER', 'DENIED'),
  route('get', `/loyalty/balances?customerIds=${CUSTOMER_ID}`, 'MANAGER', 'DENIED'),
  route('get', `/customers/${CUSTOMER_ID}/loyalty/balance`, 'MANAGER', 'DENIED'),
  route('get', `/customers/${CUSTOMER_ID}/loyalty/entries`, 'MANAGER', 'DENIED'),
  route('get', `/customers/${CUSTOMER_ID}/loyalty/redemptions`, 'MANAGER', 'DENIED'),
];

const routeKey = (entry: LoyaltyRoute) => `${entry.method} ${entry.path}`;
const asCases = (entries: LoyaltyRoute[]) =>
  entries.map((entry) => ({ entry, label: routeKey(entry) }));

const GATED = ROUTES.filter((entry) => entry.featureGated);
const DENIED = ROUTES.filter((entry) => entry.whileSuspended === 'DENIED');
const REACHABLE = ROUTES.filter((entry) => entry.whileSuspended === 'REACHABLE');
// The reads that work against an empty tenant: the normal result an entitled or exempt tenant
// must keep getting.
const READS = ROUTES.filter((entry) => entry.method === 'get');

const withoutLoyalty = () =>
  ALL_FEATURES.filter((key) => key !== 'LOYALTY').map((key) => ({
    key,
    tier: 'STANDARD' as const,
  }));

const allFeatures = () => ALL_FEATURES.map((key) => ({ key, tier: 'STANDARD' as const }));

// M25-S19 — the real Loyalty controller behind the real `TenantAccessGuard`, with only the access
// answer faked. The existing loyalty specs stay unchanged (they run without the guard, which is
// the non-regression proof for "no behaviour change").
describe('Loyalty routes — tenant access (integration)', () => {
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
        name: `Loyalty Access ${label}`,
        slug: `loyalty-access-${label}-${uuidv7().slice(-12)}`,
        adminEmail: `${label}@loyalty-access.test`,
        country_code: 'BR',
        registrationId: TEST_REGISTRATION_ID,
      })
      .expect(201);
    return body.tenantId as string;
  }

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createLoyaltyIntegrationApp({
      extraProviders: [
        { provide: APP_FILTER, useClass: ErrorFilter },
        { provide: APP_GUARD, useClass: TenantAccessGuard },
      ],
    }));
    access = app.get<InMemoryTenantAccessPort>(TENANT_ACCESS_PORT);

    tenantA = await provisionTenant('a');
    tenantB = await provisionTenant('b');
    // The customer's own-balances read resolves the caller's customer rows, so a customer must exist.
    await ds
      .getRepository(CustomerEntity)
      .save(
        new CustomerEntityBuilder()
          .withId(CUSTOMER_ID)
          .withTenantId(tenantA)
          .withGoogleOAuthId('google-sub-loyalty-access-integ')
          .build(),
      );
  });

  afterEach(async () => {
    access.reactivate(tenantA);
    access.reactivate(tenantB);
    await ds.getRepository(LoyaltyRedemptionEntity).delete({ tenantId: tenantA });
    await ds.getRepository(LoyaltyBalanceEntity).delete({ tenantId: tenantA });
  });

  afterAll(async () => {
    await ds.getRepository(CustomerEntity).delete({ tenantId: tenantA });
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  function call(entry: LoyaltyRoute, tenantId: string) {
    const actorId = entry.role === 'CUSTOMER' ? CUSTOMER_ID : STAFF_ID;
    const req = request(app.getHttpServer())[entry.method](entry.path);
    return req.set(actorHeaders(tenantId, actorId, entry.role));
  }

  describe('a tenant without LOYALTY', () => {
    it.each(asCases(GATED))(
      'refuses $label with BILLING_FEATURE_NOT_ENTITLED',
      async ({ entry }) => {
        access.seed(tenantA, {
          status: 'ACTIVE',
          suspensionReason: null,
          operational: true,
          features: withoutLoyalty(),
        });

        const res = await call(entry, tenantA);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
      },
    );

    it('still serves GET /loyalty/balances/own, so the tenant switch list never breaks', async () => {
      access.seed(tenantA, {
        status: 'ACTIVE',
        suspensionReason: null,
        operational: true,
        features: withoutLoyalty(),
      });

      const res = await call(
        route('get', '/loyalty/balances/own', 'CUSTOMER', 'REACHABLE'),
        tenantA,
      );

      expect(res.status).toBe(200);
    });
  });

  describe('a suspended tenant', () => {
    it.each(asCases(DENIED))('refuses $label with BILLING_TENANT_SUSPENDED', async ({ entry }) => {
      access.seedSuspended(tenantA);

      const res = await call(entry, tenantA);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
    });

    it.each(asCases(REACHABLE))('still serves $label', async ({ entry }) => {
      access.seedSuspended(tenantA);

      const res = await call(entry, tenantA);

      expect(res.status).toBe(200);
    });

    it('refuses a redemption but still reads the balance and the history', async () => {
      await ds
        .getRepository(LoyaltyBalanceEntity)
        .save(
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(tenantA)
            .withCustomerId(CUSTOMER_ID)
            .withCurrentPoints(40)
            .build(),
        );
      access.seedSuspended(tenantA);

      const redeem = await call(
        route('post', '/loyalty/redeem', 'MANAGER', 'DENIED'),
        tenantA,
      ).send({ customerId: CUSTOMER_ID, pointsToRedeem: 10 });
      const balance = await call(
        route('get', '/loyalty/balance', 'CUSTOMER', 'REACHABLE'),
        tenantA,
      );

      expect(redeem.status).toBe(403);
      expect(redeem.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      expect(balance.status).toBe(200);
      expect(balance.body.currentPoints).toBe(40);
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

    it('serves a redemption with its normal result', async () => {
      seedExempt(tenantA);
      await ds
        .getRepository(LoyaltyBalanceEntity)
        .save(
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(tenantA)
            .withCustomerId(CUSTOMER_ID)
            .withCurrentPoints(30)
            .build(),
        );

      const res = await call(route('post', '/loyalty/redeem', 'MANAGER', 'DENIED'), tenantA).send({
        customerId: CUSTOMER_ID,
        pointsToRedeem: 20,
      });

      expect(res.status).toBe(201);
      expect(res.body.newBalance).toBe(10);
    });
  });

  describe('an entitled tenant', () => {
    it.each(asCases(READS))('reaches $label', async ({ entry }) => {
      const res = await call(entry, tenantA);

      expect(res.status).toBe(200);
    });

    it('redeems points', async () => {
      await ds
        .getRepository(LoyaltyBalanceEntity)
        .save(
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(tenantA)
            .withCustomerId(CUSTOMER_ID)
            .withCurrentPoints(50)
            .build(),
        );

      const res = await call(route('post', '/loyalty/redeem', 'MANAGER', 'DENIED'), tenantA).send({
        customerId: CUSTOMER_ID,
        pointsToRedeem: 20,
      });

      expect(res.status).toBe(201);
      expect(res.body.newBalance).toBe(30);
    });
  });

  describe('tenant isolation', () => {
    it("denies only the suspended caller's own tenant", async () => {
      access.seedSuspended(tenantA);
      const read = route(
        'get',
        `/loyalty/balances?customerIds=${CUSTOMER_ID}`,
        'MANAGER',
        'DENIED',
      );

      const own = await call(read, tenantA);
      const other = await call(read, tenantB);

      expect(own.status).toBe(403);
      expect(own.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      expect(other.status).toBe(200);
    });
  });
});

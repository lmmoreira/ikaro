import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createLoyaltyIntegrationApp } from '../../../../test/utils/loyalty-integration-app';
import { InMemoryLoyaltyBookingPort } from '../../../../test/infrastructure/in-memory-loyalty-booking.port';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { LoyaltyBalanceEntity } from '../entities/loyalty-balance.entity';
import { LoyaltyEntryEntity } from '../entities/loyalty-entry.entity';
import { LoyaltyRedemptionEntity } from '../entities/loyalty-redemption.entity';
import {
  LoyaltyBalanceEntityBuilder,
  LoyaltyEntryEntityBuilder,
  LoyaltyRedemptionEntityBuilder,
} from '../../../../test/builders/loyalty/index';

const TEST_KEY = 'loyalty-integ-test-key-loyalty-xxxx';
const CUSTOMER_ID = 'aaaaaaaa-0000-7000-8000-000000000001';
const STAFF_ID = 'bbbbbbbb-0000-7000-8000-000000000001';
const SERVICE_ID = 'cccccccc-0000-7000-8000-000000000001';

describe('LoyaltyController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let serviceCatalog: InMemoryLoyaltyBookingPort;
  let tenantId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds, serviceCatalog } = await createLoyaltyIntegrationApp());

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({
        name: 'Loyalty Test Tenant',
        slug: 'loyalty-test-tenant',
        adminEmail: 'admin@loyalty.test',
        country_code: 'BR',
      })
      .expect(201);
    tenantId = body.tenantId as string;

    serviceCatalog.seed([{ serviceId: SERVICE_ID, serviceName: 'Lavagem Completa' }]);
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  afterEach(async () => {
    await ds.getRepository(LoyaltyEntryEntity).delete({ tenantId });
    await ds.getRepository(LoyaltyBalanceEntity).delete({ tenantId });
    await ds.getRepository(LoyaltyRedemptionEntity).delete({ tenantId });
  });

  // ── Customer: GET /loyalty/balance ────────────────────────────────────────

  describe('GET /loyalty/balance (customer)', () => {
    it('returns zero balance when customer has no data', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/loyalty/balance')
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .expect(200);

      expect(body.currentPoints).toBe(0);
      expect(body.nextExpiryDate).toBeNull();
      expect(body.nextExpiryPoints).toBeNull();
      // Provisioned tenant carries default settings → pointsPerCurrencyUnit 0.
      expect(body.conversionRate).toBe(0);
    });

    it('returns currentPoints from balance row', async () => {
      await ds
        .getRepository(LoyaltyBalanceEntity)
        .save(
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(CUSTOMER_ID)
            .withCurrentPoints(75)
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .get('/loyalty/balance')
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .expect(200);

      expect(body.currentPoints).toBe(75);
    });

    it('returns nextExpiryDate and nextExpiryPoints', async () => {
      const sooner = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const later = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      await ds
        .getRepository(LoyaltyEntryEntity)
        .save([
          new LoyaltyEntryEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(CUSTOMER_ID)
            .withPoints(10)
            .withExpiresAt(sooner)
            .build(),
          new LoyaltyEntryEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(CUSTOMER_ID)
            .withPoints(20)
            .withExpiresAt(later)
            .build(),
        ]);

      const { body } = await request(app.getHttpServer())
        .get('/loyalty/balance')
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .expect(200);

      expect(body.nextExpiryPoints).toBe(10);
      expect(new Date(body.nextExpiryDate as string).getTime()).toBeCloseTo(sooner.getTime(), -3);
    });

    it('returns 403 when called with STAFF role', async () => {
      const res = await request(app.getHttpServer())
        .get('/loyalty/balance')
        .set(actorHeaders(tenantId, STAFF_ID, 'STAFF'));
      expect(res.status).toBe(403);
    });

    it('tenant isolation: CUSTOMER_ID from Tenant A cannot see Tenant B data', async () => {
      const { body: b } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Platform-Admin-Key', TEST_KEY)
        .send({
          name: 'Loyalty Tenant B',
          slug: 'loyalty-tenant-b',
          adminEmail: 'b@loyalty.test',
          country_code: 'BR',
        })
        .expect(201);
      const tenantBId = b.tenantId as string;

      await ds
        .getRepository(LoyaltyBalanceEntity)
        .save(
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(tenantBId)
            .withCustomerId(CUSTOMER_ID)
            .withCurrentPoints(999)
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .get('/loyalty/balance')
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .expect(200);

      expect(body.currentPoints).toBe(0);

      await ds.getRepository(LoyaltyBalanceEntity).delete({ tenantId: tenantBId });
    });
  });

  // ── Customer: GET /loyalty/balance?tenantId=X (TD20 cross-tenant switch) ─

  describe('GET /loyalty/balance?tenantId=X (customer, switch-tenant screen — TD20)', () => {
    it("resolves the caller's own record in another tenant via the linked Google OAuth ID", async () => {
      const { body: t2 } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Platform-Admin-Key', TEST_KEY)
        .send({
          name: 'Loyalty Switch Tenant',
          slug: 'loyalty-switch-tenant',
          adminEmail: 'switch@loyalty.test',
          country_code: 'BR',
        })
        .expect(201);
      const otherTenantId = t2.tenantId as string;
      const oauthId = 'google-sub-td20-switch';
      const homeCustomerId = 'aaaaaaaa-0000-7000-8000-000000000010';
      const otherTenantCustomerId = 'aaaaaaaa-0000-7000-8000-000000000011';

      await ds
        .getRepository(CustomerEntity)
        .save([
          new CustomerEntityBuilder()
            .withId(homeCustomerId)
            .withTenantId(tenantId)
            .withGoogleOAuthId(oauthId)
            .build(),
          new CustomerEntityBuilder()
            .withId(otherTenantCustomerId)
            .withTenantId(otherTenantId)
            .withGoogleOAuthId(oauthId)
            .build(),
        ]);
      await ds
        .getRepository(LoyaltyBalanceEntity)
        .save(
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(otherTenantId)
            .withCustomerId(otherTenantCustomerId)
            .withCurrentPoints(77)
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .get(`/loyalty/balance?tenantId=${otherTenantId}`)
        .set(actorHeaders(tenantId, homeCustomerId, 'CUSTOMER'))
        .expect(200);

      expect(body.currentPoints).toBe(77);
      // conversionRate is null on cross-tenant reads — the request context carries the
      // actor's home-tenant settings, not the effective (target) tenant's.
      expect(body.conversionRate).toBeNull();

      await ds.getRepository(LoyaltyBalanceEntity).delete({ tenantId: otherTenantId });
      await ds.getRepository(CustomerEntity).delete({ tenantId: otherTenantId });
      await ds.getRepository(CustomerEntity).delete({ id: homeCustomerId, tenantId });
    });

    it("security regression: returns 404 when the caller has no linked record in the target tenant (cannot read another customer's balance by guessing a tenantId)", async () => {
      const { body: t3 } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Platform-Admin-Key', TEST_KEY)
        .send({
          name: 'Loyalty Unlinked Tenant',
          slug: 'loyalty-unlinked-tenant',
          adminEmail: 'unlinked@loyalty.test',
          country_code: 'BR',
        })
        .expect(201);
      const unlinkedTenantId = t3.tenantId as string;

      // A customer with the same real balance data exists in unlinkedTenantId, but the
      // caller (CUSTOMER_ID in `tenantId`) has no Google-OAuth-linked record there.
      const someoneElsesCustomerId = 'aaaaaaaa-0000-7000-8000-000000000012';
      await ds
        .getRepository(LoyaltyBalanceEntity)
        .save(
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(unlinkedTenantId)
            .withCustomerId(someoneElsesCustomerId)
            .withCurrentPoints(999)
            .build(),
        );

      const res = await request(app.getHttpServer())
        .get(`/loyalty/balance?tenantId=${unlinkedTenantId}`)
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'));

      expect(res.status).toBe(404);

      await ds.getRepository(LoyaltyBalanceEntity).delete({ tenantId: unlinkedTenantId });
    });
  });

  // ── Customer: GET /loyalty/entries ────────────────────────────────────────

  describe('GET /loyalty/entries (customer)', () => {
    it('returns paginated entries with serviceName', async () => {
      await ds
        .getRepository(LoyaltyEntryEntity)
        .save(
          new LoyaltyEntryEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(CUSTOMER_ID)
            .withServiceId(SERVICE_ID)
            .withPoints(10)
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .get('/loyalty/entries')
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .expect(200);

      expect(body.entries).toHaveLength(1);
      expect(body.entries[0].serviceName).toBe('Lavagem Completa');
      expect(body.entries[0].points).toBe(10);
      expect(body.pagination.total).toBe(1);
    });

    it('marks expired entries as isActive=false', async () => {
      const past = new Date(Date.now() - 1000);
      await ds
        .getRepository(LoyaltyEntryEntity)
        .save(
          new LoyaltyEntryEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(CUSTOMER_ID)
            .withExpiresAt(past)
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .get('/loyalty/entries')
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .expect(200);

      expect(body.entries[0].isActive).toBe(false);
    });

    it('returns 403 when called with MANAGER role', async () => {
      const res = await request(app.getHttpServer())
        .get('/loyalty/entries')
        .set(actorHeaders(tenantId, STAFF_ID, 'MANAGER'));
      expect(res.status).toBe(403);
    });
  });

  // ── Customer: GET /loyalty/redemptions ───────────────────────────────────

  describe('GET /loyalty/redemptions (customer)', () => {
    it('returns empty list when customer has no redemptions', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/loyalty/redemptions')
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .expect(200);

      expect(body.redemptions).toHaveLength(0);
    });

    it('returns paginated redemptions', async () => {
      await ds
        .getRepository(LoyaltyRedemptionEntity)
        .save(
          new LoyaltyRedemptionEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(CUSTOMER_ID)
            .withPointsRedeemed(50)
            .withNotes('Free wash')
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .get('/loyalty/redemptions')
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .expect(200);

      expect(body.redemptions[0].pointsRedeemed).toBe(50);
      expect(body.redemptions[0].notes).toBe('Free wash');
    });

    it('resolves bookingServices from the booking catalog when bookingId is set', async () => {
      const bookingId = 'dddddddd-0000-7000-8000-000000000001';
      serviceCatalog.seedBookingServices(tenantId, bookingId, [
        { serviceId: SERVICE_ID, serviceName: 'Lavagem Completa' },
      ]);
      await ds
        .getRepository(LoyaltyRedemptionEntity)
        .save(
          new LoyaltyRedemptionEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(CUSTOMER_ID)
            .withBookingId(bookingId)
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .get('/loyalty/redemptions')
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .expect(200);

      expect(body.redemptions[0].bookingServices).toEqual([
        { serviceId: SERVICE_ID, serviceName: 'Lavagem Completa' },
      ]);
    });
  });

  // ── Admin: GET /customers/:customerId/loyalty/* ───────────────────────────

  describe('GET /customers/:customerId/loyalty/balance (admin)', () => {
    it('returns balance for specified customer', async () => {
      await ds
        .getRepository(LoyaltyBalanceEntity)
        .save(
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(CUSTOMER_ID)
            .withCurrentPoints(40)
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .get(`/customers/${CUSTOMER_ID}/loyalty/balance`)
        .set(actorHeaders(tenantId, STAFF_ID, 'MANAGER'))
        .expect(200);

      expect(body.currentPoints).toBe(40);
    });

    it('returns 403 when called with CUSTOMER role, even for their own customerId (admin endpoint is STAFF/MANAGER only — TD20)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/customers/${CUSTOMER_ID}/loyalty/balance`)
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'));
      expect(res.status).toBe(403);
    });

    it('returns 403 when CUSTOMER calls with a different customerId', async () => {
      const OTHER_CUSTOMER = 'aaaaaaaa-0000-7000-8000-000000000002';
      const res = await request(app.getHttpServer())
        .get(`/customers/${OTHER_CUSTOMER}/loyalty/balance`)
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'));
      expect(res.status).toBe(403);
    });

    it('tenant isolation: STAFF from Tenant B cannot access Tenant A customer data', async () => {
      const { body: b } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Platform-Admin-Key', TEST_KEY)
        .send({
          name: 'Loyalty Tenant C',
          slug: 'loyalty-tenant-c',
          adminEmail: 'c@loyalty.test',
          country_code: 'BR',
        })
        .expect(201);
      const tenantCId = b.tenantId as string;

      await ds
        .getRepository(LoyaltyBalanceEntity)
        .save(
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(CUSTOMER_ID)
            .withCurrentPoints(999)
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .get(`/customers/${CUSTOMER_ID}/loyalty/balance`)
        .set(actorHeaders(tenantCId, STAFF_ID, 'MANAGER'))
        .expect(200);

      expect(body.currentPoints).toBe(0);
    });
  });

  describe('GET /customers/:customerId/loyalty/entries (admin)', () => {
    it('returns entries for specified customer', async () => {
      await ds
        .getRepository(LoyaltyEntryEntity)
        .save(
          new LoyaltyEntryEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(CUSTOMER_ID)
            .withPoints(25)
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .get(`/customers/${CUSTOMER_ID}/loyalty/entries`)
        .set(actorHeaders(tenantId, STAFF_ID, 'STAFF'))
        .expect(200);

      expect(body.entries[0].points).toBe(25);
    });
  });

  describe('GET /customers/:customerId/loyalty/redemptions (admin)', () => {
    it('returns redemptions for specified customer', async () => {
      await ds
        .getRepository(LoyaltyRedemptionEntity)
        .save(
          new LoyaltyRedemptionEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(CUSTOMER_ID)
            .withPointsRedeemed(15)
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .get(`/customers/${CUSTOMER_ID}/loyalty/redemptions`)
        .set(actorHeaders(tenantId, STAFF_ID, 'STAFF'))
        .expect(200);

      expect(body.redemptions[0].pointsRedeemed).toBe(15);
    });
  });

  // ── POST /loyalty/redeem ─────────────────────────────────────────────────

  describe('POST /loyalty/redeem (admin)', () => {
    it('decrements balance and inserts redemption record atomically', async () => {
      const { body: tb } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Platform-Admin-Key', TEST_KEY)
        .send({
          name: 'Redeem Test Tenant',
          slug: 'redeem-test-tenant',
          adminEmail: 'redeem@test.example',
          country_code: 'BR',
        })
        .expect(201);
      const redeemTenantId = tb.tenantId as string;

      await ds
        .getRepository(LoyaltyBalanceEntity)
        .save(
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(redeemTenantId)
            .withCustomerId(CUSTOMER_ID)
            .withCurrentPoints(30)
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .post('/loyalty/redeem')
        .set(actorHeaders(redeemTenantId, STAFF_ID, 'MANAGER'))
        .send({ customerId: CUSTOMER_ID, pointsToRedeem: 20, notes: 'Free wash' })
        .expect(201);

      expect(body.newBalance).toBe(10);
      expect(body.pointsRedeemed).toBe(20);
      expect(body.customerId).toBe(CUSTOMER_ID);
      expect(body.redemptionId).toBeDefined();

      const balance = await ds
        .getRepository(LoyaltyBalanceEntity)
        .findOne({ where: { tenantId: redeemTenantId, customerId: CUSTOMER_ID } });
      expect(balance?.currentPoints).toBe(10);

      const redemptions = await ds
        .getRepository(LoyaltyRedemptionEntity)
        .find({ where: { tenantId: redeemTenantId, customerId: CUSTOMER_ID } });
      expect(redemptions).toHaveLength(1);
      expect(redemptions[0].notes).toBe('Free wash');
      // pointsPerCurrencyUnit defaults to 0 (TenantSettings.default()) — admin can't change it
      // via the API yet (M13-S12's scope); this confirms the rate-at-redemption-time capture
      // round-trips end-to-end through the full HTTP + DB stack regardless of its value.
      expect(redemptions[0].pointsPerCurrencyUnit).toBe(0);

      await ds.getRepository(LoyaltyBalanceEntity).delete({ tenantId: redeemTenantId });
      await ds.getRepository(LoyaltyRedemptionEntity).delete({ tenantId: redeemTenantId });
    });

    it('returns 404 when customer has no balance row', async () => {
      const NO_BALANCE_CUSTOMER = 'ffffffff-0000-7000-8000-000000000001';
      const res = await request(app.getHttpServer())
        .post('/loyalty/redeem')
        .set(actorHeaders(tenantId, STAFF_ID, 'MANAGER'))
        .send({ customerId: NO_BALANCE_CUSTOMER, pointsToRedeem: 10 });
      expect(res.status).toBe(404);
    });

    it('returns 422 when redeeming more points than balance', async () => {
      const { body: tb2 } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Platform-Admin-Key', TEST_KEY)
        .send({
          name: 'Low Balance Tenant',
          slug: 'low-balance-tenant',
          adminEmail: 'low@test.example',
          country_code: 'BR',
        })
        .expect(201);
      const lowTenantId = tb2.tenantId as string;

      await ds
        .getRepository(LoyaltyBalanceEntity)
        .save(
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(lowTenantId)
            .withCustomerId(CUSTOMER_ID)
            .withCurrentPoints(5)
            .build(),
        );

      const res = await request(app.getHttpServer())
        .post('/loyalty/redeem')
        .set(actorHeaders(lowTenantId, STAFF_ID, 'MANAGER'))
        .send({ customerId: CUSTOMER_ID, pointsToRedeem: 10 });
      expect(res.status).toBe(422);

      await ds.getRepository(LoyaltyBalanceEntity).delete({ tenantId: lowTenantId });
    });

    it('returns 403 when called with CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .post('/loyalty/redeem')
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .send({ customerId: CUSTOMER_ID, pointsToRedeem: 10 });
      expect(res.status).toBe(403);
    });

    it('tenant isolation: STAFF from Tenant B cannot redeem Tenant A customer points', async () => {
      const { body: iso } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Platform-Admin-Key', TEST_KEY)
        .send({
          name: 'Isolation Tenant D',
          slug: 'isolation-tenant-d',
          adminEmail: 'd@isolation.test',
          country_code: 'BR',
        })
        .expect(201);
      const tenantDId = iso.tenantId as string;

      await ds
        .getRepository(LoyaltyBalanceEntity)
        .save(
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(CUSTOMER_ID)
            .withCurrentPoints(100)
            .build(),
        );

      const res = await request(app.getHttpServer())
        .post('/loyalty/redeem')
        .set(actorHeaders(tenantDId, STAFF_ID, 'MANAGER'))
        .send({ customerId: CUSTOMER_ID, pointsToRedeem: 10 });

      expect(res.status).toBe(404);

      await ds.getRepository(LoyaltyBalanceEntity).delete({ tenantId });
    });
  });
});

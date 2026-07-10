import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { createLoyaltyIntegrationApp } from '../../../../test/utils/loyalty-integration-app';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { BalanceExpiryLogEntity } from '../entities/balance-expiry-log.entity';
import { LoyaltyBalanceEntity } from '../entities/loyalty-balance.entity';
import { LoyaltyEntryEntity } from '../entities/loyalty-entry.entity';
import {
  LoyaltyBalanceEntityBuilder,
  LoyaltyEntryEntityBuilder,
} from '../../../../test/builders/loyalty/index';

const TEST_KEY = 'loyalty-internal-test-key-xxxxxxxx';

describe('CronLoyaltyController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let eventBus: RoutingInMemoryEventBus;
  let tenantId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds, eventBus } = await createLoyaltyIntegrationApp());

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({
        name: 'Expiry Test Tenant',
        slug: 'expiry-test-tenant',
        adminEmail: 'expiry@test.example',
        country_code: 'BR',
      })
      .expect(201);
    tenantId = body.tenantId as string;
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  afterEach(async () => {
    eventBus.clear();
    await ds.query(
      `DELETE FROM loyalty.balance_expiry_log WHERE entry_id IN (SELECT id FROM loyalty.loyalty_entries WHERE tenant_id = $1)`,
      [tenantId],
    );
    await ds.getRepository(LoyaltyEntryEntity).delete({ tenantId });
    await ds.getRepository(LoyaltyBalanceEntity).delete({ tenantId });
  });

  const CUSTOMER_ID = 'cccccccc-0000-7000-8000-000000000020';
  const past = (): Date => new Date(Date.now() - 24 * 60 * 60 * 1000);
  const future = (): Date => new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

  it('POST /cron/loyalty-expiry returns { ok: true }', async () => {
    const { body } = await request(app.getHttpServer()).post('/cron/loyalty-expiry').expect(200);
    expect(body).toEqual({ ok: true });
  });

  it('POST /cron/loyalty-expiry-warning returns { ok: true }', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/cron/loyalty-expiry-warning')
      .expect(200);
    expect(body).toEqual({ ok: true });
  });

  it('decrements balance and inserts balance_expiry_log row via the trigger dispatch', async () => {
    const entryEntity = new LoyaltyEntryEntityBuilder()
      .withTenantId(tenantId)
      .withCustomerId(CUSTOMER_ID)
      .withPoints(30)
      .withExpiresAt(past())
      .build();
    await ds.getRepository(LoyaltyEntryEntity).save(entryEntity);
    await ds
      .getRepository(LoyaltyBalanceEntity)
      .save(
        new LoyaltyBalanceEntityBuilder()
          .withTenantId(tenantId)
          .withCustomerId(CUSTOMER_ID)
          .withCurrentPoints(100)
          .build(),
      );

    await request(app.getHttpServer()).post('/cron/loyalty-expiry').expect(200);

    const balance = await ds
      .getRepository(LoyaltyBalanceEntity)
      .findOne({ where: { tenantId, customerId: CUSTOMER_ID } });
    expect(balance?.currentPoints).toBe(70);

    const log = await ds
      .getRepository(BalanceExpiryLogEntity)
      .findOne({ where: { entryId: entryEntity.id } });
    expect(log).not.toBeNull();
  });

  it('is idempotent — calling the endpoint twice does not double-decrement (ExpirePointsJob per-entry dedup)', async () => {
    const entryEntity = new LoyaltyEntryEntityBuilder()
      .withTenantId(tenantId)
      .withCustomerId(CUSTOMER_ID)
      .withPoints(20)
      .withExpiresAt(past())
      .build();
    await ds.getRepository(LoyaltyEntryEntity).save(entryEntity);
    await ds
      .getRepository(LoyaltyBalanceEntity)
      .save(
        new LoyaltyBalanceEntityBuilder()
          .withTenantId(tenantId)
          .withCustomerId(CUSTOMER_ID)
          .withCurrentPoints(80)
          .build(),
      );

    await request(app.getHttpServer()).post('/cron/loyalty-expiry').expect(200);
    await request(app.getHttpServer()).post('/cron/loyalty-expiry').expect(200);

    const balance = await ds
      .getRepository(LoyaltyBalanceEntity)
      .findOne({ where: { tenantId, customerId: CUSTOMER_ID } });
    expect(balance?.currentPoints).toBe(60);
  });

  it('does not process future entries', async () => {
    await ds
      .getRepository(LoyaltyEntryEntity)
      .save(
        new LoyaltyEntryEntityBuilder()
          .withTenantId(tenantId)
          .withCustomerId(CUSTOMER_ID)
          .withPoints(15)
          .withExpiresAt(future())
          .build(),
      );
    await ds
      .getRepository(LoyaltyBalanceEntity)
      .save(
        new LoyaltyBalanceEntityBuilder()
          .withTenantId(tenantId)
          .withCustomerId(CUSTOMER_ID)
          .withCurrentPoints(50)
          .build(),
      );

    await request(app.getHttpServer()).post('/cron/loyalty-expiry').expect(200);

    const balance = await ds
      .getRepository(LoyaltyBalanceEntity)
      .findOne({ where: { tenantId, customerId: CUSTOMER_ID } });
    expect(balance?.currentPoints).toBe(50);
  });

  describe('POST /cron/loyalty-expiry-warning', () => {
    const soonDate = (): Date => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const farDate = (): Date => new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    it('publishes PointsExpiringSoon for entries expiring within 7 days', async () => {
      const inlineCustomer = uuidv7();
      await ds
        .getRepository(LoyaltyEntryEntity)
        .save(
          new LoyaltyEntryEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(inlineCustomer)
            .withPoints(60)
            .withExpiresAt(soonDate())
            .build(),
        );

      await request(app.getHttpServer()).post('/cron/loyalty-expiry-warning').expect(200);

      const events = eventBus.published.filter(
        (e) => e.eventName === 'PointsExpiringSoon' && e.tenantId === tenantId,
      );
      expect(events).toHaveLength(1);

      await ds.getRepository(LoyaltyEntryEntity).delete({ tenantId, customerId: inlineCustomer });
    });

    it('does not notify customers whose entries expire beyond the warning window', async () => {
      const inlineCustomer = uuidv7();
      await ds
        .getRepository(LoyaltyEntryEntity)
        .save(
          new LoyaltyEntryEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(inlineCustomer)
            .withPoints(20)
            .withExpiresAt(farDate())
            .build(),
        );

      await request(app.getHttpServer()).post('/cron/loyalty-expiry-warning').expect(200);

      const events = eventBus.published.filter(
        (e) => e.eventName === 'PointsExpiringSoon' && e.tenantId === tenantId,
      );
      expect(events).toHaveLength(0);

      await ds.getRepository(LoyaltyEntryEntity).delete({ tenantId, customerId: inlineCustomer });
    });
  });
});

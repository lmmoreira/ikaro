import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createLoyaltyIntegrationApp } from '../../../../test/utils/loyalty-integration-app';
import { BalanceExpiryLogEntity } from '../entities/balance-expiry-log.entity';
import { LoyaltyBalanceEntity } from '../entities/loyalty-balance.entity';
import { LoyaltyEntryEntity } from '../entities/loyalty-entry.entity';
import {
  LoyaltyBalanceEntityBuilder,
  LoyaltyEntryEntityBuilder,
} from '../../../../test/builders/loyalty/index';

const TEST_KEY = 'loyalty-internal-test-key-xxxxxxxx';

describe('InternalLoyaltyController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createLoyaltyIntegrationApp());

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({
        name: 'Expiry Test Tenant',
        slug: 'expiry-test-tenant',
        adminEmail: 'expiry@test.example',
      })
      .expect(201);
    tenantId = body.tenantId as string;
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  afterEach(async () => {
    await ds.createQueryBuilder().delete().from(BalanceExpiryLogEntity).execute();
    await ds.getRepository(LoyaltyEntryEntity).delete({ tenantId });
    await ds.getRepository(LoyaltyBalanceEntity).delete({ tenantId });
  });

  const CUSTOMER_ID = 'cccccccc-0000-7000-8000-000000000020';
  const past = (): Date => new Date(Date.now() - 24 * 60 * 60 * 1000);
  const future = (): Date => new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

  it('returns zero counts when no entries have expired', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/internal/loyalty/expire-points')
      .expect(200);

    expect(body.processedEntries).toBe(0);
    expect(body.affectedCustomers).toBe(0);
    expect(body.totalPointsExpired).toBe(0);
  });

  it('decrements balance and inserts balance_expiry_log row', async () => {
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

    const { body } = await request(app.getHttpServer())
      .post('/internal/loyalty/expire-points')
      .expect(200);

    expect(body.processedEntries).toBe(1);
    expect(body.affectedCustomers).toBe(1);
    expect(body.totalPointsExpired).toBe(30);

    const balance = await ds
      .getRepository(LoyaltyBalanceEntity)
      .findOne({ where: { tenantId, customerId: CUSTOMER_ID } });
    expect(balance?.currentPoints).toBe(70);

    const log = await ds
      .getRepository(BalanceExpiryLogEntity)
      .findOne({ where: { entryId: entryEntity.id } });
    expect(log).not.toBeNull();
  });

  it('is idempotent — calling endpoint twice does not double-decrement', async () => {
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

    await request(app.getHttpServer()).post('/internal/loyalty/expire-points').expect(200);
    const { body } = await request(app.getHttpServer())
      .post('/internal/loyalty/expire-points')
      .expect(200);

    expect(body.processedEntries).toBe(0);

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

    const { body } = await request(app.getHttpServer())
      .post('/internal/loyalty/expire-points')
      .expect(200);

    expect(body.processedEntries).toBe(0);

    const balance = await ds
      .getRepository(LoyaltyBalanceEntity)
      .findOne({ where: { tenantId, customerId: CUSTOMER_ID } });
    expect(balance?.currentPoints).toBe(50);
  });
});

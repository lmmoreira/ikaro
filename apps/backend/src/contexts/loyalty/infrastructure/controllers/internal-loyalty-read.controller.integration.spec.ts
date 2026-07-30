import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { LoyaltyBalanceEntityBuilder } from '../../../../test/builders/loyalty/index';
import { LoyaltyBalanceEntity } from '../entities/loyalty-balance.entity';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { createLoyaltyIntegrationApp } from '../../../../test/utils/loyalty-integration-app';

const INTERNAL_KEY = 'integ-loyalty-read-key-integ-xxxx'; // exactly 32 chars

const TENANT_A = '10000000-0000-7000-8000-000000000001';
const TENANT_B = '20000000-0000-7000-8000-000000000002';
const CUSTOMER_1 = '00000000-0000-7000-8000-100000000001';
const CUSTOMER_2 = '00000000-0000-7000-8000-100000000002';

describe('InternalLoyaltyReadController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
    ({ app, ds } = await createLoyaltyIntegrationApp({
      extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
    }));
  });

  afterAll(async () => {
    await app.close();
    delete process.env['INTERNAL_API_KEY'];
  });

  afterEach(async () => {
    await ds.query(`DELETE FROM "loyalty"."loyalty_balances"`);
  });

  it('returns 401 when X-Internal-Key header is absent', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`/internal/loyalty/balances?tenantId=${TENANT_A}&customerIds=${CUSTOMER_1}`)
      .expect(401);

    expect(body.status).toBe(401);
  });

  it('returns 400 when tenantId query param is missing', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`/internal/loyalty/balances?customerIds=${CUSTOMER_1}`)
      .set('X-Internal-Key', INTERNAL_KEY)
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 when customerIds query param is missing', async () => {
    const { body } = await request(app.getHttpServer())
      .get(`/internal/loyalty/balances?tenantId=${TENANT_A}`)
      .set('X-Internal-Key', INTERNAL_KEY)
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 when tenantId is repeated (binds as an array, not a string)', async () => {
    const { body } = await request(app.getHttpServer())
      .get(
        `/internal/loyalty/balances?tenantId=${TENANT_A}&tenantId=${TENANT_B}&customerIds=${CUSTOMER_1}`,
      )
      .set('X-Internal-Key', INTERNAL_KEY)
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 when customerIds is repeated (binds as an array, not a string)', async () => {
    const { body } = await request(app.getHttpServer())
      .get(
        `/internal/loyalty/balances?tenantId=${TENANT_A}&customerIds=${CUSTOMER_1}&customerIds=${CUSTOMER_2}`,
      )
      .set('X-Internal-Key', INTERNAL_KEY)
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns currentPoints for each requested customer, defaulting an unknown customer to 0', async () => {
    await ds
      .getRepository(LoyaltyBalanceEntity)
      .save(
        new LoyaltyBalanceEntityBuilder()
          .withTenantId(TENANT_A)
          .withCustomerId(CUSTOMER_1)
          .withCurrentPoints(120)
          .build(),
      );

    const { body } = await request(app.getHttpServer())
      .get(
        `/internal/loyalty/balances?tenantId=${TENANT_A}&customerIds=${CUSTOMER_1},${CUSTOMER_2}`,
      )
      .set('X-Internal-Key', INTERNAL_KEY)
      .expect(200);

    expect(body).toEqual(
      expect.arrayContaining([
        { customerId: CUSTOMER_1, currentPoints: 120 },
        { customerId: CUSTOMER_2, currentPoints: 0 },
      ]),
    );
  });

  it('tenant isolation: a balance belonging to another tenant is not returned', async () => {
    await ds
      .getRepository(LoyaltyBalanceEntity)
      .save(
        new LoyaltyBalanceEntityBuilder()
          .withTenantId(TENANT_B)
          .withCustomerId(CUSTOMER_1)
          .withCurrentPoints(999)
          .build(),
      );

    const { body } = await request(app.getHttpServer())
      .get(`/internal/loyalty/balances?tenantId=${TENANT_A}&customerIds=${CUSTOMER_1}`)
      .set('X-Internal-Key', INTERNAL_KEY)
      .expect(200);

    expect(body).toEqual([{ customerId: CUSTOMER_1, currentPoints: 0 }]);
  });
});

import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { PlatformErrorCode } from '@ikaro/types';
import { FEATURE_KEYS } from '@ikaro/validation';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import {
  SubscriptionEntityBuilder,
  SubscriptionItemEntityBuilder,
} from '../../../../test/builders/billing';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import { SubscriptionItemEntity } from '../entities/subscription-item.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';

const INTERNAL_KEY = 'integ-access-key-integ-access-x'; // ≥32 chars
const accessUrl = (tenantId: string) => `/internal/billing/tenants/${tenantId}/access`;

describe('InternalBillingAccessController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const tenantIds: string[] = [];

  const get = (url: string) =>
    request(app.getHttpServer()).get(url).set('X-Internal-Key', INTERNAL_KEY);

  const newTenantId = (): string => {
    const tenantId = uuidv7();
    tenantIds.push(tenantId);
    return tenantId;
  };

  const seedSubscription = async (
    tenantId: string,
    configure: (builder: SubscriptionEntityBuilder) => SubscriptionEntityBuilder,
    featureKeys: string[] = [],
  ): Promise<void> => {
    const entity = configure(new SubscriptionEntityBuilder().withTenantId(tenantId)).build();
    await ds.getRepository(SubscriptionEntity).insert(entity);
    for (const featureKey of featureKeys) {
      await ds
        .getRepository(SubscriptionItemEntity)
        .insert(
          new SubscriptionItemEntityBuilder()
            .withTenantId(tenantId)
            .withSubscriptionId(entity.id)
            .withFeatureKey(featureKey)
            .build(),
        );
    }
  };

  const seedTenant = async (tenantId: string, createdAt: Date): Promise<void> => {
    await ds
      .getRepository(TenantEntity)
      .insert(
        new TenantEntityBuilder()
          .withId(tenantId)
          .withSlug(`access-${uuidv7()}`)
          .withCreatedAt(createdAt)
          .build(),
      );
  };

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
    ({ app, ds } = await createBillingIntegrationApp({
      extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
    }));
  });

  afterEach(async () => {
    await ds.query(
      `DELETE FROM "billing"."subscription_items" WHERE "tenant_id" = ANY($1::uuid[])`,
      [tenantIds],
    );
    await ds.query(`DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = ANY($1::uuid[])`, [
      tenantIds,
    ]);
    await ds.query(`DELETE FROM "platform"."tenants" WHERE "id" = ANY($1::uuid[])`, [tenantIds]);
    tenantIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
    delete process.env['INTERNAL_API_KEY'];
  });

  it('returns 401 without the internal key', async () => {
    await request(app.getHttpServer()).get(accessUrl(uuidv7())).expect(401);
    await request(app.getHttpServer()).get('/internal/billing/suspended-tenant-ids').expect(401);
  });

  describe('GET /internal/billing/tenants/{tenantId}/access', () => {
    it('answers a TRIALING tenant: operational, every feature, no marker', async () => {
      const tenantId = newTenantId();
      await seedSubscription(tenantId, (b) => b.withStatus('TRIALING'));

      const { body } = await get(accessUrl(tenantId)).expect(200);

      expect(body).toMatchObject({
        status: 'TRIALING',
        suspensionReason: null,
        operational: true,
      });
      expect(body.features.map((f: { key: string }) => f.key).sort()).toEqual(
        [...FEATURE_KEYS].sort(),
      );
      expect(body).not.toHaveProperty('provisional');
      expect(body).not.toHaveProperty('degraded');
    });

    it('answers a SUSPENDED tenant: not operational, no features, with the reason', async () => {
      const tenantId = newTenantId();
      await seedSubscription(tenantId, (b) => b.withSuspension('NON_PAYMENT', new Date()), [
        'HOTSITE',
      ]);

      const { body } = await get(accessUrl(tenantId)).expect(200);

      expect(body).toEqual({
        status: 'SUSPENDED',
        suspensionReason: 'NON_PAYMENT',
        operational: false,
        features: [],
      });
    });

    it('answers an exempt tenant: operational with exactly its items', async () => {
      const tenantId = newTenantId();
      await seedSubscription(tenantId, (b) => b.withStatus('ACTIVE').withExempt(true), [
        'HOTSITE',
        'BOOKING',
      ]);

      const { body } = await get(accessUrl(tenantId)).expect(200);

      expect(body.status).toBe('ACTIVE');
      expect(body.operational).toBe(true);
      expect(body.features.map((f: { key: string }) => f.key).sort()).toEqual([
        'BOOKING',
        'HOTSITE',
      ]);
    });

    it('answers a tenant with no subscription yet as a provisional trial inside the window', async () => {
      const tenantId = newTenantId();
      await seedTenant(tenantId, new Date(Date.now() - 60_000));

      const { body } = await get(accessUrl(tenantId)).expect(200);

      expect(body).toMatchObject({ status: 'TRIALING', operational: true, provisional: true });
    });

    it('denies a tenant with no subscription once it is older than the window', async () => {
      const tenantId = newTenantId();
      await seedTenant(tenantId, new Date(Date.now() - 16 * 60_000));

      const { body } = await get(accessUrl(tenantId)).expect(200);

      expect(body).toMatchObject({ operational: false, features: [] });
      expect(body).not.toHaveProperty('provisional');
    });

    it('answers an unknown tenant with 404 TENANT_NOT_FOUND, never a fail-open answer', async () => {
      const { body } = await get(accessUrl(uuidv7())).expect(404);

      expect(body.code).toBe(PlatformErrorCode.TENANT_NOT_FOUND);
    });

    it('answers 400 for a tenant id that is not a UUID', async () => {
      await get(accessUrl('not-a-uuid')).expect(400);
    });

    it('is tenant-isolated: tenant A’s answer carries only A’s subscription state', async () => {
      const tenantA = newTenantId();
      const tenantB = newTenantId();
      await seedSubscription(tenantA, (b) => b.withStatus('ACTIVE'), ['HOTSITE']);
      await seedSubscription(tenantB, (b) => b.withSuspension('OPERATOR', new Date()), [
        'HOTSITE',
        'LOYALTY',
      ]);

      const { body } = await get(accessUrl(tenantA)).expect(200);

      expect(body).toEqual({
        status: 'ACTIVE',
        suspensionReason: null,
        operational: true,
        features: [{ key: 'HOTSITE', tier: 'STANDARD' }],
      });
    });
  });

  describe('GET /internal/billing/suspended-tenant-ids', () => {
    it('returns exactly the suspended tenants among this spec’s tenants, as ids only', async () => {
      const suspended = newTenantId();
      const active = newTenantId();
      const trialing = newTenantId();
      await seedSubscription(suspended, (b) => b.withSuspension('NON_PAYMENT', new Date()));
      await seedSubscription(active, (b) => b.withStatus('ACTIVE'));
      await seedSubscription(trialing, (b) => b.withStatus('TRIALING'));

      const { body } = await get('/internal/billing/suspended-tenant-ids').expect(200);

      expect(Object.keys(body)).toEqual(['tenantIds']);
      expect(body.tenantIds).toContain(suspended);
      expect(body.tenantIds).not.toContain(active);
      expect(body.tenantIds).not.toContain(trialing);
      expect(body.tenantIds.every((id: unknown) => typeof id === 'string')).toBe(true);
    });
  });
});

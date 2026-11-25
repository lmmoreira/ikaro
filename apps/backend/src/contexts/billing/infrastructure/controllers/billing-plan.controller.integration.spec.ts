import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ErrorFilter } from '../../../../shared/filters/error.filter';
import { TenantAccessGuard } from '../../../../shared/guards/tenant-access.guard';
import {
  SubscriptionEntityBuilder,
  SubscriptionItemEntityBuilder,
} from '../../../../test/builders/billing';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createSuspendedExperienceApp } from '../../../../test/utils/suspended-experience-integration-app';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import { ChargeEntity } from '../entities/charge.entity';
import { SubscriptionItemEntity } from '../entities/subscription-item.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';

const DAY_MS = 24 * 60 * 60 * 1000;
type Role = 'MANAGER' | 'STAFF' | 'CUSTOMER';
type Item = { featureKey: string; tier: string };
const standard = (featureKey: string): Item => ({ featureKey, tier: 'STANDARD' });

describe('BillingController plan reads (integration, UC-136)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    ({ app, ds } = await createSuspendedExperienceApp([
      { provide: APP_FILTER, useClass: ErrorFilter },
      { provide: APP_GUARD, useClass: TenantAccessGuard },
    ]));
  });

  afterAll(async () => {
    const ids = [tenantIds];
    await ds.query(
      `DELETE FROM "billing"."subscription_items" WHERE "tenant_id" = ANY($1::uuid[])`,
      ids,
    );
    await ds.query(
      `DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = ANY($1::uuid[])`,
      ids,
    );
    await ds.query(`DELETE FROM "platform"."tenants" WHERE "id" = ANY($1::uuid[])`, ids);
    await app.close();
  });

  const seedTenant = async (
    items: Item[] = [standard('HOTSITE')],
    configure: (builder: SubscriptionEntityBuilder) => SubscriptionEntityBuilder = (b) => b,
    withSubscription = true,
  ): Promise<string> => {
    const tenantId = uuidv7();
    tenantIds.push(tenantId);
    await ds.getRepository(TenantEntity).insert(
      new TenantEntityBuilder()
        .withId(tenantId)
        .withSlug(`plan-${tenantId.slice(-12)}`)
        .withCreatedAt(new Date(Date.now() - 30 * DAY_MS))
        .build(),
    );
    if (!withSubscription) return tenantId;
    const subscription = configure(
      new SubscriptionEntityBuilder()
        .withTenantId(tenantId)
        .withStatus('ACTIVE')
        .withTrialEndsAt(null)
        .withNextDueDate('2030-01-20'),
    ).build();
    await ds.getRepository(SubscriptionEntity).insert(subscription);
    for (const { featureKey, tier } of items) {
      await ds.getRepository(SubscriptionItemEntity).insert(
        new SubscriptionItemEntityBuilder()
          .withTenantId(tenantId)
          .withSubscriptionId(subscription.id)
          .withFeatureKey(featureKey)
          .withTier(tier)
          .withStartsAt(new Date(Date.now() - 30 * DAY_MS))
          .build(),
      );
    }
    return tenantId;
  };

  const as = (tenantId: string, role: Role = 'MANAGER') => actorHeaders(tenantId, uuidv7(), role);
  const getPlan = (tenantId: string, role: Role = 'MANAGER') =>
    request(app.getHttpServer()).get('/billing/plan').set(as(tenantId, role));
  const preview = (tenantId: string, items: unknown, role: Role = 'MANAGER') =>
    request(app.getHttpServer())
      .post('/billing/plan/preview')
      .set(as(tenantId, role))
      .send({ items });

  describe('GET /billing/plan', () => {
    it('lists the catalog with the real seeded prices, the current plan and a total', async () => {
      const tenantId = await seedTenant([standard('HOTSITE'), standard('BOOKING')]);

      const { body } = await getPlan(tenantId).expect(200);

      expect(body).toMatchObject({
        provisioning: false,
        countryCode: 'BR',
        currency: 'BRL',
        readOnly: null,
        scheduled: null,
        trial: { active: false, planConfirmed: false },
      });
      expect(body.features.map((feature: { featureKey: string }) => feature.featureKey)).toEqual([
        'HOTSITE',
        'BOOKING',
        'LOYALTY',
        'CHATBOT',
        'LEAD_FORM',
      ]);
      expect(body.features[0].tiers[0]).toMatchObject({ tier: 'STANDARD', available: true });
      expect(typeof body.features[0].tiers[0].unitPriceMinor).toBe('number');
      expect(body.current.map((item: Item) => item.featureKey)).toEqual(['HOTSITE', 'BOOKING']);
      expect(body.totalMinor).toBeGreaterThan(0);
    });

    it('answers provisioning for a tenant with no subscription row', async () => {
      const tenantId = await seedTenant([], (b) => b, false);

      expect((await getPlan(tenantId).expect(200)).body).toEqual({ provisioning: true });
    });

    it('is reachable by the manager of a tenant suspended for payment, and editable', async () => {
      const tenantId = await seedTenant([standard('HOTSITE')], (b) =>
        b.withSuspension('NON_PAYMENT', new Date(Date.now() - DAY_MS)),
      );

      const { body } = await getPlan(tenantId).expect(200);

      expect(body.readOnly).toBeNull();
      expect(body.current).toEqual([{ featureKey: 'HOTSITE', tier: 'STANDARD', endsAt: null }]);
    });

    it('reports an operator suspension as read-only', async () => {
      const tenantId = await seedTenant([standard('HOTSITE')], (b) =>
        b.withSuspension('OPERATOR', new Date(Date.now() - DAY_MS)),
      );

      expect((await getPlan(tenantId).expect(200)).body.readOnly).toEqual({
        reason: 'OPERATOR_SUSPENDED',
      });
    });

    it('never serves a stale row: a change written straight to the database shows on the next read', async () => {
      const tenantId = await seedTenant();
      expect((await getPlan(tenantId).expect(200)).body.readOnly).toBeNull();

      await ds
        .getRepository(SubscriptionEntity)
        .update({ tenantId }, { status: 'PAST_DUE', pastDueSince: new Date() });

      expect((await getPlan(tenantId).expect(200)).body.readOnly).toEqual({ reason: 'PAST_DUE' });
    });

    it.each(['STAFF', 'CUSTOMER'] as const)('refuses a %s token with 403', async (role) => {
      const tenantId = await seedTenant();

      await getPlan(tenantId, role).expect(403);
    });

    it('returns only the caller’s own current plan and total, never another tenant’s', async () => {
      const mine = await seedTenant([standard('HOTSITE')]);
      const theirs = await seedTenant([
        standard('HOTSITE'),
        standard('BOOKING'),
        { featureKey: 'CHATBOT', tier: 'PLUS' },
      ]);

      const a = (await getPlan(mine).expect(200)).body;
      const b = (await getPlan(theirs).expect(200)).body;

      expect(a.current.map((item: Item) => item.featureKey)).toEqual(['HOTSITE']);
      expect(b.current.map((item: Item) => item.featureKey)).toEqual([
        'HOTSITE',
        'BOOKING',
        'CHATBOT',
      ]);
      expect(a.totalMinor).toBeLessThan(b.totalMinor);
    });
  });

  describe('POST /billing/plan/preview', () => {
    it('previews an addition and a removal with their dates and the new total', async () => {
      const tenantId = await seedTenant([standard('HOTSITE'), standard('BOOKING')]);

      const { body } = await preview(tenantId, [standard('HOTSITE'), standard('LEAD_FORM')]).expect(
        200,
      );

      expect(body.changes).toMatchObject([
        { featureKey: 'BOOKING', kind: 'REMOVE', fromTier: 'STANDARD', toTier: null },
        { featureKey: 'LEAD_FORM', kind: 'ADD', fromTier: null, toTier: 'STANDARD' },
      ]);
      expect(body.deferredBecauseNextInvoicePaid).toBe(false);
      expect(typeof body.newTotalMinor).toBe('number');
    });

    it('previews removing BOOKING without running any removal guard (that is checked at save only)', async () => {
      const tenantId = await seedTenant([standard('HOTSITE'), standard('BOOKING')]);

      const { body } = await preview(tenantId, [standard('HOTSITE')]).expect(200);

      expect(body.changes).toMatchObject([{ featureKey: 'BOOKING', kind: 'REMOVE' }]);
    });

    it('persists nothing: subscription, items and charges are unchanged by a preview', async () => {
      const tenantId = await seedTenant([standard('HOTSITE'), standard('BOOKING')]);
      const snapshot = async () => ({
        subscription: await ds.getRepository(SubscriptionEntity).findOneByOrFail({ tenantId }),
        items: await ds.getRepository(SubscriptionItemEntity).findBy({ tenantId }),
        charges: await ds.getRepository(ChargeEntity).countBy({ tenantId }),
      });
      const before = await snapshot();

      await preview(tenantId, [
        standard('HOTSITE'),
        { featureKey: 'CHATBOT', tier: 'PLUS' },
      ]).expect(200);

      expect(await snapshot()).toEqual(before);
    });

    it.each([
      [
        'a feature whose requirement is missing',
        [standard('HOTSITE'), standard('LOYALTY')],
        'BILLING_FEATURE_DEPENDENCY_UNMET',
      ],
      ['an empty selection', [], 'BILLING_PLAN_EMPTY'],
    ])('answers 422 for %s', async (_label, items, code) => {
      const tenantId = await seedTenant([standard('HOTSITE')]);

      const { body } = await preview(tenantId, items).expect(422);

      expect(body.code).toBe(code);
    });

    it('answers 422 BILLING_FEATURE_HAS_DEPENDENTS when removing a feature another still needs', async () => {
      const tenantId = await seedTenant([
        standard('HOTSITE'),
        standard('BOOKING'),
        standard('LOYALTY'),
      ]);

      const { body } = await preview(tenantId, [standard('HOTSITE'), standard('LOYALTY')]).expect(
        422,
      );

      expect(body.code).toBe('BILLING_FEATURE_HAS_DEPENDENTS');
    });

    it.each([
      ['a feature selected twice', [standard('HOTSITE'), standard('HOTSITE')]],
      ['a tier not sold for the feature', [{ featureKey: 'HOTSITE', tier: 'PLUS' }]],
      ['an unknown feature', [{ featureKey: 'NOPE', tier: 'STANDARD' }]],
    ])('answers 400 for %s, before any plan rule runs', async (_label, items) => {
      const tenantId = await seedTenant();

      await preview(tenantId, items).expect(400);
    });

    it('answers 400 without a body', async () => {
      const tenantId = await seedTenant();

      await request(app.getHttpServer())
        .post('/billing/plan/preview')
        .set(as(tenantId))
        .send({})
        .expect(400);
    });

    it('answers 404 for a tenant with no subscription row', async () => {
      const tenantId = await seedTenant([], (b) => b, false);

      const { body } = await preview(tenantId, [standard('HOTSITE')]).expect(404);

      expect(body.code).toBe('PLATFORM_TENANT_NOT_FOUND');
    });

    it.each(['STAFF', 'CUSTOMER'] as const)('refuses a %s token with 403', async (role) => {
      const tenantId = await seedTenant();

      await preview(tenantId, [standard('HOTSITE')], role).expect(403);
    });

    it('previews against the caller’s own plan, never another tenant’s', async () => {
      const mine = await seedTenant([standard('HOTSITE')]);
      await seedTenant([standard('HOTSITE'), standard('BOOKING')]);

      const { body } = await preview(mine, [standard('HOTSITE'), standard('BOOKING')]).expect(200);

      expect(body.changes).toMatchObject([{ featureKey: 'BOOKING', kind: 'ADD' }]);
    });
  });
});

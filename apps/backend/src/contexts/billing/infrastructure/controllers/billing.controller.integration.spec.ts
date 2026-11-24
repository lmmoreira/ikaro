import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ErrorFilter } from '../../../../shared/filters/error.filter';
import { TenantAccessGuard } from '../../../../shared/guards/tenant-access.guard';
import {
  BillingAccountEntityBuilder,
  ChargeEntityBuilder,
  ChargeLineEntityBuilder,
  SubscriptionEntityBuilder,
  SubscriptionItemEntityBuilder,
} from '../../../../test/builders/billing';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createSuspendedExperienceApp } from '../../../../test/utils/suspended-experience-integration-app';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import { BillingAccountEntity } from '../entities/billing-account.entity';
import { ChargeLineEntity } from '../entities/charge-line.entity';
import { ChargeEntity } from '../entities/charge.entity';
import { SubscriptionItemEntity } from '../entities/subscription-item.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_URL = 'https://pay.example/secret-link-must-never-leave-the-backend';

describe('BillingController (integration)', () => {
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
    await ds.query(`DELETE FROM "billing"."charge_lines" WHERE "tenant_id" = ANY($1::uuid[])`, ids);
    await ds.query(`DELETE FROM "billing"."charges" WHERE "tenant_id" = ANY($1::uuid[])`, ids);
    await ds.query(
      `DELETE FROM "billing"."subscription_items" WHERE "tenant_id" = ANY($1::uuid[])`,
      ids,
    );
    await ds.query(
      `DELETE FROM "billing"."billing_accounts" WHERE "tenant_id" = ANY($1::uuid[])`,
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
    configure: (builder: SubscriptionEntityBuilder) => SubscriptionEntityBuilder | null = (b) => b,
  ): Promise<{ tenantId: string; subscriptionId: string | null }> => {
    const tenantId = uuidv7();
    tenantIds.push(tenantId);
    await ds.getRepository(TenantEntity).insert(
      new TenantEntityBuilder()
        .withId(tenantId)
        .withSlug(`bill-${tenantId.slice(-12)}`)
        .withCreatedAt(new Date(Date.now() - 30 * DAY_MS))
        .build(),
    );
    const builder = configure(new SubscriptionEntityBuilder().withTenantId(tenantId));
    if (builder === null) return { tenantId, subscriptionId: null };
    const entity = builder.build();
    await ds.getRepository(SubscriptionEntity).insert(entity);
    await ds.getRepository(SubscriptionItemEntity).insert(
      new SubscriptionItemEntityBuilder()
        .withTenantId(tenantId)
        .withSubscriptionId(entity.id)
        .withFeatureKey('HOTSITE')
        .withStartsAt(new Date(Date.now() - 30 * DAY_MS))
        .build(),
    );
    return { tenantId, subscriptionId: entity.id };
  };

  const seedCharge = async (
    tenantId: string,
    subscriptionId: string,
    configure: (builder: ChargeEntityBuilder) => ChargeEntityBuilder,
  ): Promise<ChargeEntity> => {
    const charge = configure(
      new ChargeEntityBuilder().withTenantId(tenantId).withSubscriptionId(subscriptionId),
    ).build();
    await ds.getRepository(ChargeEntity).insert(charge);
    await ds
      .getRepository(ChargeLineEntity)
      .insert(new ChargeLineEntityBuilder().withTenantId(tenantId).withChargeId(charge.id).build());
    return charge;
  };

  const get = (
    path: string,
    tenantId: string,
    role: 'MANAGER' | 'STAFF' | 'CUSTOMER' = 'MANAGER',
  ) =>
    request(app.getHttpServer())
      .get(path)
      .set(actorHeaders(tenantId, uuidv7(), role));

  describe('GET /billing/summary', () => {
    it('answers the manager of an active tenant with real prices and no payment URL', async () => {
      const { tenantId, subscriptionId } = await seedTenant((b) =>
        b.withStatus('ACTIVE').withTrialEndsAt(null).withNextDueDate('2030-01-20'),
      );
      await seedCharge(tenantId, subscriptionId!, (b) =>
        b
          .withProviderReady('ASAAS', `pay_${uuidv7()}`)
          .withPaymentUrl(PAYMENT_URL, new Date(Date.now() + DAY_MS)),
      );

      const { body, text } = await get('/billing/summary', tenantId).expect(200);

      expect(body).toMatchObject({
        provisioning: false,
        status: 'ACTIVE',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        openCharge: { kind: 'PERIOD', hasPaymentLink: true, taxMinor: 0 },
      });
      expect(body.items[0]).toMatchObject({ featureKey: 'HOTSITE' });
      expect(typeof body.items[0].unitPriceMinor).toBe('number');
      expect(text).not.toContain(PAYMENT_URL);
      expect(text).not.toContain('paymentUrl"');
    });

    it('is reachable by the manager of a SUSPENDED tenant and returns the open recovery charge', async () => {
      const { tenantId, subscriptionId } = await seedTenant((b) =>
        b.withSuspension('NON_PAYMENT', new Date(Date.now() - DAY_MS)).withTrialEndsAt(null),
      );
      await seedCharge(tenantId, subscriptionId!, (b) =>
        b.withDueDate('2026-10-01').withStatus('OVERDUE'),
      );
      const recovery = await seedCharge(tenantId, subscriptionId!, (b) =>
        b.asRecovery().withDueDate('2026-11-20'),
      );

      const { body } = await get('/billing/summary', tenantId).expect(200);

      expect(body.status).toBe('SUSPENDED');
      expect(body.suspensionReason).toBe('NON_PAYMENT');
      expect(body.purgeAt).not.toBeNull();
      expect(body.openCharge).toMatchObject({ id: recovery.id, kind: 'RECOVERY' });
    });

    it.each(['STAFF', 'CUSTOMER'] as const)(
      'refuses a %s token with 403, active or suspended',
      async (role) => {
        const active = await seedTenant((b) => b.withStatus('ACTIVE').withTrialEndsAt(null));
        const suspended = await seedTenant((b) =>
          b.withSuspension('NON_PAYMENT', new Date(Date.now() - DAY_MS)).withTrialEndsAt(null),
        );

        await get('/billing/summary', active.tenantId, role).expect(403);
        await get('/billing/summary', suspended.tenantId, role).expect(403);
        await get('/billing/charges', active.tenantId, role).expect(403);
      },
    );

    it('answers provisioning for a tenant with no subscription row, not an error', async () => {
      const { tenantId } = await seedTenant(() => null);

      const { body } = await get('/billing/summary', tenantId).expect(200);

      expect(body).toEqual({ provisioning: true });
    });

    it('never serves a stale row: a change written straight to the database is visible on the next read', async () => {
      const { tenantId } = await seedTenant((b) =>
        b.withStatus('ACTIVE').withTrialEndsAt(null).withNextDueDate('2030-01-20'),
      );
      expect((await get('/billing/summary', tenantId).expect(200)).body.status).toBe('ACTIVE');

      await ds
        .getRepository(SubscriptionEntity)
        .update({ tenantId }, { status: 'PAST_DUE', pastDueSince: new Date() });

      expect((await get('/billing/summary', tenantId).expect(200)).body.status).toBe('PAST_DUE');
    });

    it('reports addressRequired from the billing account', async () => {
      const { tenantId } = await seedTenant((b) => b.withStatus('ACTIVE').withTrialEndsAt(null));
      await ds
        .getRepository(BillingAccountEntity)
        .insert(new BillingAccountEntityBuilder().withTenantId(tenantId).withAddress(null).build());

      const { body } = await get('/billing/summary', tenantId).expect(200);

      expect(body.addressRequired).toBe(true);
    });

    it('never returns another tenant’s subscription or open charge', async () => {
      const a = await seedTenant((b) => b.withStatus('ACTIVE').withTrialEndsAt(null));
      const b = await seedTenant((x) => x.withStatus('PAST_DUE').withTrialEndsAt(null));
      const chargeA = await seedCharge(a.tenantId, a.subscriptionId!, (x) => x);
      const chargeB = await seedCharge(b.tenantId, b.subscriptionId!, (x) =>
        x.withStatus('OVERDUE'),
      );

      const summaryA = (await get('/billing/summary', a.tenantId).expect(200)).body;
      const summaryB = (await get('/billing/summary', b.tenantId).expect(200)).body;

      expect(summaryA.status).toBe('ACTIVE');
      expect(summaryA.openCharge.id).toBe(chargeA.id);
      expect(summaryB.status).toBe('PAST_DUE');
      expect(summaryB.openCharge.id).toBe(chargeB.id);
    });
  });

  describe('GET /billing/charges', () => {
    it('pages newest due date first with total and hasMore, lines included, never another tenant’s charge', async () => {
      const a = await seedTenant((b) => b.withStatus('ACTIVE').withTrialEndsAt(null));
      const other = await seedTenant((b) => b.withStatus('ACTIVE').withTrialEndsAt(null));
      const periods: [dueDate: string, periodEnd: string][] = [
        ['2026-08-10', '2026-08-28'],
        ['2026-09-10', '2026-09-28'],
        ['2026-10-10', '2026-10-28'],
      ];
      for (const [dueDate, periodEnd] of periods) {
        await seedCharge(a.tenantId, a.subscriptionId!, (b) =>
          b.withPeriod(dueDate, periodEnd).withDueDate(dueDate).withStatus('PAID'),
        );
      }
      await seedCharge(other.tenantId, other.subscriptionId!, (b) => b.withDueDate('2026-11-10'));

      const first = (await get('/billing/charges?limit=2&offset=0', a.tenantId).expect(200)).body;
      const rest = (await get('/billing/charges?limit=2&offset=2', a.tenantId).expect(200)).body;

      expect(first.items.map((item: { dueDate: string }) => item.dueDate)).toEqual([
        '2026-10-10',
        '2026-09-10',
      ]);
      expect(first.pagination).toEqual({ limit: 2, offset: 0, total: 3, hasMore: true });
      expect(rest.items.map((item: { dueDate: string }) => item.dueDate)).toEqual(['2026-08-10']);
      expect(rest.pagination.hasMore).toBe(false);
      expect(first.items[0]).toMatchObject({
        kind: 'PERIOD',
        currency: 'BRL',
        taxMinor: 0,
        taxLines: [],
        lines: [{ featureKey: 'HOTSITE', tier: 'STANDARD', unitPriceMinor: 4900 }],
      });
    });

    it('answers an empty page for a tenant with no charge or no subscription', async () => {
      const { tenantId } = await seedTenant(() => null);

      const { body } = await get('/billing/charges', tenantId).expect(200);

      expect(body).toEqual({
        items: [],
        pagination: { limit: 25, offset: 0, total: 0, hasMore: false },
      });
    });

    it.each([['limit=0'], ['limit=101'], ['limit=-1'], ['offset=-1'], ['limit=abc']])(
      'answers 400 for %s',
      async (query) => {
        const { tenantId } = await seedTenant((b) => b.withStatus('ACTIVE').withTrialEndsAt(null));

        await get(`/billing/charges?${query}`, tenantId).expect(400);
      },
    );

    it('is reachable for a SUSPENDED tenant’s manager', async () => {
      const { tenantId } = await seedTenant((b) =>
        b.withSuspension('NON_PAYMENT', new Date(Date.now() - DAY_MS)).withTrialEndsAt(null),
      );

      await get('/billing/charges', tenantId).expect(200);
    });
  });
});

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

  // Paying a charge (M26-S15, UC-119): the real routes, guards, error filter and fake provider.
  describe('POST /billing/charges/:chargeId/payment-link and payment-return', () => {
    const post = (
      path: string,
      tenantId: string,
      role: 'MANAGER' | 'STAFF' | 'CUSTOMER' = 'MANAGER',
    ) =>
      request(app.getHttpServer())
        .post(path)
        .set(actorHeaders(tenantId, uuidv7(), role));
    const activeTenant = () => seedTenant((b) => b.withStatus('ACTIVE').withTrialEndsAt(null));
    const suspendedTenant = () =>
      seedTenant((b) =>
        b.withSuspension('NON_PAYMENT', new Date(Date.now() - DAY_MS)).withTrialEndsAt(null),
      );
    const withLink = (expiresAt: Date) => (b: ChargeEntityBuilder) =>
      b.withProviderReady('ASAAS', `pay_${uuidv7()}`).withPaymentUrl(PAYMENT_URL, expiresAt);

    it('gives the manager the link of an open charge: the one place the URL is returned', async () => {
      const { tenantId, subscriptionId } = await activeTenant();
      const charge = await seedCharge(
        tenantId,
        subscriptionId!,
        withLink(new Date(Date.now() + DAY_MS)),
      );

      const { body } = await post(`/billing/charges/${charge.id}/payment-link`, tenantId).expect(
        200,
      );

      expect(body).toMatchObject({ status: 'PENDING', paymentUrl: PAYMENT_URL });
    });

    it('is reachable by the manager of a SUSPENDED tenant for the recovery charge', async () => {
      const { tenantId, subscriptionId } = await suspendedTenant();
      const recovery = await seedCharge(tenantId, subscriptionId!, (b) =>
        withLink(new Date(Date.now() + DAY_MS))(b.asRecovery().withDueDate('2030-01-20')),
      );

      const { body } = await post(`/billing/charges/${recovery.id}/payment-link`, tenantId).expect(
        200,
      );

      expect(body).toMatchObject({ status: 'PENDING', paymentUrl: PAYMENT_URL });
    });

    it('answers a paid charge with the paid state and no link', async () => {
      const { tenantId, subscriptionId } = await activeTenant();
      const paid = await seedCharge(tenantId, subscriptionId!, (b) =>
        withLink(new Date(Date.now() + DAY_MS))(b)
          .withStatus('PAID')
          .withPaidAt(new Date()),
      );

      const { body } = await post(`/billing/charges/${paid.id}/payment-link`, tenantId).expect(200);

      expect(body).toEqual({ status: 'PAID', paymentUrl: null, expiresAt: null });
    });

    it('answers a cancelled charge as a conflict BILLING_CHARGE_NOT_PAYABLE', async () => {
      const { tenantId, subscriptionId } = await activeTenant();
      const closed = await seedCharge(tenantId, subscriptionId!, (b) =>
        withLink(new Date(Date.now() + DAY_MS))(b).withStatus('CANCELED'),
      );

      const { body } = await post(`/billing/charges/${closed.id}/payment-link`, tenantId).expect(
        409,
      );

      expect(body.code).toBe('BILLING_CHARGE_NOT_PAYABLE');
    });

    it('answers a link the provider cannot regenerate as a retryable 503 BILLING_PROVIDER_UNAVAILABLE', async () => {
      const { tenantId, subscriptionId } = await activeTenant();
      // The fake provider of this process never created the charge, so it does not know it.
      const charge = await seedCharge(
        tenantId,
        subscriptionId!,
        withLink(new Date(Date.now() - DAY_MS)),
      );

      const { body } = await post(`/billing/charges/${charge.id}/payment-link`, tenantId).expect(
        503,
      );

      expect(body.code).toBe('BILLING_PROVIDER_UNAVAILABLE');
    });

    it('holds a recovery charge with no billing identity as 422 BILLING_ADDRESS_REQUIRED', async () => {
      const { tenantId, subscriptionId } = await suspendedTenant();
      // Inserted `PENDING` with no provider id, and the tenant has no billing account.
      const held = await seedCharge(tenantId, subscriptionId!, (b) =>
        b.asRecovery().withDueDate('2030-01-20'),
      );

      const { body } = await post(`/billing/charges/${held.id}/payment-link`, tenantId).expect(422);

      expect(body.code).toBe('BILLING_ADDRESS_REQUIRED');
    });

    it('answers another tenant’s charge as 404 BILLING_CHARGE_NOT_FOUND on both routes', async () => {
      const owner = await activeTenant();
      const stranger = await activeTenant();
      const charge = await seedCharge(
        owner.tenantId,
        owner.subscriptionId!,
        withLink(new Date(Date.now() + DAY_MS)),
      );

      const link = await post(
        `/billing/charges/${charge.id}/payment-link`,
        stranger.tenantId,
      ).expect(404);
      await post(`/billing/charges/${charge.id}/payment-return`, stranger.tenantId).expect(404);

      expect(link.body.code).toBe('BILLING_CHARGE_NOT_FOUND');
    });

    it.each(['payment-link', 'payment-return'] as const)(
      '%s refuses STAFF and CUSTOMER with 403 and a charge id that is not a UUID with 400',
      async (route) => {
        const { tenantId, subscriptionId } = await activeTenant();
        const charge = await seedCharge(
          tenantId,
          subscriptionId!,
          withLink(new Date(Date.now() + DAY_MS)),
        );

        await post(`/billing/charges/${charge.id}/${route}`, tenantId, 'STAFF').expect(403);
        await post(`/billing/charges/${charge.id}/${route}`, tenantId, 'CUSTOMER').expect(403);
        await post(`/billing/charges/not-a-uuid/${route}`, tenantId).expect(400);
      },
    );

    it('records the return once, answers the awaited payment even though the provider does not know the charge, and the summary shows it', async () => {
      const { tenantId, subscriptionId } = await activeTenant();
      const charge = await seedCharge(
        tenantId,
        subscriptionId!,
        withLink(new Date(Date.now() + DAY_MS)),
      );

      const first = await post(`/billing/charges/${charge.id}/payment-return`, tenantId).expect(
        200,
      );
      const stored = await ds.getRepository(ChargeEntity).findOneByOrFail({ id: charge.id });
      await post(`/billing/charges/${charge.id}/payment-return`, tenantId).expect(200);

      expect(first.body).toEqual({ status: 'PENDING', paymentConfirmationPending: true });
      expect(stored.paymentReturnSeenAt).not.toBeNull();
      expect(
        (await ds.getRepository(ChargeEntity).findOneByOrFail({ id: charge.id }))
          .paymentReturnSeenAt,
      ).toEqual(stored.paymentReturnSeenAt);
      const { body: summary } = await get('/billing/summary', tenantId).expect(200);
      expect(summary.paymentConfirmationPending).toBe(true);
    });
  });
});

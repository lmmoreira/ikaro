import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { addDaysUTC, todayInTimezone } from '../../../../shared/utils/calendar-date';
import {
  BillingAccountEntityBuilder,
  ChargeEntityBuilder,
  ChargeLineEntityBuilder,
  SubscriptionEntityBuilder,
  SubscriptionItemEntityBuilder,
} from '../../../../test/builders/billing';
import type { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { BillingAccountEntity } from '../entities/billing-account.entity';
import { ChargeLineEntity } from '../entities/charge-line.entity';
import { ChargeEntity } from '../entities/charge.entity';
import { ProviderEventEntity } from '../entities/provider-event.entity';
import { SubscriptionItemEntity } from '../entities/subscription-item.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { FakeBillingProvider } from '../providers/fake-billing.provider';

const INTERNAL_KEY = 'integ-simulate-key-integ-simulate-k'; // ≥32 chars
const PLATFORM_KEY = 'integ-simulate-platform-key-integ-sim'; // ≥32 chars
const KEYS = { 'X-Internal-Key': INTERNAL_KEY, 'X-Platform-Admin-Key': PLATFORM_KEY };
const URL = '/internal/dev/billing/provider/simulate';
const ZONE = 'America/Sao_Paulo';
const EMAIL = 'billing@example.test';
const IDENTITY = { name: 'Lava Rápido', email: EMAIL, taxId: '11222333000181', countryCode: 'BR' };

describe('InternalDevBillingController (integration)', () => {
  describe('local', () => {
    let app: INestApplication;
    let ds: DataSource;
    let bus: RoutingInMemoryEventBus;
    let fake: FakeBillingProvider;
    const tenantIds: string[] = [];

    beforeAll(async () => {
      process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
      process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
      ({ app, ds, eventBus: bus } = await createBillingIntegrationApp());
      fake = app.get(FakeBillingProvider);
    });

    afterEach(async () => {
      for (const table of [
        'provider_events',
        'charge_lines',
        'charges',
        'billing_accounts',
        'subscription_items',
        'subscriptions',
      ]) {
        await ds.query(`DELETE FROM "billing"."${table}" WHERE "tenant_id" = ANY($1::uuid[])`, [
          tenantIds,
        ]);
      }
      tenantIds.length = 0;
    });

    afterAll(async () => {
      await app.close();
      delete process.env['INTERNAL_API_KEY'];
      delete process.env['PLATFORM_ADMIN_KEY'];
    });

    interface Seeded {
      tenantId: string;
      chargeId: string;
      providerChargeId: string;
    }

    // A tenant with a subscription, a billing account and a `READY` charge the fake provider knows.
    async function seed(options: { merchantProfileKey?: string } = {}): Promise<Seeded> {
      const merchantProfileKey = options.merchantProfileKey ?? 'BRL_FAKE';
      const tenantId = uuidv7();
      tenantIds.push(tenantId);
      const today = todayInTimezone(ZONE, new Date());
      const subscriptionEntity = new SubscriptionEntityBuilder()
        .withTenantId(tenantId)
        .withStatus('ACTIVE')
        .build();
      subscriptionEntity.currentPeriodStart = new Date(Date.now() - 20 * 24 * 3600 * 1000);
      subscriptionEntity.currentPeriodEnd = new Date(Date.now() + 10 * 24 * 3600 * 1000);
      await ds.getRepository(SubscriptionEntity).insert(subscriptionEntity);
      await ds
        .getRepository(SubscriptionItemEntity)
        .insert(
          new SubscriptionItemEntityBuilder()
            .withTenantId(tenantId)
            .withSubscriptionId(subscriptionEntity.id)
            .build(),
        );
      const { providerCustomerId } = await fake.ensureCustomer(tenantId, IDENTITY);
      await ds
        .getRepository(BillingAccountEntity)
        .insert(
          new BillingAccountEntityBuilder()
            .withTenantId(tenantId)
            .withBillingEmail(EMAIL)
            .withProvider('ASAAS', providerCustomerId)
            .build(),
        );
      const chargeId = uuidv7();
      const created = await fake.createCharge({
        merchantProfileKey: 'BRL_FAKE',
        providerCustomerId,
        dueDate: addDaysUTC(today, 5),
        lines: [{ description: 'Hotsite', amountMinor: 4900 }],
        currency: 'BRL',
        taxBehavior: 'INCLUSIVE',
        customerLocation: { countryCode: 'BR' },
        description: 'Assinatura',
        externalReference: chargeId,
        returnUrl: 'https://app.example.test/billing',
      });
      await ds
        .getRepository(ChargeEntity)
        .insert(
          new ChargeEntityBuilder()
            .withId(chargeId)
            .withTenantId(tenantId)
            .withSubscriptionId(subscriptionEntity.id)
            .withMerchantProfileKey(merchantProfileKey)
            .withProviderReady('ASAAS', created.providerChargeId)
            .withPeriod(today, addDaysUTC(today, 30))
            .build(),
        );
      await ds
        .getRepository(ChargeLineEntity)
        .insert(
          new ChargeLineEntityBuilder().withTenantId(tenantId).withChargeId(chargeId).build(),
        );
      fake.drainDeliveries(); // the PAYMENT_CREATED the creation queued
      return { tenantId, chargeId, providerChargeId: created.providerChargeId };
    }

    const post = (body: Record<string, unknown>, headers: Record<string, string> = KEYS) =>
      request(app.getHttpServer())
        .post(URL)
        .set(headers)
        .set('X-Correlation-Id', 'corr-sim')
        .send(body);
    const chargeRow = (id: string) => ds.getRepository(ChargeEntity).findOneByOrFail({ id });
    const subscriptionRow = (tenantId: string) =>
      ds.getRepository(SubscriptionEntity).findOneByOrFail({ tenantId });
    const publishedFor = (tenantId: string, eventName: string) =>
      bus.published.filter((e) => e.tenantId === tenantId && e.eventName === eventName);

    describe('operator keys', () => {
      it('is 401 with only the internal key, only the platform admin key, or neither', async () => {
        const { tenantId } = await seed();
        const body = { tenantId, event: 'PAID_PIX' };

        await post(body, { 'X-Internal-Key': INTERNAL_KEY }).expect(401);
        await post(body, { 'X-Platform-Admin-Key': PLATFORM_KEY }).expect(401);
        await post(body, {}).expect(401);
        expect(await ds.getRepository(ProviderEventEntity).countBy({ tenantId })).toBe(0);
      });
    });

    describe('request validation', () => {
      it.each([
        ['neither tenantId nor chargeId', { event: 'PAID_PIX' }],
        [
          'both tenantId and chargeId',
          { tenantId: uuidv7(), chargeId: uuidv7(), event: 'PAID_PIX' },
        ],
        ['an unknown event', { tenantId: uuidv7(), event: 'PAID_CASH' }],
        ['an unknown delivery', { tenantId: uuidv7(), event: 'PAID_PIX', delivery: 'LATE' }],
        ['an unknown failure', { tenantId: uuidv7(), event: 'PAID_PIX', failure: 'PROVIDER_4XX' }],
      ])('is 400 for %s', async (_label, body) => {
        await post(body).expect(400);
      });
    });

    describe('each event applies exactly the state a real webhook would', () => {
      it.each([
        ['PAID_PIX', 'PIX'],
        ['PAID_BOLETO', 'BOLETO'],
        ['PAID_CARD', 'CARD'],
      ])(
        '%s by tenantId pays the charge, reactivates and publishes ChargePaid once',
        async (event, method) => {
          const { tenantId, chargeId } = await seed();

          const response = await post({ tenantId, event }).expect(200);

          expect(response.body).toMatchObject({ tenantId, chargeId, event, delivery: 'NORMAL' });
          expect(response.body.outcomes[0]).toBe('APPLIED');
          expect(await chargeRow(chargeId)).toMatchObject({ status: 'PAID', method });
          expect(await subscriptionRow(tenantId)).toMatchObject({
            status: 'ACTIVE',
            hasEverPaid: true,
          });
          expect(publishedFor(tenantId, 'ChargePaid')).toHaveLength(1);
        },
      );

      const EVENTS = [
        ['PAID_PIX', 'PAID', false],
        ['PAID_BOLETO', 'PAID', false],
        ['PAID_CARD', 'PAID', false],
        ['OVERDUE', 'PENDING', false],
        ['REFUND_FULL', 'REFUNDED', true],
        ['REFUND_PARTIAL', 'PAID', true],
        ['CHARGEBACK_OPENED', 'PAID', true],
        ['CHARGEBACK_LOST', 'CHARGEBACK', true],
      ] as const;
      const DELIVERIES = ['NORMAL', 'DUPLICATE', 'DELAYED', 'OUT_OF_ORDER'] as const;

      // Every event under every delivery misbehaviour ends in the state a real webhook would
      // leave, and the one payment publishes exactly one ChargePaid however it is delivered.
      it.each(
        EVENTS.flatMap(([event, status, needsPaid]) =>
          DELIVERIES.map((delivery) => [event, delivery, status, needsPaid] as const),
        ),
      )('%s delivered %s leaves the charge %s', async (event, delivery, status, needsPaid) => {
        const { tenantId, chargeId } = await seed();
        if (needsPaid) await post({ chargeId, event: 'PAID_PIX' }).expect(200);

        const response = await post({ chargeId, event, delivery }).expect(200);

        expect(response.body.outcomes).not.toContain('PROVIDER_ERROR');
        expect(response.body.outcomes).not.toContain('UNKNOWN_TARGET');
        expect((await chargeRow(chargeId)).status).toBe(status);
        expect(publishedFor(tenantId, 'ChargePaid')).toHaveLength(
          event.startsWith('PAID') || needsPaid ? 1 : 0,
        );
        expect(await ds.getRepository(ProviderEventEntity).countBy({ tenantId })).toBeGreaterThan(
          0,
        );
      });

      it('OVERDUE is confirm-only: only the sweep writes OVERDUE, so neither the charge nor the subscription moves', async () => {
        const { tenantId, chargeId } = await seed();

        await post({ tenantId, event: 'OVERDUE' }).expect(200);

        expect((await chargeRow(chargeId)).status).toBe('PENDING');
        expect((await subscriptionRow(tenantId)).status).toBe('ACTIVE');
      });

      it('REFUND_FULL, CHARGEBACK_OPENED and CHARGEBACK_LOST pick the most recent paid charge', async () => {
        const { tenantId, chargeId } = await seed();
        await post({ tenantId, event: 'PAID_PIX' }).expect(200);

        await post({ tenantId, event: 'CHARGEBACK_OPENED' }).expect(200);
        expect((await chargeRow(chargeId)).status).toBe('PAID');
        await post({ tenantId, event: 'CHARGEBACK_LOST' }).expect(200);

        expect((await chargeRow(chargeId)).status).toBe('CHARGEBACK');
      });

      it('REFUND_FULL refunds a paid charge', async () => {
        const { tenantId, chargeId } = await seed();
        await post({ tenantId, event: 'PAID_PIX' }).expect(200);

        await post({ tenantId, event: 'REFUND_FULL' }).expect(200);

        expect((await chargeRow(chargeId)).status).toBe('REFUNDED');
      });
    });

    describe('failure', () => {
      it('makes the next provider call fail once: the payment is not applied, then the call succeeds', async () => {
        const { chargeId, providerChargeId } = await seed();

        const response = await post({
          chargeId,
          event: 'PAID_PIX',
          failure: 'PROVIDER_5XX',
        }).expect(200);

        expect(response.body.outcomes).toEqual(['PROVIDER_ERROR']);
        expect((await chargeRow(chargeId)).status).toBe('PENDING');
        await expect(fake.fetchChargeStatus(providerChargeId)).resolves.toMatchObject({
          state: 'PAID',
        });
      });
    });

    describe('refusals deliver nothing', () => {
      it('is 409 for a charge whose merchant profile is not a *_FAKE one', async () => {
        const { tenantId, chargeId } = await seed({ merchantProfileKey: 'BRL_ASAAS_SANDBOX' });

        await post({ chargeId, event: 'PAID_PIX' }).expect(409);

        expect((await chargeRow(chargeId)).status).toBe('PENDING');
        expect(await ds.getRepository(ProviderEventEntity).countBy({ tenantId })).toBe(0);
      });

      it('is 409 for a charge the fake does not know (a restart or a second instance)', async () => {
        const { tenantId, chargeId } = await seed();
        fake.charges.clear();

        const response = await post({ chargeId, event: 'PAID_PIX' }).expect(409);

        expect(response.body.detail).toContain('single-instance');
        expect((await chargeRow(chargeId)).status).toBe('PENDING');
        expect(await ds.getRepository(ProviderEventEntity).countBy({ tenantId })).toBe(0);
      });

      it('is 409 for an event that does not apply to the charge', async () => {
        const { tenantId, chargeId } = await seed();

        await post({ chargeId, event: 'REFUND_FULL' }).expect(409);
        await post({ tenantId, event: 'CHARGEBACK_LOST' }).expect(409);

        expect((await chargeRow(chargeId)).status).toBe('PENDING');
      });
    });

    describe('tenant isolation', () => {
      it("the tenant form acts on that tenant's charge only", async () => {
        const a = await seed();
        const b = await seed();

        await post({ tenantId: a.tenantId, event: 'PAID_PIX' }).expect(200);

        expect((await chargeRow(a.chargeId)).status).toBe('PAID');
        expect((await chargeRow(b.chargeId)).status).toBe('PENDING');
        expect(publishedFor(b.tenantId, 'ChargePaid')).toHaveLength(0);
      });

      it('a tenant with no charge of its own is 409 while another tenant has an open one', async () => {
        const other = await seed();

        await post({ tenantId: uuidv7(), event: 'PAID_PIX' }).expect(409);

        expect((await chargeRow(other.chargeId)).status).toBe('PENDING');
      });

      it('a chargeId nothing knows is 409', async () => {
        await post({ chargeId: uuidv7(), event: 'PAID_PIX' }).expect(409);
      });
    });
  });

  describe('production', () => {
    let app: INestApplication;

    beforeAll(async () => {
      process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
      process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
      ({ app } = await createBillingIntegrationApp({ appEnv: 'production' }));
    });

    afterAll(async () => {
      await app.close();
      delete process.env['INTERNAL_API_KEY'];
      delete process.env['PLATFORM_ADMIN_KEY'];
    });

    it('answers 404 on the simulate route, whatever the keys', async () => {
      await request(app.getHttpServer())
        .post(URL)
        .set(KEYS)
        .send({ tenantId: uuidv7(), event: 'PAID_PIX' })
        .expect(404);
    });
  });
});

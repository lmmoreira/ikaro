import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { addDaysUTC, todayInTimezone } from '../../../../shared/utils/calendar-date';
import {
  BillingAccountEntityBuilder,
  ChargeEntityBuilder,
  ChargeLineEntityBuilder,
  SubscriptionEntityBuilder,
  SubscriptionItemEntityBuilder,
} from '../../../../test/builders/billing';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { databaseNow, waitForBlockedLock } from '../../../../test/utils/booking-lock-race-world';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../application/ports/subscription-repository.port';
import { BillingAccountEntity } from '../entities/billing-account.entity';
import { ChargeLineEntity } from '../entities/charge-line.entity';
import { ProviderEventEntity } from '../entities/provider-event.entity';
import { SubscriptionItemEntity } from '../entities/subscription-item.entity';
import { ChargeEntity } from '../entities/charge.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { FakeBillingProvider } from '../providers/fake-billing.provider';
import type { FakeWebhookDelivery } from '../providers/fake-billing.types';
import type { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';

const INTERNAL_KEY = 'integ-webhook-key-integ-webhook-x'; // ≥32 chars
const ZONE = 'America/Sao_Paulo';
const EMAIL = 'billing@example.test';
const IDENTITY = { name: 'Lava Rápido', email: EMAIL, taxId: '11222333000181', countryCode: 'BR' };
const URL = '/internal/billing/webhooks/asaas';

describe('InternalBillingWebhookController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let bus: RoutingInMemoryEventBus;
  let fake: FakeBillingProvider;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
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
  });

  interface Seeded {
    tenantId: string;
    chargeId: string;
    providerChargeId: string;
  }

  // A tenant with a subscription, a billing account and a `READY` charge the fake provider knows.
  async function seed(
    status: string,
    options: { kind?: 'PERIOD' | 'RECOVERY'; suspension?: string; early?: boolean } = {},
  ): Promise<Seeded> {
    const tenantId = uuidv7();
    tenantIds.push(tenantId);
    const today = todayInTimezone(ZONE, new Date());
    const subscription = new SubscriptionEntityBuilder().withTenantId(tenantId).withStatus(status);
    if (options.suspension) subscription.withSuspension(options.suspension, new Date());
    const subscriptionEntity = subscription.build();
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
    await ds.getRepository(BillingAccountEntity).insert(
      new BillingAccountEntityBuilder()
        .withTenantId(tenantId)
        .withBillingEmail(EMAIL)
        .withProvider(options.early ? null : 'ASAAS', options.early ? null : providerCustomerId)
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
    const charge = new ChargeEntityBuilder()
      .withId(chargeId)
      .withTenantId(tenantId)
      .withSubscriptionId(subscriptionEntity.id);
    if (!options.early) charge.withProviderReady('ASAAS', created.providerChargeId);
    if (options.kind === 'RECOVERY') charge.asRecovery();
    else charge.withPeriod(today, addDaysUTC(today, 30));
    await ds.getRepository(ChargeEntity).insert(charge.build());
    await ds
      .getRepository(ChargeLineEntity)
      .insert(new ChargeLineEntityBuilder().withTenantId(tenantId).withChargeId(chargeId).build());
    fake.drainDeliveries();
    return { tenantId, chargeId, providerChargeId: created.providerChargeId };
  }

  const post = (delivery: FakeWebhookDelivery | Record<string, unknown>, key = INTERNAL_KEY) => {
    const body =
      'body' in delivery && typeof delivery['body'] === 'string'
        ? JSON.parse(delivery['body'])
        : delivery;
    return request(app.getHttpServer())
      .post(URL)
      .set('X-Internal-Key', key)
      .set('X-Correlation-Id', 'corr-webhook-int')
      .send(body);
  };
  const subscriptionRow = (tenantId: string) =>
    ds.getRepository(SubscriptionEntity).findOneByOrFail({ tenantId });
  const chargeRow = (id: string) => ds.getRepository(ChargeEntity).findOneByOrFail({ id });
  const publishedFor = (tenantId: string, eventName: string) =>
    bus.published.filter((event) => event.tenantId === tenantId && event.eventName === eventName);

  describe('the HTTP contract', () => {
    it('answers EXACTLY 200 (never 201) with an empty body, and applies the payment', async () => {
      const { tenantId, chargeId, providerChargeId } = await seed('PAST_DUE');
      fake.simulatePayment(providerChargeId, 'PIX');
      const [delivery] = fake.drainDeliveries();

      const response = await post(delivery);

      expect(response.status).toBe(200);
      expect(response.text).toBe('');
      expect(await chargeRow(chargeId)).toMatchObject({ status: 'PAID', method: 'PIX' });
      expect(await subscriptionRow(tenantId)).toMatchObject({
        status: 'ACTIVE',
        pastDueSince: null,
        hasEverPaid: true,
      });
      expect(publishedFor(tenantId, 'ChargePaid')).toHaveLength(1);
      expect(publishedFor(tenantId, 'ChargePaid')[0].data).toMatchObject({
        recipientEmail: EMAIL,
        receiptUrl: expect.stringMatching(/^https:\/\/fake-billing\.invalid\//),
      });
    });

    it('refuses a missing or wrong internal key with 401 and stores nothing', async () => {
      const { tenantId, providerChargeId } = await seed('PAST_DUE');
      fake.simulatePayment(providerChargeId, 'PIX');
      const [delivery] = fake.drainDeliveries();

      const wrong = await post(delivery, 'wrong-key-wrong-key-wrong-key-wrong-k');
      const none = await request(app.getHttpServer()).post(URL).send({});

      expect(wrong.status).toBe(401);
      expect(none.status).toBe(401);
      expect(await ds.getRepository(ProviderEventEntity).countBy({ tenantId })).toBe(0);
    });

    it('refuses a provider this release cannot read (stripe is M28) with 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/internal/billing/webhooks/stripe')
        .set('X-Internal-Key', INTERNAL_KEY)
        .send({});

      expect(response.status).toBe(400);
    });

    it('acknowledges an unknown customer and an unknown reference with 200 and no state change', async () => {
      const { tenantId, chargeId } = await seed('PAST_DUE');

      const response = await post({
        id: 'evt_unknown&1',
        event: 'PAYMENT_RECEIVED',
        dateCreated: '2026-03-10 12:00:00',
        payment: {
          id: 'pay_unknown',
          customer: 'cus_unknown',
          value: 49,
          externalReference: uuidv7(),
        },
      });

      expect(response.status).toBe(200);
      expect(await chargeRow(chargeId)).toMatchObject({ status: 'PENDING' });
      expect(await ds.getRepository(ProviderEventEntity).countBy({ tenantId })).toBe(0);
    });

    it('answers non-2xx when the provider re-read fails, so the provider retries; the retry then applies', async () => {
      const { chargeId, providerChargeId } = await seed('PAST_DUE');
      fake.simulatePayment(providerChargeId, 'PIX');
      const [delivery] = fake.drainDeliveries();
      fake.failNextCall('UNAVAILABLE');

      const failed = await post(delivery);
      expect(failed.status).toBeGreaterThanOrEqual(500);
      expect(await chargeRow(chargeId)).toMatchObject({ status: 'PENDING' });

      const retried = await post(delivery);
      expect(retried.status).toBe(200);
      expect(await chargeRow(chargeId)).toMatchObject({ status: 'PAID' });
    });
  });

  describe('idempotency and ordering', () => {
    it('replaying the same event id is a 200 no-op with no second outbox row', async () => {
      const { tenantId, providerChargeId } = await seed('PAST_DUE');
      fake.simulatePayment(providerChargeId, 'PIX');
      const [delivery] = fake.drainDeliveries();

      expect((await post(delivery)).status).toBe(200);
      expect((await post(delivery)).status).toBe(200);

      expect(publishedFor(tenantId, 'ChargePaid')).toHaveLength(1);
      expect(await ds.getRepository(ProviderEventEntity).countBy({ tenantId })).toBe(1);
    });

    it.each([
      ['NORMAL', {}],
      ['DUPLICATE', { duplicate: true }],
      ['OUT_OF_ORDER', { reverse: true }],
      ['DELAYED', { delayMs: 50 }],
    ] as const)(
      'a boleto paid, delivered %s, ends PAID with one ChargePaid',
      async (_label, options) => {
        const { tenantId, chargeId, providerChargeId } = await seed('PAST_DUE');
        fake.simulatePayment(providerChargeId, 'BOLETO');

        for (const delivery of fake.drainDeliveries(options)) {
          expect((await post(delivery)).status).toBe(200);
        }

        expect(await chargeRow(chargeId)).toMatchObject({ status: 'PAID' });
        expect(publishedFor(tenantId, 'ChargePaid')).toHaveLength(1);
      },
    );

    it('B-R1: two webhooks for one charge arriving together produce one ChargePaid', async () => {
      const { tenantId, chargeId, providerChargeId } = await seed('PAST_DUE');
      fake.simulatePayment(providerChargeId, 'BOLETO'); // CONFIRMED and RECEIVED: two event ids
      const deliveries = fake.drainDeliveries();
      expect(deliveries).toHaveLength(2);

      const responses = await Promise.all(deliveries.map((delivery) => post(delivery)));

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(await chargeRow(chargeId)).toMatchObject({ status: 'PAID' });
      expect(publishedFor(tenantId, 'ChargePaid')).toHaveLength(1);
      expect(await ds.getRepository(ProviderEventEntity).countBy({ tenantId })).toBe(2);
    });

    it('two simultaneous deliveries of the SAME event id both answer 200 and apply the payment exactly once', async () => {
      const { tenantId, chargeId, providerChargeId } = await seed('PAST_DUE');
      fake.simulatePayment(providerChargeId, 'PIX');
      const [delivery] = fake.drainDeliveries();

      const responses = await Promise.all([post(delivery), post(delivery), post(delivery)]);

      expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
      expect(await chargeRow(chargeId)).toMatchObject({ status: 'PAID' });
      expect(publishedFor(tenantId, 'ChargePaid')).toHaveLength(1);
      expect(await ds.getRepository(ProviderEventEntity).countBy({ tenantId })).toBe(1);
    });

    it('B-R1: a webhook racing an operator suspend serialises: the parked webhook never lifts the OPERATOR suspension', async () => {
      const { tenantId, chargeId, providerChargeId } = await seed('ACTIVE');
      fake.simulatePayment(providerChargeId, 'PIX');
      const [delivery] = fake.drainDeliveries();
      const txManager = app.get<ITransactionManager>(TRANSACTION_MANAGER);
      const subscriptions = app.get<ISubscriptionRepository>(SUBSCRIPTION_REPOSITORY);
      let release!: () => void;
      let signalLocked!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const locked = new Promise<void>((resolve) => (signalLocked = resolve));
      const holder = txManager.run(async () => {
        const subscription = await subscriptions.findByTenantIdForUpdate(tenantId);
        if (subscription === null) throw new Error('seeded subscription missing');
        subscription.suspendByOperator(new Date(), 'corr-holder', null);
        await subscriptions.save(subscription);
        signalLocked();
        await gate;
      });
      await locked;

      const since = await databaseNow(ds);
      const webhook = post(delivery).then((response) => response);
      try {
        await waitForBlockedLock(ds, 'row', since);
      } finally {
        release();
        await holder;
      }

      expect((await webhook).status).toBe(200);
      expect(await chargeRow(chargeId)).toMatchObject({ status: 'PAID' });
      expect(await subscriptionRow(tenantId)).toMatchObject({
        status: 'SUSPENDED',
        suspensionReason: 'OPERATOR',
      });
    });
  });

  describe('resolving the tenant', () => {
    it('a webhook that outruns the customer save and the READY write is resolved through the external reference and applied', async () => {
      const { tenantId, chargeId, providerChargeId } = await seed('PAST_DUE', { early: true });
      fake.simulatePayment(providerChargeId, 'PIX');
      const [delivery] = fake.drainDeliveries();

      expect((await post(delivery)).status).toBe(200);

      expect(await chargeRow(chargeId)).toMatchObject({ status: 'PAID', providerChargeId: null });
      expect(await subscriptionRow(tenantId)).toMatchObject({ status: 'ACTIVE' });
      expect(await ds.getRepository(ProviderEventEntity).countBy({ tenantId })).toBe(1);
    });
  });

  describe('suspension and reactivation', () => {
    it('a paid RECOVERY charge reactivates a NON_PAYMENT suspension with no human action', async () => {
      const { tenantId, chargeId, providerChargeId } = await seed('SUSPENDED', {
        kind: 'RECOVERY',
        suspension: 'NON_PAYMENT',
      });
      fake.simulatePayment(providerChargeId, 'PIX');
      const [delivery] = fake.drainDeliveries();

      expect((await post(delivery)).status).toBe(200);

      expect(await chargeRow(chargeId)).toMatchObject({ status: 'PAID' });
      expect(await subscriptionRow(tenantId)).toMatchObject({
        status: 'ACTIVE',
        suspensionReason: null,
        suspendedAt: null,
      });
      expect(publishedFor(tenantId, 'SubscriptionReactivated')).toHaveLength(1);
    });

    it('a full refund of the current period suspends with PAYMENT_REVERSED and inserts the RECOVERY charge PENDING', async () => {
      const { tenantId, chargeId, providerChargeId } = await seed('ACTIVE');
      fake.simulatePayment(providerChargeId, 'CARD');
      for (const delivery of fake.drainDeliveries()) await post(delivery);
      fake.simulateRefund(providerChargeId, 'FULL');
      const [refund] = fake.drainDeliveries();

      expect((await post(refund)).status).toBe(200);

      expect(await chargeRow(chargeId)).toMatchObject({ status: 'REFUNDED' });
      expect(await subscriptionRow(tenantId)).toMatchObject({
        status: 'SUSPENDED',
        suspensionReason: 'PAYMENT_REVERSED',
      });
      const recovery = await ds
        .getRepository(ChargeEntity)
        .findOneByOrFail({ tenantId, kind: 'RECOVERY' });
      expect(recovery).toMatchObject({ status: 'PENDING', providerCreationStatus: 'PENDING' });
      expect(publishedFor(tenantId, 'SubscriptionSuspended')).toHaveLength(1);
    });
  });

  describe('tenant isolation', () => {
    it("a webhook resolves exactly one tenant and never touches another tenant's charge", async () => {
      const a = await seed('PAST_DUE');
      const b = await seed('PAST_DUE');
      fake.simulatePayment(a.providerChargeId, 'PIX');
      const [delivery] = fake.drainDeliveries();

      await post(delivery);

      expect(await chargeRow(a.chargeId)).toMatchObject({ status: 'PAID' });
      expect(await chargeRow(b.chargeId)).toMatchObject({ status: 'PENDING' });
      expect(await subscriptionRow(b.tenantId)).toMatchObject({ status: 'PAST_DUE' });
      expect(publishedFor(b.tenantId, 'ChargePaid')).toHaveLength(0);
    });
  });
});

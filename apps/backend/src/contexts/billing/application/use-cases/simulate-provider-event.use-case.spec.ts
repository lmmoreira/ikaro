import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { addDaysUTC, todayInTimezone } from '../../../../shared/utils/calendar-date';
import {
  BillingAccountBuilder,
  ChargeBuilder,
  ChargeLineBuilder,
  FeaturePriceBuilder,
  FeaturePriceVersionBuilder,
  SubscriptionBuilder,
  SubscriptionItemBuilder,
} from '../../../../test/builders/billing';
import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBillingAccountRepository } from '../../../../test/repositories/billing/in-memory-billing-account.repository';
import { InMemoryChargeRepository } from '../../../../test/repositories/billing/in-memory-charge.repository';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import { InMemoryProviderEventRepository } from '../../../../test/repositories/billing/in-memory-provider-event.repository';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import type { Charge } from '../../domain/charge.aggregate';
import { SimulationNotApplicableError } from '../../domain/errors/billing-domain.error';
import { BillingProviderRegistry } from '../../infrastructure/providers/billing-provider.registry';
import { FakeBillingProvider } from '../../infrastructure/providers/fake-billing.provider';
import type { SimulateProviderEventUseCaseInput } from './simulate-provider-event.use-case';
import { ApplyChargeFactService } from '../services/apply-charge-fact.service';
import { RecoveryChargePlanner } from '../services/recovery-charge-planner.service';
import { ProviderWebhookProcessor } from '../services/provider-webhook-processor.service';
import { SimulateProviderEventUseCase } from './simulate-provider-event.use-case';

// São Paulo is UTC-3 with no DST: NOW is 12:00 local on 2026-03-10.
const NOW = new Date('2026-03-10T15:00:00Z');
const ZONE = 'America/Sao_Paulo';
const IDENTITY = {
  name: 'Lava Rápido',
  email: 'billing@example.test',
  taxId: '11222333000181',
  countryCode: 'BR',
};

interface Seeded {
  tenantId: string;
  charge: Charge;
  providerChargeId: string;
}

describe('SimulateProviderEventUseCase', () => {
  let clock: AdvanceableClock;
  let fake: FakeBillingProvider;
  let charges: InMemoryChargeRepository;
  let subscriptions: InMemorySubscriptionRepository;
  let accounts: InMemoryBillingAccountRepository;
  let useCase: SimulateProviderEventUseCase;
  let outbox: InMemoryOutboxPublisher;

  beforeEach(() => {
    clock = new AdvanceableClock(NOW);
    fake = new FakeBillingProvider(clock);
    const txManager = new InMemoryTransactionManager();
    outbox = new InMemoryOutboxPublisher(txManager);
    subscriptions = new InMemorySubscriptionRepository(outbox);
    accounts = new InMemoryBillingAccountRepository();
    charges = new InMemoryChargeRepository(outbox);
    const providerEvents = new InMemoryProviderEventRepository();
    const prices = new InMemoryFeaturePriceRepository();
    prices.seed(
      new FeaturePriceBuilder()
        .withVersions([new FeaturePriceVersionBuilder().withAmountMinor(4900).build()])
        .build(),
    );
    const webhook = new ProviderWebhookProcessor(
      new BillingProviderRegistry('local', fake),
      { appEnv: 'local', platformOwnerSlug: null },
      accounts,
      subscriptions,
      charges,
      providerEvents,
      new ApplyChargeFactService(
        subscriptions,
        charges,
        providerEvents,
        new RecoveryChargePlanner(charges, prices),
        txManager,
        clock,
      ),
      { execute: async () => 'READY' },
      clock,
    );
    useCase = new SimulateProviderEventUseCase(charges, fake, webhook);
  });

  interface SeedOptions {
    tenantId?: string;
    merchantProfileKey?: string;
    periodStart?: string;
    paid?: boolean;
    readyAtProvider?: boolean;
  }

  /** A tenant with a subscription, a billing account and a charge both the database and the fake know. */
  async function seed(options: SeedOptions = {}): Promise<Seeded> {
    const periodStart = options.periodStart ?? '2026-03-10';
    const subscription = new SubscriptionBuilder()
      .withTenantId(options.tenantId ?? uuidv7())
      .withStatus('ACTIVE')
      .withCurrentPeriod(new Date('2026-02-10T03:00:00Z'), new Date('2026-03-09T23:59:59Z'))
      .withItems([
        new SubscriptionItemBuilder().withStartsAt(new Date('2026-02-10T03:00:00Z')).build(),
      ])
      .build();
    await subscriptions.save(subscription);
    const { providerCustomerId } = await fake.ensureCustomer(subscription.tenantId, IDENTITY);
    await accounts.save(
      new BillingAccountBuilder()
        .withTenantId(subscription.tenantId)
        .withBillingEmail(IDENTITY.email)
        .withProvider('ASAAS', providerCustomerId)
        .build(),
    );
    const chargeId = uuidv7();
    const created = await fake.createCharge({
      merchantProfileKey: 'BRL_FAKE',
      providerCustomerId,
      dueDate: addDaysUTC(todayInTimezone(ZONE, NOW), 5),
      lines: [{ description: 'Hotsite', amountMinor: 4900 }],
      currency: 'BRL',
      taxBehavior: 'INCLUSIVE',
      customerLocation: { countryCode: 'BR' },
      description: 'Assinatura',
      externalReference: chargeId,
      returnUrl: 'https://app.example.test/billing',
    });
    const builder = new ChargeBuilder()
      .withId(chargeId)
      .withTenantId(subscription.tenantId)
      .withSubscriptionId(subscription.id)
      .withMerchantProfileKey(options.merchantProfileKey ?? 'BRL_FAKE')
      .withLines([new ChargeLineBuilder().withUnitPriceMinor(4900).build()])
      .withPeriod(periodStart, addDaysUTC(periodStart, 30));
    if (options.readyAtProvider !== false) {
      builder.withProviderReady('ASAAS', created.providerChargeId);
    }
    const charge = builder.build();
    await charges.save(charge);
    fake.drainDeliveries(); // the PAYMENT_CREATED the creation queued
    outbox.published.length = 0;
    const seeded = {
      tenantId: subscription.tenantId,
      charge,
      providerChargeId: created.providerChargeId,
    };
    if (options.paid) await simulate({ tenantId: seeded.tenantId, event: 'PAID_PIX' });
    return seeded;
  }

  const simulate = (
    input: Partial<SimulateProviderEventUseCaseInput> &
      Pick<SimulateProviderEventUseCaseInput, 'event'>,
  ) => useCase.execute({ delivery: 'NORMAL', correlationId: 'corr-simulate', ...input });

  const refusalOf = async (promise: Promise<unknown>): Promise<string> => {
    const err: unknown = await promise.then(
      () => null,
      (error: unknown) => error,
    );
    expect(err).toBeInstanceOf(SimulationNotApplicableError);
    return (err as SimulationNotApplicableError).refusal;
  };

  describe('each event is applied exactly as a real webhook would be', () => {
    it.each([
      ['PAID_PIX', 'PIX'],
      ['PAID_BOLETO', 'BOLETO'],
      ['PAID_CARD', 'CARD'],
    ] as const)(
      "%s pays the tenant's single open charge through the webhook use case",
      async (event, method) => {
        const { tenantId, charge } = await seed();

        const result = await simulate({ tenantId, event });

        expect(result.outcomes[0]).toBe('APPLIED');
        expect(result.chargeId).toBe(charge.id);
        expect(charge.status).toBe('PAID');
        expect(charge.method).toBe(method);
        expect(outbox.published.map((e) => e.eventName)).toEqual(['ChargePaid']);
      },
    );

    it('OVERDUE reaches the webhook use case but is confirm-only: the subscription is not moved', async () => {
      const { tenantId, charge } = await seed();

      const result = await simulate({ tenantId, event: 'OVERDUE' });

      expect(result.outcomes).toHaveLength(1);
      expect(result.outcomes[0]).not.toBe('UNKNOWN_TARGET');
      expect((await subscriptions.findByTenantId(tenantId))?.status).toBe('ACTIVE');
      expect(['PENDING', 'OVERDUE']).toContain(charge.status);
    });

    it('REFUND_FULL picks the most recent paid charge by tenantId and refunds it', async () => {
      const { tenantId, charge } = await seed({ paid: true });

      const result = await simulate({ tenantId, event: 'REFUND_FULL' });

      expect(result.chargeId).toBe(charge.id);
      expect(charge.status).toBe('REFUNDED');
    });

    it('REFUND_PARTIAL leaves the charge paid and records the event', async () => {
      const { tenantId, charge } = await seed({ paid: true });

      const result = await simulate({ tenantId, event: 'REFUND_PARTIAL' });

      expect(result.outcomes).toHaveLength(1);
      expect(charge.status).toBe('PAID');
    });

    it('CHARGEBACK_OPENED is recorded without changing the charge', async () => {
      const { tenantId, charge } = await seed({ paid: true });

      const result = await simulate({ tenantId, event: 'CHARGEBACK_OPENED' });

      expect(result.outcomes).toEqual(['RECORDED']);
      expect(charge.status).toBe('PAID');
    });

    it('CHARGEBACK_LOST charges the paid charge back', async () => {
      const { tenantId, charge } = await seed({ paid: true });

      await simulate({ tenantId, event: 'CHARGEBACK_LOST' });

      expect(charge.status).toBe('CHARGEBACK');
    });

    it('targets the charge named by chargeId, whatever its tenant has open', async () => {
      const { charge } = await seed();

      const result = await simulate({ chargeId: charge.id, event: 'PAID_PIX' });

      expect(result).toMatchObject({ chargeId: charge.id, tenantId: charge.tenantId });
      expect(charge.status).toBe('PAID');
    });
  });

  describe('delivery', () => {
    it('DUPLICATE delivers the payload twice and the second is a recognised duplicate', async () => {
      const { tenantId, charge } = await seed();

      const result = await simulate({ tenantId, event: 'PAID_PIX', delivery: 'DUPLICATE' });

      expect(result.outcomes).toEqual(['APPLIED', 'DUPLICATE']);
      expect(charge.status).toBe('PAID');
      expect(outbox.published.map((e) => e.eventName)).toEqual(['ChargePaid']);
    });

    it('OUT_OF_ORDER delivers a boleto RECEIVED before its CONFIRMED and pays once', async () => {
      const { tenantId, charge } = await seed();

      const result = await simulate({ tenantId, event: 'PAID_BOLETO', delivery: 'OUT_OF_ORDER' });

      expect(result.outcomes).toHaveLength(2);
      expect(result.outcomes[0]).toBe('APPLIED');
      expect(charge.status).toBe('PAID');
      expect(outbox.published.map((e) => e.eventName)).toEqual(['ChargePaid']);
    });

    it('DELAYED waits inside the request and still applies the event', async () => {
      const { tenantId, charge } = await seed();
      const started = Date.now();

      const result = await simulate({ tenantId, event: 'PAID_PIX', delivery: 'DELAYED' });

      expect(Date.now() - started).toBeGreaterThanOrEqual(200);
      expect(result.outcomes).toEqual(['APPLIED']);
      expect(charge.status).toBe('PAID');
    });

    it('delivers a webhook already queued first and unmodified, so the options touch only this event', async () => {
      const { tenantId } = await seed();
      await fake.ensureCustomer(tenantId, IDENTITY);
      await fake.createCharge({
        merchantProfileKey: 'BRL_FAKE',
        providerCustomerId: (await fake.ensureCustomer(tenantId, IDENTITY)).providerCustomerId,
        dueDate: addDaysUTC(todayInTimezone(ZONE, NOW), 9),
        lines: [{ description: 'Other', amountMinor: 4900 }],
        currency: 'BRL',
        taxBehavior: 'INCLUSIVE',
        customerLocation: { countryCode: 'BR' },
        description: 'Other',
        externalReference: uuidv7(),
        returnUrl: 'https://app.example.test/billing',
      }); // queues a PAYMENT_CREATED nobody drained

      const result = await simulate({ tenantId, event: 'PAID_PIX', delivery: 'DUPLICATE' });

      // one stale PAYMENT_CREATED (not duplicated), then the payment and its duplicate
      expect(result.outcomes).toHaveLength(3);
      expect(result.outcomes.slice(1)).toEqual(['APPLIED', 'DUPLICATE']);
    });
  });

  describe('failure', () => {
    it('makes the next provider call fail once: the delivery reports PROVIDER_ERROR, the payment is not applied, and the next call succeeds', async () => {
      const { tenantId, charge, providerChargeId } = await seed();

      const result = await simulate({ tenantId, event: 'PAID_PIX', failure: 'PROVIDER_5XX' });

      expect(result.outcomes).toEqual(['PROVIDER_ERROR']);
      expect(charge.status).toBe('PENDING');
      await expect(fake.fetchChargeStatus(providerChargeId)).resolves.toMatchObject({
        state: 'PAID',
      });
    });

    it.each(['LINK_EXPIRED', 'INVALID_LOCATION'] as const)(
      "%s is armed as the fake's own failure and consumed by the first provider call",
      async (failure) => {
        const { tenantId, charge, providerChargeId } = await seed();

        const result = await simulate({ tenantId, event: 'PAID_PIX', failure });

        expect(result.outcomes).toEqual(['PROVIDER_ERROR']);
        expect(charge.status).toBe('PENDING');
        await expect(fake.fetchChargeStatus(providerChargeId)).resolves.toBeDefined();
      },
    );

    it('a refused request arms no failure behind it', async () => {
      const { tenantId, providerChargeId } = await seed({ paid: true });

      const refusal = await refusalOf(
        simulate({ tenantId, event: 'PAID_PIX', failure: 'PROVIDER_5XX' }),
      );

      expect(refusal).toBe('NO_MATCHING_CHARGE');
      await expect(fake.fetchChargeStatus(providerChargeId)).resolves.toBeDefined();
    });
  });

  describe('a request that does not apply is a refusal and delivers nothing', () => {
    it('a tenant with no open charge', async () => {
      const { tenantId } = await seed({ paid: true });

      expect(await refusalOf(simulate({ tenantId, event: 'PAID_PIX' }))).toBe('NO_MATCHING_CHARGE');
    });

    it('a tenant with no paid charge for a refund or a chargeback', async () => {
      const { tenantId } = await seed();

      expect(await refusalOf(simulate({ tenantId, event: 'REFUND_FULL' }))).toBe(
        'NO_MATCHING_CHARGE',
      );
      expect(await refusalOf(simulate({ tenantId, event: 'CHARGEBACK_LOST' }))).toBe(
        'NO_MATCHING_CHARGE',
      );
    });

    it('finds the latest paid charge behind more than a page of newer unpaid ones', async () => {
      const { tenantId, charge } = await seed({ paid: true });
      for (let month = 1; month <= 51; month++) {
        await charges.save(
          new ChargeBuilder()
            .withTenantId(tenantId)
            .withSubscriptionId(charge.subscriptionId)
            .withPeriod(
              addDaysUTC('2026-04-10', month * 31),
              addDaysUTC('2026-04-10', month * 31 + 30),
            )
            .withDueDate(addDaysUTC('2026-04-10', month * 31))
            .withStatus('CANCELED')
            .build(),
        );
      }

      const result = await simulate({ tenantId, event: 'REFUND_FULL' });

      expect(result.chargeId).toBe(charge.id);
      expect(charge.status).toBe('REFUNDED');
    });

    it('a tenant with several open charges: the caller must name one', async () => {
      const { tenantId, charge } = await seed();
      const second = new ChargeBuilder()
        .withTenantId(tenantId)
        .withSubscriptionId(charge.subscriptionId)
        .withPeriod('2026-04-10', '2026-05-09')
        .withProviderReady('ASAAS', 'pay_fake_other')
        .build();
      await charges.save(second);

      expect(await refusalOf(simulate({ tenantId, event: 'PAID_PIX' }))).toBe('AMBIGUOUS_CHARGE');
    });

    it('a chargeId nothing knows', async () => {
      expect(await refusalOf(simulate({ chargeId: uuidv7(), event: 'PAID_PIX' }))).toBe(
        'CHARGE_NOT_FOUND',
      );
    });

    it('a paid event for a charge that is already paid', async () => {
      const { charge } = await seed({ paid: true });

      expect(await refusalOf(simulate({ chargeId: charge.id, event: 'PAID_PIX' }))).toBe(
        'CHARGE_STATE',
      );
    });

    it('a refund for a charge that is not paid, and an overdue for one that is', async () => {
      const open = await seed();
      const paid = await seed({ paid: true });

      expect(await refusalOf(simulate({ chargeId: open.charge.id, event: 'REFUND_FULL' }))).toBe(
        'CHARGE_STATE',
      );
      expect(await refusalOf(simulate({ chargeId: paid.charge.id, event: 'OVERDUE' }))).toBe(
        'CHARGE_STATE',
      );
    });

    it('a charge whose merchant profile is not a *_FAKE one', async () => {
      const { charge } = await seed({ merchantProfileKey: 'BRL_ASAAS_SANDBOX' });

      expect(await refusalOf(simulate({ chargeId: charge.id, event: 'PAID_PIX' }))).toBe(
        'NOT_FAKE_PROFILE',
      );
    });

    it('a charge the provider has not created yet', async () => {
      const { charge } = await seed({ readyAtProvider: false });

      expect(await refusalOf(simulate({ chargeId: charge.id, event: 'PAID_PIX' }))).toBe(
        'NO_PROVIDER_CHARGE',
      );
    });

    it("a charge this process's fake does not know (a restart or a second instance), with nothing delivered", async () => {
      const { charge } = await seed();
      fake.charges.clear(); // the process restarted: the database remembers, the fake does not

      expect(await refusalOf(simulate({ chargeId: charge.id, event: 'PAID_PIX' }))).toBe(
        'UNKNOWN_TO_FAKE',
      );
      expect(charge.status).toBe('PENDING');
      expect(outbox.published).toHaveLength(0);
    });

    it("a charge the database and the fake disagree on is the fake's own refusal: nothing queued, and no webhook already queued is delivered", async () => {
      const { charge, providerChargeId } = await seed();
      fake.simulatePayment(providerChargeId, 'PIX'); // the fake paid it; the webhook was never applied

      expect(await refusalOf(simulate({ chargeId: charge.id, event: 'PAID_PIX' }))).toBe(
        'CHARGE_STATE',
      );
      expect(charge.status).toBe('PENDING');
      expect(outbox.published).toHaveLength(0);
      expect(fake.drainDeliveries()).toHaveLength(1); // still queued, never handed to the webhook
    });
  });

  describe('tenant isolation', () => {
    it("the tenant form never picks another tenant's charge", async () => {
      const a = await seed();
      const b = await seed();

      const result = await simulate({ tenantId: a.tenantId, event: 'PAID_PIX' });

      expect(result.chargeId).toBe(a.charge.id);
      expect(a.charge.status).toBe('PAID');
      expect(b.charge.status).toBe('PENDING');
    });

    it('a tenant with no charge of its own is refused even while another tenant has an open one', async () => {
      await seed();

      expect(await refusalOf(simulate({ tenantId: uuidv7(), event: 'PAID_PIX' }))).toBe(
        'NO_MATCHING_CHARGE',
      );
    });
  });
});

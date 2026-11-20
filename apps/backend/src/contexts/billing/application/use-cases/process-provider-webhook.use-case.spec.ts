import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
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
import { ProviderRequestError } from '../../domain/errors/billing-provider.errors';
import type { NormalizedChargeStatus } from '../../domain/provider-events';
import type { Charge } from '../../domain/charge.aggregate';
import type { Subscription } from '../../domain/subscription.aggregate';
import type { SubscriptionStatus, SuspensionReason } from '../../domain/subscription.types';
import { BillingProviderRegistry } from '../../infrastructure/providers/billing-provider.registry';
import { FakeBillingProvider } from '../../infrastructure/providers/fake-billing.provider';
import type { FakeWebhookDelivery } from '../../infrastructure/providers/fake-billing.types';
import { ApplyChargeFactService } from '../services/apply-charge-fact.service';
import type {
  CreateProviderChargeCommand,
  ProviderChargeCreationResult,
} from '../services/provider-charge-creation.service';
import { RecoveryChargePlanner } from '../services/recovery-charge-planner.service';
import {
  ProcessProviderWebhookUseCase,
  type ProcessProviderWebhookUseCaseResult,
} from './process-provider-webhook.use-case';

// São Paulo is UTC-3 with no DST: NOW is 12:00 local on 2026-03-10.
const NOW = new Date('2026-03-10T15:00:00Z');
const ZONE = 'America/Sao_Paulo';
const EMAIL = 'billing@example.test';
const IDENTITY = { name: 'Lava Rápido', email: EMAIL, taxId: '11222333000181', countryCode: 'BR' };
const startOfLocalDay = (day: string): Date => new Date(`${day}T03:00:00Z`);
const endOfLocalDay = (day: string): Date => {
  const next = new Date(`${day}T03:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return new Date(next.getTime() - 1);
};

// Counts the provider re-reads: a replayed delivery must cost none.
class CountingFakeProvider extends FakeBillingProvider {
  rereads = 0;
  override async fetchChargeStatus(providerChargeId: string): Promise<NormalizedChargeStatus> {
    this.rereads += 1;
    return super.fetchChargeStatus(providerChargeId);
  }
}

interface Seeded {
  subscription: Subscription;
  charge: Charge;
  providerChargeId: string;
  providerCustomerId: string;
}

// What the after-commit step asked the shared creation service to make payable, and an error it can be told to raise.
const createdAtProvider: CreateProviderChargeCommand[] = [];
let creationError: Error | null = null;
const recordCreation = async (
  command: CreateProviderChargeCommand,
): Promise<ProviderChargeCreationResult> => {
  createdAtProvider.push(command);
  if (creationError !== null) throw creationError;
  return 'READY';
};

describe('ProcessProviderWebhookUseCase', () => {
  let clock: AdvanceableClock;
  let fake: CountingFakeProvider;
  let outbox: InMemoryOutboxPublisher;
  let subscriptions: InMemorySubscriptionRepository;
  let accounts: InMemoryBillingAccountRepository;
  let charges: InMemoryChargeRepository;
  let providerEvents: InMemoryProviderEventRepository;
  let useCase: ProcessProviderWebhookUseCase;

  beforeEach(() => {
    createdAtProvider.length = 0;
    creationError = null;
    clock = new AdvanceableClock(NOW);
    fake = new CountingFakeProvider(clock);
    const txManager = new InMemoryTransactionManager();
    outbox = new InMemoryOutboxPublisher(txManager);
    subscriptions = new InMemorySubscriptionRepository(outbox);
    accounts = new InMemoryBillingAccountRepository();
    charges = new InMemoryChargeRepository(outbox);
    providerEvents = new InMemoryProviderEventRepository();
    const prices = new InMemoryFeaturePriceRepository();
    prices.seed(
      new FeaturePriceBuilder()
        .withVersions([new FeaturePriceVersionBuilder().withAmountMinor(4900).build()])
        .build(),
    );
    const applyFact = new ApplyChargeFactService(
      subscriptions,
      charges,
      providerEvents,
      new RecoveryChargePlanner(charges, prices),
      txManager,
      clock,
    );
    useCase = new ProcessProviderWebhookUseCase(
      new BillingProviderRegistry('local', fake),
      { appEnv: 'local', platformOwnerSlug: null },
      accounts,
      subscriptions,
      charges,
      providerEvents,
      applyFact,
      { execute: recordCreation },
      clock,
    );
  });

  interface SeedOptions {
    kind?: 'PERIOD' | 'RECOVERY';
    localAmountMinor?: number;
    storeCustomer?: boolean;
    readyAtProvider?: boolean;
    suspension?: SuspensionReason;
    period?: [Date, Date];
  }

  /** A tenant with a subscription, a billing account at the provider and a charge both sides know. */
  async function seed(status: SubscriptionStatus, options: SeedOptions = {}): Promise<Seeded> {
    const [periodStart, periodEnd] = options.period ?? [
      startOfLocalDay('2026-02-10'),
      endOfLocalDay('2026-03-09'),
    ];
    const subscriptionBuilder = new SubscriptionBuilder()
      .withStatus(status)
      .withCurrentPeriod(periodStart, periodEnd)
      .withItems([
        new SubscriptionItemBuilder().withStartsAt(new Date('2026-02-10T03:00:00Z')).build(),
      ]);
    if (options.suspension) {
      subscriptionBuilder.withSuspension(options.suspension, new Date('2026-03-01T03:00:00Z'));
    }
    const subscription = subscriptionBuilder.build();
    await subscriptions.save(subscription);
    const { providerCustomerId } = await fake.ensureCustomer(subscription.tenantId, IDENTITY);
    await accounts.save(
      new BillingAccountBuilder()
        .withTenantId(subscription.tenantId)
        .withBillingEmail(EMAIL)
        .withProvider(
          options.storeCustomer === false ? null : 'ASAAS',
          options.storeCustomer === false ? null : providerCustomerId,
        )
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
      .withLines([
        new ChargeLineBuilder().withUnitPriceMinor(options.localAmountMinor ?? 4900).build(),
      ]);
    if (options.kind === 'RECOVERY') builder.asRecovery();
    else builder.withPeriod('2026-03-10', '2026-04-09');
    if (options.readyAtProvider !== false) {
      builder.withProviderReady('ASAAS', created.providerChargeId);
    }
    const charge = builder.build();
    await charges.save(charge);
    fake.drainDeliveries(); // the PAYMENT_CREATED the creation queued
    outbox.published.length = 0;
    return { subscription, charge, providerChargeId: created.providerChargeId, providerCustomerId };
  }

  const deliver = (delivery: FakeWebhookDelivery): Promise<ProcessProviderWebhookUseCaseResult> =>
    useCase.execute({
      provider: 'ASAAS',
      rawBody: delivery.body,
      headers: delivery.headers,
      correlationId: 'corr-webhook',
    });
  const deliverAll = async (
    options?: Parameters<FakeBillingProvider['drainDeliveries']>[0],
  ): Promise<ProcessProviderWebhookUseCaseResult[]> => {
    const results: ProcessProviderWebhookUseCaseResult[] = [];
    for (const delivery of fake.drainDeliveries(options)) results.push(await deliver(delivery));
    return results;
  };
  const eventNames = (): string[] => outbox.published.map((event) => event.eventName);

  describe('the paid signal by payment method', () => {
    it('Pix (RECEIVED only): the charge is paid and a PAST_DUE tenant is back to ACTIVE, once', async () => {
      const { charge, subscription, providerChargeId } = await seed('PAST_DUE');
      fake.simulatePayment(providerChargeId, 'PIX');

      expect(await deliverAll()).toEqual(['APPLIED']);

      expect(charge.status).toBe('PAID');
      expect(charge.method).toBe('PIX');
      expect(subscription.status).toBe('ACTIVE');
      expect(eventNames()).toEqual(['ChargePaid']);
    });

    it('boleto (CONFIRMED then RECEIVED): the first yields the single payment, the later is a no-op', async () => {
      const { charge, providerChargeId } = await seed('ACTIVE');
      fake.simulatePayment(providerChargeId, 'BOLETO');

      expect(await deliverAll()).toEqual(['APPLIED', 'NO_CHANGE']);

      expect(charge.status).toBe('PAID');
      expect(eventNames()).toEqual(['ChargePaid']);
    });

    it('card (CONFIRMED, RECEIVED about 32 days later): one payment, the settlement is a no-op', async () => {
      const { charge, providerChargeId } = await seed('ACTIVE');
      fake.simulatePayment(providerChargeId, 'CARD');
      expect(await deliverAll()).toEqual(['APPLIED']);
      fake.simulateCardSettlement(providerChargeId);

      expect(await deliverAll()).toEqual(['NO_CHANGE']);

      expect(charge.method).toBe('CARD');
      expect(eventNames()).toEqual(['ChargePaid']);
    });

    it('whichever of CONFIRMED / RECEIVED arrives first wins (reverse order)', async () => {
      const { charge, providerChargeId } = await seed('ACTIVE');
      fake.simulatePayment(providerChargeId, 'BOLETO');

      expect(await deliverAll({ reverse: true })).toEqual(['APPLIED', 'NO_CHANGE']);

      expect(charge.status).toBe('PAID');
      expect(eventNames()).toEqual(['ChargePaid']);
    });

    it('stores the re-read receipt URL and carries it, with the billing email, on ChargePaid', async () => {
      const { charge, providerChargeId } = await seed('ACTIVE');
      fake.simulatePayment(providerChargeId, 'PIX');

      await deliverAll();

      expect(charge.receiptUrl).toMatch(/^https:\/\/fake-billing\.invalid\//);
      expect(outbox.published[0].data).toMatchObject({
        receiptUrl: charge.receiptUrl,
        recipientEmail: EMAIL,
      });
    });

    it('reactivates a SUSPENDED tenant when its recovery charge is paid, with no human action', async () => {
      const { subscription, charge, providerChargeId } = await seed('SUSPENDED', {
        kind: 'RECOVERY',
        suspension: 'NON_PAYMENT',
      });
      fake.simulatePayment(providerChargeId, 'BOLETO');

      expect(await deliverAll()).toEqual(['APPLIED', 'NO_CHANGE']);

      expect(charge.status).toBe('PAID');
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.anchorDay).toBe(10);
      expect(eventNames()).toEqual(['ChargePaid', 'SubscriptionReactivated']);
    });
  });

  describe('a refund delivered before its payment', () => {
    it('never applies the payment afterwards: the re-read says refunded, so the tenant is not reactivated', async () => {
      const { charge, subscription, providerChargeId } = await seed('PAST_DUE');
      fake.simulatePayment(providerChargeId, 'CARD');
      fake.simulateRefund(providerChargeId, 'FULL');

      // Reversed: the REFUNDED delivery reaches us first, the CONFIRMED one second.
      expect(await deliverAll({ reverse: true })).toEqual(['ILLEGAL', 'NOT_CONFIRMED']);

      expect(charge.status).toBe('PENDING');
      expect(subscription.status).toBe('PAST_DUE');
      expect(outbox.published).toEqual([]);
    });
  });

  describe('delivery guarantees', () => {
    it('a duplicate delivery is a no-op with no second provider re-read', async () => {
      const { providerChargeId } = await seed('PAST_DUE');
      fake.simulatePayment(providerChargeId, 'PIX');
      const [delivery] = fake.drainDeliveries();
      expect(await deliver(delivery)).toBe('APPLIED');
      const rereadsAfterFirst = fake.rereads;
      outbox.published.length = 0;

      expect(await deliver(delivery)).toBe('DUPLICATE');

      expect(fake.rereads).toBe(rereadsAfterFirst);
      expect(outbox.published).toEqual([]);
      expect(providerEvents.saved).toHaveLength(1);
    });

    it('a provider that duplicates every delivery still applies the payment once', async () => {
      const { charge, providerChargeId } = await seed('PAST_DUE');
      fake.simulatePayment(providerChargeId, 'PIX');

      expect(await deliverAll({ duplicate: true })).toEqual(['APPLIED', 'DUPLICATE']);

      expect(charge.status).toBe('PAID');
      expect(eventNames()).toEqual(['ChargePaid']);
    });

    it('a provider failure on the re-read throws (non-2xx, the provider retries) and stores nothing', async () => {
      const { charge, providerChargeId } = await seed('PAST_DUE');
      fake.simulatePayment(providerChargeId, 'PIX');
      const [delivery] = fake.drainDeliveries();
      fake.failNextCall('UNAVAILABLE');

      await expect(deliver(delivery)).rejects.toBeInstanceOf(ProviderRequestError);
      expect(charge.status).toBe('PENDING');
      expect(providerEvents.saved).toEqual([]);

      expect(await deliver(delivery)).toBe('APPLIED');
      expect(charge.status).toBe('PAID');
    });
  });

  describe('what is never trusted or applied', () => {
    const forgedPaid = (providerChargeId: string, customer: string, reference: string): string =>
      JSON.stringify({
        id: 'evt_forged&1',
        event: 'PAYMENT_RECEIVED',
        dateCreated: '2026-03-10 12:00:00',
        payment: {
          id: providerChargeId,
          customer,
          value: 49,
          billingType: 'PIX',
          externalReference: reference,
        },
      });
    const run = (rawBody: string): Promise<ProcessProviderWebhookUseCaseResult> =>
      useCase.execute({ provider: 'ASAAS', rawBody, headers: {}, correlationId: 'c' });

    it('an event the re-read does not confirm leaves no inbox row, so the same event id is applied when delivered again once the provider confirms it', async () => {
      const { charge, subscription, providerChargeId, providerCustomerId } = await seed('PAST_DUE');
      const early = forgedPaid(providerChargeId, providerCustomerId, charge.id);

      expect(await run(early)).toBe('NOT_CONFIRMED');
      expect(providerEvents.saved).toEqual([]);

      fake.simulatePayment(providerChargeId, 'PIX');
      expect(await run(early)).toBe('APPLIED');

      expect(charge.status).toBe('PAID');
      expect(subscription.status).toBe('ACTIVE');
      expect(providerEvents.saved).toHaveLength(1);
    });

    it('a forged paid event for a charge the provider says is unpaid is not applied', async () => {
      const { charge, providerChargeId, providerCustomerId } = await seed('PAST_DUE');

      const result = await run(forgedPaid(providerChargeId, providerCustomerId, charge.id));

      expect(result).toBe('NOT_CONFIRMED');
      expect(charge.status).toBe('PENDING');
      expect(providerEvents.saved).toEqual([]);
      expect(outbox.published).toEqual([]);
    });

    it("an amount that differs from the local charge's is not applied, whatever the webhook says", async () => {
      const { charge, providerChargeId } = await seed('PAST_DUE', { localAmountMinor: 5900 });
      fake.simulatePayment(providerChargeId, 'PIX');

      expect(await deliverAll()).toEqual(['NOT_CONFIRMED']);

      expect(charge.status).toBe('PENDING');
      expect(providerEvents.saved).toEqual([]);
    });

    it('an event type Ikaro does not act on is acknowledged and stores nothing', async () => {
      await seed('ACTIVE');
      const body = JSON.stringify({
        id: 'evt_x&1',
        event: 'PAYMENT_CHECKOUT_VIEWED',
        dateCreated: '2026-03-10 12:00:00',
        payment: { id: 'pay_x', value: 49 },
      });

      expect(await run(body)).toBe('IGNORED');
      expect(providerEvents.saved).toEqual([]);
    });

    it('an unknown customer AND an unknown external reference is acknowledged with no state change', async () => {
      const { charge } = await seed('PAST_DUE');

      const result = await run(forgedPaid('pay_unknown', 'cus_unknown', uuidv7()));

      expect(result).toBe('UNKNOWN_TARGET');
      expect(charge.status).toBe('PENDING');
      expect(providerEvents.saved).toEqual([]);
    });

    it('a malformed body is acknowledged, logged and stores nothing', async () => {
      await seed('ACTIVE');

      expect(await run('not json')).toBe('MALFORMED');
      expect(providerEvents.saved).toEqual([]);
    });

    it('an event for a provider charge id other than the one stored on the charge is not applied', async () => {
      const { charge, providerCustomerId } = await seed('PAST_DUE');

      const result = await run(forgedPaid('pay_other', providerCustomerId, charge.id));

      expect(result).toBe('UNKNOWN_TARGET');
      expect(charge.status).toBe('PENDING');
    });
  });

  describe('resolving the tenant', () => {
    it('a webhook that outruns the customer save and the READY write is resolved through the external reference and applied', async () => {
      const { charge, subscription, providerChargeId } = await seed('PAST_DUE', {
        storeCustomer: false,
        readyAtProvider: false,
      });
      fake.simulatePayment(providerChargeId, 'PIX');

      expect(await deliverAll()).toEqual(['APPLIED']);

      expect(charge.status).toBe('PAID');
      expect(subscription.status).toBe('ACTIVE');
      expect(providerEvents.saved[0].tenantId).toBe(subscription.tenantId);
    });

    it('a charge reference that belongs to another tenant than the provider customer is never applied', async () => {
      const victim = await seed('PAST_DUE');
      const attacker = await seed('PAST_DUE');
      fake.simulatePayment(attacker.providerChargeId, 'PIX');
      const [delivery] = fake.drainDeliveries();
      const original = JSON.parse(delivery.body);
      // The attacker's customer id, but the reference of the victim's charge.
      const crossed = JSON.stringify({
        ...original,
        payment: {
          ...original.payment,
          id: 'pay_does_not_exist',
          externalReference: victim.charge.id,
        },
      });

      const result = await useCase.execute({
        provider: 'ASAAS',
        rawBody: crossed,
        headers: {},
        correlationId: 'c',
      });

      expect(result).toBe('UNKNOWN_TARGET');
      expect(victim.charge.status).toBe('PENDING');
      expect(attacker.charge.status).toBe('PENDING');
    });

    it('an unbound local charge is applied only when the provider re-read holds the same reference: a real payment of another charge is never bound to it', async () => {
      const victim = await seed('PAST_DUE', { storeCustomer: false, readyAtProvider: false });
      const other = await seed('PAST_DUE');
      fake.simulatePayment(other.providerChargeId, 'PIX');
      const [delivery] = fake.drainDeliveries();
      const original = JSON.parse(delivery.body);
      // A real paid provider charge (the other one), claiming the victim's local charge as its reference.
      const spoofed = JSON.stringify({
        ...original,
        payment: {
          ...original.payment,
          customer: 'cus_unknown',
          externalReference: victim.charge.id,
        },
      });

      const result = await useCase.execute({
        provider: 'ASAAS',
        rawBody: spoofed,
        headers: {},
        correlationId: 'c',
      });

      expect(result).toBe('NOT_CONFIRMED');
      expect(victim.charge.status).toBe('PENDING');
      expect(victim.charge.providerChargeId).toBeNull();
    });

    it('two tenants with the same amount and due date are not confused: paying A never touches B', async () => {
      const a = await seed('PAST_DUE');
      const b = await seed('PAST_DUE');
      fake.simulatePayment(a.providerChargeId, 'PIX');

      await deliverAll();

      expect(a.charge.status).toBe('PAID');
      expect(a.subscription.status).toBe('ACTIVE');
      expect(b.charge.status).toBe('PENDING');
      expect(b.subscription.status).toBe('PAST_DUE');
    });
  });

  describe('events that change no state', () => {
    it('PaymentOverdue is confirm-only: it records the inbox row and never moves a charge or sets past_due_since', async () => {
      const { charge, subscription, providerChargeId } = await seed('ACTIVE');
      fake.simulateOverdue(providerChargeId);

      expect(await deliverAll()).toEqual(['RECORDED']);

      expect(charge.status).toBe('PENDING');
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.pastDueSince).toBeNull();
      expect(providerEvents.saved.map((row) => row.eventType)).toEqual(['PaymentOverdue']);
    });

    it('a partial refund changes no access and no charge', async () => {
      const { charge, subscription, providerChargeId } = await seed('ACTIVE');
      fake.simulatePayment(providerChargeId, 'CARD');
      await deliverAll();
      outbox.published.length = 0;
      fake.simulateRefund(providerChargeId, 'PARTIAL');

      expect(await deliverAll()).toEqual(['RECORDED']);

      expect(charge.status).toBe('PAID');
      expect(charge.refunded.amountMinor).toBe(0);
      expect(subscription.status).toBe('ACTIVE');
      expect(outbox.published).toEqual([]);
    });

    it('an opened dispute changes no access and only logs billing_dispute_opened', async () => {
      const warn = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation(() => undefined);
      const { charge, subscription, providerChargeId } = await seed('ACTIVE');
      fake.simulatePayment(providerChargeId, 'CARD');
      await deliverAll();
      outbox.published.length = 0;
      fake.simulateDisputeOpened(providerChargeId);

      expect(await deliverAll()).toEqual(['RECORDED']);

      expect(charge.status).toBe('PAID');
      expect(subscription.status).toBe('ACTIVE');
      expect(outbox.published).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        'billing_dispute_opened',
        expect.objectContaining({ billing_dispute_opened: true, providerChargeId }),
      );
      warn.mockRestore();
    });

    it('a provider cancel is acknowledged with no state change', async () => {
      const { charge, providerChargeId } = await seed('ACTIVE');
      await fake.cancelCharge(providerChargeId);

      expect(await deliverAll()).toEqual(['RECORDED']);

      expect(charge.status).toBe('PENDING');
    });
  });

  describe('a refund or a lost chargeback of the current period', () => {
    const currentPeriod: [Date, Date] = [
      startOfLocalDay('2026-03-10'),
      endOfLocalDay('2026-04-09'),
    ];

    it('a full refund suspends with PAYMENT_REVERSED and leaves the recovery charge PENDING', async () => {
      const { charge, subscription, providerChargeId } = await seed('ACTIVE', {
        period: currentPeriod,
      });
      fake.simulatePayment(providerChargeId, 'CARD');
      await deliverAll();
      outbox.published.length = 0;
      fake.simulateRefund(providerChargeId, 'FULL');

      expect(await deliverAll()).toEqual(['APPLIED']);

      expect(charge.status).toBe('REFUNDED');
      expect(subscription.status).toBe('SUSPENDED');
      expect(subscription.suspensionReason).toBe('PAYMENT_REVERSED');
      expect(
        await charges.findOpenRecoveryBySubscription(subscription.tenantId, subscription.id),
      ).toMatchObject({ kind: 'RECOVERY', status: 'PENDING' });
      expect(eventNames()).toEqual(['SubscriptionSuspended']);
    });

    it('after commit, makes the recovery charge payable at the provider through the shared creation step', async () => {
      const { subscription, providerChargeId } = await seed('ACTIVE', { period: currentPeriod });
      fake.simulatePayment(providerChargeId, 'CARD');
      await deliverAll();
      fake.simulateRefund(providerChargeId, 'FULL');

      await deliverAll();

      const recovery = await charges.findOpenRecoveryBySubscription(
        subscription.tenantId,
        subscription.id,
      );
      expect(createdAtProvider).toEqual([
        {
          tenantId: subscription.tenantId,
          chargeId: recovery!.id,
          correlationId: expect.any(String),
        },
      ]);
    });

    it('never fails the webhook when the creation step throws: the charge stays PENDING for the retry', async () => {
      const { subscription, providerChargeId } = await seed('ACTIVE', { period: currentPeriod });
      fake.simulatePayment(providerChargeId, 'CARD');
      await deliverAll();
      fake.simulateRefund(providerChargeId, 'FULL');
      creationError = new Error('database unavailable');

      expect(await deliverAll()).toEqual(['APPLIED']);

      expect(
        await charges.findOpenRecoveryBySubscription(subscription.tenantId, subscription.id),
      ).toMatchObject({ status: 'PENDING', providerCreationStatus: 'PENDING' });
    });

    it('creates nothing at the provider when no reversal suspended the tenant', async () => {
      const { providerChargeId } = await seed('TRIALING', { period: currentPeriod });
      fake.simulatePayment(providerChargeId, 'CARD');
      await deliverAll();
      fake.simulateRefund(providerChargeId, 'FULL');

      await deliverAll();

      expect(createdAtProvider).toEqual([]);
    });

    it('a lost chargeback (driven by the fake only) does the same', async () => {
      const { charge, subscription, providerChargeId } = await seed('ACTIVE', {
        period: currentPeriod,
      });
      fake.simulatePayment(providerChargeId, 'CARD');
      await deliverAll();
      fake.simulateChargeback(providerChargeId);

      expect(await deliverAll()).toEqual(['APPLIED']);

      expect(charge.status).toBe('CHARGEBACK');
      expect(subscription.suspensionReason).toBe('PAYMENT_REVERSED');
    });

    it('a full refund of the first invoice while TRIALING never suspends', async () => {
      const { charge, subscription, providerChargeId } = await seed('TRIALING', {
        period: currentPeriod,
      });
      fake.simulatePayment(providerChargeId, 'CARD');
      await deliverAll();
      fake.simulateRefund(providerChargeId, 'FULL');

      expect(await deliverAll()).toEqual(['APPLIED']);

      expect(charge.status).toBe('REFUNDED');
      expect(subscription.status).toBe('TRIALING');
    });
  });
});

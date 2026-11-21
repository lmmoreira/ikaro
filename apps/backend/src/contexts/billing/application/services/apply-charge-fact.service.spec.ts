import {
  ChargeBuilder,
  FeaturePriceBuilder,
  FeaturePriceVersionBuilder,
  ProviderEventBuilder,
  SubscriptionBuilder,
  SubscriptionItemBuilder,
} from '../../../../test/builders/billing';
import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryChargeRepository } from '../../../../test/repositories/billing/in-memory-charge.repository';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import { InMemoryProviderEventRepository } from '../../../../test/repositories/billing/in-memory-provider-event.repository';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import type { Charge } from '../../domain/charge.aggregate';
import type { Subscription } from '../../domain/subscription.aggregate';
import type { SuspensionReason } from '../../domain/subscription.types';
import type { ChargeFact } from '../helpers/charge-fact';
import { ApplyChargeFactService } from './apply-charge-fact.service';
import { RecoveryChargePlanner } from './recovery-charge-planner.service';

// São Paulo is UTC-3 with no DST: NOW is 12:00 local on 2026-03-10.
const NOW = new Date('2026-03-10T15:00:00Z');
const EMAIL = 'billing@example.test';
const PAID: ChargeFact = {
  type: 'PAID',
  method: 'PIX',
  paidAt: new Date('2026-03-10T14:55:00Z'),
  receiptUrl: 'https://receipt.example.test/1',
};
const REFUNDED: ChargeFact = { type: 'REFUNDED' };
const CHARGEBACK: ChargeFact = { type: 'CHARGEBACK' };
const startOfLocalDay = (day: string): Date => new Date(`${day}T03:00:00Z`);
const endOfLocalDay = (day: string): Date => {
  const next = new Date(`${day}T03:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return new Date(next.getTime() - 1);
};

// Records the order of the two row locks (B-R1 then B-C1).
const lockOrder: string[] = [];
class RecordingSubscriptions extends InMemorySubscriptionRepository {
  override async findByTenantIdForUpdate(tenantId: string): Promise<Subscription | null> {
    lockOrder.push('B-R1');
    return super.findByTenantIdForUpdate(tenantId);
  }
}
class RecordingCharges extends InMemoryChargeRepository {
  override async findByIdForUpdate(tenantId: string, id: string): Promise<Charge | null> {
    lockOrder.push('B-C1');
    return super.findByIdForUpdate(tenantId, id);
  }
}

describe('ApplyChargeFactService', () => {
  let outbox: InMemoryOutboxPublisher;
  let subscriptions: RecordingSubscriptions;
  let charges: RecordingCharges;
  let providerEvents: InMemoryProviderEventRepository;
  let useCase: ApplyChargeFactService;

  beforeEach(() => {
    lockOrder.length = 0;
    const txManager = new InMemoryTransactionManager();
    outbox = new InMemoryOutboxPublisher(txManager);
    subscriptions = new RecordingSubscriptions(outbox);
    charges = new RecordingCharges(outbox);
    providerEvents = new InMemoryProviderEventRepository();
    const prices = new InMemoryFeaturePriceRepository();
    prices.seed(
      new FeaturePriceBuilder()
        .withVersions([new FeaturePriceVersionBuilder().withAmountMinor(4900).build()])
        .build(),
    );
    useCase = new ApplyChargeFactService(
      subscriptions,
      charges,
      providerEvents,
      new RecoveryChargePlanner(charges, prices),
      txManager,
      new AdvanceableClock(NOW),
    );
  });

  const subscriptionOf = (builder: SubscriptionBuilder): Promise<Subscription> => {
    const subscription = builder
      .withItems([
        new SubscriptionItemBuilder().withStartsAt(new Date('2026-02-10T03:00:00Z')).build(),
      ])
      .build();
    return subscriptions.save(subscription).then(() => subscription);
  };
  const periodCharge = async (subscription: Subscription, start: string, end: string) => {
    const charge = new ChargeBuilder()
      .withTenantId(subscription.tenantId)
      .withSubscriptionId(subscription.id)
      .withPeriod(start, end)
      .build();
    await charges.save(charge);
    return charge;
  };
  const apply = (
    subscription: Subscription,
    charge: Charge,
    fact: ChargeFact,
    inbox?: ReturnType<ProviderEventBuilder['build']>,
  ) =>
    useCase.execute({
      tenantId: subscription.tenantId,
      chargeId: charge.id,
      fact,
      recipientEmail: EMAIL,
      correlationId: 'corr-webhook',
      inbox,
    });
  const eventNames = (): string[] => outbox.published.map((event) => event.eventName);

  describe('a paid fact', () => {
    it('PERIOD charge, TRIALING: the charge is paid and hasEverPaid is set; the subscription stays TRIALING with no period', async () => {
      const subscription = await subscriptionOf(new SubscriptionBuilder().withStatus('TRIALING'));
      const charge = await periodCharge(subscription, '2026-03-24', '2026-04-23');

      expect(await apply(subscription, charge, PAID)).toBe('APPLIED');

      expect(charge.status).toBe('PAID');
      expect(subscription.status).toBe('TRIALING');
      expect(subscription.hasEverPaid).toBe(true);
      expect(subscription.currentPeriodEnd).toBeNull();
      expect(eventNames()).toEqual(['ChargePaid']);
    });

    it('PERIOD charge, ACTIVE: markPeriodPaid moves the period and never touches anchor_day or next_due_date', async () => {
      const subscription = await subscriptionOf(
        new SubscriptionBuilder()
          .withStatus('ACTIVE')
          .withCurrentPeriod(startOfLocalDay('2026-02-10'), endOfLocalDay('2026-03-09'))
          .withNextDueDate('2026-04-10'),
      );
      const anchorDay = subscription.anchorDay;
      const charge = await periodCharge(subscription, '2026-03-10', '2026-04-09');

      await apply(subscription, charge, PAID);

      expect(subscription.currentPeriodStart).toEqual(startOfLocalDay('2026-03-10'));
      expect(subscription.currentPeriodEnd).toEqual(endOfLocalDay('2026-04-09'));
      expect(subscription.anchorDay).toBe(anchorDay);
      expect(subscription.nextDueDate?.value).toBe('2026-04-10');
    });

    it('PERIOD charge, PAST_DUE: the subscription becomes ACTIVE with the overdue marks cleared and the charge own period', async () => {
      const subscription = await subscriptionOf(
        new SubscriptionBuilder()
          .withStatus('PAST_DUE')
          .withPastDueSince(new Date('2026-03-10T03:00:00Z'))
          .withGraceUntil(new Date('2026-03-24T03:00:00Z')),
      );
      const charge = await periodCharge(subscription, '2026-03-10', '2026-04-09');

      await apply(subscription, charge, PAID);

      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.pastDueSince).toBeNull();
      expect(subscription.graceUntil).toBeNull();
      expect(subscription.currentPeriodEnd).toEqual(endOfLocalDay('2026-04-09'));
    });

    it.each(['NON_PAYMENT', 'CANCELED', 'PAYMENT_REVERSED'] as SuspensionReason[])(
      'RECOVERY charge, SUSPENDED (%s): reactivateOnPayment starts a new month, anchored on the payment day',
      async (reason) => {
        const subscription = await subscriptionOf(
          new SubscriptionBuilder()
            .withStatus('SUSPENDED')
            .withSuspension(reason, new Date('2026-03-01T03:00:00Z')),
        );
        const recovery = new ChargeBuilder()
          .withTenantId(subscription.tenantId)
          .withSubscriptionId(subscription.id)
          .asRecovery()
          .build();
        await charges.save(recovery);

        await apply(subscription, recovery, PAID);

        expect(subscription.status).toBe('ACTIVE');
        expect(subscription.currentPeriodStart).toEqual(PAID.type === 'PAID' ? PAID.paidAt : null);
        expect(subscription.anchorDay).toBe(10);
        expect(subscription.nextDueDate?.value).toBe('2026-04-10');
        expect(recovery.periodStart).toBeNull();
        expect(eventNames()).toEqual(['ChargePaid', 'SubscriptionReactivated']);
        expect(outbox.published[1].data).toMatchObject({ recipientEmail: EMAIL });
      },
    );

    it('an OPERATOR suspension is never lifted by a payment', async () => {
      const subscription = await subscriptionOf(
        new SubscriptionBuilder()
          .withStatus('SUSPENDED')
          .withSuspension('OPERATOR', new Date('2026-03-01T03:00:00Z')),
      );
      const recovery = new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .asRecovery()
        .build();
      await charges.save(recovery);

      await apply(subscription, recovery, PAID);

      expect(recovery.status).toBe('PAID');
      expect(subscription.status).toBe('SUSPENDED');
      expect(subscription.suspensionReason).toBe('OPERATOR');
      expect(eventNames()).toEqual(['ChargePaid']);
    });

    it('a stale charge the provider could not cancel because it was paid IS the payment: the open recovery charge is cancelled', async () => {
      const subscription = await subscriptionOf(
        new SubscriptionBuilder()
          .withStatus('SUSPENDED')
          .withSuspension('NON_PAYMENT', new Date('2026-03-01T03:00:00Z')),
      );
      const stale = await periodCharge(subscription, '2026-02-10', '2026-03-09');
      const recovery = new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .asRecovery()
        .withProviderReady('ASAAS', 'pay_recovery', 'https://pay.example.test/r')
        .build();
      await charges.save(recovery);

      await apply(subscription, stale, PAID);

      expect(stale.status).toBe('PAID');
      expect(subscription.status).toBe('ACTIVE');
      expect(recovery.status).toBe('CANCELED');
      expect(recovery.providerCancelPending).toBe(true);
    });

    it('if both the stale and the recovery charge are ever paid, the second is recorded REFUNDED', async () => {
      const subscription = await subscriptionOf(
        new SubscriptionBuilder()
          .withStatus('ACTIVE')
          .withCurrentPeriod(startOfLocalDay('2026-03-10'), endOfLocalDay('2026-04-09')),
      );
      const recovery = new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .asRecovery()
        .build();
      await charges.save(recovery);

      await apply(subscription, recovery, PAID);

      expect(recovery.status).toBe('REFUNDED');
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.currentPeriodStart).toEqual(startOfLocalDay('2026-03-10'));
    });

    it('a stale PERIOD charge paid after the recovery payment began a newer month is the second payment: recorded REFUNDED, the period untouched', async () => {
      const subscription = await subscriptionOf(
        new SubscriptionBuilder()
          .withStatus('SUSPENDED')
          .withSuspension('NON_PAYMENT', new Date('2026-02-20T03:00:00Z')),
      );
      const recovery = new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .asRecovery()
        .build();
      const stale = await periodCharge(subscription, '2026-02-10', '2026-03-09');
      await charges.save(recovery);
      await apply(subscription, recovery, PAID);
      const startAfterRecovery = subscription.currentPeriodStart;
      const endAfterRecovery = subscription.currentPeriodEnd;

      await apply(subscription, stale, { ...PAID, paidAt: new Date('2026-03-10T16:00:00Z') });

      expect(stale.status).toBe('REFUNDED');
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.currentPeriodStart).toEqual(startAfterRecovery);
      expect(subscription.currentPeriodEnd).toEqual(endAfterRecovery);
      // The refund event of that second payment later changes nothing: no suspension.
      expect(await apply(subscription, stale, REFUNDED)).toBe('NO_CHANGE');
      expect(subscription.status).toBe('ACTIVE');
    });

    it('is idempotent: a second paid fact (CONFIRMED then RECEIVED) is a no-op with no second ChargePaid', async () => {
      const subscription = await subscriptionOf(new SubscriptionBuilder().withStatus('PAST_DUE'));
      const charge = await periodCharge(subscription, '2026-03-10', '2026-04-09');
      await apply(subscription, charge, PAID);
      outbox.published.length = 0;

      const second = await apply(subscription, charge, { ...PAID, method: 'CARD' });

      expect(second).toBe('NO_CHANGE');
      expect(charge.method).toBe('PIX');
      expect(outbox.published).toEqual([]);
    });

    it('applies a paid fact to a CANCELED charge (legal out-of-order: the provider says it was paid)', async () => {
      const subscription = await subscriptionOf(new SubscriptionBuilder().withStatus('PAST_DUE'));
      const charge = new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .withPeriod('2026-03-10', '2026-04-09')
        .withStatus('CANCELED')
        .build();
      await charges.save(charge);

      expect(await apply(subscription, charge, PAID)).toBe('APPLIED');

      expect(charge.status).toBe('PAID');
    });

    it.each(['REFUNDED', 'CHARGEBACK'] as const)(
      'a paid fact for a %s charge is illegal: logged, nothing changes, no event',
      async (status) => {
        const subscription = await subscriptionOf(new SubscriptionBuilder().withStatus('PAST_DUE'));
        const charge = new ChargeBuilder()
          .withTenantId(subscription.tenantId)
          .withSubscriptionId(subscription.id)
          .withPeriod('2026-03-10', '2026-04-09')
          .withStatus(status)
          .build();
        await charges.save(charge);

        expect(await apply(subscription, charge, PAID)).toBe('ILLEGAL');

        expect(charge.status).toBe(status);
        expect(subscription.status).toBe('PAST_DUE');
        expect(outbox.published).toEqual([]);
      },
    );
  });

  describe('a refund or a lost chargeback', () => {
    const currentPeriodActive = (): SubscriptionBuilder =>
      new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withHasEverPaid(true)
        .withCurrentPeriod(startOfLocalDay('2026-03-10'), endOfLocalDay('2026-04-09'));
    const paidCharge = async (subscription: Subscription, start: string, end: string) => {
      const charge = new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .withPeriod(start, end)
        .withPaid('PIX', new Date('2026-03-10T14:55:00Z'))
        .build();
      await charges.save(charge);
      return charge;
    };

    it.each([
      ['a full refund', REFUNDED, 'REFUNDED'],
      ['a lost chargeback', CHARGEBACK, 'CHARGEBACK'],
    ] as const)(
      '%s of the current period suspends with PAYMENT_REVERSED and inserts the RECOVERY charge PENDING in the same transaction',
      async (_label, fact, status) => {
        const subscription = await subscriptionOf(currentPeriodActive());
        const charge = await paidCharge(subscription, '2026-03-10', '2026-04-09');

        await apply(subscription, charge, fact);

        expect(charge.status).toBe(status);
        expect(subscription.status).toBe('SUSPENDED');
        expect(subscription.suspensionReason).toBe('PAYMENT_REVERSED');
        const recovery = await charges.findOpenRecoveryBySubscription(
          subscription.tenantId,
          subscription.id,
        );
        expect(recovery).toMatchObject({ kind: 'RECOVERY', status: 'PENDING' });
        expect(recovery?.amount.amountMinor).toBe(4900);
        expect(recovery?.providerCreationStatus).toBe('PENDING');
        expect(eventNames()).toEqual(['SubscriptionSuspended']);
      },
    );

    it('does not insert a second recovery charge when one is already open', async () => {
      const subscription = await subscriptionOf(currentPeriodActive());
      const charge = await paidCharge(subscription, '2026-03-10', '2026-04-09');
      const open = new ChargeBuilder()
        .withTenantId(subscription.tenantId)
        .withSubscriptionId(subscription.id)
        .asRecovery()
        .build();
      await charges.save(open);

      await apply(subscription, charge, REFUNDED);

      expect(charges.saved.filter((c) => c.kind === 'RECOVERY')).toHaveLength(1);
    });

    it('a refund of an older period records REFUNDED and changes no access', async () => {
      const subscription = await subscriptionOf(currentPeriodActive());
      const charge = await paidCharge(subscription, '2026-02-10', '2026-03-09');

      await apply(subscription, charge, REFUNDED);

      expect(charge.status).toBe('REFUNDED');
      expect(subscription.status).toBe('ACTIVE');
      expect(charges.saved.filter((c) => c.kind === 'RECOVERY')).toHaveLength(0);
      expect(outbox.published).toEqual([]);
    });

    it('a full refund of the first invoice while TRIALING is REFUNDED and never suspends', async () => {
      const subscription = await subscriptionOf(
        new SubscriptionBuilder().withStatus('TRIALING').withHasEverPaid(true),
      );
      const charge = await paidCharge(subscription, '2026-03-10', '2026-04-09');

      await apply(subscription, charge, REFUNDED);

      expect(charge.status).toBe('REFUNDED');
      expect(subscription.status).toBe('TRIALING');
      expect(outbox.published).toEqual([]);
    });

    it('a refund of a charge that was never paid is illegal and changes nothing', async () => {
      const subscription = await subscriptionOf(currentPeriodActive());
      const charge = await periodCharge(subscription, '2026-03-10', '2026-04-09');

      expect(await apply(subscription, charge, REFUNDED)).toBe('ILLEGAL');

      expect(charge.status).toBe('PENDING');
      expect(subscription.status).toBe('ACTIVE');
    });

    it('a repeated refund (a second event for the same refund) is a no-op', async () => {
      const subscription = await subscriptionOf(currentPeriodActive());
      const charge = await paidCharge(subscription, '2026-03-10', '2026-04-09');
      await apply(subscription, charge, REFUNDED);
      outbox.published.length = 0;

      expect(await apply(subscription, charge, REFUNDED)).toBe('NO_CHANGE');

      expect(outbox.published).toEqual([]);
    });
  });

  describe('the transaction', () => {
    it('locks the subscription (B-R1) before the charge (B-C1)', async () => {
      const subscription = await subscriptionOf(new SubscriptionBuilder().withStatus('PAST_DUE'));
      const charge = await periodCharge(subscription, '2026-03-10', '2026-04-09');
      lockOrder.length = 0;

      await apply(subscription, charge, PAID);

      expect(lockOrder.slice(0, 2)).toEqual(['B-R1', 'B-C1']);
    });

    it('records the inbox row with the change, and a replayed event id changes nothing', async () => {
      const subscription = await subscriptionOf(new SubscriptionBuilder().withStatus('PAST_DUE'));
      const charge = await periodCharge(subscription, '2026-03-10', '2026-04-09');
      const inbox = new ProviderEventBuilder().withTenantId(subscription.tenantId).build();

      expect(await apply(subscription, charge, PAID, inbox)).toBe('APPLIED');
      outbox.published.length = 0;
      expect(await apply(subscription, charge, PAID, inbox)).toBe('DUPLICATE');

      expect(providerEvents.saved).toHaveLength(1);
      expect(outbox.published).toEqual([]);
    });

    it('answers CHARGE_NOT_FOUND for a charge of another tenant (tenant isolation)', async () => {
      const subscription = await subscriptionOf(new SubscriptionBuilder().withStatus('PAST_DUE'));
      const other = await subscriptionOf(new SubscriptionBuilder().withStatus('PAST_DUE'));
      const otherCharge = await periodCharge(other, '2026-03-10', '2026-04-09');

      const result = await useCase.execute({
        tenantId: subscription.tenantId,
        chargeId: otherCharge.id,
        fact: PAID,
        recipientEmail: null,
        correlationId: 'corr',
      });

      expect(result).toBe('CHARGE_NOT_FOUND');
      expect(otherCharge.status).toBe('PENDING');
    });
  });
});

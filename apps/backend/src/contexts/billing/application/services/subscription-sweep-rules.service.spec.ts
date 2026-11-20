import {
  ChargeBuilder,
  FeaturePriceBuilder,
  FeaturePriceVersionBuilder,
  SubscriptionBuilder,
  SubscriptionItemBuilder,
} from '../../../../test/builders/billing';
import { InMemoryChargeRepository } from '../../../../test/repositories/billing/in-memory-charge.repository';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import type { Charge } from '../../domain/charge.aggregate';
import { FeaturePriceNotFoundError } from '../../domain/errors/billing-domain.error';
import type { Subscription } from '../../domain/subscription.aggregate';
import { RecoveryChargePlanner } from './recovery-charge-planner.service';
import { type SweepContext, SubscriptionSweepRules } from './subscription-sweep-rules.service';

// São Paulo is UTC-3 with no DST: NOW is 12:00 local on 2026-03-10 (a Tuesday).
const NOW = new Date('2026-03-10T15:00:00Z');
const EMAIL = 'billing@example.test';
const DAY_MS = 24 * 60 * 60 * 1000;
const at = (iso: string): Date => new Date(iso);
const ago = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

// Records which charge rows were locked (B-C1) and in which order.
class RecordingCharges extends InMemoryChargeRepository {
  readonly locked: string[] = [];
  override async findByIdForUpdate(tenantId: string, id: string): Promise<Charge | null> {
    this.locked.push(id);
    return super.findByIdForUpdate(tenantId, id);
  }
}

describe('SubscriptionSweepRules (UC-115)', () => {
  let charges: RecordingCharges;
  let rules: SubscriptionSweepRules;

  beforeEach(() => {
    charges = new RecordingCharges();
    const prices = new InMemoryFeaturePriceRepository();
    prices.seed(
      new FeaturePriceBuilder()
        .withVersions([
          new FeaturePriceVersionBuilder()
            .withAmountMinor(4900)
            .withEffectiveFrom('2026-01-01')
            .build(),
        ])
        .build(),
    );
    rules = new SubscriptionSweepRules(charges, new RecoveryChargePlanner(charges, prices));
  });

  const ctx = (overrides: Partial<SweepContext> = {}): SweepContext => ({
    now: NOW,
    correlationId: 'corr-sweep',
    recipientEmail: EMAIL,
    frozen: false,
    verifiedUnpaidChargeId: null,
    ...overrides,
  });
  const item = () => new SubscriptionItemBuilder().withStartsAt(at('2026-01-01T03:00:00Z')).build();
  const subscriptionOf = (builder: SubscriptionBuilder): Subscription =>
    builder.withItems([item()]).build();

  // A charge of the subscription, stored. `ready` gives it a payment link at the provider.
  const chargeOf = async (
    subscription: Subscription,
    options: {
      dueDate: string;
      period?: [string, string];
      status?: 'PENDING' | 'OVERDUE' | 'PAID' | 'REFUNDED';
      ready?: boolean;
      providerChargeId?: string;
      returned?: boolean;
      recovery?: boolean;
    },
  ): Promise<Charge> => {
    const builder = new ChargeBuilder()
      .withTenantId(subscription.tenantId)
      .withSubscriptionId(subscription.id)
      .withDueDate(options.dueDate);
    if (options.recovery) builder.asRecovery();
    else builder.withPeriod(...(options.period ?? ['2026-02-10', '2026-03-09']));
    if (options.ready !== false) {
      builder.withProviderReady('ASAAS', options.providerChargeId ?? `prov-${options.dueDate}`);
    }
    if (options.status === 'OVERDUE') builder.withStatus('OVERDUE');
    if (options.status === 'PAID') builder.withPaid('PIX', ago(1));
    if (options.status === 'REFUNDED') {
      builder.withPaid('PIX', ago(1)).withRefundedMinor(4900).withStatus('REFUNDED');
    }
    if (options.returned) builder.withPaymentReturnSeenAt(ago(1));
    const charge = builder.build();
    await charges.save(charge);
    return charge;
  };

  describe('rule 1 — overdue', () => {
    it.each([
      ['the day after its due date', '2026-03-09', true],
      ['an older due date', '2026-02-20', true],
      ['the due date itself (still payable today)', '2026-03-10', false],
      ['a future due date', '2026-03-11', false],
    ])('%s: charge overdue = %s', async (_name, dueDate, overdue) => {
      const subscription = subscriptionOf(new SubscriptionBuilder().withStatus('ACTIVE'));
      const charge = await chargeOf(subscription, { dueDate });

      const changes = await rules.apply(subscription, ctx());

      expect(charge.status).toBe(overdue ? 'OVERDUE' : 'PENDING');
      expect(subscription.status).toBe(overdue ? 'PAST_DUE' : 'ACTIVE');
      expect(changes.steps).toEqual(overdue ? ['OVERDUE', 'PAST_DUE'] : []);
    });

    it('moves ACTIVE to PAST_DUE with pastDueSince and raises SubscriptionPastDue', async () => {
      const subscription = subscriptionOf(new SubscriptionBuilder().withStatus('ACTIVE'));
      await chargeOf(subscription, { dueDate: '2026-03-09' });

      const changes = await rules.apply(subscription, ctx());

      expect(subscription.pastDueSince).toEqual(NOW);
      expect(subscription.domainEvents[0]).toMatchObject({ eventName: 'SubscriptionPastDue' });
      expect(changes.subscriptionChanged).toBe(true);
      expect(changes.charges).toHaveLength(1);
    });

    it('reads the due date in the subscription’s own zone: a day ahead of UTC is overdue a day earlier', async () => {
      // 15:00Z on 03-10 is already 2026-03-11 in Auckland.
      const auckland = subscriptionOf(
        new SubscriptionBuilder().withStatus('ACTIVE').withTimezone('Pacific/Auckland'),
      );
      const saoPaulo = subscriptionOf(new SubscriptionBuilder().withStatus('ACTIVE'));
      await chargeOf(auckland, { dueDate: '2026-03-10' });
      await chargeOf(saoPaulo, { dueDate: '2026-03-10' });

      await rules.apply(auckland, ctx());
      await rules.apply(saoPaulo, ctx());

      expect(auckland.status).toBe('PAST_DUE');
      expect(saoPaulo.status).toBe('ACTIVE');
    });

    it('a charge with no payment link yet is neither overdue nor moves the subscription to PAST_DUE', async () => {
      const subscription = subscriptionOf(new SubscriptionBuilder().withStatus('ACTIVE'));
      const held = await chargeOf(subscription, { dueDate: '2026-03-01', ready: false });

      const changes = await rules.apply(subscription, ctx());

      expect(held.status).toBe('PENDING');
      expect(subscription.status).toBe('ACTIVE');
      expect(changes.steps).toEqual([]);
    });

    it('the same past-due charge with a payment link is overdue (the held one above is the only difference)', async () => {
      const subscription = subscriptionOf(new SubscriptionBuilder().withStatus('ACTIVE'));
      const ready = await chargeOf(subscription, { dueDate: '2026-03-01', ready: true });

      await rules.apply(subscription, ctx());

      expect(ready.status).toBe('OVERDUE');
      expect(subscription.status).toBe('PAST_DUE');
    });

    it('a TRIALING subscription’s overdue first charge is marked, but there is no PAST_DUE after a trial', async () => {
      const subscription = subscriptionOf(
        new SubscriptionBuilder()
          .withStatus('TRIALING')
          .withTrialEndsAt(at('2026-03-11T03:00:00Z')),
      );
      const first = await chargeOf(subscription, { dueDate: '2026-03-09' });

      await rules.apply(subscription, ctx());

      expect(first.status).toBe('OVERDUE');
      expect(subscription.status).toBe('TRIALING');
    });

    it('an overdue RECOVERY charge of a suspended subscription is marked and the subscription is left alone', async () => {
      const subscription = subscriptionOf(
        new SubscriptionBuilder().withSuspension('NON_PAYMENT', ago(10)),
      );
      const recovery = await chargeOf(subscription, { dueDate: '2026-03-09', recovery: true });

      const changes = await rules.apply(subscription, ctx());

      expect(recovery.status).toBe('OVERDUE');
      expect(subscription.status).toBe('SUSPENDED');
      expect(changes.subscriptionChanged).toBe(false);
    });

    it('only a PERIOD charge moves an ACTIVE subscription to PAST_DUE: an overdue RECOVERY charge does not', async () => {
      const subscription = subscriptionOf(new SubscriptionBuilder().withStatus('ACTIVE'));
      const recovery = await chargeOf(subscription, { dueDate: '2026-03-09', recovery: true });

      const changes = await rules.apply(subscription, ctx());

      expect(recovery.status).toBe('OVERDUE');
      expect(subscription.status).toBe('ACTIVE');
      expect(changes.steps).toEqual(['OVERDUE']);
    });

    it('still marks OVERDUE / PAST_DUE under a freeze (it only holds suspensions back)', async () => {
      const subscription = subscriptionOf(new SubscriptionBuilder().withStatus('ACTIVE'));
      const charge = await chargeOf(subscription, { dueDate: '2026-03-09' });

      await rules.apply(subscription, ctx({ frozen: true }));

      expect(charge.status).toBe('OVERDUE');
      expect(subscription.status).toBe('PAST_DUE');
    });
  });

  describe('rule 2 — trial end, unpaid', () => {
    // The trial closes at the start of 2026-03-09 São Paulo: 36 hours before NOW.
    const ended = at('2026-03-09T03:00:00Z');
    const trial = (trialEndsAt = ended) =>
      subscriptionOf(new SubscriptionBuilder().withStatus('TRIALING').withTrialEndsAt(trialEndsAt));

    it.each([
      ['inside the 24 h margin', at('2026-03-10T03:00:00Z'), false],
      ['exactly 24 h after (the margin has not passed yet)', at('2026-03-09T15:00:00Z'), false],
      ['past the 24 h margin', ended, true],
    ])('%s → suspended = %s', async (_name, trialEndsAt, suspended) => {
      const subscription = trial(trialEndsAt);
      const first = await chargeOf(subscription, { dueDate: '2026-03-09' });

      await rules.apply(subscription, ctx({ verifiedUnpaidChargeId: first.id }));

      expect(subscription.status).toBe(suspended ? 'SUSPENDED' : 'TRIALING');
    });

    it('suspends directly with NON_PAYMENT (no PAST_DUE), cancels the stale first charge and issues the recovery charge', async () => {
      const subscription = trial();
      const first = await chargeOf(subscription, { dueDate: '2026-03-09' });

      const changes = await rules.apply(subscription, ctx({ verifiedUnpaidChargeId: first.id }));

      expect(subscription.status).toBe('SUSPENDED');
      expect(subscription.suspensionReason).toBe('NON_PAYMENT');
      // The first charge fell due the day the trial ended, so rule 1 marks it overdue first.
      expect(changes.steps).toEqual(['OVERDUE', 'TRIAL_SUSPENDED']);
      expect(first.status).toBe('CANCELED');
      expect(changes.charges).toContain(first);
      expect(changes.recovery).toMatchObject({ kind: 'RECOVERY', status: 'PENDING' });
      expect(changes.recovery?.amount.amountMinor).toBe(4900);
    });

    it('a stale charge the provider knows is cancelled locally, flagged, and handed to the provider cancel', async () => {
      const subscription = trial();
      const first = await chargeOf(subscription, {
        dueDate: '2026-03-09',
        providerChargeId: 'p-1',
      });

      const changes = await rules.apply(subscription, ctx({ verifiedUnpaidChargeId: first.id }));

      expect(first.providerCancelPending).toBe(true);
      expect(changes.cancelAtProvider).toEqual([first.id]);
    });

    it('a stale charge with no payment link is cancelled locally only (nothing to cancel at the provider)', async () => {
      const subscription = trial();
      const first = await chargeOf(subscription, { dueDate: '2026-03-09', ready: false });

      const changes = await rules.apply(subscription, ctx());

      expect(first.status).toBe('CANCELED');
      expect(first.providerCancelPending).toBe(false);
      expect(changes.cancelAtProvider).toEqual([]);
      expect(changes.deferred).toBe(false);
    });

    it('with no charge at all, suspends and issues the recovery charge', async () => {
      const subscription = trial();

      const changes = await rules.apply(subscription, ctx());

      expect(subscription.status).toBe('SUSPENDED');
      expect(changes.recovery).not.toBeNull();
      expect(changes.charges).toEqual([]);
    });

    it('a REFUNDED first charge counts as unpaid', async () => {
      const subscription = trial();
      await chargeOf(subscription, { dueDate: '2026-03-09', status: 'REFUNDED' });

      await rules.apply(subscription, ctx());

      expect(subscription.status).toBe('SUSPENDED');
    });

    it('a return from the payment page only lengthens the margin while the first charge is still open', async () => {
      // Closed on Friday: the three-business-day margin would run to Wednesday and has not passed.
      const subscription = trial(at('2026-03-06T03:00:00Z'));
      await chargeOf(subscription, { dueDate: '2026-03-05', status: 'REFUNDED', returned: true });

      await rules.apply(subscription, ctx());

      expect(subscription.status).toBe('SUSPENDED');
    });

    it('a plan with no price in force fails with a typed error, never a zero-priced recovery charge', async () => {
      const noPrices = new SubscriptionSweepRules(
        charges,
        new RecoveryChargePlanner(charges, new InMemoryFeaturePriceRepository()),
      );
      const subscription = trial();

      await expect(noPrices.apply(subscription, ctx())).rejects.toBeInstanceOf(
        FeaturePriceNotFoundError,
      );
    });

    it('waits for the provider’s fresh answer on a charge the provider knows, and tries again next run', async () => {
      const subscription = trial();
      const first = await chargeOf(subscription, { dueDate: '2026-03-09' });

      const changes = await rules.apply(subscription, ctx({ verifiedUnpaidChargeId: null }));

      expect(subscription.status).toBe('TRIALING');
      expect(first.status).toBe('OVERDUE');
      expect(changes.deferred).toBe(true);
      expect(changes.steps).toEqual(['OVERDUE']);
    });

    it('an answer about another charge does not release the suspension', async () => {
      const subscription = trial();
      await chargeOf(subscription, { dueDate: '2026-03-09' });

      const changes = await rules.apply(subscription, ctx({ verifiedUnpaidChargeId: 'other' }));

      expect(subscription.status).toBe('TRIALING');
      expect(changes.deferred).toBe(true);
    });

    it('a freeze holds the suspension back, with nothing else changed', async () => {
      const subscription = trial();
      const first = await chargeOf(subscription, { dueDate: '2026-03-09' });

      const changes = await rules.apply(
        subscription,
        ctx({ frozen: true, verifiedUnpaidChargeId: first.id }),
      );

      expect(subscription.status).toBe('TRIALING');
      expect(changes.recovery).toBeNull();
      expect(changes.deferred).toBe(false);
    });

    describe('after a return from the payment page (a boleto not yet compensated)', () => {
      it.each([
        // Thursday 2026-03-05 + 3 business days is Tuesday 2026-03-10 (local midnight 03:00Z, before NOW).
        ['trial closed Thursday: Tuesday midnight has passed', at('2026-03-05T03:00:00Z'), true],
        // Friday 2026-03-06 + 3 business days is Wednesday 2026-03-11, still ahead of NOW.
        ['trial closed Friday: Wednesday midnight is ahead', at('2026-03-06T03:00:00Z'), false],
      ])('%s → suspended = %s', async (_name, trialEndsAt, suspended) => {
        const subscription = trial(trialEndsAt);
        const first = await chargeOf(subscription, { dueDate: '2026-03-05', returned: true });

        await rules.apply(subscription, ctx({ verifiedUnpaidChargeId: first.id }));

        expect(subscription.status).toBe(suspended ? 'SUSPENDED' : 'TRIALING');
      });
    });
  });

  describe('rule 5 — trial to paid', () => {
    it('a paid first charge activates the subscription at the trial end, even past the margin', async () => {
      const trialEndsAt = at('2026-03-05T03:00:00Z');
      const subscription = subscriptionOf(
        new SubscriptionBuilder().withStatus('TRIALING').withTrialEndsAt(trialEndsAt),
      );
      await chargeOf(subscription, { dueDate: '2026-03-05', status: 'PAID' });

      const changes = await rules.apply(subscription, ctx());

      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.currentPeriodStart).toEqual(trialEndsAt);
      expect(changes.steps).toEqual(['TRIAL_ACTIVATED']);
      expect(changes.recovery).toBeNull();
    });

    it('a trial still running is left alone, paid or not', async () => {
      const subscription = subscriptionOf(
        new SubscriptionBuilder()
          .withStatus('TRIALING')
          .withTrialEndsAt(at('2026-03-11T03:00:00Z')),
      );
      await chargeOf(subscription, { dueDate: '2026-03-11', status: 'PAID' });

      const changes = await rules.apply(subscription, ctx());

      expect(subscription.status).toBe('TRIALING');
      expect(changes.steps).toEqual([]);
    });

    it('is not held back by a freeze (nobody is suspended)', async () => {
      const subscription = subscriptionOf(
        new SubscriptionBuilder()
          .withStatus('TRIALING')
          .withTrialEndsAt(at('2026-03-05T03:00:00Z')),
      );
      await chargeOf(subscription, { dueDate: '2026-03-05', status: 'PAID' });

      await rules.apply(subscription, ctx({ frozen: true }));

      expect(subscription.status).toBe('ACTIVE');
    });
  });

  describe('rule 3 — past due', () => {
    const pastDue = (since: Date, graceUntil: Date | null = null) =>
      subscriptionOf(
        new SubscriptionBuilder()
          .withStatus('PAST_DUE')
          .withPastDueSince(since)
          .withGraceUntil(graceUntil),
      );

    it.each([
      ['13 days past due', ago(13), null, false],
      ['15 days past due', ago(15), null, true],
      ['15 days past due with a later operator grace (the grace extends)', ago(15), ago(-5), false],
      ['15 days past due with the operator grace passed', ago(15), ago(1), true],
    ])('%s → suspended = %s', async (_name, since, graceUntil, suspended) => {
      const subscription = pastDue(since, graceUntil);

      await rules.apply(subscription, ctx());

      expect(subscription.status).toBe(suspended ? 'SUSPENDED' : 'PAST_DUE');
    });

    it('suspends with NON_PAYMENT, cancels the stale charge and issues the one recovery charge', async () => {
      const subscription = pastDue(ago(15));
      const stale = await chargeOf(subscription, { dueDate: '2026-02-20', status: 'OVERDUE' });

      const changes = await rules.apply(subscription, ctx());

      expect(subscription.suspensionReason).toBe('NON_PAYMENT');
      expect(subscription.domainEvents[0]).toMatchObject({
        eventName: 'SubscriptionSuspended',
        data: { reason: 'NON_PAYMENT' },
      });
      expect(stale.status).toBe('CANCELED');
      expect(changes.steps).toEqual(['GRACE_SUSPENDED']);
      expect(changes.recovery).toMatchObject({ kind: 'RECOVERY', status: 'PENDING' });
    });

    it('a freeze applies no non-payment suspension: it stays PAST_DUE with its charge untouched', async () => {
      const subscription = pastDue(ago(30));
      const stale = await chargeOf(subscription, { dueDate: '2026-02-01', status: 'OVERDUE' });

      const changes = await rules.apply(subscription, ctx({ frozen: true }));

      expect(subscription.status).toBe('PAST_DUE');
      expect(stale.status).toBe('OVERDUE');
      expect(changes.recovery).toBeNull();
    });

    it('issues no second recovery charge when one is already open', async () => {
      const subscription = pastDue(ago(15));
      await chargeOf(subscription, { dueDate: '2026-03-17', recovery: true });

      const changes = await rules.apply(subscription, ctx());

      expect(subscription.status).toBe('SUSPENDED');
      expect(changes.recovery).toBeNull();
    });
  });

  describe('rule 4 — cancel-at', () => {
    it('suspends with CANCELED and issues no recovery charge', async () => {
      const subscription = subscriptionOf(
        new SubscriptionBuilder().withStatus('ACTIVE').withCancelAt(at('2026-03-10T03:00:00Z')),
      );

      const changes = await rules.apply(subscription, ctx());

      expect(subscription.status).toBe('SUSPENDED');
      expect(subscription.suspensionReason).toBe('CANCELED');
      expect(changes.steps).toEqual(['CANCELED']);
      expect(changes.recovery).toBeNull();
    });

    it('is not a payment judgement: a freeze does not hold it back', async () => {
      const subscription = subscriptionOf(
        new SubscriptionBuilder().withStatus('ACTIVE').withCancelAt(at('2026-03-10T03:00:00Z')),
      );

      await rules.apply(subscription, ctx({ frozen: true }));

      expect(subscription.suspensionReason).toBe('CANCELED');
    });

    it('wins over non-payment when both are due in one run: no recovery charge, the open charge untouched', async () => {
      const subscription = subscriptionOf(
        new SubscriptionBuilder()
          .withStatus('PAST_DUE')
          .withPastDueSince(ago(20))
          .withCancelAt(ago(1)),
      );
      const stale = await chargeOf(subscription, { dueDate: '2026-02-20', status: 'OVERDUE' });

      const changes = await rules.apply(subscription, ctx());

      expect(subscription.suspensionReason).toBe('CANCELED');
      expect(changes.recovery).toBeNull();
      expect(stale.status).toBe('OVERDUE');
    });

    it('a subscription already suspended for non-payment keeps its reason and its recovery charge', async () => {
      const subscription = subscriptionOf(
        new SubscriptionBuilder().withSuspension('NON_PAYMENT', ago(5)).withCancelAt(ago(1)),
      );
      const recovery = await chargeOf(subscription, { dueDate: '2026-03-17', recovery: true });

      const changes = await rules.apply(subscription, ctx());

      expect(subscription.suspensionReason).toBe('NON_PAYMENT');
      expect(recovery.status).toBe('PENDING');
      expect(changes.steps).toEqual([]);
    });
  });

  describe('locking and idempotency', () => {
    it('loads every charge it changes with findByIdForUpdate and never marks one paid', async () => {
      const subscription = subscriptionOf(new SubscriptionBuilder().withStatus('ACTIVE'));
      const charge = await chargeOf(subscription, { dueDate: '2026-03-01' });

      await rules.apply(subscription, ctx());

      expect(charges.locked).toEqual([charge.id]);
      expect(charge.status).not.toBe('PAID');
    });

    it('locks a charge once even when two rules touch it (one instance, one save)', async () => {
      // Overdue (rule 1) and then cancelled as stale (rule 3) in the same run.
      const subscription = subscriptionOf(
        new SubscriptionBuilder().withStatus('PAST_DUE').withPastDueSince(ago(15)),
      );
      const charge = await chargeOf(subscription, { dueDate: '2026-03-01' });

      const changes = await rules.apply(subscription, ctx());

      expect(charges.locked).toEqual([charge.id]);
      expect(changes.charges).toEqual([charge]);
      expect(charge.status).toBe('CANCELED');
    });

    it('running it twice on the result changes nothing the second time', async () => {
      const subscription = subscriptionOf(
        new SubscriptionBuilder().withStatus('PAST_DUE').withPastDueSince(ago(15)),
      );
      await chargeOf(subscription, { dueDate: '2026-03-01', status: 'OVERDUE' });

      await rules.apply(subscription, ctx());
      const second = await rules.apply(subscription, ctx());

      expect(second.steps).toEqual([]);
      expect(second.recovery).toBeNull();
    });
  });
});

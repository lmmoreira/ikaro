import { ChargeBuilder, SubscriptionBuilder } from '../../../../test/builders/billing';
import type { ChargeStatus } from '../../domain/charge.aggregate';
import { applyChargeFact, type ChargeFact, type ChargeFactContext } from './charge-fact';

// São Paulo is UTC-3 with no DST: NOW is 12:00 local on 2026-03-10.
const NOW = new Date('2026-03-10T15:00:00Z');
const CTX: ChargeFactContext = { now: NOW, correlationId: 'corr-fact', recipientEmail: 'a@b.test' };
const PAID: ChargeFact = {
  type: 'PAID',
  method: 'PIX',
  paidAt: new Date('2026-03-10T14:55:00Z'),
  receiptUrl: null,
};
const startOfLocalDay = (day: string): Date => new Date(`${day}T03:00:00Z`);
const endOfLocalDay = (day: string): Date => {
  const next = new Date(`${day}T03:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return new Date(next.getTime() - 1);
};

const period = (status: ChargeStatus = 'PENDING', start = '2026-03-10', end = '2026-04-09') =>
  new ChargeBuilder().withPeriod(start, end).withStatus(status).build();
const recovery = (status: ChargeStatus = 'PENDING') =>
  new ChargeBuilder().asRecovery().withStatus(status).build();
const current = (status: 'ACTIVE' | 'PAST_DUE' | 'TRIALING' = 'ACTIVE') =>
  new SubscriptionBuilder()
    .withStatus(status)
    .withHasEverPaid(true)
    .withCurrentPeriod(startOfLocalDay('2026-03-10'), endOfLocalDay('2026-04-09'))
    .build();

describe('applyChargeFact', () => {
  describe('a paid fact', () => {
    it('applies it to a PERIOD charge and reports both aggregates changed', () => {
      const charge = period();
      const subscription = new SubscriptionBuilder().withStatus('PAST_DUE').build();

      const outcome = applyChargeFact(charge, subscription, PAID, CTX);

      expect(outcome).toMatchObject({
        result: 'APPLIED',
        chargeChanged: true,
        subscriptionChanged: true,
        doublePaid: false,
        suspendedByReversal: false,
      });
      expect(charge.status).toBe('PAID');
      expect(subscription.status).toBe('ACTIVE');
    });

    it('is a no-op on a charge that is already PAID (the later of CONFIRMED / RECEIVED)', () => {
      const outcome = applyChargeFact(period('PAID'), current(), PAID, CTX);

      expect(outcome).toMatchObject({
        result: 'NO_CHANGE',
        chargeChanged: false,
        subscriptionChanged: false,
      });
    });

    it.each(['REFUNDED', 'CHARGEBACK'] as ChargeStatus[])(
      'is ILLEGAL on a %s charge and changes nothing',
      (status) => {
        const subscription = current('PAST_DUE');

        const outcome = applyChargeFact(period(status), subscription, PAID, CTX);

        expect(outcome).toMatchObject({ result: 'ILLEGAL', chargeChanged: false });
        expect(subscription.status).toBe('PAST_DUE');
      },
    );

    it('flags that a stale PERIOD payment reactivated a payment-suspended tenant, so the open recovery charge is cancelled', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('SUSPENDED')
        .withSuspension('NON_PAYMENT', new Date('2026-03-01T03:00:00Z'))
        .build();

      const outcome = applyChargeFact(period(), subscription, PAID, CTX);

      expect(outcome.staleRecoveryPaid).toBe(true);
      expect(subscription.status).toBe('ACTIVE');
    });

    it('does not flag it for an operator suspension: a payment never lifts that one', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('SUSPENDED')
        .withSuspension('OPERATOR', new Date('2026-03-01T03:00:00Z'))
        .build();

      const outcome = applyChargeFact(period(), subscription, PAID, CTX);

      expect(outcome.staleRecoveryPaid).toBe(false);
      expect(subscription.status).toBe('SUSPENDED');
    });

    it('records a RECOVERY payment on a tenant that is not suspended as the second payment: REFUNDED', () => {
      const charge = recovery();

      const outcome = applyChargeFact(charge, current(), PAID, CTX);

      expect(outcome).toMatchObject({ result: 'APPLIED', doublePaid: true });
      expect(charge.status).toBe('REFUNDED');
    });

    it('reactivates a suspended tenant with a RECOVERY payment', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('SUSPENDED')
        .withSuspension('NON_PAYMENT', new Date('2026-03-01T03:00:00Z'))
        .build();

      const outcome = applyChargeFact(recovery(), subscription, PAID, CTX);

      expect(outcome).toMatchObject({ subscriptionChanged: true, doublePaid: false });
      expect(subscription.status).toBe('ACTIVE');
    });

    it('records a stale PERIOD payment, older than the current period, as the second payment and leaves the period alone', () => {
      const charge = period('PENDING', '2026-02-10', '2026-03-09');
      const subscription = current();
      const startBefore = subscription.currentPeriodStart;

      const outcome = applyChargeFact(charge, subscription, PAID, CTX);

      expect(outcome).toMatchObject({
        result: 'APPLIED',
        doublePaid: true,
        subscriptionChanged: false,
      });
      expect(charge.status).toBe('REFUNDED');
      expect(subscription.currentPeriodStart).toEqual(startBefore);
    });
  });

  describe('a refund or a lost chargeback', () => {
    it.each([
      ['REFUNDED', 'REFUNDED'],
      ['CHARGEBACK', 'CHARGEBACK'],
    ] as const)(
      '%s of the current period suspends and flags a recovery charge to create',
      (type, status) => {
        const charge = period('PAID');
        const subscription = current();

        const outcome = applyChargeFact(charge, subscription, { type }, CTX);

        expect(outcome).toMatchObject({
          result: 'APPLIED',
          chargeChanged: true,
          suspendedByReversal: true,
          subscriptionChanged: true,
        });
        expect(charge.status).toBe(status);
        expect(subscription.suspensionReason).toBe('PAYMENT_REVERSED');
      },
    );

    it('records a refund of an older period without suspending', () => {
      const charge = period('PAID', '2026-02-10', '2026-03-09');
      const subscription = current();

      const outcome = applyChargeFact(charge, subscription, { type: 'REFUNDED' }, CTX);

      expect(outcome).toMatchObject({
        result: 'APPLIED',
        chargeChanged: true,
        suspendedByReversal: false,
        subscriptionChanged: false,
      });
      expect(subscription.status).toBe('ACTIVE');
    });

    it('is a no-op when the charge is already in that state (a second event for one refund)', () => {
      const outcome = applyChargeFact(period('REFUNDED'), current(), { type: 'REFUNDED' }, CTX);

      expect(outcome).toMatchObject({
        result: 'NO_CHANGE',
        chargeChanged: false,
        suspendedByReversal: false,
      });
    });

    it('is ILLEGAL for a charge that was never paid', () => {
      const subscription = current();

      const outcome = applyChargeFact(period('PENDING'), subscription, { type: 'REFUNDED' }, CTX);

      expect(outcome.result).toBe('ILLEGAL');
      expect(subscription.status).toBe('ACTIVE');
    });
  });
});

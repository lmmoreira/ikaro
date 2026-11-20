import { SubscriptionBuilder } from '../../../test/builders/billing';
import { ExemptProtectedError } from './errors/billing-domain.error';
import type { SubscriptionStatus } from './subscription.types';

// Subscription timezone is America/Sao_Paulo (UTC-3, no DST).
const NOW = new Date('2026-03-10T15:00:00Z');
const CORRELATION = 'corr-sweep';
const EMAIL = 'billing@example.test';
const DAY_MS = 24 * 60 * 60 * 1000;
const at = (iso: string): Date => new Date(iso);

describe('Subscription — the status sweep (UC-115)', () => {
  describe('markPastDue', () => {
    it('ACTIVE → PAST_DUE records pastDueSince and raises SubscriptionPastDue with the end of the 14-day grace', () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();

      const changed = subscription.markPastDue(NOW, CORRELATION, EMAIL);

      expect(changed).toBe(true);
      expect(subscription.status).toBe('PAST_DUE');
      expect(subscription.pastDueSince).toEqual(NOW);
      expect(subscription.domainEvents).toHaveLength(1);
      expect(subscription.domainEvents[0]).toMatchObject({
        eventName: 'SubscriptionPastDue',
        correlationId: CORRELATION,
        data: {
          subscriptionId: subscription.id,
          pastDueSince: NOW.toISOString(),
          suspendsAt: at('2026-03-24T15:00:00Z').toISOString(),
          recipientEmail: EMAIL,
        },
      });
    });

    it('announces an operator grace as the suspension date', () => {
      const graceUntil = at('2026-04-02T15:00:00Z');
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withGraceUntil(graceUntil)
        .build();

      subscription.markPastDue(NOW, CORRELATION, EMAIL);

      expect(subscription.domainEvents[0]).toMatchObject({
        data: { suspendsAt: graceUntil.toISOString() },
      });
    });

    it.each<SubscriptionStatus>(['TRIALING', 'PAST_DUE', 'SUSPENDED'])(
      '%s is left as it is (no PAST_DUE after a trial, a repeat is a no-op)',
      (status) => {
        const subscription = new SubscriptionBuilder().withStatus(status).build();

        const changed = subscription.markPastDue(NOW, CORRELATION, EMAIL);

        expect(changed).toBe(false);
        expect(subscription.status).toBe(status);
        expect(subscription.domainEvents).toEqual([]);
      },
    );

    it('an exempt subscription is never moved', () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build();

      expect(subscription.markPastDue(NOW, CORRELATION, EMAIL)).toBe(false);
      expect(subscription.status).toBe('ACTIVE');
    });
  });

  describe('suspendForNonPayment', () => {
    it.each<SubscriptionStatus>(['TRIALING', 'PAST_DUE'])(
      '%s → SUSPENDED (NON_PAYMENT), starts the purge clock and raises SubscriptionSuspended',
      (status) => {
        const subscription = new SubscriptionBuilder().withStatus(status).build();

        const changed = subscription.suspendForNonPayment(NOW, CORRELATION, EMAIL);

        expect(changed).toBe(true);
        expect(subscription.status).toBe('SUSPENDED');
        expect(subscription.suspensionReason).toBe('NON_PAYMENT');
        expect(subscription.suspendedAt).toEqual(NOW);
        expect(subscription.domainEvents[0]).toMatchObject({
          eventName: 'SubscriptionSuspended',
          data: {
            subscriptionId: subscription.id,
            reason: 'NON_PAYMENT',
            suspendedAt: NOW.toISOString(),
            purgeAt: new Date(NOW.getTime() + 90 * DAY_MS).toISOString(),
            recipientEmail: EMAIL,
          },
        });
      },
    );

    it('a subscription that paid once is purged after 180 days, not 90', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('PAST_DUE')
        .withHasEverPaid(true)
        .build();

      subscription.suspendForNonPayment(NOW, CORRELATION, EMAIL);

      expect(subscription.domainEvents[0]).toMatchObject({
        data: { purgeAt: new Date(NOW.getTime() + 180 * DAY_MS).toISOString() },
      });
    });

    it('ACTIVE never jumps straight to suspended (the ladder goes through PAST_DUE)', () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();

      expect(subscription.suspendForNonPayment(NOW, CORRELATION, EMAIL)).toBe(false);
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.domainEvents).toEqual([]);
    });

    it('an already suspended subscription keeps its reason, its clock and raises nothing', () => {
      const since = at('2026-03-01T12:00:00Z');
      const subscription = new SubscriptionBuilder().withSuspension('OPERATOR', since).build();

      expect(subscription.suspendForNonPayment(NOW, CORRELATION, EMAIL)).toBe(false);
      expect(subscription.suspensionReason).toBe('OPERATOR');
      expect(subscription.suspendedAt).toEqual(since);
      expect(subscription.domainEvents).toEqual([]);
    });

    it('refuses an exempt subscription', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('PAST_DUE')
        .withExempt(true)
        .build();

      expect(() => subscription.suspendForNonPayment(NOW, CORRELATION, EMAIL)).toThrow(
        ExemptProtectedError,
      );
    });
  });

  describe('suspendCanceled', () => {
    it.each<SubscriptionStatus>(['TRIALING', 'ACTIVE', 'PAST_DUE'])(
      '%s → SUSPENDED (CANCELED) and raises SubscriptionSuspended',
      (status) => {
        const subscription = new SubscriptionBuilder().withStatus(status).build();

        const changed = subscription.suspendCanceled(NOW, CORRELATION, EMAIL);

        expect(changed).toBe(true);
        expect(subscription.status).toBe('SUSPENDED');
        expect(subscription.suspensionReason).toBe('CANCELED');
        expect(subscription.domainEvents[0]).toMatchObject({
          eventName: 'SubscriptionSuspended',
          data: { reason: 'CANCELED', suspendedAt: NOW.toISOString() },
        });
      },
    );

    it('a payment suspension is never relabelled CANCELED (its recovery charge stays payable)', () => {
      const since = at('2026-03-01T12:00:00Z');
      const subscription = new SubscriptionBuilder().withSuspension('NON_PAYMENT', since).build();

      expect(subscription.suspendCanceled(NOW, CORRELATION, EMAIL)).toBe(false);
      expect(subscription.suspensionReason).toBe('NON_PAYMENT');
      expect(subscription.suspendedAt).toEqual(since);
      expect(subscription.domainEvents).toEqual([]);
    });

    it('refuses an exempt subscription', () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build();

      expect(() => subscription.suspendCanceled(NOW, CORRELATION, EMAIL)).toThrow(
        ExemptProtectedError,
      );
    });
  });

  describe('activateAfterTrial', () => {
    // The trial closes at the start of 2026-03-24 in São Paulo.
    const trialEndsAt = at('2026-03-24T03:00:00Z');

    it('TRIALING past its end → ACTIVE: the period starts at trialEndsAt and is the first charge’s own month', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(trialEndsAt)
        .withNextDueDate('2026-04-24')
        .withAnchorDay(24)
        .build();

      const changed = subscription.activateAfterTrial(at('2026-03-24T04:00:00Z'));

      expect(changed).toBe(true);
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.currentPeriodStart).toEqual(trialEndsAt);
      // The last millisecond of 2026-04-23 in São Paulo (UTC-3).
      expect(subscription.currentPeriodEnd).toEqual(at('2026-04-24T02:59:59.999Z'));
      expect(subscription.anchorDay).toBe(24);
      expect(subscription.nextDueDate?.value).toBe('2026-04-24');
      expect(subscription.domainEvents).toEqual([]);
    });

    it('clamps the anchor day of a trial that ends on the 31st to 28', () => {
      const endsOn31st = at('2026-01-31T03:00:00Z');
      const subscription = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(endsOn31st)
        .withAnchorDay(15)
        .build();

      subscription.activateAfterTrial(endsOn31st);

      expect(subscription.anchorDay).toBe(28);
      // The first month runs to the day before the next anchor, 2026-02-28.
      expect(subscription.currentPeriodEnd).toEqual(at('2026-02-28T02:59:59.999Z'));
    });

    it('keeps the first month on tenant-local days across a DST change', () => {
      // New York: the trial closes at the start of 2026-03-01 (EST, UTC-5); DST starts on 03-08, so
      // the month ends on the last local millisecond of 03-31 in EDT (UTC-4), not 24 h multiples.
      const closed = at('2026-03-01T05:00:00Z');
      const subscription = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTimezone('America/New_York')
        .withTrialEndsAt(closed)
        .build();

      subscription.activateAfterTrial(closed);

      expect(subscription.anchorDay).toBe(1);
      expect(subscription.currentPeriodStart).toEqual(closed);
      expect(subscription.currentPeriodEnd).toEqual(at('2026-04-01T03:59:59.999Z'));
    });

    it('clears a leftover pastDueSince and graceUntil', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(trialEndsAt)
        .withPastDueSince(at('2026-03-01T00:00:00Z'))
        .withGraceUntil(at('2026-03-30T00:00:00Z'))
        .build();

      subscription.activateAfterTrial(trialEndsAt);

      expect(subscription.pastDueSince).toBeNull();
      expect(subscription.graceUntil).toBeNull();
    });

    it('a trial still running, a non-trial and an exempt subscription are left as they are', () => {
      const running = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(trialEndsAt)
        .build();
      const active = new SubscriptionBuilder().withStatus('ACTIVE').build();
      const exempt = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(trialEndsAt)
        .withExempt(true)
        .build();

      expect(running.activateAfterTrial(at('2026-03-24T02:59:59Z'))).toBe(false);
      expect(running.status).toBe('TRIALING');
      expect(active.activateAfterTrial(NOW)).toBe(false);
      expect(exempt.activateAfterTrial(at('2026-03-25T00:00:00Z'))).toBe(false);
    });
  });

  describe('due predicates', () => {
    const trialEndsAt = at('2026-03-24T03:00:00Z');
    const trial = (): SubscriptionBuilder =>
      new SubscriptionBuilder().withStatus('TRIALING').withTrialEndsAt(trialEndsAt);

    it('hasTrialEnded is true from the trial end instant and only for a TRIALING, non-exempt subscription', () => {
      expect(trial().build().hasTrialEnded(at('2026-03-24T02:59:59.999Z'))).toBe(false);
      expect(trial().build().hasTrialEnded(trialEndsAt)).toBe(true);
      expect(trial().withExempt(true).build().hasTrialEnded(NOW)).toBe(false);
      expect(new SubscriptionBuilder().withStatus('ACTIVE').build().hasTrialEnded(NOW)).toBe(false);
    });

    it('isTrialSettlementOver waits 24 hours, strictly', () => {
      const deadline = at('2026-03-25T03:00:00Z');

      expect(trial().build().isTrialSettlementOver(deadline, false)).toBe(false);
      expect(trial().build().isTrialSettlementOver(at('2026-03-25T03:00:00.001Z'), false)).toBe(
        true,
      );
    });

    it('isTrialSettlementOver waits three business days after a return from the payment page', () => {
      // The trial closes on Tuesday 2026-03-24; +3 business days is Friday 2026-03-27 at local midnight.
      const deadline = at('2026-03-27T03:00:00Z');

      expect(trial().build().isTrialSettlementOver(at('2026-03-25T04:00:00Z'), true)).toBe(false);
      expect(trial().build().isTrialSettlementOver(deadline, true)).toBe(false);
      expect(trial().build().isTrialSettlementOver(at('2026-03-27T03:00:00.001Z'), true)).toBe(
        true,
      );
    });

    it('isGraceOver uses pastDueSince + 14 days, and an operator grace in both directions', () => {
      const since = at('2026-03-01T12:00:00Z');
      const pastDue = (): SubscriptionBuilder =>
        new SubscriptionBuilder().withStatus('PAST_DUE').withPastDueSince(since);

      expect(pastDue().build().isGraceOver(at('2026-03-15T12:00:00Z'))).toBe(false);
      expect(pastDue().build().isGraceOver(at('2026-03-15T12:00:00.001Z'))).toBe(true);
      // A later grace extends the window; the default 14 days no longer decides.
      const extended = pastDue().withGraceUntil(at('2026-03-30T12:00:00Z')).build();
      expect(extended.isGraceOver(at('2026-03-20T12:00:00Z'))).toBe(false);
      expect(extended.isGraceOver(at('2026-03-30T12:00:00.001Z'))).toBe(true);
    });

    it('isGraceOver is false for a non-PAST_DUE or exempt subscription', () => {
      const since = at('2026-01-01T12:00:00Z');

      expect(new SubscriptionBuilder().withStatus('ACTIVE').build().isGraceOver(NOW)).toBe(false);
      expect(
        new SubscriptionBuilder()
          .withStatus('PAST_DUE')
          .withPastDueSince(since)
          .withExempt(true)
          .build()
          .isGraceOver(NOW),
      ).toBe(false);
    });

    it('isCancelDue is true from cancelAt for a subscription that still has access, never for a suspended one', () => {
      const cancelAt = at('2026-03-10T03:00:00Z');
      const withCancel = (status: SubscriptionStatus): SubscriptionBuilder =>
        new SubscriptionBuilder().withStatus(status).withCancelAt(cancelAt);

      expect(withCancel('ACTIVE').build().isCancelDue(at('2026-03-10T02:59:59.999Z'))).toBe(false);
      expect(withCancel('ACTIVE').build().isCancelDue(cancelAt)).toBe(true);
      expect(withCancel('PAST_DUE').build().isCancelDue(NOW)).toBe(true);
      expect(withCancel('TRIALING').build().isCancelDue(NOW)).toBe(true);
      expect(withCancel('ACTIVE').withExempt(true).build().isCancelDue(NOW)).toBe(false);
      expect(
        new SubscriptionBuilder()
          .withSuspension('NON_PAYMENT', at('2026-03-01T00:00:00Z'))
          .withCancelAt(cancelAt)
          .build()
          .isCancelDue(NOW),
      ).toBe(false);
      expect(new SubscriptionBuilder().withStatus('ACTIVE').build().isCancelDue(NOW)).toBe(false);
    });
  });
});

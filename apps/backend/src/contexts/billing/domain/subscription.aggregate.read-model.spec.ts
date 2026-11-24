import { SubscriptionBuilder } from '../../../test/builders/billing';
import type { SubscriptionStatus } from './subscription.types';

const at = (iso: string): Date => new Date(iso);

describe('Subscription — the billing page’s read model (UC-117)', () => {
  describe('suspendsAt', () => {
    it('is past_due_since + 14 days without an operator grace', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('PAST_DUE')
        .withPastDueSince(at('2026-03-10T15:00:00Z'))
        .build();

      expect(subscription.suspendsAt).toEqual(at('2026-03-24T15:00:00Z'));
    });

    it('is the operator grace_until when one is set', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('PAST_DUE')
        .withPastDueSince(at('2026-03-10T15:00:00Z'))
        .withGraceUntil(at('2026-04-02T15:00:00Z'))
        .build();

      expect(subscription.suspendsAt).toEqual(at('2026-04-02T15:00:00Z'));
    });

    it.each<SubscriptionStatus>(['TRIALING', 'ACTIVE', 'SUSPENDED'])(
      'is null while %s, even with a stale past_due_since',
      (status) => {
        const subscription = new SubscriptionBuilder()
          .withStatus(status)
          .withPastDueSince(at('2026-03-10T15:00:00Z'))
          .build();

        expect(subscription.suspendsAt).toBeNull();
      },
    );

    it('is null for a PAST_DUE row with no past_due_since', () => {
      expect(new SubscriptionBuilder().withStatus('PAST_DUE').build().suspendsAt).toBeNull();
    });
  });

  describe('planConfirmationRequired and planConfirmationFallbackDate', () => {
    const trial = () =>
      new SubscriptionBuilder().withStatus('TRIALING').withNextDueDate('2026-11-22');

    it('requires confirmation of an unconfirmed trial and falls back 3 days before the first due date', () => {
      const subscription = trial().build();

      expect(subscription.planConfirmationRequired).toBe(true);
      expect(subscription.planConfirmationFallbackDate).toBe('2026-11-19');
    });

    it('needs nothing once confirmed', () => {
      const subscription = trial().withPlanConfirmedAt(at('2026-11-10T12:00:00Z')).build();

      expect(subscription.planConfirmationRequired).toBe(false);
      expect(subscription.planConfirmationFallbackDate).toBeNull();
    });

    it('needs nothing for an exempt trial or a subscription that is not a trial', () => {
      expect(trial().withExempt(true).build().planConfirmationRequired).toBe(false);
      expect(
        new SubscriptionBuilder().withStatus('ACTIVE').withNextDueDate('2026-11-22').build()
          .planConfirmationRequired,
      ).toBe(false);
    });

    it('has no fallback date without a due date', () => {
      expect(trial().withNextDueDate(null).build().planConfirmationFallbackDate).toBeNull();
    });

    it('crosses a month boundary by calendar days', () => {
      const subscription = trial().withNextDueDate('2026-12-02').build();

      expect(subscription.planConfirmationFallbackDate).toBe('2026-11-29');
    });
  });
});

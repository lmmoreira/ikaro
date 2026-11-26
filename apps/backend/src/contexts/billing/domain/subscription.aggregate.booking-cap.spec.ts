import { SubscriptionBuilder, SubscriptionItemBuilder } from '../../../test/builders/billing';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-12-10T15:00:00.000Z');
// America/Sao_Paulo has no daylight saving time since 2019: local midnight is 03:00 UTC.
const DEC_15_LOCAL_MIDNIGHT = new Date('2026-12-15T03:00:00.000Z');

function item(featureKey: 'BOOKING' | 'HOTSITE', startsAt: Date, endsAt: Date | null) {
  return new SubscriptionItemBuilder()
    .withFeatureKey(featureKey)
    .withStartsAt(startsAt)
    .withEndsAt(endsAt)
    .build();
}

describe('Subscription — the BOOKING cap (M26-S18b)', () => {
  const longAgo = new Date(NOW.getTime() - 30 * DAY_MS);

  describe('a running subscription', () => {
    it('has no end when the BOOKING item is open-ended', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withItems([item('BOOKING', longAgo, null)])
        .build();

      expect(subscription.entitlementEndsAt('BOOKING', NOW)).toBeNull();
      expect(subscription.bookableUntil(NOW)).toBeNull();
    });

    it('ends where a scheduled removal ends the running item', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withItems([item('BOOKING', longAgo, DEC_15_LOCAL_MIDNIGHT)])
        .build();

      expect(subscription.entitlementEndsAt('BOOKING', NOW)).toEqual(DEC_15_LOCAL_MIDNIGHT);
      expect(subscription.bookableUntil(NOW)).toBe('2026-12-15');
    });

    it('treats touching windows as one run, so a plan change that keeps BOOKING has no end', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withItems([
          item('BOOKING', longAgo, DEC_15_LOCAL_MIDNIGHT),
          item('BOOKING', DEC_15_LOCAL_MIDNIGHT, null),
        ])
        .build();

      expect(subscription.bookableUntil(NOW)).toBeNull();
    });

    it('ends at the first gap after a chain of items', () => {
      const jan = new Date('2027-01-15T03:00:00.000Z');
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withItems([
          item('BOOKING', longAgo, DEC_15_LOCAL_MIDNIGHT),
          item('BOOKING', DEC_15_LOCAL_MIDNIGHT, jan),
        ])
        .build();

      expect(subscription.entitlementEndsAt('BOOKING', NOW)).toEqual(jan);
    });

    it('ignores another feature ending', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withItems([
          item('BOOKING', longAgo, null),
          item('HOTSITE', longAgo, DEC_15_LOCAL_MIDNIGHT),
        ])
        .build();

      expect(subscription.bookableUntil(NOW)).toBeNull();
    });

    it('has no pending end for a feature that is not entitled now', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withItems([item('HOTSITE', longAgo, null)])
        .build();

      expect(subscription.bookableUntil(NOW)).toBeNull();
    });

    it('converts the end to the date in the subscription timezone, not the UTC day', () => {
      // 02:00 UTC on the 15th is 23:00 on the 14th in São Paulo.
      const lateUtc = new Date('2026-12-15T02:00:00.000Z');
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withTimezone('America/Sao_Paulo')
        .withItems([item('BOOKING', longAgo, lateUtc)])
        .build();

      expect(subscription.bookableUntil(NOW)).toBe('2026-12-14');
    });
  });

  describe('a trial', () => {
    const trialEndsAt = DEC_15_LOCAL_MIDNIGHT;

    it('ends at the trial end when the first paid period omits BOOKING', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(trialEndsAt)
        .withItems([item('HOTSITE', trialEndsAt, null)])
        .build();

      expect(subscription.entitlementEndsAt('BOOKING', NOW)).toEqual(trialEndsAt);
      expect(subscription.bookableUntil(NOW)).toBe('2026-12-15');
    });

    it('has no end when the first paid period keeps BOOKING open-ended', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(trialEndsAt)
        .withItems([item('BOOKING', trialEndsAt, null)])
        .build();

      expect(subscription.bookableUntil(NOW)).toBeNull();
    });

    it('never reads entitledAt, which grants every feature during a trial', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(trialEndsAt)
        .withItems([item('HOTSITE', trialEndsAt, null)])
        .build();

      expect(subscription.entitledAt(NOW).some((entry) => entry.featureKey === 'BOOKING')).toBe(
        true,
      );
      expect(subscription.bookableUntil(NOW)).not.toBeNull();
    });

    it('has no cap without a trial end', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withTrialEndsAt(null)
        .withItems([])
        .build();

      expect(subscription.bookableUntil(NOW)).toBeNull();
    });
  });

  it('has no cap for a suspended subscription: the entitlement gate already blocks it', () => {
    const subscription = new SubscriptionBuilder()
      .withStatus('SUSPENDED')
      .withSuspension('NON_PAYMENT', NOW)
      .withItems([item('BOOKING', longAgo, DEC_15_LOCAL_MIDNIGHT)])
      .build();

    expect(subscription.bookableUntil(NOW)).toBeNull();
  });
});

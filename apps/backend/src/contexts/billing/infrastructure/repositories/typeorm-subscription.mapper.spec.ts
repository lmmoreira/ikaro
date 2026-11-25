import { SubscriptionEntityBuilder } from '../../../../test/builders/billing/subscription-entity.builder';
import { subscriptionToOperatorSummary } from './typeorm-subscription.mapper';

describe('subscriptionToOperatorSummary', () => {
  it('maps the subscription state and the timezone the operator list needs', () => {
    const trialEndsAt = new Date('2026-12-01T03:00:00Z');
    const pastDueSince = new Date('2026-11-01T03:00:00Z');
    const graceUntil = new Date('2026-11-20T03:00:00Z');
    const suspendedAt = new Date('2026-11-25T03:00:00Z');
    const entity = new SubscriptionEntityBuilder()
      .withStatus('SUSPENDED')
      .withSuspension('NON_PAYMENT', suspendedAt)
      .withTimezone('America/New_York')
      .withTrialEndsAt(trialEndsAt)
      .withPastDueSince(pastDueSince)
      .withGraceUntil(graceUntil)
      .withExempt(true)
      .withHasEverPaid(true)
      .build();

    expect(subscriptionToOperatorSummary(entity)).toEqual({
      tenantId: entity.tenantId,
      timezone: 'America/New_York',
      status: 'SUSPENDED',
      suspensionReason: 'NON_PAYMENT',
      exempt: true,
      trialEndsAt,
      graceUntil,
      pastDueSince,
      suspendedAt,
      hasEverPaid: true,
    });
  });

  it('keeps the optional dates and the reason null for a plain trial', () => {
    const entity = new SubscriptionEntityBuilder().withTrialEndsAt(null).build();

    expect(subscriptionToOperatorSummary(entity)).toMatchObject({
      status: 'TRIALING',
      suspensionReason: null,
      trialEndsAt: null,
      graceUntil: null,
      pastDueSince: null,
      suspendedAt: null,
      exempt: false,
      hasEverPaid: false,
    });
  });
});

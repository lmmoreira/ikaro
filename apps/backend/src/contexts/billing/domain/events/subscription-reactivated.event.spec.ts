import { SubscriptionReactivatedEventBuilder } from '../../../../test/builders/billing';

describe('SubscriptionReactivated', () => {
  it('carries exempt, false by default, so a null recipientEmail alone means "no billing email set"', () => {
    expect(new SubscriptionReactivatedEventBuilder().build().data.exempt).toBe(false);
    expect(new SubscriptionReactivatedEventBuilder().withExempt(true).build().data.exempt).toBe(
      true,
    );
  });

  it('carries recipientEmail, and it may be null', () => {
    expect(new SubscriptionReactivatedEventBuilder().build().data.recipientEmail).toBe(
      'billing@example.test',
    );
    expect(
      new SubscriptionReactivatedEventBuilder().withRecipientEmail(null).build().data
        .recipientEmail,
    ).toBeNull();
  });
});

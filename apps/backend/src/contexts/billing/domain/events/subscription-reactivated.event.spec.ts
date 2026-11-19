import { SubscriptionReactivatedEventBuilder } from '../../../../test/builders/billing';

describe('SubscriptionReactivated', () => {
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

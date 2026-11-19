import { SubscriptionSuspendedEventBuilder } from '../../../../test/builders/billing';

describe('SubscriptionSuspended', () => {
  it('carries recipientEmail, and it may be null', () => {
    expect(new SubscriptionSuspendedEventBuilder().build().data.recipientEmail).toBe(
      'billing@example.test',
    );
    expect(
      new SubscriptionSuspendedEventBuilder().withRecipientEmail(null).build().data.recipientEmail,
    ).toBeNull();
  });
});

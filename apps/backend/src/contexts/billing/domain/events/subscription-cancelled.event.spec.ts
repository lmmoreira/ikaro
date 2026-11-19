import { SubscriptionCancelledEventBuilder } from '../../../../test/builders/billing';

describe('SubscriptionCancelled', () => {
  it('carries the full envelope', () => {
    const event = new SubscriptionCancelledEventBuilder()
      .withTenantId('tenant-1')
      .withCorrelationId('corr-9')
      .build();

    expect(event).toMatchObject({
      eventName: 'SubscriptionCancelled',
      eventVersion: 1,
      tenantId: 'tenant-1',
      correlationId: 'corr-9',
    });
    expect(event.eventId).toEqual(expect.any(String));
    expect(event.occurredAt).toEqual(expect.any(String));
  });

  it('carries exactly the documented data fields, and no contact data beyond recipientEmail', () => {
    const { data } = new SubscriptionCancelledEventBuilder().build();

    expect(Object.keys(data).sort()).toEqual([
      'cancelAt',
      'immediate',
      'recipientEmail',
      'subscriptionId',
    ]);
  });

  it('allows a null recipientEmail (Notification falls back to the managers)', () => {
    const event = new SubscriptionCancelledEventBuilder().withRecipientEmail(null).build();

    expect(event.data.recipientEmail).toBeNull();
  });
});

import { ChargeIssuedEventBuilder } from '../../../../test/builders/billing';

describe('ChargeIssued', () => {
  it('carries the full envelope', () => {
    const event = new ChargeIssuedEventBuilder()
      .withTenantId('tenant-1')
      .withCorrelationId('corr-9')
      .build();

    expect(event).toMatchObject({
      eventName: 'ChargeIssued',
      eventVersion: 1,
      tenantId: 'tenant-1',
      correlationId: 'corr-9',
    });
    expect(event.eventId).toEqual(expect.any(String));
    expect(event.occurredAt).toEqual(expect.any(String));
  });

  it('carries exactly the documented data fields, and no contact data beyond recipientEmail', () => {
    const { data } = new ChargeIssuedEventBuilder().build();

    expect(Object.keys(data).sort()).toEqual([
      'amountMinor',
      'chargeId',
      'currency',
      'dueDate',
      'kind',
      'paymentUrl',
      'recipientEmail',
    ]);
  });

  it('allows a null recipientEmail (Notification falls back to the managers)', () => {
    const event = new ChargeIssuedEventBuilder().withRecipientEmail(null).build();

    expect(event.data.recipientEmail).toBeNull();
  });
});

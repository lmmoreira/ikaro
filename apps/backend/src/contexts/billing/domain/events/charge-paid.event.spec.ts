import { ChargePaidEventBuilder } from '../../../../test/builders/billing';
import { MinorAmount } from '../value-objects/minor-amount.vo';
import { ChargePaid } from './charge-paid.event';

describe('ChargePaid', () => {
  it('carries the full envelope', () => {
    const event = new ChargePaidEventBuilder()
      .withTenantId('tenant-1')
      .withCorrelationId('corr-9')
      .build();

    expect(event).toMatchObject({
      eventName: 'ChargePaid',
      eventVersion: 1,
      tenantId: 'tenant-1',
      correlationId: 'corr-9',
    });
    expect(event.eventId).toEqual(expect.any(String));
    expect(event.occurredAt).toEqual(expect.any(String));
  });

  it('carries exactly the documented data fields, and no contact data beyond recipientEmail', () => {
    const { data } = new ChargePaidEventBuilder().build();

    expect(Object.keys(data).sort()).toEqual([
      'amountMinor',
      'chargeId',
      'currency',
      'method',
      'paidAt',
      'receiptUrl',
      'recipientEmail',
    ]);
  });

  it('builds itself from a charge: the amount and currency come from the charge, the rest from the facts', () => {
    const event = ChargePaid.forCharge(
      { tenantId: 'tenant-1', id: 'charge-1', amount: MinorAmount.create(4900, 'BRL') },
      'corr-1',
      'CARD',
      new Date('2026-03-10T15:00:00Z'),
      null,
      'billing@example.test',
    );

    expect(event).toMatchObject({ tenantId: 'tenant-1', correlationId: 'corr-1' });
    expect(event.data).toEqual({
      chargeId: 'charge-1',
      amountMinor: 4900,
      currency: 'BRL',
      method: 'CARD',
      paidAt: '2026-03-10T15:00:00.000Z',
      receiptUrl: null,
      recipientEmail: 'billing@example.test',
    });
  });

  it('allows a null method when the provider reported none for a paid charge', () => {
    expect(new ChargePaidEventBuilder().withMethod(null).build().data.method).toBeNull();
  });

  it('allows a null recipientEmail (Notification falls back to the managers)', () => {
    const event = new ChargePaidEventBuilder().withRecipientEmail(null).build();

    expect(event.data.recipientEmail).toBeNull();
  });
});

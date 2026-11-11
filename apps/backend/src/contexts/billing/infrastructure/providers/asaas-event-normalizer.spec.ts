import { InvalidProviderWebhookError } from '../../domain/errors/billing-provider.errors';
import { normalizeAsaasWebhook, parseAsaasDateTime } from './asaas-event-normalizer';

function body(event: string, payment: Record<string, unknown> = {}, extra = {}): string {
  return JSON.stringify({
    id: 'evt_0123456789abcdef0123456789abcdef&7',
    event,
    dateCreated: '2026-11-09 09:26:37',
    account: { id: 'acc', ownerId: 'own' },
    payment: {
      id: 'pay_123',
      customer: 'cus_456',
      externalReference: '0192f5a0-0000-7000-8000-000000000001',
      value: 49,
      billingType: 'PIX',
      transactionReceiptUrl: 'https://receipt.example/pay_123',
      ...payment,
    },
    ...extra,
  });
}

describe('normalizeAsaasWebhook', () => {
  it.each([
    ['PAYMENT_CONFIRMED', 'PaymentConfirmed'],
    ['PAYMENT_RECEIVED', 'PaymentConfirmed'],
    ['PAYMENT_OVERDUE', 'PaymentOverdue'],
    ['PAYMENT_DELETED', 'PaymentCancelled'],
    ['PAYMENT_REFUNDED', 'PaymentRefunded'],
    ['PAYMENT_PARTIALLY_REFUNDED', 'PaymentPartiallyRefunded'],
    ['PAYMENT_CHARGEBACK_REQUESTED', 'PaymentChargeback'],
  ])('maps %s to %s', (event, expectedType) => {
    const result = normalizeAsaasWebhook(body(event));

    expect(result.type).toBe(expectedType);
    expect(result).toMatchObject({
      providerEventId: 'evt_0123456789abcdef0123456789abcdef&7',
      providerChargeId: 'pay_123',
      providerCustomerId: 'cus_456',
      chargeReference: '0192f5a0-0000-7000-8000-000000000001',
      amountMinor: 4900,
    });
  });

  it.each(['PAYMENT_CREATED', 'PAYMENT_CHECKOUT_VIEWED', 'PAYMENT_UPDATED', 'SOMETHING_NEW'])(
    'normalises %s to Ignored',
    (event) => {
      const result = normalizeAsaasWebhook(body(event));

      expect(result).toMatchObject({ type: 'Ignored', providerEventName: event });
    },
  );

  it('ignores an unmapped event even when it carries no payment', () => {
    const raw = JSON.stringify({
      id: 'evt_x&1',
      event: 'ACCOUNT_STATUS',
      dateCreated: '2026-11-09 09:26:37',
    });

    expect(normalizeAsaasWebhook(raw)).toMatchObject({ type: 'Ignored' });
  });

  it('carries the payment method and receipt of a confirmed payment', () => {
    const result = normalizeAsaasWebhook(body('PAYMENT_RECEIVED', { billingType: 'BOLETO' }));

    expect(result).toMatchObject({
      type: 'PaymentConfirmed',
      paymentMethod: 'BOLETO',
      receiptUrl: 'https://receipt.example/pay_123',
    });
  });

  it('reports no payment method for the UNDEFINED billing type', () => {
    const result = normalizeAsaasWebhook(body('PAYMENT_CONFIRMED', { billingType: 'UNDEFINED' }));

    expect(result).toMatchObject({ type: 'PaymentConfirmed', paymentMethod: null });
  });

  it('rounds a fractional reais value to integer minor units', () => {
    const result = normalizeAsaasWebhook(body('PAYMENT_OVERDUE', { value: 49.9 }));

    expect(result).toMatchObject({ amountMinor: 4990 });
  });

  it('treats a missing external reference and customer as null', () => {
    const result = normalizeAsaasWebhook(
      body('PAYMENT_OVERDUE', { externalReference: undefined, customer: undefined }),
    );

    expect(result).toMatchObject({ chargeReference: null, providerCustomerId: null });
  });

  it('is stateless: the same body yields an identical event and event id', () => {
    const raw = body('PAYMENT_RECEIVED');

    expect(normalizeAsaasWebhook(raw)).toEqual(normalizeAsaasWebhook(raw));
  });

  it.each([
    ['not JSON', 'not json'],
    ['a JSON array', '[]'],
    ['no id', JSON.stringify({ event: 'PAYMENT_RECEIVED', dateCreated: '2026-11-09 09:26:37' })],
    ['no event', JSON.stringify({ id: 'evt_x&1', dateCreated: '2026-11-09 09:26:37' })],
    ['no dateCreated', JSON.stringify({ id: 'evt_x&1', event: 'PAYMENT_RECEIVED' })],
    [
      'a malformed dateCreated',
      body('PAYMENT_RECEIVED', {}, { dateCreated: '2026-11-09T09:26:37Z' }),
    ],
    [
      'a charge event with no payment',
      JSON.stringify({
        id: 'evt_x&1',
        event: 'PAYMENT_RECEIVED',
        dateCreated: '2026-11-09 09:26:37',
      }),
    ],
    ['a payment with no id', body('PAYMENT_RECEIVED', { id: undefined })],
    ['a payment with no value', body('PAYMENT_RECEIVED', { value: undefined })],
  ])('throws InvalidProviderWebhookError for %s', (_label, raw) => {
    expect(() => normalizeAsaasWebhook(raw)).toThrow(InvalidProviderWebhookError);
  });
});

describe('parseAsaasDateTime', () => {
  it('reads São Paulo local time as UTC-3 and returns the UTC instant', () => {
    expect(parseAsaasDateTime('2026-11-09 09:26:37').toISOString()).toBe(
      '2026-11-09T12:26:37.000Z',
    );
  });

  it('crosses midnight into the next UTC day', () => {
    expect(parseAsaasDateTime('2026-11-09 22:00:00').toISOString()).toBe(
      '2026-11-10T01:00:00.000Z',
    );
  });
});

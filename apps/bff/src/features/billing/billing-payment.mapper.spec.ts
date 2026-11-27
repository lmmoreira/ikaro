import {
  toBillingPaymentLinkResponse,
  toBillingPaymentReturnResponse,
} from './billing-payment.mapper';
import {
  BackendBillingPaymentLinkSchema,
  BackendBillingPaymentReturnSchema,
} from './billing.schemas';

describe('paying a charge (M26-S15)', () => {
  it('maps a payable charge to its status, URL and expiry', () => {
    const backend = BackendBillingPaymentLinkSchema.parse({
      status: 'OVERDUE',
      paymentUrl: 'https://pay.example/i/1',
      expiresAt: '2026-11-20T00:00:00.000Z',
    });

    expect(toBillingPaymentLinkResponse(backend)).toEqual({
      status: 'OVERDUE',
      paymentUrl: 'https://pay.example/i/1',
      expiresAt: '2026-11-20T00:00:00.000Z',
    });
  });

  it('maps a paid charge to the paid state with neither a URL nor an expiry', () => {
    const backend = BackendBillingPaymentLinkSchema.parse({
      status: 'PAID',
      paymentUrl: null,
      expiresAt: null,
    });

    expect(toBillingPaymentLinkResponse(backend)).toEqual({
      status: 'PAID',
      paymentUrl: null,
      expiresAt: null,
    });
  });

  it('maps the return to the status and the one awaiting-payment signal', () => {
    const backend = BackendBillingPaymentReturnSchema.parse({
      status: 'PENDING',
      paymentConfirmationPending: true,
    });

    expect(toBillingPaymentReturnResponse(backend)).toEqual({
      status: 'PENDING',
      paymentConfirmationPending: true,
    });
  });
});

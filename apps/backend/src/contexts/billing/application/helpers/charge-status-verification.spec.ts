import type { NormalizedChargeState, NormalizedChargeStatus } from '../../domain/provider-events';
import { factFromStatus } from './charge-status-verification';

const PAID_AT = new Date('2026-03-09T10:00:00Z');
const FALLBACK = new Date('2026-03-10T15:00:00Z');

const status = (
  state: NormalizedChargeState,
  overrides: Partial<NormalizedChargeStatus> = {},
): NormalizedChargeStatus => ({
  providerChargeId: 'pay_1',
  state,
  paymentMethod: 'PIX',
  paidAt: PAID_AT,
  receiptUrl: 'https://receipt.example/1',
  amountMinor: 4900,
  disputeOpen: false,
  externalReference: 'charge-1',
  ...overrides,
});

describe('factFromStatus (UC-116: what a verified provider read states)', () => {
  it.each(['PAID', 'PARTIALLY_REFUNDED'] as const)(
    'a %s charge is a payment, with the provider’s method, instant and receipt',
    (state) => {
      expect(factFromStatus(status(state), FALLBACK)).toEqual({
        type: 'PAID',
        method: 'PIX',
        paidAt: PAID_AT,
        receiptUrl: 'https://receipt.example/1',
      });
    },
  );

  it('a payment with no instant from the provider takes the fallback', () => {
    expect(factFromStatus(status('PAID', { paidAt: null }), FALLBACK)).toMatchObject({
      paidAt: FALLBACK,
    });
  });

  it('a refunded charge is the refund reversal, a charged-back one the chargeback', () => {
    expect(factFromStatus(status('REFUNDED'), FALLBACK)).toEqual({ type: 'REFUNDED' });
    expect(factFromStatus(status('CHARGEBACK'), FALLBACK)).toEqual({ type: 'CHARGEBACK' });
  });

  it.each(['PENDING', 'OVERDUE', 'CANCELED'] as const)(
    'a %s charge states nothing: it changes nothing locally',
    (state) => {
      expect(factFromStatus(status(state), FALLBACK)).toBeNull();
    },
  );

  it('an opened dispute on a paid charge is still just the payment (access never changes on it)', () => {
    expect(factFromStatus(status('PAID', { disputeOpen: true }), FALLBACK)?.type).toBe('PAID');
  });
});

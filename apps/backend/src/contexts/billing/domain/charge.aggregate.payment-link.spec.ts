import { ChargeBuilder } from '../../../test/builders/billing';
import type { ChargeStatus } from './charge.types';
import { ChargeInvariantError } from './errors/billing-domain.error';
import { IllegalChargeTransitionError } from './errors/illegal-charge-transition.error';

const OLD_EXPIRY = new Date('2026-03-01T00:00:00Z');
const NEW_EXPIRY = new Date('2026-06-01T00:00:00Z');
const SEEN_AT = new Date('2026-03-02T12:00:00Z');

const readyCharge = (status: ChargeStatus = 'PENDING') =>
  new ChargeBuilder()
    .withStatus(status)
    .withProviderReady('ASAAS', 'pay_1', 'https://pay.example/old')
    .withPaymentUrlExpiresAt(OLD_EXPIRY);

describe('Charge — paying it (UC-119)', () => {
  describe('payability', () => {
    it.each<[ChargeStatus, 'PAYABLE' | 'PAID' | 'NOT_PAYABLE']>([
      ['PENDING', 'PAYABLE'],
      ['OVERDUE', 'PAYABLE'],
      // Unreachable in M26; payable so that M29 needs no change here.
      ['FAILED', 'PAYABLE'],
      ['PAID', 'PAID'],
      ['CANCELED', 'NOT_PAYABLE'],
      ['REFUNDED', 'NOT_PAYABLE'],
      ['CHARGEBACK', 'NOT_PAYABLE'],
    ])('a %s charge is %s', (status, expected) => {
      expect(new ChargeBuilder().withStatus(status).build().payability).toBe(expected);
    });
  });

  describe('renewPaymentLink', () => {
    it('replaces the stored URL and expiry', () => {
      const charge = readyCharge().build();

      charge.renewPaymentLink('https://pay.example/new', NEW_EXPIRY);

      expect(charge.paymentUrl).toBe('https://pay.example/new');
      expect(charge.paymentUrlExpiresAt).toBe(NEW_EXPIRY);
    });

    it('keeps a link the provider gave no expiry for as one with no expiry', () => {
      const charge = readyCharge().build();

      charge.renewPaymentLink('https://pay.example/new', null);

      expect(charge.paymentUrlExpiresAt).toBeNull();
    });

    it.each<ChargeStatus>(['PENDING', 'OVERDUE', 'PAID', 'CANCELED'])(
      'is legal on a %s charge (a webhook can settle it while the provider call is in flight) and never touches the status',
      (status) => {
        const charge = readyCharge(status).build();

        charge.renewPaymentLink('https://pay.example/new', NEW_EXPIRY);

        expect(charge.status).toBe(status);
        expect(charge.paymentUrl).toBe('https://pay.example/new');
      },
    );

    it('raises no event', () => {
      const charge = readyCharge().build();

      charge.renewPaymentLink('https://pay.example/new', NEW_EXPIRY);

      expect(charge.clearDomainEvents()).toEqual([]);
    });

    it('refuses a charge the provider does not hold yet: it never had a link to renew', () => {
      const charge = new ChargeBuilder().build();

      expect(() => charge.renewPaymentLink('https://pay.example/new', NEW_EXPIRY)).toThrow(
        IllegalChargeTransitionError,
      );
      expect(charge.paymentUrl).toBeNull();
    });

    it('refuses an empty URL', () => {
      const charge = readyCharge().build();

      expect(() => charge.renewPaymentLink('  ', NEW_EXPIRY)).toThrow(ChargeInvariantError);
      expect(charge.paymentUrl).toBe('https://pay.example/old');
    });
  });

  describe('paymentConfirmationPending', () => {
    it('is false until the manager returns from the hosted page', () => {
      expect(readyCharge().build().paymentConfirmationPending).toBe(false);
    });

    it.each<ChargeStatus>(['PENDING', 'OVERDUE'])(
      'is true for a %s charge once a return was seen',
      (status) => {
        const charge = readyCharge(status).withPaymentReturnSeenAt(SEEN_AT).build();

        expect(charge.paymentConfirmationPending).toBe(true);
      },
    );

    it.each<ChargeStatus>(['PAID', 'CANCELED', 'REFUNDED', 'CHARGEBACK'])(
      'is false for a %s charge even with a return seen: the payment landed or it is closed',
      (status) => {
        const charge = readyCharge(status).withPaymentReturnSeenAt(SEEN_AT).build();

        expect(charge.paymentConfirmationPending).toBe(false);
      },
    );

    it('turns true when the return is recorded and keeps the first return time', () => {
      const charge = readyCharge().build();

      charge.recordPaymentReturn(SEEN_AT);
      charge.recordPaymentReturn(new Date('2026-03-02T13:00:00Z'));

      expect(charge.paymentConfirmationPending).toBe(true);
      expect(charge.paymentReturnSeenAt).toBe(SEEN_AT);
    });
  });
});

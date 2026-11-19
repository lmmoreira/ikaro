import { ChargeBuilder } from '../../../test/builders/billing';
import type { ChargeStatus } from './charge.aggregate';
import { ChargeInvariantError } from './errors/billing-domain.error';
import { IllegalChargeTransitionError } from './errors/illegal-charge-transition.error';

const EXPIRES = new Date('2026-06-01T00:00:00Z');
const NOW = new Date('2026-03-02T12:00:00Z');

describe('Charge — provider creation, cancel flag and payment return', () => {
  describe('markCreationReady', () => {
    it('stores the provider with the id, link and expiry, and marks the creation READY', () => {
      const charge = new ChargeBuilder().build();

      charge.markCreationReady('ASAAS', 'pay_1', 'https://pay.example/1', EXPIRES);

      expect(charge.provider).toBe('ASAAS');
      expect(charge.providerChargeId).toBe('pay_1');
      expect(charge.paymentUrl).toBe('https://pay.example/1');
      expect(charge.paymentUrlExpiresAt).toBe(EXPIRES);
      expect(charge.providerCreationStatus).toBe('READY');
      expect(charge.status).toBe('PENDING');
    });

    it.each(['PAID', 'CANCELED'] as ChargeStatus[])(
      'is legal on a %s charge (a webhook landed first) and never touches the status',
      (status) => {
        const charge = new ChargeBuilder().withStatus(status).build();

        charge.markCreationReady('ASAAS', 'pay_1', 'https://pay.example/1', null);

        expect(charge.status).toBe(status);
        expect(charge.providerChargeId).toBe('pay_1');
        expect(charge.providerCreationStatus).toBe('READY');
      },
    );

    it('is idempotent for the same provider charge', () => {
      const charge = new ChargeBuilder().build();
      charge.markCreationReady('ASAAS', 'pay_1', 'https://pay.example/1', null);

      expect(() =>
        charge.markCreationReady('ASAAS', 'pay_1', 'https://pay.example/1', null),
      ).not.toThrow();
    });

    it('rejects a second, different provider charge', () => {
      const charge = new ChargeBuilder().withProviderReady('ASAAS', 'pay_1').build();

      expect(() => charge.markCreationReady('ASAAS', 'pay_2', 'https://x', null)).toThrow(
        IllegalChargeTransitionError,
      );
    });

    it('rejects an empty provider charge id', () => {
      expect(() =>
        new ChargeBuilder().build().markCreationReady('ASAAS', ' ', 'https://x', null),
      ).toThrow(ChargeInvariantError);
    });
  });

  describe('markCreationFailed', () => {
    it('records nothing on the charge: it stays PENDING and the attempt count is the claim’s', () => {
      const charge = new ChargeBuilder().withCreationAttempts(1, NOW).build();

      charge.markCreationFailed();

      expect(charge.providerCreationStatus).toBe('PENDING');
      expect(charge.providerCreationAttempts).toBe(1);
      expect(charge.providerCreationLastAttemptAt).toBe(NOW);
    });

    it('provider_creation_status FAILED is unreachable in M26', () => {
      const charge = new ChargeBuilder().build();

      charge.markCreationFailed();
      charge.markCreationFailed();

      expect(charge.providerCreationStatus).not.toBe('FAILED');
    });

    it('is illegal once the creation is READY', () => {
      const charge = new ChargeBuilder().withProviderReady('ASAAS', 'pay_1').build();

      expect(() => charge.markCreationFailed()).toThrow(IllegalChargeTransitionError);
    });
  });

  describe('recordPaymentReturn', () => {
    it('keeps the first return: a later one does not push the settlement margin out', () => {
      const charge = new ChargeBuilder().build();

      charge.recordPaymentReturn(NOW);
      charge.recordPaymentReturn(new Date('2026-03-09T00:00:00Z'));

      expect(charge.paymentReturnSeenAt).toBe(NOW);
    });
  });

  describe('provider cancel flag', () => {
    it('is set and cleared on a CANCELED charge', () => {
      const charge = new ChargeBuilder().withStatus('CANCELED').build();

      charge.markProviderCancelPending();
      expect(charge.providerCancelPending).toBe(true);

      charge.clearProviderCancelPending();
      expect(charge.providerCancelPending).toBe(false);
    });

    it.each(['PENDING', 'OVERDUE', 'PAID', 'REFUNDED', 'CHARGEBACK'] as ChargeStatus[])(
      'cannot be set on a %s charge',
      (status) => {
        const charge = new ChargeBuilder().withStatus(status).build();

        expect(() => charge.markProviderCancelPending()).toThrow(IllegalChargeTransitionError);
      },
    );

    it('clearing an unset flag is a no-op on any status', () => {
      const charge = new ChargeBuilder().withStatus('PAID').build();

      expect(() => charge.clearProviderCancelPending()).not.toThrow();
    });

    it('a flag still set on a charge that is not CANCELED cannot be cleared by hand', () => {
      const charge = new ChargeBuilder().withStatus('PAID').withProviderCancelPending().build();

      expect(() => charge.clearProviderCancelPending()).toThrow(IllegalChargeTransitionError);
    });
  });

  describe('persistence bookkeeping', () => {
    it('markPersisted moves the version the next save is checked against', () => {
      const charge = new ChargeBuilder().withVersion(undefined).build();
      expect(charge.version).toBeUndefined();

      charge.markPersisted(0);

      expect(charge.version).toBe(0);
    });

    it('open is true for PENDING and OVERDUE only', () => {
      const open = (status: ChargeStatus): boolean =>
        new ChargeBuilder().withStatus(status).build().open;

      expect([open('PENDING'), open('OVERDUE'), open('PAID'), open('CANCELED')]).toEqual([
        true,
        true,
        false,
        false,
      ]);
    });
  });
});

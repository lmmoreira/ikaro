import type { Charge } from '../../domain/charge.aggregate';
import type { NormalizedChargeStatus } from '../../domain/provider-events';
import type { ChargeFact } from './charge-fact';

export type ChargeStatusMismatch = 'AMOUNT_MISMATCH' | 'REFERENCE_MISMATCH';

/**
 * Why a provider re-read of a charge cannot be used as the truth about `charge`, or `null` when it
 * can. The amount must be what we charged, and a charge whose provider id is not stored yet (the
 * webhook outran the `READY` write) is bound to this payment only by the reference the provider
 * holds, never by a caller's own copy of it. The one check behind the webhook's re-read
 * (UC-114), the status sweep's trial-end re-read and its already-paid cancel (UC-115).
 */
export function chargeStatusMismatch(
  status: NormalizedChargeStatus,
  charge: Charge,
): ChargeStatusMismatch | null {
  if (status.amountMinor !== charge.amount.amountMinor) return 'AMOUNT_MISMATCH';
  if (charge.providerChargeId === null && status.externalReference !== charge.id) {
    return 'REFERENCE_MISMATCH';
  }
  return null;
}

/** The provider says the charge was paid (a partial refund leaves it paid). */
export function isPaidAtProvider(status: NormalizedChargeStatus): boolean {
  return status.state === 'PAID' || status.state === 'PARTIALLY_REFUNDED';
}

/**
 * The fact a verified provider read states (reconcile, UC-116), or `null` when it states none:
 * paid or partially refunded is a payment, refunded and charged back are the two reversals, and
 * pending, overdue (the sweep's) and cancelled change nothing locally. The caller has already
 * checked `chargeStatusMismatch`; `fallbackPaidAt` stands in when the provider gives no payment
 * instant.
 */
export function factFromStatus(
  status: NormalizedChargeStatus,
  fallbackPaidAt: Date,
): ChargeFact | null {
  if (isPaidAtProvider(status)) {
    return {
      type: 'PAID',
      method: status.paymentMethod,
      paidAt: status.paidAt ?? fallbackPaidAt,
      receiptUrl: status.receiptUrl,
    };
  }
  if (status.state === 'REFUNDED') return { type: 'REFUNDED' };
  if (status.state === 'CHARGEBACK') return { type: 'CHARGEBACK' };
  return null;
}

/**
 * The paid fact a verified provider re-read states, or `null` when the re-read does not describe
 * this charge or says it is not paid. `fallbackPaidAt` stands in when the provider gives no payment
 * instant.
 */
export function paidFactFromStatus(
  status: NormalizedChargeStatus,
  charge: Charge,
  fallbackPaidAt: Date,
): Extract<ChargeFact, { type: 'PAID' }> | null {
  if (!isPaidAtProvider(status) || chargeStatusMismatch(status, charge) !== null) return null;
  return {
    type: 'PAID',
    method: status.paymentMethod,
    paidAt: status.paidAt ?? fallbackPaidAt,
    receiptUrl: status.receiptUrl,
  };
}

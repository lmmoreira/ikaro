import type { Charge } from '../../domain/charge.aggregate';
import type { NormalizedChargeStatus, NormalizedProviderEvent } from '../../domain/provider-events';
import type { ChargeFact } from './charge-fact';
import { chargeStatusMismatch, isPaidAtProvider } from './charge-status-verification';

/** A provider event about one charge (everything but the auto-billing and ignored events). */
export type ChargeEvent = Exclude<
  NormalizedProviderEvent,
  { type: 'AutoBillingAuthorized' | 'AutoBillingRevoked' | 'Ignored' }
>;

/** Why the re-read does not confirm the webhook, or `null` when it does. */
export function verifyChargeEvent(
  event: ChargeEvent,
  status: NormalizedChargeStatus,
  charge: Charge,
): string | null {
  const mismatch = chargeStatusMismatch(status, charge);
  if (mismatch !== null) return mismatch;
  switch (event.type) {
    case 'PaymentConfirmed':
      return isPaidAtProvider(status) ? null : 'NOT_PAID';
    case 'PaymentRefunded':
      return status.state === 'REFUNDED' ? null : 'NOT_REFUNDED';
    case 'PaymentChargeback':
      return status.state === 'CHARGEBACK' ? null : 'NOT_CHARGED_BACK';
    default:
      return null;
  }
}

/** The fact a verified event applies, or `null` for an event that changes no state. */
export function toChargeFact(
  event: ChargeEvent,
  status: NormalizedChargeStatus | null,
): ChargeFact | null {
  switch (event.type) {
    case 'PaymentConfirmed':
      return {
        type: 'PAID',
        method: status?.paymentMethod ?? event.paymentMethod,
        paidAt: status?.paidAt ?? event.occurredAt,
        receiptUrl: status?.receiptUrl ?? event.receiptUrl,
      };
    case 'PaymentRefunded':
      return { type: 'REFUNDED' };
    case 'PaymentChargeback':
      return { type: 'CHARGEBACK' };
    default:
      return null;
  }
}

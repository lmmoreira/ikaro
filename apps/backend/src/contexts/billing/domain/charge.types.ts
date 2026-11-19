import type { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import type { BillingProvider } from './billing-account.aggregate';
import type { ChargeLine } from './charge-line';
import type { PaymentMethod } from './provider-events';
import type { MinorAmount } from './value-objects/minor-amount.vo';

/** `ADDON` (slice H) arrives with its own expand migration. */
export type ChargeKind = 'PERIOD' | 'RECOVERY';

/**
 * `FAILED` is documented but has no M26 transition into it (reserved for M29's automatic
 * collection); the spelling is the column's (`CANCELED`, never `CANCELLED`).
 */
export type ChargeStatus =
  'PENDING' | 'PAID' | 'OVERDUE' | 'FAILED' | 'CANCELED' | 'REFUNDED' | 'CHARGEBACK';

/** `FAILED` exists in the column's CHECK but is unreachable in M26: a failed attempt stays `PENDING`. */
export type ChargeProviderCreationStatus = 'PENDING' | 'READY' | 'FAILED';

export interface ChargeProps {
  id: string;
  tenantId: string;
  subscriptionId: string;
  // Copied from the subscription at insert: the provider account the charge belongs to.
  merchantProfileKey: string;
  kind: ChargeKind;
  // NULL forever for RECOVERY (the period lives on the subscription).
  periodStart: CalendarDate | null;
  periodEnd: CalendarDate | null;
  dueDate: CalendarDate;
  // The immutable price snapshot. Never changes after construction.
  lines: readonly ChargeLine[];
  subtotal: MinorAmount;
  amount: MinorAmount;
  status: ChargeStatus;
  method: PaymentMethod | null;
  paidAt: Date | null;
  provider: BillingProvider | null;
  providerChargeId: string | null;
  paymentUrl: string | null;
  paymentUrlExpiresAt: Date | null;
  receiptUrl: string | null;
  paymentReturnSeenAt: Date | null;
  refunded: MinorAmount;
  providerCreationStatus: ChargeProviderCreationStatus;
  // Written only by the repository's claim, never by `save()`: read-only here.
  providerCreationAttempts: number;
  providerCreationLastAttemptAt: Date | null;
  providerCancelPending: boolean;
  // undefined = never persisted (the repository inserts); otherwise the optimistic-lock version.
  version?: number;
}

/** What a new charge starts from: the price snapshot and the billed period, never a payment state. */
export interface NewChargeInput {
  tenantId: string;
  subscriptionId: string;
  merchantProfileKey: string;
  kind: ChargeKind;
  periodStart: CalendarDate | null;
  periodEnd: CalendarDate | null;
  dueDate: CalendarDate;
  lines: readonly ChargeLine[];
  currency: string;
}

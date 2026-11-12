import type { AutoBilling } from './billing-account.aggregate';

/** The value set of `billing.charges.method` (docs/DATABASE_SCHEMA.md); a provider's own name for a method is translated by its adapter. */
export type PaymentMethod = 'PIX' | 'BOLETO' | 'CARD';

/** What `startAutoBilling` can switch on: every `billing_accounts.auto_billing` value except `NONE`. */
export type AutoBillingMode = Exclude<AutoBilling, 'NONE'>;

interface ProviderEventBase {
  /** The provider's own event id: the dedupe key of the M26 inbox. The same raw body always yields the same one. */
  readonly providerEventId: string;
  readonly occurredAt: Date;
}

interface ProviderChargeEventBase extends ProviderEventBase {
  readonly providerChargeId: string;
  readonly providerCustomerId: string | null;
  /** Our charge id, sent to the provider as the charge's external reference. */
  readonly chargeReference: string | null;
  readonly amountMinor: number;
}

/**
 * Ikaro's own webhook vocabulary. Every adapter translates its provider's body into one of these
 * once, at the edge; nothing past `parseWebhook` sees a provider type.
 */
export type NormalizedProviderEvent =
  | (ProviderChargeEventBase & {
      readonly type: 'PaymentConfirmed';
      readonly paymentMethod: PaymentMethod | null;
      readonly receiptUrl: string | null;
    })
  | (ProviderChargeEventBase & { readonly type: 'PaymentOverdue' })
  | (ProviderChargeEventBase & { readonly type: 'PaymentCancelled' })
  | (ProviderChargeEventBase & { readonly type: 'PaymentRefunded' })
  | (ProviderChargeEventBase & { readonly type: 'PaymentPartiallyRefunded' })
  | (ProviderChargeEventBase & { readonly type: 'PaymentChargeback' })
  | (ProviderEventBase & {
      readonly type: 'AutoBillingAuthorized' | 'AutoBillingRevoked';
      readonly providerCustomerId: string;
    })
  | (ProviderEventBase & { readonly type: 'Ignored'; readonly providerEventName: string });

export type NormalizedProviderEventType = NormalizedProviderEvent['type'];

/**
 * What the provider says about a charge. The values that exist in `billing.charges.status` use its
 * spelling (`CANCELED`, docs/DATABASE_SCHEMA.md); `PARTIALLY_REFUNDED` is an observation only, a
 * partial refund does not change the charge's own status.
 */
export type NormalizedChargeState =
  'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CHARGEBACK';

/** The re-read of a charge: the webhook is a hint, this is the truth. */
export interface NormalizedChargeStatus {
  readonly providerChargeId: string;
  readonly state: NormalizedChargeState;
  readonly paymentMethod: PaymentMethod | null;
  readonly paidAt: Date | null;
  readonly receiptUrl: string | null;
}

export interface ProviderAccountHealth {
  readonly webhookStatus: 'OK' | 'PAUSED' | 'UNKNOWN';
  readonly queuePaused: boolean;
}

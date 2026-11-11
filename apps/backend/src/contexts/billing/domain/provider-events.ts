export const PAYMENT_METHODS = ['PIX', 'BOLETO', 'CREDIT_CARD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const AUTO_BILLING_MODES = ['PIX_AUTOMATICO', 'CARD_RECURRING'] as const;
export type AutoBillingMode = (typeof AUTO_BILLING_MODES)[number];

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

export type NormalizedChargeState =
  'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CHARGEBACK';

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

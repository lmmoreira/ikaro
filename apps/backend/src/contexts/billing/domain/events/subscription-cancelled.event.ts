import { DomainEvent } from '../../../../shared/domain/domain-event';

interface SubscriptionCancelledData extends Record<string, unknown> {
  subscriptionId: string;
  /** ISO-8601 UTC: when access ends (now, for an immediate cancel). */
  cancelAt: string;
  immediate: boolean;
  /** The billing email, resolved by Billing at publish time; `null` falls back to the managers. */
  recipientEmail: string | null;
}

/** A manager (or a deactivated tenant) cancelled the subscription (docs/DOMAIN_EVENTS.md § SubscriptionCancelled). */
export class SubscriptionCancelled extends DomainEvent<SubscriptionCancelledData> {
  readonly eventVersion = 1;
  readonly data: SubscriptionCancelledData;

  constructor(tenantId: string, correlationId: string, data: SubscriptionCancelledData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}

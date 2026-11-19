import { DomainEvent } from '../../../../shared/domain/domain-event';

interface SubscriptionPastDueData extends Record<string, unknown> {
  subscriptionId: string;
  /** ISO-8601 UTC. */
  pastDueSince: string;
  /** ISO-8601 UTC: when the grace ends and the sweep suspends. */
  suspendsAt: string;
  /** The billing email, resolved by Billing at publish time; `null` falls back to the managers. */
  recipientEmail: string | null;
}

/** A `PERIOD` charge of an `ACTIVE` subscription went `OVERDUE` (docs/DOMAIN_EVENTS.md § SubscriptionPastDue). */
export class SubscriptionPastDue extends DomainEvent<SubscriptionPastDueData> {
  readonly eventVersion = 1;
  readonly data: SubscriptionPastDueData;

  constructor(tenantId: string, correlationId: string, data: SubscriptionPastDueData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}

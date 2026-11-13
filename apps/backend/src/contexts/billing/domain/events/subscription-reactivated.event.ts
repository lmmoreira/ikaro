import { DomainEvent } from '../../../../shared/domain/domain-event';

interface SubscriptionReactivatedData extends Record<string, unknown> {
  subscriptionId: string;
  /** ISO-8601 UTC. */
  reactivatedAt: string;
  /** ISO-8601 UTC: the start of the suspension span that just ended (the subscription clears it). */
  suspendedAt: string;
}

/** A `SUSPENDED` subscription became operational again (docs/DOMAIN_EVENTS.md § SubscriptionReactivated). */
export class SubscriptionReactivated extends DomainEvent<SubscriptionReactivatedData> {
  readonly eventVersion = 1;
  readonly data: SubscriptionReactivatedData;

  constructor(tenantId: string, correlationId: string, data: SubscriptionReactivatedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}

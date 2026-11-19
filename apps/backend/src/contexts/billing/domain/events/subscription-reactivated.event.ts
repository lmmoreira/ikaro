import { DomainEvent } from '../../../../shared/domain/domain-event';

interface SubscriptionReactivatedData extends Record<string, unknown> {
  subscriptionId: string;
  /** ISO-8601 UTC. */
  reactivatedAt: string;
  /** ISO-8601 UTC: the start of the suspension span that just ended (the subscription clears it). */
  suspendedAt: string;
  /** The billing email, resolved by Billing; `null` when unset or for an exempt subscription. */
  recipientEmail: string | null;
  /**
   * The subscription is exempt: it was made free by the operator (UC-137). An exempt tenant is
   * never emailed about billing, so Notification skips the email when this is `true`; a `null`
   * `recipientEmail` alone means "no billing email set" and falls back to the managers.
   */
  exempt: boolean;
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

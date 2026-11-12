import { DomainEvent } from '../../../../shared/domain/domain-event';
import type { SuspensionReason } from '../subscription.types';

interface SubscriptionSuspendedData extends Record<string, unknown> {
  subscriptionId: string;
  reason: SuspensionReason;
  /** ISO-8601 UTC: the start of the suspension, and of its clean-up clock. */
  suspendedAt: string;
  /**
   * ISO-8601 UTC: the earliest date the clean-up may begin (`suspendedAt` + 90 days for a tenant
   * that never paid, + 180 for one that did). Informational until M27's purge acts on it.
   */
  purgeAt: string;
}

/** A subscription became `SUSPENDED` (docs/DOMAIN_EVENTS.md § SubscriptionSuspended). */
export class SubscriptionSuspended extends DomainEvent<SubscriptionSuspendedData> {
  readonly eventVersion = 1;
  readonly data: SubscriptionSuspendedData;

  constructor(tenantId: string, correlationId: string, data: SubscriptionSuspendedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}

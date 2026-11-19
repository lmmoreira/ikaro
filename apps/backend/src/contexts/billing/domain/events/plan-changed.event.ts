import { DomainEvent } from '../../../../shared/domain/domain-event';
import type { SubscriptionCycle } from '../subscription.types';

export interface PlanChangedItem extends Record<string, unknown> {
  featureKey: string;
  tier: string;
}

interface PlanChangedData extends Record<string, unknown> {
  subscriptionId: string;
  /** The billing email, resolved by Billing at publish time; `null` falls back to the managers. */
  recipientEmail: string | null;
  /** ISO-8601 UTC; `null` for a selection saved while suspended (it takes effect at the reactivation payment). */
  effectiveFrom: string | null;
  cycle: SubscriptionCycle;
  /** The total in the chosen cycle. */
  newTotalMinor: number;
  added: PlanChangedItem[];
  removed: PlanChangedItem[];
}

/** The manager saved a plan (docs/DOMAIN_EVENTS.md § PlanChanged). */
export class PlanChanged extends DomainEvent<PlanChangedData> {
  readonly eventVersion = 1;
  readonly data: PlanChangedData;

  constructor(tenantId: string, correlationId: string, data: PlanChangedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}

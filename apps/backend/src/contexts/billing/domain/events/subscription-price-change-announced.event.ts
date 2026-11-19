import { DomainEvent } from '../../../../shared/domain/domain-event';
import type { SubscriptionCycle } from '../subscription.types';

export interface PriceChangeEntry extends Record<string, unknown> {
  featureKey: string;
  tier: string;
  cycle: SubscriptionCycle;
  oldAmountMinor: number;
  newAmountMinor: number;
}

interface SubscriptionPriceChangeAnnouncedData extends Record<string, unknown> {
  /** Only the features this tenant actually has. */
  changes: PriceChangeEntry[];
  currency: string;
  /** The tenant-local calendar date, `YYYY-MM-DD`. */
  effectiveFrom: string;
  /** The tenant-local calendar date, `YYYY-MM-DD`. */
  firstAffectedDueDate: string;
  newMonthlyTotalMinor: number;
  batchId: string | null;
  /** The billing email, resolved by Billing at publish time; `null` falls back to the managers. */
  recipientEmail: string | null;
}

/**
 * The operator scheduled a list-price change: one event per affected tenant per adjustment
 * (docs/DOMAIN_EVENTS.md § SubscriptionPriceChangeAnnounced). Published only by M26-S38.
 */
export class SubscriptionPriceChangeAnnounced extends DomainEvent<SubscriptionPriceChangeAnnouncedData> {
  readonly eventVersion = 1;
  readonly data: SubscriptionPriceChangeAnnouncedData;

  constructor(tenantId: string, correlationId: string, data: SubscriptionPriceChangeAnnouncedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}

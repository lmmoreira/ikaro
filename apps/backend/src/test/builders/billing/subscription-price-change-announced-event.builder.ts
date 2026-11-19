import { SubscriptionPriceChangeAnnounced } from '../../../contexts/billing/domain/events/subscription-price-change-announced.event';
import type { PriceChangeEntry } from '../../../contexts/billing/domain/events/subscription-price-change-announced.event';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class SubscriptionPriceChangeAnnouncedEventBuilder {
  private tenantId = uuidv7();
  private correlationId = 'corr-price-change-1';
  private changes: PriceChangeEntry[] = [
    {
      featureKey: 'BOOKING',
      tier: 'BASIC',
      cycle: 'MONTHLY',
      oldAmountMinor: 4990,
      newAmountMinor: 5490,
    },
  ];
  private currency: string = 'BRL';
  private effectiveFrom: string = '2026-03-01';
  private firstAffectedDueDate: string = '2026-03-10';
  private newMonthlyTotalMinor: number = 5490;
  private batchId: string | null = uuidv7();
  private recipientEmail: string | null = 'billing@example.test';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withChanges(changes: PriceChangeEntry[]): this {
    this.changes = changes;
    return this;
  }

  withCurrency(currency: string): this {
    this.currency = currency;
    return this;
  }

  withEffectiveFrom(effectiveFrom: string): this {
    this.effectiveFrom = effectiveFrom;
    return this;
  }

  withFirstAffectedDueDate(firstAffectedDueDate: string): this {
    this.firstAffectedDueDate = firstAffectedDueDate;
    return this;
  }

  withNewMonthlyTotalMinor(newMonthlyTotalMinor: number): this {
    this.newMonthlyTotalMinor = newMonthlyTotalMinor;
    return this;
  }

  withBatchId(batchId: string | null): this {
    this.batchId = batchId;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  build(): SubscriptionPriceChangeAnnounced {
    return new SubscriptionPriceChangeAnnounced(this.tenantId, this.correlationId, {
      changes: this.changes,
      currency: this.currency,
      effectiveFrom: this.effectiveFrom,
      firstAffectedDueDate: this.firstAffectedDueDate,
      newMonthlyTotalMinor: this.newMonthlyTotalMinor,
      batchId: this.batchId,
      recipientEmail: this.recipientEmail,
    });
  }
}

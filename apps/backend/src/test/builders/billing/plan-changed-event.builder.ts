import { PlanChanged } from '../../../contexts/billing/domain/events/plan-changed.event';
import type { PlanChangedItem } from '../../../contexts/billing/domain/events/plan-changed.event';
import type { SubscriptionCycle } from '../../../contexts/billing/domain/subscription.types';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class PlanChangedEventBuilder {
  private tenantId = uuidv7();
  private correlationId = 'corr-plan-changed-1';
  private subscriptionId: string = uuidv7();
  private recipientEmail: string | null = 'billing@example.test';
  private effectiveFrom: Date | null = new Date(Date.now() + 24 * 60 * 60 * 1000);
  private cycle: SubscriptionCycle = 'MONTHLY';
  private newTotalMinor: number = 9990;
  private currency = 'BRL';
  private added: PlanChangedItem[] = [{ featureKey: 'BOOKING', tier: 'BASIC' }];
  private removed: PlanChangedItem[] = [];

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withSubscriptionId(subscriptionId: string): this {
    this.subscriptionId = subscriptionId;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  withEffectiveFrom(effectiveFrom: Date | null): this {
    this.effectiveFrom = effectiveFrom;
    return this;
  }

  withCycle(cycle: SubscriptionCycle): this {
    this.cycle = cycle;
    return this;
  }

  withNewTotalMinor(newTotalMinor: number): this {
    this.newTotalMinor = newTotalMinor;
    return this;
  }

  withCurrency(currency: string): this {
    this.currency = currency;
    return this;
  }

  withAdded(added: PlanChangedItem[]): this {
    this.added = added;
    return this;
  }

  withRemoved(removed: PlanChangedItem[]): this {
    this.removed = removed;
    return this;
  }

  build(): PlanChanged {
    return new PlanChanged(this.tenantId, this.correlationId, {
      subscriptionId: this.subscriptionId,
      recipientEmail: this.recipientEmail,
      effectiveFrom: this.effectiveFrom?.toISOString() ?? null,
      cycle: this.cycle,
      newTotalMinor: this.newTotalMinor,
      currency: this.currency,
      added: this.added,
      removed: this.removed,
    });
  }
}

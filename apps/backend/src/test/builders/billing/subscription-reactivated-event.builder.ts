import { SubscriptionReactivated } from '../../../contexts/billing/domain/events/subscription-reactivated.event';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class SubscriptionReactivatedEventBuilder {
  private tenantId = uuidv7();
  private correlationId = 'corr-reactivated-1';
  private subscriptionId = uuidv7();
  // Relative to now, never a calendar date (docs/ENGINEERING_RULES_TESTING.md).
  private suspendedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  private reactivatedAt = new Date(Date.now() - 60_000);

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

  withSuspendedAt(suspendedAt: Date): this {
    this.suspendedAt = suspendedAt;
    return this;
  }

  withReactivatedAt(reactivatedAt: Date): this {
    this.reactivatedAt = reactivatedAt;
    return this;
  }

  build(): SubscriptionReactivated {
    return new SubscriptionReactivated(this.tenantId, this.correlationId, {
      subscriptionId: this.subscriptionId,
      reactivatedAt: this.reactivatedAt.toISOString(),
      suspendedAt: this.suspendedAt.toISOString(),
    });
  }
}

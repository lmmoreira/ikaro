import { SubscriptionSuspended } from '../../../contexts/billing/domain/events/subscription-suspended.event';
import type { SuspensionReason } from '../../../contexts/billing/domain/subscription.types';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class SubscriptionSuspendedEventBuilder {
  private tenantId = uuidv7();
  private correlationId = 'corr-suspended-1';
  private subscriptionId = uuidv7();
  private reason: SuspensionReason = 'OPERATOR';
  // Relative to now, never a calendar date (docs/ENGINEERING_RULES_TESTING.md).
  private suspendedAt = new Date(Date.now() - 60_000);
  private purgeAt = new Date(this.suspendedAt.getTime() + 90 * 24 * 60 * 60 * 1000);

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

  withReason(reason: SuspensionReason): this {
    this.reason = reason;
    return this;
  }

  withSuspendedAt(suspendedAt: Date): this {
    this.suspendedAt = suspendedAt;
    return this;
  }

  withPurgeAt(purgeAt: Date): this {
    this.purgeAt = purgeAt;
    return this;
  }

  build(): SubscriptionSuspended {
    return new SubscriptionSuspended(this.tenantId, this.correlationId, {
      subscriptionId: this.subscriptionId,
      reason: this.reason,
      suspendedAt: this.suspendedAt.toISOString(),
      purgeAt: this.purgeAt.toISOString(),
    });
  }
}

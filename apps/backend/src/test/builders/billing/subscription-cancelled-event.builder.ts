import { SubscriptionCancelled } from '../../../contexts/billing/domain/events/subscription-cancelled.event';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class SubscriptionCancelledEventBuilder {
  private tenantId = uuidv7();
  private correlationId = 'corr-cancelled-1';
  private subscriptionId: string = uuidv7();
  private cancelAt: Date = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  private immediate: boolean = false;
  private recipientEmail: string | null = 'billing@example.test';

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

  withCancelAt(cancelAt: Date): this {
    this.cancelAt = cancelAt;
    return this;
  }

  withImmediate(immediate: boolean): this {
    this.immediate = immediate;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  build(): SubscriptionCancelled {
    return new SubscriptionCancelled(this.tenantId, this.correlationId, {
      subscriptionId: this.subscriptionId,
      cancelAt: this.cancelAt.toISOString(),
      immediate: this.immediate,
      recipientEmail: this.recipientEmail,
    });
  }
}

import { SubscriptionPastDue } from '../../../contexts/billing/domain/events/subscription-past-due.event';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class SubscriptionPastDueEventBuilder {
  private tenantId = uuidv7();
  private correlationId = 'corr-past-due-1';
  private subscriptionId: string = uuidv7();
  private pastDueSince: Date = new Date(Date.now() - 60_000);
  private suspendsAt: Date = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
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

  withPastDueSince(pastDueSince: Date): this {
    this.pastDueSince = pastDueSince;
    return this;
  }

  withSuspendsAt(suspendsAt: Date): this {
    this.suspendsAt = suspendsAt;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  build(): SubscriptionPastDue {
    return new SubscriptionPastDue(this.tenantId, this.correlationId, {
      subscriptionId: this.subscriptionId,
      pastDueSince: this.pastDueSince.toISOString(),
      suspendsAt: this.suspendsAt.toISOString(),
      recipientEmail: this.recipientEmail,
    });
  }
}

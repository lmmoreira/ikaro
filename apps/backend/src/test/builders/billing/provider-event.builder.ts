import { uuidv7 } from '../../../shared/domain/uuid-v7';
import type { BillingProvider } from '../../../contexts/billing/domain/billing-account.aggregate';
import type { ProviderEvent } from '../../../contexts/billing/domain/provider-event';

export class ProviderEventBuilder {
  private provider: BillingProvider = 'ASAAS';
  private eventId = `evt_${uuidv7()}`;
  private tenantId = uuidv7();
  private eventType = 'PaymentConfirmed';
  // Relative to now, never a calendar date.
  private receivedAt = new Date(Date.now() - 1000);
  private processedAt = new Date(Date.now());

  withProvider(provider: BillingProvider): this {
    this.provider = provider;
    return this;
  }

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withEventType(eventType: string): this {
    this.eventType = eventType;
    return this;
  }

  withReceivedAt(receivedAt: Date): this {
    this.receivedAt = receivedAt;
    return this;
  }

  withProcessedAt(processedAt: Date): this {
    this.processedAt = processedAt;
    return this;
  }

  build(): ProviderEvent {
    return {
      provider: this.provider,
      eventId: this.eventId,
      tenantId: this.tenantId,
      eventType: this.eventType,
      receivedAt: this.receivedAt,
      processedAt: this.processedAt,
    };
  }
}

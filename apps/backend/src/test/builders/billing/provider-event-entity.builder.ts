import { ProviderEventEntity } from '../../../contexts/billing/infrastructure/entities/provider-event.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class ProviderEventEntityBuilder {
  private provider = 'ASAAS';
  private eventId = `evt_${uuidv7()}`;
  private tenantId = uuidv7();
  private eventType = 'PaymentConfirmed';
  private receivedAt = new Date(Date.now() - 1000);
  private processedAt = new Date(Date.now());

  withProvider(provider: string): this {
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

  build(): ProviderEventEntity {
    const e = new ProviderEventEntity();
    e.provider = this.provider;
    e.eventId = this.eventId;
    e.tenantId = this.tenantId;
    e.eventType = this.eventType;
    e.receivedAt = this.receivedAt;
    e.processedAt = this.processedAt;
    return e;
  }
}

import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { OutboxEventEntity } from '../../../shared/infrastructure/outbox/outbox-event.entity';

export class OutboxEventEntityBuilder {
  private id = uuidv7();
  private dedupKey = uuidv7();
  private tenantId = '10000000-0000-4000-8000-000000000001';
  private eventName = 'StubEvent';
  private payload: Record<string, unknown> = { eventName: 'StubEvent' };
  private createdAt = new Date('2026-01-01T00:00:00Z');
  private publishedAt: Date | null = null;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withDedupKey(dedupKey: string): this {
    this.dedupKey = dedupKey;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withEventName(eventName: string): this {
    this.eventName = eventName;
    return this;
  }

  withPayload(payload: Record<string, unknown>): this {
    this.payload = payload;
    return this;
  }

  withPublishedAt(publishedAt: Date | null): this {
    this.publishedAt = publishedAt;
    return this;
  }

  withCreatedAt(createdAt: Date): this {
    this.createdAt = createdAt;
    return this;
  }

  build(): OutboxEventEntity {
    const e = new OutboxEventEntity();
    e.id = this.id;
    e.dedupKey = this.dedupKey;
    e.tenantId = this.tenantId;
    e.eventName = this.eventName;
    e.payload = this.payload;
    e.createdAt = this.createdAt;
    e.publishedAt = this.publishedAt;
    return e;
  }
}

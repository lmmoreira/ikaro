import { NotificationProcessedEventEntity } from '../../../contexts/notification/infrastructure/entities/processed-event.entity';

export class NotificationProcessedEventEntityBuilder {
  private eventId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private notificationType = 'booking-approved-customer';
  private channel = 'EMAIL';
  private processedAt = new Date('2026-01-01T00:00:00Z');

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  withNotificationType(notificationType: string): this {
    this.notificationType = notificationType;
    return this;
  }

  withChannel(channel: string): this {
    this.channel = channel;
    return this;
  }

  withProcessedAt(processedAt: Date): this {
    this.processedAt = processedAt;
    return this;
  }

  build(): NotificationProcessedEventEntity {
    const entity = new NotificationProcessedEventEntity();
    entity.eventId = this.eventId;
    entity.notificationType = this.notificationType;
    entity.channel = this.channel;
    entity.processedAt = this.processedAt;
    return entity;
  }
}

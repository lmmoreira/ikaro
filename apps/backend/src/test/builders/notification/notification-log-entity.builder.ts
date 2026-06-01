import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { NotificationLogEntity } from '../../../contexts/notification/infrastructure/entities/notification-log.entity';

export class NotificationLogEntityBuilder {
  private id = uuidv7();
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private eventId = 'bbbbbbbb-0000-4000-8000-000000000001';
  private notificationType = 'staff-invitation';
  private channel = 'EMAIL';
  private recipientEmail = 'test@example.com';
  private status = 'SENT';
  private retryCount = 0;
  private errorMessage: string | null = null;
  private sentAt: Date | null = new Date('2026-01-01T00:00:00Z');
  private createdAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

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

  withRecipientEmail(recipientEmail: string): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  withStatus(status: string): this {
    this.status = status;
    return this;
  }

  withRetryCount(retryCount: number): this {
    this.retryCount = retryCount;
    return this;
  }

  withErrorMessage(errorMessage: string | null): this {
    this.errorMessage = errorMessage;
    return this;
  }

  withSentAt(sentAt: Date | null): this {
    this.sentAt = sentAt;
    return this;
  }

  withCreatedAt(createdAt: Date): this {
    this.createdAt = createdAt;
    return this;
  }

  build(): NotificationLogEntity {
    const entity = new NotificationLogEntity();
    entity.id = this.id;
    entity.tenantId = this.tenantId;
    entity.eventId = this.eventId;
    entity.notificationType = this.notificationType;
    entity.channel = this.channel;
    entity.recipientEmail = this.recipientEmail;
    entity.status = this.status;
    entity.retryCount = this.retryCount;
    entity.errorMessage = this.errorMessage;
    entity.sentAt = this.sentAt;
    entity.createdAt = this.createdAt;
    return entity;
  }
}

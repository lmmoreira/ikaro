import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { NotificationTemplateEntity } from '../../../contexts/notification/infrastructure/entities/notification-template.entity';
import { NotificationTemplateKey } from '../../../contexts/notification/domain/notification-template-key.enum';

export class NotificationTemplateEntityBuilder {
  private id = uuidv7();
  private tenantId: string | null = '10000000-0000-4000-8000-000000000001';
  private triggerEvent: NotificationTemplateKey = NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER;
  private channel = 'EMAIL';
  private subject = 'Assunto padrão';
  private body = '<p>Corpo padrão</p>';
  private readonly createdAt = new Date('2026-01-01T00:00:00Z');
  private readonly updatedAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string | null): this {
    this.tenantId = tenantId;
    return this;
  }

  withTriggerEvent(triggerEvent: NotificationTemplateKey): this {
    this.triggerEvent = triggerEvent;
    return this;
  }

  withChannel(channel: string): this {
    this.channel = channel;
    return this;
  }

  withSubject(subject: string): this {
    this.subject = subject;
    return this;
  }

  withBody(body: string): this {
    this.body = body;
    return this;
  }

  asGlobalDefault(): this {
    this.tenantId = null;
    return this;
  }

  build(): NotificationTemplateEntity {
    const e = new NotificationTemplateEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.triggerEvent = this.triggerEvent;
    e.channel = this.channel;
    e.subject = this.subject;
    e.body = this.body;
    e.createdAt = this.createdAt;
    e.updatedAt = this.updatedAt;
    return e;
  }
}

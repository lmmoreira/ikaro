import { NotificationTemplate } from '../../../contexts/notification/domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../contexts/notification/domain/notification-template-key.enum';

export class NotificationTemplateBuilder {
  private tenantId: string | null = '10000000-0000-4000-8000-000000000001';
  private triggerEvent: NotificationTemplateKey = NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER;
  private channel: string = 'EMAIL';
  private locale: string = 'pt-BR';
  private subject: string = 'Assunto padrão';
  private body: string = '<p>Corpo padrão</p>';

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

  withLocale(locale: string): this {
    this.locale = locale;
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

  build(): NotificationTemplate {
    return NotificationTemplate.create({
      tenantId: this.tenantId,
      triggerEvent: this.triggerEvent,
      channel: this.channel as 'EMAIL' | 'SMS' | 'WHATSAPP',
      locale: this.locale,
      subject: this.subject,
      body: this.body,
    });
  }
}

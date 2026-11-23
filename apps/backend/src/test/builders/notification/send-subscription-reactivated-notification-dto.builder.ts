import { SendSubscriptionReactivatedNotificationDto } from '../../../contexts/notification/application/dtos/send-subscription-reactivated-notification.dto';

export class SendSubscriptionReactivatedNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000002601';
  private eventId = 'eeeeeeee-0000-4000-8000-000000002601';
  private correlationId = 'corr-0000-4000-8000-000000002601';
  private exempt: boolean = false;
  private recipientEmail: string | null = 'billing@example.test';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withExempt(exempt: boolean): this {
    this.exempt = exempt;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  build(): SendSubscriptionReactivatedNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      exempt: this.exempt,
      recipientEmail: this.recipientEmail,
    };
  }
}

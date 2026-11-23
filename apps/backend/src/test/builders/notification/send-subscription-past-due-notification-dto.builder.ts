import { SendSubscriptionPastDueNotificationDto } from '../../../contexts/notification/application/dtos/send-subscription-past-due-notification.dto';

export class SendSubscriptionPastDueNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000002601';
  private eventId = 'eeeeeeee-0000-4000-8000-000000002601';
  private correlationId = 'corr-0000-4000-8000-000000002601';
  private suspendsAt: string = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString();
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

  withSuspendsAt(suspendsAt: string): this {
    this.suspendsAt = suspendsAt;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  build(): SendSubscriptionPastDueNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      suspendsAt: this.suspendsAt,
      recipientEmail: this.recipientEmail,
    };
  }
}

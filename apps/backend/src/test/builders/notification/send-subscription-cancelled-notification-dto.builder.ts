import { SendSubscriptionCancelledNotificationDto } from '../../../contexts/notification/application/dtos/send-subscription-cancelled-notification.dto';

export class SendSubscriptionCancelledNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000002601';
  private eventId = 'eeeeeeee-0000-4000-8000-000000002601';
  private correlationId = 'corr-0000-4000-8000-000000002601';
  private immediate: boolean = false;
  private cancelAt: string = '2026-12-31T03:00:00.000Z';
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

  withImmediate(immediate: boolean): this {
    this.immediate = immediate;
    return this;
  }

  withCancelAt(cancelAt: string): this {
    this.cancelAt = cancelAt;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  build(): SendSubscriptionCancelledNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      immediate: this.immediate,
      cancelAt: this.cancelAt,
      recipientEmail: this.recipientEmail,
    };
  }
}

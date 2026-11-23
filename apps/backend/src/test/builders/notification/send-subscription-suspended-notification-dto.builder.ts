import { SendSubscriptionSuspendedNotificationDto } from '../../../contexts/notification/application/dtos/send-subscription-suspended-notification.dto';

export class SendSubscriptionSuspendedNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000002601';
  private eventId = 'eeeeeeee-0000-4000-8000-000000002601';
  private correlationId = 'corr-0000-4000-8000-000000002601';
  private reason: 'NON_PAYMENT' | 'CANCELED' | 'PAYMENT_REVERSED' | 'OPERATOR' = 'NON_PAYMENT';
  private purgeAt: string = '2027-03-20T03:00:00.000Z';
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

  withReason(reason: 'NON_PAYMENT' | 'CANCELED' | 'PAYMENT_REVERSED' | 'OPERATOR'): this {
    this.reason = reason;
    return this;
  }

  withPurgeAt(purgeAt: string): this {
    this.purgeAt = purgeAt;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  build(): SendSubscriptionSuspendedNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      reason: this.reason,
      purgeAt: this.purgeAt,
      recipientEmail: this.recipientEmail,
    };
  }
}

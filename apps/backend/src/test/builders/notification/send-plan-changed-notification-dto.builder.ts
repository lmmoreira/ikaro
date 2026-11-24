import { SendPlanChangedNotificationDto } from '../../../contexts/notification/application/dtos/send-plan-changed-notification.dto';

export class SendPlanChangedNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000002601';
  private eventId = 'eeeeeeee-0000-4000-8000-000000002601';
  private correlationId = 'corr-0000-4000-8000-000000002601';
  private newTotalMinor: number = 9990;
  private currency: string = 'BRL';
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

  withNewTotalMinor(newTotalMinor: number): this {
    this.newTotalMinor = newTotalMinor;
    return this;
  }

  withCurrency(currency: string): this {
    this.currency = currency;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  build(): SendPlanChangedNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      newTotalMinor: this.newTotalMinor,
      currency: this.currency,
      recipientEmail: this.recipientEmail,
    };
  }
}

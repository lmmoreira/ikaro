import { SendChargePaidNotificationDto } from '../../../contexts/notification/application/dtos/send-charge-paid-notification.dto';

export class SendChargePaidNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000002601';
  private eventId = 'eeeeeeee-0000-4000-8000-000000002601';
  private correlationId = 'corr-0000-4000-8000-000000002601';
  private amountMinor: number = 4900;
  private currency: string = 'BRL';
  private paidAt: string = new Date(Date.now() + 0 * 24 * 60 * 60 * 1000).toISOString();
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

  withAmountMinor(amountMinor: number): this {
    this.amountMinor = amountMinor;
    return this;
  }

  withCurrency(currency: string): this {
    this.currency = currency;
    return this;
  }

  withPaidAt(paidAt: string): this {
    this.paidAt = paidAt;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  build(): SendChargePaidNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      amountMinor: this.amountMinor,
      currency: this.currency,
      paidAt: this.paidAt,
      recipientEmail: this.recipientEmail,
    };
  }
}

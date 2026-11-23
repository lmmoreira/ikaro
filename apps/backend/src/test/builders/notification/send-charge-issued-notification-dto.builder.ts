import { SendChargeIssuedNotificationDto } from '../../../contexts/notification/application/dtos/send-charge-issued-notification.dto';

export class SendChargeIssuedNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000002601';
  private eventId = 'eeeeeeee-0000-4000-8000-000000002601';
  private correlationId = 'corr-0000-4000-8000-000000002601';
  private kind: 'PERIOD' | 'RECOVERY' = 'PERIOD';
  private dueDate: string = '2026-12-10';
  private amountMinor: number = 4900;
  private currency: string = 'BRL';
  private paymentUrl: string = 'https://pay.example.test/charge-1';
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

  withKind(kind: 'PERIOD' | 'RECOVERY'): this {
    this.kind = kind;
    return this;
  }

  withDueDate(dueDate: string): this {
    this.dueDate = dueDate;
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

  withPaymentUrl(paymentUrl: string): this {
    this.paymentUrl = paymentUrl;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  build(): SendChargeIssuedNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      kind: this.kind,
      dueDate: this.dueDate,
      amountMinor: this.amountMinor,
      currency: this.currency,
      paymentUrl: this.paymentUrl,
      recipientEmail: this.recipientEmail,
    };
  }
}

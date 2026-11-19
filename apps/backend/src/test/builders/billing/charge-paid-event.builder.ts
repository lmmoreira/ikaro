import { ChargePaid } from '../../../contexts/billing/domain/events/charge-paid.event';
import type { PaymentMethod } from '../../../contexts/billing/domain/provider-events';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class ChargePaidEventBuilder {
  private tenantId = uuidv7();
  private correlationId = 'corr-charge-paid-1';
  private chargeId: string = uuidv7();
  private amountMinor: number = 4990;
  private currency: string = 'BRL';
  private method: PaymentMethod = 'PIX';
  private paidAt: Date = new Date(Date.now() - 60_000);
  private receiptUrl: string | null = 'https://receipt.example.test/charge-1';
  private recipientEmail: string | null = 'billing@example.test';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withChargeId(chargeId: string): this {
    this.chargeId = chargeId;
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

  withMethod(method: PaymentMethod): this {
    this.method = method;
    return this;
  }

  withPaidAt(paidAt: Date): this {
    this.paidAt = paidAt;
    return this;
  }

  withReceiptUrl(receiptUrl: string | null): this {
    this.receiptUrl = receiptUrl;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  build(): ChargePaid {
    return new ChargePaid(this.tenantId, this.correlationId, {
      chargeId: this.chargeId,
      amountMinor: this.amountMinor,
      currency: this.currency,
      method: this.method,
      paidAt: this.paidAt.toISOString(),
      receiptUrl: this.receiptUrl,
      recipientEmail: this.recipientEmail,
    });
  }
}

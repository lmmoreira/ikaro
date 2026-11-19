import { BillingReminderDue } from '../../../contexts/billing/domain/commands/billing-reminder-due.command';
import type { BillingReminderKind } from '../../../contexts/billing/domain/commands/billing-reminder-due.command';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class BillingReminderDueCommandBuilder {
  private tenantId = uuidv7();
  private correlationId = 'corr-reminder-1';
  private subscriptionId: string = 'subscription-1';
  private kind: BillingReminderKind = 'CHARGE_DUE_SOON';
  private daysOffset: number = 3;
  private chargeId: string | null = 'charge-1';
  private paymentUrl: string | null = 'https://pay.example.test/charge-1';
  private recipientEmail: string | null = 'billing@example.test';

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withSubscriptionId(subscriptionId: string): this {
    this.subscriptionId = subscriptionId;
    return this;
  }

  withKind(kind: BillingReminderKind): this {
    this.kind = kind;
    return this;
  }

  withDaysOffset(daysOffset: number): this {
    this.daysOffset = daysOffset;
    return this;
  }

  withChargeId(chargeId: string | null): this {
    this.chargeId = chargeId;
    return this;
  }

  withPaymentUrl(paymentUrl: string | null): this {
    this.paymentUrl = paymentUrl;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  build(): BillingReminderDue {
    return new BillingReminderDue(this.tenantId, this.correlationId, {
      subscriptionId: this.subscriptionId,
      kind: this.kind,
      daysOffset: this.daysOffset,
      chargeId: this.chargeId,
      paymentUrl: this.paymentUrl,
      recipientEmail: this.recipientEmail,
    });
  }
}

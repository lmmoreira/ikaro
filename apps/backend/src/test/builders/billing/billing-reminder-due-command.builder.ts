import { BillingReminderDue } from '../../../contexts/billing/domain/commands/billing-reminder-due.command';
import type { BillingReminderKind } from '../../../contexts/billing/domain/commands/billing-reminder-due.command';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { addDaysUTC, todayUTC } from '../../../shared/utils/calendar-date';

export class BillingReminderDueCommandBuilder {
  private tenantId = uuidv7();
  private correlationId = 'corr-reminder-1';
  private subscriptionId: string = 'subscription-1';
  private kind: BillingReminderKind = 'CHARGE_DUE_SOON';
  private daysOffset: number = 3;
  private chargeId: string | null = 'charge-1';
  private paymentUrl: string | null = 'https://pay.example.test/charge-1';
  private recipientEmail: string | null = 'billing@example.test';
  private dueDate: string | null = addDaysUTC(todayUTC(), 3);
  private trialEndsOn: string | null = null;
  private suspendsOn: string | null = null;
  private amountMinor: number | null = 4900;
  private currency: string | null = 'BRL';

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

  withDueDate(dueDate: string | null): this {
    this.dueDate = dueDate;
    return this;
  }

  withTrialEndsOn(trialEndsOn: string | null): this {
    this.trialEndsOn = trialEndsOn;
    return this;
  }

  withSuspendsOn(suspendsOn: string | null): this {
    this.suspendsOn = suspendsOn;
    return this;
  }

  withAmount(amountMinor: number | null, currency: string | null): this {
    this.amountMinor = amountMinor;
    this.currency = currency;
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
      dueDate: this.dueDate,
      trialEndsOn: this.trialEndsOn,
      suspendsOn: this.suspendsOn,
      amountMinor: this.amountMinor,
      currency: this.currency,
    });
  }
}

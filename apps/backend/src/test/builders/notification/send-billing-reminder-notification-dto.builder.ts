import { SendBillingReminderNotificationDto } from '../../../contexts/notification/application/dtos/send-billing-reminder-notification.dto';

export class SendBillingReminderNotificationDtoBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000002601';
  private eventId = 'eeeeeeee-0000-4000-8000-000000002601';
  private correlationId = 'corr-0000-4000-8000-000000002601';
  private kind:
    | 'PLAN_CONFIRMATION'
    | 'TRIAL_ENDING'
    | 'CHARGE_DUE_SOON'
    | 'CHARGE_OVERDUE'
    | 'RECOVERY_CHARGE_OPEN' = 'CHARGE_DUE_SOON';
  private dueDate: string | null = '2026-12-10';
  private trialEndsOn: string | null = null;
  private suspendsOn: string | null = null;
  private amountMinor: number | null = 4900;
  private currency: string | null = 'BRL';
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

  withKind(
    kind:
      | 'PLAN_CONFIRMATION'
      | 'TRIAL_ENDING'
      | 'CHARGE_DUE_SOON'
      | 'CHARGE_OVERDUE'
      | 'RECOVERY_CHARGE_OPEN',
  ): this {
    this.kind = kind;
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

  withAmountMinor(amountMinor: number | null): this {
    this.amountMinor = amountMinor;
    return this;
  }

  withCurrency(currency: string | null): this {
    this.currency = currency;
    return this;
  }

  withRecipientEmail(recipientEmail: string | null): this {
    this.recipientEmail = recipientEmail;
    return this;
  }

  build(): SendBillingReminderNotificationDto {
    return {
      tenantId: this.tenantId,
      eventId: this.eventId,
      correlationId: this.correlationId,
      kind: this.kind,
      dueDate: this.dueDate,
      trialEndsOn: this.trialEndsOn,
      suspendsOn: this.suspendsOn,
      amountMinor: this.amountMinor,
      currency: this.currency,
      recipientEmail: this.recipientEmail,
    };
  }
}

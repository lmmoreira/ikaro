import { Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendBillingReminderNotificationDto } from '../../dtos/send-billing-reminder-notification.dto';
import {
  BaseBillingNotificationUseCase,
  BillingEmailResult,
  requireBillingField,
} from '../base-billing-notification.use-case';

export interface SendBillingReminderNotificationUseCaseInput {
  tenantId: SendBillingReminderNotificationDto['tenantId'];
  eventId: SendBillingReminderNotificationDto['eventId'];
  correlationId: SendBillingReminderNotificationDto['correlationId'];
  kind: SendBillingReminderNotificationDto['kind'];
  dueDate: SendBillingReminderNotificationDto['dueDate'];
  trialEndsOn: SendBillingReminderNotificationDto['trialEndsOn'];
  suspendsOn: SendBillingReminderNotificationDto['suspendsOn'];
  amountMinor: SendBillingReminderNotificationDto['amountMinor'];
  currency: SendBillingReminderNotificationDto['currency'];
  recipientEmail: SendBillingReminderNotificationDto['recipientEmail'];
}
export type SendBillingReminderNotificationUseCaseResult = BillingEmailResult;

const TRIAL_KEYS = {
  PLAN_CONFIRMATION: NotificationTemplateKey.BILLING_REMINDER_PLAN_CONFIRMATION,
  TRIAL_ENDING: NotificationTemplateKey.BILLING_REMINDER_TRIAL_ENDING,
} as const;

const CHARGE_KEYS = {
  CHARGE_DUE_SOON: NotificationTemplateKey.BILLING_REMINDER_CHARGE_DUE_SOON,
  CHARGE_OVERDUE: NotificationTemplateKey.BILLING_REMINDER_CHARGE_OVERDUE,
  RECOVERY_CHARGE_OPEN: NotificationTemplateKey.BILLING_REMINDER_RECOVERY_CHARGE_OPEN,
} as const;

// The dunning emails (UC-124, UC-139): one template key per reminder kind. Every date and the amount
// come from the command; one the kind needs but the command lacks throws instead of printing a blank.
@Injectable()
export class SendBillingReminderNotificationUseCase extends BaseBillingNotificationUseCase {
  async execute(
    input: SendBillingReminderNotificationUseCaseInput,
  ): Promise<SendBillingReminderNotificationUseCaseResult> {
    const { kind } = input;
    const emailSent =
      kind === 'PLAN_CONFIRMATION' || kind === 'TRIAL_ENDING'
        ? await this.sendTrial(TRIAL_KEYS[kind], input)
        : await this.sendCharge(CHARGE_KEYS[kind], input);
    return { emailSent };
  }

  private sendTrial(
    key:
      | NotificationTemplateKey.BILLING_REMINDER_PLAN_CONFIRMATION
      | NotificationTemplateKey.BILLING_REMINDER_TRIAL_ENDING,
    input: SendBillingReminderNotificationUseCaseInput,
  ): Promise<boolean> {
    const trialEndsOn = requireBillingField(input.trialEndsOn, 'trialEndsOn');
    return this.sendBillingEmail({
      key,
      dto: input,
      recipientEmail: input.recipientEmail,
      buildVariables: (ctx) => ({
        tenantName: ctx.tenantName,
        trialEndsOn: ctx.calendarDate(trialEndsOn),
        billingUrl: ctx.billingUrl,
      }),
    });
  }

  private sendCharge(
    key:
      | NotificationTemplateKey.BILLING_REMINDER_CHARGE_DUE_SOON
      | NotificationTemplateKey.BILLING_REMINDER_CHARGE_OVERDUE
      | NotificationTemplateKey.BILLING_REMINDER_RECOVERY_CHARGE_OPEN,
    input: SendBillingReminderNotificationUseCaseInput,
  ): Promise<boolean> {
    const dueDate = requireBillingField(input.dueDate, 'dueDate');
    const amountMinor = requireBillingField(input.amountMinor, 'amountMinor');
    const currency = requireBillingField(input.currency, 'currency');
    return this.sendBillingEmail({
      key,
      dto: input,
      recipientEmail: input.recipientEmail,
      buildVariables: (ctx) => ({
        tenantName: ctx.tenantName,
        amount: ctx.money(amountMinor, currency),
        dueDate: ctx.calendarDate(dueDate),
        billingUrl: ctx.billingUrl,
      }),
    });
  }
}

import { Injectable } from '@nestjs/common';
import { escapeHtml } from '../../../../../shared/utils/escape-html';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendChargeIssuedNotificationDto } from '../../dtos/send-charge-issued-notification.dto';
import {
  BaseBillingNotificationUseCase,
  BillingEmailResult,
} from '../base-billing-notification.use-case';

export interface SendChargeIssuedNotificationUseCaseInput {
  tenantId: SendChargeIssuedNotificationDto['tenantId'];
  eventId: SendChargeIssuedNotificationDto['eventId'];
  correlationId: SendChargeIssuedNotificationDto['correlationId'];
  kind: SendChargeIssuedNotificationDto['kind'];
  dueDate: SendChargeIssuedNotificationDto['dueDate'];
  amountMinor: SendChargeIssuedNotificationDto['amountMinor'];
  currency: SendChargeIssuedNotificationDto['currency'];
  paymentUrl: SendChargeIssuedNotificationDto['paymentUrl'];
  recipientEmail: SendChargeIssuedNotificationDto['recipientEmail'];
}
export type SendChargeIssuedNotificationUseCaseResult = BillingEmailResult;

// The invoice email (UC-124): the payment link comes from the event, the period and recovery charges
// differ in wording, so each has its own template key.
@Injectable()
export class SendChargeIssuedNotificationUseCase extends BaseBillingNotificationUseCase {
  async execute(
    input: SendChargeIssuedNotificationUseCaseInput,
  ): Promise<SendChargeIssuedNotificationUseCaseResult> {
    const key =
      input.kind === 'RECOVERY'
        ? NotificationTemplateKey.CHARGE_ISSUED_RECOVERY
        : NotificationTemplateKey.CHARGE_ISSUED_PERIOD;
    const emailSent = await this.sendBillingEmail({
      key,
      dto: input,
      recipientEmail: input.recipientEmail,
      buildVariables: (ctx) => ({
        tenantName: ctx.tenantName,
        amount: ctx.money(input.amountMinor, input.currency),
        dueDate: ctx.calendarDate(input.dueDate),
        paymentUrl: escapeHtml(input.paymentUrl),
      }),
    });
    return { emailSent };
  }
}

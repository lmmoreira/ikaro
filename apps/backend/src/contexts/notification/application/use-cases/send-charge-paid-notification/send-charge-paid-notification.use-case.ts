import { Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendChargePaidNotificationDto } from '../../dtos/send-charge-paid-notification.dto';
import {
  BaseBillingNotificationUseCase,
  BillingEmailResult,
} from '../base-billing-notification.use-case';

export interface SendChargePaidNotificationUseCaseInput {
  tenantId: SendChargePaidNotificationDto['tenantId'];
  eventId: SendChargePaidNotificationDto['eventId'];
  correlationId: SendChargePaidNotificationDto['correlationId'];
  amountMinor: SendChargePaidNotificationDto['amountMinor'];
  currency: SendChargePaidNotificationDto['currency'];
  paidAt: SendChargePaidNotificationDto['paidAt'];
  recipientEmail: SendChargePaidNotificationDto['recipientEmail'];
}
export type SendChargePaidNotificationUseCaseResult = BillingEmailResult;

// The receipt email (UC-124): the tenant-local day the payment was confirmed.
@Injectable()
export class SendChargePaidNotificationUseCase extends BaseBillingNotificationUseCase {
  async execute(
    input: SendChargePaidNotificationUseCaseInput,
  ): Promise<SendChargePaidNotificationUseCaseResult> {
    const emailSent = await this.sendBillingEmail({
      key: NotificationTemplateKey.CHARGE_PAID,
      dto: input,
      recipientEmail: input.recipientEmail,
      buildVariables: (ctx) => ({
        tenantName: ctx.tenantName,
        amount: ctx.money(input.amountMinor, input.currency),
        paidDate: ctx.instantDate(input.paidAt),
      }),
    });
    return { emailSent };
  }
}

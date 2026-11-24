import { Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendPlanChangedNotificationDto } from '../../dtos/send-plan-changed-notification.dto';
import {
  BaseBillingNotificationUseCase,
  BillingEmailResult,
} from '../base-billing-notification.use-case';

export interface SendPlanChangedNotificationUseCaseInput {
  tenantId: SendPlanChangedNotificationDto['tenantId'];
  eventId: SendPlanChangedNotificationDto['eventId'];
  correlationId: SendPlanChangedNotificationDto['correlationId'];
  newTotalMinor: SendPlanChangedNotificationDto['newTotalMinor'];
  currency: SendPlanChangedNotificationDto['currency'];
  recipientEmail: SendPlanChangedNotificationDto['recipientEmail'];
}
export type SendPlanChangedNotificationUseCaseResult = BillingEmailResult;

// The plan-change email (UC-124). It names the new total and links the plan page, never a date: a
// selection saved while suspended has no effective date (UC-136 A14), and one copy reads right for both.
@Injectable()
export class SendPlanChangedNotificationUseCase extends BaseBillingNotificationUseCase {
  async execute(
    input: SendPlanChangedNotificationUseCaseInput,
  ): Promise<SendPlanChangedNotificationUseCaseResult> {
    const emailSent = await this.sendBillingEmail({
      key: NotificationTemplateKey.PLAN_CHANGED,
      dto: input,
      recipientEmail: input.recipientEmail,
      buildVariables: (ctx) => ({
        tenantName: ctx.tenantName,
        newTotal: ctx.money(input.newTotalMinor, input.currency),
        billingUrl: ctx.billingUrl,
      }),
    });
    return { emailSent };
  }
}

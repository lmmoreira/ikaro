import { Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendSubscriptionPastDueNotificationDto } from '../../dtos/send-subscription-past-due-notification.dto';
import {
  BaseBillingNotificationUseCase,
  BillingEmailResult,
} from '../base-billing-notification.use-case';

export interface SendSubscriptionPastDueNotificationUseCaseInput {
  tenantId: SendSubscriptionPastDueNotificationDto['tenantId'];
  eventId: SendSubscriptionPastDueNotificationDto['eventId'];
  correlationId: SendSubscriptionPastDueNotificationDto['correlationId'];
  suspendsAt: SendSubscriptionPastDueNotificationDto['suspendsAt'];
  recipientEmail: SendSubscriptionPastDueNotificationDto['recipientEmail'];
}
export type SendSubscriptionPastDueNotificationUseCaseResult = BillingEmailResult;

// The grace-period warning (UC-124): says when the suspension starts if the payment stays open.
@Injectable()
export class SendSubscriptionPastDueNotificationUseCase extends BaseBillingNotificationUseCase {
  async execute(
    input: SendSubscriptionPastDueNotificationUseCaseInput,
  ): Promise<SendSubscriptionPastDueNotificationUseCaseResult> {
    const emailSent = await this.sendBillingEmail({
      key: NotificationTemplateKey.SUBSCRIPTION_PAST_DUE,
      dto: input,
      recipientEmail: input.recipientEmail,
      buildVariables: (ctx) => ({
        tenantName: ctx.tenantName,
        suspendsOn: ctx.instantDate(input.suspendsAt),
        billingUrl: ctx.billingUrl,
      }),
    });
    return { emailSent };
  }
}

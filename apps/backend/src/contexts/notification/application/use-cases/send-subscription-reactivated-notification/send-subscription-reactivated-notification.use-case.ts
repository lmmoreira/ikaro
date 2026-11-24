import { Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendSubscriptionReactivatedNotificationDto } from '../../dtos/send-subscription-reactivated-notification.dto';
import {
  BaseBillingNotificationUseCase,
  BillingEmailResult,
} from '../base-billing-notification.use-case';

export interface SendSubscriptionReactivatedNotificationUseCaseInput {
  tenantId: SendSubscriptionReactivatedNotificationDto['tenantId'];
  eventId: SendSubscriptionReactivatedNotificationDto['eventId'];
  correlationId: SendSubscriptionReactivatedNotificationDto['correlationId'];
  exempt: SendSubscriptionReactivatedNotificationDto['exempt'];
  recipientEmail: SendSubscriptionReactivatedNotificationDto['recipientEmail'];
}
export type SendSubscriptionReactivatedNotificationUseCaseResult = BillingEmailResult;

// The reactivation email (UC-124). An exempt subscription is never emailed about billing (decided in
// M26-S03): its event still carries a null recipientEmail, which alone would fall back to the managers.
@Injectable()
export class SendSubscriptionReactivatedNotificationUseCase extends BaseBillingNotificationUseCase {
  async execute(
    input: SendSubscriptionReactivatedNotificationUseCaseInput,
  ): Promise<SendSubscriptionReactivatedNotificationUseCaseResult> {
    if (input.exempt) return { emailSent: false };
    const emailSent = await this.sendBillingEmail({
      key: NotificationTemplateKey.SUBSCRIPTION_REACTIVATED,
      dto: input,
      recipientEmail: input.recipientEmail,
      buildVariables: (ctx) => ({ tenantName: ctx.tenantName }),
    });
    return { emailSent };
  }
}

import { Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendSubscriptionCancelledNotificationDto } from '../../dtos/send-subscription-cancelled-notification.dto';
import {
  BaseBillingNotificationUseCase,
  BillingEmailResult,
} from '../base-billing-notification.use-case';

export interface SendSubscriptionCancelledNotificationUseCaseInput {
  tenantId: SendSubscriptionCancelledNotificationDto['tenantId'];
  eventId: SendSubscriptionCancelledNotificationDto['eventId'];
  correlationId: SendSubscriptionCancelledNotificationDto['correlationId'];
  immediate: SendSubscriptionCancelledNotificationDto['immediate'];
  cancelAt: SendSubscriptionCancelledNotificationDto['cancelAt'];
  recipientEmail: SendSubscriptionCancelledNotificationDto['recipientEmail'];
}
export type SendSubscriptionCancelledNotificationUseCaseResult = BillingEmailResult;

// The cancellation email (UC-124): an immediate cancel says access ended, a scheduled one says until when.
@Injectable()
export class SendSubscriptionCancelledNotificationUseCase extends BaseBillingNotificationUseCase {
  async execute(
    input: SendSubscriptionCancelledNotificationUseCaseInput,
  ): Promise<SendSubscriptionCancelledNotificationUseCaseResult> {
    const emailSent = input.immediate
      ? await this.sendBillingEmail({
          key: NotificationTemplateKey.SUBSCRIPTION_CANCELLED_IMMEDIATE,
          dto: input,
          recipientEmail: input.recipientEmail,
          buildVariables: (ctx) => ({ tenantName: ctx.tenantName }),
        })
      : await this.sendBillingEmail({
          key: NotificationTemplateKey.SUBSCRIPTION_CANCELLED_SCHEDULED,
          dto: input,
          recipientEmail: input.recipientEmail,
          buildVariables: (ctx) => ({
            tenantName: ctx.tenantName,
            cancelDate: ctx.instantDate(input.cancelAt),
          }),
        });
    return { emailSent };
  }
}

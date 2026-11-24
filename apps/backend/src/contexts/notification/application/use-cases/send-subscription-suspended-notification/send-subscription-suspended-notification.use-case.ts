import { Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendSubscriptionSuspendedNotificationDto } from '../../dtos/send-subscription-suspended-notification.dto';
import {
  BaseBillingNotificationUseCase,
  BillingEmailResult,
} from '../base-billing-notification.use-case';

export interface SendSubscriptionSuspendedNotificationUseCaseInput {
  tenantId: SendSubscriptionSuspendedNotificationDto['tenantId'];
  eventId: SendSubscriptionSuspendedNotificationDto['eventId'];
  correlationId: SendSubscriptionSuspendedNotificationDto['correlationId'];
  reason: SendSubscriptionSuspendedNotificationDto['reason'];
  purgeAt: SendSubscriptionSuspendedNotificationDto['purgeAt'];
  recipientEmail: SendSubscriptionSuspendedNotificationDto['recipientEmail'];
}
export type SendSubscriptionSuspendedNotificationUseCaseResult = BillingEmailResult;

// The suspension email (UC-124), by reason. CANCELED sends nothing: the manager already gets the
// cancellation email. OPERATOR has no payment link and no reactivation steps: only Ikaro can lift it.
@Injectable()
export class SendSubscriptionSuspendedNotificationUseCase extends BaseBillingNotificationUseCase {
  async execute(
    input: SendSubscriptionSuspendedNotificationUseCaseInput,
  ): Promise<SendSubscriptionSuspendedNotificationUseCaseResult> {
    if (input.reason === 'CANCELED') return { emailSent: false };
    const emailSent =
      input.reason === 'OPERATOR'
        ? await this.sendOperator(input)
        : await this.sendNonPayment(input);
    return { emailSent };
  }

  private sendOperator(input: SendSubscriptionSuspendedNotificationUseCaseInput): Promise<boolean> {
    return this.sendBillingEmail({
      key: NotificationTemplateKey.SUBSCRIPTION_SUSPENDED_OPERATOR,
      dto: input,
      recipientEmail: input.recipientEmail,
      buildVariables: (ctx) => ({ tenantName: ctx.tenantName }),
    });
  }

  private sendNonPayment(
    input: SendSubscriptionSuspendedNotificationUseCaseInput,
  ): Promise<boolean> {
    return this.sendBillingEmail({
      key: NotificationTemplateKey.SUBSCRIPTION_SUSPENDED_NON_PAYMENT,
      dto: input,
      recipientEmail: input.recipientEmail,
      buildVariables: (ctx) => ({
        tenantName: ctx.tenantName,
        purgeDate: ctx.instantDate(input.purgeAt),
        billingUrl: ctx.billingUrl,
      }),
    });
  }
}

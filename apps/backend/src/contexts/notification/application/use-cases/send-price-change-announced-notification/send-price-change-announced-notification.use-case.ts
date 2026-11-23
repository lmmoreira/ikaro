import { Injectable } from '@nestjs/common';
import { escapeHtml } from '../../../../../shared/utils/escape-html';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendPriceChangeAnnouncedNotificationDto } from '../../dtos/send-price-change-announced-notification.dto';
import {
  BaseBillingNotificationUseCase,
  BillingEmailResult,
  BillingEmailContext,
} from '../base-billing-notification.use-case';

export interface SendPriceChangeAnnouncedNotificationUseCaseInput {
  tenantId: SendPriceChangeAnnouncedNotificationDto['tenantId'];
  eventId: SendPriceChangeAnnouncedNotificationDto['eventId'];
  correlationId: SendPriceChangeAnnouncedNotificationDto['correlationId'];
  changes: SendPriceChangeAnnouncedNotificationDto['changes'];
  currency: SendPriceChangeAnnouncedNotificationDto['currency'];
  effectiveFrom: SendPriceChangeAnnouncedNotificationDto['effectiveFrom'];
  newMonthlyTotalMinor: SendPriceChangeAnnouncedNotificationDto['newMonthlyTotalMinor'];
  recipientEmail: SendPriceChangeAnnouncedNotificationDto['recipientEmail'];
}
export type SendPriceChangeAnnouncedNotificationUseCaseResult = BillingEmailResult;

// The consolidated price-change email (UC-124, UC-112): one row per changed item, named from the
// billingFeatures catalog (the raw key when a feature has no label), then the new monthly total.
@Injectable()
export class SendPriceChangeAnnouncedNotificationUseCase extends BaseBillingNotificationUseCase {
  async execute(
    input: SendPriceChangeAnnouncedNotificationUseCaseInput,
  ): Promise<SendPriceChangeAnnouncedNotificationUseCaseResult> {
    const emailSent = await this.sendBillingEmail({
      key: NotificationTemplateKey.SUBSCRIPTION_PRICE_CHANGE_ANNOUNCED,
      dto: input,
      recipientEmail: input.recipientEmail,
      buildVariables: (ctx) => ({
        tenantName: ctx.tenantName,
        changesList: this.changeRows(input, ctx),
        effectiveFrom: ctx.calendarDate(input.effectiveFrom),
        newTotal: ctx.money(input.newMonthlyTotalMinor, input.currency),
        billingUrl: ctx.billingUrl,
      }),
    });
    return { emailSent };
  }

  private changeRows(
    input: SendPriceChangeAnnouncedNotificationUseCaseInput,
    ctx: BillingEmailContext,
  ): string {
    const labels = this.localizationPort.getEmailTableHeaders('billingFeatures', ctx.locale);
    return input.changes
      .map((change) => {
        const label = labels[change.featureKey] ?? change.featureKey;
        const tier = change.tier === 'STANDARD' ? '' : ` (${change.tier})`;
        const from = ctx.money(change.oldAmountMinor, input.currency);
        const to = ctx.money(change.newAmountMinor, input.currency);
        return `<li>${escapeHtml(label + tier)}: ${from} → ${to}</li>`;
      })
      .join('');
  }
}

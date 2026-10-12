import { Injectable } from '@nestjs/common';
import { buildRecurringRenewalUrl } from '@ikaro/types';
import { escapeHtml } from '../../../../../shared/utils/escape-html';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { TemplateVariables } from '../../../domain/notification-template-key.mapping';
import {
  BaseRecurringScheduleCustomerNotificationUseCase,
  RecurringScheduleCustomerNotificationUseCaseResult,
} from '../base-recurring-schedule-customer-notification.use-case';
import {
  buildScheduleSummaryVariables,
  customerVariables,
  RecurringScheduleNotificationContext,
  RecurringScheduleNotificationInput,
  RecurringScheduleSummaryInput,
} from '../recurring-schedule-notification.helpers';

export interface SendRecurringScheduleRenewalNotificationUseCaseInput
  extends RecurringScheduleNotificationInput, RecurringScheduleSummaryInput {
  recurringScheduleId: string;
}

export type SendRecurringScheduleRenewalNotificationUseCaseResult =
  RecurringScheduleCustomerNotificationUseCaseResult;

// UC-070 (M23-S21): tells the customer their recurring schedule is about to end and links to the
// pre-filled renewal form. A customer or service that no longer exists is logged and acknowledged
// by the base class (no throw, no retry loop), so one gone customer never fails a tenant's batch.
@Injectable()
export class SendRecurringScheduleRenewalNotificationUseCase extends BaseRecurringScheduleCustomerNotificationUseCase<SendRecurringScheduleRenewalNotificationUseCaseInput> {
  protected templateKeyFor(): NotificationTemplateKey {
    return NotificationTemplateKey.RECURRING_SCHEDULE_RENEWAL_DUE_CUSTOMER;
  }

  protected variablesFor(
    input: SendRecurringScheduleRenewalNotificationUseCaseInput,
    context: RecurringScheduleNotificationContext,
  ): TemplateVariables<NotificationTemplateKey.RECURRING_SCHEDULE_RENEWAL_DUE_CUSTOMER> {
    const { weekdays, localTime, endsOn } = buildScheduleSummaryVariables(input, context);
    return {
      ...customerVariables(context),
      tenantName: escapeHtml(context.tenantName),
      weekdays,
      localTime,
      endsOn,
      renewalUrl: escapeHtml(
        buildRecurringRenewalUrl(context.hotsiteUrl, input.recurringScheduleId),
      ),
    };
  }
}

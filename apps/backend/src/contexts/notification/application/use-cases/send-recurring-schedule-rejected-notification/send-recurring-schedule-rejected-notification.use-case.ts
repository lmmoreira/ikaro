import { Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  BaseRecurringScheduleCustomerNotificationUseCase,
  RecurringScheduleCustomerNotificationUseCaseResult,
} from '../base-recurring-schedule-customer-notification.use-case';
import { TemplateVariables } from '../../../domain/notification-template-key.mapping';
import {
  customerVariables,
  RecurringScheduleNotificationContext,
  RecurringScheduleNotificationInput,
} from '../recurring-schedule-notification.helpers';

export interface SendRecurringScheduleRejectedNotificationUseCaseInput extends RecurringScheduleNotificationInput {
  // APPROVAL_REJECTED: staff decided no. APPROVAL_EXPIRED: nobody decided in time.
  reason: 'APPROVAL_REJECTED' | 'APPROVAL_EXPIRED';
}

export type SendRecurringScheduleRejectedNotificationUseCaseResult =
  RecurringScheduleCustomerNotificationUseCaseResult;

// UC-071 / UC-070 A5 (M23-S28): tells the customer their request was not accepted or expired
// unanswered — two templates, because the copy differs (an expired request invites them to ask
// again; a rejection never names the staff member who decided).
@Injectable()
export class SendRecurringScheduleRejectedNotificationUseCase extends BaseRecurringScheduleCustomerNotificationUseCase<SendRecurringScheduleRejectedNotificationUseCaseInput> {
  protected templateKeyFor(
    input: SendRecurringScheduleRejectedNotificationUseCaseInput,
  ): NotificationTemplateKey {
    return input.reason === 'APPROVAL_EXPIRED'
      ? NotificationTemplateKey.RECURRING_SCHEDULE_EXPIRED_CUSTOMER
      : NotificationTemplateKey.RECURRING_SCHEDULE_REJECTED_CUSTOMER;
  }

  protected variablesFor(
    _input: SendRecurringScheduleRejectedNotificationUseCaseInput,
    context: RecurringScheduleNotificationContext,
  ): TemplateVariables<
    | NotificationTemplateKey.RECURRING_SCHEDULE_REJECTED_CUSTOMER
    | NotificationTemplateKey.RECURRING_SCHEDULE_EXPIRED_CUSTOMER
  > {
    return customerVariables(context);
  }
}

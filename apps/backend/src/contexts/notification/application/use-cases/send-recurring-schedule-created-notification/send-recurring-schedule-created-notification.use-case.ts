import { Injectable } from '@nestjs/common';
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

export interface SendRecurringScheduleCreatedNotificationUseCaseInput
  extends RecurringScheduleNotificationInput, RecurringScheduleSummaryInput {}

export type SendRecurringScheduleCreatedNotificationUseCaseResult =
  RecurringScheduleCustomerNotificationUseCaseResult;

// UC-070 / UC-071 (M23-S28): the customer's confirmation that a recurring schedule is ACTIVE —
// sent at creation for an AUTO_CONFIRM service and at staff approval for a MANUAL_APPROVAL one.
@Injectable()
export class SendRecurringScheduleCreatedNotificationUseCase extends BaseRecurringScheduleCustomerNotificationUseCase<SendRecurringScheduleCreatedNotificationUseCaseInput> {
  protected templateKeyFor(): NotificationTemplateKey {
    return NotificationTemplateKey.RECURRING_SCHEDULE_CREATED_CUSTOMER;
  }

  protected variablesFor(
    input: SendRecurringScheduleCreatedNotificationUseCaseInput,
    context: RecurringScheduleNotificationContext,
  ): TemplateVariables<NotificationTemplateKey.RECURRING_SCHEDULE_CREATED_CUSTOMER> {
    return {
      ...customerVariables(context),
      tenantName: context.tenantName,
      ...buildScheduleSummaryVariables(input, context),
    };
  }
}

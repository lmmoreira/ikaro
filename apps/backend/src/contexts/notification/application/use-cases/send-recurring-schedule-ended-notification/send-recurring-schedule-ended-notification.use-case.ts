import { Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  BaseRecurringScheduleCustomerNotificationUseCase,
  RecurringScheduleCustomerNotificationUseCaseResult,
} from '../base-recurring-schedule-customer-notification.use-case';
import { RecurringScheduleNotificationInput } from '../recurring-schedule-notification.helpers';

export interface SendRecurringScheduleEndedNotificationUseCaseInput extends RecurringScheduleNotificationInput {
  endedBy: 'CUSTOMER' | 'STAFF';
}

export type SendRecurringScheduleEndedNotificationUseCaseResult =
  RecurringScheduleCustomerNotificationUseCaseResult;

// UC-070 A2 (M23-S28): tells the customer their schedule was ended and its future occurrences
// cancelled — worded for who ended it. The cancelled occurrences send no email of their own
// (BookingCancelled.cancelledByScheduleEnd), so this is the only one.
@Injectable()
export class SendRecurringScheduleEndedNotificationUseCase extends BaseRecurringScheduleCustomerNotificationUseCase<SendRecurringScheduleEndedNotificationUseCaseInput> {
  protected templateKeyFor(
    input: SendRecurringScheduleEndedNotificationUseCaseInput,
  ): NotificationTemplateKey {
    return input.endedBy === 'STAFF'
      ? NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_BY_STAFF_CUSTOMER
      : NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_CUSTOMER;
  }
}

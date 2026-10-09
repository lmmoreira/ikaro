import { Injectable } from '@nestjs/common';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { TemplateVariables } from '../../../domain/notification-template-key.mapping';
import {
  BaseRecurringScheduleCustomerNotificationUseCase,
  RecurringScheduleCustomerNotificationUseCaseResult,
} from '../base-recurring-schedule-customer-notification.use-case';
import { formatEmailDateTime } from '../notification-email-format.helpers';
import {
  customerVariables,
  RecurringScheduleNotificationContext,
  RecurringScheduleNotificationInput,
} from '../recurring-schedule-notification.helpers';

export interface SendAvailabilityAlertMatchedEmailUseCaseInput extends RecurringScheduleNotificationInput {
  // ISO-8601 UTC instant the matching window opens (the event's matchingWindowStart).
  matchingWindowStart: string;
}

export type SendAvailabilityAlertMatchedEmailUseCaseResult =
  RecurringScheduleCustomerNotificationUseCaseResult;

// UC-072 (M23-S38): the email half of the availability-alert notification — tells the customer a
// slot opened inside their alert's window. Reporting how the send went is the job of
// SendAvailabilityAlertMatchedNotificationUseCase, which wraps this one.
@Injectable()
export class SendAvailabilityAlertMatchedEmailUseCase extends BaseRecurringScheduleCustomerNotificationUseCase<SendAvailabilityAlertMatchedEmailUseCaseInput> {
  protected templateKeyFor(): NotificationTemplateKey {
    return NotificationTemplateKey.AVAILABILITY_ALERT_MATCHED_CUSTOMER;
  }

  protected variablesFor(
    input: SendAvailabilityAlertMatchedEmailUseCaseInput,
    context: RecurringScheduleNotificationContext,
  ): TemplateVariables<NotificationTemplateKey.AVAILABILITY_ALERT_MATCHED_CUSTOMER> {
    return {
      ...customerVariables(context),
      matchingWindow: formatEmailDateTime(input.matchingWindowStart, context.timezone, context),
      bookingUrl: context.hotsiteUrl,
    };
  }

  // The email has already gone out when the audit-log row is written, and the inbox claim is kept
  // so a redelivery cannot send it twice. A lost row must therefore not fail the use case:
  // the caller would report a delivered email as FAILED, and nothing would ever correct it.
  protected override async saveLog(
    tenantId: string,
    eventId: string,
    notificationType: string,
    channel: string,
    recipientEmail: string,
    consumerName: string,
  ): Promise<void> {
    try {
      await super.saveLog(
        tenantId,
        eventId,
        notificationType,
        channel,
        recipientEmail,
        consumerName,
      );
    } catch (err) {
      this.logger.error(
        'Could not write the notification log of an email that was sent',
        err instanceof Error ? err.stack : String(err),
        { tenantId, notificationType },
      );
    }
  }
}

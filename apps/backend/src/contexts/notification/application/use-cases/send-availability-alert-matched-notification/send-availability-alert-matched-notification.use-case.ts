import { Inject, Injectable } from '@nestjs/common';
import {
  APPLICATION_CONFIG,
  IApplicationConfig,
} from '../../../../../shared/ports/application-config.port';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../../shared/ports/inbox.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { redactEmailForLogging } from '../../../../../shared/utils/redact-email-for-logging';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { TemplateVariables } from '../../../domain/notification-template-key.mapping';
import {
  AVAILABILITY_ALERT_OUTCOME_PORT,
  IAvailabilityAlertOutcomePort,
} from '../../ports/availability-alert-outcome.port';
import { ILocalizationPort, LOCALIZATION_PORT } from '../../ports/localization.port';
import {
  INotificationBookingPort,
  NOTIFICATION_BOOKING_PORT,
} from '../../ports/notification-booking.port';
import {
  INotificationCustomerPort,
  NOTIFICATION_CUSTOMER_PORT,
} from '../../ports/notification-customer.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../../ports/notification-dispatcher.port';
import {
  INotificationLogRepository,
  NOTIFICATION_LOG_REPOSITORY,
} from '../../ports/notification-log-repository.port';
import {
  INotificationPlatformPort,
  NOTIFICATION_PLATFORM_PORT,
} from '../../ports/notification-platform.port';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../ports/notification-template-repository.port';
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

export interface SendAvailabilityAlertMatchedNotificationUseCaseInput extends RecurringScheduleNotificationInput {
  alertId: string;
  // ISO-8601 UTC instants of the window that opened (the event's matchingWindowStart / End).
  matchingWindowStart: string;
  matchingWindowEnd: string;
}

export type SendAvailabilityAlertMatchedNotificationUseCaseResult =
  RecurringScheduleCustomerNotificationUseCaseResult;

// Matches the VARCHAR(500) of availability_alert_notification_attempts.last_error.
const MAX_ERROR_LENGTH = 500;

// UC-072 (M23-S38): tells the customer a slot opened inside their alert's window. The customer
// email shape is the recurring-schedule one (M23-S28); on top of it the use case reports how each
// try went to the Booking context, which owns the attempt row. A send that throws is reported
// FAILED and rethrown so Pub/Sub redelivers; the redelivery that succeeds turns it into SENT.
// A redelivery after success claims nothing (inbox) and reports nothing.
@Injectable()
export class SendAvailabilityAlertMatchedNotificationUseCase extends BaseRecurringScheduleCustomerNotificationUseCase<SendAvailabilityAlertMatchedNotificationUseCaseInput> {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(INBOX_REPOSITORY) inboxRepo: IInboxRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_CUSTOMER_PORT) customerPort: INotificationCustomerPort,
    @Inject(NOTIFICATION_BOOKING_PORT) servicePort: INotificationBookingPort,
    @Inject(NOTIFICATION_PLATFORM_PORT) tenantPort: INotificationPlatformPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY) templateRepo: INotificationTemplateRepository,
    @Inject(LOCALIZATION_PORT) localizationPort: ILocalizationPort,
    @Inject(APPLICATION_CONFIG) private readonly config: IApplicationConfig,
    @Inject(AVAILABILITY_ALERT_OUTCOME_PORT)
    private readonly outcomePort: IAvailabilityAlertOutcomePort,
  ) {
    super(
      logRepo,
      inboxRepo,
      dispatcher,
      customerPort,
      servicePort,
      tenantPort,
      txManager,
      templateRepo,
      localizationPort,
    );
  }

  protected templateKeyFor(): NotificationTemplateKey {
    return NotificationTemplateKey.AVAILABILITY_ALERT_MATCHED_CUSTOMER;
  }

  protected variablesFor(
    input: SendAvailabilityAlertMatchedNotificationUseCaseInput,
    context: RecurringScheduleNotificationContext,
  ): TemplateVariables<NotificationTemplateKey.AVAILABILITY_ALERT_MATCHED_CUSTOMER> {
    return {
      ...customerVariables(context),
      matchingWindow: formatEmailDateTime(input.matchingWindowStart, context.timezone, context),
      bookingUrl: `${this.config.getOrThrow('FRONTEND_URL')}/${encodeURIComponent(context.tenantSlug)}`,
    };
  }

  async execute(
    input: SendAvailabilityAlertMatchedNotificationUseCaseInput,
  ): Promise<SendAvailabilityAlertMatchedNotificationUseCaseResult> {
    let result: SendAvailabilityAlertMatchedNotificationUseCaseResult;
    try {
      result = await super.execute(input);
    } catch (err) {
      await this.report(input, 'FAILED', failureReason(err));
      throw err;
    }
    if (result.emailSent) await this.report(input, 'SENT', null);
    return result;
  }

  // Reporting is bookkeeping: losing it must neither unsend an email that went out nor hide the
  // real failure of one that did not, so it never throws (a lost report leaves the row as it was).
  private async report(
    input: SendAvailabilityAlertMatchedNotificationUseCaseInput,
    outcome: 'SENT' | 'FAILED',
    errorMessage: string | null,
  ): Promise<void> {
    try {
      await this.outcomePort.recordOutcome({
        tenantId: input.tenantId,
        alertId: input.alertId,
        correlationId: input.correlationId,
        matchingWindowStart: input.matchingWindowStart,
        matchingWindowEnd: input.matchingWindowEnd,
        outcome,
        errorMessage,
      });
    } catch (err) {
      this.logger.error(
        'Could not record the availability alert email outcome',
        err instanceof Error ? err.stack : String(err),
        { tenantId: input.tenantId, correlationId: input.correlationId, outcome },
      );
    }
  }
}

function failureReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return redactEmailForLogging(message).slice(0, MAX_ERROR_LENGTH);
}

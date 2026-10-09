import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../../shared/observability/app-logger';
import { redactEmailForLogging } from '../../../../../shared/utils/redact-email-for-logging';
import {
  AVAILABILITY_ALERT_OUTCOME_PORT,
  IAvailabilityAlertOutcomePort,
} from '../../ports/availability-alert-outcome.port';
import { SendAvailabilityAlertMatchedEmailUseCase } from '../send-availability-alert-matched-email/send-availability-alert-matched-email.use-case';
import { RecurringScheduleNotificationInput } from '../recurring-schedule-notification.helpers';

export interface SendAvailabilityAlertMatchedNotificationUseCaseInput extends RecurringScheduleNotificationInput {
  alertId: string;
  // ISO-8601 UTC instants of the window that opened (the event's matchingWindowStart / End).
  matchingWindowStart: string;
  matchingWindowEnd: string;
  // The alert's preferred resource and duration, for the email's booking link. Optional: a
  // message published before the event carried `durationMinutes` has neither guarantee.
  resourceId?: string | null;
  durationMinutes?: number | null;
}

export interface SendAvailabilityAlertMatchedNotificationUseCaseResult {
  emailSent: boolean;
}

// Matches the VARCHAR(500) of availability_alert_notification_attempts.last_error.
const MAX_ERROR_LENGTH = 500;

// UC-072 (M23-S38): emails the customer that a slot opened and reports how the try went to the
// Booking context, which owns the attempt row. A send that throws is reported FAILED and
// rethrown so Pub/Sub redelivers; the redelivery that succeeds turns it into SENT. A redelivery
// after success claims nothing (inbox) and reports nothing.
@Injectable()
export class SendAvailabilityAlertMatchedNotificationUseCase {
  private readonly logger = new AppLogger(SendAvailabilityAlertMatchedNotificationUseCase.name);

  constructor(
    private readonly sendEmail: SendAvailabilityAlertMatchedEmailUseCase,
    @Inject(AVAILABILITY_ALERT_OUTCOME_PORT)
    private readonly outcomePort: IAvailabilityAlertOutcomePort,
  ) {}

  async execute(
    input: SendAvailabilityAlertMatchedNotificationUseCaseInput,
  ): Promise<SendAvailabilityAlertMatchedNotificationUseCaseResult> {
    let result: { emailSent: boolean };
    try {
      result = await this.sendEmail.execute(input);
    } catch (err) {
      await this.report(input, 'FAILED', failureReason(err));
      throw err;
    }
    if (result.emailSent) await this.report(input, 'SENT', null);
    return { emailSent: result.emailSent };
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

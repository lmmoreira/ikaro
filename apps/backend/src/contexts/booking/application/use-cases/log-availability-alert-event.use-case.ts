import { Inject, Injectable } from '@nestjs/common';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import { AppLogger } from '../../../../shared/observability/app-logger';

export interface LogAvailabilityAlertEventUseCaseInput {
  eventId: string;
  eventName: string;
  tenantId: string;
  alertId: string;
  correlationId: string;
}

// Exists solely to give each AvailabilityAlert{Created,Updated,Cancelled,Expired} event a real
// eventBus.subscribe() call site, so packages/infra-scripts/src/pubsub-catalog.ts provisions its
// Pub/Sub topic — without a real subscriber, the outbox permanently fails to publish once
// deployed (docs/ANTI_PATTERNS.md § A domain event is drained, LeadFormSubmissionReceived
// precedent). Same shape as LogRecurringBookingScheduleEventUseCase; M23-S07 extends it to
// AvailabilityAlertMatched.
@Injectable()
export class LogAvailabilityAlertEventUseCase {
  static readonly CONSUMER_NAME = 'audit-log';

  private readonly logger = new AppLogger(LogAvailabilityAlertEventUseCase.name);

  constructor(@Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository) {}

  async execute(input: LogAvailabilityAlertEventUseCaseInput): Promise<void> {
    const { eventId, eventName, tenantId, alertId, correlationId } = input;

    const claimed = await this.inboxRepo.tryClaim(
      eventId,
      LogAvailabilityAlertEventUseCase.CONSUMER_NAME,
    );
    if (!claimed) return;

    try {
      this.logger.log(`${eventName} received`, { tenantId, alertId, correlationId });
    } catch (err) {
      await this.inboxRepo.unclaim(eventId, LogAvailabilityAlertEventUseCase.CONSUMER_NAME);
      throw err;
    }
  }
}

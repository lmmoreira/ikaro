import { Inject, Injectable } from '@nestjs/common';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import { AppLogger } from '../../../../shared/observability/app-logger';

export interface LogRecurringBookingScheduleEventUseCaseInput {
  eventId: string;
  eventName: string;
  tenantId: string;
  recurringScheduleId: string;
  correlationId: string;
}

// Exists solely to give each RecurringBookingSchedule{Created,ApprovalRequested,Paused,Ended}
// event a real eventBus.subscribe() call site, so packages/infra-scripts/src/pubsub-catalog.ts
// provisions its Pub/Sub topic — without a real subscriber, the outbox permanently fails to
// publish once deployed (docs/ANTI_PATTERNS.md § A domain event is drained, LeadFormSubmission
// Received precedent). A real Notification Context consumer (confirmation/staff-alert emails) is
// a separate, deferred future story, not this class.
@Injectable()
export class LogRecurringBookingScheduleEventUseCase {
  static readonly CONSUMER_NAME = 'audit-log';

  private readonly logger = new AppLogger(LogRecurringBookingScheduleEventUseCase.name);

  constructor(@Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository) {}

  async execute(input: LogRecurringBookingScheduleEventUseCaseInput): Promise<void> {
    const { eventId, eventName, tenantId, recurringScheduleId, correlationId } = input;

    const claimed = await this.inboxRepo.tryClaim(
      eventId,
      LogRecurringBookingScheduleEventUseCase.CONSUMER_NAME,
    );
    if (!claimed) return;

    try {
      this.logger.log(`${eventName} received`, { tenantId, recurringScheduleId, correlationId });
    } catch (err) {
      await this.inboxRepo.unclaim(eventId, LogRecurringBookingScheduleEventUseCase.CONSUMER_NAME);
      throw err;
    }
  }
}

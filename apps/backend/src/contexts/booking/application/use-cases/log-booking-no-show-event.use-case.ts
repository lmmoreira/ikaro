import { Inject, Injectable } from '@nestjs/common';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import { AppLogger } from '../../../../shared/observability/app-logger';

export interface LogBookingNoShowEventUseCaseInput {
  eventId: string;
  eventName: string;
  tenantId: string;
  bookingId: string;
  correlationId: string;
}

// Exists solely to give BookingNoShow a real eventBus.subscribe() call site, so
// packages/infra-scripts/src/pubsub-catalog.ts provisions its Pub/Sub topic — without a real
// subscriber, the outbox permanently fails to publish once deployed (docs/ANTI_PATTERNS.md § A
// domain event is drained, LeadFormSubmissionReceived precedent). The customer email is M23-S25's
// Notification consumer, a separate story, not this class.
@Injectable()
export class LogBookingNoShowEventUseCase {
  static readonly CONSUMER_NAME = 'audit-log';

  private readonly logger = new AppLogger(LogBookingNoShowEventUseCase.name);

  constructor(@Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository) {}

  async execute(input: LogBookingNoShowEventUseCaseInput): Promise<void> {
    const { eventId, eventName, tenantId, bookingId, correlationId } = input;

    const claimed = await this.inboxRepo.tryClaim(
      eventId,
      LogBookingNoShowEventUseCase.CONSUMER_NAME,
    );
    if (!claimed) return;

    try {
      this.logger.log(`${eventName} received`, { tenantId, bookingId, correlationId });
    } catch (err) {
      await this.inboxRepo.unclaim(eventId, LogBookingNoShowEventUseCase.CONSUMER_NAME);
      throw err;
    }
  }
}

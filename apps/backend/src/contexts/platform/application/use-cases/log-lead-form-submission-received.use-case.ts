import { Inject, Injectable } from '@nestjs/common';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import { AppLogger } from '../../../../shared/observability/app-logger';

export interface LogLeadFormSubmissionReceivedUseCaseInput {
  eventId: string;
  submissionId: string;
  tenantId: string;
  customerId: string | null;
  correlationId: string;
}

// Exists solely to give LeadFormSubmissionReceived a real eventBus.subscribe() call site, so
// packages/infra-scripts/src/pubsub-catalog.ts provisions its Pub/Sub topic — without a real
// subscriber, the outbox permanently fails to publish this event once deployed, with no automatic
// recovery (docs/ENGINEERING_RULES.md § Aggregate domain events → outbox (repo auto-flush)). The
// log line is the audit trail the event was always meant to support (docs/03-DOMAIN_EVENTS.md §
// LeadFormSubmissionReceived) — a real manager-notification consumer is a separate, deferred
// future story, not this class.
@Injectable()
export class LogLeadFormSubmissionReceivedUseCase {
  static readonly CONSUMER_NAME = 'audit-log';

  private readonly logger = new AppLogger(LogLeadFormSubmissionReceivedUseCase.name);

  constructor(@Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository) {}

  // Atomic claim (docs/ENGINEERING_RULES.md § Event Handlers), not check-then-mark — the log line
  // has no DB constraint of its own, so two concurrent redeliveries could both pass a
  // hasBeenProcessed check before either marked processed, producing a genuinely duplicate
  // audit-log entry (round-2 Codex finding). tryClaim's INSERT ... ON CONFLICT DO NOTHING is
  // atomic at the DB level, so only one concurrent caller ever gets true. No txManager.run()
  // needed — tryClaim/unclaim are each already atomic single statements, unlike markProcessed
  // in the check-then-mark pattern (which needs to share a transaction with a real DB write).
  async execute(input: LogLeadFormSubmissionReceivedUseCaseInput): Promise<void> {
    const { eventId, submissionId, tenantId, customerId, correlationId } = input;

    const claimed = await this.inboxRepo.tryClaim(
      eventId,
      LogLeadFormSubmissionReceivedUseCase.CONSUMER_NAME,
    );
    if (!claimed) return;

    try {
      this.logger.log('LeadFormSubmissionReceived received', {
        submissionId,
        tenantId,
        customerId,
        correlationId,
      });
    } catch (err) {
      await this.inboxRepo.unclaim(eventId, LogLeadFormSubmissionReceivedUseCase.CONSUMER_NAME);
      throw err;
    }
  }
}

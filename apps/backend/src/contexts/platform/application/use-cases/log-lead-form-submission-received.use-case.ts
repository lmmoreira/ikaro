import { Inject, Injectable } from '@nestjs/common';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
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

  constructor(
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  // check-then-mark (docs/ENGINEERING_RULES.md § Event Handlers) — the log line has no DB
  // constraint of its own to dedup against, but a race between two concurrent redeliveries costs
  // at most one duplicate audit-log entry, never duplicate data; the heavier atomic-claim protocol
  // is unnecessary machinery for that cost.
  async execute(input: LogLeadFormSubmissionReceivedUseCaseInput): Promise<void> {
    const { eventId, submissionId, tenantId, customerId, correlationId } = input;

    const alreadyProcessed = await this.inboxRepo.hasBeenProcessed(
      eventId,
      LogLeadFormSubmissionReceivedUseCase.CONSUMER_NAME,
    );
    if (alreadyProcessed) return;

    this.logger.log('LeadFormSubmissionReceived received', {
      submissionId,
      tenantId,
      customerId,
      correlationId,
    });

    await this.txManager.run(() =>
      this.inboxRepo.markProcessed(eventId, LogLeadFormSubmissionReceivedUseCase.CONSUMER_NAME),
    );
  }
}

import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';

export interface LogLeadFormSubmissionReceivedUseCaseInput {
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
  private readonly logger = new AppLogger(LogLeadFormSubmissionReceivedUseCase.name);

  async execute(input: LogLeadFormSubmissionReceivedUseCaseInput): Promise<void> {
    const { submissionId, tenantId, customerId, correlationId } = input;
    this.logger.log('LeadFormSubmissionReceived received', {
      submissionId,
      tenantId,
      customerId,
      correlationId,
    });
  }
}

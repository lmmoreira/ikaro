import { Inject, Injectable } from '@nestjs/common';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import { AppLogger } from '../../../../shared/observability/app-logger';

export interface LogFutureCommitmentExceptionEventUseCaseInput {
  eventId: string;
  eventName: string;
  tenantId: string;
  exceptionId: string;
  correlationId: string;
}

// Exists solely to give each FutureCommitmentException{Raised,Resolved,Dismissed} event a real
// eventBus.subscribe() call site, so packages/infra-scripts/src/pubsub-catalog.ts provisions its
// Pub/Sub topic — without a real subscriber the outbox permanently fails to publish once deployed
// (docs/ANTI_PATTERNS.md § A domain event is drained). The Notification consumers are M23-S23.
@Injectable()
export class LogFutureCommitmentExceptionEventUseCase {
  static readonly CONSUMER_NAME = 'audit-log';

  private readonly logger = new AppLogger(LogFutureCommitmentExceptionEventUseCase.name);

  constructor(@Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository) {}

  async execute(input: LogFutureCommitmentExceptionEventUseCaseInput): Promise<void> {
    const { eventId, eventName, tenantId, exceptionId, correlationId } = input;

    const claimed = await this.inboxRepo.tryClaim(
      eventId,
      LogFutureCommitmentExceptionEventUseCase.CONSUMER_NAME,
    );
    if (!claimed) return;

    try {
      this.logger.log(`${eventName} received`, { tenantId, exceptionId, correlationId });
    } catch (err) {
      await this.inboxRepo.unclaim(eventId, LogFutureCommitmentExceptionEventUseCase.CONSUMER_NAME);
      throw err;
    }
  }
}

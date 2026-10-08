import { Inject, Injectable } from '@nestjs/common';
import { IInboxRepository, INBOX_REPOSITORY } from '../../ports/inbox.port';
import { AppLogger } from '../../observability/app-logger';

export interface LogDomainEventUseCaseInput {
  eventId: string;
  eventName: string;
  tenantId: string;
  occurredAt: string;
  correlationId: string;
}

// The single `audit-log` consumer of every domain event (M23-S36). Each context's thin
// `<Context>AuditLogHandler` subscribes to its own events with this consumer name and calls this
// use case; `architecture-check`'s `domain-event-audit-coverage` detector fails CI for any
// DomainEvent class no handler subscribes. Logs envelope fields only — never `event.data`, whose
// payloads can carry customer contact details.
//
// Also gives every event a real eventBus.subscribe() call site, so packages/infra-scripts/src/
// pubsub-catalog.ts provisions its Pub/Sub topic — without a real subscriber, the outbox
// permanently fails to publish once deployed (docs/ANTI_PATTERNS.md § A domain event is drained).
@Injectable()
export class LogDomainEventUseCase {
  // Also the shared.inbox dedup key's consumer_name: keep it as-is — every placeholder this class
  // replaced already used 'audit-log', so already-claimed event ids still dedupe.
  static readonly CONSUMER_NAME = 'audit-log';

  private readonly logger = new AppLogger(LogDomainEventUseCase.name);

  constructor(@Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository) {}

  // Atomic claim (docs/ENGINEERING_RULES_BACKEND.md § Event Handlers), not check-then-mark — the log
  // line has no DB constraint of its own, so two concurrent redeliveries could both pass a
  // hasBeenProcessed check before either marked processed. tryClaim's INSERT ... ON CONFLICT DO
  // NOTHING is atomic, so only one concurrent caller gets true. No txManager.run() needed —
  // tryClaim/unclaim are each a single atomic statement.
  async execute(input: LogDomainEventUseCaseInput): Promise<void> {
    const { eventId, eventName, tenantId, occurredAt, correlationId } = input;

    const claimed = await this.inboxRepo.tryClaim(eventId, LogDomainEventUseCase.CONSUMER_NAME);
    if (!claimed) return;

    try {
      this.logger.log(`${eventName} received`, { tenantId, eventId, occurredAt, correlationId });
    } catch (err) {
      await this.inboxRepo.unclaim(eventId, LogDomainEventUseCase.CONSUMER_NAME);
      throw err;
    }
  }
}

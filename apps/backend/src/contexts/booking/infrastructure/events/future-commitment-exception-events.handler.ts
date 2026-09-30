import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { FutureCommitmentExceptionRaised } from '../../domain/events/future-commitment-exception-raised.event';
import { FutureCommitmentExceptionResolved } from '../../domain/events/future-commitment-exception-resolved.event';
import { FutureCommitmentExceptionDismissed } from '../../domain/events/future-commitment-exception-dismissed.event';
import { LogFutureCommitmentExceptionEventUseCase } from '../../application/use-cases/log-future-commitment-exception-event.use-case';

type AnyFutureCommitmentExceptionEvent =
  | FutureCommitmentExceptionRaised
  | FutureCommitmentExceptionResolved
  | FutureCommitmentExceptionDismissed;

// One handler covering all 3 M23-S08 event types — each is a thin audit-log-only consumer for now
// (docs/ANTI_PATTERNS.md § A domain event is drained), sharing the same use case since none of
// them has a real business consumer yet (the Notification consumers are M23-S23).
@Injectable()
export class FutureCommitmentExceptionEventsHandler implements OnModuleInit {
  private readonly logger = new AppLogger(FutureCommitmentExceptionEventsHandler.name);

  constructor(
    private readonly logUseCase: LogFutureCommitmentExceptionEventUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<FutureCommitmentExceptionRaised>(
      FutureCommitmentExceptionRaised.name,
      (event) => this.handle(event),
      LogFutureCommitmentExceptionEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe<FutureCommitmentExceptionResolved>(
      FutureCommitmentExceptionResolved.name,
      (event) => this.handle(event),
      LogFutureCommitmentExceptionEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe<FutureCommitmentExceptionDismissed>(
      FutureCommitmentExceptionDismissed.name,
      (event) => this.handle(event),
      LogFutureCommitmentExceptionEventUseCase.CONSUMER_NAME,
    );
  }

  async handle(event: AnyFutureCommitmentExceptionEvent): Promise<void> {
    try {
      await this.logUseCase.execute({
        eventId: event.eventId,
        eventName: event.eventName,
        tenantId: event.tenantId,
        exceptionId: event.data.exceptionId,
        correlationId: event.correlationId,
      });
    } catch (err) {
      this.logger.error(
        'FutureCommitmentExceptionEventsHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

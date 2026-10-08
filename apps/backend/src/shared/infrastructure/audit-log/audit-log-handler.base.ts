import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { LogDomainEventUseCase } from '../../application/use-cases/log-domain-event.use-case';
import { Envelope } from '../../domain/envelope';
import { AppLogger } from '../../observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../ports/event-bus.port';

// The shared half of every `<Context>AuditLogHandler` (M23-S36): the constructor, the logger and
// the one-use-case-and-rethrow `handle()`. A subclass adds only its own `onModuleInit()`, which
// spells out one `this.eventBus.subscribe(<Event>.name, (event) => this.handle(event),
// LogDomainEventUseCase.CONSUMER_NAME)` per domain event its context owns — kept literal, never
// looped, because the Pub/Sub catalog generator and architecture-check's
// domain-event-audit-coverage detector both read that exact call-site shape.
//
// A subclass declares no constructor: Nest resolves the inherited one, so this class keeps the
// `@Inject(EVENT_BUS)` decorator.
@Injectable()
export abstract class AuditLogHandlerBase implements OnModuleInit {
  private readonly logger = new AppLogger(this.constructor.name);

  constructor(
    private readonly logUseCase: LogDomainEventUseCase,
    @Inject(EVENT_BUS) protected readonly eventBus: IEventBus,
  ) {}

  abstract onModuleInit(): void;

  async handle(event: Envelope): Promise<void> {
    try {
      await this.logUseCase.execute({
        eventId: event.eventId,
        eventName: event.eventName,
        tenantId: event.tenantId,
        occurredAt: event.occurredAt,
        correlationId: event.correlationId,
      });
    } catch (err) {
      this.logger.error(
        `${this.constructor.name} failed — will nack for retry`,
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

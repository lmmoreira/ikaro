import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { LogDomainEventUseCase } from '../../../../shared/application/use-cases/log-domain-event.use-case';
import { Envelope } from '../../../../shared/domain/envelope';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { LeadFormSubmissionReceived } from '../../domain/events/lead-form-submission-received.event';
import { TenantProvisioned } from '../../domain/events/tenant-provisioned.event';

// The platform context's `audit-log` consumer (M23-S36): subscribes to every domain event this
// context owns and hands each one to the shared LogDomainEventUseCase. A new platform event must be
// added here — `architecture-check`'s domain-event-audit-coverage detector fails CI otherwise.
@Injectable()
export class PlatformAuditLogHandler implements OnModuleInit {
  private readonly logger = new AppLogger(PlatformAuditLogHandler.name);

  constructor(
    private readonly logUseCase: LogDomainEventUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe(
      LeadFormSubmissionReceived.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe(
      TenantProvisioned.name,
      (event) => this.handle(event),
      LogDomainEventUseCase.CONSUMER_NAME,
    );
  }

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
        'PlatformAuditLogHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

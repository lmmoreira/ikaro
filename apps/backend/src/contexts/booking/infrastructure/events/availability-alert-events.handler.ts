import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { AvailabilityAlertCancelled } from '../../domain/events/availability-alert-cancelled.event';
import { AvailabilityAlertCreated } from '../../domain/events/availability-alert-created.event';
import { AvailabilityAlertExpired } from '../../domain/events/availability-alert-expired.event';
import { AvailabilityAlertMatched } from '../../domain/events/availability-alert-matched.event';
import { AvailabilityAlertUpdated } from '../../domain/events/availability-alert-updated.event';
import { LogAvailabilityAlertEventUseCase } from '../../application/use-cases/log-availability-alert-event.use-case';

type AnyAvailabilityAlertEvent =
  | AvailabilityAlertCreated
  | AvailabilityAlertUpdated
  | AvailabilityAlertCancelled
  | AvailabilityAlertExpired
  | AvailabilityAlertMatched;

// One handler covering all 5 availability-alert event types — each is a thin audit-log-only
// consumer for now (docs/ANTI_PATTERNS.md § A domain event is drained), sharing the same use case
// since none of them has a real business consumer yet.
@Injectable()
export class AvailabilityAlertEventsHandler implements OnModuleInit {
  private readonly logger = new AppLogger(AvailabilityAlertEventsHandler.name);

  constructor(
    private readonly logUseCase: LogAvailabilityAlertEventUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<AvailabilityAlertCreated>(
      AvailabilityAlertCreated.name,
      (event) => this.handle(event),
      LogAvailabilityAlertEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe<AvailabilityAlertUpdated>(
      AvailabilityAlertUpdated.name,
      (event) => this.handle(event),
      LogAvailabilityAlertEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe<AvailabilityAlertCancelled>(
      AvailabilityAlertCancelled.name,
      (event) => this.handle(event),
      LogAvailabilityAlertEventUseCase.CONSUMER_NAME,
    );
    this.eventBus.subscribe<AvailabilityAlertExpired>(
      AvailabilityAlertExpired.name,
      (event) => this.handle(event),
      LogAvailabilityAlertEventUseCase.CONSUMER_NAME,
    );
    // M23-S07: the Notification-context email consumer is a later story; until then this keeps the
    // event from being published to a topic nobody subscribes to.
    this.eventBus.subscribe<AvailabilityAlertMatched>(
      AvailabilityAlertMatched.name,
      (event) => this.handle(event),
      LogAvailabilityAlertEventUseCase.CONSUMER_NAME,
    );
  }

  async handle(event: AnyAvailabilityAlertEvent): Promise<void> {
    try {
      await this.logUseCase.execute({
        eventId: event.eventId,
        eventName: event.eventName,
        tenantId: event.tenantId,
        alertId: event.data.alertId,
        correlationId: event.correlationId,
      });
    } catch (err) {
      this.logger.error(
        'AvailabilityAlertEventsHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

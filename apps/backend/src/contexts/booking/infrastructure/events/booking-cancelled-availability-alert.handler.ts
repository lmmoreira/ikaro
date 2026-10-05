import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { MatchAvailabilityAlertsUseCase } from '../../application/use-cases/match-availability-alerts.use-case';
import { BookingCancelled } from '../../domain/events/booking-cancelled.event';

// UC-072 step 3 (M23-S07): a cancelled booking released its slot — re-check that day for the
// booking's services against the ACTIVE availability alerts. Zero domain logic: the event's
// services and start time are handed straight to the use case.
@Injectable()
export class BookingCancelledAvailabilityAlertHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'availability-alert-matching';

  private readonly logger = new AppLogger(BookingCancelledAvailabilityAlertHandler.name);

  constructor(
    private readonly matchAlerts: MatchAvailabilityAlertsUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingCancelled>(
      BookingCancelled.name,
      (event) => this.handle(event),
      BookingCancelledAvailabilityAlertHandler.CONSUMER_NAME,
    );
  }

  async handle(event: BookingCancelled): Promise<void> {
    try {
      await this.matchAlerts.execute({
        tenantId: event.tenantId,
        correlationId: event.correlationId,
        serviceIds: event.data.lineSummary.map((line) => line.serviceId),
        around: new Date(event.data.scheduledAt),
      });
    } catch (err) {
      this.logger.error(
        'BookingCancelledAvailabilityAlertHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

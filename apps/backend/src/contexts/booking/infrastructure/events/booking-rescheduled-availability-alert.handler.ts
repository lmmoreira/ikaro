import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { MatchAvailabilityAlertsUseCase } from '../../application/use-cases/match-availability-alerts.use-case';
import { BookingRescheduled } from '../../domain/events/booking-rescheduled.event';

// UC-072 step 3 (M23-S07): a rescheduled booking released its previous slot — re-check that day
// for the booking's services against the ACTIVE availability alerts. (`previousSlot.startTime` is
// an ISO instant, whatever its name suggests.)
@Injectable()
export class BookingRescheduledAvailabilityAlertHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'availability-alert-matching';

  private readonly logger = new AppLogger(BookingRescheduledAvailabilityAlertHandler.name);

  constructor(
    private readonly matchAlerts: MatchAvailabilityAlertsUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingRescheduled>(
      BookingRescheduled.name,
      (event) => this.handle(event),
      BookingRescheduledAvailabilityAlertHandler.CONSUMER_NAME,
    );
  }

  async handle(event: BookingRescheduled): Promise<void> {
    try {
      await this.matchAlerts.execute({
        tenantId: event.tenantId,
        correlationId: event.correlationId,
        serviceIds: event.data.lineSummary.map((line) => line.serviceId),
        around: new Date(event.data.previousSlot.startTime),
      });
    } catch (err) {
      this.logger.error(
        'BookingRescheduledAvailabilityAlertHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

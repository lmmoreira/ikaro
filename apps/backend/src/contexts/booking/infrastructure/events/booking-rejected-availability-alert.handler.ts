import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { MatchAvailabilityAlertsForBookingUseCase } from '../../application/use-cases/match-availability-alerts-for-booking.use-case';
import { BookingRejected } from '../../domain/events/booking-rejected.event';

// UC-072 step 3 (M23-S07): a rejected booking released the slot it was holding. The event carries
// only the booking id, so the use case resolves the day and services from the booking itself.
@Injectable()
export class BookingRejectedAvailabilityAlertHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'availability-alert-matching';

  private readonly logger = new AppLogger(BookingRejectedAvailabilityAlertHandler.name);

  constructor(
    private readonly matchAlertsForBooking: MatchAvailabilityAlertsForBookingUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingRejected>(
      BookingRejected.name,
      (event) => this.handle(event),
      BookingRejectedAvailabilityAlertHandler.CONSUMER_NAME,
    );
  }

  async handle(event: BookingRejected): Promise<void> {
    try {
      await this.matchAlertsForBooking.execute({
        tenantId: event.tenantId,
        bookingId: event.data.bookingId,
        correlationId: event.correlationId,
      });
    } catch (err) {
      this.logger.error(
        'BookingRejectedAvailabilityAlertHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

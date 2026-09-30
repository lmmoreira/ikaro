import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { BookingNoShow } from '../../domain/events/booking-no-show.event';
import { LogBookingNoShowEventUseCase } from '../../application/use-cases/log-booking-no-show-event.use-case';

// Thin audit-log-only consumer (docs/ANTI_PATTERNS.md § A domain event is drained) — see
// LogBookingNoShowEventUseCase. The Notification Context consumer arrives with M23-S25.
@Injectable()
export class BookingNoShowEventsHandler implements OnModuleInit {
  private readonly logger = new AppLogger(BookingNoShowEventsHandler.name);

  constructor(
    private readonly logUseCase: LogBookingNoShowEventUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingNoShow>(
      BookingNoShow.name,
      (event) => this.handle(event),
      LogBookingNoShowEventUseCase.CONSUMER_NAME,
    );
  }

  async handle(event: BookingNoShow): Promise<void> {
    try {
      await this.logUseCase.execute({
        eventId: event.eventId,
        eventName: event.eventName,
        tenantId: event.tenantId,
        bookingId: event.data.bookingId,
        correlationId: event.correlationId,
      });
    } catch (err) {
      this.logger.error(
        'BookingNoShowEventsHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

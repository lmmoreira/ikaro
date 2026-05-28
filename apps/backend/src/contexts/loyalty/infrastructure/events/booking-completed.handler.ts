import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { BookingCompleted } from '../../../booking/domain/events/booking-completed.event';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { RecordLoyaltyEntriesUseCase } from '../../application/use-cases/record-loyalty-entries/record-loyalty-entries.use-case';

@Injectable()
export class BookingCompletedHandler implements OnModuleInit {
  private readonly logger = new AppLogger(BookingCompletedHandler.name);

  constructor(
    private readonly recordLoyaltyEntries: RecordLoyaltyEntriesUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingCompleted>(
      'BookingCompleted',
      (event) => this.handle(event),
      RecordLoyaltyEntriesUseCase.CONSUMER_NAME,
    );
  }

  async handle(event: BookingCompleted): Promise<void> {
    this.logger.log('BookingCompleted received by loyalty handler', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      bookingId: event.data.bookingId,
      customerId: event.data.customerId,
    });
    try {
      await this.recordLoyaltyEntries.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        customerId: event.data.customerId,
        bookingId: event.data.bookingId,
        lines: event.data.lines.map((l) => ({
          lineId: l.lineId,
          serviceId: l.serviceId,
          pointsValueAtBooking: l.pointsValueAtBooking,
        })),
      });
    } catch (err) {
      this.logger.error(
        'BookingCompletedHandler (loyalty) failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

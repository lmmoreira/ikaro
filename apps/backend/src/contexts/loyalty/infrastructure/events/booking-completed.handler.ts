import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { BookingCompleted } from '../../../booking/domain/events/booking-completed.event';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { CompleteBookingLoyaltyEffectsUseCase } from '../../application/use-cases/complete-booking-loyalty-effects/complete-booking-loyalty-effects.use-case';

@Injectable()
export class BookingCompletedHandler implements OnModuleInit {
  private readonly logger = new AppLogger(BookingCompletedHandler.name);

  constructor(
    private readonly completeBookingLoyaltyEffects: CompleteBookingLoyaltyEffectsUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingCompleted>(
      BookingCompleted.name,
      (event) => this.handle(event),
      CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME,
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
      await this.completeBookingLoyaltyEffects.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        customerId: event.data.customerId,
        bookingId: event.data.bookingId,
        completedBy: event.data.completedBy,
        lines: event.data.lines.map((l) => ({
          lineId: l.lineId,
          serviceId: l.serviceId,
          pointsValueAtBooking: l.pointsValueAtBooking,
        })),
        discountByPoints: event.data.discountByPoints
          ? {
              pointsUsed: event.data.discountByPoints.pointsUsed,
              amountDeducted: Number(event.data.discountByPoints.amountDeducted.amount),
            }
          : undefined,
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

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { BookingRequested } from '../../../booking/domain/events/booking-requested.event';
import { SendBookingRequestedNotificationUseCase } from '../../application/use-cases/send-booking-requested-notification/send-booking-requested-notification.use-case';

@Injectable()
export class BookingRequestedHandler implements OnModuleInit {
  private readonly logger = new AppLogger(BookingRequestedHandler.name);

  constructor(
    private readonly sendBookingRequestedNotification: SendBookingRequestedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingRequested>(
      'BookingRequested',
      (event) => this.handle(event),
      'notification',
    );
  }

  async handle(event: BookingRequested): Promise<void> {
    this.logger.log('BookingRequested received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      bookingId: event.data.bookingId,
    });
    try {
      await this.sendBookingRequestedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        contactEmail: event.data.contactEmail,
        contactName: event.data.contactName,
        scheduledAt: event.data.scheduledAt,
        totalPrice: event.data.totalPrice,
        lines: event.data.lines.map((l) => ({ serviceNameAtBooking: l.serviceNameAtBooking })),
        pickupAddress: event.data.pickupAddress,
      });
    } catch (err) {
      this.logger.error(
        'BookingRequestedHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

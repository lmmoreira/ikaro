import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { BookingInfoRequested } from '../../../booking/domain/events/booking-info-requested.event';
import { SendBookingInfoRequestedNotificationUseCase } from '../../application/use-cases/send-booking-info-requested-notification/send-booking-info-requested-notification.use-case';

@Injectable()
export class BookingInfoRequestedHandler implements OnModuleInit {
  private readonly logger = new AppLogger(BookingInfoRequestedHandler.name);

  constructor(
    private readonly sendBookingInfoRequestedNotification: SendBookingInfoRequestedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingInfoRequested>(
      'BookingInfoRequested',
      (event) => this.handle(event),
      'notification',
    );
  }

  async handle(event: BookingInfoRequested): Promise<void> {
    this.logger.log('BookingInfoRequested received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      bookingId: event.data.bookingId,
    });
    try {
      await this.sendBookingInfoRequestedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        bookingId: event.data.bookingId,
        customerId: event.data.customerId,
        contactEmail: event.data.contactEmail,
        contactName: event.data.contactName,
        informationNeeded: event.data.informationNeeded,
      });
    } catch (err) {
      this.logger.error(
        'BookingInfoRequestedHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

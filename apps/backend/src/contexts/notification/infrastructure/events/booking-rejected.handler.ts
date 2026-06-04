import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { BookingRejected } from '../../../booking/domain/events/booking-rejected.event';
import { SendBookingRejectedNotificationUseCase } from '../../application/use-cases/send-booking-rejected-notification/send-booking-rejected-notification.use-case';

@Injectable()
export class BookingRejectedHandler implements OnModuleInit {
  private readonly logger = new AppLogger(BookingRejectedHandler.name);

  constructor(
    private readonly sendBookingRejectedNotification: SendBookingRejectedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingRejected>(
      'BookingRejected',
      (event) => this.handle(event),
      'notification',
    );
  }

  async handle(event: BookingRejected): Promise<void> {
    this.logger.log('BookingRejected received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      bookingId: event.data.bookingId,
    });
    try {
      await this.sendBookingRejectedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        contactEmail: event.data.contactEmail,
        contactName: event.data.contactName,
        reason: event.data.reason,
      });
    } catch (err) {
      this.logger.error(
        'BookingRejectedHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

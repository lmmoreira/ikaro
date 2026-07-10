import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { BookingInfoSubmitted } from '../../../booking/domain/events/booking-info-submitted.event';
import { SendBookingInfoSubmittedNotificationUseCase } from '../../application/use-cases/send-booking-info-submitted-notification/send-booking-info-submitted-notification.use-case';

@Injectable()
export class BookingInfoSubmittedHandler implements OnModuleInit {
  private readonly logger = new AppLogger(BookingInfoSubmittedHandler.name);

  constructor(
    private readonly sendBookingInfoSubmittedNotification: SendBookingInfoSubmittedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingInfoSubmitted>(
      BookingInfoSubmitted.name,
      (event) => this.handle(event),
      'notification',
    );
  }

  async handle(event: BookingInfoSubmitted): Promise<void> {
    this.logger.log('BookingInfoSubmitted received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      bookingId: event.data.bookingId,
    });
    try {
      await this.sendBookingInfoSubmittedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        bookingId: event.data.bookingId,
        submittedByEmail: event.data.submittedByEmail,
        infoPayload: event.data.infoPayload,
      });
    } catch (err) {
      this.logger.error(
        'BookingInfoSubmittedHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

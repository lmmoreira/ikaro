import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { BookingRescheduled } from '../../../booking/domain/events/booking-rescheduled.event';
import { SendBookingRescheduledNotificationUseCase } from '../../application/use-cases/send-booking-rescheduled-notification/send-booking-rescheduled-notification.use-case';

@Injectable()
export class BookingRescheduledHandler implements OnModuleInit {
  private readonly logger = new AppLogger(BookingRescheduledHandler.name);

  constructor(
    private readonly sendBookingRescheduledNotification: SendBookingRescheduledNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingRescheduled>(
      'BookingRescheduled',
      (event) => this.handle(event),
      'notification',
    );
  }

  async handle(event: BookingRescheduled): Promise<void> {
    this.logger.log('BookingRescheduled received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      bookingId: event.data.bookingId,
    });
    try {
      await this.sendBookingRescheduledNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        contactEmail: event.data.contactEmail,
        contactName: event.data.contactName,
        newSlot: event.data.newSlot,
        previousSlot: event.data.previousSlot,
        rescheduledBy: event.data.rescheduledBy,
        adminNotes: event.data.adminNotes,
        lineSummary: event.data.lineSummary,
        totalPrice: event.data.totalPrice,
      });
    } catch (err) {
      this.logger.error(
        'BookingRescheduledHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

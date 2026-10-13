import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { BookingResourceReassigned } from '../../../booking/domain/events/booking-resource-reassigned.event';
import { SendBookingResourceReassignedNotificationUseCase } from '../../application/use-cases/send-booking-resource-reassigned-notification/send-booking-resource-reassigned-notification.use-case';

@Injectable()
export class BookingResourceReassignedHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'notification';

  private readonly logger = new AppLogger(BookingResourceReassignedHandler.name);

  constructor(
    private readonly sendBookingResourceReassignedNotification: SendBookingResourceReassignedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingResourceReassigned>(
      BookingResourceReassigned.name,
      (event) => this.handle(event),
      BookingResourceReassignedHandler.CONSUMER_NAME,
    );
  }

  async handle(event: BookingResourceReassigned): Promise<void> {
    this.logger.log('BookingResourceReassigned received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      bookingId: event.data.bookingId,
    });
    try {
      await this.sendBookingResourceReassignedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        contactEmail: event.data.contactEmail,
        contactName: event.data.contactName,
        slot: event.data.slot,
        lineSummary: event.data.lineSummary,
        newResourceName: event.data.newResourceName,
      });
    } catch (err) {
      this.logger.error(
        'BookingResourceReassignedHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

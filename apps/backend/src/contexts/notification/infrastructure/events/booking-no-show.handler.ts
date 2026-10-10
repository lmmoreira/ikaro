import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { BookingNoShow } from '../../../booking/domain/events/booking-no-show.event';
import { SendBookingNoShowNotificationUseCase } from '../../application/use-cases/send-booking-no-show-notification/send-booking-no-show-notification.use-case';

@Injectable()
export class BookingNoShowHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'notification';

  private readonly logger = new AppLogger(BookingNoShowHandler.name);

  constructor(
    private readonly sendBookingNoShowNotification: SendBookingNoShowNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingNoShow>(
      BookingNoShow.name,
      (event) => this.handle(event),
      BookingNoShowHandler.CONSUMER_NAME,
    );
  }

  async handle(event: BookingNoShow): Promise<void> {
    this.logger.log('BookingNoShow received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      bookingId: event.data.bookingId,
    });
    try {
      await this.sendBookingNoShowNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        contactEmail: event.data.contactEmail,
        contactName: event.data.contactName,
        scheduledAt: event.data.scheduledAt,
        lineSummary: event.data.lineSummary,
      });
    } catch (err) {
      this.logger.error(
        'BookingNoShowHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

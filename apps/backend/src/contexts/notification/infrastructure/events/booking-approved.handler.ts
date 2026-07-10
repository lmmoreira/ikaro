import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { BookingApproved } from '../../../booking/domain/events/booking-approved.event';
import { SendBookingApprovedNotificationUseCase } from '../../application/use-cases/send-booking-approved-notification/send-booking-approved-notification.use-case';

@Injectable()
export class BookingApprovedHandler implements OnModuleInit {
  private readonly logger = new AppLogger(BookingApprovedHandler.name);

  constructor(
    private readonly sendBookingApprovedNotification: SendBookingApprovedNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingApproved>(
      BookingApproved.name,
      (event) => this.handle(event),
      'notification',
    );
  }

  async handle(event: BookingApproved): Promise<void> {
    this.logger.log('BookingApproved received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      bookingId: event.data.bookingId,
    });
    try {
      await this.sendBookingApprovedNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        contactEmail: event.data.contactEmail,
        contactName: event.data.contactName,
        approvedSlot: event.data.approvedSlot,
        totalPrice: event.data.totalPrice,
        lineSummary: event.data.lineSummary,
      });
    } catch (err) {
      this.logger.error(
        'BookingApprovedHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

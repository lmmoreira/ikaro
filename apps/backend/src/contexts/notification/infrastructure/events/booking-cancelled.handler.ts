import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { BookingCancelled } from '../../../booking/domain/events/booking-cancelled.event';
import { SendBookingApprovalExpiredNotificationUseCase } from '../../application/use-cases/send-booking-approval-expired-notification/send-booking-approval-expired-notification.use-case';
import { SendBookingCancelledNotificationUseCase } from '../../application/use-cases/send-booking-cancelled-notification/send-booking-cancelled-notification.use-case';

@Injectable()
export class BookingCancelledHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'notification';

  private readonly logger = new AppLogger(BookingCancelledHandler.name);

  constructor(
    private readonly sendBookingCancelledNotification: SendBookingCancelledNotificationUseCase,
    private readonly sendBookingApprovalExpiredNotification: SendBookingApprovalExpiredNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingCancelled>(
      BookingCancelled.name,
      (event) => this.handle(event),
      BookingCancelledHandler.CONSUMER_NAME,
    );
  }

  async handle(event: BookingCancelled): Promise<void> {
    this.logger.log('BookingCancelled received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      bookingId: event.data.bookingId,
    });
    try {
      // One use case per event: a request that expired unanswered (TD51) gets its own customer
      // email and no manager email, everything else the ordinary cancelled emails.
      if (event.data.cancelledByHoldExpiry) {
        await this.notifyExpiry(event);
        return;
      }
      await this.notifyCancellation(event);
    } catch (err) {
      this.logger.error(
        'BookingCancelledHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }

  private async notifyExpiry(event: BookingCancelled): Promise<void> {
    await this.sendBookingApprovalExpiredNotification.execute({
      tenantId: event.tenantId,
      eventId: event.eventId,
      correlationId: event.correlationId,
      contactEmail: event.data.contactEmail,
      contactName: event.data.contactName,
      scheduledAt: event.data.scheduledAt,
      lineSummary: event.data.lineSummary,
    });
  }

  private async notifyCancellation(event: BookingCancelled): Promise<void> {
    await this.sendBookingCancelledNotification.execute({
      tenantId: event.tenantId,
      eventId: event.eventId,
      correlationId: event.correlationId,
      contactEmail: event.data.contactEmail,
      contactName: event.data.contactName,
      cancelledBy: event.data.cancelledBy,
      isBusiness: event.data.isBusiness,
      reason: event.data.reason,
      scheduledAt: event.data.scheduledAt,
      lineSummary: event.data.lineSummary,
      totalPrice: event.data.totalPrice,
      cancelledByScheduleEnd: event.data.cancelledByScheduleEnd,
      cancelledByHoldExpiry: event.data.cancelledByHoldExpiry,
    });
  }
}

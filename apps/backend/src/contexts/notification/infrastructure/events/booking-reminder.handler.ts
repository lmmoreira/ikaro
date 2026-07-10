import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { BookingReminderDue } from '../../../booking/domain/events/booking-reminder-due.event';
import { BookingReminderDueToday } from '../../../booking/domain/events/booking-reminder-due-today.event';
import { SendBookingReminderDueNotificationDto } from '../../application/dtos/send-booking-reminder-due-notification.dto';
import { BaseBookingReminderNotificationUseCase } from '../../application/use-cases/base-booking-reminder-notification.use-case';
import { SendBookingReminderDueNotificationUseCase } from '../../application/use-cases/send-booking-reminder-due-notification/send-booking-reminder-due-notification.use-case';
import { SendBookingReminderDueTodayNotificationUseCase } from '../../application/use-cases/send-booking-reminder-due-today-notification/send-booking-reminder-due-today-notification.use-case';

@Injectable()
export class BookingReminderHandler implements OnModuleInit {
  private readonly logger = new AppLogger(BookingReminderHandler.name);

  constructor(
    private readonly sendDue: SendBookingReminderDueNotificationUseCase,
    private readonly sendDueToday: SendBookingReminderDueTodayNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<BookingReminderDue>(
      BookingReminderDue.name,
      (event) => this.handleDue(event),
      'notification',
    );
    this.eventBus.subscribe<BookingReminderDueToday>(
      BookingReminderDueToday.name,
      (event) => this.handleDueToday(event),
      'notification',
    );
  }

  async handleDue(event: BookingReminderDue): Promise<void> {
    await this.dispatch(event, this.sendDue, 'BookingReminderDue');
  }

  async handleDueToday(event: BookingReminderDueToday): Promise<void> {
    await this.dispatch(event, this.sendDueToday, 'BookingReminderDueToday');
  }

  private async dispatch(
    event: BookingReminderDue | BookingReminderDueToday,
    useCase: BaseBookingReminderNotificationUseCase,
    eventName: string,
  ): Promise<void> {
    this.logger.log(`${eventName} received`, {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      bookingId: event.data.bookingId,
      recipientEmail: event.data.recipientEmail,
    });
    const dto: SendBookingReminderDueNotificationDto = {
      tenantId: event.tenantId,
      eventId: event.eventId,
      correlationId: event.correlationId,
      recipientEmail: event.data.recipientEmail,
      customerName: event.data.customerName,
      scheduledAt: event.data.scheduledAt,
      appointmentSlot: event.data.appointmentSlot,
      lines: event.data.lines,
    };
    try {
      await useCase.execute(dto);
    } catch (err) {
      this.logger.error(
        `${eventName}Handler failed — will nack for retry`,
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

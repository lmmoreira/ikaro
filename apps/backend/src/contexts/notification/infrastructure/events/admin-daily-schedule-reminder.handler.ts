import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import { AdminDailyScheduleReminder } from '../../../booking/domain/commands/admin-daily-schedule-reminder.command';
import { SendAdminDailyScheduleReminderNotificationUseCase } from '../../application/use-cases/send-admin-daily-schedule-reminder-notification/send-admin-daily-schedule-reminder-notification.use-case';

@Injectable()
export class AdminDailyScheduleReminderHandler implements OnModuleInit {
  private readonly logger = new AppLogger(AdminDailyScheduleReminderHandler.name);

  constructor(
    private readonly sendAdminDailyScheduleReminderNotification: SendAdminDailyScheduleReminderNotificationUseCase,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<AdminDailyScheduleReminder>(
      AdminDailyScheduleReminder.name,
      (event) => this.handle(event),
      'notification',
    );
  }

  async handle(event: AdminDailyScheduleReminder): Promise<void> {
    this.logger.log('AdminDailyScheduleReminder received', {
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      localDate: event.data.localDate,
      totalBookingsToday: event.data.totalBookingsToday,
    });
    try {
      await this.sendAdminDailyScheduleReminderNotification.execute({
        tenantId: event.tenantId,
        eventId: event.eventId,
        correlationId: event.correlationId,
        localDate: event.data.localDate,
        bookingsToday: event.data.bookingsToday,
        totalBookingsToday: event.data.totalBookingsToday,
      });
    } catch (err) {
      this.logger.error(
        'AdminDailyScheduleReminderHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { tenantId: event.tenantId, correlationId: event.correlationId },
      );
      throw err;
    }
  }
}

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { BookingReminderJob } from '../../application/jobs/booking-reminder.job';

@Injectable()
export class BookingReminderTriggerHandler implements OnModuleInit {
  private readonly logger = new AppLogger(BookingReminderTriggerHandler.name);

  constructor(
    private readonly bookingReminderJob: BookingReminderJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger('cron-reminders', () => this.handle(), 'booking-reminder');
  }

  async handle(): Promise<void> {
    this.logger.log('cron-reminders trigger received by booking-reminder handler');
    try {
      await this.bookingReminderJob.run();
    } catch (err) {
      this.logger.error(
        'BookingReminderTriggerHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}

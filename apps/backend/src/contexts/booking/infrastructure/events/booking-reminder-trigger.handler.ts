import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { BookingReminderJob } from '../../application/jobs/booking-reminder.job';
import { CRON_REMINDERS_TRIGGER } from './cron-trigger-names.constants';

@Injectable()
export class BookingReminderTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'booking-reminder';

  private readonly logger = new AppLogger(BookingReminderTriggerHandler.name);

  constructor(
    private readonly bookingReminderJob: BookingReminderJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_REMINDERS_TRIGGER,
      () => this.handle(),
      BookingReminderTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      `${CRON_REMINDERS_TRIGGER} trigger received by ${BookingReminderTriggerHandler.CONSUMER_NAME} handler`,
    );
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

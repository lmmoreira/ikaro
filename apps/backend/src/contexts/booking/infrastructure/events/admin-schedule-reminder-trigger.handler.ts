import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { AdminScheduleReminderJob } from '../../application/jobs/admin-schedule-reminder.job';
import { CRON_REMINDERS_TRIGGER } from './cron-trigger-names.constants';

@Injectable()
export class AdminScheduleReminderTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'booking-admin-schedule-reminder';

  private readonly logger = new AppLogger(AdminScheduleReminderTriggerHandler.name);

  constructor(
    private readonly adminScheduleReminderJob: AdminScheduleReminderJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_REMINDERS_TRIGGER,
      () => this.handle(),
      AdminScheduleReminderTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      `${CRON_REMINDERS_TRIGGER} trigger received by ${AdminScheduleReminderTriggerHandler.CONSUMER_NAME} handler`,
    );
    try {
      await this.adminScheduleReminderJob.run();
    } catch (err) {
      this.logger.error(
        'AdminScheduleReminderTriggerHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}

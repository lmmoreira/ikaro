import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { AdminScheduleReminderJob } from '../../application/jobs/admin-schedule-reminder.job';

@Injectable()
export class AdminScheduleReminderTriggerHandler implements OnModuleInit {
  private readonly logger = new AppLogger(AdminScheduleReminderTriggerHandler.name);

  constructor(
    private readonly adminScheduleReminderJob: AdminScheduleReminderJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      'cron-reminders',
      () => this.handle(),
      'booking-admin-schedule-reminder',
    );
  }

  async handle(): Promise<void> {
    this.logger.log('cron-reminders trigger received by booking-admin-schedule-reminder handler');
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

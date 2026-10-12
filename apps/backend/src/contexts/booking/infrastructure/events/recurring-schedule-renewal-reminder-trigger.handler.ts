import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { RecurringScheduleRenewalReminderJob } from '../../application/jobs/recurring-schedule-renewal-reminder.job';
import { CRON_REMINDERS_TRIGGER } from './cron-trigger-names.constants';

@Injectable()
export class RecurringScheduleRenewalReminderTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'recurring-schedule-renewal-reminder';

  private readonly logger = new AppLogger(RecurringScheduleRenewalReminderTriggerHandler.name);

  constructor(
    private readonly renewalReminderJob: RecurringScheduleRenewalReminderJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_REMINDERS_TRIGGER,
      () => this.handle(),
      RecurringScheduleRenewalReminderTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      `${CRON_REMINDERS_TRIGGER} trigger received by ${RecurringScheduleRenewalReminderTriggerHandler.CONSUMER_NAME} handler`,
    );
    try {
      await this.renewalReminderJob.run();
    } catch (err) {
      this.logger.error(
        'RecurringScheduleRenewalReminderTriggerHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}

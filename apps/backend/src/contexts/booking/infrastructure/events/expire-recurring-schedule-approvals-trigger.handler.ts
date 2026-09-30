import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { ExpireRecurringBookingScheduleApprovalsJob } from '../../application/jobs/expire-recurring-schedule-approvals.job';
import { CRON_REMINDERS_TRIGGER } from './cron-trigger-names.constants';

@Injectable()
export class ExpireRecurringScheduleApprovalsTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'recurring-schedule-approval-expiry';

  private readonly logger = new AppLogger(ExpireRecurringScheduleApprovalsTriggerHandler.name);

  constructor(
    private readonly expireApprovalsJob: ExpireRecurringBookingScheduleApprovalsJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_REMINDERS_TRIGGER,
      () => this.handle(),
      ExpireRecurringScheduleApprovalsTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      `${CRON_REMINDERS_TRIGGER} trigger received by ${ExpireRecurringScheduleApprovalsTriggerHandler.CONSUMER_NAME} handler`,
    );
    try {
      await this.expireApprovalsJob.run();
    } catch (err) {
      this.logger.error(
        'ExpireRecurringScheduleApprovalsTriggerHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}

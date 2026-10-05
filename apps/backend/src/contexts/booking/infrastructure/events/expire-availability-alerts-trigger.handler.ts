import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { ExpireAvailabilityAlertsJob } from '../../application/jobs/expire-availability-alerts.job';
import { CRON_REMINDERS_TRIGGER } from './cron-trigger-names.constants';

// Rides the existing cron-reminders trigger (no new Cloud Scheduler job), like the recurring-
// schedule expiry and the booking reminders do.
@Injectable()
export class ExpireAvailabilityAlertsTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'availability-alert-expiry';

  private readonly logger = new AppLogger(ExpireAvailabilityAlertsTriggerHandler.name);

  constructor(
    private readonly expireAlertsJob: ExpireAvailabilityAlertsJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_REMINDERS_TRIGGER,
      () => this.handle(),
      ExpireAvailabilityAlertsTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      `${CRON_REMINDERS_TRIGGER} trigger received by ${ExpireAvailabilityAlertsTriggerHandler.CONSUMER_NAME} handler`,
    );
    try {
      await this.expireAlertsJob.run();
    } catch (err) {
      this.logger.error(
        'ExpireAvailabilityAlertsTriggerHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { AvailabilityAlertSweepJob } from '../../application/jobs/availability-alert-sweep.job';
import { CRON_REMINDERS_TRIGGER } from './cron-trigger-names.constants';

// Rides the existing cron-reminders trigger (no new Cloud Scheduler job), like the alert expiry,
// the recurring-schedule expiry and the booking reminders do. The job gates itself to a
// tenant-local morning window, so the 30-minute tick runs it once a day per tenant.
@Injectable()
export class AvailabilityAlertSweepTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'availability-alert-sweep';

  private readonly logger = new AppLogger(AvailabilityAlertSweepTriggerHandler.name);

  constructor(
    private readonly sweepJob: AvailabilityAlertSweepJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_REMINDERS_TRIGGER,
      () => this.handle(),
      AvailabilityAlertSweepTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      `${CRON_REMINDERS_TRIGGER} trigger received by ${AvailabilityAlertSweepTriggerHandler.CONSUMER_NAME} handler`,
    );
    try {
      await this.sweepJob.run();
    } catch (err) {
      this.logger.error(
        'AvailabilityAlertSweepTriggerHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}

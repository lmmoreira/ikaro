import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { SweepSubscriptionStatusesJob } from '../../application/jobs/sweep-subscription-statuses.job';
import { CRON_BILLING_STATUS_SWEEP_TRIGGER } from './cron-trigger-names.constants';

/**
 * The hourly `cron-billing-status-sweep` trigger (UC-115): calls exactly one job and rethrows, so a
 * failed run is nacked and redelivered. The trigger carries no tenant, so a fresh correlation id is
 * minted for the run and passed down.
 */
@Injectable()
export class StatusSweepTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'billing-status-sweep';

  private readonly logger = new AppLogger(StatusSweepTriggerHandler.name);

  constructor(
    @Inject(SweepSubscriptionStatusesJob)
    private readonly sweep: Pick<SweepSubscriptionStatusesJob, 'run'>,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_BILLING_STATUS_SWEEP_TRIGGER,
      () => this.handle(),
      StatusSweepTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    const correlationId = uuidv7();
    this.logger.log(`${CRON_BILLING_STATUS_SWEEP_TRIGGER} trigger received`, { correlationId });
    try {
      await this.sweep.run({ correlationId });
    } catch (err) {
      this.logger.error(
        'StatusSweepTriggerHandler failed, will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { correlationId },
      );
      throw err;
    }
  }
}

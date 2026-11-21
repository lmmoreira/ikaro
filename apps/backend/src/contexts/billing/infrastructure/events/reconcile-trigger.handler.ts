import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { ReconcileChargesJob } from '../../application/jobs/reconcile-charges.job';
import { CRON_BILLING_RECONCILE_TRIGGER } from './cron-trigger-names.constants';

/**
 * The hourly `cron-billing-reconcile` trigger (UC-116): calls exactly one job and rethrows, so a
 * failed run is nacked and redelivered. The trigger carries no payload and no tenant: the job
 * chooses its own scope from the clock, and a fresh correlation id is minted for the run.
 */
@Injectable()
export class ReconcileTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'billing-reconcile';

  private readonly logger = new AppLogger(ReconcileTriggerHandler.name);

  constructor(
    @Inject(ReconcileChargesJob) private readonly reconcile: Pick<ReconcileChargesJob, 'run'>,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_BILLING_RECONCILE_TRIGGER,
      () => this.handle(),
      ReconcileTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    const correlationId = uuidv7();
    this.logger.log(`${CRON_BILLING_RECONCILE_TRIGGER} trigger received`, { correlationId });
    try {
      await this.reconcile.run({ correlationId });
    } catch (err) {
      this.logger.error(
        'ReconcileTriggerHandler failed, will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { correlationId },
      );
      throw err;
    }
  }
}

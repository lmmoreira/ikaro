import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { SelfHealJob } from '../../application/jobs/self-heal.job';
import { CRON_BILLING_SELF_HEAL_TRIGGER } from './cron-trigger-names.constants';

/**
 * The hourly `cron-billing-self-heal` trigger (UC-140): calls exactly one job and rethrows, so a
 * failed run is nacked and redelivered. The trigger carries no payload and no tenant: the job
 * chooses its own scope from the clock, and a fresh correlation id is minted for the run.
 */
@Injectable()
export class SelfHealTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'billing-self-heal';

  private readonly logger = new AppLogger(SelfHealTriggerHandler.name);

  constructor(
    @Inject(SelfHealJob) private readonly selfHeal: Pick<SelfHealJob, 'run'>,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_BILLING_SELF_HEAL_TRIGGER,
      () => this.handle(),
      SelfHealTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    const correlationId = uuidv7();
    this.logger.log(`${CRON_BILLING_SELF_HEAL_TRIGGER} trigger received`, { correlationId });
    try {
      await this.selfHeal.run({ correlationId });
    } catch (err) {
      this.logger.error(
        'SelfHealTriggerHandler failed, will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { correlationId },
      );
      throw err;
    }
  }
}

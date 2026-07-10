import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { ExpirePointsJob } from '../../application/jobs/expire-points.job';
import { CRON_LOYALTY_EXPIRY_TRIGGER } from './cron-trigger-names.constants';

@Injectable()
export class ExpirePointsTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'loyalty-expire-points';

  private readonly logger = new AppLogger(ExpirePointsTriggerHandler.name);

  constructor(
    private readonly expirePointsJob: ExpirePointsJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_LOYALTY_EXPIRY_TRIGGER,
      () => this.handle(),
      ExpirePointsTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      `${CRON_LOYALTY_EXPIRY_TRIGGER} trigger received by ${ExpirePointsTriggerHandler.CONSUMER_NAME} handler`,
    );
    try {
      await this.expirePointsJob.run();
    } catch (err) {
      this.logger.error(
        'ExpirePointsTriggerHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}

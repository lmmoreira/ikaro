import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { ExpirePointsJob } from '../../application/jobs/expire-points.job';

@Injectable()
export class ExpirePointsTriggerHandler implements OnModuleInit {
  private readonly logger = new AppLogger(ExpirePointsTriggerHandler.name);

  constructor(
    private readonly expirePointsJob: ExpirePointsJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      'cron-loyalty-expiry',
      () => this.handle(),
      'loyalty-expire-points',
    );
  }

  async handle(): Promise<void> {
    this.logger.log('cron-loyalty-expiry trigger received by loyalty-expire-points handler');
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

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { NotifyExpiringPointsJob } from '../../application/jobs/notify-expiring-points.job';

@Injectable()
export class NotifyExpiringPointsTriggerHandler implements OnModuleInit {
  private readonly logger = new AppLogger(NotifyExpiringPointsTriggerHandler.name);

  constructor(
    private readonly notifyExpiringPointsJob: NotifyExpiringPointsJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      'cron-loyalty-expiry-warning',
      () => this.handle(),
      'loyalty-notify-expiring-points',
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      'cron-loyalty-expiry-warning trigger received by loyalty-notify-expiring-points handler',
    );
    try {
      await this.notifyExpiringPointsJob.run();
    } catch (err) {
      this.logger.error(
        'NotifyExpiringPointsTriggerHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}

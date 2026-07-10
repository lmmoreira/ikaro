import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { NotifyExpiringPointsJob } from '../../application/jobs/notify-expiring-points.job';
import { CRON_LOYALTY_EXPIRY_WARNING_TRIGGER } from './cron-trigger-names.constants';

@Injectable()
export class NotifyExpiringPointsTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'loyalty-notify-expiring-points';

  private readonly logger = new AppLogger(NotifyExpiringPointsTriggerHandler.name);

  constructor(
    private readonly notifyExpiringPointsJob: NotifyExpiringPointsJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_LOYALTY_EXPIRY_WARNING_TRIGGER,
      () => this.handle(),
      NotifyExpiringPointsTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      `${CRON_LOYALTY_EXPIRY_WARNING_TRIGGER} trigger received by ${NotifyExpiringPointsTriggerHandler.CONSUMER_NAME} handler`,
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

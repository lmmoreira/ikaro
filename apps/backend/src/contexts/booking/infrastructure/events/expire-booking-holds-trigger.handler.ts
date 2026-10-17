import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { ExpireBookingHoldsJob } from '../../application/jobs/expire-booking-holds.job';
import { CRON_REMINDERS_TRIGGER } from './cron-trigger-names.constants';

@Injectable()
export class ExpireBookingHoldsTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'booking-hold-expiry';

  private readonly logger = new AppLogger(ExpireBookingHoldsTriggerHandler.name);

  constructor(
    private readonly expireHoldsJob: ExpireBookingHoldsJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_REMINDERS_TRIGGER,
      () => this.handle(),
      ExpireBookingHoldsTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      `${CRON_REMINDERS_TRIGGER} trigger received by ${ExpireBookingHoldsTriggerHandler.CONSUMER_NAME} handler`,
    );
    try {
      await this.expireHoldsJob.run();
    } catch (err) {
      this.logger.error(
        'ExpireBookingHoldsTriggerHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { PublishBillingRemindersJob } from '../../application/jobs/publish-billing-reminders.job';
import { CRON_BILLING_REMINDERS_TRIGGER } from './cron-trigger-names.constants';

/**
 * The daily `cron-billing-reminders` trigger (UC-139): calls exactly one job and rethrows, so a
 * failed run is nacked and redelivered. The trigger carries no payload and no tenant: the job
 * chooses its own scope from the clock, and a fresh correlation id is minted for the run.
 */
@Injectable()
export class RemindersTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'billing-reminders';

  private readonly logger = new AppLogger(RemindersTriggerHandler.name);

  constructor(
    @Inject(PublishBillingRemindersJob)
    private readonly reminders: Pick<PublishBillingRemindersJob, 'run'>,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_BILLING_REMINDERS_TRIGGER,
      () => this.handle(),
      RemindersTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    const correlationId = uuidv7();
    this.logger.log(`${CRON_BILLING_REMINDERS_TRIGGER} trigger received`, { correlationId });
    try {
      await this.reminders.run({ correlationId });
    } catch (err) {
      this.logger.error(
        'RemindersTriggerHandler failed, will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { correlationId },
      );
      throw err;
    }
  }
}

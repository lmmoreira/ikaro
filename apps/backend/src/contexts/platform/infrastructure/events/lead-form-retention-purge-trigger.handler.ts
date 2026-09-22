import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { LeadFormRetentionPurgeJob } from '../../application/jobs/lead-form-retention-purge.job';
import { CRON_LEAD_FORM_RETENTION_TRIGGER } from './cron-trigger-names.constants';

@Injectable()
export class LeadFormRetentionPurgeTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'lead-form-retention-purge';

  private readonly logger = new AppLogger(LeadFormRetentionPurgeTriggerHandler.name);

  constructor(
    private readonly leadFormRetentionPurgeJob: LeadFormRetentionPurgeJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_LEAD_FORM_RETENTION_TRIGGER,
      () => this.handle(),
      LeadFormRetentionPurgeTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      `${CRON_LEAD_FORM_RETENTION_TRIGGER} trigger received by ${LeadFormRetentionPurgeTriggerHandler.CONSUMER_NAME} handler`,
    );
    try {
      const result = await this.leadFormRetentionPurgeJob.run();
      this.logger.log('lead form retention purge complete', {
        submissionsDeleted: result.submissionsDeleted,
      });
    } catch (err) {
      this.logger.error(
        'LeadFormRetentionPurgeTriggerHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}

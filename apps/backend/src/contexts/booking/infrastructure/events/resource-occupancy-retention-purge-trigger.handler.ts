import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { ResourceOccupancyRetentionPurgeJob } from '../../application/jobs/resource-occupancy-retention-purge.job';
import { CRON_RESOURCE_OCCUPANCY_RETENTION_PURGE_TRIGGER } from './cron-trigger-names.constants';

@Injectable()
export class ResourceOccupancyRetentionPurgeTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'resource-occupancy-retention-purge';

  private readonly logger = new AppLogger(ResourceOccupancyRetentionPurgeTriggerHandler.name);

  constructor(
    private readonly resourceOccupancyRetentionPurgeJob: ResourceOccupancyRetentionPurgeJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_RESOURCE_OCCUPANCY_RETENTION_PURGE_TRIGGER,
      () => this.handle(),
      ResourceOccupancyRetentionPurgeTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      `${CRON_RESOURCE_OCCUPANCY_RETENTION_PURGE_TRIGGER} trigger received by ${ResourceOccupancyRetentionPurgeTriggerHandler.CONSUMER_NAME} handler`,
    );
    try {
      const result = await this.resourceOccupancyRetentionPurgeJob.run();
      this.logger.log('resource_occupancy retention purge complete', {
        rowsDeleted: result.rowsDeleted,
      });
    } catch (err) {
      this.logger.error(
        'ResourceOccupancyRetentionPurgeTriggerHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}

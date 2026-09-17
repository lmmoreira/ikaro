import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { ResourceOccupancyRetentionPurgeJob } from '../../application/jobs/resource-occupancy-retention-purge.job';
import { ResourceOccupancyRetentionPurgeTriggerHandler } from './resource-occupancy-retention-purge-trigger.handler';
import { CRON_RESOURCE_OCCUPANCY_RETENTION_PURGE_TRIGGER } from './cron-trigger-names.constants';

describe('ResourceOccupancyRetentionPurgeTriggerHandler', () => {
  let handler: ResourceOccupancyRetentionPurgeTriggerHandler;
  let job: jest.Mocked<ResourceOccupancyRetentionPurgeJob>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = {
      run: jest.fn().mockResolvedValue({ rowsDeleted: 0 }),
    } as unknown as jest.Mocked<ResourceOccupancyRetentionPurgeJob>;
    triggerBus = new InMemoryEventBus();
    handler = new ResourceOccupancyRetentionPurgeTriggerHandler(job, triggerBus);
  });

  it('registers the cron-resource-occupancy-retention-purge trigger with the resource-occupancy-retention-purge consumer name on init', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');
    handler.onModuleInit();
    expect(spy).toHaveBeenCalledWith(
      CRON_RESOURCE_OCCUPANCY_RETENTION_PURGE_TRIGGER,
      expect.any(Function),
      ResourceOccupancyRetentionPurgeTriggerHandler.CONSUMER_NAME,
    );
  });

  it('delegates to ResourceOccupancyRetentionPurgeJob.run()', async () => {
    await handler.handle();
    expect(job.run).toHaveBeenCalledTimes(1);
    expect(job.run).toHaveBeenCalledWith();
  });

  it('rethrows when the job fails', async () => {
    job.run.mockRejectedValue(new Error('boom'));
    await expect(handler.handle()).rejects.toThrow('boom');
  });
});

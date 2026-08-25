import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { LeadFormRetentionPurgeJob } from '../../application/jobs/lead-form-retention-purge.job';
import { LeadFormRetentionPurgeTriggerHandler } from './lead-form-retention-purge-trigger.handler';
import { CRON_LEAD_FORM_RETENTION_TRIGGER } from './cron-trigger-names.constants';

describe('LeadFormRetentionPurgeTriggerHandler', () => {
  let handler: LeadFormRetentionPurgeTriggerHandler;
  let job: jest.Mocked<LeadFormRetentionPurgeJob>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = {
      run: jest.fn().mockResolvedValue({ submissionsDeleted: 0 }),
    } as unknown as jest.Mocked<LeadFormRetentionPurgeJob>;
    triggerBus = new InMemoryEventBus();
    handler = new LeadFormRetentionPurgeTriggerHandler(job, triggerBus);
  });

  it('registers the cron-lead-form-retention trigger with the lead-form-retention-purge consumer name on init', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');
    handler.onModuleInit();
    expect(spy).toHaveBeenCalledWith(
      CRON_LEAD_FORM_RETENTION_TRIGGER,
      expect.any(Function),
      LeadFormRetentionPurgeTriggerHandler.CONSUMER_NAME,
    );
  });

  it('delegates to LeadFormRetentionPurgeJob.run()', async () => {
    await handler.handle();
    expect(job.run).toHaveBeenCalledTimes(1);
    expect(job.run).toHaveBeenCalledWith();
  });

  it('rethrows when the job fails', async () => {
    job.run.mockRejectedValue(new Error('boom'));
    await expect(handler.handle()).rejects.toThrow('boom');
  });
});

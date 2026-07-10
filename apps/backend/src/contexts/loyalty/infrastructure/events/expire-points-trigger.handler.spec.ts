import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { ExpirePointsJob } from '../../application/jobs/expire-points.job';
import { CRON_LOYALTY_EXPIRY_TRIGGER } from './cron-trigger-names.constants';
import { ExpirePointsTriggerHandler } from './expire-points-trigger.handler';

describe('ExpirePointsTriggerHandler', () => {
  let handler: ExpirePointsTriggerHandler;
  let job: jest.Mocked<ExpirePointsJob>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = {
      run: jest
        .fn()
        .mockResolvedValue({ processedEntries: 0, affectedCustomers: 0, totalPointsExpired: 0 }),
    } as unknown as jest.Mocked<ExpirePointsJob>;
    triggerBus = new InMemoryEventBus();
    handler = new ExpirePointsTriggerHandler(job, triggerBus);
  });

  it('registers the cron-loyalty-expiry trigger with the loyalty-expire-points consumer name on init', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');
    handler.onModuleInit();
    expect(spy).toHaveBeenCalledWith(
      CRON_LOYALTY_EXPIRY_TRIGGER,
      expect.any(Function),
      ExpirePointsTriggerHandler.CONSUMER_NAME,
    );
  });

  it('delegates to ExpirePointsJob.run()', async () => {
    await handler.handle();
    expect(job.run).toHaveBeenCalledTimes(1);
    expect(job.run).toHaveBeenCalledWith();
  });

  it('rethrows when the job fails', async () => {
    job.run.mockRejectedValue(new Error('boom'));
    await expect(handler.handle()).rejects.toThrow('boom');
  });
});

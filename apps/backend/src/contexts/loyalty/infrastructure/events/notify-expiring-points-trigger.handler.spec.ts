import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { NotifyExpiringPointsJob } from '../../application/jobs/notify-expiring-points.job';
import { CRON_LOYALTY_EXPIRY_WARNING_TRIGGER } from './cron-trigger-names.constants';
import { NotifyExpiringPointsTriggerHandler } from './notify-expiring-points-trigger.handler';

describe('NotifyExpiringPointsTriggerHandler', () => {
  let handler: NotifyExpiringPointsTriggerHandler;
  let job: jest.Mocked<NotifyExpiringPointsJob>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = {
      run: jest.fn().mockResolvedValue({ customersNotified: 0 }),
    } as unknown as jest.Mocked<NotifyExpiringPointsJob>;
    triggerBus = new InMemoryEventBus();
    handler = new NotifyExpiringPointsTriggerHandler(job, triggerBus);
  });

  it('registers the cron-loyalty-expiry-warning trigger with the loyalty-notify-expiring-points consumer name on init', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');
    handler.onModuleInit();
    expect(spy).toHaveBeenCalledWith(
      CRON_LOYALTY_EXPIRY_WARNING_TRIGGER,
      expect.any(Function),
      NotifyExpiringPointsTriggerHandler.CONSUMER_NAME,
    );
  });

  it('delegates to NotifyExpiringPointsJob.run()', async () => {
    await handler.handle();
    expect(job.run).toHaveBeenCalledTimes(1);
    expect(job.run).toHaveBeenCalledWith();
  });

  it('rethrows when the job fails', async () => {
    job.run.mockRejectedValue(new Error('boom'));
    await expect(handler.handle()).rejects.toThrow('boom');
  });
});

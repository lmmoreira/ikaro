import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import type { SweepSubscriptionStatusesJob } from '../../application/jobs/sweep-subscription-statuses.job';
import { CRON_BILLING_STATUS_SWEEP_TRIGGER } from './cron-trigger-names.constants';
import { StatusSweepTriggerHandler } from './status-sweep-trigger.handler';

describe('StatusSweepTriggerHandler', () => {
  let handler: StatusSweepTriggerHandler;
  let job: jest.Mocked<Pick<SweepSubscriptionStatusesJob, 'run'>>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = {
      run: jest
        .fn()
        .mockResolvedValue({ selected: 0, outcomes: {}, steps: {}, deferred: 0, failed: 0 }),
    };
    triggerBus = new InMemoryEventBus();
    handler = new StatusSweepTriggerHandler(job, triggerBus);
  });

  it('registers cron-billing-status-sweep with the billing-status-sweep consumer on init', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');

    handler.onModuleInit();

    expect(spy).toHaveBeenCalledWith(
      CRON_BILLING_STATUS_SWEEP_TRIGGER,
      expect.any(Function),
      StatusSweepTriggerHandler.CONSUMER_NAME,
    );
    expect(StatusSweepTriggerHandler.CONSUMER_NAME).toBe('billing-status-sweep');
  });

  it('the registered callback runs the job, and a failed run propagates so the message is nacked', async () => {
    let registered: (() => Promise<void>) | undefined;
    jest.spyOn(triggerBus, 'registerTrigger').mockImplementation((_name, callback) => {
      registered = callback;
    });
    handler.onModuleInit();

    await registered?.();
    expect(job.run).toHaveBeenCalledTimes(1);

    job.run.mockRejectedValue(new Error('boom'));
    await expect(registered?.()).rejects.toThrow('boom');
  });

  it('calls the one job with a fresh correlation id for each run', async () => {
    await handler.handle();
    await handler.handle();

    expect(job.run).toHaveBeenCalledTimes(2);
    const [first, second] = job.run.mock.calls.map(([input]) => input.correlationId);
    expect(first).toEqual(expect.any(String));
    expect(first).not.toBe(second);
  });

  it('rethrows a failed run so the trigger message is nacked and redelivered', async () => {
    job.run.mockRejectedValue(new Error('boom'));

    await expect(handler.handle()).rejects.toThrow('boom');
  });
});

import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import type { SelfHealJob } from '../../application/jobs/self-heal.job';
import { CRON_BILLING_SELF_HEAL_TRIGGER } from './cron-trigger-names.constants';
import { SelfHealTriggerHandler } from './self-heal-trigger.handler';

describe('SelfHealTriggerHandler', () => {
  let handler: SelfHealTriggerHandler;
  let job: jest.Mocked<Pick<SelfHealJob, 'run'>>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = { run: jest.fn().mockResolvedValue({}) };
    triggerBus = new InMemoryEventBus();
    handler = new SelfHealTriggerHandler(job, triggerBus);
  });

  it('registers cron-billing-self-heal with the billing-self-heal consumer on init', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');

    handler.onModuleInit();

    expect(spy).toHaveBeenCalledWith(
      CRON_BILLING_SELF_HEAL_TRIGGER,
      expect.any(Function),
      SelfHealTriggerHandler.CONSUMER_NAME,
    );
    expect(SelfHealTriggerHandler.CONSUMER_NAME).toBe('billing-self-heal');
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

  it('calls the one job with a fresh correlation id for each run and nothing else', async () => {
    await handler.handle();
    await handler.handle();

    const [first, second] = job.run.mock.calls.map(([input]) => input);
    expect(Object.keys(first)).toEqual(['correlationId']);
    expect(first.correlationId).not.toBe(second.correlationId);
  });
});

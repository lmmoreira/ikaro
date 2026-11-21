import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import type { ReconcileChargesJob } from '../../application/jobs/reconcile-charges.job';
import { CRON_BILLING_RECONCILE_TRIGGER } from './cron-trigger-names.constants';
import { ReconcileTriggerHandler } from './reconcile-trigger.handler';

describe('ReconcileTriggerHandler', () => {
  let handler: ReconcileTriggerHandler;
  let job: jest.Mocked<Pick<ReconcileChargesJob, 'run'>>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = { run: jest.fn().mockResolvedValue({ scope: 'AT_RISK', checked: 0 }) };
    triggerBus = new InMemoryEventBus();
    handler = new ReconcileTriggerHandler(job, triggerBus);
  });

  it('registers cron-billing-reconcile with the billing-reconcile consumer on init', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');

    handler.onModuleInit();

    expect(spy).toHaveBeenCalledWith(
      CRON_BILLING_RECONCILE_TRIGGER,
      expect.any(Function),
      ReconcileTriggerHandler.CONSUMER_NAME,
    );
    expect(ReconcileTriggerHandler.CONSUMER_NAME).toBe('billing-reconcile');
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

  it('calls the one job with a fresh correlation id for each run and no scope: the job chooses it', async () => {
    await handler.handle();
    await handler.handle();

    expect(job.run).toHaveBeenCalledTimes(2);
    const [first, second] = job.run.mock.calls.map(([input]) => input);
    expect(Object.keys(first)).toEqual(['correlationId']);
    expect(first.correlationId).toEqual(expect.any(String));
    expect(first.correlationId).not.toBe(second.correlationId);
  });

  it('rethrows a failed run so the trigger message is nacked and redelivered', async () => {
    job.run.mockRejectedValue(new Error('boom'));

    await expect(handler.handle()).rejects.toThrow('boom');
  });
});

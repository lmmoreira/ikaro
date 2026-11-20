import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import type { IssueNextChargesJob } from '../../application/jobs/issue-next-charges.job';
import { CRON_BILLING_ISSUE_CHARGES_TRIGGER } from './cron-trigger-names.constants';
import { IssueNextChargesTriggerHandler } from './issue-next-charges-trigger.handler';

describe('IssueNextChargesTriggerHandler', () => {
  let handler: IssueNextChargesTriggerHandler;
  let useCase: jest.Mocked<Pick<IssueNextChargesJob, 'run'>>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    useCase = {
      run: jest
        .fn()
        .mockResolvedValue({ selected: 0, outcomes: {}, retrySelected: 0, retryReady: 0 }),
    };
    triggerBus = new InMemoryEventBus();
    handler = new IssueNextChargesTriggerHandler(
      useCase as unknown as IssueNextChargesJob,
      triggerBus,
    );
  });

  it('registers cron-billing-issue-charges with the billing-issue-next-charges consumer on init', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');

    handler.onModuleInit();

    expect(spy).toHaveBeenCalledWith(
      CRON_BILLING_ISSUE_CHARGES_TRIGGER,
      expect.any(Function),
      IssueNextChargesTriggerHandler.CONSUMER_NAME,
    );
    expect(CRON_BILLING_ISSUE_CHARGES_TRIGGER).toBe('cron-billing-issue-charges');
  });

  it('calls the one job with a fresh correlation id for each run', async () => {
    await handler.handle();
    await handler.handle();

    expect(useCase.run).toHaveBeenCalledTimes(2);
    const [first, second] = useCase.run.mock.calls.map(([input]) => input.correlationId);
    expect(first).toEqual(expect.any(String));
    expect(first).not.toBe(second);
  });

  it('rethrows a failed run so the trigger message is nacked and redelivered', async () => {
    useCase.run.mockRejectedValue(new Error('boom'));

    await expect(handler.handle()).rejects.toThrow('boom');
  });
});

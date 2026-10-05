import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { AvailabilityAlertSweepJob } from '../../application/jobs/availability-alert-sweep.job';
import { AvailabilityAlertSweepTriggerHandler } from './availability-alert-sweep-trigger.handler';
import { CRON_REMINDERS_TRIGGER } from './cron-trigger-names.constants';

describe('AvailabilityAlertSweepTriggerHandler', () => {
  let handler: AvailabilityAlertSweepTriggerHandler;
  let job: jest.Mocked<AvailabilityAlertSweepJob>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = {
      run: jest.fn().mockResolvedValue({ tenantsSwept: 0, notified: 0 }),
    } as unknown as jest.Mocked<AvailabilityAlertSweepJob>;
    triggerBus = new InMemoryEventBus();
    handler = new AvailabilityAlertSweepTriggerHandler(job, triggerBus);
  });

  it('registers on the existing cron-reminders trigger with its own consumer name', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');

    handler.onModuleInit();

    expect(spy).toHaveBeenCalledWith(
      CRON_REMINDERS_TRIGGER,
      expect.any(Function),
      AvailabilityAlertSweepTriggerHandler.CONSUMER_NAME,
    );
  });

  it('delegates to the sweep job', async () => {
    await handler.handle();

    expect(job.run).toHaveBeenCalledTimes(1);
  });

  it('rethrows when the job fails so the message is retried', async () => {
    job.run.mockRejectedValue(new Error('boom'));

    await expect(handler.handle()).rejects.toThrow('boom');
  });
});

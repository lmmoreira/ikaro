import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { RecurringScheduleRenewalReminderJob } from '../../application/jobs/recurring-schedule-renewal-reminder.job';
import { CRON_REMINDERS_TRIGGER } from './cron-trigger-names.constants';
import { RecurringScheduleRenewalReminderTriggerHandler } from './recurring-schedule-renewal-reminder-trigger.handler';

describe('RecurringScheduleRenewalReminderTriggerHandler', () => {
  let handler: RecurringScheduleRenewalReminderTriggerHandler;
  let job: jest.Mocked<RecurringScheduleRenewalReminderJob>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = {
      run: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RecurringScheduleRenewalReminderJob>;
    triggerBus = new InMemoryEventBus();
    handler = new RecurringScheduleRenewalReminderTriggerHandler(job, triggerBus);
  });

  it('registers on the existing cron-reminders trigger with its own consumer name', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');

    handler.onModuleInit();

    expect(spy).toHaveBeenCalledWith(
      CRON_REMINDERS_TRIGGER,
      expect.any(Function),
      RecurringScheduleRenewalReminderTriggerHandler.CONSUMER_NAME,
    );
  });

  it('delegates to the job', async () => {
    await handler.handle();

    expect(job.run).toHaveBeenCalledTimes(1);
  });

  it('rethrows when the job fails so the message is retried', async () => {
    job.run.mockRejectedValue(new Error('boom'));

    await expect(handler.handle()).rejects.toThrow('boom');
  });
});

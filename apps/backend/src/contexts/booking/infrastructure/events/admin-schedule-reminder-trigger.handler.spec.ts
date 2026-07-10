import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { AdminScheduleReminderJob } from '../../application/jobs/admin-schedule-reminder.job';
import { AdminScheduleReminderTriggerHandler } from './admin-schedule-reminder-trigger.handler';
import { CRON_REMINDERS_TRIGGER } from './cron-trigger-names.constants';

describe('AdminScheduleReminderTriggerHandler', () => {
  let handler: AdminScheduleReminderTriggerHandler;
  let job: jest.Mocked<AdminScheduleReminderJob>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = {
      run: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AdminScheduleReminderJob>;
    triggerBus = new InMemoryEventBus();
    handler = new AdminScheduleReminderTriggerHandler(job, triggerBus);
  });

  it('registers the cron-reminders trigger with the booking-admin-schedule-reminder consumer name on init', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');
    handler.onModuleInit();
    expect(spy).toHaveBeenCalledWith(
      CRON_REMINDERS_TRIGGER,
      expect.any(Function),
      AdminScheduleReminderTriggerHandler.CONSUMER_NAME,
    );
  });

  it('delegates to AdminScheduleReminderJob.run()', async () => {
    await handler.handle();
    expect(job.run).toHaveBeenCalledTimes(1);
    expect(job.run).toHaveBeenCalledWith();
  });

  it('rethrows when the job fails', async () => {
    job.run.mockRejectedValue(new Error('boom'));
    await expect(handler.handle()).rejects.toThrow('boom');
  });
});

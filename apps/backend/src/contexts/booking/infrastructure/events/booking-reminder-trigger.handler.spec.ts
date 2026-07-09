import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { BookingReminderJob } from '../../application/jobs/booking-reminder.job';
import { BookingReminderTriggerHandler } from './booking-reminder-trigger.handler';

describe('BookingReminderTriggerHandler', () => {
  let handler: BookingReminderTriggerHandler;
  let job: jest.Mocked<BookingReminderJob>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = {
      run: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<BookingReminderJob>;
    triggerBus = new InMemoryEventBus();
    handler = new BookingReminderTriggerHandler(job, triggerBus);
  });

  it('registers the cron-reminders trigger with the booking-reminder consumer name on init', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');
    handler.onModuleInit();
    expect(spy).toHaveBeenCalledWith('cron-reminders', expect.any(Function), 'booking-reminder');
  });

  it('delegates to BookingReminderJob.run()', async () => {
    await handler.handle();
    expect(job.run).toHaveBeenCalledTimes(1);
    expect(job.run).toHaveBeenCalledWith();
  });

  it('rethrows when the job fails', async () => {
    job.run.mockRejectedValue(new Error('boom'));
    await expect(handler.handle()).rejects.toThrow('boom');
  });
});

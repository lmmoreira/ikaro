import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { ExpireBookingHoldsJob } from '../../application/jobs/expire-booking-holds.job';
import { CRON_REMINDERS_TRIGGER } from './cron-trigger-names.constants';
import { ExpireBookingHoldsTriggerHandler } from './expire-booking-holds-trigger.handler';

describe('ExpireBookingHoldsTriggerHandler', () => {
  let handler: ExpireBookingHoldsTriggerHandler;
  let job: jest.Mocked<ExpireBookingHoldsJob>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = {
      run: jest.fn().mockResolvedValue({ expired: 0 }),
    } as unknown as jest.Mocked<ExpireBookingHoldsJob>;
    triggerBus = new InMemoryEventBus();
    handler = new ExpireBookingHoldsTriggerHandler(job, triggerBus);
  });

  it('registers on the existing cron-reminders trigger with its own consumer name', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');
    handler.onModuleInit();
    expect(spy).toHaveBeenCalledWith(
      CRON_REMINDERS_TRIGGER,
      expect.any(Function),
      ExpireBookingHoldsTriggerHandler.CONSUMER_NAME,
    );
    expect(ExpireBookingHoldsTriggerHandler.CONSUMER_NAME).toBe('booking-hold-expiry');
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

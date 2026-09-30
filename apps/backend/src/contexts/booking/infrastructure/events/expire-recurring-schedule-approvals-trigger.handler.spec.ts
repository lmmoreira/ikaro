import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { ExpireRecurringBookingScheduleApprovalsJob } from '../../application/jobs/expire-recurring-schedule-approvals.job';
import { CRON_REMINDERS_TRIGGER } from './cron-trigger-names.constants';
import { ExpireRecurringScheduleApprovalsTriggerHandler } from './expire-recurring-schedule-approvals-trigger.handler';

describe('ExpireRecurringScheduleApprovalsTriggerHandler', () => {
  let handler: ExpireRecurringScheduleApprovalsTriggerHandler;
  let job: jest.Mocked<ExpireRecurringBookingScheduleApprovalsJob>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = {
      run: jest.fn().mockResolvedValue({ expired: 0, ended: 0 }),
    } as unknown as jest.Mocked<ExpireRecurringBookingScheduleApprovalsJob>;
    triggerBus = new InMemoryEventBus();
    handler = new ExpireRecurringScheduleApprovalsTriggerHandler(job, triggerBus);
  });

  it('registers on the existing cron-reminders trigger with its own consumer name', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');
    handler.onModuleInit();
    expect(spy).toHaveBeenCalledWith(
      CRON_REMINDERS_TRIGGER,
      expect.any(Function),
      ExpireRecurringScheduleApprovalsTriggerHandler.CONSUMER_NAME,
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

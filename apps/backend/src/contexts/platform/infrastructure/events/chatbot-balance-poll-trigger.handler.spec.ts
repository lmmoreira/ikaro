import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { ChatbotBalancePollJob } from '../../application/jobs/chatbot-balance-poll.job';
import { ChatbotBalancePollTriggerHandler } from './chatbot-balance-poll-trigger.handler';
import { CRON_CHATBOT_BALANCE_POLL_TRIGGER } from './cron-trigger-names.constants';

describe('ChatbotBalancePollTriggerHandler', () => {
  let handler: ChatbotBalancePollTriggerHandler;
  let job: jest.Mocked<ChatbotBalancePollJob>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = {
      run: jest.fn().mockResolvedValue({ polled: true }),
    } as unknown as jest.Mocked<ChatbotBalancePollJob>;
    triggerBus = new InMemoryEventBus();
    handler = new ChatbotBalancePollTriggerHandler(job, triggerBus);
  });

  it('registers the cron-chatbot-balance-poll trigger with the chatbot-balance-poll consumer name on init', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');
    handler.onModuleInit();
    expect(spy).toHaveBeenCalledWith(
      CRON_CHATBOT_BALANCE_POLL_TRIGGER,
      expect.any(Function),
      ChatbotBalancePollTriggerHandler.CONSUMER_NAME,
    );
  });

  it('delegates to ChatbotBalancePollJob.run()', async () => {
    await handler.handle();
    expect(job.run).toHaveBeenCalledTimes(1);
    expect(job.run).toHaveBeenCalledWith();
  });

  it('does not rethrow when the job reports a failed poll — that is an expected, already-handled outcome', async () => {
    job.run.mockResolvedValue({ polled: false });
    await expect(handler.handle()).resolves.toBeUndefined();
  });

  it('rethrows when the job itself throws (e.g. a DB write failure)', async () => {
    job.run.mockRejectedValue(new Error('boom'));
    await expect(handler.handle()).rejects.toThrow('boom');
  });
});

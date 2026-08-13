import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { ChatbotRetentionPurgeJob } from '../../application/jobs/chatbot-retention-purge.job';
import { ChatbotRetentionPurgeTriggerHandler } from './chatbot-retention-purge-trigger.handler';
import { CRON_CHATBOT_RETENTION_PURGE_TRIGGER } from './cron-trigger-names.constants';

describe('ChatbotRetentionPurgeTriggerHandler', () => {
  let handler: ChatbotRetentionPurgeTriggerHandler;
  let job: jest.Mocked<ChatbotRetentionPurgeJob>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    job = {
      run: jest.fn().mockResolvedValue({ messagesDeleted: 0, sessionsDeleted: 0 }),
    } as unknown as jest.Mocked<ChatbotRetentionPurgeJob>;
    triggerBus = new InMemoryEventBus();
    handler = new ChatbotRetentionPurgeTriggerHandler(job, triggerBus);
  });

  it('registers the cron-chatbot-retention-purge trigger with the chatbot-retention-purge consumer name on init', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');
    handler.onModuleInit();
    expect(spy).toHaveBeenCalledWith(
      CRON_CHATBOT_RETENTION_PURGE_TRIGGER,
      expect.any(Function),
      ChatbotRetentionPurgeTriggerHandler.CONSUMER_NAME,
    );
  });

  it('delegates to ChatbotRetentionPurgeJob.run()', async () => {
    await handler.handle();
    expect(job.run).toHaveBeenCalledTimes(1);
    expect(job.run).toHaveBeenCalledWith();
  });

  it('rethrows when the job fails', async () => {
    job.run.mockRejectedValue(new Error('boom'));
    await expect(handler.handle()).rejects.toThrow('boom');
  });
});

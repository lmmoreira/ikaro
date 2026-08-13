import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { CRON_CHATBOT_RETENTION_PURGE_TRIGGER } from '../events/cron-trigger-names.constants';
import { CronChatbotController } from './cron-chatbot.controller';

describe('CronChatbotController', () => {
  let controller: CronChatbotController;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    triggerBus = new InMemoryEventBus();
    controller = new CronChatbotController(triggerBus);
  });

  describe('POST /cron/chatbot-retention-purge', () => {
    it('returns { ok: true }', async () => {
      const result = await controller.runRetentionPurge();
      expect(result).toEqual({ ok: true });
    });

    it('publishes the cron-chatbot-retention-purge trigger', async () => {
      await controller.runRetentionPurge();
      expect(triggerBus.publishedTriggers).toEqual([CRON_CHATBOT_RETENTION_PURGE_TRIGGER]);
    });
  });
});

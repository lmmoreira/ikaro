import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { ChatbotRetentionPurgeJob } from '../../application/jobs/chatbot-retention-purge.job';
import { CRON_CHATBOT_RETENTION_PURGE_TRIGGER } from './cron-trigger-names.constants';

@Injectable()
export class ChatbotRetentionPurgeTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'chatbot-retention-purge';

  private readonly logger = new AppLogger(ChatbotRetentionPurgeTriggerHandler.name);

  constructor(
    private readonly chatbotRetentionPurgeJob: ChatbotRetentionPurgeJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_CHATBOT_RETENTION_PURGE_TRIGGER,
      () => this.handle(),
      ChatbotRetentionPurgeTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      `${CRON_CHATBOT_RETENTION_PURGE_TRIGGER} trigger received by ${ChatbotRetentionPurgeTriggerHandler.CONSUMER_NAME} handler`,
    );
    try {
      const result = await this.chatbotRetentionPurgeJob.run();
      this.logger.log('chatbot retention purge complete', {
        messagesDeleted: result.messagesDeleted,
        sessionsDeleted: result.sessionsDeleted,
      });
    } catch (err) {
      this.logger.error(
        'ChatbotRetentionPurgeTriggerHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}

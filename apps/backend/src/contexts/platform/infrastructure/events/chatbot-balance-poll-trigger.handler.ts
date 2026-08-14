import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { ChatbotBalancePollJob } from '../../application/jobs/chatbot-balance-poll.job';
import { CRON_CHATBOT_BALANCE_POLL_TRIGGER } from './cron-trigger-names.constants';

@Injectable()
export class ChatbotBalancePollTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'chatbot-balance-poll';

  private readonly logger = new AppLogger(ChatbotBalancePollTriggerHandler.name);

  constructor(
    private readonly chatbotBalancePollJob: ChatbotBalancePollJob,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_CHATBOT_BALANCE_POLL_TRIGGER,
      () => this.handle(),
      ChatbotBalancePollTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      `${CRON_CHATBOT_BALANCE_POLL_TRIGGER} trigger received by ${ChatbotBalancePollTriggerHandler.CONSUMER_NAME} handler`,
    );
    try {
      const result = await this.chatbotBalancePollJob.run();
      this.logger.log('chatbot balance poll complete', { polled: result.polled });
    } catch (err) {
      this.logger.error(
        'ChatbotBalancePollTriggerHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}

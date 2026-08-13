import { Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { CRON_CHATBOT_RETENTION_PURGE_TRIGGER } from '../events/cron-trigger-names.constants';

// Thin publisher (mirrors CronLoyaltyController, M17-S03 pattern): publishes the daily
// chatbot-retention-purge trigger onto the same channel Cloud Scheduler publishes to in prod.
// Still behind the global InternalApiGuard (not PubSubPushGuard) — this endpoint is the
// local/manual trigger path only. The job itself runs via ChatbotRetentionPurgeTriggerHandler,
// dispatched through the shared /pubsub/push receiver in prod.
@Controller('cron')
export class CronChatbotController {
  constructor(@Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus) {}

  @Post('chatbot-retention-purge')
  @HttpCode(HttpStatus.OK)
  async runRetentionPurge(): Promise<{ ok: boolean }> {
    await this.triggerBus.publishTrigger(CRON_CHATBOT_RETENTION_PURGE_TRIGGER);
    return { ok: true };
  }
}

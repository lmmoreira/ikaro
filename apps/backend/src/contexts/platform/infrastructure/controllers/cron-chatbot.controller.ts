import { Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import {
  CRON_CHATBOT_BALANCE_POLL_TRIGGER,
  CRON_CHATBOT_RETENTION_PURGE_TRIGGER,
} from '../events/cron-trigger-names.constants';

// Thin publisher (mirrors CronLoyaltyController, M17-S03 pattern): publishes cron triggers onto
// the same channel Cloud Scheduler publishes to in prod. Still behind the global
// InternalApiGuard (not PubSubPushGuard) — these endpoints are the local/manual trigger path
// only. The jobs themselves run via their own trigger handlers, dispatched through the shared
// /pubsub/push receiver in prod.
@Controller('cron')
export class CronChatbotController {
  constructor(@Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus) {}

  @Post('chatbot-retention-purge')
  @HttpCode(HttpStatus.OK)
  async runRetentionPurge(): Promise<{ ok: boolean }> {
    await this.triggerBus.publishTrigger(CRON_CHATBOT_RETENTION_PURGE_TRIGGER);
    return { ok: true };
  }

  @Post('chatbot-balance-poll')
  @HttpCode(HttpStatus.OK)
  async runBalancePoll(): Promise<{ ok: boolean }> {
    await this.triggerBus.publishTrigger(CRON_CHATBOT_BALANCE_POLL_TRIGGER);
    return { ok: true };
  }
}

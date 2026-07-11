import { Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ITriggerBus, TRIGGER_BUS } from '../../ports/trigger-bus.port';
import { CRON_OUTBOX_RELAY_TRIGGER } from './cron-outbox-relay.constants';

// Thin publisher (TD24-S01): publishes the cron-outbox-relay trigger onto the same channel Cloud
// Scheduler publishes to in prod (M17-S21). Still behind the global InternalApiGuard (not
// PubSubPushGuard) — this endpoint is the local/manual trigger path only. The sweep actually runs
// via OutboxRelayTriggerHandler, subscribed to this same trigger and dispatched through the
// shared /pubsub/push receiver in prod. Mirrors cron-booking.controller.ts.
@Controller('cron')
export class OutboxRelayController {
  constructor(@Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus) {}

  @Post('outbox-relay')
  @HttpCode(HttpStatus.OK)
  async outboxRelay(): Promise<{ ok: boolean }> {
    await this.triggerBus.publishTrigger(CRON_OUTBOX_RELAY_TRIGGER);
    return { ok: true };
  }
}

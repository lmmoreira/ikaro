import { Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';

// Thin publisher (M17-S03): publishes cron triggers onto the same channels Cloud Scheduler
// publishes to in prod. Still behind the global InternalApiGuard (not PubSubPushGuard) — these
// endpoints are the local/manual trigger path only. Two distinct triggers, matching two distinct
// Scheduler cadences (S21): daily expiry (cron-loyalty-expiry, decrements balances — must stay
// daily so an already-expired entry doesn't sit visible/spendable in a customer's balance for up
// to a week) vs. weekly warning (cron-loyalty-expiry-warning, PointsExpiringSoon heads-up). The
// jobs actually run via ExpirePointsTriggerHandler / NotifyExpiringPointsTriggerHandler, each
// subscribed to its own trigger and dispatched through the shared /pubsub/push receiver in prod.
@Controller('cron')
export class CronLoyaltyController {
  constructor(@Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus) {}

  @Post('loyalty-expiry')
  @HttpCode(HttpStatus.OK)
  async runExpiry(): Promise<{ ok: boolean }> {
    await this.triggerBus.publishTrigger('cron-loyalty-expiry');
    return { ok: true };
  }

  @Post('loyalty-expiry-warning')
  @HttpCode(HttpStatus.OK)
  async runExpiryWarning(): Promise<{ ok: boolean }> {
    await this.triggerBus.publishTrigger('cron-loyalty-expiry-warning');
    return { ok: true };
  }
}

import { Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { CRON_REMINDERS_TRIGGER } from '../events/cron-trigger-names.constants';

// Thin publisher (M17-S03): publishes the cron-reminders trigger onto the same channel Cloud
// Scheduler publishes to in prod. Still behind the global InternalApiGuard (not PubSubPushGuard)
// — this endpoint is the local/manual trigger path only. The jobs actually run via
// BookingReminderTriggerHandler / AdminScheduleReminderTriggerHandler, both subscribed to this
// same trigger and dispatched through the shared /pubsub/push receiver in prod.
@Controller('cron')
export class CronBookingController {
  constructor(@Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus) {}

  @Post('reminders')
  @HttpCode(HttpStatus.OK)
  async reminders(): Promise<{ ok: boolean }> {
    await this.triggerBus.publishTrigger(CRON_REMINDERS_TRIGGER);
    return { ok: true };
  }
}

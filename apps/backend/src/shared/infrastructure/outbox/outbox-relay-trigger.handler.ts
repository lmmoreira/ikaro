import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppLogger } from '../../observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../ports/trigger-bus.port';
import { CRON_OUTBOX_RELAY_TRIGGER } from './cron-outbox-relay.constants';
import { OutboxRelayService } from './outbox-relay.service';

@Injectable()
export class OutboxRelayTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'outbox-relay';

  private readonly logger = new AppLogger(OutboxRelayTriggerHandler.name);

  constructor(
    private readonly relay: OutboxRelayService,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_OUTBOX_RELAY_TRIGGER,
      () => this.handle(),
      OutboxRelayTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    this.logger.log(
      `${CRON_OUTBOX_RELAY_TRIGGER} trigger received by ${OutboxRelayTriggerHandler.CONSUMER_NAME} handler`,
    );
    try {
      // No rowIds — full grace-window sweep + retention GC in this tick.
      await this.relay.relay();
    } catch (err) {
      this.logger.error(
        'OutboxRelayTriggerHandler failed — will nack for retry',
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}

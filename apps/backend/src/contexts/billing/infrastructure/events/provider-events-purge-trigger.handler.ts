import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { PurgeProviderEventsUseCase } from '../../application/use-cases/purge-provider-events.use-case';
import { CRON_BILLING_PROVIDER_EVENTS_PURGE_TRIGGER } from './cron-trigger-names.constants';

/**
 * The daily `cron-billing-provider-events-purge` trigger (UC-114): calls exactly one use case and
 * rethrows, so a failed run is nacked and redelivered. The trigger carries no tenant, so a fresh
 * correlation id is minted for the run.
 */
@Injectable()
export class ProviderEventsPurgeTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'billing-provider-events-purge';

  private readonly logger = new AppLogger(ProviderEventsPurgeTriggerHandler.name);

  constructor(
    @Inject(PurgeProviderEventsUseCase)
    private readonly purge: Pick<PurgeProviderEventsUseCase, 'execute'>,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_BILLING_PROVIDER_EVENTS_PURGE_TRIGGER,
      () => this.handle(),
      ProviderEventsPurgeTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    const correlationId = uuidv7();
    this.logger.log(`${CRON_BILLING_PROVIDER_EVENTS_PURGE_TRIGGER} trigger received`, {
      correlationId,
    });
    try {
      await this.purge.execute({ correlationId });
    } catch (err) {
      this.logger.error(
        'ProviderEventsPurgeTriggerHandler failed, will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { correlationId },
      );
      throw err;
    }
  }
}

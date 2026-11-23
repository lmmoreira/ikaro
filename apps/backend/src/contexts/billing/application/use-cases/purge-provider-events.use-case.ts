import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import {
  PROVIDER_EVENT_RETENTION_DAYS,
  PROVIDER_EVENTS_PURGE_BATCH_SIZE,
  PROVIDER_EVENTS_PURGE_MAX_BATCHES,
} from '../../domain/billing-constants';
import {
  IProviderEventRepository,
  PROVIDER_EVENT_REPOSITORY,
} from '../ports/provider-event-repository.port';

export interface PurgeProviderEventsUseCaseInput {
  correlationId: string;
}

export interface PurgeProviderEventsUseCaseResult {
  deleted: number;
  batches: number;
  /** True when the run stopped at its batch cap with a full last batch: more old rows may remain. */
  limitHit: boolean;
}

const DAY_MS = 86_400_000;

/**
 * UC-114 retention: deletes the webhook inbox rows (`billing.provider_events`) received more than
 * 30 days ago, in fixed-size batches, up to a per-run cap. The job is global (no tenant): a row
 * carries a tenant id and an event type but no payload or personal data, and nothing tenant-visible
 * is returned. Purged rows leave the selection, so a capped run cannot starve the rows behind it
 * and the next daily run continues; a rerun deletes nothing more. No lock: deleting an already
 * deleted row is a no-op. Logs the one `billing_provider_events_purge_run` line.
 */
@Injectable()
export class PurgeProviderEventsUseCase {
  private readonly logger = new AppLogger(PurgeProviderEventsUseCase.name);

  constructor(
    @Inject(PROVIDER_EVENT_REPOSITORY) private readonly events: IProviderEventRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(input: PurgeProviderEventsUseCaseInput): Promise<PurgeProviderEventsUseCaseResult> {
    const cutoff = new Date(this.clock.now().getTime() - PROVIDER_EVENT_RETENTION_DAYS * DAY_MS);
    let deleted = 0;
    let batches = 0;
    let lastBatchFull = false;
    while (batches < PROVIDER_EVENTS_PURGE_MAX_BATCHES) {
      const count = await this.events.deleteOlderThanBatch(
        cutoff,
        PROVIDER_EVENTS_PURGE_BATCH_SIZE,
      );
      batches += 1;
      deleted += count;
      lastBatchFull = count === PROVIDER_EVENTS_PURGE_BATCH_SIZE;
      if (!lastBatchFull) break;
    }
    const result = { deleted, batches, limitHit: lastBatchFull };
    this.logger.log('billing_provider_events_purge_run', {
      ...result,
      batchSize: PROVIDER_EVENTS_PURGE_BATCH_SIZE,
      maxBatches: PROVIDER_EVENTS_PURGE_MAX_BATCHES,
      correlationId: input.correlationId,
    });
    return result;
  }
}

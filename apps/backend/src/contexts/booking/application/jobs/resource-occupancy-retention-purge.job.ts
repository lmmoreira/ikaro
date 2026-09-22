import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';

const RETENTION_DAYS = 90;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface ResourceOccupancyRetentionPurgeJobResult {
  rowsDeleted: number;
}

// docs/13-DATABASE_SCHEMA.md § booking.resource_occupancy: "safely garbage-collectable after its
// window elapses (retention: 90 days past ends_at, trickle-deleted the same way
// shared.outbox/shared.inbox already are)". Purges every lock_state (REQUESTED, HOLD,
// COMMITTED alike) — this is the 90-day retention sweep only, not the active hold-expiry
// enforcement worker M22-S03 explicitly deferred as real M23 booking-flow scope. A HOLD row past
// its own hold_expires_at but still within the 90-day window is untouched by this job.
// booking_line_resource_assignments (the immutable audit record) is never touched, same
// invariant release()/assign() already preserve elsewhere in this codebase.
@Injectable()
export class ResourceOccupancyRetentionPurgeJob {
  constructor(
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly resourceOccupancyRepo: IResourceOccupancyRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async run(now: Date = new Date()): Promise<ResourceOccupancyRetentionPurgeJobResult> {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * ONE_DAY_MS);
    return this.txManager.run(async () => {
      const rowsDeleted = await this.resourceOccupancyRepo.deleteOlderThan(cutoff);
      return { rowsDeleted };
    });
  }
}

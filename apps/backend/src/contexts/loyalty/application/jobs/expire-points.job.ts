import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { mapSequentiallyIsolated } from '../../../../shared/utils/sequential-isolated';
import { LoyaltyEntry } from '../../domain/loyalty-entry.aggregate';
import {
  BALANCE_EXPIRY_LOG_REPOSITORY,
  IBalanceExpiryLogRepository,
} from '../ports/balance-expiry-log-repository.port';
import {
  EXPIRY_SWEEP_STATE_REPOSITORY,
  IExpirySweepStateRepository,
} from '../ports/expiry-sweep-state-repository.port';
import {
  ILoyaltyBalanceRepository,
  LOYALTY_BALANCE_REPOSITORY,
} from '../ports/loyalty-balance-repository.port';
import {
  ILoyaltyEntryRepository,
  LOYALTY_ENTRY_REPOSITORY,
} from '../ports/loyalty-entry-repository.port';

export interface ExpirePointsJobResult {
  processedEntries: number;
  affectedCustomers: number;
  totalPointsExpired: number;
}

interface GroupOutcome {
  entriesProcessed: number;
  pointsExpired: number;
}

// The read starts this far before the watermark. The expiry log filters out what is already done,
// so the overlap costs nothing; it only absorbs clock skew between instances.
const WATERMARK_OVERLAP_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ExpirePointsJob {
  private readonly logger = new AppLogger(ExpirePointsJob.name);

  constructor(
    @Inject(LOYALTY_ENTRY_REPOSITORY) private readonly entryRepo: ILoyaltyEntryRepository,
    @Inject(LOYALTY_BALANCE_REPOSITORY) private readonly balanceRepo: ILoyaltyBalanceRepository,
    @Inject(BALANCE_EXPIRY_LOG_REPOSITORY)
    private readonly expiryLogRepo: IBalanceExpiryLogRepository,
    @Inject(EXPIRY_SWEEP_STATE_REPOSITORY)
    private readonly sweepState: IExpirySweepStateRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  // Invariant: after a run that did not throw, every entry due up to `now` is in the expiry log.
  // The watermark therefore moves only when every customer group succeeded; a failing group makes
  // the helper throw after the others were tried, which skips `advanceTo`, so the retry (and the
  // next night's run) re-reads the same slice and only the still-unprocessed entries come back.
  async run(now: Date = new Date()): Promise<ExpirePointsJobResult> {
    const processedThrough = await this.sweepState.getProcessedThrough();
    const from = processedThrough
      ? new Date(processedThrough.getTime() - WATERMARK_OVERLAP_MS)
      : null;
    const due = await this.entryRepo.findUnprocessedDueBetween(from, now);

    const outcomes = await mapSequentiallyIsolated(
      [...this.groupByCustomer(due).values()],
      (entries) => this.processGroup(entries),
      {
        onFailure: (entries, err) =>
          this.logger.error(
            'ExpirePointsJob failed for a customer — the run will be retried',
            err instanceof Error ? err.stack : String(err),
            { tenantId: entries[0].tenantId, customerId: entries[0].customerId },
          ),
        summarize: (failed) => `ExpirePointsJob failed for ${failed.length} customer group(s)`,
      },
    );
    await this.sweepState.advanceTo(now);

    return {
      processedEntries: outcomes.reduce((sum, o) => sum + o.entriesProcessed, 0),
      affectedCustomers: outcomes.filter((o) => o.entriesProcessed > 0).length,
      totalPointsExpired: outcomes.reduce((sum, o) => sum + o.pointsExpired, 0),
    };
  }

  private groupByCustomer(entries: LoyaltyEntry[]): Map<string, LoyaltyEntry[]> {
    const groups = new Map<string, LoyaltyEntry[]>();
    for (const entry of entries) {
      const key = `${entry.tenantId}:${entry.customerId}`;
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }
    return groups;
  }

  /** Expires one customer's due points and reports what it actually did. */
  private async processGroup(entries: LoyaltyEntry[]): Promise<GroupOutcome> {
    const { tenantId, customerId } = entries[0];

    return this.txManager.run(async () => {
      // The balance row is locked first (docs/LOCK_CATALOG.md H7). What was decided before the
      // lock (which entries are due and unprocessed) is re-checked after it: an overlapping run
      // may have expired the same entries while this one waited, and the marks never conflict.
      const balance = await this.balanceRepo.findByCustomerForUpdate(tenantId, customerId);
      const alreadyProcessed = await this.expiryLogRepo.findProcessedEntryIds(
        entries.map((entry) => entry.id),
      );
      const due = entries.filter((entry) => !alreadyProcessed.has(entry.id));
      if (due.length === 0) return { entriesProcessed: 0, pointsExpired: 0 };

      const expiredPoints = due.reduce((sum, e) => sum + e.points, 0);
      const pointsToDecrement = balance ? Math.min(expiredPoints, balance.currentPoints) : 0;

      if (balance && pointsToDecrement > 0) {
        balance.decrement(pointsToDecrement);
        await this.balanceRepo.upsert(balance);
      }
      await this.expiryLogRepo.markProcessedMany(due.map((entry) => entry.id));
      return { entriesProcessed: due.length, pointsExpired: pointsToDecrement };
    });
  }
}

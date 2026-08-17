import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { LoyaltyEntry } from '../../domain/loyalty-entry.aggregate';
import {
  BALANCE_EXPIRY_LOG_REPOSITORY,
  IBalanceExpiryLogRepository,
} from '../ports/balance-expiry-log-repository.port';
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

@Injectable()
export class ExpirePointsJob {
  constructor(
    @Inject(LOYALTY_ENTRY_REPOSITORY) private readonly entryRepo: ILoyaltyEntryRepository,
    @Inject(LOYALTY_BALANCE_REPOSITORY) private readonly balanceRepo: ILoyaltyBalanceRepository,
    @Inject(BALANCE_EXPIRY_LOG_REPOSITORY)
    private readonly expiryLogRepo: IBalanceExpiryLogRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async run(now: Date = new Date()): Promise<ExpirePointsJobResult> {
    const unprocessed = await this.findUnprocessedExpired(now);
    if (unprocessed.length === 0) {
      return { processedEntries: 0, affectedCustomers: 0, totalPointsExpired: 0 };
    }

    const groups = this.groupByCustomer(unprocessed);
    let affectedCustomers = 0;
    let totalPointsExpired = 0;

    for (const entries of groups.values()) {
      totalPointsExpired += await this.processGroup(entries);
      affectedCustomers++;
    }

    return { processedEntries: unprocessed.length, affectedCustomers, totalPointsExpired };
  }

  private async findUnprocessedExpired(now: Date): Promise<LoyaltyEntry[]> {
    const expired = await this.entryRepo.findExpiringBefore(now);
    const unprocessed: LoyaltyEntry[] = [];
    for (const entry of expired) {
      if (await this.expiryLogRepo.hasBeenProcessed(entry.id)) continue;
      // Entry could have been deleted after findExpiringBefore read it (e.g. data
      // erasure race) — skip it rather than failing the whole batch on a FK violation.
      if (!(await this.entryRepo.existsById(entry.id))) continue;
      unprocessed.push(entry);
    }
    return unprocessed;
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

  /** Expires one customer's due points, returning the amount actually decremented. */
  private async processGroup(entries: LoyaltyEntry[]): Promise<number> {
    const { tenantId, customerId } = entries[0];
    const expiredPoints = entries.reduce((sum, e) => sum + e.points, 0);

    const balance = await this.balanceRepo.findByCustomer(tenantId, customerId);
    const pointsToDecrement = balance ? Math.min(expiredPoints, balance.currentPoints) : 0;

    if (balance && pointsToDecrement > 0) {
      balance.decrement(pointsToDecrement);
    }

    await this.txManager.run(async () => {
      if (balance && pointsToDecrement > 0) {
        await this.balanceRepo.upsert(balance);
      }
      for (const entry of entries) {
        await this.expiryLogRepo.markProcessed(entry.id);
      }
    });

    return pointsToDecrement;
  }
}

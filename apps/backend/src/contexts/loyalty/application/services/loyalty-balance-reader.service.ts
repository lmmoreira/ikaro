import { Inject, Injectable } from '@nestjs/common';
import {
  ILoyaltyBalanceRepository,
  LOYALTY_BALANCE_REPOSITORY,
} from '../ports/loyalty-balance-repository.port';
import { EntryEffectiveExpiryService } from './entry-effective-expiry.service';
import {
  ILoyaltyEntryRepository,
  LOYALTY_ENTRY_REPOSITORY,
} from '../ports/loyalty-entry-repository.port';

export interface LoyaltyBalanceResult {
  currentPoints: number;
  nextExpiryDate: string | null;
  nextExpiryPoints: number | null;
}

@Injectable()
export class LoyaltyBalanceReaderService {
  constructor(
    @Inject(LOYALTY_BALANCE_REPOSITORY) private readonly balanceRepo: ILoyaltyBalanceRepository,
    @Inject(LOYALTY_ENTRY_REPOSITORY) private readonly entryRepo: ILoyaltyEntryRepository,
    private readonly effectiveExpiry: EntryEffectiveExpiryService,
  ) {}

  async read(tenantId: string, customerId: string): Promise<LoyaltyBalanceResult> {
    const [balance, nextExpiry] = await Promise.all([
      this.balanceRepo.findByCustomer(tenantId, customerId),
      this.findNextExpiry(tenantId, customerId),
    ]);

    return {
      currentPoints: balance?.currentPoints ?? 0,
      nextExpiryDate: nextExpiry ? nextExpiry.expiryDate.toISOString() : null,
      nextExpiryPoints: nextExpiry ? nextExpiry.points : null,
    };
  }

  /** The earliest effective expiry still ahead (a held entry has none yet) and the points on it. */
  private async findNextExpiry(
    tenantId: string,
    customerId: string,
  ): Promise<{ expiryDate: Date; points: number } | null> {
    const entries = await this.entryRepo.findUnprocessedByCustomer(tenantId, customerId);
    const effective = await this.effectiveExpiry.resolve(entries);
    const now = new Date();

    const pointsByExpiry = new Map<number, number>();
    for (const entry of entries) {
      const expiresAt = effective.get(entry.id);
      if (expiresAt == null || expiresAt <= now) continue;
      const key = expiresAt.getTime();
      pointsByExpiry.set(key, (pointsByExpiry.get(key) ?? 0) + entry.points);
    }
    if (pointsByExpiry.size === 0) return null;

    const next = Math.min(...pointsByExpiry.keys());
    return { expiryDate: new Date(next), points: pointsByExpiry.get(next) as number };
  }
}

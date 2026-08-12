import { Inject, Injectable } from '@nestjs/common';
import {
  ILoyaltyBalanceRepository,
  LOYALTY_BALANCE_REPOSITORY,
} from '../ports/loyalty-balance-repository.port';
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
  ) {}

  async read(tenantId: string, customerId: string): Promise<LoyaltyBalanceResult> {
    const [balance, nextExpiry] = await Promise.all([
      this.balanceRepo.findByCustomer(tenantId, customerId),
      this.entryRepo.findNextExpiry(tenantId, customerId),
    ]);

    return {
      currentPoints: balance?.currentPoints ?? 0,
      nextExpiryDate: nextExpiry ? nextExpiry.expiryDate.toISOString() : null,
      nextExpiryPoints: nextExpiry ? nextExpiry.points : null,
    };
  }
}

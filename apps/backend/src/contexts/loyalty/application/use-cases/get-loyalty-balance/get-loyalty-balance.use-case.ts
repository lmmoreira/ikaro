import { Inject, Injectable } from '@nestjs/common';
import {
  ILoyaltyBalanceRepository,
  LOYALTY_BALANCE_REPOSITORY,
} from '../../ports/loyalty-balance-repository.port';
import {
  ILoyaltyEntryRepository,
  LOYALTY_ENTRY_REPOSITORY,
} from '../../ports/loyalty-entry-repository.port';

export interface GetLoyaltyBalanceUseCaseInput {
  tenantId: string;
  customerId: string;
}

export interface GetLoyaltyBalanceUseCaseResult {
  currentPoints: number;
  nextExpiryDate: string | null;
  nextExpiryPoints: number | null;
}

@Injectable()
export class GetLoyaltyBalanceUseCase {
  constructor(
    @Inject(LOYALTY_BALANCE_REPOSITORY) private readonly balanceRepo: ILoyaltyBalanceRepository,
    @Inject(LOYALTY_ENTRY_REPOSITORY) private readonly entryRepo: ILoyaltyEntryRepository,
  ) {}

  async execute(dto: GetLoyaltyBalanceUseCaseInput): Promise<GetLoyaltyBalanceUseCaseResult> {
    const [balance, nextExpiry] = await Promise.all([
      this.balanceRepo.findByCustomer(dto.tenantId, dto.customerId),
      this.entryRepo.findNextExpiry(dto.tenantId, dto.customerId),
    ]);

    return {
      currentPoints: balance?.currentPoints ?? 0,
      nextExpiryDate: nextExpiry ? nextExpiry.expiryDate.toISOString() : null,
      nextExpiryPoints: nextExpiry ? nextExpiry.points : null,
    };
  }
}

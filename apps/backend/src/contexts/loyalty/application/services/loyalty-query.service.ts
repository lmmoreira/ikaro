import { Inject, Injectable } from '@nestjs/common';
import {
  ILoyaltyBalanceRepository,
  LOYALTY_BALANCE_REPOSITORY,
} from '../ports/loyalty-balance-repository.port';

@Injectable()
export class LoyaltyQueryService {
  constructor(
    @Inject(LOYALTY_BALANCE_REPOSITORY) private readonly balanceRepo: ILoyaltyBalanceRepository,
  ) {}

  async getCurrentPoints(tenantId: string, customerId: string): Promise<number> {
    const balance = await this.balanceRepo.findByCustomer(tenantId, customerId);
    return balance?.currentPoints ?? 0;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  ILoyaltyBalanceRepository,
  LOYALTY_BALANCE_REPOSITORY,
} from '../../ports/loyalty-balance-repository.port';

export interface GetLoyaltyBalancesUseCaseInput {
  tenantId: string;
  customerIds: string[];
}

export interface LoyaltyBalanceItemResult {
  customerId: string;
  currentPoints: number;
}

export interface GetLoyaltyBalancesUseCaseResult {
  items: LoyaltyBalanceItemResult[];
}

@Injectable()
export class GetLoyaltyBalancesUseCase {
  constructor(
    @Inject(LOYALTY_BALANCE_REPOSITORY) private readonly balanceRepo: ILoyaltyBalanceRepository,
  ) {}

  async execute(dto: GetLoyaltyBalancesUseCaseInput): Promise<GetLoyaltyBalancesUseCaseResult> {
    const balances = await this.balanceRepo.findManyByCustomers(dto.tenantId, dto.customerIds);
    const pointsByCustomer = new Map(balances.map((b) => [b.customerId, b.currentPoints]));

    return {
      items: dto.customerIds.map((customerId) => ({
        customerId,
        currentPoints: pointsByCustomer.get(customerId) ?? 0,
      })),
    };
  }
}

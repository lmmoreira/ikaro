import { Inject, Injectable } from '@nestjs/common';
import {
  ILoyaltyBalanceRepository,
  LOYALTY_BALANCE_REPOSITORY,
} from '../../ports/loyalty-balance-repository.port';

export interface GetLoyaltyBalancesBatchUseCaseInput {
  tenantId: string;
  customerIds: string[];
}

export interface LoyaltyBalanceBatchItemResult {
  customerId: string;
  currentPoints: number;
}

export interface GetLoyaltyBalancesBatchUseCaseResult {
  items: LoyaltyBalanceBatchItemResult[];
}

@Injectable()
export class GetLoyaltyBalancesBatchUseCase {
  constructor(
    @Inject(LOYALTY_BALANCE_REPOSITORY) private readonly balanceRepo: ILoyaltyBalanceRepository,
  ) {}

  async execute(
    dto: GetLoyaltyBalancesBatchUseCaseInput,
  ): Promise<GetLoyaltyBalancesBatchUseCaseResult> {
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

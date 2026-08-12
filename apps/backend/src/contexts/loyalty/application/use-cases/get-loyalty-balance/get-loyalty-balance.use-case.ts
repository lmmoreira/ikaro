import { Injectable } from '@nestjs/common';
import {
  LoyaltyBalanceReaderService,
  type LoyaltyBalanceResult,
} from '../../services/loyalty-balance-reader.service';

export interface GetLoyaltyBalanceUseCaseInput {
  tenantId: string;
  customerId: string;
}

export type GetLoyaltyBalanceUseCaseResult = LoyaltyBalanceResult;

@Injectable()
export class GetLoyaltyBalanceUseCase {
  constructor(private readonly balanceReader: LoyaltyBalanceReaderService) {}

  async execute(dto: GetLoyaltyBalanceUseCaseInput): Promise<GetLoyaltyBalanceUseCaseResult> {
    return this.balanceReader.read(dto.tenantId, dto.customerId);
  }
}

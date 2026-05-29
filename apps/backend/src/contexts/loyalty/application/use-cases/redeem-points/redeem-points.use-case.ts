import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { LoyaltyRedemption } from '../../../domain/loyalty-redemption.aggregate';
import { LoyaltyBalanceNotFoundError } from '../../../domain/errors/loyalty-domain.error';
import {
  ILoyaltyBalanceRepository,
  LOYALTY_BALANCE_REPOSITORY,
} from '../../ports/loyalty-balance-repository.port';
import {
  ILoyaltyRedemptionRepository,
  LOYALTY_REDEMPTION_REPOSITORY,
} from '../../ports/loyalty-redemption-repository.port';

export interface RedeemPointsDto {
  tenantId: string;
  customerId: string;
  pointsToRedeem: number;
  redeemedBy: string;
  notes?: string | null;
  bookingId?: string | null;
}

export interface RedeemPointsUseCaseResult {
  redemptionId: string;
  customerId: string;
  pointsRedeemed: number;
  newBalance: number;
  redeemedAt: string;
}

@Injectable()
export class RedeemPointsUseCase {
  constructor(
    @Inject(LOYALTY_BALANCE_REPOSITORY) private readonly balanceRepo: ILoyaltyBalanceRepository,
    @Inject(LOYALTY_REDEMPTION_REPOSITORY)
    private readonly redemptionRepo: ILoyaltyRedemptionRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(dto: RedeemPointsDto): Promise<RedeemPointsUseCaseResult> {
    const balance = await this.balanceRepo.findByCustomer(dto.tenantId, dto.customerId);
    if (!balance) throw new LoyaltyBalanceNotFoundError();

    balance.decrement(dto.pointsToRedeem);

    const redemption = LoyaltyRedemption.record({
      tenantId: dto.tenantId,
      customerId: dto.customerId,
      pointsRedeemed: dto.pointsToRedeem,
      redeemedBy: dto.redeemedBy,
      notes: dto.notes,
      bookingId: dto.bookingId,
    });

    await this.txManager.run(async () => {
      await this.balanceRepo.upsert(balance);
      await this.redemptionRepo.save(redemption);
    });

    return {
      redemptionId: redemption.id,
      customerId: redemption.customerId,
      pointsRedeemed: redemption.pointsRedeemed,
      newBalance: balance.currentPoints,
      redeemedAt: redemption.redeemedAt.toISOString(),
    };
  }
}

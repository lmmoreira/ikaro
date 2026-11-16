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

export interface RedeemPointsUseCaseInput {
  tenantId: string;
  customerId: string;
  pointsToRedeem: number;
  pointsPerCurrencyUnit: number;
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

  async execute(input: RedeemPointsUseCaseInput): Promise<RedeemPointsUseCaseResult> {
    // The balance row is locked for the whole transaction (docs/LOCK_CATALOG.md H7), so the
    // balance read here is the committed value of every earlier writer, never a stale one.
    const { balance, redemption } = await this.txManager.run(async () => {
      const locked = await this.balanceRepo.findByCustomerForUpdate(
        input.tenantId,
        input.customerId,
      );
      if (!locked) throw new LoyaltyBalanceNotFoundError();

      locked.decrement(input.pointsToRedeem);

      const recorded = LoyaltyRedemption.record({
        tenantId: input.tenantId,
        customerId: input.customerId,
        pointsRedeemed: input.pointsToRedeem,
        pointsPerCurrencyUnit: input.pointsPerCurrencyUnit,
        redeemedBy: input.redeemedBy,
        notes: input.notes,
        bookingId: input.bookingId,
      });

      await this.balanceRepo.upsert(locked);
      await this.redemptionRepo.save(recorded);
      return { balance: locked, redemption: recorded };
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

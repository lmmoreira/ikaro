import { LoyaltyRedemption } from '../../domain/loyalty-redemption.aggregate';

export const LOYALTY_REDEMPTION_REPOSITORY = Symbol('LOYALTY_REDEMPTION_REPOSITORY');

export interface PaginatedRedemptions {
  items: LoyaltyRedemption[];
  total: number;
}

export interface ILoyaltyRedemptionRepository {
  save(redemption: LoyaltyRedemption): Promise<void>;
  findByCustomer(
    tenantId: string,
    customerId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedRedemptions>;
}

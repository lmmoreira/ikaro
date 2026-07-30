import { LoyaltyBalance } from '../../domain/loyalty-balance.aggregate';

export const LOYALTY_BALANCE_REPOSITORY = Symbol('LOYALTY_BALANCE_REPOSITORY');

export interface ILoyaltyBalanceRepository {
  findByCustomer(tenantId: string, customerId: string): Promise<LoyaltyBalance | null>;
  findManyByCustomers(tenantId: string, customerIds: string[]): Promise<LoyaltyBalance[]>;
  upsert(balance: LoyaltyBalance): Promise<void>;
}

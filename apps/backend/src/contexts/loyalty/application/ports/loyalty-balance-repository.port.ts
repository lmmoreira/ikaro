import { LoyaltyBalance } from '../../domain/loyalty-balance.aggregate';

export const LOYALTY_BALANCE_REPOSITORY = Symbol('LOYALTY_BALANCE_REPOSITORY');

export interface LoyaltyBalanceTenantCustomerPair {
  tenantId: string;
  customerId: string;
}

export interface ILoyaltyBalanceRepository {
  findByCustomer(tenantId: string, customerId: string): Promise<LoyaltyBalance | null>;
  findManyByCustomers(tenantId: string, customerIds: string[]): Promise<LoyaltyBalance[]>;
  // Cross-tenant batch read — the pairs are resolved server-side from the caller's own
  // identity (see GetOwnLoyaltyBalancesUseCase), never accepted verbatim from a client.
  findManyByTenantCustomerPairs(
    pairs: LoyaltyBalanceTenantCustomerPair[],
  ): Promise<LoyaltyBalance[]>;
  upsert(balance: LoyaltyBalance): Promise<void>;
}

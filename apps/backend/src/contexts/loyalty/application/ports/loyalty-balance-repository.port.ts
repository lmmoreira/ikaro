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
  // Row lock (SELECT ... FOR UPDATE) held until the active transaction ends — H7 in
  // docs/LOCK_CATALOG.md. Both methods must be called inside ITransactionManager.run() and
  // throw outside one. null: no balance row exists for the customer.
  findByCustomerForUpdate(tenantId: string, customerId: string): Promise<LoyaltyBalance | null>;
  // Same lock, for a writer that may create the first row: when none exists the row is inserted
  // (ON CONFLICT DO NOTHING) and then locked, so two concurrent first writers cannot both insert.
  // Returns a zero-point balance for a customer who had no row yet.
  findOrCreateByCustomerForUpdate(tenantId: string, customerId: string): Promise<LoyaltyBalance>;
  upsert(balance: LoyaltyBalance): Promise<void>;
}

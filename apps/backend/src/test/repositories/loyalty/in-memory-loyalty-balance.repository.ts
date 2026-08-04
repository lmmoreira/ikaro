import {
  ILoyaltyBalanceRepository,
  LoyaltyBalanceTenantCustomerPair,
} from '../../../contexts/loyalty/application/ports/loyalty-balance-repository.port';
import { LoyaltyBalance } from '../../../contexts/loyalty/domain/loyalty-balance.aggregate';

export class InMemoryLoyaltyBalanceRepository implements ILoyaltyBalanceRepository {
  private readonly store = new Map<string, LoyaltyBalance>();

  private key(tenantId: string, customerId: string): string {
    return `${tenantId}:${customerId}`;
  }

  async findByCustomer(tenantId: string, customerId: string): Promise<LoyaltyBalance | null> {
    return this.store.get(this.key(tenantId, customerId)) ?? null;
  }

  async findManyByCustomers(tenantId: string, customerIds: string[]): Promise<LoyaltyBalance[]> {
    const idSet = new Set(customerIds);
    return [...this.store.values()].filter(
      (balance) => balance.tenantId === tenantId && idSet.has(balance.customerId),
    );
  }

  async findManyByTenantCustomerPairs(
    pairs: LoyaltyBalanceTenantCustomerPair[],
  ): Promise<LoyaltyBalance[]> {
    const keys = new Set(pairs.map((pair) => this.key(pair.tenantId, pair.customerId)));
    return [...this.store.entries()].filter(([key]) => keys.has(key)).map(([, balance]) => balance);
  }

  async upsert(balance: LoyaltyBalance): Promise<void> {
    this.store.set(this.key(balance.tenantId, balance.customerId), balance);
  }

  clear(): void {
    this.store.clear();
  }
}

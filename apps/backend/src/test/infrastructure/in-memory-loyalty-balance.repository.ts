import { ILoyaltyBalanceRepository } from '../../contexts/loyalty/application/ports/loyalty-balance-repository.port';
import { LoyaltyBalance } from '../../contexts/loyalty/domain/loyalty-balance.aggregate';

export class InMemoryLoyaltyBalanceRepository implements ILoyaltyBalanceRepository {
  private readonly store = new Map<string, LoyaltyBalance>();

  private key(tenantId: string, customerId: string): string {
    return `${tenantId}:${customerId}`;
  }

  async findByCustomer(tenantId: string, customerId: string): Promise<LoyaltyBalance | null> {
    return this.store.get(this.key(tenantId, customerId)) ?? null;
  }

  async upsert(balance: LoyaltyBalance): Promise<void> {
    this.store.set(this.key(balance.tenantId, balance.customerId), balance);
  }

  clear(): void {
    this.store.clear();
  }
}

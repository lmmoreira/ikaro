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
    this.unlockedReadCount++;
    return this.store.get(this.key(tenantId, customerId)) ?? null;
  }

  // Test hooks that model the real adapter's lock contract without a database:
  // - requireTransaction(probe): the *ForUpdate reads throw when the probe says no transaction is
  //   open, like TypeOrmLoyaltyBalanceRepository.
  // - onLockAcquired(hook): runs when a lock is taken, standing in for "another writer committed
  //   while this one waited for the row lock".
  // - lockCallCount / unlockedReadCount: which read each writer used.
  lockCallCount = 0;
  unlockedReadCount = 0;
  private transactionProbe: (() => boolean) | null = null;
  private lockAcquiredHook: (() => Promise<void>) | null = null;

  requireTransaction(probe: () => boolean): void {
    this.transactionProbe = probe;
  }

  onLockAcquired(hook: () => Promise<void>): void {
    this.lockAcquiredHook = hook;
  }

  private async lock(): Promise<void> {
    if (this.transactionProbe && !this.transactionProbe()) {
      throw new Error('row lock must be taken inside an active transaction');
    }
    this.lockCallCount++;
    await this.lockAcquiredHook?.();
  }

  async findByCustomerForUpdate(
    tenantId: string,
    customerId: string,
  ): Promise<LoyaltyBalance | null> {
    await this.lock();
    return this.store.get(this.key(tenantId, customerId)) ?? null;
  }

  async findOrCreateByCustomerForUpdate(
    tenantId: string,
    customerId: string,
  ): Promise<LoyaltyBalance> {
    await this.lock();
    const existing = this.store.get(this.key(tenantId, customerId));
    if (existing) return existing;
    const created = LoyaltyBalance.create(tenantId, customerId);
    this.store.set(this.key(tenantId, customerId), created);
    return created;
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

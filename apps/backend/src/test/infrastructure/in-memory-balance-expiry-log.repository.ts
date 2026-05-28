import { IBalanceExpiryLogRepository } from '../../contexts/loyalty/application/ports/balance-expiry-log-repository.port';

export class InMemoryBalanceExpiryLogRepository implements IBalanceExpiryLogRepository {
  private readonly processed = new Set<string>();

  async hasBeenProcessed(entryId: string): Promise<boolean> {
    return this.processed.has(entryId);
  }

  async markProcessed(entryId: string): Promise<void> {
    this.processed.add(entryId);
  }

  clear(): void {
    this.processed.clear();
  }
}

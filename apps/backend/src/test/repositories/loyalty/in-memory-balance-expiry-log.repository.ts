import { IBalanceExpiryLogRepository } from '../../../contexts/loyalty/application/ports/balance-expiry-log-repository.port';

export class InMemoryBalanceExpiryLogRepository implements IBalanceExpiryLogRepository {
  private readonly processed = new Set<string>();

  /** Test-only synchronous probe: what `InMemoryLoyaltyEntryRepository.linkExpiryLog` and specs read. */
  isProcessed(entryId: string): boolean {
    return this.processed.has(entryId);
  }

  async findProcessedEntryIds(entryIds: string[]): Promise<Set<string>> {
    return new Set(entryIds.filter((id) => this.processed.has(id)));
  }

  async markProcessedMany(entryIds: string[]): Promise<void> {
    for (const id of entryIds) this.processed.add(id);
  }

  clear(): void {
    this.processed.clear();
  }
}

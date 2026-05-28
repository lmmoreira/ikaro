import { ILoyaltyEntryRepository } from '../../contexts/loyalty/application/ports/loyalty-entry-repository.port';
import { LoyaltyEntry } from '../../contexts/loyalty/domain/loyalty-entry.aggregate';

export class InMemoryLoyaltyEntryRepository implements ILoyaltyEntryRepository {
  readonly entries: LoyaltyEntry[] = [];

  async save(entry: LoyaltyEntry): Promise<void> {
    this.entries.push(entry);
  }

  async findExpiringBefore(date: Date): Promise<LoyaltyEntry[]> {
    return this.entries.filter((e) => e.expiresAt < date);
  }

  clear(): void {
    this.entries.length = 0;
  }
}

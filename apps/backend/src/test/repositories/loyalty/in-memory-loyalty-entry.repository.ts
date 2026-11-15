import {
  ILoyaltyEntryRepository,
  PaginatedLoyaltyEntries,
} from '../../../contexts/loyalty/application/ports/loyalty-entry-repository.port';
import { LoyaltyEntry } from '../../../contexts/loyalty/domain/loyalty-entry.aggregate';

export class InMemoryLoyaltyEntryRepository implements ILoyaltyEntryRepository {
  readonly entries: LoyaltyEntry[] = [];
  private readonly deletedIds = new Set<string>();
  /** Entries the expiry sweep already processed (the `balance_expiry_log` rows). */
  readonly processedIds = new Set<string>();

  async save(entry: LoyaltyEntry): Promise<void> {
    this.entries.push(entry);
  }

  async existsById(id: string): Promise<boolean> {
    return !this.deletedIds.has(id) && this.entries.some((e) => e.id === id);
  }

  /** Simulates an entry being deleted after the expiry candidate read already returned it. */
  markDeleted(id: string): void {
    this.deletedIds.add(id);
  }

  async findUnprocessedExpiringUntil(to: Date): Promise<LoyaltyEntry[]> {
    return this.entries.filter((e) => e.expiresAt <= to && !this.processedIds.has(e.id));
  }

  async findByCustomerPaginated(
    tenantId: string,
    customerId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedLoyaltyEntries> {
    const filtered = this.entries
      .filter((e) => e.tenantId === tenantId && e.customerId === customerId)
      .sort((a, b) => b.earnedAt.getTime() - a.earnedAt.getTime());
    const start = (page - 1) * limit;
    return { items: filtered.slice(start, start + limit), total: filtered.length };
  }

  async findUnprocessedByCustomer(tenantId: string, customerId: string): Promise<LoyaltyEntry[]> {
    return this.entries.filter(
      (e) => e.tenantId === tenantId && e.customerId === customerId && !this.processedIds.has(e.id),
    );
  }

  clear(): void {
    this.entries.length = 0;
    this.deletedIds.clear();
    this.processedIds.clear();
  }
}

import {
  ILoyaltyEntryRepository,
  NextExpiry,
  PaginatedLoyaltyEntries,
} from '../../contexts/loyalty/application/ports/loyalty-entry-repository.port';
import { LoyaltyEntry } from '../../contexts/loyalty/domain/loyalty-entry.aggregate';

export class InMemoryLoyaltyEntryRepository implements ILoyaltyEntryRepository {
  readonly entries: LoyaltyEntry[] = [];
  private readonly deletedIds = new Set<string>();

  async save(entry: LoyaltyEntry): Promise<void> {
    this.entries.push(entry);
  }

  async existsById(id: string): Promise<boolean> {
    return !this.deletedIds.has(id) && this.entries.some((e) => e.id === id);
  }

  /** Simulates an entry being deleted after `findExpiringBefore` already returned it. */
  markDeleted(id: string): void {
    this.deletedIds.add(id);
  }

  async findExpiringBefore(date: Date): Promise<LoyaltyEntry[]> {
    return this.entries.filter((e) => e.expiresAt < date);
  }

  async findExpiringSoon(from: Date, to: Date): Promise<LoyaltyEntry[]> {
    return this.entries.filter((e) => e.expiresAt >= from && e.expiresAt <= to);
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

  async findNextExpiry(tenantId: string, customerId: string): Promise<NextExpiry | null> {
    const now = new Date();
    const active = this.entries
      .filter((e) => e.tenantId === tenantId && e.customerId === customerId && e.expiresAt > now)
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());

    if (!active.length) return null;

    const minExpiry = active[0].expiresAt;
    const points = active
      .filter((e) => e.expiresAt.getTime() === minExpiry.getTime())
      .reduce((sum, e) => sum + e.points, 0);

    return { expiryDate: minExpiry, points };
  }

  clear(): void {
    this.entries.length = 0;
    this.deletedIds.clear();
  }
}

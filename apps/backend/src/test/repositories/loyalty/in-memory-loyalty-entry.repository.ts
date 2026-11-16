import {
  ILoyaltyEntryRepository,
  NextExpiry,
  PaginatedLoyaltyEntries,
} from '../../../contexts/loyalty/application/ports/loyalty-entry-repository.port';
import { LoyaltyEntry } from '../../../contexts/loyalty/domain/loyalty-entry.aggregate';

export class InMemoryLoyaltyEntryRepository implements ILoyaltyEntryRepository {
  readonly entries: LoyaltyEntry[] = [];
  /** Every `findUnprocessedDueBetween` call, so a spec can assert the bounds the sweep asked for. */
  readonly dueBetweenCalls: { from: Date | null; to: Date }[] = [];
  private expiryLog: { isProcessed(entryId: string): boolean } | null = null;

  async save(entry: LoyaltyEntry): Promise<void> {
    this.entries.push(entry);
  }

  /** Models the real read's NOT EXISTS against `balance_expiry_log`: without a link nothing is excluded. */
  linkExpiryLog(log: { isProcessed(entryId: string): boolean }): void {
    this.expiryLog = log;
  }

  async findUnprocessedDueBetween(from: Date | null, to: Date): Promise<LoyaltyEntry[]> {
    this.dueBetweenCalls.push({ from, to });
    return this.entries.filter(
      (e) =>
        e.expiresAt <= to &&
        (from === null || e.expiresAt > from) &&
        !this.expiryLog?.isProcessed(e.id),
    );
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
    this.dueBetweenCalls.length = 0;
  }
}

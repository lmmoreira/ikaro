import { LoyaltyEntry } from '../../domain/loyalty-entry.aggregate';

export const LOYALTY_ENTRY_REPOSITORY = Symbol('LOYALTY_ENTRY_REPOSITORY');

export interface PaginatedLoyaltyEntries {
  items: LoyaltyEntry[];
  total: number;
}

export interface ILoyaltyEntryRepository {
  save(entry: LoyaltyEntry): Promise<void>;
  existsById(id: string): Promise<boolean>;
  /** Entries whose stored `expires_at` is before `date`. Callers apply the tenant pauses (`effectiveExpiry`). */
  findExpiringBefore(date: Date): Promise<LoyaltyEntry[]>;
  /**
   * Cross-tenant: entries whose stored `expires_at` is before `to` and that the expiry sweep has
   * not processed yet. The expiry warning keeps those whose *effective* expiry falls in its window.
   */
  findUnprocessedExpiringBefore(to: Date): Promise<LoyaltyEntry[]>;
  findByCustomerPaginated(
    tenantId: string,
    customerId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedLoyaltyEntries>;
  /** A customer's entries the expiry sweep has not processed yet (the ones that may still count). */
  findUnprocessedByCustomer(tenantId: string, customerId: string): Promise<LoyaltyEntry[]>;
}

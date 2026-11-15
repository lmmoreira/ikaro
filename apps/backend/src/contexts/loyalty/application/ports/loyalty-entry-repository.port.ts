import { LoyaltyEntry } from '../../domain/loyalty-entry.aggregate';

export const LOYALTY_ENTRY_REPOSITORY = Symbol('LOYALTY_ENTRY_REPOSITORY');

export interface PaginatedLoyaltyEntries {
  items: LoyaltyEntry[];
  total: number;
}

export interface ILoyaltyEntryRepository {
  save(entry: LoyaltyEntry): Promise<void>;
  existsById(id: string): Promise<boolean>;
  /**
   * Cross-tenant (the daily expiry sweep and the weekly warning are unscoped system jobs): entries
   * whose stored `expires_at` is at or before `to` and that the expiry sweep has not processed yet. The
   * stored expiry is never later than the effective one, so callers apply the tenants' suspension
   * pauses (`effectiveExpiry`) to what this returns.
   */
  findUnprocessedExpiringUntil(to: Date): Promise<LoyaltyEntry[]>;
  findByCustomerPaginated(
    tenantId: string,
    customerId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedLoyaltyEntries>;
  /** A customer's entries the expiry sweep has not processed yet (the ones that may still count). */
  findUnprocessedByCustomer(tenantId: string, customerId: string): Promise<LoyaltyEntry[]>;
}

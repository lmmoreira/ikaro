import { LoyaltyEntry } from '../../domain/loyalty-entry.aggregate';

export const LOYALTY_ENTRY_REPOSITORY = Symbol('LOYALTY_ENTRY_REPOSITORY');

export interface PaginatedLoyaltyEntries {
  items: LoyaltyEntry[];
  total: number;
}

export interface NextExpiry {
  expiryDate: Date;
  points: number;
}

export interface ILoyaltyEntryRepository {
  save(entry: LoyaltyEntry): Promise<void>;
  // Entries due in (from, to] that the expiry sweep has not processed yet, across every tenant.
  // `from` is null when the sweep has no watermark (its first run): no lower bound.
  findUnprocessedDueBetween(from: Date | null, to: Date): Promise<LoyaltyEntry[]>;
  findExpiringSoon(from: Date, to: Date): Promise<LoyaltyEntry[]>;
  findByCustomerPaginated(
    tenantId: string,
    customerId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedLoyaltyEntries>;
  findNextExpiry(tenantId: string, customerId: string): Promise<NextExpiry | null>;
}

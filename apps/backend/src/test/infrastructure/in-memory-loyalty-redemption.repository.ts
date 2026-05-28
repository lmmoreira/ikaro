import {
  ILoyaltyRedemptionRepository,
  PaginatedRedemptions,
} from '../../contexts/loyalty/application/ports/loyalty-redemption-repository.port';
import { LoyaltyRedemption } from '../../contexts/loyalty/domain/loyalty-redemption.aggregate';

export class InMemoryLoyaltyRedemptionRepository implements ILoyaltyRedemptionRepository {
  readonly saved: LoyaltyRedemption[] = [];

  async save(redemption: LoyaltyRedemption): Promise<void> {
    this.saved.push(redemption);
  }

  async findByCustomer(
    tenantId: string,
    customerId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedRedemptions> {
    const filtered = this.saved.filter(
      (r) => r.tenantId === tenantId && r.customerId === customerId,
    );
    const start = (page - 1) * limit;
    return { items: filtered.slice(start, start + limit), total: filtered.length };
  }

  clear(): void {
    this.saved.length = 0;
  }
}

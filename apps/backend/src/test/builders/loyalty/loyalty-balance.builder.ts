import { LoyaltyBalance } from '../../../contexts/loyalty/domain/loyalty-balance.aggregate';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class LoyaltyBalanceBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private customerId = uuidv7();
  private currentPoints = 0;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCustomerId(customerId: string): this {
    this.customerId = customerId;
    return this;
  }

  withCurrentPoints(currentPoints: number): this {
    this.currentPoints = currentPoints;
    return this;
  }

  build(): LoyaltyBalance {
    return LoyaltyBalance.reconstitute({
      tenantId: this.tenantId,
      customerId: this.customerId,
      currentPoints: this.currentPoints,
    });
  }
}

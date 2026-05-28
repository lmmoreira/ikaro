import { LoyaltyBalanceEntity } from '../../../contexts/loyalty/infrastructure/entities/loyalty-balance.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class LoyaltyBalanceEntityBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private customerId = uuidv7();
  private currentPoints = 0;
  private readonly updatedAt = new Date();

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

  build(): LoyaltyBalanceEntity {
    const entity = new LoyaltyBalanceEntity();
    entity.tenantId = this.tenantId;
    entity.customerId = this.customerId;
    entity.currentPoints = this.currentPoints;
    entity.updatedAt = this.updatedAt;
    return entity;
  }
}

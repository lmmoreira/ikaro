import { LoyaltyRedemptionEntity } from '../../../contexts/loyalty/infrastructure/entities/loyalty-redemption.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class LoyaltyRedemptionEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private customerId = uuidv7();
  private pointsRedeemed = 10;
  private readonly redeemedBy = uuidv7();
  private notes: string | null = null;
  private readonly bookingId: string | null = null;
  private readonly redeemedAt = new Date();

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCustomerId(customerId: string): this {
    this.customerId = customerId;
    return this;
  }

  withPointsRedeemed(points: number): this {
    this.pointsRedeemed = points;
    return this;
  }

  withNotes(notes: string): this {
    this.notes = notes;
    return this;
  }

  build(): LoyaltyRedemptionEntity {
    const entity = new LoyaltyRedemptionEntity();
    entity.id = this.id;
    entity.tenantId = this.tenantId;
    entity.customerId = this.customerId;
    entity.pointsRedeemed = this.pointsRedeemed;
    entity.redeemedBy = this.redeemedBy;
    entity.notes = this.notes;
    entity.bookingId = this.bookingId;
    entity.redeemedAt = this.redeemedAt;
    return entity;
  }
}

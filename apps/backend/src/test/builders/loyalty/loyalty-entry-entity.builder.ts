import { LoyaltyEntryEntity } from '../../../contexts/loyalty/infrastructure/entities/loyalty-entry.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class LoyaltyEntryEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private customerId = uuidv7();
  private readonly bookingId = uuidv7();
  private bookingLineId = uuidv7();
  private readonly serviceId = uuidv7();
  private points = 10;
  private readonly earnedAt = new Date();
  private expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

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

  withBookingLineId(bookingLineId: string): this {
    this.bookingLineId = bookingLineId;
    return this;
  }

  withPoints(points: number): this {
    this.points = points;
    return this;
  }

  withExpiresAt(expiresAt: Date): this {
    this.expiresAt = expiresAt;
    return this;
  }

  build(): LoyaltyEntryEntity {
    const entity = new LoyaltyEntryEntity();
    entity.id = this.id;
    entity.tenantId = this.tenantId;
    entity.customerId = this.customerId;
    entity.bookingId = this.bookingId;
    entity.bookingLineId = this.bookingLineId;
    entity.serviceId = this.serviceId;
    entity.points = this.points;
    entity.earnedAt = this.earnedAt;
    entity.expiresAt = this.expiresAt;
    return entity;
  }
}

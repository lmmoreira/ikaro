import { LoyaltyEntry } from '../../../contexts/loyalty/domain/loyalty-entry.aggregate';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class LoyaltyEntryBuilder {
  private readonly id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private customerId = uuidv7();
  private bookingId = uuidv7();
  private bookingLineId = uuidv7();
  private serviceId = uuidv7();
  private points = 10;
  private earnedAt = new Date();
  private expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCustomerId(customerId: string): this {
    this.customerId = customerId;
    return this;
  }

  withBookingId(bookingId: string): this {
    this.bookingId = bookingId;
    return this;
  }

  withBookingLineId(bookingLineId: string): this {
    this.bookingLineId = bookingLineId;
    return this;
  }

  withServiceId(serviceId: string): this {
    this.serviceId = serviceId;
    return this;
  }

  withPoints(points: number): this {
    this.points = points;
    return this;
  }

  withEarnedAt(earnedAt: Date): this {
    this.earnedAt = earnedAt;
    return this;
  }

  withExpiresAt(expiresAt: Date): this {
    this.expiresAt = expiresAt;
    return this;
  }

  build(): LoyaltyEntry {
    return LoyaltyEntry.reconstitute({
      id: this.id,
      tenantId: this.tenantId,
      customerId: this.customerId,
      bookingId: this.bookingId,
      bookingLineId: this.bookingLineId,
      serviceId: this.serviceId,
      points: this.points,
      earnedAt: this.earnedAt,
      expiresAt: this.expiresAt,
    });
  }
}

import { LoyaltyRedemption } from '../../../contexts/loyalty/domain/loyalty-redemption.aggregate';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class LoyaltyRedemptionBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private customerId = uuidv7();
  private pointsRedeemed = 10;
  private pointsPerCurrencyUnit = 0;
  private redeemedBy = uuidv7();
  private notes: string | null = null;
  private bookingId: string | null = null;

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

  withPointsPerCurrencyUnit(rate: number): this {
    this.pointsPerCurrencyUnit = rate;
    return this;
  }

  withRedeemedBy(staffId: string): this {
    this.redeemedBy = staffId;
    return this;
  }

  withNotes(notes: string): this {
    this.notes = notes;
    return this;
  }

  withBookingId(bookingId: string): this {
    this.bookingId = bookingId;
    return this;
  }

  build(): LoyaltyRedemption {
    return LoyaltyRedemption.record({
      tenantId: this.tenantId,
      customerId: this.customerId,
      pointsRedeemed: this.pointsRedeemed,
      pointsPerCurrencyUnit: this.pointsPerCurrencyUnit,
      redeemedBy: this.redeemedBy,
      notes: this.notes,
      bookingId: this.bookingId,
    });
  }
}

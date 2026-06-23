import { LoyaltyRedemption, RecordLoyaltyRedemptionParams } from './loyalty-redemption.aggregate';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000002';
const STAFF_ID = '00000000-0000-7000-8000-000000000003';
const BOOKING_ID = '00000000-0000-7000-8000-000000000004';

function baseParams(
  overrides: Partial<RecordLoyaltyRedemptionParams> = {},
): RecordLoyaltyRedemptionParams {
  return {
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
    pointsRedeemed: 30,
    pointsPerCurrencyUnit: 0,
    redeemedBy: STAFF_ID,
    ...overrides,
  };
}

describe('LoyaltyRedemption', () => {
  describe('record()', () => {
    it('creates a redemption with correct properties', () => {
      const before = new Date();
      const redemption = LoyaltyRedemption.record(baseParams());
      const after = new Date();

      expect(redemption.id).toBeDefined();
      expect(redemption.tenantId).toBe(TENANT_ID);
      expect(redemption.customerId).toBe(CUSTOMER_ID);
      expect(redemption.pointsRedeemed).toBe(30);
      expect(redemption.pointsPerCurrencyUnit).toBe(0);
      expect(redemption.redeemedBy).toBe(STAFF_ID);
      expect(redemption.notes).toBeNull();
      expect(redemption.bookingId).toBeNull();
      expect(redemption.redeemedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(redemption.redeemedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('stores the points-per-currency-unit rate in effect at redemption time', () => {
      const redemption = LoyaltyRedemption.record(baseParams({ pointsPerCurrencyUnit: 10 }));
      expect(redemption.pointsPerCurrencyUnit).toBe(10);
    });

    it('stores notes when provided', () => {
      const redemption = LoyaltyRedemption.record(baseParams({ notes: 'Free basic wash' }));
      expect(redemption.notes).toBe('Free basic wash');
    });

    it('stores bookingId when provided', () => {
      const redemption = LoyaltyRedemption.record(baseParams({ bookingId: BOOKING_ID }));
      expect(redemption.bookingId).toBe(BOOKING_ID);
    });

    it('emits no domain events', () => {
      const redemption = LoyaltyRedemption.record(baseParams());
      expect(redemption.clearDomainEvents()).toHaveLength(0);
    });
  });

  describe('reconstitute()', () => {
    it('restores all fields without events', () => {
      const redeemedAt = new Date('2026-01-01T12:00:00Z');
      const redemption = LoyaltyRedemption.reconstitute({
        id: '00000000-0000-7000-8000-000000000099',
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        pointsRedeemed: 50,
        pointsPerCurrencyUnit: 10,
        redeemedBy: STAFF_ID,
        notes: 'VIP discount',
        bookingId: BOOKING_ID,
        redeemedAt,
      });

      expect(redemption.id).toBe('00000000-0000-7000-8000-000000000099');
      expect(redemption.pointsRedeemed).toBe(50);
      expect(redemption.pointsPerCurrencyUnit).toBe(10);
      expect(redemption.notes).toBe('VIP discount');
      expect(redemption.bookingId).toBe(BOOKING_ID);
      expect(redemption.redeemedAt).toBe(redeemedAt);
      expect(redemption.clearDomainEvents()).toHaveLength(0);
    });
  });
});

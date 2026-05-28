import { LoyaltyEntryBuilder } from '../../../test/builders/loyalty/index';
import { LoyaltyDomainError, LoyaltyInvalidPointsError } from './errors/loyalty-domain.error';
import { ServicePointsEarned } from './events/service-points-earned.event';
import { LoyaltyEntry, RecordLoyaltyEntryParams } from './loyalty-entry.aggregate';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000002';
const BOOKING_ID = '00000000-0000-7000-8000-000000000003';
const BOOKING_LINE_ID = '00000000-0000-7000-8000-000000000004';
const SERVICE_ID = '00000000-0000-7000-8000-000000000005';
const CORRELATION_ID = '00000000-0000-7000-8000-000000000006';
const EXPIRY_DAYS = 180;

function baseParams(overrides: Partial<RecordLoyaltyEntryParams> = {}): RecordLoyaltyEntryParams {
  return {
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
    bookingId: BOOKING_ID,
    bookingLineId: BOOKING_LINE_ID,
    serviceId: SERVICE_ID,
    points: 10,
    expiryDays: EXPIRY_DAYS,
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

describe('LoyaltyEntry', () => {
  describe('record()', () => {
    it('creates an entry with correct properties', () => {
      const before = new Date();
      const entry = LoyaltyEntry.record(baseParams());
      const after = new Date();

      expect(entry.id).toBeDefined();
      expect(entry.tenantId).toBe(TENANT_ID);
      expect(entry.customerId).toBe(CUSTOMER_ID);
      expect(entry.bookingId).toBe(BOOKING_ID);
      expect(entry.bookingLineId).toBe(BOOKING_LINE_ID);
      expect(entry.serviceId).toBe(SERVICE_ID);
      expect(entry.points).toBe(10);
      expect(entry.earnedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entry.earnedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('sets expiresAt to earnedAt + expiryDays', () => {
      const entry = LoyaltyEntry.record(baseParams({ points: 5, expiryDays: 180 }));
      const diffMs = entry.expiresAt.getTime() - entry.earnedAt.getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(180);
    });

    it('emits one ServicePointsEarned domain event', () => {
      const entry = LoyaltyEntry.record(baseParams({ points: 7 }));
      const events = entry.clearDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ServicePointsEarned);
    });

    it('domain event carries correct payload', () => {
      const entry = LoyaltyEntry.record(baseParams({ points: 7 }));
      const event = entry.clearDomainEvents()[0] as ServicePointsEarned;
      expect(event.tenantId).toBe(TENANT_ID);
      expect(event.correlationId).toBe(CORRELATION_ID);
      expect(event.data.entryId).toBe(entry.id);
      expect(event.data.customerId).toBe(CUSTOMER_ID);
      expect(event.data.pointsEarned).toBe(7);
      expect(event.data.earnedAt).toBe(entry.earnedAt.toISOString());
    });

    it('throws LoyaltyInvalidPointsError when points = 0', () => {
      expect(() => LoyaltyEntry.record(baseParams({ points: 0 }))).toThrow(
        LoyaltyInvalidPointsError,
      );
    });

    it('throws LoyaltyDomainError when points < 0', () => {
      expect(() => LoyaltyEntry.record(baseParams({ points: -1 }))).toThrow(LoyaltyDomainError);
    });
  });

  describe('reconstitute()', () => {
    it('reconstructs aggregate without validation and without events', () => {
      const entry = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withPoints(5)
        .build();

      expect(entry.tenantId).toBe(TENANT_ID);
      expect(entry.customerId).toBe(CUSTOMER_ID);
      expect(entry.points).toBe(5);
      expect(entry.clearDomainEvents()).toHaveLength(0);
    });
  });
});

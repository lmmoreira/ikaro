import {
  LoyaltyDomainError,
  LoyaltyInsufficientPointsError,
  LoyaltyInvalidPointsError,
} from './errors/loyalty-domain.error';
import { LoyaltyBalance } from './loyalty-balance.aggregate';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000002';

describe('LoyaltyBalance', () => {
  describe('create()', () => {
    it('starts at zero points', () => {
      const balance = LoyaltyBalance.create(TENANT_ID, CUSTOMER_ID);
      expect(balance.currentPoints).toBe(0);
      expect(balance.tenantId).toBe(TENANT_ID);
      expect(balance.customerId).toBe(CUSTOMER_ID);
    });
  });

  describe('increment()', () => {
    it('adds points to the balance', () => {
      const balance = LoyaltyBalance.create(TENANT_ID, CUSTOMER_ID);
      balance.increment(10);
      expect(balance.currentPoints).toBe(10);
    });

    it('accumulates across multiple increments', () => {
      const balance = LoyaltyBalance.create(TENANT_ID, CUSTOMER_ID);
      balance.increment(10);
      balance.increment(20);
      expect(balance.currentPoints).toBe(30);
    });

    it('throws LoyaltyInvalidPointsError when points = 0', () => {
      const balance = LoyaltyBalance.create(TENANT_ID, CUSTOMER_ID);
      expect(() => balance.increment(0)).toThrow(LoyaltyInvalidPointsError);
    });

    it('throws LoyaltyDomainError when points < 0', () => {
      const balance = LoyaltyBalance.create(TENANT_ID, CUSTOMER_ID);
      expect(() => balance.increment(-5)).toThrow(LoyaltyDomainError);
    });
  });

  describe('decrement()', () => {
    it('subtracts points from the balance', () => {
      const balance = LoyaltyBalance.reconstitute({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        currentPoints: 50,
      });
      balance.decrement(20);
      expect(balance.currentPoints).toBe(30);
    });

    it('allows decrementing to exactly zero', () => {
      const balance = LoyaltyBalance.reconstitute({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        currentPoints: 10,
      });
      balance.decrement(10);
      expect(balance.currentPoints).toBe(0);
    });

    it('throws LoyaltyInsufficientPointsError when points > currentPoints', () => {
      const balance = LoyaltyBalance.reconstitute({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        currentPoints: 10,
      });
      expect(() => balance.decrement(11)).toThrow(LoyaltyInsufficientPointsError);
    });

    it('throws LoyaltyInsufficientPointsError when balance is zero', () => {
      const balance = LoyaltyBalance.create(TENANT_ID, CUSTOMER_ID);
      expect(() => balance.decrement(1)).toThrow(LoyaltyInsufficientPointsError);
    });

    it('throws LoyaltyInvalidPointsError when points = 0', () => {
      const balance = LoyaltyBalance.reconstitute({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        currentPoints: 10,
      });
      expect(() => balance.decrement(0)).toThrow(LoyaltyInvalidPointsError);
    });

    it('accumulates correctly across two redemptions', () => {
      const balance = LoyaltyBalance.reconstitute({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        currentPoints: 50,
      });
      balance.decrement(20);
      balance.decrement(15);
      expect(balance.currentPoints).toBe(15);
    });
  });

  describe('reconstitute()', () => {
    it('restores balance without events', () => {
      const balance = LoyaltyBalance.reconstitute({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        currentPoints: 100,
      });
      expect(balance.currentPoints).toBe(100);
      expect(balance.clearDomainEvents()).toHaveLength(0);
    });
  });
});

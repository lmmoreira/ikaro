import { describe, expect, it } from 'vitest';
import { hotsiteServiceBookingDefaults, makeHotsiteService } from '@/test-utils';
import { isPerTimeService, perTimeFromAmount, summarizeSelection } from './selection-totals';

const perTime = makeHotsiteService({
  id: 'per-time',
  price: { amount: 90, currency: 'USD', formatted: '$90.00' },
  bookingPolicy: {
    ...hotsiteServiceBookingDefaults.bookingPolicy,
    durationPolicy: 'CUSTOMER_SELECTED',
    durationMinMinutes: 60,
    durationMaxMinutes: 480,
    durationIncrementMinutes: 60,
    pricingPolicy: 'PER_TIME_INCREMENT',
    pricingIncrementMinutes: 60,
    pricePerIncrementAmount: 50,
    minimumChargeAmount: null,
  },
});
const fixed = makeHotsiteService({ id: 'fixed' });

describe('selection totals', () => {
  it('detects a per-time service', () => {
    expect(isPerTimeService(perTime)).toBe(true);
    expect(isPerTimeService(fixed)).toBe(false);
  });

  it('floors a per-time service at its minimum charge, else one increment', () => {
    expect(perTimeFromAmount(perTime)).toBe(50);
    const withMinimum = makeHotsiteService({
      bookingPolicy: { ...perTime.bookingPolicy, minimumChargeAmount: 70 },
    });
    expect(perTimeFromAmount(withMinimum)).toBe(70);
  });

  it('sums fixed services exactly and marks no floor', () => {
    expect(summarizeSelection([fixed, fixed])).toEqual({
      amount: 300,
      durationMinutes: 120,
      isFloor: false,
    });
  });

  it('mixes a fixed service with a per-time floor and leaves the unchosen duration out', () => {
    expect(summarizeSelection([fixed, perTime])).toEqual({
      amount: 200,
      durationMinutes: 60,
      isFloor: true,
    });
  });
});

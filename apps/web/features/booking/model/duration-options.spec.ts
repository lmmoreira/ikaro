import { describe, expect, it } from 'vitest';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { makeHotsiteService } from '@/test-utils';
import {
  durationOptions,
  findVariableDurationService,
  isCustomerSelectedDuration,
} from './duration-options';

function variable(
  policy: Partial<HotsiteServiceResponse['bookingPolicy']> = {},
): HotsiteServiceResponse {
  return makeHotsiteService({
    bookingPolicy: {
      ...makeHotsiteService().bookingPolicy,
      durationPolicy: 'CUSTOMER_SELECTED',
      durationMinMinutes: 60,
      durationMaxMinutes: 180,
      durationIncrementMinutes: 30,
      ...policy,
    },
  });
}

describe('isCustomerSelectedDuration / findVariableDurationService', () => {
  it('is true only for a CUSTOMER_SELECTED service', () => {
    expect(isCustomerSelectedDuration(variable())).toBe(true);
    expect(isCustomerSelectedDuration(makeHotsiteService())).toBe(false);
  });

  it('finds the basket duration service, or null', () => {
    const duration = variable();

    expect(findVariableDurationService([makeHotsiteService(), duration])).toBe(duration);
    expect(findVariableDurationService([makeHotsiteService()])).toBeNull();
  });
});

describe('durationOptions', () => {
  it('lists min..max in steps of the increment', () => {
    expect(durationOptions(variable())).toEqual([60, 90, 120, 150, 180]);
  });

  it('includes a max that is not a multiple of the step only when reached exactly', () => {
    expect(durationOptions(variable({ durationMaxMinutes: 100 }))).toEqual([60, 90]);
  });

  it('is empty for an incomplete or inverted policy', () => {
    expect(durationOptions(variable({ durationMinMinutes: null }))).toEqual([]);
    expect(durationOptions(variable({ durationIncrementMinutes: 0 }))).toEqual([]);
    expect(durationOptions(variable({ durationMaxMinutes: 30 }))).toEqual([]);
  });
});

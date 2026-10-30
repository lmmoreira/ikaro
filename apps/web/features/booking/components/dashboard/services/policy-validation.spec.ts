import { describe, expect, it } from 'vitest';
import type { ServiceBookingPolicyItem } from '@ikaro/types';
import { validateBookingPolicy, type PolicyValidationMessages } from './policy-validation';

const MESSAGES: PolicyValidationMessages = {
  durationMinRequired: 'min required',
  durationMaxRequired: 'max required',
  durationIncrementRequired: 'increment required',
  durationRangeInvalid: 'range invalid',
  pricingIncrementRequired: 'pricing increment required',
  pricePerIncrementRequired: 'price per increment required',
};

const FIXED_POLICY = {
  durationPolicy: 'FIXED',
  durationMinMinutes: null,
  durationMaxMinutes: null,
  durationIncrementMinutes: null,
  pricingPolicy: 'FIXED',
  pricingIncrementMinutes: null,
  pricePerIncrementAmount: null,
} as ServiceBookingPolicyItem;

function policy(overrides: Partial<ServiceBookingPolicyItem>): ServiceBookingPolicyItem {
  return { ...FIXED_POLICY, ...overrides };
}

describe('validateBookingPolicy', () => {
  it('reports every empty duration field together under CUSTOMER_SELECTED', () => {
    expect(
      validateBookingPolicy(policy({ durationPolicy: 'CUSTOMER_SELECTED' }), MESSAGES),
    ).toEqual({
      durationMinMinutes: 'min required',
      durationMaxMinutes: 'max required',
      durationIncrementMinutes: 'increment required',
    });
  });

  it('reports only the field that is empty', () => {
    const result = validateBookingPolicy(
      policy({
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 30,
        durationMaxMinutes: 120,
      }),
      MESSAGES,
    );

    expect(result).toEqual({ durationIncrementMinutes: 'increment required' });
  });

  it('does not block a FIXED duration with empty min, max and increment', () => {
    expect(validateBookingPolicy(policy({ durationPolicy: 'FIXED' }), MESSAGES)).toEqual({});
  });

  it('flags a maximum below the minimum on the maximum field', () => {
    const result = validateBookingPolicy(
      policy({
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 120,
        durationMaxMinutes: 60,
        durationIncrementMinutes: 15,
      }),
      MESSAGES,
    );

    expect(result).toEqual({ durationMaxMinutes: 'range invalid' });
  });

  it('does not check the range of a FIXED duration whose hidden bounds are stale', () => {
    const result = validateBookingPolicy(
      policy({ durationPolicy: 'FIXED', durationMinMinutes: 120, durationMaxMinutes: 60 }),
      MESSAGES,
    );

    expect(result).toEqual({});
  });

  it('reports both pricing fields when per-increment pricing has neither', () => {
    const result = validateBookingPolicy(
      policy({
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 30,
        durationMaxMinutes: 120,
        durationIncrementMinutes: 15,
        pricingPolicy: 'PER_TIME_INCREMENT',
      }),
      MESSAGES,
    );

    expect(result).toEqual({
      pricingIncrementMinutes: 'pricing increment required',
      pricePerIncrementAmount: 'price per increment required',
    });
  });

  it('accepts a complete variable-duration, per-increment policy', () => {
    const result = validateBookingPolicy(
      policy({
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 30,
        durationMaxMinutes: 120,
        durationIncrementMinutes: 15,
        pricingPolicy: 'PER_TIME_INCREMENT',
        pricingIncrementMinutes: 15,
        pricePerIncrementAmount: 10,
      }),
      MESSAGES,
    );

    expect(result).toEqual({});
  });
});

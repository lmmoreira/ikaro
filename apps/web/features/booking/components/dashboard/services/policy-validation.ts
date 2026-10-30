import type { ServiceBookingPolicyItem } from '@ikaro/types';

export type PolicyValidationField =
  | 'durationMinMinutes'
  | 'durationMaxMinutes'
  | 'durationIncrementMinutes'
  | 'pricingIncrementMinutes'
  | 'pricePerIncrementAmount';

export type PolicyValidationErrors = Partial<Record<PolicyValidationField, string>>;

export interface PolicyValidationMessages {
  readonly durationMinRequired: string;
  readonly durationMaxRequired: string;
  readonly durationIncrementRequired: string;
  readonly durationRangeInvalid: string;
  readonly pricingIncrementRequired: string;
  readonly pricePerIncrementRequired: string;
}

// The rules the backend enforces on the resolved policy (service.aggregate.ts's
// validateBookingPolicyCompleteness) that the form can check on its own, so a save never leaves
// the browser just to be refused. Keys are added in form order, so the first key is the first
// field on screen. The backend stays the safety net; the window rules need the business limits,
// which the form does not have.
export function validateBookingPolicy(
  policy: ServiceBookingPolicyItem,
  messages: PolicyValidationMessages,
): PolicyValidationErrors {
  const errors: PolicyValidationErrors = {};

  if (policy.durationPolicy === 'CUSTOMER_SELECTED') {
    if (policy.durationMinMinutes === null)
      errors.durationMinMinutes = messages.durationMinRequired;
    if (policy.durationMaxMinutes === null)
      errors.durationMaxMinutes = messages.durationMaxRequired;
    if (policy.durationIncrementMinutes === null) {
      errors.durationIncrementMinutes = messages.durationIncrementRequired;
    }
    if (
      policy.durationMinMinutes !== null &&
      policy.durationMaxMinutes !== null &&
      policy.durationMaxMinutes < policy.durationMinMinutes
    ) {
      errors.durationMaxMinutes = messages.durationRangeInvalid;
    }
  }

  if (policy.pricingPolicy === 'PER_TIME_INCREMENT') {
    if (policy.pricingIncrementMinutes === null) {
      errors.pricingIncrementMinutes = messages.pricingIncrementRequired;
    }
    if (policy.pricePerIncrementAmount === null) {
      errors.pricePerIncrementAmount = messages.pricePerIncrementRequired;
    }
  }

  return errors;
}

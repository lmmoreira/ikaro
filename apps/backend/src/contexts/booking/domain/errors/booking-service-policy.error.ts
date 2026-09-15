import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { BookingDomainError } from './booking-domain-error.base';

// Split out of booking-service.error.ts to stay under docs/CODE_STANDARDS.md's file-length
// limit — the M22-S02 booking-policy/intake-schema errors are a self-contained group.

// UC-055 A2 — a variable-duration service must declare how it prices; mirrors
// BookingServiceLegsTooFewError's shape (a single-reason invariant, no Record<Reason,...> map
// needed).
export class ServiceDurationPolicyRequiresPricingError extends BookingDomainError {
  constructor() {
    super(
      'durationPolicy=CUSTOMER_SELECTED requires a non-FIXED pricingPolicy',
      BookingErrorCode.SERVICE_DURATION_POLICY_REQUIRES_PRICING,
      'pricingPolicy',
    );
    this.name = 'ServiceDurationPolicyRequiresPricingError';
  }
}

// UC-054/055's shared "bookingModel = APPOINTMENT" precondition — deliberately a distinct code
// from BookingServiceBookingModelMismatchError above: that one's message/field are specific to
// resource requirements/legs/buffer and would misrepresent the trigger for a booking-policy or
// intake-schema call (story-discovery decision, M22-S02, 2026-09-15).
export class BookingServiceBookingConfigModelMismatchError extends BookingDomainError {
  constructor(id: string) {
    super(
      `Booking policy and booking-intake schema only apply to an APPOINTMENT service: ${id}`,
      BookingErrorCode.SERVICE_BOOKING_CONFIG_MODEL_MISMATCH,
      'bookingModel',
    );
    this.name = 'BookingServiceBookingConfigModelMismatchError';
  }
}

type ServiceBookingPolicyInvalidReason =
  | 'duration-range-invalid'
  | 'pricing-increment-details-required'
  | 'custom-duration-details-required'
  | 'per-time-increment-requires-custom-duration';

const SERVICE_BOOKING_POLICY_INVALID_MESSAGES: Record<ServiceBookingPolicyInvalidReason, string> = {
  'duration-range-invalid': 'durationMaxMinutes must be >= durationMinMinutes',
  'pricing-increment-details-required':
    'pricingPolicy=PER_TIME_INCREMENT requires pricingIncrementMinutes and pricePerIncrementAmount',
  'custom-duration-details-required':
    'durationPolicy=CUSTOMER_SELECTED requires durationMinMinutes, durationMaxMinutes, and durationIncrementMinutes',
  'per-time-increment-requires-custom-duration':
    'pricingPolicy=PER_TIME_INCREMENT requires durationPolicy=CUSTOMER_SELECTED',
};

const SERVICE_BOOKING_POLICY_INVALID_FIELDS: Record<ServiceBookingPolicyInvalidReason, string> = {
  'duration-range-invalid': 'durationMaxMinutes',
  'pricing-increment-details-required': 'pricingIncrementMinutes',
  'custom-duration-details-required': 'durationMinMinutes',
  'per-time-increment-requires-custom-duration': 'durationPolicy',
};

// PATCH semantics resolve the request against the current policy before this aggregate ever
// sees it (update-service-booking-policy.use-case.ts's resolvePolicy()), so a Zod-level check
// scoped to one request body can't catch a range/completeness violation produced by merging a
// partial PATCH with an already-saved policy — this validates the fully-resolved snapshot
// instead, same reasoning as ServiceDurationPolicyRequiresPricingError above.
export class ServiceBookingPolicyInvalidError extends BookingDomainError {
  constructor(reason: ServiceBookingPolicyInvalidReason) {
    super(
      SERVICE_BOOKING_POLICY_INVALID_MESSAGES[reason],
      BookingErrorCode.SERVICE_BOOKING_POLICY_INVALID,
      SERVICE_BOOKING_POLICY_INVALID_FIELDS[reason],
    );
    this.name = 'ServiceBookingPolicyInvalidError';
  }
}

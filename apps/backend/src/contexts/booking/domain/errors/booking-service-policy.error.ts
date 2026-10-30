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
  | 'per-time-increment-requires-custom-duration'
  | 'max-advance-exceeds-tenant'
  | 'min-advance-below-tenant'
  | 'booking-window-empty';

interface ServiceBookingPolicyInvalidSpec {
  readonly message: string;
  readonly code: BookingErrorCode;
  readonly field: string;
}

const SERVICE_BOOKING_POLICY_INVALID_SPECS: Record<
  ServiceBookingPolicyInvalidReason,
  ServiceBookingPolicyInvalidSpec
> = {
  'duration-range-invalid': {
    message: 'durationMaxMinutes must be >= durationMinMinutes',
    code: BookingErrorCode.SERVICE_POLICY_DURATION_RANGE_INVALID,
    field: 'durationMaxMinutes',
  },
  'pricing-increment-details-required': {
    message:
      'pricingPolicy=PER_TIME_INCREMENT requires pricingIncrementMinutes and pricePerIncrementAmount',
    code: BookingErrorCode.SERVICE_POLICY_PRICING_DETAILS_REQUIRED,
    field: 'pricingIncrementMinutes',
  },
  'custom-duration-details-required': {
    message:
      'durationPolicy=CUSTOMER_SELECTED requires durationMinMinutes, durationMaxMinutes, and durationIncrementMinutes',
    code: BookingErrorCode.SERVICE_POLICY_DURATION_DETAILS_REQUIRED,
    field: 'durationMinMinutes',
  },
  'per-time-increment-requires-custom-duration': {
    message: 'pricingPolicy=PER_TIME_INCREMENT requires durationPolicy=CUSTOMER_SELECTED',
    code: BookingErrorCode.SERVICE_POLICY_INCREMENT_PRICING_REQUIRES_CUSTOM_DURATION,
    field: 'durationPolicy',
  },
  'max-advance-exceeds-tenant': {
    message: 'maxBookingAdvanceDaysOverride cannot exceed the tenant maximum',
    code: BookingErrorCode.SERVICE_POLICY_MAX_ADVANCE_EXCEEDS_TENANT,
    field: 'maxBookingAdvanceDaysOverride',
  },
  'min-advance-below-tenant': {
    message: 'minBookingAdvanceHoursOverride cannot be below the tenant minimum',
    code: BookingErrorCode.SERVICE_POLICY_MIN_ADVANCE_BELOW_TENANT,
    field: 'minBookingAdvanceHoursOverride',
  },
  'booking-window-empty': {
    message: 'The minimum notice must be shorter than the maximum advance, in whole days',
    code: BookingErrorCode.SERVICE_POLICY_WINDOW_EMPTY,
    field: 'minBookingAdvanceHoursOverride',
  },
};

// PATCH semantics resolve the request against the current policy before this aggregate ever
// sees it (update-service-booking-policy.use-case.ts's resolvePolicy()), so a Zod-level check
// scoped to one request body can't catch a range/completeness violation produced by merging a
// partial PATCH with an already-saved policy — this validates the fully-resolved snapshot
// instead, same reasoning as ServiceDurationPolicyRequiresPricingError above.
//
// One class, seven reasons: each reason owns its own code so the client can show a specific
// translated message. `params` carries the business limit a window reason names (interpolated
// into the translated text, like RecurringBookingScheduleTermExceededError).
export class ServiceBookingPolicyInvalidError extends BookingDomainError {
  readonly params?: Readonly<Record<string, number>>;

  constructor(reason: ServiceBookingPolicyInvalidReason, params?: Record<string, number>) {
    const { message, code, field } = SERVICE_BOOKING_POLICY_INVALID_SPECS[reason];
    super(message, code, field);
    this.name = 'ServiceBookingPolicyInvalidError';
    this.params = params;
  }
}

// A legged service's length is fixed by its legs (sum of leg durations + transition gaps), so a
// customer-chosen duration (durationPolicy=CUSTOMER_SELECTED) has no meaning for it — enforced in
// both directions (setLegs() on a custom-duration service, setBookingPolicy() on a legged one).
export class BookingServiceLegsCustomDurationConflictError extends BookingDomainError {
  constructor(id: string) {
    super(
      `A service with legs has a fixed length and cannot use a customer-selected duration: ${id}`,
      BookingErrorCode.SERVICE_LEGS_CUSTOM_DURATION_CONFLICT,
    );
    this.name = 'BookingServiceLegsCustomDurationConflictError';
  }
}

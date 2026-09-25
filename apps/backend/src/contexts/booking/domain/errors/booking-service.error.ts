import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { BookingDomainError } from './booking-domain-error.base';

export class ServiceNotFoundError extends BookingDomainError {
  constructor(id: string) {
    super(`Service not found: ${id}`, BookingErrorCode.SERVICE_NOT_FOUND);
    this.name = 'ServiceNotFoundError';
  }
}

export class ServiceDeactivatedError extends BookingDomainError {
  constructor() {
    super('Cannot update a deactivated service', BookingErrorCode.SERVICE_DEACTIVATED);
    this.name = 'ServiceDeactivatedError';
  }
}

export class BookingServiceNotActiveError extends BookingDomainError {
  constructor(id: string) {
    super(`Service is not active: ${id}`, BookingErrorCode.SERVICE_NOT_ACTIVE);
    this.name = 'BookingServiceNotActiveError';
  }
}

export class BookingServiceNotInTenantError extends BookingDomainError {
  constructor(id: string) {
    super(`Service does not belong to tenant: ${id}`, BookingErrorCode.SERVICE_NOT_IN_TENANT);
    this.name = 'BookingServiceNotInTenantError';
  }
}

// A SESSION service has no bookable class-session machinery until M24 ships
// ClassScheduleTemplate/ClassSession (docs/04-USE_CASES.md UC-056 step 3) — until then, the
// ordinary appointment-booking flow must reject it outright rather than silently create a
// one-off appointment against what is meant to be a shared-capacity class.
export class BookingServiceSessionNotBookableError extends BookingDomainError {
  constructor(id: string) {
    super(
      `SESSION services cannot be booked directly until class scheduling ships: ${id}`,
      BookingErrorCode.SERVICE_SESSION_NOT_BOOKABLE,
    );
    this.name = 'BookingServiceSessionNotBookableError';
  }
}

export class ServiceNameRequiredError extends BookingDomainError {
  constructor() {
    super('name is required', BookingErrorCode.SERVICE_NAME_REQUIRED);
    this.name = 'ServiceNameRequiredError';
  }
}

export class ServicePriceInvalidError extends BookingDomainError {
  constructor() {
    super('price must be greater than zero', BookingErrorCode.SERVICE_PRICE_INVALID);
    this.name = 'ServicePriceInvalidError';
  }
}

export class ServiceDurationInvalidError extends BookingDomainError {
  constructor() {
    super('durationMinutes must be greater than zero', BookingErrorCode.SERVICE_DURATION_INVALID);
    this.name = 'ServiceDurationInvalidError';
  }
}

export class ServiceLoyaltyPointsInvalidError extends BookingDomainError {
  constructor() {
    super(
      'loyaltyPointsValue must be non-negative',
      BookingErrorCode.SERVICE_LOYALTY_POINTS_INVALID,
    );
    this.name = 'ServiceLoyaltyPointsInvalidError';
  }
}

export class ServiceBufferAfterMinutesInvalidError extends BookingDomainError {
  constructor() {
    super(
      'bufferAfterMinutes must be non-negative',
      BookingErrorCode.SERVICE_BUFFER_AFTER_MINUTES_INVALID,
      'bufferAfterMinutes',
    );
    this.name = 'ServiceBufferAfterMinutesInvalidError';
  }
}

export class BookingServiceHasLegsError extends BookingDomainError {
  constructor(id: string) {
    super(
      `Service is configured with legs, cannot set a flat resource requirement or buffer: ${id}`,
      BookingErrorCode.SERVICE_HAS_LEGS,
    );
    this.name = 'BookingServiceHasLegsError';
  }
}

export class BookingServiceBookingModelMismatchError extends BookingDomainError {
  constructor(id: string) {
    super(
      `Resource requirements/legs/buffer only apply to an APPOINTMENT service: ${id}`,
      BookingErrorCode.SERVICE_BOOKING_MODEL_MISMATCH,
      'bookingModel',
    );
    this.name = 'BookingServiceBookingModelMismatchError';
  }
}

export class BookingServiceLegsTooFewError extends BookingDomainError {
  constructor() {
    super('legs must have at least 2 entries', BookingErrorCode.SERVICE_LEGS_TOO_FEW, 'legs');
    this.name = 'BookingServiceLegsTooFewError';
  }
}

export class BookingServiceBookingModelImmutableError extends BookingDomainError {
  constructor(id: string) {
    super(
      `bookingModel cannot change once the service has booking history: ${id}`,
      BookingErrorCode.SERVICE_BOOKING_MODEL_IMMUTABLE,
      'bookingModel',
    );
    this.name = 'BookingServiceBookingModelImmutableError';
  }
}

export class BookingServiceConcurrentModificationError extends BookingDomainError {
  constructor(id: string) {
    super(
      `Service configuration changed while this booking was being created: ${id}`,
      BookingErrorCode.SERVICE_CONCURRENT_MODIFICATION,
    );
    this.name = 'BookingServiceConcurrentModificationError';
  }
}

export class ClassResourceSlotDuplicateTypeError extends BookingDomainError {
  constructor() {
    super(
      'classResourceSlots cannot list the same type more than once',
      BookingErrorCode.SERVICE_CLASS_RESOURCE_SLOT_DUPLICATE_TYPE,
      'type',
    );
    this.name = 'ClassResourceSlotDuplicateTypeError';
  }
}

export class ClassResourceSlotResourceNotActiveError extends BookingDomainError {
  constructor() {
    super(
      'eligibleResourceIds must reference active resources of the matching type',
      BookingErrorCode.SERVICE_CLASS_RESOURCE_SLOT_RESOURCE_NOT_ACTIVE,
      'eligibleResourceIds',
    );
    this.name = 'ClassResourceSlotResourceNotActiveError';
  }
}

// An empty eligibleResourceIds can't round-trip: service_class_resource_pool has one row per
// (service, type, resourceId) — a slot with zero resources has zero rows, so it's indistinguishable
// from "no slot declared for this type" on reload (typeorm-service.mapper.ts's toClassResourceSlots
// groups purely by existing pool rows). Reject it here instead of inventing separate slot-identity
// storage for a case with no real product value while classResourceSlots stays inert until M24.
export class ClassResourceSlotEmptyPoolError extends BookingDomainError {
  constructor() {
    super(
      'eligibleResourceIds must include at least one resource',
      BookingErrorCode.SERVICE_CLASS_RESOURCE_SLOT_EMPTY_POOL,
      'eligibleResourceIds',
    );
    this.name = 'ClassResourceSlotEmptyPoolError';
  }
}

type ClassResourceSlotBookingModelReason = 'required-for-session' | 'not-allowed-for-appointment';

const CLASS_RESOURCE_SLOT_BOOKING_MODEL_MESSAGES: Record<
  ClassResourceSlotBookingModelReason,
  string
> = {
  'required-for-session': 'classResourceSlots must include at least one slot for a SESSION service',
  'not-allowed-for-appointment': 'classResourceSlots only applies to a SESSION service',
};

// Enforced wherever bookingModel is set (Service.create() and changeBookingModel()) — a SESSION
// service with no slots would be created un-configurable (there is no separate slot-management
// endpoint in this milestone, classResourceSlots can only be supplied where bookingModel itself
// is set), and an APPOINTMENT service silently discarding a supplied classResourceSlots would
// surprise a caller who mistakenly sent it.
export class ClassResourceSlotBookingModelMismatchError extends BookingDomainError {
  constructor(reason: ClassResourceSlotBookingModelReason) {
    super(
      CLASS_RESOURCE_SLOT_BOOKING_MODEL_MESSAGES[reason],
      BookingErrorCode.SERVICE_CLASS_RESOURCE_SLOT_BOOKING_MODEL_MISMATCH,
      'classResourceSlots',
    );
    this.name = 'ClassResourceSlotBookingModelMismatchError';
  }
}

export class BookingServiceResourceTypeUnavailableError extends BookingDomainError {
  constructor(type: string) {
    super(
      `No active resource of type ${type} exists`,
      BookingErrorCode.SERVICE_RESOURCE_TYPE_UNAVAILABLE,
      'type',
    );
    this.name = 'BookingServiceResourceTypeUnavailableError';
  }
}

// Thrown when a CUSTOMER_CHOICE requirement has no matching entry in the request's
// resourceSelections (or fewer entries than requiredQuantity) — a distinct client-input gap from
// BookingServiceResourceTypeUnavailableError above, which means "no eligible resource exists at
// all" rather than "you didn't tell us which one you want" (M23-S01).
export class BookingResourceSelectionRequiredError extends BookingDomainError {
  constructor(type: string) {
    super(
      `A resourceSelections entry is required for resource type ${type}`,
      BookingErrorCode.RESOURCE_SELECTION_REQUIRED,
      'resourceSelections',
    );
    this.name = 'BookingResourceSelectionRequiredError';
  }
}

type ResourceRequirementInvalidReason =
  | 'quantity-must-be-positive'
  | 'quantity-exceeds-candidates'
  | 'duplicate-type'
  | 'pool-id-not-active';

const RESOURCE_REQUIREMENT_INVALID_MESSAGES: Record<ResourceRequirementInvalidReason, string> = {
  'quantity-must-be-positive': 'requiredQuantity must be greater than 0',
  'quantity-exceeds-candidates':
    'requiredQuantity cannot exceed the number of eligible resources (the explicit resourcePoolIds, or every active resource of the type when none is set)',
  'duplicate-type': 'resourceRequirements cannot list the same type more than once',
  'pool-id-not-active': 'resourcePoolIds must reference active resources of the matching type',
};

const RESOURCE_REQUIREMENT_INVALID_FIELDS: Record<ResourceRequirementInvalidReason, string> = {
  'quantity-must-be-positive': 'requiredQuantity',
  'quantity-exceeds-candidates': 'requiredQuantity',
  'duplicate-type': 'type',
  'pool-id-not-active': 'resourcePoolIds',
};

export class ResourceRequirementInvalidError extends BookingDomainError {
  constructor(reason: ResourceRequirementInvalidReason) {
    super(
      RESOURCE_REQUIREMENT_INVALID_MESSAGES[reason],
      BookingErrorCode.SERVICE_RESOURCE_REQUIREMENT_INVALID,
      RESOURCE_REQUIREMENT_INVALID_FIELDS[reason],
    );
    this.name = 'ResourceRequirementInvalidError';
  }
}

type ServiceLegInvalidReason =
  | 'duration-must-be-positive'
  | 'requires-resource-requirement'
  | 'duplicate-leg-index'
  | 'name-required'
  | 'leg-index-must-be-non-negative'
  | 'transition-gap-must-be-non-negative';

const SERVICE_LEG_INVALID_MESSAGES: Record<ServiceLegInvalidReason, string> = {
  'duration-must-be-positive': 'durationMinutes must be greater than 0',
  'requires-resource-requirement': 'a leg requires at least one resource requirement',
  'duplicate-leg-index': 'legs cannot repeat the same legIndex',
  'name-required': 'name is required',
  'leg-index-must-be-non-negative': 'legIndex must be non-negative',
  'transition-gap-must-be-non-negative': 'transitionGapAfterMinutes must be non-negative',
};

const SERVICE_LEG_INVALID_FIELDS: Record<ServiceLegInvalidReason, string> = {
  'duration-must-be-positive': 'durationMinutes',
  'requires-resource-requirement': 'resourceRequirements',
  'duplicate-leg-index': 'legIndex',
  'name-required': 'name',
  'leg-index-must-be-non-negative': 'legIndex',
  'transition-gap-must-be-non-negative': 'transitionGapAfterMinutes',
};

export class ServiceLegInvalidError extends BookingDomainError {
  constructor(reason: ServiceLegInvalidReason) {
    super(
      SERVICE_LEG_INVALID_MESSAGES[reason],
      BookingErrorCode.SERVICE_LEG_INVALID,
      SERVICE_LEG_INVALID_FIELDS[reason],
    );
    this.name = 'ServiceLegInvalidError';
  }
}

// ServiceDurationPolicyRequiresPricingError, BookingServiceBookingConfigModelMismatchError, and
// ServiceBookingPolicyInvalidError (the M22-S02 booking-policy/intake-schema error group) live
// in booking-service-policy.error.ts (split out to stay under docs/CODE_STANDARDS.md's
// file-length limit).

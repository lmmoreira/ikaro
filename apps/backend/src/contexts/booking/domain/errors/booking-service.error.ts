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

type ResourceRequirementInvalidReason =
  'quantity-must-be-positive' | 'duplicate-type' | 'pool-id-not-active';

const RESOURCE_REQUIREMENT_INVALID_MESSAGES: Record<ResourceRequirementInvalidReason, string> = {
  'quantity-must-be-positive': 'requiredQuantity must be greater than 0',
  'duplicate-type': 'resourceRequirements cannot list the same type more than once',
  'pool-id-not-active': 'resourcePoolIds must reference active resources of the matching type',
};

const RESOURCE_REQUIREMENT_INVALID_FIELDS: Record<ResourceRequirementInvalidReason, string> = {
  'quantity-must-be-positive': 'requiredQuantity',
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
  'duration-must-be-positive' | 'requires-resource-requirement' | 'duplicate-leg-index';

const SERVICE_LEG_INVALID_MESSAGES: Record<ServiceLegInvalidReason, string> = {
  'duration-must-be-positive': 'durationMinutes must be greater than 0',
  'requires-resource-requirement': 'a leg requires at least one resource requirement',
  'duplicate-leg-index': 'legs cannot repeat the same legIndex',
};

const SERVICE_LEG_INVALID_FIELDS: Record<ServiceLegInvalidReason, string> = {
  'duration-must-be-positive': 'durationMinutes',
  'requires-resource-requirement': 'resourceRequirements',
  'duplicate-leg-index': 'legIndex',
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

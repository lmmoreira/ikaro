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

export class BookingServiceHasLegsError extends BookingDomainError {
  constructor(id: string) {
    super(
      `Service is configured with legs, cannot set a flat resource requirement or buffer: ${id}`,
      BookingErrorCode.SERVICE_HAS_LEGS,
    );
    this.name = 'BookingServiceHasLegsError';
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

export class ResourceRequirementInvalidError extends BookingDomainError {
  constructor(reason: 'quantity-must-be-positive') {
    const message =
      reason === 'quantity-must-be-positive' ? 'requiredQuantity must be greater than 0' : reason;
    super(message, BookingErrorCode.SERVICE_RESOURCE_REQUIREMENT_INVALID, 'requiredQuantity');
    this.name = 'ResourceRequirementInvalidError';
  }
}

export class ServiceLegInvalidError extends BookingDomainError {
  constructor(reason: 'duration-must-be-positive' | 'requires-resource-requirement') {
    const message =
      reason === 'duration-must-be-positive'
        ? 'durationMinutes must be greater than 0'
        : 'a leg requires at least one resource requirement';
    const field =
      reason === 'duration-must-be-positive' ? 'durationMinutes' : 'resourceRequirements';
    super(message, BookingErrorCode.SERVICE_LEG_INVALID, field);
    this.name = 'ServiceLegInvalidError';
  }
}

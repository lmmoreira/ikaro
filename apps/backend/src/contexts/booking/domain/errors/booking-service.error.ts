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

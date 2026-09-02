import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { BookingDomainError } from './booking-domain-error.base';

export class ResourceTypeNotCreatableError extends BookingDomainError {
  constructor() {
    super(
      "type 'LOCATION' cannot be created directly — every tenant's one LOCATION resource comes from the backfill migration",
      BookingErrorCode.RESOURCE_TYPE_NOT_CREATABLE,
      'type',
    );
    this.name = 'ResourceTypeNotCreatableError';
  }
}

export class ResourceTypeRefIdMismatchError extends BookingDomainError {
  constructor() {
    super(
      "refId is required when type is 'STAFF' and must be omitted otherwise",
      BookingErrorCode.RESOURCE_TYPE_REF_ID_MISMATCH,
      'refId',
    );
    this.name = 'ResourceTypeRefIdMismatchError';
  }
}

export class ResourceWorkingHoursOutsideTenantHoursError extends BookingDomainError {
  constructor(day: string) {
    super(
      `workingHours.${day} must be a subset of the tenant's business hours`,
      BookingErrorCode.RESOURCE_WORKING_HOURS_OUTSIDE_TENANT_HOURS,
      `workingHours.${day}`,
    );
    this.name = 'ResourceWorkingHoursOutsideTenantHoursError';
  }
}

export class ResourceNoWorkingHoursError extends BookingDomainError {
  constructor() {
    super(
      'Resource has no working hours and the tenant has no business hours either',
      BookingErrorCode.RESOURCE_NO_WORKING_HOURS,
      'workingHours',
    );
    this.name = 'ResourceNoWorkingHoursError';
  }
}

export class ResourceMaxCapacityInvalidError extends BookingDomainError {
  constructor(reason: 'must-be-positive' | 'must-be-null-for-staff' = 'must-be-positive') {
    const message =
      reason === 'must-be-null-for-staff'
        ? 'maxCapacity must not be set for STAFF resources'
        : 'maxCapacity must be greater than 0 when set';
    super(message, BookingErrorCode.RESOURCE_MAX_CAPACITY_INVALID, 'maxCapacity');
    this.name = 'ResourceMaxCapacityInvalidError';
  }
}

export class ResourceStaffAlreadyWrappedError extends BookingDomainError {
  constructor(staffId: string) {
    super(
      `Staff member is already wrapped by another Resource: ${staffId}`,
      BookingErrorCode.RESOURCE_STAFF_ALREADY_WRAPPED,
      'refId',
    );
    this.name = 'ResourceStaffAlreadyWrappedError';
  }
}

export class ResourceStaffNotFoundError extends BookingDomainError {
  constructor(staffId: string) {
    super(
      `Staff member not found, inactive, or belongs to another tenant: ${staffId}`,
      BookingErrorCode.RESOURCE_STAFF_NOT_FOUND,
      'refId',
    );
    this.name = 'ResourceStaffNotFoundError';
  }
}

export class ResourceNotFoundError extends BookingDomainError {
  constructor(id: string) {
    super(`Resource not found: ${id}`, BookingErrorCode.RESOURCE_NOT_FOUND);
    this.name = 'ResourceNotFoundError';
  }
}

export class ResourceAlreadyActiveError extends BookingDomainError {
  constructor(id: string) {
    super(`Resource is already active: ${id}`, BookingErrorCode.RESOURCE_ALREADY_ACTIVE);
    this.name = 'ResourceAlreadyActiveError';
  }
}

export class ResourceLocationCannotBeDeactivatedError extends BookingDomainError {
  constructor(id: string) {
    super(
      `A tenant must always retain exactly one active LOCATION resource: ${id}`,
      BookingErrorCode.RESOURCE_LOCATION_CANNOT_BE_DEACTIVATED,
    );
    this.name = 'ResourceLocationCannotBeDeactivatedError';
  }
}

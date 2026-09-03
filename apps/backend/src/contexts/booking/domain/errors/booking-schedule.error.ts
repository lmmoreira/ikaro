import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { BookingDomainError } from './booking-domain-error.base';

export class ClosureDateInPastError extends BookingDomainError {
  constructor() {
    super('Cannot close a schedule for a past date', BookingErrorCode.CLOSURE_DATE_IN_PAST);
    this.name = 'ClosureDateInPastError';
  }
}

export class ScheduleClosureNotFoundError extends BookingDomainError {
  constructor(id: string) {
    super(`Schedule closure not found: ${id}`, BookingErrorCode.SCHEDULE_CLOSURE_NOT_FOUND);
    this.name = 'ScheduleClosureNotFoundError';
  }
}

export class ScheduleAlreadyClosedError extends BookingDomainError {
  constructor(date: string) {
    super(`Schedule is already closed for date: ${date}`, BookingErrorCode.SCHEDULE_ALREADY_CLOSED);
    this.name = 'ScheduleAlreadyClosedError';
  }
}

export class OpeningDateInPastError extends BookingDomainError {
  constructor() {
    super('Cannot open a schedule for a past date', BookingErrorCode.OPENING_DATE_IN_PAST);
    this.name = 'OpeningDateInPastError';
  }
}

export class DayAlreadyOpenInSettingsError extends BookingDomainError {
  constructor(date: string) {
    super(
      `Day is already open in business hours settings: ${date}`,
      BookingErrorCode.DAY_ALREADY_OPEN_IN_SETTINGS,
    );
    this.name = 'DayAlreadyOpenInSettingsError';
  }
}

export class ScheduleOpeningAlreadyExistsError extends BookingDomainError {
  constructor(date: string) {
    super(
      `A schedule opening already exists for date: ${date}`,
      BookingErrorCode.SCHEDULE_OPENING_ALREADY_EXISTS,
    );
    this.name = 'ScheduleOpeningAlreadyExistsError';
  }
}

export class ScheduleOpeningNotFoundError extends BookingDomainError {
  constructor(id: string) {
    super(`Schedule opening not found: ${id}`, BookingErrorCode.SCHEDULE_OPENING_NOT_FOUND);
    this.name = 'ScheduleOpeningNotFoundError';
  }
}

export class OpeningExceedsTenantWindowError extends BookingDomainError {
  constructor(date: string) {
    super(
      `Resource opening window exceeds the tenant's own opening window for date: ${date}`,
      BookingErrorCode.OPENING_EXCEEDS_TENANT_WINDOW,
    );
    this.name = 'OpeningExceedsTenantWindowError';
  }
}

export class TenantOpeningRequiredError extends BookingDomainError {
  constructor(date: string) {
    super(
      `A tenant-wide opening must exist for date ${date} before a resource-scoped opening can be created for it`,
      BookingErrorCode.TENANT_OPENING_REQUIRED,
    );
    this.name = 'TenantOpeningRequiredError';
  }
}

export class AvailabilityDateInPastError extends BookingDomainError {
  constructor() {
    super('Cannot check availability for a past date', BookingErrorCode.AVAILABILITY_DATE_IN_PAST);
    this.name = 'AvailabilityDateInPastError';
  }
}

export class AvailabilityRangeInvalidError extends BookingDomainError {
  constructor(reason: string) {
    super(`Invalid availability range: ${reason}`, BookingErrorCode.AVAILABILITY_RANGE_INVALID);
    this.name = 'AvailabilityRangeInvalidError';
  }
}

export class ClosureReasonInvalidError extends BookingDomainError {
  constructor(reason: string) {
    super(`Invalid closure reason: ${reason}`, BookingErrorCode.CLOSURE_REASON_INVALID);
    this.name = 'ClosureReasonInvalidError';
  }
}

export class ClosureTimeRangeIncompleteError extends BookingDomainError {
  constructor() {
    super(
      'startTime and endTime must both be provided or both omitted',
      BookingErrorCode.CLOSURE_TIME_RANGE_INCOMPLETE,
    );
    this.name = 'ClosureTimeRangeIncompleteError';
  }
}

export class InvalidTimeRangeError extends BookingDomainError {
  constructor(
    message: string,
    code:
      | typeof BookingErrorCode.TIME_RANGE_FORMAT_INVALID
      | typeof BookingErrorCode.TIME_RANGE_ORDER_INVALID,
  ) {
    super(message, code);
    this.name = 'InvalidTimeRangeError';
  }
}

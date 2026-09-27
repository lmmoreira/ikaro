import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { BookingDomainError } from './booking-domain-error.base';

export class RecurringBookingScheduleNotFoundError extends BookingDomainError {
  constructor(id: string) {
    super(
      `Recurring booking schedule not found: ${id}`,
      BookingErrorCode.RECURRING_SCHEDULE_NOT_FOUND,
    );
    this.name = 'RecurringBookingScheduleNotFoundError';
  }
}

export class RecurringBookingScheduleConflictError extends BookingDomainError {
  constructor() {
    super(
      'The recurring pattern conflicts with an existing commitment on one of its future occurrences',
      BookingErrorCode.RECURRING_SCHEDULE_CONFLICT,
    );
    this.name = 'RecurringBookingScheduleConflictError';
  }
}

export class RecurringBookingScheduleCapReachedError extends BookingDomainError {
  constructor(reason: 'resource' | 'service') {
    super(
      reason === 'resource'
        ? 'Active FIXED_ASSIGNMENT recurring schedule cap reached for this resource'
        : 'Active RESOLVE_PER_OCCURRENCE recurring schedule cap reached for this service',
      BookingErrorCode.RECURRING_SCHEDULE_CAP_REACHED,
    );
    this.name = 'RecurringBookingScheduleCapReachedError';
  }
}

export class RecurringBookingScheduleNotActiveError extends BookingDomainError {
  constructor(id: string) {
    super(
      `Recurring booking schedule is not active: ${id}`,
      BookingErrorCode.RECURRING_SCHEDULE_NOT_ACTIVE,
    );
    this.name = 'RecurringBookingScheduleNotActiveError';
  }
}

export class RecurringBookingScheduleIneligibleServiceError extends BookingDomainError {
  constructor(
    reason:
      | 'recurrence-not-enabled'
      | 'not-appointment'
      | 'legged-or-bundled'
      | 'selection-mode-mismatch',
  ) {
    const messages: Record<typeof reason, string> = {
      'recurrence-not-enabled': 'This service does not have recurring reservations enabled',
      'not-appointment': 'Recurring schedules only apply to APPOINTMENT services',
      'legged-or-bundled':
        'Recurring schedules only apply to a flat, single-resource-requirement service',
      'selection-mode-mismatch':
        "The requested assignmentPolicy doesn't match this service's resource requirement",
    };
    super(messages[reason], BookingErrorCode.RECURRING_SCHEDULE_INELIGIBLE_SERVICE);
    this.name = 'RecurringBookingScheduleIneligibleServiceError';
  }
}

export class RecurringBookingScheduleExceptionAlreadyExistsError extends BookingDomainError {
  constructor(occurrenceStart: string) {
    super(
      `This occurrence was already skipped or rescheduled: ${occurrenceStart}`,
      BookingErrorCode.RECURRING_SCHEDULE_EXCEPTION_ALREADY_EXISTS,
    );
    this.name = 'RecurringBookingScheduleExceptionAlreadyExistsError';
  }
}

export class RecurringBookingScheduleForbiddenError extends BookingDomainError {
  constructor() {
    super(
      'You are not allowed to perform this action on this recurring schedule',
      BookingErrorCode.RECURRING_SCHEDULE_FORBIDDEN,
    );
    this.name = 'RecurringBookingScheduleForbiddenError';
  }
}

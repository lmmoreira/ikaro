import { BookingErrorCode, RecurringScheduleConflictReason } from '@ikaro/types/protocol/errors';
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

// One occurrence of a recurring pattern that cannot be honored (UC-070 A1). The reason union is
// the wire type from @ikaro/types (one definition); only the instant is a Date here — the HTTP
// mapper serializes it.
export interface RecurringScheduleOccurrenceConflict {
  occurrenceStart: Date;
  reason: RecurringScheduleConflictReason;
}

export class RecurringBookingScheduleConflictError extends BookingDomainError {
  // The affected occurrences of the creation-time and approval-time hours/occupancy checks,
  // ordered by occurrenceStart.
  readonly conflicts: RecurringScheduleOccurrenceConflict[];

  constructor(conflicts: RecurringScheduleOccurrenceConflict[]) {
    super(
      'The recurring pattern conflicts with an existing commitment on one of its future occurrences',
      BookingErrorCode.RECURRING_SCHEDULE_CONFLICT,
    );
    this.name = 'RecurringBookingScheduleConflictError';
    this.conflicts = conflicts;
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

export class RecurringBookingScheduleNotPendingApprovalError extends BookingDomainError {
  constructor(id: string) {
    super(
      `Recurring booking schedule is not awaiting approval: ${id}`,
      BookingErrorCode.RECURRING_SCHEDULE_NOT_PENDING_APPROVAL,
    );
    this.name = 'RecurringBookingScheduleNotPendingApprovalError';
  }
}

export class RecurringBookingScheduleIneligibleServiceError extends BookingDomainError {
  constructor(
    reason:
      | 'recurrence-not-enabled'
      | 'not-appointment'
      | 'legged-or-bundled'
      | 'requires-pickup-address'
      | 'selection-mode-mismatch',
  ) {
    const messages: Record<typeof reason, string> = {
      'recurrence-not-enabled': 'This service does not have recurring reservations enabled',
      'not-appointment': 'Recurring schedules only apply to APPOINTMENT services',
      'legged-or-bundled':
        'Recurring schedules only apply to a flat, single-resource-requirement service',
      'requires-pickup-address':
        'Recurring schedules do not apply to a service that requires a pickup address',
      'selection-mode-mismatch':
        "The requested assignmentPolicy doesn't match this service's resource requirement",
    };
    super(messages[reason], BookingErrorCode.RECURRING_SCHEDULE_INELIGIBLE_SERVICE);
    this.name = 'RecurringBookingScheduleIneligibleServiceError';
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

export class RecurringBookingScheduleInvalidDateRangeError extends BookingDomainError {
  constructor() {
    super(
      'endsOn must not be before startsOn',
      BookingErrorCode.RECURRING_SCHEDULE_INVALID_DATE_RANGE,
    );
    this.name = 'RecurringBookingScheduleInvalidDateRangeError';
  }
}

export class RecurringBookingScheduleNoOccurrencesError extends BookingDomainError {
  constructor() {
    super(
      'none of the chosen weekdays falls between startsOn and endsOn',
      BookingErrorCode.RECURRING_SCHEDULE_NO_OCCURRENCES,
    );
    this.name = 'RecurringBookingScheduleNoOccurrencesError';
  }
}

export class RecurringBookingScheduleTermExceededError extends BookingDomainError {
  // Interpolated by the client into the translated message (errors.json uses {maxTermDays});
  // latestEndsOn stays available to the UI for formatting.
  readonly params: { maxTermDays: number; latestEndsOn: string };

  constructor(maxTermDays: number, latestEndsOn: string) {
    super(
      `endsOn must not be later than ${latestEndsOn} (${maxTermDays} days after startsOn)`,
      BookingErrorCode.RECURRING_SCHEDULE_TERM_EXCEEDED,
      'endsOn',
    );
    this.name = 'RecurringBookingScheduleTermExceededError';
    this.params = { maxTermDays, latestEndsOn };
  }
}

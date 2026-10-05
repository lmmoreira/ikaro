import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { BookingDomainError } from './booking-domain-error.base';

export class AvailabilityAlertNotFoundError extends BookingDomainError {
  constructor(id: string) {
    super(`Availability alert not found: ${id}`, BookingErrorCode.ALERT_NOT_FOUND);
    this.name = 'AvailabilityAlertNotFoundError';
  }
}

// One rule per `reason` so a caller (and a test) can tell which input was refused; the wire code
// is the same for all of them (BOOKING_ALERT_CRITERIA_INVALID) — the customer fixes the form.
export type AvailabilityAlertCriteriaInvalidReason =
  | 'criteria-fields-mismatch'
  | 'range-end-before-start'
  | 'range-in-past'
  | 'weekdays-empty'
  | 'weekly-end-before-start'
  | 'expires-in-past'
  | 'expires-beyond-max'
  | 'resource-not-eligible';

export class AvailabilityAlertCriteriaInvalidError extends BookingDomainError {
  readonly reason: AvailabilityAlertCriteriaInvalidReason;

  constructor(reason: AvailabilityAlertCriteriaInvalidReason, field?: string) {
    super(`Invalid availability alert: ${reason}`, BookingErrorCode.ALERT_CRITERIA_INVALID, field);
    this.name = 'AvailabilityAlertCriteriaInvalidError';
    this.reason = reason;
  }
}

// An alert that is not ACTIVE (already notified, expired or cancelled) is read-only history —
// UC-076 A1; the customer creates a new one instead.
export class AvailabilityAlertNotEditableError extends BookingDomainError {
  constructor(id: string) {
    super(`Availability alert is no longer active: ${id}`, BookingErrorCode.ALERT_NOT_EDITABLE);
    this.name = 'AvailabilityAlertNotEditableError';
  }
}

export class AvailabilityAlertIneligibleServiceError extends BookingDomainError {
  constructor() {
    super(
      'This service does not offer availability alerts',
      BookingErrorCode.ALERT_INELIGIBLE_SERVICE,
    );
    this.name = 'AvailabilityAlertIneligibleServiceError';
  }
}

export class AvailabilityAlertCapReachedError extends BookingDomainError {
  constructor(cap: number) {
    super(
      `The customer already has ${cap} active availability alerts`,
      BookingErrorCode.ALERT_CAP_REACHED,
    );
    this.name = 'AvailabilityAlertCapReachedError';
  }
}

import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { BookingDomainError } from './booking-domain-error.base';

export class BookingNotFoundError extends BookingDomainError {
  constructor(id: string) {
    super(`Booking not found: ${id}`, BookingErrorCode.NOT_FOUND);
    this.name = 'BookingNotFoundError';
  }
}

export class BookingLineRequiredError extends BookingDomainError {
  constructor() {
    super('A booking must have at least one service line', BookingErrorCode.LINE_REQUIRED);
    this.name = 'BookingLineRequiredError';
  }
}

export class PickupAddressRequiredError extends BookingDomainError {
  constructor() {
    super(
      'pickupAddress is required when a pickup service is selected',
      BookingErrorCode.PICKUP_ADDRESS_REQUIRED,
      'pickupAddress',
    );
    this.name = 'PickupAddressRequiredError';
  }
}

export class InvalidBookingTransitionError extends BookingDomainError {
  constructor(from: string, to: string) {
    super(`Cannot transition booking from ${from} to ${to}`, BookingErrorCode.INVALID_TRANSITION);
    this.name = 'InvalidBookingTransitionError';
  }
}

export class BookingSlotUnavailableError extends BookingDomainError {
  constructor() {
    super('The requested time slot is no longer available', BookingErrorCode.SLOT_UNAVAILABLE);
    this.name = 'BookingSlotUnavailableError';
  }
}

// Thrown by BookingSlotConflictService.assertSlotFree() instead of the generic
// BookingSlotUnavailableError above when the conflicting candidate(s) belong to a bundle
// (a line with more than one flat, non-legged resource requirement) — UC-064 A2's "part of this
// booking is no longer available" race (M23-S01).
export class BookingBundlePartiallyUnavailableError extends BookingDomainError {
  constructor() {
    super(
      'Part of this booking is no longer available',
      BookingErrorCode.BUNDLE_PARTIALLY_UNAVAILABLE,
    );
    this.name = 'BookingBundlePartiallyUnavailableError';
  }
}

// Same shape as BookingBundlePartiallyUnavailableError above, for a conflict on a legged
// service's own resource(s) — UC-065 A1's "one part of this journey is no longer available" race
// (M23-S01).
export class BookingLegUnavailableError extends BookingDomainError {
  constructor() {
    super('One part of this journey is no longer available', BookingErrorCode.LEG_UNAVAILABLE);
    this.name = 'BookingLegUnavailableError';
  }
}

// UC-067 — a CUSTOMER_SELECTED service booked with no durationMinutes (no fallback to
// Service.durationMinutes, locked at M23-S02 story-discovery) or one outside the service's
// configured min/max/increment rules.
export class BookingDurationOutOfRangeError extends BookingDomainError {
  constructor(detail: string) {
    super(detail, BookingErrorCode.DURATION_OUT_OF_RANGE, 'durationMinutes');
    this.name = 'BookingDurationOutOfRangeError';
  }
}

// UC-068 A3 — a required intake question or the consent checkbox was left unanswered, or an
// answer's type doesn't match the question's declared type (FREE_TEXT -> string, BOOLEAN ->
// boolean). Follows CompleteBookingLinesIncompleteError's precedent of joining every offending
// field into one message rather than a per-field `field` pointer, since more than one can be
// wrong at once. Also reused (with a single-entry array) for an `intakeSchemaVersion` that
// doesn't match any version ever published for the service — an adversarial-only edge case with
// no dedicated error code of its own (M23-S02 story-discovery).
export class BookingIntakeAnswerMissingError extends BookingDomainError {
  constructor(fieldKeys: string[]) {
    super(
      `Missing or invalid intake answer(s): ${fieldKeys.join(', ')}`,
      BookingErrorCode.INTAKE_ANSWER_MISSING,
    );
    this.name = 'BookingIntakeAnswerMissingError';
  }
}

// UC-067 A4 / UC-068 A4 — a request's basket (serviceIds) names more than one service that is
// durationPolicy=CUSTOMER_SELECTED and/or intake-bearing. Locked at M23-S02 story-discovery:
// arbitrary customer-built carts combining multiple variable-duration/intake services are out of
// scope; multi-service bookings remain business-configured bundles/journeys.
// UC-068 — the shared BookingAttendeeInputSchema checks the raw (untrimmed) string against
// `min(1)`, so a whitespace-only name (e.g. "   ") passes Zod but normalizes to an empty string
// in the domain layer — the same normalize-then-guard pattern already used by
// ServiceNameRequiredError/CustomerNameRequiredError/StaffNameRequiredError for every other
// required name field in this codebase.
export class BookingAttendeeNameRequiredError extends BookingDomainError {
  constructor() {
    super('name is required', BookingErrorCode.ATTENDEE_NAME_REQUIRED, 'name');
    this.name = 'BookingAttendeeNameRequiredError';
  }
}

export class BookingInvalidMultipleVariableServicesError extends BookingDomainError {
  constructor() {
    super(
      'A booking request may include at most one variable-duration or intake-bearing service',
      BookingErrorCode.INVALID_MULTIPLE_VARIABLE_SERVICES,
    );
    this.name = 'BookingInvalidMultipleVariableServicesError';
  }
}

export class BookingConcurrentModificationError extends BookingDomainError {
  constructor() {
    super(
      'This booking was changed by another request. Reload it and try again.',
      BookingErrorCode.CONCURRENT_MODIFICATION,
    );
    this.name = 'BookingConcurrentModificationError';
  }
}

export class CancellationWindowExpiredError extends BookingDomainError {
  constructor() {
    super(
      'Cancellation window has expired for this booking',
      BookingErrorCode.CANCELLATION_WINDOW_EXPIRED,
    );
    this.name = 'CancellationWindowExpiredError';
  }
}

export class BookingCustomerNotFoundError extends BookingDomainError {
  constructor(customerId: string) {
    super(`Customer not found: ${customerId}`, BookingErrorCode.CUSTOMER_NOT_FOUND);
    this.name = 'BookingCustomerNotFoundError';
  }
}

export class CustomerPhoneNotSetError extends BookingDomainError {
  constructor() {
    super(
      'Customer must set a phone number before booking',
      BookingErrorCode.CUSTOMER_PHONE_NOT_SET,
    );
    this.name = 'CustomerPhoneNotSetError';
  }
}

export class BookingRejectionReasonTooShortError extends BookingDomainError {
  constructor() {
    super(
      'Rejection reason must be at least 10 characters',
      BookingErrorCode.REJECTION_REASON_TOO_SHORT,
      'reason',
    );
    this.name = 'BookingRejectionReasonTooShortError';
  }
}

export class BookingInfoMessageTooShortError extends BookingDomainError {
  constructor() {
    super(
      'Info request message must be at least 20 characters',
      BookingErrorCode.INFO_MESSAGE_TOO_SHORT,
      'message',
    );
    this.name = 'BookingInfoMessageTooShortError';
  }
}

export class BookingForbiddenError extends BookingDomainError {
  constructor() {
    super('You are not allowed to perform this action on the booking', BookingErrorCode.FORBIDDEN);
    this.name = 'BookingForbiddenError';
  }
}

export class BookingScheduledInPastError extends BookingDomainError {
  constructor() {
    super('New scheduled time must be in the future', BookingErrorCode.SCHEDULED_IN_PAST);
    this.name = 'BookingScheduledInPastError';
  }
}

export class BookingScheduledAtInvalidError extends BookingDomainError {
  constructor() {
    super('Scheduled time must be a valid date', BookingErrorCode.SCHEDULED_AT_INVALID);
    this.name = 'BookingScheduledAtInvalidError';
  }
}

export class CompleteBookingLinesIncompleteError extends BookingDomainError {
  constructor(missingLineIds: string[]) {
    super(
      `Completion request is missing entries for line(s): ${missingLineIds.join(', ')}`,
      BookingErrorCode.COMPLETE_LINES_INCOMPLETE,
    );
    this.name = 'CompleteBookingLinesIncompleteError';
  }
}

export class BookingPhotoNotUploadedError extends BookingDomainError {
  constructor(storagePath: string) {
    super(`Photo was not found in storage: ${storagePath}`, BookingErrorCode.PHOTO_NOT_UPLOADED);
    this.name = 'BookingPhotoNotUploadedError';
  }
}

export class TenantIdRequiredError extends BookingDomainError {
  constructor() {
    super('tenantId is required', BookingErrorCode.TENANT_ID_REQUIRED);
    this.name = 'TenantIdRequiredError';
  }
}

export class CreatedByRequiredError extends BookingDomainError {
  constructor() {
    super('createdBy is required', BookingErrorCode.CREATED_BY_REQUIRED);
    this.name = 'CreatedByRequiredError';
  }
}

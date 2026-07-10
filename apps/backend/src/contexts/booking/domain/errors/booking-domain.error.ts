import { AddressErrorCode, BookingErrorCode, CountryCodeErrorCode } from '@ikaro/types';
import { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';

export class BookingDomainError extends Error implements DomainErrorShape {
  readonly code: BookingErrorCode;
  readonly field?: string;

  constructor(message: string, code: BookingErrorCode, field?: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'BookingDomainError';
    this.code = code;
    this.field = field;
  }
}

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

export class BookingDiscountNotAvailableError extends BookingDomainError {
  constructor() {
    super(
      'A loyalty discount cannot be applied to a guest booking',
      BookingErrorCode.DISCOUNT_NOT_AVAILABLE,
    );
    this.name = 'BookingDiscountNotAvailableError';
  }
}

export class BookingDiscountDisabledError extends BookingDomainError {
  constructor() {
    super('Loyalty redemption is disabled for this tenant', BookingErrorCode.DISCOUNT_DISABLED);
    this.name = 'BookingDiscountDisabledError';
  }
}

export class BookingDiscountMismatchError extends BookingDomainError {
  constructor() {
    super(
      'discountByPoints.amountDeducted does not reconcile with pointsUsed and the current rate',
      BookingErrorCode.DISCOUNT_MISMATCH,
    );
    this.name = 'BookingDiscountMismatchError';
  }
}

export class BookingDiscountExceedsTotalError extends BookingDomainError {
  constructor() {
    super(
      'discountByPoints.amountDeducted cannot exceed the booking lines total',
      BookingErrorCode.DISCOUNT_EXCEEDS_TOTAL,
    );
    this.name = 'BookingDiscountExceedsTotalError';
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

/**
 * Booking-owned translation of a VO-level address/country-code validation failure.
 * Deliberately does NOT extend BookingDomainError: its `code` belongs to the
 * AddressErrorCode/CountryCodeErrorCode namespace, not BookingErrorCode — forcing a
 * fake booking-origin code would misrepresent the type or lose the per-rule specificity
 * the underlying VO error already carries. Implements DomainErrorShape directly instead.
 */
export class BookingAddressValidationError extends Error implements DomainErrorShape {
  readonly code: AddressErrorCode | CountryCodeErrorCode;
  readonly field: 'pickupAddress' | 'contactAddress';
  readonly params?: Record<string, string | number>;

  constructor(
    message: string,
    code: AddressErrorCode | CountryCodeErrorCode,
    field: 'pickupAddress' | 'contactAddress',
    params?: Record<string, string | number>,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'BookingAddressValidationError';
    this.code = code;
    this.field = field;
    this.params = params;
  }
}

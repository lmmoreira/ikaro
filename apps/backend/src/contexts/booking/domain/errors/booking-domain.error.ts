export class BookingDomainError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'BookingDomainError';
  }
}

export class ServiceNotFoundError extends BookingDomainError {
  constructor(id: string) {
    super(`Service not found: ${id}`);
    this.name = 'ServiceNotFoundError';
  }
}

export class ServiceDeactivatedError extends BookingDomainError {
  constructor() {
    super('Cannot update a deactivated service');
    this.name = 'ServiceDeactivatedError';
  }
}

export class ClosureDateInPastError extends BookingDomainError {
  constructor() {
    super('Cannot close a schedule for a past date');
    this.name = 'ClosureDateInPastError';
  }
}

export class ScheduleClosureNotFoundError extends BookingDomainError {
  constructor(id: string) {
    super(`Schedule closure not found: ${id}`);
    this.name = 'ScheduleClosureNotFoundError';
  }
}

export class ScheduleAlreadyClosedError extends BookingDomainError {
  constructor(date: string) {
    super(`Schedule is already closed for date: ${date}`);
    this.name = 'ScheduleAlreadyClosedError';
  }
}

export class OpeningDateInPastError extends BookingDomainError {
  constructor() {
    super('Cannot open a schedule for a past date');
    this.name = 'OpeningDateInPastError';
  }
}

export class DayAlreadyOpenInSettingsError extends BookingDomainError {
  constructor(date: string) {
    super(`Day is already open in business hours settings: ${date}`);
    this.name = 'DayAlreadyOpenInSettingsError';
  }
}

export class ScheduleOpeningAlreadyExistsError extends BookingDomainError {
  constructor(date: string) {
    super(`A schedule opening already exists for date: ${date}`);
    this.name = 'ScheduleOpeningAlreadyExistsError';
  }
}

export class ScheduleOpeningNotFoundError extends BookingDomainError {
  constructor(id: string) {
    super(`Schedule opening not found: ${id}`);
    this.name = 'ScheduleOpeningNotFoundError';
  }
}

export class AvailabilityDateInPastError extends BookingDomainError {
  constructor() {
    super('Cannot check availability for a past date');
    this.name = 'AvailabilityDateInPastError';
  }
}

export class AvailabilityRangeInvalidError extends BookingDomainError {
  constructor(reason: string) {
    super(`Invalid availability range: ${reason}`);
    this.name = 'AvailabilityRangeInvalidError';
  }
}

export class BookingNotFoundError extends BookingDomainError {
  constructor(id: string) {
    super(`Booking not found: ${id}`);
    this.name = 'BookingNotFoundError';
  }
}

export class BookingLineRequiredError extends BookingDomainError {
  constructor() {
    super('A booking must have at least one service line');
    this.name = 'BookingLineRequiredError';
  }
}

export class PickupAddressRequiredError extends BookingDomainError {
  constructor() {
    super('pickupAddress is required when a pickup service is selected');
    this.name = 'PickupAddressRequiredError';
  }
}

export class InvalidBookingTransitionError extends BookingDomainError {
  constructor(from: string, to: string) {
    super(`Cannot transition booking from ${from} to ${to}`);
    this.name = 'InvalidBookingTransitionError';
  }
}

export class BookingSlotUnavailableError extends BookingDomainError {
  constructor() {
    super('The requested time slot is no longer available');
    this.name = 'BookingSlotUnavailableError';
  }
}

export class BookingServiceNotActiveError extends BookingDomainError {
  constructor(id: string) {
    super(`Service is not active: ${id}`);
    this.name = 'BookingServiceNotActiveError';
  }
}

export class BookingServiceNotInTenantError extends BookingDomainError {
  constructor(id: string) {
    super(`Service does not belong to tenant: ${id}`);
    this.name = 'BookingServiceNotInTenantError';
  }
}

export class CancellationWindowExpiredError extends BookingDomainError {
  constructor() {
    super('Cancellation window has expired for this booking');
    this.name = 'CancellationWindowExpiredError';
  }
}

export class BookingCustomerNotFoundError extends BookingDomainError {
  constructor(customerId: string) {
    super(`Customer not found: ${customerId}`);
    this.name = 'BookingCustomerNotFoundError';
  }
}

export class CustomerPhoneNotSetError extends BookingDomainError {
  constructor() {
    super('Customer must set a phone number before booking');
    this.name = 'CustomerPhoneNotSetError';
  }
}

export class BookingRejectionReasonTooShortError extends BookingDomainError {
  constructor() {
    super('Rejection reason must be at least 10 characters');
    this.name = 'BookingRejectionReasonTooShortError';
  }
}

export class BookingInfoMessageTooShortError extends BookingDomainError {
  constructor() {
    super('Info request message must be at least 20 characters');
    this.name = 'BookingInfoMessageTooShortError';
  }
}

export class BookingForbiddenError extends BookingDomainError {
  constructor() {
    super('You are not allowed to perform this action on the booking');
    this.name = 'BookingForbiddenError';
  }
}

export class BookingScheduledInPastError extends BookingDomainError {
  constructor() {
    super('New scheduled time must be in the future');
    this.name = 'BookingScheduledInPastError';
  }
}

export class CompleteBookingLinesIncompleteError extends BookingDomainError {
  constructor(missingLineIds: string[]) {
    super(`Completion request is missing entries for line(s): ${missingLineIds.join(', ')}`);
    this.name = 'CompleteBookingLinesIncompleteError';
  }
}

export class BookingPhotoNotUploadedError extends BookingDomainError {
  constructor(storagePath: string) {
    super(`Photo was not found in storage: ${storagePath}`);
    this.name = 'BookingPhotoNotUploadedError';
  }
}

export class BookingDiscountNotAvailableError extends BookingDomainError {
  constructor() {
    super('A loyalty discount cannot be applied to a guest booking');
    this.name = 'BookingDiscountNotAvailableError';
  }
}

export class BookingDiscountDisabledError extends BookingDomainError {
  constructor() {
    super('Loyalty redemption is disabled for this tenant');
    this.name = 'BookingDiscountDisabledError';
  }
}

export class BookingDiscountMismatchError extends BookingDomainError {
  constructor() {
    super(
      'discountByPoints.amountDeducted does not reconcile with pointsUsed and the current rate',
    );
    this.name = 'BookingDiscountMismatchError';
  }
}

export class BookingDiscountExceedsTotalError extends BookingDomainError {
  constructor() {
    super('discountByPoints.amountDeducted cannot exceed the booking lines total');
    this.name = 'BookingDiscountExceedsTotalError';
  }
}

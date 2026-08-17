import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { BookingDomainError } from './booking-domain.error';

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

import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { BookingDomainError } from './booking-domain-error.base';

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

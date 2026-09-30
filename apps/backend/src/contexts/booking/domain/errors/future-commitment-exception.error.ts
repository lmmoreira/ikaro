import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { BookingDomainError } from './booking-domain-error.base';

export class FutureCommitmentExceptionNotFoundError extends BookingDomainError {
  constructor(id: string) {
    super(`Scheduling exception not found: ${id}`, BookingErrorCode.EXCEPTION_NOT_FOUND);
    this.name = 'FutureCommitmentExceptionNotFoundError';
  }
}

export class FutureCommitmentExceptionAlreadyResolvedError extends BookingDomainError {
  constructor(id: string) {
    super(`Scheduling exception is not open: ${id}`, BookingErrorCode.EXCEPTION_ALREADY_RESOLVED);
    this.name = 'FutureCommitmentExceptionAlreadyResolvedError';
  }
}

// The chosen (or auto-picked) resource cannot take the booking at its exact window: inactive,
// wrong type, outside the requirement's pool, or occupied. A per-item outcome of a bulk resolve,
// never a failure of the whole batch.
export class FutureCommitmentExceptionReassignTargetInvalidError extends BookingDomainError {
  constructor(reason: string) {
    super(
      `The reassign target cannot take this booking: ${reason}`,
      BookingErrorCode.EXCEPTION_REASSIGN_TARGET_INVALID,
    );
    this.name = 'FutureCommitmentExceptionReassignTargetInvalidError';
  }
}

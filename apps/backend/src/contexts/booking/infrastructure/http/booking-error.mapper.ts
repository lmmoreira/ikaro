import { HttpException, HttpStatus } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { mapSharedAddressError } from '../../../../shared/http/address-validation-error.mapper';
import { mapSharedVoError } from '../../../../shared/http/vo-validation-error.mapper';
import { ProblemDetail } from '@ikaro/types/protocol/errors';
import {
  AvailabilityDateInPastError,
  AvailabilityRangeInvalidError,
  BookingAddressValidationError,
  BookingCustomerNotFoundError,
  BookingConcurrentModificationError,
  BookingDiscountDisabledError,
  BookingDiscountExceedsTotalError,
  BookingDiscountMismatchError,
  BookingDiscountNotAvailableError,
  BookingDomainError,
  BookingForbiddenError,
  BookingInfoMessageTooShortError,
  BookingNotFoundError,
  BookingRejectionReasonTooShortError,
  BookingScheduledInPastError,
  BookingSlotUnavailableError,
  CancellationWindowExpiredError,
  ClosureDateInPastError,
  CompleteBookingLinesIncompleteError,
  CustomerPhoneNotSetError,
  DayAlreadyOpenInSettingsError,
  InvalidBookingTransitionError,
  OpeningDateInPastError,
  ScheduleAlreadyClosedError,
  ScheduleClosureNotFoundError,
  ScheduleOpeningAlreadyExistsError,
  ScheduleOpeningNotFoundError,
  ServiceDeactivatedError,
  ServiceNotFoundError,
} from '../../domain/errors/booking-domain.error';

type BookingDomainErrorCtor = new (...args: never[]) => BookingDomainError;

// Groups of error classes mapped to the same HTTP status — order matters, first match wins
// (mirrors the original if-chain's order). Kept as a data table rather than a long if-chain so
// mapBookingError() itself stays under docs/CODE_STANDARDS.md's function-length limit.
const STATUS_BY_ERROR_GROUP: [BookingDomainErrorCtor[], HttpStatus][] = [
  [[BookingForbiddenError], HttpStatus.FORBIDDEN],
  [
    [
      BookingInfoMessageTooShortError,
      BookingRejectionReasonTooShortError,
      CompleteBookingLinesIncompleteError,
    ],
    HttpStatus.BAD_REQUEST,
  ],
  [[CustomerPhoneNotSetError], HttpStatus.UNPROCESSABLE_ENTITY],
  [
    [
      ServiceNotFoundError,
      ScheduleClosureNotFoundError,
      ScheduleOpeningNotFoundError,
      BookingNotFoundError,
      BookingCustomerNotFoundError,
    ],
    HttpStatus.NOT_FOUND,
  ],
  [
    [
      ServiceDeactivatedError,
      ScheduleAlreadyClosedError,
      ScheduleOpeningAlreadyExistsError,
      BookingSlotUnavailableError,
      BookingConcurrentModificationError,
    ],
    HttpStatus.CONFLICT,
  ],
  [
    [
      BookingDiscountNotAvailableError,
      BookingDiscountDisabledError,
      BookingDiscountMismatchError,
      BookingDiscountExceedsTotalError,
    ],
    HttpStatus.UNPROCESSABLE_ENTITY,
  ],
  [[CancellationWindowExpiredError, BookingScheduledInPastError], HttpStatus.UNPROCESSABLE_ENTITY],
  [[InvalidBookingTransitionError], HttpStatus.UNPROCESSABLE_ENTITY],
  [
    [
      ClosureDateInPastError,
      OpeningDateInPastError,
      DayAlreadyOpenInSettingsError,
      AvailabilityDateInPastError,
      AvailabilityRangeInvalidError,
    ],
    HttpStatus.UNPROCESSABLE_ENTITY,
  ],
];

function throwAddressValidationProblem(err: BookingAddressValidationError): never {
  const body: ProblemDetail = {
    type: 'about:blank',
    title: 'Bad Request',
    status: HttpStatus.BAD_REQUEST,
    code: err.code,
    field: err.field,
    params: err.params,
    detail: err.message,
  };
  throw new HttpException(body, HttpStatus.BAD_REQUEST);
}

export function mapBookingError(err: unknown): never {
  if (err instanceof BookingAddressValidationError) throwAddressValidationProblem(err);
  mapSharedAddressError(err);
  mapSharedVoError(err);

  if (err instanceof BookingDomainError) {
    for (const [errorClasses, status] of STATUS_BY_ERROR_GROUP) {
      if (errorClasses.some((ErrorClass) => err instanceof ErrorClass)) {
        throw throwProblemDetail(status, err.code, err.message, err.field);
      }
    }
    throw throwProblemDetail(HttpStatus.BAD_REQUEST, err.code, err.message, err.field);
  }

  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}

import { HttpException, HttpStatus } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { mapSharedAddressError } from '../../../../shared/http/address-validation-error.mapper';
import { mapSharedVoError } from '../../../../shared/http/vo-validation-error.mapper';
import { ProblemDetail } from '@ikaro/types';
import {
  AvailabilityDateInPastError,
  AvailabilityRangeInvalidError,
  BookingAddressValidationError,
  BookingCustomerNotFoundError,
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

export function mapBookingError(err: unknown): never {
  if (err instanceof BookingAddressValidationError) {
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
  mapSharedAddressError(err);
  mapSharedVoError(err);
  if (err instanceof BookingForbiddenError) {
    throw throwProblemDetail(HttpStatus.FORBIDDEN, err.code, err.message, err.field);
  }
  if (
    err instanceof BookingInfoMessageTooShortError ||
    err instanceof BookingRejectionReasonTooShortError ||
    err instanceof CompleteBookingLinesIncompleteError
  ) {
    throw throwProblemDetail(HttpStatus.BAD_REQUEST, err.code, err.message, err.field);
  }
  if (err instanceof CustomerPhoneNotSetError) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message, err.field);
  }
  if (
    err instanceof ServiceNotFoundError ||
    err instanceof ScheduleClosureNotFoundError ||
    err instanceof ScheduleOpeningNotFoundError ||
    err instanceof BookingNotFoundError ||
    err instanceof BookingCustomerNotFoundError
  ) {
    throw throwProblemDetail(HttpStatus.NOT_FOUND, err.code, err.message, err.field);
  }
  if (
    err instanceof ServiceDeactivatedError ||
    err instanceof ScheduleAlreadyClosedError ||
    err instanceof ScheduleOpeningAlreadyExistsError ||
    err instanceof BookingSlotUnavailableError
  ) {
    throw throwProblemDetail(HttpStatus.CONFLICT, err.code, err.message, err.field);
  }
  if (
    err instanceof BookingDiscountNotAvailableError ||
    err instanceof BookingDiscountDisabledError ||
    err instanceof BookingDiscountMismatchError ||
    err instanceof BookingDiscountExceedsTotalError
  ) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message, err.field);
  }
  if (err instanceof CancellationWindowExpiredError || err instanceof BookingScheduledInPastError) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message, err.field);
  }
  if (err instanceof InvalidBookingTransitionError) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message, err.field);
  }
  if (
    err instanceof ClosureDateInPastError ||
    err instanceof OpeningDateInPastError ||
    err instanceof DayAlreadyOpenInSettingsError ||
    err instanceof AvailabilityDateInPastError ||
    err instanceof AvailabilityRangeInvalidError
  ) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message, err.field);
  }
  if (err instanceof BookingDomainError) {
    throw throwProblemDetail(HttpStatus.BAD_REQUEST, err.code, err.message, err.field);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}

import { HttpException, HttpStatus } from '@nestjs/common';
import { ProblemDetail } from '../../../../shared/http/problem-detail';
import { AddressValidationError } from '../../../../shared/value-objects/address';
import { CountryCodeValidationError } from '../../../../shared/value-objects/country-code.vo';
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
  if (err instanceof AddressValidationError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Bad Request',
      status: HttpStatus.BAD_REQUEST,
      code: err.code,
      params: err.params,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.BAD_REQUEST);
  }
  if (err instanceof CountryCodeValidationError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Bad Request',
      status: HttpStatus.BAD_REQUEST,
      code: err.code,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.BAD_REQUEST);
  }
  if (err instanceof BookingForbiddenError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Forbidden',
      status: HttpStatus.FORBIDDEN,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.FORBIDDEN);
  }
  if (
    err instanceof BookingInfoMessageTooShortError ||
    err instanceof BookingRejectionReasonTooShortError ||
    err instanceof CompleteBookingLinesIncompleteError
  ) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Bad Request',
      status: HttpStatus.BAD_REQUEST,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.BAD_REQUEST);
  }
  if (err instanceof CustomerPhoneNotSetError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Unprocessable Entity',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.UNPROCESSABLE_ENTITY);
  }
  if (
    err instanceof ServiceNotFoundError ||
    err instanceof ScheduleClosureNotFoundError ||
    err instanceof ScheduleOpeningNotFoundError ||
    err instanceof BookingNotFoundError ||
    err instanceof BookingCustomerNotFoundError
  ) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Not Found',
      status: HttpStatus.NOT_FOUND,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.NOT_FOUND);
  }
  if (
    err instanceof ServiceDeactivatedError ||
    err instanceof ScheduleAlreadyClosedError ||
    err instanceof ScheduleOpeningAlreadyExistsError ||
    err instanceof BookingSlotUnavailableError
  ) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.CONFLICT);
  }
  if (
    err instanceof BookingDiscountNotAvailableError ||
    err instanceof BookingDiscountDisabledError ||
    err instanceof BookingDiscountMismatchError ||
    err instanceof BookingDiscountExceedsTotalError
  ) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Unprocessable Entity',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.UNPROCESSABLE_ENTITY);
  }
  if (err instanceof CancellationWindowExpiredError || err instanceof BookingScheduledInPastError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Unprocessable Entity',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.UNPROCESSABLE_ENTITY);
  }
  if (err instanceof InvalidBookingTransitionError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Unprocessable Entity',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.UNPROCESSABLE_ENTITY);
  }
  if (
    err instanceof ClosureDateInPastError ||
    err instanceof OpeningDateInPastError ||
    err instanceof DayAlreadyOpenInSettingsError ||
    err instanceof AvailabilityDateInPastError ||
    err instanceof AvailabilityRangeInvalidError
  ) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Unprocessable Entity',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.UNPROCESSABLE_ENTITY);
  }
  if (err instanceof BookingDomainError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Bad Request',
      status: HttpStatus.BAD_REQUEST,
      code: err.code,
      field: err.field,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.BAD_REQUEST);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}

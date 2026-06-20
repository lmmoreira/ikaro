import { HttpException, HttpStatus } from '@nestjs/common';
import { AddressValidationError } from '../../../../shared/value-objects/address';
import {
  BookingDomainError,
  BookingForbiddenError,
  BookingNotFoundError,
  BookingPhotoNotUploadedError,
  BookingRejectionReasonTooShortError,
  BookingSlotUnavailableError,
  ClosureDateInPastError,
  InvalidBookingTransitionError,
  ScheduleAlreadyClosedError,
  ScheduleClosureNotFoundError,
  ServiceDeactivatedError,
  ServiceNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { mapBookingError } from './booking-error.mapper';

function call(err: unknown): HttpException {
  try {
    mapBookingError(err);
    throw new Error('mapBookingError should have thrown');
  } catch (e) {
    return e as HttpException;
  }
}

describe('mapBookingError', () => {
  it('maps AddressValidationError to 400', () => {
    const err = call(new AddressValidationError('Invalid CEP: 123'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('maps ServiceNotFoundError to 404', () => {
    const err = call(new ServiceNotFoundError('svc-id'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('maps ScheduleClosureNotFoundError to 404', () => {
    const err = call(new ScheduleClosureNotFoundError('cls-id'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('maps BookingNotFoundError to 404', () => {
    const err = call(new BookingNotFoundError('bk-id'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('maps BookingForbiddenError to 403', () => {
    const err = call(new BookingForbiddenError());
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.FORBIDDEN);
  });

  it('maps ServiceDeactivatedError to 409', () => {
    const err = call(new ServiceDeactivatedError());
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('maps ScheduleAlreadyClosedError to 409', () => {
    const err = call(new ScheduleAlreadyClosedError('2026-12-25'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('maps BookingSlotUnavailableError to 409', () => {
    const err = call(new BookingSlotUnavailableError());
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('maps InvalidBookingTransitionError to 422', () => {
    const err = call(new InvalidBookingTransitionError('COMPLETED', 'APPROVED'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('maps ClosureDateInPastError to 422', () => {
    const err = call(new ClosureDateInPastError());
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('maps BookingRejectionReasonTooShortError to 400', () => {
    const err = call(new BookingRejectionReasonTooShortError());
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('maps BookingPhotoNotUploadedError to 400', () => {
    const err = call(new BookingPhotoNotUploadedError('tenants/t1/bookings/b1/photo.jpg'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('maps generic BookingDomainError to 400', () => {
    const err = call(new BookingDomainError('invalid input'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('rethrows plain Error unchanged', () => {
    const original = new Error('unexpected');
    expect(() => mapBookingError(original)).toThrow(original);
  });

  it('wraps unknown non-Error values in Error', () => {
    expect(() => mapBookingError('string error')).toThrow(Error);
  });
});

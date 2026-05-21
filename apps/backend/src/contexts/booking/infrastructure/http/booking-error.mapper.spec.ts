import { HttpException, HttpStatus } from '@nestjs/common';
import {
  BookingDomainError,
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
  it('maps ServiceNotFoundError to 404', () => {
    const err = call(new ServiceNotFoundError('svc-id'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('maps ServiceDeactivatedError to 409', () => {
    const err = call(new ServiceDeactivatedError());
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
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

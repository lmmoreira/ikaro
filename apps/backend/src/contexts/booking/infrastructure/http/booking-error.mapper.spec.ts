import { HttpException, HttpStatus } from '@nestjs/common';
import {
  AddressErrorCode,
  BookingErrorCode,
  CountryCodeErrorCode,
  EmailErrorCode,
  MoneyErrorCode,
  PhoneErrorCode,
  TimeOfDayErrorCode,
} from '@ikaro/types';
import { AddressValidationError } from '../../../../shared/value-objects/address';
import { CountryCodeValidationError } from '../../../../shared/value-objects/country-code.vo';
import { MoneyValidationError } from '../../../../shared/value-objects/money';
import { PhoneNumberValidationError } from '../../../../shared/value-objects/phone-number.vo';
import { TimeOfDayValidationError } from '../../../../shared/value-objects/time-of-day.vo';
import { EmailValidationError } from '../../../../shared/value-objects/email.vo';
import {
  BookingAddressValidationError,
  BookingDiscountDisabledError,
  BookingDiscountExceedsTotalError,
  BookingDiscountMismatchError,
  BookingDiscountNotAvailableError,
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
  it('maps BookingAddressValidationError to 400 with code and field', () => {
    const err = call(
      new BookingAddressValidationError(
        'Invalid CEP: 123',
        AddressErrorCode.POSTAL_CODE_INVALID,
        'pickupAddress',
      ),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({
      code: AddressErrorCode.POSTAL_CODE_INVALID,
      field: 'pickupAddress',
    });
  });

  it('maps BookingAddressValidationError to 400 with params when present', () => {
    const err = call(
      new BookingAddressValidationError(
        'street is required',
        AddressErrorCode.FIELD_REQUIRED,
        'pickupAddress',
        { field: 'street' },
      ),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({
      code: AddressErrorCode.FIELD_REQUIRED,
      field: 'pickupAddress',
      params: { field: 'street' },
    });
  });

  it('maps raw AddressValidationError to 400 with code, no field (defensive fallback)', () => {
    const err = call(
      new AddressValidationError('Invalid CEP: 123', AddressErrorCode.POSTAL_CODE_INVALID),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: AddressErrorCode.POSTAL_CODE_INVALID });
    expect((err.getResponse() as { field?: string }).field).toBeUndefined();
  });

  it('maps CountryCodeValidationError to 400 with code', () => {
    const err = call(
      new CountryCodeValidationError(
        'countryCode must be supported',
        CountryCodeErrorCode.UNSUPPORTED,
      ),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: CountryCodeErrorCode.UNSUPPORTED });
  });

  it('maps ServiceNotFoundError to 404 with code', () => {
    const err = call(new ServiceNotFoundError('svc-id'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(err.getResponse()).toMatchObject({ code: BookingErrorCode.SERVICE_NOT_FOUND });
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

  it('maps BookingRejectionReasonTooShortError to 400 with code and field', () => {
    const err = call(new BookingRejectionReasonTooShortError());
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({
      code: BookingErrorCode.REJECTION_REASON_TOO_SHORT,
      field: 'reason',
    });
  });

  it('maps BookingPhotoNotUploadedError to 400', () => {
    const err = call(new BookingPhotoNotUploadedError('tenants/t1/bookings/b1/photo.jpg'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('maps BookingDiscountNotAvailableError to 422', () => {
    const err = call(new BookingDiscountNotAvailableError());
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('maps BookingDiscountDisabledError to 422', () => {
    const err = call(new BookingDiscountDisabledError());
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('maps BookingDiscountMismatchError to 422', () => {
    const err = call(new BookingDiscountMismatchError());
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('maps BookingDiscountExceedsTotalError to 422', () => {
    const err = call(new BookingDiscountExceedsTotalError());
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('maps generic BookingDomainError to 400, preserving the code carried on the instance', () => {
    const err = call(
      new BookingDomainError('tenantId is required', BookingErrorCode.TENANT_ID_REQUIRED),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: BookingErrorCode.TENANT_ID_REQUIRED });
  });

  it('maps MoneyValidationError to 400 with code', () => {
    const err = call(
      new MoneyValidationError('Invalid money amount: NaN', MoneyErrorCode.AMOUNT_INVALID),
    );
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: MoneyErrorCode.AMOUNT_INVALID });
  });

  it('maps PhoneNumberValidationError to 400 with code', () => {
    const err = call(
      new PhoneNumberValidationError('"123" is not valid', PhoneErrorCode.FORMAT_INVALID),
    );
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: PhoneErrorCode.FORMAT_INVALID });
  });

  it('maps EmailValidationError to 400 with code', () => {
    const err = call(new EmailValidationError('bad email', EmailErrorCode.FORMAT_INVALID));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: EmailErrorCode.FORMAT_INVALID });
  });

  it('maps TimeOfDayValidationError to 400 with code', () => {
    const err = call(new TimeOfDayValidationError('bad time', TimeOfDayErrorCode.FORMAT_INVALID));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: TimeOfDayErrorCode.FORMAT_INVALID });
  });

  it('rethrows plain Error unchanged', () => {
    const original = new Error('unexpected');
    expect(() => mapBookingError(original)).toThrow(original);
  });

  it('wraps unknown non-Error values in Error', () => {
    expect(() => mapBookingError('string error')).toThrow(Error);
  });
});

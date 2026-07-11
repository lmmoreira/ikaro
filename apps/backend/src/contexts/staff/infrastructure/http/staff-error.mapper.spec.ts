import { HttpException, HttpStatus } from '@nestjs/common';
import {
  AddressErrorCode,
  CountryCodeErrorCode,
  EmailErrorCode,
  StaffErrorCode,
} from '@ikaro/types';
import { AddressValidationError } from '../../../../shared/value-objects/address';
import { CountryCodeValidationError } from '../../../../shared/value-objects/country-code.vo';
import { EmailValidationError } from '../../../../shared/value-objects/email.vo';
import {
  LastActiveManagerError,
  StaffAlreadyActiveError,
  StaffAlreadyExistsError,
  StaffDeactivatedError,
  StaffDomainError,
  StaffEmailMismatchError,
  StaffGoogleAccountConflictError,
  StaffNotFoundError,
  StaffSelfDeactivationError,
  StaffSelfReactivationError,
} from '../../domain/errors/staff-domain.error';
import { mapStaffError } from './staff-error.mapper';

function call(err: unknown): HttpException {
  try {
    mapStaffError(err);
    throw new Error('mapStaffError should have thrown');
  } catch (e) {
    return e as HttpException;
  }
}

describe('mapStaffError', () => {
  it('maps AddressValidationError to 400 with code (defensive fallback — staff has no address field today)', () => {
    const err = call(
      new AddressValidationError('Invalid CEP: 123', AddressErrorCode.POSTAL_CODE_INVALID),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: AddressErrorCode.POSTAL_CODE_INVALID });
  });

  it('maps CountryCodeValidationError to 400 with code (defensive fallback)', () => {
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

  it('maps StaffNotFoundError to 404 with code', () => {
    const err = call(new StaffNotFoundError('some-id'));
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(err.getResponse()).toMatchObject({ code: StaffErrorCode.NOT_FOUND });
  });

  it('maps StaffAlreadyActiveError to 409 with code', () => {
    const err = call(new StaffAlreadyActiveError('some-id'));
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(err.getResponse()).toMatchObject({ code: StaffErrorCode.ALREADY_ACTIVE });
  });

  it('maps StaffAlreadyExistsError to 409 with code', () => {
    const err = call(new StaffAlreadyExistsError('a@b.com'));
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(err.getResponse()).toMatchObject({ code: StaffErrorCode.ALREADY_EXISTS });
  });

  it('maps StaffSelfDeactivationError to 403 with code', () => {
    const err = call(new StaffSelfDeactivationError());
    expect(err.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(err.getResponse()).toMatchObject({ code: StaffErrorCode.SELF_DEACTIVATION });
  });

  it('maps StaffSelfReactivationError to 403 with code', () => {
    const err = call(new StaffSelfReactivationError());
    expect(err.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(err.getResponse()).toMatchObject({ code: StaffErrorCode.SELF_REACTIVATION });
  });

  it('maps StaffDeactivatedError to 403 with code', () => {
    const err = call(new StaffDeactivatedError());
    expect(err.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(err.getResponse()).toMatchObject({ code: StaffErrorCode.DEACTIVATED });
  });

  it('maps LastActiveManagerError to 409 with code', () => {
    const err = call(new LastActiveManagerError());
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(err.getResponse()).toMatchObject({ code: StaffErrorCode.LAST_ACTIVE_MANAGER });
  });

  it('maps StaffEmailMismatchError to 422 with code', () => {
    const err = call(new StaffEmailMismatchError());
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(err.getResponse()).toMatchObject({ code: StaffErrorCode.EMAIL_MISMATCH });
  });

  it('maps StaffGoogleAccountConflictError to 409 with code', () => {
    const err = call(new StaffGoogleAccountConflictError());
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(err.getResponse()).toMatchObject({ code: StaffErrorCode.GOOGLE_ACCOUNT_CONFLICT });
  });

  it('maps generic StaffDomainError to 400, preserving the code carried on the instance', () => {
    const err = call(new StaffDomainError('invalid', StaffErrorCode.ROLE_INVALID));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: StaffErrorCode.ROLE_INVALID });
  });

  it('maps EmailValidationError to 400 with code', () => {
    const err = call(new EmailValidationError('bad email', EmailErrorCode.FORMAT_INVALID));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: EmailErrorCode.FORMAT_INVALID });
  });

  it('re-throws plain Error instances unchanged', () => {
    const err = new Error('unexpected');
    expect(() => mapStaffError(err)).toThrow(err);
  });

  it('wraps unknown non-Error values in an Error', () => {
    expect(() => mapStaffError('unexpected string')).toThrow(Error);
  });
});
